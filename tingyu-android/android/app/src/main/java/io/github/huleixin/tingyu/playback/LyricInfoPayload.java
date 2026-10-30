package io.github.huleixin.tingyu.playback;

import org.json.JSONObject;

import java.util.List;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/LyricInfoPayload.java
/**
 * 原生侧的 `lyricInfo` 构建器。
 *
 * <p>输出格式与 JS 的 {@code buildColorOsLyricInfo} 完全一致（这是与 ColorOS SystemUI / Bridge 的
 * **接线契约**，不是可以随手改的内部结构）。字段与语义逐项对齐：
 * <ul>
 *   <li>{@code lyric}：逐行 LRC，必需，系统官方列表只认这一条；时间标签用三位毫秒；</li>
 *   <li>{@code translationLyric}：翻译 lane，只有真的存在时才写；</li>
 *   <li>{@code rawLyric}：逐字 lane。原生补词没有可靠的字级时间轴，**永远不伪造**；</li>
 *   <li>{@code trackKey} = {@code songId|title|artist|durationSeconds}，Bridge 用它拒绝过期 payload；</li>
 *   <li>{@code sessionGeneration}：真实换曲时递增，同一首歌补齐元数据不递增。</li>
 * </ul>
 *
 * <p>超过 200k 字符时放弃（metadata Parcel 有上限，宁可没有锁屏歌词也不要让 Binder 炸掉）。
 */
public final class LyricInfoPayload {

    private static final int MAX_CHARS = 200_000;

    public static final class Result {
        public final String json;
        public final boolean hasTranslation;

        Result(String json, boolean hasTranslation) {
            this.json = json;
            this.hasTranslation = hasTranslation;
        }
    }

    private LyricInfoPayload() {
    }

    /** 「这首歌确认没有词」的收尾 payload：消费端据此收掉旧歌词，而不是继续显示上一首。 */
    public static String noLyric(String reason) {
        try {
            return new JSONObject()
                    .put("lyricType", 0)
                    .put("lyric", "")
                    .put("noLyric", true)
                    .put("reason", reason == null ? "unknown" : reason)
                    .toString();
        } catch (Exception error) {
            return "{\"lyricType\":0,\"lyric\":\"\",\"noLyric\":true}";
        }
    }

    public static Result build(
            String title,
            String artist,
            String album,
            String songId,
            long durationMs,
            List<LrcParser.Line> lines,
            int sessionGeneration,
            String source
    ) {
        if (lines == null || lines.isEmpty()) return null;
        StringBuilder lyric = new StringBuilder();
        StringBuilder translation = new StringBuilder();
        boolean hasTranslation = false;
        int emitted = 0;
        long lastStart = -1L;
        for (LrcParser.Line line : lines) {
            if (line == null || line.text == null || line.text.isEmpty()) continue;
            long start = Math.max(lastStart, Math.max(0L, line.startMs));
            lastStart = start;
            lyric.append('[').append(formatTag(start)).append(']').append(line.text).append('\n');
            emitted++;
            if (line.translation != null && !line.translation.isEmpty()) {
                hasTranslation = true;
                translation.append('[').append(formatTag(start)).append(']')
                        .append(line.translation).append('\n');
            }
        }
        if (emitted == 0) return null;

        long durationSeconds = Math.max(0L, Math.round(durationMs / 1000.0d));
        String safeTitle = title == null ? "" : title;
        String safeArtist = artist == null ? "" : artist;
        String safeSongId = songId == null ? "" : songId;
        JSONObject payload = new JSONObject();
        try {
            payload.put("songName", safeTitle);
            payload.put("artist", safeArtist);
            payload.put("album", album == null ? "" : album);
            payload.put("songId", safeSongId);
            payload.put("lyricType", 0);
            payload.put("lyric", lyric.toString());
            payload.put("noLyric", false);
            payload.put("provider", "io.github.huleixin.tingyu");
            payload.put("source", "folia-sonnet");
            payload.put("nativeSource", source == null ? "native" : source);
            payload.put("trackKey", safeSongId + "|" + safeTitle + "|" + safeArtist + "|" + durationSeconds);
            payload.put("sessionGeneration", Math.max(1, sessionGeneration));
            if (hasTranslation) payload.put("translationLyric", translation.toString());
        } catch (Exception error) {
            return null;
        }
        String json = payload.toString();
        if (json.length() > MAX_CHARS) return null;
        return new Result(json, hasTranslation);
    }

    /** Bridge 的判定正则是 `[\d{1,3}:[0-9]{2}([.:][0-9]{1,3})?]`，三位毫秒是推荐写法。 */
    static String formatTag(long ms) {
        long safe = Math.max(0L, ms);
        long totalSeconds = safe / 1000L;
        long minutes = totalSeconds / 60L;
        long seconds = totalSeconds % 60L;
        long millis = safe % 1000L;
        StringBuilder builder = new StringBuilder(12);
        if (minutes < 10) builder.append('0');
        builder.append(minutes).append(':');
        if (seconds < 10) builder.append('0');
        builder.append(seconds).append('.');
        if (millis < 100) builder.append('0');
        if (millis < 10) builder.append('0');
        builder.append(millis);
        return builder.toString();
    }
}
