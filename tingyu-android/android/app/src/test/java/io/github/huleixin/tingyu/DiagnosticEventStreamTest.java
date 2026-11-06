package io.github.huleixin.tingyu;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.util.List;

import io.github.huleixin.tingyu.diagnostics.DiagnosticFields;
import io.github.huleixin.tingyu.diagnostics.DiagnosticRing;

// android/app/src/test/java/io/github/huleixin/tingyu/DiagnosticEventStreamTest.java
/**
 * 统一事件流的两个核心保证（纯 JVM，不依赖 Android）：
 * 1) 环形缓冲有界、先进先出、溢出丢最旧；
 * 2) 字段白名单只放行标量，敏感键与非标量一律丢弃。
 *
 * <p>这两条如果破了，诊断包要么撑爆磁盘，要么把用户数据带出去，所以钉成测试。
 */
public class DiagnosticEventStreamTest {

    @Test
    public void ringKeepsNewestEventsAndDropsOldest() {
        DiagnosticRing ring = new DiagnosticRing(3);
        for (int index = 1; index <= 5; index += 1) ring.add("{\"n\":" + index + "}");
        assertEquals(3, ring.size());
        assertEquals("{\"n\":3}\n{\"n\":4}\n{\"n\":5}", ring.jsonl());
    }

    @Test
    public void ringTailReturnsOldestFirst() {
        DiagnosticRing ring = new DiagnosticRing(8);
        for (int index = 1; index <= 6; index += 1) ring.add("{\"n\":" + index + "}");
        List<String> tail = ring.tail(2);
        assertEquals(2, tail.size());
        assertEquals("{\"n\":5}", tail.get(0));
        assertEquals("{\"n\":6}", tail.get(1));
    }

    @Test
    public void ringIgnoresBlankLinesAndClears() {
        DiagnosticRing ring = new DiagnosticRing(4);
        ring.add("");
        ring.add(null);
        assertEquals(0, ring.size());
        assertEquals("", ring.jsonl());
        ring.add("{\"n\":1}");
        ring.clear();
        assertEquals(0, ring.size());
    }

    @Test
    public void fieldsDropSensitiveKeys() throws Exception {
        JSONObject input = new JSONObject();
        input.put("provider", "qq");
        input.put("code", -1);
        input.put("cached", true);
        input.put("token", "abc");
        input.put("Cookie", "sid=1");
        input.put("uin", "10001");
        input.put("email", "a@b.c");
        input.put("nickname", "someone");
        input.put("lyric", "整首歌词");
        input.put("requestUrl", "https://example.com/a?b=c");
        input.put("filePath", "/sdcard/a.mp3");

        JSONObject safe = DiagnosticFields.sanitize(input);
        assertTrue(safe.has("provider"));
        assertTrue(safe.has("code"));
        assertTrue(safe.has("cached"));
        assertFalse(safe.has("token"));
        assertFalse(safe.has("Cookie"));
        assertFalse(safe.has("uin"));
        assertFalse(safe.has("email"));
        assertFalse(safe.has("nickname"));
        assertFalse(safe.has("lyric"));
        assertFalse(safe.has("requestUrl"));
        assertFalse(safe.has("filePath"));
    }

    @Test
    public void fieldsDropNonScalarValues() throws Exception {
        JSONObject input = new JSONObject();
        input.put("nested", new JSONObject().put("a", 1));
        input.put("list", new JSONArray().put(1).put(2));
        input.put("ok", "value");
        JSONObject safe = DiagnosticFields.sanitize(input);
        assertFalse(safe.has("nested"));
        assertFalse(safe.has("list"));
        assertEquals("value", safe.getString("ok"));
    }

    @Test
    public void fieldsTruncateLongValues() {
        StringBuilder longText = new StringBuilder();
        for (int index = 0; index < 400; index += 1) longText.append('a');
        JSONObject input = new JSONObject();
        try {
            input.put("message", longText.toString());
        } catch (Exception error) {
            throw new AssertionError(error);
        }
        JSONObject safe = DiagnosticFields.sanitize(input);
        String message = safe.optString("message", "");
        assertTrue(message.length() <= DiagnosticFields.MAX_VALUE_CHARS + 1);
        assertTrue(message.endsWith("…"));
    }

    @Test
    public void sensitiveKeyRuleCoversTheCommonLeaks() {
        assertTrue(DiagnosticFields.isSensitiveKey("access_token"));
        assertTrue(DiagnosticFields.isSensitiveKey("set-cookie"));
        assertTrue(DiagnosticFields.isSensitiveKey("audioUrl"));
        assertTrue(DiagnosticFields.isSensitiveKey("lyricsText"));
        assertFalse(DiagnosticFields.isSensitiveKey("provider"));
        assertFalse(DiagnosticFields.isSensitiveKey("bufferedMs"));
    }
}
