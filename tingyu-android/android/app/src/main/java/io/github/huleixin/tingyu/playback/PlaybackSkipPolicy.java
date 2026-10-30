package io.github.huleixin.tingyu.playback;

/**
 * 不可播放歌曲的处理规则：**有限重试 → 跳过 → 连续失败则停止**。
 *
 * <p>目标是三件事同时成立：一首坏歌不该停掉整场播放，一堆坏歌不该无限循环跳过，
 * 用户主动暂停时这条规则完全不存在。
 *
 * <p>为什么是纯类：三条 retrieval 都不依赖 Android —— 错误码是 Media3 的整型常量，
 * 模式是 {@link NativePlaylist.Mode}，输入是原生自己能观测到的量。于是"HTTP 404 跳歌"
 * "缓冲不跳歌""单曲循环不无限try"这些规则都能在 JVM 上直接断言，不用起播放器。
 *
 * <p>错误码取自 {@code androidx.media3.common.PlaybackException.ERROR_CODE_*}；这里写成字面量
 * 只是为了让这条规则不反向依赖 Media3 的类加载。
 */
public final class PlaybackSkipPolicy {

    /** 一首歌最多当场重试几次（不含首次）。网络抖动重试有意义，404/解码失败没有。 */
    public static final int MAX_RETRY_PER_TRACK = 2;
    /** 连续跳过几首之后必须停下来说出来，避免整份坏歌单变成无限请求。 */
    public static final int MAX_CONSECUTIVE_SKIPS = 3;

    public enum Kind {
        /** 抖动类：网络断开、连接超时、整体超时。同一首可以重试。 */
        TRANSIENT,
        /** 这首是真的没法播：404、解码失败、容器损坏、申请播放失败。 */
        PERMANENT,
        /** 整类请求都受影响：429 限流、401/403 鉴权。必须全局暂停，不许逐首判失效。 */
        GLOBAL,
        /** 说不清。保守按.this可重试一次处理。 */
        UNKNOWN
    }

    public enum Action {
        /** 原地重试同一首（yeah退避由调用方做）。 */
        RETRY_SAME,
        /** Media3 已经握着下一首，直接 seekToNextMediaItem。 */
        SKIP_NEXT,
        /** 队列里没有下一首：先按当前音源解析并加入播放器，成功后再跳。 */
        MATERIALIZE_THEN_SKIP,
        /** 停止并给出明确原因（歌单到头 / 连续太多次 / 单曲循环且这首不可播）。 */
        STOP,
        /** 全局暂停等待：限流、鉴权失效、整体断网。不会把任何一首标定为失败。 */
        SUSPEND
    }

    public static final class Facts {
        public int errorCode;
        /** 这一首已经重试过几次。 */
        public int trackRetries;
        /** 已经连续跳过几首（中间没有一次真正播出声）。 */
        public int consecutiveSkips;
        public NativePlaylist.Mode mode;
        public boolean userPaused;
        public boolean stopped;
        /** Media3 队列里当前位置之后是否已经有下一首。 */
        public boolean hasNext;
        /** 没有下一首时，原生能否按当前音源解析出下一首。 */
        public boolean canMaterializeNext;
        /** 逻辑歌单后面还有候选（用来区分"到头停下"和"还能往下挑"）。 */
        public boolean hasCandidates;

        public Facts() { this.mode = NativePlaylist.Mode.SEQUENCE; }

        public Facts(int errorCode, int trackRetries, int consecutiveSkips, NativePlaylist.Mode mode,
                     boolean userPaused, boolean stopped, boolean hasNext, boolean canMaterializeNext,
                     boolean hasCandidates) {
            this.errorCode = errorCode;
            this.trackRetries = trackRetries;
            this.consecutiveSkips = consecutiveSkips;
            this.mode = mode == null ? NativePlaylist.Mode.SEQUENCE : mode;
            this.userPaused = userPaused;
            this.stopped = stopped;
            this.hasNext = hasNext;
            this.canMaterializeNext = canMaterializeNext;
            this.hasCandidates = hasCandidates;
        }
    }

    public static final class Decision {
        public final Action action;
        public final String reason;

        Decision(Action action, String reason) {
            this.action = action;
            this.reason = reason;
        }

        @Override
        public String toString() { return action.name().toLowerCase(java.util.Locale.US) + "(" + reason + ")"; }
    }

    private PlaybackSkipPolicy() { }

