package io.github.huleixin.tingyu;

import static org.junit.Assert.assertEquals;
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
}
