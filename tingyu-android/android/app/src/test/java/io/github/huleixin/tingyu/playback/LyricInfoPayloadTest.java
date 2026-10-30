package io.github.huleixin.tingyu.playback;

import org.json.JSONObject;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 原生构建的 `lyricInfo` 必须与 JS 侧逐字段一致 —— 这是与 ColorOS 的接线契约，
 * 字段少一个、时间格式差一位，系统端就是不显示。
 */
public class LyricInfoPayloadTest {

    private static List<LrcParser.Line> lines(String lrc) {
        return LrcParser.parse(lrc);
    }

    @Test public void emitsTheContractFields() throws Exception {
        LyricInfoPayload.Result result = LyricInfoPayload.build(
                "起风了", "买辣椒也用券", "起风了", "123456", 325_000L,
                lines("[00:01.00]这一路上走走停停\n[01:05.25]顺着少年漂流的痕迹\n"),
                7, "native-lrclib");
        assertNotNull(result);
        JSONObject payload = new JSONObject(result.json);
        assertEquals("起风了", payload.getString("songName"));
        assertEquals("买辣椒也用券", payload.getString("artist"));
        assertEquals(0, payload.getInt("lyricType"));
        assertEquals(false, payload.getBoolean("noLyric"));
        assertEquals("io.github.huleixin.tingyu", payload.getString("provider"));
        assertEquals("folia-sonnet", payload.getString("source"));
        assertEquals("native-lrclib", payload.getString("nativeSource"));
        assertEquals(7, payload.getInt("sessionGeneration"));
        assertEquals("123456|起风了|买辣椒也用券|325", payload.getString("trackKey"));
        assertTrue(payload.getString("lyric").startsWith("[00:01.000]这一路上走走停停\n"));
        assertTrue(payload.getString("lyric").contains("[01:05.250]顺着少年漂流的痕迹\n"));
        // 原生没有可靠的字级时间轴：绝不伪造 rawLyric。
        assertFalse(payload.has("rawLyric"));
        assertFalse(result.hasTranslation);
    }

    @Test public void writesTranslationLaneOnlyWhenPresent() throws Exception {
        LyricInfoPayload.Result result = LyricInfoPayload.build(
                "Song", "Artist", "", "", 200_000L,
                lines("[00:01.00]Hello\n[00:01.00]你好\n[00:02.00]World\n"), 2, "native-lrclib");
        assertNotNull(result);
        assertTrue(result.hasTranslation);
        JSONObject payload = new JSONObject(result.json);
        assertEquals("[00:01.000]你好\n", payload.getString("translationLyric"));
    }

    @Test public void formatsTagsWithThreeDigitMillis() {
        assertEquals("00:00.000", LyricInfoPayload.formatTag(0L));
        assertEquals("00:01.005", LyricInfoPayload.formatTag(1005L));
        assertEquals("01:02.345", LyricInfoPayload.formatTag(62_345L));
        assertEquals("10:00.000", LyricInfoPayload.formatTag(600_000L));
    }

    @Test public void refusesEmptyTimelineAndOversizedPayload() {
        assertNull(LyricInfoPayload.build("t", "a", "", "", 1000L, lines("没有任何时间轴"), 1, "x"));
        assertNull(LyricInfoPayload.build("t", "a", "", "", 1000L, new ArrayList<>(), 1, "x"));

        List<LrcParser.Line> huge = new ArrayList<>();
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < 4_000; i++) text.append('词');
        for (int i = 0; i < 60; i++) {
            LrcParser.Line line = new LrcParser.Line(i * 1000L, text.toString());
            huge.add(line);
        }
        assertNull(LyricInfoPayload.build("t", "a", "", "", 60_000L, huge, 1, "x"));
    }

    @Test public void noLyricStubIsExplicitNotBlank() throws Exception {
        JSONObject stub = new JSONObject(LyricInfoPayload.noLyric("instrumental"));
        assertEquals(0, stub.getInt("lyricType"));
        assertEquals("", stub.getString("lyric"));
        assertTrue(stub.getBoolean("noLyric"));
        assertEquals("instrumental", stub.getString("reason"));
    }
}
