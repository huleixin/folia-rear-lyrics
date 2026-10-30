package io.github.huleixin.tingyu.playback;

/**
 * 不可播放歌曲的处理规则：**有限重试 → 跳过 → 连续失败则停止**。
 *
 * <p>目标是三件事同时成立：一首坏歌不该停掉整场播放，一堆坏歌不该无限循环跳过，
 * 用户主动暂停时这条规则完全不存在。
 *
 * <p>为什么是纯类：所有判定都不依赖 Android —— 错误码是 Media3 的整型常量，HTTP 状态码
 * 由调用方从 {@code HttpDataSource.InvalidResponseCodeException.responseCode} 提取后传入
 * （纯整数），模式是 {@link NativePlaylist.Mode}，输入是原生自己能观测到的量。
 *
 * <p><b>历史教训（真机 1.3.52 诊断）：旧版把 Media3 的 {@code 2004 =
 * ERROR_CODE_IO_BAD_HTTP_STATUS} 当成了 "HTTP 401"。实际上 2004 是"任意非 2xx 响应"的
 * 通用码 —— 一个 404 的过期音频链接也会报 2004，于是被错误地归类为 GLOBAL、整场播放
 * 挂起，明明队列里有下一首也不切。真正的 HTTP 状态码必须从异常的 cause chain 里取，
 * 拿不到状态码时 2004 只能算"说不清"，按有界重试→跳过处理，绝不全局暂停。
 */
public final class PlaybackSkipPolicy {

    /** 一首歌最多当场重试几次（不含首次）。网络抖动重试有意义，404/解码失败没有。 */
    public static final int MAX_RETRY_PER_TRACK = 2;
    /** 连续跳过几首之后必须停下来说出来，避免整份坏歌单变成无限请求。 */
    public static final int MAX_CONSECUTIVE_SKIPS = 3;

    public enum Kind {
        /** 抖动类：网络断开、连接超时、整体超时、5xx 服务端故障。同一首可以重试。 */
        TRANSIENT,
        /** 这首是真的没法播：404/410、解码失败、容器损坏。 */
        PERMANENT,
        /** 账号/权限类全局故障：401/403。必须全局暂停并明确说原因，不许逐首判失效。 */
        GLOBAL_AUTH,
        /** 限流：429。尊重 Retry-After 做有界全局退避。 */
        GLOBAL_THROTTLE,
        /** 说不清（包括拿不到 HTTP 状态码的 2004）。有界重试后跳过，绝不全局暂停。 */
        UNKNOWN
    }

    public enum Action {
        /** 原地重试同一首（退避由调用方做）。 */
        RETRY_SAME,
        /** 同一首的当前音质播放失败：降一档音质重取地址再试（FLAC 失败先试 MP3）。 */
        DOWNGRADE_RETRY,
        /** Media3 已经握着下一首，直接 seekToNextMediaItem。 */
        SKIP_NEXT,
        /** 队列里没有下一首：先按当前音源解析并加入播放器，成功后再跳。 */
        MATERIALIZE_THEN_SKIP,
        /** 停止并给出明确原因（歌单到头 / 连续太多次 / 单曲循环且这首不可播）。 */
        STOP,
        /** 全局暂停等待：限流、鉴权失效。不会把任何一首标定为失败。 */
        SUSPEND
    }

    public static final class Facts {
        public int errorCode;
        /** 异常 cause chain 里提取到的真实 HTTP 状态码；0 = 拿不到。 */
        public int httpStatus;
        /** 服务端 Retry-After 提示（毫秒）；0 = 没有。 */
        public long retryAfterMs;
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
        /** 同一首还有更低音质档可降（RS01→F000→M800→M500）。 */
        public boolean canDowngrade;
        /** 这一次会话里这首是否已经降级试过（降级也只试一轮，不无限降）。 */
        public boolean downgradeTried;

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

    // ---- Media3 错误码（androidx.media3.common.PlaybackException，真实常量表） ----
    public static final int CODE_UNSPECIFIED = 1000;
    public static final int CODE_TIMEOUT = 1002;
    public static final int CODE_IO_UNSPECIFIED = 2000;
    public static final int CODE_IO_NETWORK_CONNECTION_FAILED = 2001;
    public static final int CODE_IO_NETWORK_CONNECTION_TIMEOUT = 2002;
    /** 响应 Content-Type 不对。 */
    public static final int CODE_IO_INVALID_HTTP_CONTENT_TYPE = 2003;
    /** **任意**非 2xx 响应 —— 真实的 HTTP 状态码必须从异常里另取。 */
    public static final int CODE_IO_BAD_HTTP_STATUS = 2004;
    public static final int CODE_IO_FILE_NOT_FOUND = 2005;
    public static final int CODE_IO_NO_PERMISSION = 2006;
    public static final int CODE_IO_CLEARTEXT_NOT_PERMITTED = 2007;
    public static final int CODE_PARSING_CONTAINER_MALFORMED = 3001;
    public static final int CODE_DECODING_FAILED = 4001;
    public static final int CODE_DECODING_FORMAT_EXCLUDED = 4002;
    public static final int CODE_AUDIO_TRACK_INIT_FAILED = 5001;

