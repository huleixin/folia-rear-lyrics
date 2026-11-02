package io.github.huleixin.tingyu.playback;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/LyricSyncLedger.java
/**
 * 端到端歌词同步账本：把「三端现在各拿着哪一版」记在一处，并给出**唯一**归因。
 *
 * <p>需求是要能一眼判断以下五种情况中的哪一种，而不是在一堆日志里猜：
 * <ol>
 *   <li>{@link Verdict#NOT_FETCHED} —— 歌词根本没取到（统一仓库还是 pending）；</li>
 *   <li>{@link Verdict#NOT_PUBLISHED} —— 取到了，但灵动岛这一版还没写进 MediaSession；</li>
 *   <li>{@link Verdict#NOT_DELIVERED} —— 发布了，但背屏还没收到这一版；</li>
 *   <li>{@link Verdict#REAR_RENDER_STALLED} —— 背屏收到了，但很久没有再应用/推进；</li>
 *   <li>{@link Verdict#CLOCK_STALE} —— 时钟不对：PlaybackState 太久没刷新，
 *       消费端只能拿到一个过期的时间戳，外推出的位置远超时长；</li>
 *   <li>{@link Verdict#NOT_CONSUMED} —— 三端内容都对、时钟也对，那就是系统消费端
 *       没显示（这一层在进程外，进程内只能证明到「会话里确实有」）。</li>
 * </ol>
 *
 * <p>只记元数据：哈希后的歌曲身份、版本哈希、版本号、时间戳、行数。<b>不记歌词正文</b>，
 * 也<b>不高频写</b>——每条只在「版本真的变了」或「某一端发生了状态转换」时更新一次，
 * 播放期间的位置推进不进这本账（那是 PlaybackState 的事）。
 *
 * <p>纯逻辑 + 静态单例，无 Android 依赖；JVM 上逐条断言。
 */
public final class LyricSyncLedger {

    public enum Verdict {
        /** 没有在播的歌：不该出词，也没什么可归因。 */
        IDLE,
        PAUSED,
        REAR_DISABLED,
        REAR_CAMERA_OWNED,
        /** 这首歌确认没有同步歌词：显示无词是正确行为。 */
        NONE_CONFIRMED,
        /** 歌词没取到。 */
        NOT_FETCHED,
        /** 取到了，但灵动岛这一版还没发布到会话。 */
        NOT_PUBLISHED,
        /** 发布了，但背屏还没收到这一版。 */
        NOT_DELIVERED,
        /** 背屏收到过，但播放中超过阈值没有再应用 —— 渲染端停了。 */
        REAR_RENDER_STALLED,
        /**
         * 背屏自己报告了休眠/息屏（surface-power 事件）：页面冻结、状态轮询停是
         * <b>正常行为</b>，不是故障。恢复可见后轮询自然回来。
         */
        REAR_SUSPENDED,
        /**
         * 背屏最后已知是「醒着」，但状态轮询突然消失：Activity 被系统桌面覆盖、
         * WebView 被冻结或渲染进程异常卡死 —— 三者从进程内不可区分，如实标注
         * 「失联」并把边界写进诊断，不猜根因。
         */
        REAR_UNRESPONSIVE,
        /** 时钟不对：PlaybackState 太久没刷新。 */
        CLOCK_STALE,
        /** 会话不活跃：系统侧没有可以消费的东西。 */
        SESSION_INACTIVE,
        /** 上面都成立 —— 剩下的只可能是系统消费端没显示（进程外，不可观测）。 */
        NOT_CONSUMED,
        /** 三端一致且在时效内。 */
        IN_SYNC
    }

    /** 播放中背屏多久没有再应用歌词就算渲染停止。 */
    public static final long REAR_RENDER_STALL_MS = 15_000L;
    /**
     * 背屏多久没有状态轮询就算失联。轮询间隔 100~250ms；30s 是轮询间隔的百余倍，
     * 覆盖 WebView 定时器节流、单次 GC 停顿等调度抖动 —— 判「失联」必须远慢于
     * 任何正常的调度波动，绝不能让它变成第二种误报。
     */
    public static final long REAR_SUSPEND_MS = 30_000L;
    /** 播放中 PlaybackState 多久没刷新就算时钟失效。 */
    public static final long CLOCK_STALE_MS = 5_000L;

    private static final LyricSyncLedger INSTANCE = new LyricSyncLedger();

    public static LyricSyncLedger get() {
        return INSTANCE;
    }

