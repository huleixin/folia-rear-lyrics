package io.github.huleixin.tingyu.playback;

import org.json.JSONObject;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/SongInfo.java
/**
 * 一首歌在原生侧的全部身份与展示信息。
 *
 * <p>来源只有一个：Media3 当前/待播 MediaItem 的 tag（即播放队列真实持有的那一份），
 * 不读 WebView 的状态、不猜、不缓存全局「当前歌」。
 *
 * <p>`generation` 是**播放代次**：每次真实换曲 +1。所有异步结果在写回前都必须核对
 * 「代次还在 + songKey 还是当前曲」，这是「上一首的歌词/封面覆盖下一首」的唯一防线。
 */
public final class SongInfo {

    public final String songKey;
    public final String title;
    public final String artist;
    public final String album;
    public final long durationMs;
    public final String artworkUrl;
    public final String providerId;
    public final String mediaId;
    public final int generation;

    public SongInfo(String songKey, String title, String artist, String album, long durationMs,
                    String artworkUrl, String providerId, String mediaId, int generation) {
        this.songKey = songKey == null ? "" : songKey;
        this.title = title == null ? "" : title;
        this.artist = artist == null ? "" : artist;
        this.album = album == null ? "" : album;
        this.durationMs = Math.max(0L, durationMs);
        this.artworkUrl = artworkUrl == null ? "" : artworkUrl;
        this.providerId = providerId == null ? "" : providerId;
        this.mediaId = mediaId == null ? "" : mediaId;
        this.generation = generation;
    }

    /**
     * 给歌词来源用的稳定 id。
     *
     * <p>优先音源自己的 mediaId（QQ 的 songmid 等），它是跨进程稳定的；没有就退回 songKey，
     * 保证 `trackKey` 在任何音源下都不是空串。
     */
    public String songId() {
        if (!mediaId.isEmpty()) return mediaId;
        return songKey;
    }

    /**
     * 从 MediaItem 的 tag 读出信息。
     *
     * <p>兼容两种字段名：JS 队列窗口用 `artwork`，播放插件推当前曲时用 `coverUrl`。
     * 这一处不一致正是「原生自动切歌后封面消失」的直接原因 —— 之前只读 `coverUrl`，
     * 而原生队列项的封面在 `artwork` 里，于是换歌瞬间封面被当成空值清掉。
     */
    public static SongInfo fromTag(JSONObject tag, int generation) {
        if (tag == null) return null;
        String songKey = tag.optString("songKey", "");
        if (songKey.isEmpty()) return null;
        String artwork = tag.optString("artwork", "");
        if (artwork.isEmpty()) artwork = tag.optString("coverUrl", "");
        long duration = tag.optLong("durationMs", 0L);
        if (duration <= 0L) duration = tag.optLong("duration", 0L);
        return new SongInfo(
                songKey,
                tag.optString("title", ""),
                tag.optString("artist", ""),
                tag.optString("album", ""),
                duration,
                artwork,
                tag.optString("providerId", ""),
                tag.optString("mediaId", ""),
                generation);
    }

    public SongInfo withGeneration(int value) {
        return new SongInfo(songKey, title, artist, album, durationMs, artworkUrl,
                providerId, mediaId, value);
    }
}
