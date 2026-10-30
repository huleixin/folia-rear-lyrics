package io.github.huleixin.tingyu.playback;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;

import io.github.huleixin.tingyu.resolver.ResolverRegistry;
import io.github.huleixin.tingyu.resolver.SourceResolver;
import io.github.huleixin.tingyu.resolver.SourceResolution;

/**
 * 后台续播编排器 —— 阶段 B 的执行者。
 *
 * 它回答一个之前没人能回答的问题：**当 WebView 一句 JS 都不跑时，谁来给 Media3 下一首。**
 *
 * 触发点全部在原生：Media3 的 `onMediaItemTransition`、`onPlaybackStateChanged`（STATE_ENDED）
 * 和已有的稀疏退避 tick。没有任何一处需要 Capacitor 监听器、React Hook 或 WebView 定时器。
 *
 * 与 JS 通道的关系是"接管"而不是"并行"：
 * - JS 刚补过窗口（{@link Facts#msSinceJsWindow} 小于宽限期）→ 让位，不重复取地址；
 * - JS 沉默够久 → 原生自己解析下一首并交给 Media3；
 * - JS 事后才补上 → 采纳时发现这首歌已经在队列里就丢弃，不会出现两遍。
 *
 * 三种结果严格分开（见 {@link Decision}）：原生解析成功并继续播放，是 TAKE_OVER；
 * 音源原生解析不了（洛雪脚本）是 FALLBACK_TO_JS，保持原来的可恢复等待；
 * 只有逻辑歌单真的到头、或用户主动暂停，才是 STOP。
 */
public final class BackgroundContinuation {

    public enum Decision {
        /** 原生自己去取下一首的地址。 */
        TAKE_OVER,
        /** 还不到接管的时候：JS 刚答过话。 */
        WAIT_FOR_JS,
        /** 这个音源原生解析不了，回落到原来的 JS 通道（不是失败，也不是结束）。 */
        FALLBACK_TO_JS,
        /** 逻辑歌单到头，或者用户主动暂停。 */
        STOP
    }

    /** 决策输入。全部是原生可观测的量，因此决策本身是纯函数、可在 JVM 上直接测。 */
    public static final class Facts {
        public int remaining;
        public boolean ended;
        public boolean desiredPaused;
        /** 距离 JS 上一次真正补进 Media3 的毫秒数；-1 表示 JS 从未补过。 */
        public long msSinceJsWindow;
        /** 原生是否知道现在播的是谁、后面还有谁。 */
        public boolean ledgerCanDecide;
        /** 逻辑歌单里确实还有下一首（不是 END / REPEAT_CURRENT）。 */
        public boolean ledgerHasNext;
        /** 下一首所属音源能否被原生解析。 */
        public boolean resolvableNatively;

        public Facts() { }

        public Facts(int remaining, boolean ended, boolean desiredPaused, long msSinceJsWindow,
                     boolean ledgerCanDecide, boolean ledgerHasNext, boolean resolvableNatively) {
            this.remaining = remaining;
            this.ended = ended;
            this.desiredPaused = desiredPaused;
            this.msSinceJsWindow = msSinceJsWindow;
            this.ledgerCanDecide = ledgerCanDecide;
            this.ledgerHasNext = ledgerHasNext;
            this.resolvableNatively = resolvableNatively;
        }
    }

    /**
     * JS 补过窗口后多久才允许原生接管。
     *
     * 5 秒是"前台 JS 正常工作的正常延迟"和"后台 JS 已经不跑了"之间的分界：
     * 前台每次换歌 JS 都会在几百毫秒内补窗口，永远够不到这个阈值；后台页面一旦被冻结，
     * JS 直到用户点亮屏幕都不会再补，于是必然越过。
     */
    public static final long JS_GRACE_MS = 5_000L;

    /** 低于这个余量就该准备下一首，与现有低水位一致。 */
    private static final int LOW_WATER = QueueSupervision.LOW_WATER;