    private String renderedSong="",renderedEpoch="",clockSource="unknown";
    public synchronized void clockSource(String source){clockSource=source;}
    private String outputEngine="none",outputLease="";private long ownershipChanges;
    public synchronized void ownership(String engine,String lease){if(!outputEngine.equals(engine)||!outputLease.equals(lease)){outputEngine=engine;outputLease=lease;ownershipChanges++;}}
    private long staleEvents;
    private String songKey = "";
    private String epoch = "";
    private String unifiedState = "pending";
    private String unifiedHash = "";
    private int unifiedRevision = -1;
    private String unifiedSource = "";

    private String islandHash = "";
    private long islandPublishedAtMs = 0L;
    private int islandPublishes = 0;

    private String rearEpoch = "";
    private String rearHash = "";
    private int rearLines = 0;
    private long rearDeliveredAtMs = 0L;
    private long rearAppliedAtMs = 0L;
    private long rearHeartbeatAtMs = 0L;
    private long rearAppliedPosMs = -1L;
    private int rearDeliveries = 0;
    /** 背屏自己报告的休眠状态（surface-power 事件）；从未报告过为 false。 */
    private boolean rearSleeping = false;
    private boolean rearContextKnown, rearExpected = true, rearCameraOwned;
    private boolean rearSleepReported = false;

    private String stageHash = "";
    private long stagePublishedAtMs = 0L;

    /** 当前生效的歌词时间轴偏移（毫秒，正 = 延后）。由 JS 侧随发布同步过来。 */
    private long offsetMs = 0L;

    private boolean sessionActive = false;
    private long sessionStateAtMs = 0L;
    private long positionMs = 0L;
    private long durationMs = 0L;
    private boolean playing = false;

    private LyricSyncLedger() {
    }

    // ---- 写入端 ----

    /** Media3 换曲（背屏的 epoch 与歌曲身份同源）。 */
    public synchronized void track(String songKey, String epoch) {
        String next = songKey == null ? "" : songKey;
        if (!next.equals(this.songKey) || !(epoch == null ? "" : epoch).equals(this.epoch)) {
            this.songKey = next;
            unifiedState = "pending";
            unifiedHash = "";
            unifiedRevision = -1;
            unifiedSource = "";
            islandHash = "";
            islandPublishes = 0;
            rearHash = "";
            rearLines = 0;
            rearDeliveries = 0;
            rearEpoch = "";
            stageHash = "";
            islandPublishedAtMs = rearDeliveredAtMs = rearAppliedAtMs = stagePublishedAtMs = 0L;
            rearAppliedPosMs = -1L;
        }
        this.epoch = epoch == null ? "" : epoch;
    }

    /** 统一仓库这一首的最终版本（无论谁写的）。 */
    public synchronized void unified(String songKey, LyricTimelineAuthority.Selection selection) {
        if (selection == null) return;
        if (!accept(songKey, null)) return;
        if (selection.revision >= 0 && selection.revision < unifiedRevision) { staleEvents++; return; }
        unifiedState = selection.state.name().toLowerCase(java.util.Locale.US);
        unifiedHash = selection.hash;
        unifiedRevision = selection.revision;
        unifiedSource = selection.sourceId;
    }

    /** 歌词舞台（WebView）发布了一版。 */
    public synchronized void stagePublished(String songKey, String hash, long nowMs) {
        if (!accept(songKey, null)) return;
        stageHash = hash == null ? "" : hash;
        stagePublishedAtMs = nowMs;
    }

    /** 灵动岛：metadata 里真的带上了这一版时间轴。 */
    public synchronized void islandPublished(String songKey, String hash, long nowMs) {
        if (!accept(songKey, null)) return;
        if (hash == null || !hash.equals(islandHash)) islandPublishes = 0;
        islandHash = hash == null ? "" : hash;
        islandPublishedAtMs = nowMs;
        islandPublishes++;
    }

    /** 背屏：原生端点把这一版交出去了。 */
    public synchronized void rearDelivered(String songKey, String epoch, String hash, int lines, long nowMs) {
        if (!accept(songKey, epoch)) return;
        rearEpoch = epoch == null ? "" : epoch;
        if (!rearHash.equals(hash)) {
            rearHash = hash == null ? "" : hash;
            rearDeliveries = 0;
        }
        rearLines = Math.max(0, lines);
        rearDeliveredAtMs = nowMs;
        rearDeliveries++;
    }

    /** 背屏渲染器上报：这一版真的画出来了（或 10s 一次的推进心跳）。 */
    public synchronized void rearApplied(String songKey, String epoch, long nowMs) {
        renderedSong=songKey==null?"":songKey;renderedEpoch=epoch==null?"":epoch;
        if (!accept(songKey, epoch)) return;
        rearAppliedAtMs = nowMs;
        rearHeartbeatAtMs = Math.max(rearHeartbeatAtMs, nowMs);
        if (epoch != null && !epoch.isEmpty()) rearEpoch = epoch;
    }

