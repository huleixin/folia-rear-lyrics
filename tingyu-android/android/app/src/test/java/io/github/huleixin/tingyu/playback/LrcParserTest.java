package io.github.huleixin.tingyu.playback;

import org.junit.Test;

import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * LRC 解析：原生补词的入口。解析错了，后面每一层都是错的，所以这里逐条钉住。
 *
 * <p>真实素材来自 LRCLIB 的 `syncedLyrics`（两位毫秒、单行单标签、可带 offset），
 * 以及 QQ/网易转换出来的三位毫秒、一行多标签写法。
 */
public class LrcParserTest {

    @Test public void parsesTwoDigitAndThreeDigitMilliseconds() {
        List<LrcParser.Line> lines = LrcParser.parse(
                "[00:01.50]第一句\n[00:03.123]第二句\n");
        assertEquals(2, lines.size());
        // `[00:01.50]` 是 1500ms，不是 50ms —— 按小数位补齐而不是当整数毫秒。
        assertEquals(1500L, lines.get(0).startMs);
        assertEquals("第一句", lines.get(0).text);
        assertEquals(3123L, lines.get(1).startMs);
    }

    @Test public void expandsMultipleTagsOnOneLine() {
        List<LrcParser.Line> lines = LrcParser.parse("[00:10.00][01:20.00]副歌");
        assertEquals(2, lines.size());
        assertEquals(10_000L, lines.get(0).startMs);
        assertEquals(80_000L, lines.get(1).startMs);
        assertEquals("副歌", lines.get(0).text);
        assertEquals("副歌", lines.get(1).text);
    }

    @Test public void appliesOffsetAndNeverGoesNegative() {
        List<LrcParser.Line> lines = LrcParser.parse("[offset:-500]\n[00:00.20]很早的一句\n[00:02.00]正常");
        assertEquals(0L, lines.get(0).startMs); // 200 - 500 钳到 0
        assertEquals(1500L, lines.get(1).startMs);
    }

    @Test public void keepsTimelineMonotonic() {
        // 行起点倒退会让整块时间轴错位，系统那边表现为「歌词跳来跳去」。
        List<LrcParser.Line> lines = LrcParser.parse("[00:05.00]五秒\n[00:03.00]三秒");
        assertEquals(5000L, lines.get(0).startMs);
        assertEquals(5000L, lines.get(1).startMs);
    }

    @Test public void treatsSecondIdenticalTimestampAsTranslation() {
        List<LrcParser.Line> lines = LrcParser.parse(
                "[00:01.00]Hello\n[00:01.00]你好\n[00:02.00]World\n");
        assertEquals(2, lines.size());
        assertEquals("Hello", lines.get(0).text);
        assertEquals("你好", lines.get(0).translation);
        assertEquals("World", lines.get(1).text);
    }

    @Test public void ignoresMetadataTagsAndBlankLines() {
        List<LrcParser.Line> lines = LrcParser.parse(
                "[ti:起风了]\n[ar:买辣椒也用券]\n\n[00:00.00]   \n[00:01.00]这一句有内容\n");
        assertEquals(1, lines.size());
        assertEquals("这一句有内容", lines.get(0).text);
    }

    @Test public void returnsEmptyForPlainTextWithoutTimestamps() {
        assertTrue(LrcParser.parse("这是一段没有时间轴的纯文本").isEmpty());
        assertTrue(LrcParser.parse(null).isEmpty());
    }

    @Test public void stripsControlCharactersButKeepsSpaces() {
        List<LrcParser.Line> lines = LrcParser.parse("[00:01.00]带\t制表符 的一句\r\n");
        assertEquals("带 制表符 的一句", lines.get(0).text);
    }
}
