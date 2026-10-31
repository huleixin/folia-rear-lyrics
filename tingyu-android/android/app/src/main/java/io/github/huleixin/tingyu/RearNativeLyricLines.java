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
public final class RearNativeLyricLines {

    /**
     * 已渲染行结构的短缓存。**键里带版本**：同一首歌的歌词从 pending 变成 ready、
     * 或舞台换了版本时，缓存键随之改变 —— 旧实现只按 songKey 缓存，一旦第一次构建出
     * 「无词」结果就会一直返回它，歌词后来到了也永不刷新。
     */
    private static final int MAX_CACHED = 12;
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
        String anon = io.github.huleixin.tingyu.playback.PlaybackDiagnostics.anonKey(key);
        try {
            value.put("songKey", key);
            value.put("epoch", epoch == null ? "" : epoch);
            if (key.isEmpty()) { value.put("state", "none"); return value.toString(); }
            if (!epochMatches(epoch)) {
                // The song changed while this request was in flight. Never answer for a stale song.
                RearLyricsTrace.record(context, "rear/lyric-stale", "song=" + anon + " epoch=" + epoch);
                value.put("state", "stale"); return value.toString();
            }
            RearLyricsTrace.record(context, "rear/lyric-request",
                "song=" + anon + " epoch=" + epoch);
            String cacheKey = cacheKey(context, key);
            String cached;
            synchronized (parsed) { cached = parsed.get(cacheKey); }
            String source = "memory";
            if (cached == null) {
                cached = build(context, key);
                if (cached != null) synchronized (parsed) { parsed.put(cacheKey, cached); }
                source = "resolved";
            }
            if (cached == null) {
                // 还没取到：后台仍在取词或发布。状态指纹变化会让渲染器立刻重读，
                // 因此这里返回 loading 不是「放弃」。
                RearLyricsTrace.record(context, "rear/lyric-miss",
                    "song=" + anon + " epoch=" + epoch + " lyric="
                        + io.github.huleixin.tingyu.coloros.ColorOsLyricBridge.fingerprint(key));
                value.put("state", "loading"); return value.toString();
            }
            JSONObject lyric = new JSONObject(cached);
            String state = lyric.optString("state", "loading");
            value.put("state", state);
            value.put("title", RearNativeTrack.snapshot().optString("title", ""));
            if (lyric.has("lines")) {
                value.put("lines", lyric.getJSONArray("lines"));
                int lines = lyric.getJSONArray("lines").length();
                RearLyricsTrace.record(context, "rear/lyric-delivered",
                    "song=" + anon + " epoch=" + epoch + " state=" + state
                        + " lines=" + lines + " source=" + source);
                // 账本：这一首真的交到渲染端了。「有词但没交付」从此可以被自动归因。
                io.github.huleixin.tingyu.playback.SongInfoLoader.ledger()
                    .rearDelivered(key, lines);
            }
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

    /** 缓存键带上三端的版本信息：任一来源内容变化都必须重新构建。 */
    private static String cacheKey(Context context, String songKey) {
        int bridgeRevision = io.github.huleixin.tingyu.coloros.ColorOsLyricBridge.revisionOf(songKey);
        int unifiedRevision = -1;
        try {
            io.github.huleixin.tingyu.playback.UnifiedLyricsStore.Record record =
                io.github.huleixin.tingyu.playback.UnifiedLyricsStore.get(context).get(songKey);
            if (record != null) unifiedRevision = record.revision;
        } catch (Throwable ignored) {
            // 版本读不到就退化成「只按桥的版本」，不影响正确性（最坏多构建一次）。
        }
        return songKey + "|" + bridgeRevision + "|" + unifiedRevision;
    }

    /**
     * 解析这一首现在能不能出词。判定次序由
     * {@link io.github.huleixin.tingyu.playback.LyricDelivery} 单点决定：
     * <b>任何一处有时间轴就是 READY</b>，只有全都给不出时间轴、且某处明确宣告无词时才是 NONE。
     *
     * <p>旧实现先读原生磁盘缓存，一撞上那条「LRCLIB+酷狗都没命中」的负记录就直接返回
     * 0 行 —— 哪怕舞台刚确认过完整时间轴。QQ/网易云独占曲几乎必然踩中，
     * 这就是「个别歌曲背屏没有歌词、打开主界面才恢复」。
     *
     * @return null = 还没取到（继续等）；{@code state:none} = 确认无词
     */
    private static String build(Context context, String songKey) {
        String bridgeState = io.github.huleixin.tingyu.coloros.ColorOsLyricBridge.stateOf(songKey);
        boolean bridgeTimeline = "ready".equals(bridgeState);
        String bridgeJson = io.github.huleixin.tingyu.coloros.ColorOsLyricBridge.lyricInfoFor(songKey);
        String rows = bridgeTimeline ? rowsFromLyricInfo(bridgeJson, songKey) : null;
        if (rows != null && !rows.isEmpty()) return rows;

        io.github.huleixin.tingyu.playback.UnifiedLyricsStore.Record record = null;
        try {
            record = io.github.huleixin.tingyu.playback.UnifiedLyricsStore.get(context).get(songKey);
        } catch (Throwable ignored) {
            // 统一仓库读失败不是致命错误：继续看原生缓存。
        }
        boolean unifiedTimeline = record != null && record.hasTimeline();
        if (unifiedTimeline) {
            rows = rowsFromLyricInfo(record.json, songKey);
            if (rows != null && !rows.isEmpty()) return rows;
        }

        NativeLyricsRepository.Result cached = NativeLyricsRepository.get(context).readCache(songKey);
        boolean nativeTimeline = cached != null && cached.hasTimeline();
        boolean nativeNone = cached != null && !cached.hasTimeline();
        boolean bridgeNone = "none".equals(bridgeState);

        io.github.huleixin.tingyu.playback.LyricDelivery.Decision decision =
            io.github.huleixin.tingyu.playback.LyricDelivery.decide(bridgeTimeline, unifiedTimeline,
                nativeTimeline, bridgeNone || nativeNone);
        if (decision.ready()) {
            if (nativeTimeline) return rowsFromNative(cached.json, songKey);
            return null;   // READY 但上面两个来源的行结构没解析出来：让下一次重试再试
        }
        if (decision.state == io.github.huleixin.tingyu.playback.LyricDelivery.State.NONE) {
            return rows("", "", songKey);
        }
        return null;
    }

    private static String rowsFromNative(String json, String songKey) {
        if (json == null || json.isEmpty()) return null;
        try {
            JSONObject payload = new JSONObject(json);
            return rows(payload.optString("lyric", ""),
                payload.optString("translationLyric", ""), songKey);
        } catch (Exception error) {
            return null;
        }
    }

    /**
     * Bridge 的 LyricInfo payload（{@code lyric} LRC + 可选 {@code translationLyric}）→
     * 背屏行结构。纯函数：JVM 单测直接调它。没有可用 payload 时返回 null
     * （= 继续等待，**不是**无词）；payload 明确给出空时间轴时返回 {@code state:none}。
     */
    public static String rowsFromLyricInfo(String lyricInfo, String songKey) {
        if (lyricInfo == null || lyricInfo.isEmpty()) return null;
        JSONObject payload;
        try { payload = new JSONObject(lyricInfo); } catch (Exception error) { return null; }
        String lyric = payload.optString("lyric", "");
        if (lyric.trim().isEmpty()) {
            // 明确标记无词才是 none；只是还没拿到就返回 null 继续等。
            return payload.optBoolean("noLyric", false) ? rows("", "", songKey) : null;
        }
        return rows(lyric, payload.optString("translationLyric", ""), songKey);
    }

    /** 纯函数：两段 LRC → 背屏行结构。单测直接调用它，不碰磁盘与网络。 */
    public static String rows(String lrc, String translation, String songKey) {
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