    /** 背屏渲染端带位置的上报：还能推出「渲染推进到哪一行」。 */
    public synchronized void rearAppliedAt(String songKey, String epoch, long positionMs, long nowMs) {
        if (!accept(songKey, epoch)) return;
        rearApplied(songKey, epoch, nowMs);
        rearAppliedPosMs = Math.max(0L, positionMs);
    }

    /**
     * 背屏状态轮询到达：渲染端活着的最廉价证据（每 100~250ms 一次的既有请求，
     * 这里只写一个 volatile long，无任何附加开销）。
     */
    public synchronized void rearHeartbeat(long nowMs) {
        rearHeartbeatAtMs = nowMs;
    }

    /**
     * 背屏电源状态（页面里的 surface-power 事件）：区分「自己休眠了」与「突然失联」。
     * 轮询照常到达时也会带着最新状态，因此这里同时是低频活心跳。
     */
    public synchronized void rearSleeping(boolean sleeping, long nowMs) {
        rearSleeping = sleeping;
        rearSleepReported = true;
        rearHeartbeatAtMs = Math.max(rearHeartbeatAtMs, nowMs);
    }

    /** 歌词时间轴偏移（JS 侧随发布同步；只用于诊断区分「时钟偏差」与「偏移偏差」）。 */
    public synchronized void offset(long ms) {
        offsetMs = ms;
    }

    /** MediaSession / PlaybackState 的状态。 */
    public synchronized void session(boolean active, boolean playing, long positionMs,
                                     long durationMs, long nowMs) {
        sessionActive = active;
        this.playing = playing;
        this.positionMs = Math.max(0L, positionMs);
        this.durationMs = Math.max(0L, durationMs);
        sessionStateAtMs = nowMs;
    }

    // ---- 归因 ----

    /**
     * 唯一的归因入口。判定次序即优先级：越是上游的问题越先说。
     *
     * @param nowMs 当前时刻（{@code System.currentTimeMillis()}）
     */
    /** Observes the existing coordinator only; never launches a window or changes power ownership. */
    public synchronized void rearContext(boolean expected, boolean cameraOwned, boolean sleeping) {
        rearContextKnown = true; rearExpected = expected; rearCameraOwned = cameraOwned; rearSleeping = sleeping;
    }

    private boolean accept(String key, String observedEpoch) {
        boolean matches = key != null && !key.isEmpty() && key.equals(songKey)
            && (observedEpoch == null || epoch.equals(observedEpoch));
        if (!matches) staleEvents++;
        return matches;
    }

    public synchronized Verdict verdict(long nowMs) {
        if (songKey.isEmpty()) return Verdict.IDLE;
        if (!sessionActive) return Verdict.SESSION_INACTIVE;
        if ("none".equals(unifiedState)) return Verdict.NONE_CONFIRMED;
        if (!playing) return Verdict.PAUSED;
        if (!"ready".equals(unifiedState)) return Verdict.NOT_FETCHED;
        if (!unifiedHash.equals(islandHash)) return Verdict.NOT_PUBLISHED;
        if (rearContextKnown && !rearExpected) return Verdict.REAR_DISABLED;
        if (rearContextKnown && rearCameraOwned) return Verdict.REAR_CAMERA_OWNED;
        if (rearContextKnown && rearSleeping) return Verdict.REAR_SUSPENDED;
        if (!unifiedHash.equals(rearHash)) return Verdict.NOT_DELIVERED;
        // 显示端生命周期与渲染推进分开归因：
        //   轮询在、版本旧、播放中不推进 → 渲染停滞（真故障）；
        //   轮询消失 + 自己报告过休眠 → 挂起（息屏正常行为）；
        //   轮询消失 + 最后已知是醒着 → 失联（被覆盖/冻结/卡死，进程内不可再分）。
        if (rearHeartbeatAtMs <= 0L || nowMs - rearHeartbeatAtMs > REAR_SUSPEND_MS) {
            return rearSleepReported && rearSleeping
                ? Verdict.REAR_SUSPENDED
                : Verdict.REAR_UNRESPONSIVE;
        }
        long expectedApplyAt = rearAppliedAtMs > 0L ? rearAppliedAtMs : rearDeliveredAtMs;
        if (playing && !rearSleeping && expectedApplyAt > 0L
                && nowMs - expectedApplyAt > REAR_RENDER_STALL_MS) {
            return Verdict.REAR_RENDER_STALLED;
        }
        if (playing && sessionStateAtMs > 0L && nowMs - sessionStateAtMs > CLOCK_STALE_MS) {
            return Verdict.CLOCK_STALE;
        }
        // 三端版本一致、时钟在走 —— 但仍然看不见，那只能是消费端。它是进程外的一层，
        // 这里只能证明到「会话里确实有这一版」，不能替它下结论。
        if (islandPublishes <= 0) return Verdict.NOT_PUBLISHED;
        return Verdict.IN_SYNC;
    }

