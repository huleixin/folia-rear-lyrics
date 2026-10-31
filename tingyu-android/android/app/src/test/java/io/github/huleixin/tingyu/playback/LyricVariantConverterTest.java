package io.github.huleixin.tingyu.playback;

import org.junit.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertSame;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/LyricVariantConverterTest.java
/**
 * 原生简繁转换（逻辑层）回归：映射表驱动、时间标签不动、无映射字符原样、幂等。
 */
public class LyricVariantConverterTest {

    private static Map<String, String> table() {
        Map<String, String> map = new HashMap<>();
        map.put("後", "后");
        map.put("來", "来");
        map.put("風", "风");
        map.put("臺", "台");
        map.put("聽", "听");
        map.put("嶼", "屿");
        return map;
    }

    @Test
    public void convertsMappedCharactersOnly() {
        assertEquals("听屿", LyricVariantConverter.convert("聽嶼", table()));
    }

    @Test
    public void keepsTimeTagsAndLineStructure() {
        String lrc = "[00:01.500]聽嶼 [00:02.000] 後來\n[01:02.003]臺風";
        assertEquals("[00:01.500]听屿 [00:02.000] 后来\n[01:02.003]台风",
                LyricVariantConverter.convert(lrc, table()));
    }

    @Test
    public void unmappedTextIsSameInstance() {
        String text = "[00:01.000]already simplified";
        assertSame(text, LyricVariantConverter.convert(text, table()));
    }

    @Test
    public void conversionIsIdempotent() {
        String traditional = "聽嶼的後來在臺北";
        String once = LyricVariantConverter.convert(traditional, table());
        assertEquals(once, LyricVariantConverter.convert(once, table()));
    }

    @Test
    public void nullAndEmptyAreSafe() {
        assertEquals(null, LyricVariantConverter.convert(null, table()));
        assertEquals("", LyricVariantConverter.convert("", table()));
    }

    @Test
    public void ruleParsingDefaultsToOff() {
        assertEquals(LyricVariantConverter.Rule.OFF, LyricVariantConverter.Rule.of(null));
        assertEquals(LyricVariantConverter.Rule.OFF, LyricVariantConverter.Rule.of("off"));
        assertEquals(LyricVariantConverter.Rule.OFF, LyricVariantConverter.Rule.of("anything"));
        assertEquals(LyricVariantConverter.Rule.T2S, LyricVariantConverter.Rule.of("t2s"));
        assertEquals(LyricVariantConverter.Rule.T2S, LyricVariantConverter.Rule.of("T2S"));
    }
}
