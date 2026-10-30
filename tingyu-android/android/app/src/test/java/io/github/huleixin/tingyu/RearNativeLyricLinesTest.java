package io.github.huleixin.tingyu;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

// android/app/src/test/java/io/github/huleixin/tingyu/RearNativeLyricLinesTest.java
/**
 * 背屏换歌时必须拿到「当前这首」的行结构。这里锁住三件事：秒制时间、逐行 endTime 取自下一行、
 * 翻译只在真的存在时出现；并且空/无词永远回 state=none 而不是返回上一首。
 */
public class RearNativeLyricLinesTest {

    @Test public void convertsLrcIntoRearLinesWithSecondTimestamps() throws Exception {
        JSONObject result = new JSONObject(RearNativeLyricLines.rows(
            "[00:01.00]第一句\n[00:05.50]第二句", null, "song-1"));
        assertEquals("ready", result.getString("state"));
        assertEquals("song-1", result.getString("songKey"));
        JSONArray lines = result.getJSONArray("lines");
        assertEquals(2, lines.length());
        assertEquals(1.0, lines.getJSONObject(0).getDouble("startTime"), 0.001);
        // endTime is the next line's start, so the first line cannot bleed into the second.
        assertEquals(5.5, lines.getJSONObject(0).getDouble("endTime"), 0.001);
        assertEquals("第二句", lines.getJSONObject(1).getString("fullText"));
        // A single word spanning the line keeps the word-by-word renderer working.
        assertEquals("第一句", lines.getJSONObject(0).getJSONArray("words").getJSONObject(0).getString("text"));
    }

    @Test public void attachesTranslationsOnlyForMatchingTimestamps() throws Exception {
        JSONObject result = new JSONObject(RearNativeLyricLines.rows(
            "[00:01.00]one\n[00:05.00]two", "[00:01.00]uno", "song-2"));
        JSONArray lines = result.getJSONArray("lines");
        assertEquals("uno", lines.getJSONObject(0).getString("translation"));
        assertTrue(!lines.getJSONObject(1).has("translation"));
    }

    @Test public void noTimelineNeverLooksLikeLyrics() throws Exception {
        assertEquals("none", new JSONObject(RearNativeLyricLines.rows("", null, "song-3")).getString("state"));
        assertEquals(0, new JSONObject(RearNativeLyricLines.rows("", null, "song-3"))
            .getJSONArray("lines").length());
    }

    @Test public void emptyLinesAreSkippedRatherThanRenderedBlank() throws Exception {
        JSONObject result = new JSONObject(RearNativeLyricLines.rows(
            "[00:01.00]\n[00:02.00]real", null, "song-4"));
        JSONArray lines = result.getJSONArray("lines");
        assertEquals(1, lines.length());
        assertEquals("real", lines.getJSONObject(0).getString("fullText"));
    }

    // ---- 真机 2026-10-31 07:33 回归：锁屏切歌后背屏 12 秒仍 loading ----
    //
    // Media3 已切到下一首、原生 lyric-session 已写入 timeline（ColorOsLyricBridge.timelines
    // 里有这首歌），但旧实现只查 NativeLyricsRepository（LRCLIB 磁盘缓存），从不看 Bridge
    // 里已经 ready 的那份 —— WebView 发布的词（QQ QRC，LRCLIB 上没有）永远到不了背屏，
    // 直到主屏点亮才恢复。

    @Test public void aBridgeTimelineBecomesRearRows() throws Exception {
        String lyricInfo = new JSONObject()
            .put("lyric", "[00:01.00]不爱我\n[00:05.50]就直说")
            .put("translationLyric", "[00:01.00]If you don't love me")
            .toString();
        JSONObject result = new JSONObject(
            RearNativeLyricLines.rowsFromLyricInfo(lyricInfo, "online:qq:0013KFa32c9lVn"));
        assertEquals("ready", result.getString("state"));
        JSONArray lines = result.getJSONArray("lines");
        assertEquals(2, lines.length());
        assertEquals("不爱我", lines.getJSONObject(0).getString("fullText"));
        assertEquals("If you don't love me", lines.getJSONObject(0).getString("translation"));
        assertEquals(1.0, lines.getJSONObject(0).getDouble("startTime"), 0.001);
    }

    @Test public void aBridgePayloadWithoutTranslationStillParses() throws Exception {
        String lyricInfo = new JSONObject().put("lyric", "[00:02.00]没有翻译的一首").toString();
        JSONObject result = new JSONObject(RearNativeLyricLines.rowsFromLyricInfo(lyricInfo, "k"));
        assertEquals("ready", result.getString("state"));
        assertTrue(!result.getJSONArray("lines").getJSONObject(0).has("translation"));
    }

    @Test public void anEmptyOrNullBridgePayloadMeansStillWaitingNotNoLyrics() throws Exception {
        // null/空串/坏 JSON = 桥上也没有：端点继续回 loading（词可能马上到），不能假扮无词。
        assertNull(RearNativeLyricLines.rowsFromLyricInfo(null, "k"));
        assertNull(RearNativeLyricLines.rowsFromLyricInfo("", "k"));
        assertNull(RearNativeLyricLines.rowsFromLyricInfo("not json", "k"));
        // 空时间轴且明确 noLyric 标记 = 确认无词：state=none（与 metadataLyricInfoFor 的写法一致）。
        String none = RearNativeLyricLines.rowsFromLyricInfo(
            new JSONObject().put("lyric", "").put("noLyric", true).toString(), "k");
        assertEquals("none", new JSONObject(none).optString("state"));
        // 空时间轴但没有 noLyric 标记 = 还没拿到：继续等待。
        assertNull(RearNativeLyricLines.rowsFromLyricInfo(
            new JSONObject().put("lyric", "").toString(), "k"));
    }
}