    // ------------------------------------------------------------------ 有界重试
    //
    // 真机 1.3.48 的教训：失败后无条件 `rearmSupervision()` → 1.5 秒后再来一次，
    // 同一首歌 187 次、每次还串三档音质。失败必须是有界的：
    // - UNSUPPORTED（脚本没装 / 音源没声明这个平台）一次都不重试 —— 重试不可能让它变成支持；
    // - 普通失败最多三次，且按退避拉开间隔；
    // - 预算用完就熔断这一首，回落到原来的 JS 通道，不再排程。
    // 熔断按「歌曲 + 解析器」记，换歌、换代次、用户操作都会清空。

    private static final int MAX_ATTEMPTS = 3;
    private static final long[] BACKOFF_MS = { 5_000L, 20_000L, 60_000L };
    private static final int MAX_TRACKED = 64;

    private static final class Budget {
        int attempts;
        long nextAttemptAt;
        boolean blocked;
        String reason = "";
    }

    private final java.util.LinkedHashMap<String, Budget> budgets = new java.util.LinkedHashMap<>();

    private static volatile BackgroundContinuation instance;

    private final ExecutorService worker = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "tingyu-continuation");
        thread.setDaemon(true);
        return thread;
    });
    private final AtomicLong requestIds = new AtomicLong(0);

    private volatile long activeRequestId;
    private volatile String activeSongKey = "";
    private volatile long activeGeneration = -1;
    private volatile boolean resolving;
    private volatile long lastOutcomeAt;
    private volatile String lastOutcome = "none";
    private volatile int takeovers;
    private volatile int fallbacks;
    private volatile int failures;

    private BackgroundContinuation() { }

    public static BackgroundContinuation get() {
        if (instance == null) {
            synchronized (BackgroundContinuation.class) {
                if (instance == null) instance = new BackgroundContinuation();
            }
        }
        return instance;
    }

    /** 纯决策，无副作用。 */
    public static Decision decide(Facts facts) {
        if (facts == null) return Decision.STOP;
        // 用户主动暂停/停止：什么都不做，也不许偷偷往队列里塞东西。
        if (facts.desiredPaused) return Decision.STOP;
        boolean hungry = facts.ended || facts.remaining <= LOW_WATER;
        if (!hungry) return Decision.WAIT_FOR_JS;
        if (!facts.ledgerCanDecide) return Decision.FALLBACK_TO_JS;
        if (!facts.ledgerHasNext) return Decision.STOP;
        if (!facts.resolvableNatively) return Decision.FALLBACK_TO_JS;
        // JS 刚答过话就别抢。msSinceJsWindow == -1 表示从没答过，视作沉默。
        boolean jsQuiet = facts.msSinceJsWindow < 0 || facts.msSinceJsWindow >= JS_GRACE_MS;
        return jsQuiet ? Decision.TAKE_OVER : Decision.WAIT_FOR_JS;
    }

    /** 引擎侧需要实现的回调，方便用假实现做 JVM 测试。 */
    public interface Host {
        String currentSongKey();
        boolean desiredPaused();
        int remaining();
        boolean ended();
        /** 距离 JS 上次补窗口多久；-1 = 从未。 */
        long msSinceJsWindow();
        /** Media3 队列里（当前位置之后）是否已经有这首歌。 */
        boolean queueContains(String songKey);
        /** 主线程执行：把解析好的条目加进 Media3 并在需要时恢复播放。 */
        void adopt(NativePlaylist.Track track, String uri, long requestId, long generation);
        /** 让监督器在 delayMs 之后重新排程（失败后退避再试，而不是每 1.5 秒一次）。 */
        void rearmSupervision(long delayMs);
        /** 主线程执行。 */
        void runOnMain(Runnable action);
    }

    /**
     * 把解析到的远端地址挂到本地代理上的动作。
     *
     * 抽成接口只有一个理由：这段逻辑必须能在 JVM 上跑完整的后台续播模拟，
     * 而 `LocalAudioServer` 需要 Android。正式代码永远走 {@link #DEFAULT}。
     */
    public interface Registrar {
        String register(String url) throws Exception;
    }

    private static final Registrar DEFAULT = url -> io.github.huleixin.tingyu.LocalAudioServer
        .shared(PlaybackDiagnostics.contextOrNull())
        .registerResolvedAudio(url, false);

    private volatile Registrar registrar = DEFAULT;

    /** 测试用：替换地址登记动作，让后台续播可以在 JVM 上整段模拟。 */
    public void setRegistrarForTest(Registrar value) {
        registrar = value == null ? DEFAULT : value;
    }

    private volatile long clockShiftMs = 0L;

    /** 测试用：把"现在"往前推，用来验证退避与有界重试。 */
    public void advanceClockForTest(long deltaMs) {
        clockShiftMs += deltaMs;
    }

    private long now() {
        return System.nanoTime() / 1_000_000L + clockShiftMs;
    }

    /** 由引擎在每次 supervise 时调用。 */
    public void consider(Host host, String reason) {
        if (host == null) return;
        String current = host.currentSongKey();
        if (current == null || current.isEmpty()) return;

        NativePlaylist playlist = NativePlaylist.get();
        boolean canDecide = playlist.canDecide(current);
        NativePlaylist.Step step = canDecide ? playlist.advance(current) : null;
        boolean hasNext = step != null && step.outcome == NativePlaylist.Outcome.ADVANCE && step.hasTrack();
        boolean resolvable = hasNext && ResolverRegistry.get().canResolveNatively(step.track);

        Facts facts = new Facts(
            host.remaining(), host.ended(), host.desiredPaused(), host.msSinceJsWindow(),
            canDecide, hasNext, resolvable);
        Decision decision = decide(facts);

        lastOutcomeAt = now();
        lastOutcome = decision.name().toLowerCase(java.util.Locale.US);

        if (decision != Decision.TAKE_OVER) {
            if (decision == Decision.FALLBACK_TO_JS) fallbacks++;
            PlaybackDiagnostics.note("continuation-decision", new com.getcapacitor.JSObject()
                .put("decision", lastOutcome)
                .put("reason", reason == null ? "" : reason)
                .put("song", PlaybackDiagnostics.anonKey(current))
                .put("remaining", facts.remaining)
                .put("ended", facts.ended)
                .put("jsQuietMs", facts.msSinceJsWindow)
                .put("ledgerSize", playlist.size())
                .put("ledgerKnows", canDecide)
                .put("hasNext", hasNext)
                .put("resolvable", resolvable));
            return;
        }
        SourceResolver chosen = ResolverRegistry.get().forTrack(step.track);
        final String resolverId = chosen == null ? "none" : chosen.id();
        final String budgetKey = step.track.songKey + "|" + resolverId;
        // 有界重试：这首歌已经被熔断（明确不可恢复）就不再取地址，也不再排程。
        if (blocked(budgetKey)) {
            lastOutcome = Decision.FALLBACK_TO_JS.name().toLowerCase(java.util.Locale.US);
            PlaybackDiagnostics.note("continuation-blocked", new com.getcapacitor.JSObject()
                .put("song", PlaybackDiagnostics.anonKey(step.track.songKey))
                .put("resolver", resolverId)
                .put("reason", blockReason(budgetKey))
                .put("reason0", "budget exhausted / not supported"));
            return;
        }
        // 退避窗口内不重复取；下一次排程由失败时的 rearm 决定。
        if (now() < nextAttemptAt(budgetKey)) return;
        // 已经在飞的请求只认同一首歌；换了歌就作废重来。
        if (resolving && activeSongKey.equals(step.track.songKey)) return;
        resolving = true;
        activeSongKey = step.track.songKey;
        activeGeneration = step.generation;
        activeRequestId = requestIds.incrementAndGet();
        final long requestId = activeRequestId;
        final long generation = step.generation;
        final NativePlaylist.Track track = step.track;
        final String anchor = current;
        final String quality = QualityPreference.get();

        PlaybackDiagnostics.note("continuation-fetch", new com.getcapacitor.JSObject()
            .put("song", PlaybackDiagnostics.anonKey(track.songKey))
            .put("provider", track.providerId)
            .put("resolver", resolverId)
            .put("attempt", attemptCount(budgetKey) + 1)
            .put("requestId", requestId)
            .put("generation", generation)
            .put("anchor", PlaybackDiagnostics.anonKey(anchor))
            .put("reason", reason == null ? "" : reason));

        Runnable job = () -> {
            SourceResolution resolution;
            try {
                resolution = ResolverRegistry.get().resolve(track, quality);
            } catch (Throwable error) {
                resolution = SourceResolution.failure("resolver crashed: " + error.getClass().getSimpleName());
            }
            finish(host, resolution, track, requestId, generation, anchor, quality, resolverId);
        };
        // 测试开关：让"后台续播 30 首"这类模拟可以在 JVM 上确定性重放，正式代码永远走线程池。
        if (inlineForTest) job.run();
        else worker.execute(job);
    }

    private volatile boolean inlineForTest;

    public void setInlineForTest(boolean value) {
        inlineForTest = value;
    }

    private void finish(Host host, SourceResolution resolution, NativePlaylist.Track track,
                        long requestId, long generation, String anchor, String quality,
                        String resolverId) {
        // 过期结果拒绝：请求号、歌单代次、用户意图，三者任一变化就丢弃。
        boolean stale = requestId != activeRequestId
            || generation != NativePlaylist.get().generation()
            || !track.songKey.equals(activeSongKey);
        resolving = false;
        if (stale) {
            PlaybackDiagnostics.note("continuation-stale", new com.getcapacitor.JSObject()
                .put("song", PlaybackDiagnostics.anonKey(track.songKey))
                .put("requestId", requestId)
                .put("generation", generation));
            return;
        }
        final String budgetKey = track.songKey + "|" + resolverId;
        if (resolution == null || !resolution.ok()) {
            failures++;
            String status = resolution == null ? "null" : resolution.status.name().toLowerCase(java.util.Locale.US);
            String reason = resolution == null ? "null resolution" : resolution.reason;
            PlaybackDiagnostics.note("continuation-failed", new com.getcapacitor.JSObject()
                .put("song", PlaybackDiagnostics.anonKey(track.songKey))
                .put("resolver", resolverId)
                .put("status", status)
                .put("reason", reason)
                .put("requestId", requestId));
            // 有界重试：UNSUPPORTED 一次都不重试（重试不可能让脚本突然装上），
            // 其余失败退避递增，预算用完就熔断这一首，不再排程。
            long backoff = noteFailure(budgetKey, resolution == null ? null : resolution.status, reason);
            if (backoff < 0) {
                PlaybackDiagnostics.note("continuation-giveup", new com.getcapacitor.JSObject()
                    .put("song", PlaybackDiagnostics.anonKey(track.songKey))
                    .put("resolver", resolverId)
                    .put("status", status)
                    .put("reason", reason));
                return;
            }
            final long delay = backoff;
            host.runOnMain(() -> host.rearmSupervision(delay));
            return;
        }
        String uri;
        try {
            uri = registrar.register(resolution.url);
        } catch (Exception error) {
            failures++;
            PlaybackDiagnostics.note("continuation-failed", new com.getcapacitor.JSObject()
                .put("song", PlaybackDiagnostics.anonKey(track.songKey))
                .put("resolver", resolverId)
                .put("status", "register")
                .put("reason", error.getClass().getSimpleName())
                .put("requestId", requestId));
            long backoff = noteFailure(budgetKey, SourceResolution.Status.FAILURE, "register");
            if (backoff < 0) return;
            final long delay = backoff;
            host.runOnMain(() -> host.rearmSupervision(delay));
            return;
        }
        clearBudget(budgetKey);
        takeovers++;
        PlaybackDiagnostics.note("continuation-resolved", new com.getcapacitor.JSObject()
            .put("song", PlaybackDiagnostics.anonKey(track.songKey))
            .put("provider", track.providerId)
            .put("quality", resolution.quality)
            .put("requestId", requestId)
            .put("generation", generation));
        host.runOnMain(() -> host.adopt(track, uri, requestId, generation));
    }

    // ------------------------------------------------------------------ budget internals

    private Budget budget(String key) {
        synchronized (budgets) {
            Budget value = budgets.get(key);
            if (value == null) {
                // 极简 LRU：跟踪的歌有限，超了就把最老的丢掉，避免后台长时间播放越攒越多。
                if (budgets.size() >= MAX_TRACKED) {
                    java.util.Iterator<String> keys = budgets.keySet().iterator();
                    if (keys.hasNext()) keys.remove();
                }
                value = new Budget();
                budgets.put(key, value);
            }
            return value;
        }
    }

    private boolean blocked(String key) {
        synchronized (budgets) {
            Budget value = budgets.get(key);
            return value != null && value.blocked;
        }
    }

    private String blockReason(String key) {
        synchronized (budgets) {
            Budget value = budgets.get(key);
            return value == null ? "" : value.reason;
        }
    }

    private long nextAttemptAt(String key) {
        synchronized (budgets) {
            Budget value = budgets.get(key);
            return value == null ? 0L : value.nextAttemptAt;
        }
    }

    private int attemptCount(String key) {
        synchronized (budgets) {
            Budget value = budgets.get(key);
            return value == null ? 0 : value.attempts;
        }
    }

    private void clearBudget(String key) {
        synchronized (budgets) { budgets.remove(key); }
    }

    /** 脚本换了、音源换了：之前的失败判定不再适用，全部作废。 */
    public void resetBudgets() {
        synchronized (budgets) { budgets.clear(); }
    }

    /**
     * 记一次失败，返回下次重试前要等多久；返回 -1 表示**别再试了**（熔断）。
     *
     * UNSUPPORTED 直接熔断：洛雪脚本没装、或脚本没声明这个平台，重试一万次也不会变。
     */
    private long noteFailure(String key, SourceResolution.Status status, String reason) {
        synchronized (budgets) {
            Budget value = budget(key);
            value.attempts++;
            value.reason = reason == null ? "" : reason;
            if (status == SourceResolution.Status.UNSUPPORTED) {
                value.blocked = true;
                return -1L;
            }
            if (value.attempts >= MAX_ATTEMPTS) {
                value.blocked = true;
                return -1L;
            }
            long delay = BACKOFF_MS[Math.min(value.attempts - 1, BACKOFF_MS.length - 1)];
            value.nextAttemptAt = now() + delay;
            return delay;
        }
    }

    /** 用户暂停/停止/换歌时调用：作废在飞的解析，避免迟到的结果污染队列。 */
    public void cancel() {
        activeRequestId = requestIds.incrementAndGet();
        activeSongKey = "";
        resolving = false;
    }

    public org.json.JSONObject snapshot() {
        int blockedCount = 0;
        synchronized (budgets) {
            for (Budget value : budgets.values()) if (value.blocked) blockedCount++;
        }
        try {
            return new org.json.JSONObject()
                .put("lastDecision", lastOutcome)
                .put("decidedAt", lastOutcomeAt)
                .put("resolving", resolving)
                .put("takeovers", takeovers)
                .put("fallbacks", fallbacks)
                .put("failures", failures)
                // 有界重试是否真的有界：熔断了几首、跟踪了几首。
                .put("budgetBlocked", blockedCount)
                .put("budgetTracked", budgets.size())
                .put("budgetMax", MAX_ATTEMPTS);
        } catch (Exception error) {
            return new org.json.JSONObject();
        }
    }

    /** 测试用计数。 */
    int takeoversForTest() { return takeovers; }
    int fallbacksForTest() { return fallbacks; }
    int failuresForTest() { return failures; }
}
