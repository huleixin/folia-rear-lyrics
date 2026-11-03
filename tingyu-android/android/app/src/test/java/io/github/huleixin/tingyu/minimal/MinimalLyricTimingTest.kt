package io.github.huleixin.tingyu.minimal

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/minimal/MinimalLyricTimingTest.kt
// 逐字时间轴：词内均分、整行均分、字形簇切分、已唱字数。
class MinimalLyricTimingTest {

    private fun line(
        text: String,
        start: Double,
        end: Double,
        words: List<MinimalLyricWord> = emptyList(),
    ) = MinimalLyricLine(startSec = start, endSec = end, text = text, words = words)

    @Test fun splitsCjkPerGrapheme() {
        val parts = splitGraphemes("我听见海浪")
        assertEquals(5, parts.size)
        assertEquals(listOf("我", "听", "见", "海", "浪"), parts)
    }

    @Test fun keepsEmojiAndCombiningMarksWhole() {
        assertEquals(listOf("👨‍👩‍👧"), splitGraphemes("👨‍👩‍👧"))
        assertEquals(listOf("é", "a"), splitGraphemes("éa"))
    }

    @Test fun distributesWithinEachWord() {
        val l = line(
            "我听见海浪",
            10.0,
            12.0,
            listOf(
                MinimalLyricWord("我听见", 10.0, 10.9),
                MinimalLyricWord("海浪", 10.9, 12.0),
            ),
        )
        val timeline = buildGraphemeTimeline(l)
        assertEquals("我听见海浪", timeline.text)
        assertEquals(5, timeline.graphemes.size)
        // 每个字 0.3s，第二段每个字 0.55s
        assertEquals(10.0, timeline.graphemes[0].startSec, 0.001)
        assertEquals(10.3, timeline.graphemes[1].startSec, 0.001)
        assertEquals(10.9, timeline.graphemes[3].startSec, 0.001)
        assertEquals(12.0, timeline.graphemes[4].endSec, 0.001)
    }

    @Test fun fallsBackToEvenSplitWithoutWords() {
        val timeline = buildGraphemeTimeline(line("一二三四", 0.0, 2.0))
        assertEquals(4, timeline.graphemes.size)
        assertEquals(0.5, timeline.graphemes[1].startSec, 0.001)
        assertEquals(2.0, timeline.graphemes.last().endSec, 0.001)
    }

    @Test fun fallsBackWhenWordTagsDoNotCoverTheLine() {
        // 词标签和整行文本对不上（缺标点/缺空格）：退回整行均分，不猜位置
        val l = line(
            "我听见，海浪",
            0.0,
            6.0,
            listOf(MinimalLyricWord("我听见", 0.0, 3.0)),
        )
        val timeline = buildGraphemeTimeline(l)
        assertEquals(6, timeline.graphemes.size)
        assertEquals(1.0, timeline.graphemes[1].startSec, 0.001)
    }

    @Test fun countsSungGraphemesByEndTime() {
        val timeline = buildGraphemeTimeline(line("一二三四", 0.0, 4.0))
        assertEquals(0, timeline.sungCount(-1.0))
        assertEquals(0, timeline.sungCount(0.5))
        assertEquals(1, timeline.sungCount(1.0))
        assertEquals(4, timeline.sungCount(9.0))
        assertEquals(0, timeline.sungCount(Double.NaN))
    }

    @Test fun progressIsLinearAcrossTheLine() {
        val timeline = buildGraphemeTimeline(line("一二三四", 0.0, 4.0))
        assertEquals(0f, timeline.progress(0.0), 0.001f)
        assertEquals(0.5f, timeline.progress(2.0), 0.001f)
        assertEquals(1f, timeline.progress(5.0), 0.001f)
    }

    @Test fun emptyLineHasNoTimeline() {
        val timeline = buildGraphemeTimeline(line("", 0.0, 1.0))
        assertTrue(timeline.isEmpty)
        assertEquals("", timeline.text)
        assertEquals(0, timeline.sungCount(0.5))
    }
}