    /** 这首失败属于哪一类。httpStatus 优先于 Media3 错误码。 */
    public static Kind classify(int code) { return classify(code, 0); }

    public static Kind classify(int code, int httpStatus) {
        if (httpStatus >= 400) {
            if (httpStatus == 404 || httpStatus == 410) return Kind.PERMANENT;
            if (httpStatus == 401 || httpStatus == 403) return Kind.GLOBAL_AUTH;
            if (httpStatus == 429) return Kind.GLOBAL_THROTTLE;
            if (httpStatus >= 500) return Kind.TRANSIENT;
            return Kind.PERMANENT; // 其余 4xx：这一首这一地址就是不行
        }
        if (code == CODE_IO_FILE_NOT_FOUND) return Kind.PERMANENT;
        if (code == CODE_IO_NO_PERMISSION) return Kind.GLOBAL_AUTH;
        if (code == CODE_IO_NETWORK_CONNECTION_FAILED || code == CODE_IO_NETWORK_CONNECTION_TIMEOUT
            || code == CODE_TIMEOUT || code == CODE_IO_UNSPECIFIED
            || code == CODE_IO_INVALID_HTTP_CONTENT_TYPE) return Kind.TRANSIENT;
        if (code == CODE_PARSING_CONTAINER_MALFORMED || code == CODE_DECODING_FAILED
            || code == CODE_DECODING_FORMAT_EXCLUDED || code == CODE_AUDIO_TRACK_INIT_FAILED) return Kind.PERMANENT;
        // CODE_IO_BAD_HTTP_STATUS(2004) 但没取到状态码：说不清。它可能是 404 也可能是 401，
        // 绝不能再像旧版一样当成"HTTP 401"全局暂停 —— 有界重试后按单曲失败处理。
        return Kind.UNKNOWN;
    }

    /** 是否值得原地重试同一首。 */
    public static boolean worthRetrying(int code, int attempts) { return worthRetrying(code, 0, attempts); }

    public static boolean worthRetrying(int code, int httpStatus, int attempts) {
        Kind kind = classify(code, httpStatus);
        if (kind == Kind.GLOBAL_AUTH || kind == Kind.GLOBAL_THROTTLE || kind == Kind.PERMANENT) return false;
        return attempts < MAX_RETRY_PER_TRACK;
    }

    /**
     * 唯一决策入口。
     *
     * <p>顺序即优先级：**用户意图 > 全局故障 > 音质降级 > 重试预算 > 连续跳过上限 > 有没有下一首**。
     */
    public static Decision decide(Facts facts) {
        if (facts == null) return new Decision(Action.STOP, "no-facts");
        // 用户主动暂停/停止：这条规则不存在。缓冲期的状态也不会走到这里（那不是 error）。
        if (facts.userPaused || facts.stopped) return new Decision(Action.STOP, "user-stop");

        Kind kind = classify(facts.errorCode, facts.httpStatus);
        if (kind == Kind.GLOBAL_THROTTLE) {
            // 429 限流影响整个音源：全局退避（尊重 Retry-After，有界），不逐首判坏。
            long wait = Math.min(120_000L, Math.max(5_000L, facts.retryAfterMs));
            return new Decision(Action.SUSPEND, "throttled-wait-" + wait + "ms");
        }
        if (kind == Kind.GLOBAL_AUTH) {
            // 账号/权限失效：全局暂停并明说。逐首跳只会把整份歌单跳光还不解决根因。
            return new Decision(Action.SUSPEND, "auth-or-permission");
        }

        // 音质降级：同一首换低一档地址再试一次（FLAC 播不动先试 MP3），降过就不降了。
        if (facts.canDowngrade && !facts.downgradeTried) {
            boolean httpFailure = facts.httpStatus >= 400 || facts.errorCode == CODE_IO_BAD_HTTP_STATUS
                || facts.errorCode == CODE_IO_FILE_NOT_FOUND || facts.errorCode == CODE_IO_NO_PERMISSION;
            if (httpFailure || kind == Kind.PERMANENT) return new Decision(Action.DOWNGRADE_RETRY, "quality-downgrade");
        }

        if (worthRetrying(facts.errorCode, facts.httpStatus, facts.trackRetries)) {
            return new Decision(Action.RETRY_SAME, kind == Kind.TRANSIENT ? "retry-transient" : "retry-unknown");
        }

        boolean canAdvance = facts.hasNext || facts.canMaterializeNext || facts.hasCandidates;
        if (!canAdvance) return new Decision(Action.STOP, "no-playable-successor");

        // 单曲循环：不能替用户往下跳，也不能无限重试同一首。
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

    /** 诊断用原因串：失败类别 + 真实 HTTP 状态 + 重试/跳过计数，不含任何 URL 或凭据。 */
    public static String describeFailure(int code, int httpStatus) {
        Kind kind = classify(code, httpStatus);
        return "code=" + code + ",http=" + (httpStatus > 0 ? httpStatus : "?")
            + ",kind=" + kind.name().toLowerCase(java.util.Locale.US);
    }
}
