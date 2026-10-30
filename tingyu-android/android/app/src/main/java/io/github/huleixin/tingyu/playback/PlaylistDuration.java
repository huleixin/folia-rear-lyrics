package io.github.huleixin.tingyu.playback;

import org.json.JSONObject;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/PlaylistDuration.java
/**
 * 逻辑歌单里「时长」这一个字段的**唯一**读取点。
 *
 * 这里单独成类，是因为单位曾经在两份契约之间悄悄分叉：窗口通道发毫秒，逻辑歌单发秒，
 * 而消费方（`NativePlaylist.Track.durationMs`）一律按毫秒用。原生接管的那首歌于是被发布成
 * 200ms —— 锁屏总时长 00:00、进度条被钳死在 200ms 不动，重开 App 走另一条通道才恢复。
 *
 * 契约现在是 {@code durationMs}（毫秒）。旧格式 {@code duration}（秒）仍然接受，
 * 因为升级前落盘的/缓存的歌单可能还在用旧字段：
 * <ul>
 *   <li>数值小到只可能是秒（&lt; 100000）→ 乘 1000；</li>
 *   <li>数值本身已经像毫秒（≥ 100000）→ 原样使用，绝不二次放大。</li>
 * </ul>
 * 判据是"一个 100000 秒（27 小时）的单曲不存在"，反过来 100000ms（100 秒）非常常见，
 * 所以这条分界线两边都不会误判。
 */
final class PlaylistDuration {

    /** 旧的秒值不会超过这个数；超过它的只可能是毫秒（100000 秒 ≈ 27 小时）。 */
    static final long LEGACY_SECONDS_CEILING = 100_000L;

    private PlaylistDuration() {}

    /** 读取一条歌单曲目的时长（毫秒）。读不到就返回 0，调用方按「未知」处理。 */
    static long read(JSONObject raw) {
        if (raw == null) return 0L;
        long ms = raw.optLong("durationMs", 0L);
        if (ms > 0L) return ms;
        long legacy = raw.optLong("duration", 0L);
        if (legacy <= 0L) return 0L;
        return legacy >= LEGACY_SECONDS_CEILING ? legacy : legacy * 1000L;
    }
}
