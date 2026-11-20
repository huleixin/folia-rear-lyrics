package io.github.huleixin.tingyu.playback;

/**
 * 判断播放过程中的 HTTP 错误是否应触发「同曲、同音质重新解析直链并按原进度续播」。
 *
 * <p>区分「直链过期 / 上游鉴权拒绝」与「新链短暂 5xx / 网络抖动」：
 * <ul>
 *   <li>明确 403/404/410 且直链已存活或播放超过 1 分钟（或已原地重试一次）→ 判定直链大概率失效，触发刷新。</li>
 *   <li>经本地代理返回 502 且直链存活或播放时长超过 10 分钟（如网易云长音频 25 分钟后直链过期）→ 至少经一次原地重试确认非瞬断后，触发刷新。</li>
 *   <li>刚解析的新链遇到上游 5xx → 不误判为直链过期，走常规有界网络重试。</li>
 * </ul>
 */
public final class UrlRefreshPolicy {

    /** 单曲最多自动刷新直链次数，禁止无限重试。 */
    public static final int MAX_URL_REFRESH_PER_TRACK = 2;
    /** 明确 403/404/410 判定直链可能过期的最小存活/播放时长（1 分钟）。 */
    public static final long MIN_EXPIRED_URL_AGE_MS = 60_000L;
    /** 本地代理 502 在未见明确 4xx 时，判定长音频直链可能过期的时长阈值（10 分钟）。 */
    public static final long LONG_AUDIO_URL_AGE_MS = 10 * 60_000L;

    private UrlRefreshPolicy() { }

    public static boolean shouldRefreshUrl(
        int errorCode,
        int httpStatus,
        int upstreamStatus,
        boolean proxied,
        long urlAgeMs,
        long positionMs,
        int networkRetries,
        int refreshRetries,
        boolean desiredPaused,
        boolean refreshInFlight
    ) {
        if (desiredPaused || refreshInFlight || refreshRetries >= MAX_URL_REFRESH_PER_TRACK) {
            return false;
        }
        if (errorCode != PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS) {
            return false;
        }
        boolean agedOverMinute = urlAgeMs >= MIN_EXPIRED_URL_AGE_MS || positionMs >= MIN_EXPIRED_URL_AGE_MS;
        boolean longLived = urlAgeMs >= LONG_AUDIO_URL_AGE_MS || positionMs >= LONG_AUDIO_URL_AGE_MS;

        int effectiveStatus = upstreamStatus > 0 ? upstreamStatus : httpStatus;
        if (effectiveStatus == 403 || effectiveStatus == 404 || effectiveStatus == 410) {
            return agedOverMinute || networkRetries >= 1;
        }
        if (proxied && httpStatus == 502) {
            // 明确上游 5xx 且非长音频旧链：按上游瞬时故障走普通重试，不盲目认定直链过期
            if (!longLived) return false;
            return networkRetries >= 1;
        }
        return false;
    }
}
