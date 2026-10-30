package io.github.huleixin.tingyu.playback;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;

import io.github.huleixin.tingyu.resolver.ResolverRegistry;
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
        /** 让监督器重新排程（用于失败后按原有稀疏退避再试）。 */
        void rearmSupervision();
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

    private static long now() {
        return System.nanoTime() / 1_000_000L;
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
            finish(host, resolution, track, requestId, generation, anchor, quality);
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
                        long requestId, long generation, String anchor, String quality) {
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
        if (resolution == null || !resolution.ok()) {
            failures++;
            String status = resolution == null ? "null" : resolution.status.name().toLowerCase(java.util.Locale.US);
            PlaybackDiagnostics.note("continuation-failed", new com.getcapacitor.JSObject()
                .put("song", PlaybackDiagnostics.anonKey(track.songKey))
                .put("status", status)
                .put("reason", resolution == null ? "null resolution" : resolution.reason)
                .put("requestId", requestId));
            // 失败不是结束：按原有稀疏退避再试，不新增任何定时器。
            host.runOnMain(host::rearmSupervision);
            return;
        }
        String uri;
        try {
            uri = registrar.register(resolution.url);
        } catch (Exception error) {
            failures++;
            PlaybackDiagnostics.note("continuation-failed", new com.getcapacitor.JSObject()
                .put("song", PlaybackDiagnostics.anonKey(track.songKey))
                .put("status", "register")
                .put("reason", error.getClass().getSimpleName())
                .put("requestId", requestId));
            host.runOnMain(host::rearmSupervision);
            return;
        }
        takeovers++;
        PlaybackDiagnostics.note("continuation-resolved", new com.getcapacitor.JSObject()
            .put("song", PlaybackDiagnostics.anonKey(track.songKey))
            .put("provider", track.providerId)
            .put("quality", resolution.quality)
            .put("requestId", requestId)
            .put("generation", generation));
        host.runOnMain(() -> host.adopt(track, uri, requestId, generation));
    }

    /** 用户暂停/停止/换歌时调用：作废在飞的解析，避免迟到的结果污染队列。 */
    public void cancel() {
        activeRequestId = requestIds.incrementAndGet();
        activeSongKey = "";
        resolving = false;
    }

    public org.json.JSONObject snapshot() {
        try {
            return new org.json.JSONObject()
                .put("lastDecision", lastOutcome)
                .put("decidedAt", lastOutcomeAt)
                .put("resolving", resolving)
                .put("takeovers", takeovers)
                .put("fallbacks", fallbacks)
                .put("failures", failures);
        } catch (Exception error) {
            return new org.json.JSONObject();
        }
    }

    /** 测试用计数。 */
    int takeoversForTest() { return takeovers; }
    int fallbacksForTest() { return fallbacks; }
    int failuresForTest() { return failures; }
}