    // ---- Media3 错误码（androidx.media3.common.PlaybackException） ----
    public static final int CODE_UNSPECIFIED = 1000;
    public static final int CODE_TIMEOUT = 1002;
    public static final int CODE_IO_UNSPECIFIED = 2000;
    public static final int CODE_IO_NETWORK_CONNECTION_FAILED = 2001;
    public static final int CODE_IO_NETWORK_CONNECTION_TIMEOUT = 2002;
    public static final int CODE_IO_HTTP_400 = 2003;
    public static final int CODE_IO_HTTP_401 = 2004;
    public static final int CODE_IO_HTTP_403 = 2005;
    public static final int CODE_IO_HTTP_404 = 2006;
    public static final int CODE_IO_HTTP_429 = 2029;
    public static final int CODE_PARSING_CONTAINER_MALFORMED = 3001;
    public static final int CODE_DECODING_FAILED = 4001;
    public static final int CODE_DECODING_FORMAT_EXCLUDED = 4002;
    public static final int CODE_AUDIO_TRACK_INIT_FAILED = 5001;

    /** 准备超时（既没 READY、也没任何进度）被模型成这个类，它同 beat UDPek一样可以重试一次。 */
    public static final int CODE_PREPARE_TIMEOUT = 1002;

    /** 这首失败属于哪一类。 */
    public static Kind classify(int code) {
        if (code == CODE_IO_HTTP_429 || code == CODE_IO_HTTP_401 || code == CODE_IO_HTTP_403) return Kind.GLOBAL;
        if (code == CODE_IO_NETWORK_CONNECTION_FAILED || code == CODE_IO_NETWORK_CONNECTION_TIMEOUT
            || code == CODE_TIMEOUT || code == CODE_IO_UNSPECIFIED) return Kind.TRANSIENT;
        if (code == CODE_IO_HTTP_400 || code == CODE_IO_HTTP_404
            || code == CODE_PARSING_CONTAINER_MALFORMED || code == CODE_DECODING_FAILED
            || code == CODE_DECODING_FORMAT_EXCLUDED || code == CODE_AUDIO_TRACK_INIT_FAILED) return Kind.PERMANENT;
        return Kind.UNKNOWN;
    }

    /** 是否值得原地重试同一首。 */
    public static boolean worthRetrying(int code, int attempts) {
        Kind kind = classify(code);
        if (kind == Kind.GLOBAL) return false;
        if (kind == Kind.PERMANENT) return false;
        return attempts < MAX_RETRY_PER_TRACK;
    }

    /**
     * 唯一决策入口。
     *
     * <p>顺序即优先级：**用户意图 > 全局故障 > 单曲循环 > 重试预算 > 连续跳过上限 > 有没有下一首**。
     */
    public static Decision decide(Facts facts) {
        if (facts == null) return new Decision(Action.STOP, "no-facts");
        // 用户主动暂停/停止：这条规则不存在。缓冲期的状态也不会走到这里（那不是 error）。
        if (facts.userPaused || facts.stopped) return new Decision(Action.STOP, "user-stop");

        Kind kind = classify(facts.errorCode);
        if (kind == Kind.GLOBAL) {
            // 429 / 鉴权失效影响的是整个音源，逐首判坏只会把整份歌单报销掉。
            return new Decision(Action.SUSPEND, kind == Kind.GLOBAL ? "global-throttle" : "global");
        }

        if (worthRetrying(facts.errorCode, facts.trackRetries)) {
            return new Decision(Action.RETRY_SAME, "retry-transient");
        }

        boolean canAdvance = facts.hasNext || facts.canMaterializeNext || facts.hasCandidates;
        if (!canAdvance) return new Decision(Action.STOP, "no-playable-successor");

        // 单曲循环：不能替用户往下跳，也不能oul无限重试同一首。
        if (facts.mode == NativePlaylist.Mode.REPEAT_ONE) {
            return new Decision(Action.STOP, "repeat-one-unplayable");
        }

        if (facts.consecutiveSkips >= MAX_CONSECUTIVE_SKIPS) {
            return new Decision(Action.STOP, "too-many-consecutive-skips");
        }

        if (facts.hasNext) return new Decision(Action.SKIP_NEXT, "skip-unplayable");
        if (facts.canMaterializeNext) return new Decision(Action.MATERIALIZE_THEN_SKIP, "skip-after-native-enqueue");
        return new Decision(Action.STOP, "successor-not-resolvable");
    }

    /** 诊断用原因串：失败类别 + 重试/跳过计数，不含任何 URL 或凭据。 */
    public static String describeFailure(int code) {
        Kind kind = classify(code);
        return "code=" + code + ",kind=" + kind.name().toLowerCase(java.util.Locale.US);
    }
}