    /** 诊断用一行摘要；只出现哈希后的身份与版本哈希，不含歌词正文。 */
    public synchronized String describe(long nowMs) {
        return "output="+outputEngine+"/"+anon(outputLease)+", handoffs="+ownershipChanges+", song=" + anon(songKey)
            + ", epoch=" + (epoch.isEmpty() ? "-" : epoch)
            + ", unified=" + unifiedState
            + (unifiedHash.isEmpty() ? "" : "/" + unifiedHash + "@" + unifiedRevision)
            + (unifiedSource.isEmpty() ? "" : "/" + unifiedSource)
            + ", island=" + (islandHash.isEmpty() ? "none" : islandHash)
            + " (age=" + age(nowMs, islandPublishedAtMs) + "ms, x" + islandPublishes + ")"
            + ", renderedSong="+anon(renderedSong)+", renderedEpoch="+renderedEpoch+", clockSource="+clockSource
            + ", rear=" + (rearHash.isEmpty() ? "none" : rearHash)
            + " (age=" + age(nowMs, rearDeliveredAtMs) + "ms, lines=" + rearLines
            + ", applied=" + age(nowMs, rearAppliedAtMs) + "ms"
            + ", beat=" + age(nowMs, rearHeartbeatAtMs) + "ms"
            + ", appliedPos=" + rearAppliedPosMs + ", x" + rearDeliveries + ")"
            + ", stage=" + (stageHash.isEmpty() ? "none" : stageHash)
            + " (age=" + age(nowMs, stagePublishedAtMs) + "ms)"
            + ", offset=" + (offsetMs >= 0L ? "+" : "") + offsetMs + "ms"
            + ", rearSleep=" + (rearSleepReported ? Boolean.toString(rearSleeping) : "unknown")
            + ", session=" + (sessionActive ? "active" : "inactive")
            + " playing=" + playing
            + ", clockAge=" + age(nowMs, sessionStateAtMs) + "ms"
            + ", pos=" + positionMs + "/" + durationMs
            + ", islandConsumerAck=unavailable"
            + ", staleEvents=" + staleEvents
            + ", verdict=" + verdict(nowMs).name().toLowerCase(java.util.Locale.US);
    }

    private static long age(long nowMs, long atMs) {
        return atMs <= 0L ? -1L : nowMs - atMs;
    }

    /**
     * 与 {@code PlaybackDiagnostics.anonKey} 同款的身份脱敏。
     * 这里本地实现是为了让本类保持纯逻辑：JVM 单测不该被迫加载带 Android 依赖的诊断类。
     */
    private static String anon(String songKey) {
        return songKey == null || songKey.isEmpty() ? "-" : Integer.toHexString(songKey.hashCode());
    }

    /** 供诊断面板/导出使用：三端版本键是否完全一致。 */
    public synchronized boolean threeEndsAligned() {
        if (songKey.isEmpty() || "pending".equals(unifiedState)) return false;
        if ("none".equals(unifiedState)) return rearHash.isEmpty();
        return unifiedHash.equals(islandHash) && unifiedHash.equals(rearHash);
    }

    public synchronized String unifiedHash() { return unifiedHash; }
    public synchronized String islandHash() { return islandHash; }
    public synchronized String rearHash() { return rearHash; }
    public synchronized String stageHash() { return stageHash; }
    public synchronized String unifiedState() { return unifiedState; }

    /** 测试用：清空全部状态。 */
    public synchronized void resetForTest() {
        staleEvents = 0;
        songKey = ""; epoch = "";
        unifiedState = "pending"; unifiedHash = ""; unifiedRevision = -1; unifiedSource = "";
        islandHash = ""; islandPublishedAtMs = 0L; islandPublishes = 0;
        rearEpoch = ""; rearHash = ""; rearLines = 0; rearDeliveredAtMs = 0L;
        rearAppliedAtMs = 0L; rearHeartbeatAtMs = 0L; rearAppliedPosMs = -1L; rearDeliveries = 0;
        rearSleeping = false; rearSleepReported = false;
        rearContextKnown = false; rearExpected = true; rearCameraOwned = false;
        stageHash = ""; stagePublishedAtMs = 0L;
        offsetMs = 0L;
        sessionActive = false; sessionStateAtMs = 0L; positionMs = 0L; durationMs = 0L; playing = false;
    }
}
