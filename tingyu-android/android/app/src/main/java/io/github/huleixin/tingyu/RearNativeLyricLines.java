package io.github.huleixin.tingyu;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import io.github.huleixin.tingyu.playback.LrcParser;
import io.github.huleixin.tingyu.playback.NativeLyricsRepository;

// android/app/src/main/java/io/github/huleixin/tingyu/RearNativeLyricLines.java
/**
 * 把原生已经取到并缓存好的歌词，转成背屏渲染器认识的 {@code LyricData} 行结构。
 *
 * <p>这是「后台也能换歌词」的最后一环：主界面 WebView 冻结后，背屏拿不到新的
 * {@code config.lyrics}，只能沿用上一首。原生侧其实早就有这首歌的歌词（SongInfoLoader 为当前曲
 * 和后两首预取并落盘），只是从来没有以背屏需要的形状暴露过。
 *
 * <p>只读本地缓存，不联网：换歌那一刻同步响应；网络取词仍然由 SongInfoLoader 负责，两件事不混。
 */
final class RearNativeLyricLines {

    private static final int MAX_CACHED = 8;
    private static final Map<String, String> parsed = new LinkedHashMap<>(16, 0.75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<String, String> eldest) {
            return size() > MAX_CACHED;
        }
    };

    private RearNativeLyricLines() {}

    /**
     * @param epoch 调用方看到的播放代次；与当前代次不一致说明结果已过期，直接丢弃
     */
    static String json(Context context, String songKey, String epoch) {
        JSONObject value = new JSONObject();
        String key = songKey == null ? "" : songKey;
        try {
            value.put("songKey", key);
            value.put("epoch", epoch == null ? "" : epoch);
            if (key.isEmpty()) { value.put("state", "none"); return value.toString(); }
            if (!epochMatches(epoch)) {
                // The song changed while this request was in flight. Never answer for a stale song.
                value.put("state", "stale"); return value.toString();
            }
            String cached;
            synchronized (parsed) { cached = parsed.get(key); }
            if (cached == null) {
                cached = build(context, key);
                if (cached != null) synchronized (parsed) { parsed.put(key, cached); }
            }
            if (cached == null) { value.put("state", "loading"); return value.toString(); }
            JSONObject lyric = new JSONObject(cached);
            value.put("state", lyric.optString("state", "loading"));
            value.put("title", RearNativeTrack.snapshot().optString("title", ""));
            if (lyric.has("lines")) value.put("lines", lyric.getJSONArray("lines"));
            return value.toString();
        } catch (Exception error) {
            try { value.put("state", "loading"); } catch (Exception ignored) { }
            return value.toString();
        }
    }

    private static boolean epochMatches(String epoch) {
        if (epoch == null || epoch.isEmpty()) return true;
        String current = RearNativeTrack.epoch();
        return current.isEmpty() || current.equals(epoch);
    }

    /** null = 还没取到（可能仍在后台取）；{@code state:none} = 确认无词。 */
    private static String build(Context context, String songKey) {
        NativeLyricsRepository.Result cached = NativeLyricsRepository.get(context).readCache(songKey);
        if (cached == null) return null;
        if (!cached.hasTimeline()) return rows("", "", songKey);
        JSONObject payload;
        try { payload = new JSONObject(cached.json); } catch (Exception error) { return null; }
        return rows(payload.optString("lyric", ""), payload.optString("translationLyric", ""), songKey);
    }

    /** 纯函数：两段 LRC → 背屏行结构。单测直接调用它，不碰磁盘与网络。 */
    static String rows(String lrc, String translation, String songKey) {
        List<LrcParser.Line> lines = LrcParser.parse(lrc == null ? "" : lrc);
        Map<Long, String> translated = new LinkedHashMap<>();
        for (LrcParser.Line line : LrcParser.parse(translation == null ? "" : translation)) {
            if (line.text == null || line.text.trim().isEmpty()) continue;
            translated.put(line.startMs, line.text.trim());
        }
        JSONArray out = new JSONArray();
        for (int index = 0; index < lines.size(); index++) {
            LrcParser.Line line = lines.get(index);
            String text = line.text == null ? "" : line.text.trim();
            if (text.isEmpty()) continue;
            double start = line.startMs / 1000.0;
            double end = index + 1 < lines.size() ? lines.get(index + 1).startMs / 1000.0 : start + 4.0;
            if (end <= start) end = start + 0.5;
            try {
                JSONObject row = new JSONObject()
                    .put("startTime", start)
                    .put("endTime", end)
                    .put("fullText", text)
                    // A single word spanning the whole line keeps the word-by-word renderer
                    // working without inventing per-syllable timings we do not have.
                    .put("words", new JSONArray().put(new JSONObject()
                        .put("text", text).put("startTime", start).put("endTime", end)));
                String value = translated.get(line.startMs);
                if (value != null && !value.isEmpty()) row.put("translation", value);
                out.put(row);
            } catch (Exception ignored) { }
        }
        JSONObject result = new JSONObject();
        try {
            result.put("songKey", songKey == null ? "" : songKey)
                .put("state", out.length() == 0 ? "none" : "ready")
                .put("lines", out);
        } catch (Exception ignored) { }
        return result.toString();
    }

    static synchronized void clear() { parsed.clear(); }
}
