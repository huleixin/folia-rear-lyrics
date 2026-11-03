package io.github.huleixin.tingyu.minimal

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/minimal/MinimalLyricsTest.kt
// 极简页歌词投影的纯逻辑：解析、行索引、逐字进度、旧歌丢弃。
class MinimalLyricsTest {

    private val sample = """
        {"songKey":"tx:1","state":"ready","isWordByWord":true,"lines":[
          {"startTime":0.0,"endTime":2.0,"fullText":"第一行","words":[
            {"text":"第一","startTime":0.0,"endTime":1.0},
            {"text":"行","startTime":1.0,"endTime":2.0}]},
          {"startTime":2.0,"endTime":4.0,"fullText":"第二行","translation":"second","words":[]},
          {"startTime":4.0,"endTime":6.0,"fullText":"第三行","words":[]}
        ]}
    """.trimIndent()

    @Test fun parsesRowsIntoImmutableLines() {
        val lyrics = MinimalLyrics.fromRows(sample, "tx:1", "tx:1#1", "v1")
        assertEquals(MinimalLyricsStatus.READY, lyrics.status)
        assertEquals(3, lyrics.lines.size)
        assertEquals("第一行", lyrics.lines[0].text)
        assertEquals(2, lyrics.lines[0].words.size)
        assertTrue(lyrics.wordByWord)
        assertEquals("second", lyrics.lines[1].translation)
        assertNull(lyrics.lines[2].translation)
    }

    @Test fun activeLineIndexIsTheLastLineThatStarted() {
        val lyrics = MinimalLyrics.fromRows(sample, "tx:1", "e", "v")
        assertEquals(-1, lyrics.activeIndex(-0.5))
        assertEquals(0, lyrics.activeIndex(0.0))
        assertEquals(0, lyrics.activeIndex(1.99))
        assertEquals(1, lyrics.activeIndex(2.0))
        assertEquals(2, lyrics.activeIndex(99.0))
    }

    @Test fun activeLineIsNullBeforeTheFirstLine() {
        val lyrics = MinimalLyrics.fromRows(sample, "tx:1", "e", "v")
        assertNull(lyrics.lineAt(-1.0))
        assertEquals("第二行", lyrics.lineAt(3.0)?.text)
    }

    @Test fun wordByWordProgressFollowsWordTimings() {
        val line = MinimalLyrics.fromRows(sample, "tx:1", "e", "v").lines[0]
        assertEquals(0f, line.sungFraction(0.0), .001f)
        // 两个字的片段唱完一半
        assertEquals(1f / 3f, line.sungFraction(0.5), .001f)
        assertEquals(2f / 3f, line.sungFraction(1.0), .001f)
        assertEquals(1f, line.sungFraction(2.0), .0001f)
        assertEquals(0f, line.sungFraction(-3.0), .0001f)
    }

    @Test fun lineWithoutWordsInterpolatesLinearly() {
        val line = MinimalLyrics.fromRows(sample, "tx:1", "e", "v").lines[1]
        assertEquals(0.25f, line.sungFraction(2.5), .001f)
        assertEquals(0.75f, line.sungFraction(3.5), .001f)
    }

    @Test fun missingPayloadIsLoadingNotNone() {
        val lyrics = MinimalLyrics.fromRows(null, "tx:1", "e", "v")
        assertEquals(MinimalLyricsStatus.LOADING, lyrics.status)
        assertTrue(lyrics.lines.isEmpty())
    }

    @Test fun explicitNoneIsNone() {
        val lyrics = MinimalLyrics.fromRows("""{"songKey":"tx:1","state":"none","lines":[]}""", "tx:1", "e", "v")
        assertEquals(MinimalLyricsStatus.NONE, lyrics.status)
    }

    @Test fun malformedJsonIsLoadingNotACrash() {
        val lyrics = MinimalLyrics.fromRows("{not json", "tx:1", "e", "v")
        assertEquals(MinimalLyricsStatus.LOADING, lyrics.status)
    }

    @Test fun rowsForAnotherSongAreDiscarded() {
        // 旧歌的 rows 迟到时绝不能配到新歌上：宁可多等一次取词。
        val lyrics = MinimalLyrics.fromRows(sample, "tx:2", "tx:2#1", "v1")
        assertEquals(MinimalLyricsStatus.STALE, lyrics.status)
        assertTrue(lyrics.lines.isEmpty())
    }

    @Test fun blankLinesAreSkippedAndEmptyResultIsNone() {
        val blank = """{"songKey":"tx:1","state":"ready","lines":[
            {"startTime":0.0,"endTime":1.0,"fullText":"   "},
            {"startTime":1.0,"endTime":2.0,"fullText":""}]}"""
        assertEquals(MinimalLyricsStatus.NONE, MinimalLyrics.fromRows(blank, "tx:1", "e", "v").status)
    }

    @Test fun brokenTimingsAreClampedToSomethingRenderable() {
        val broken = """{"songKey":"tx:1","state":"ready","lines":[
            {"startTime":3.0,"endTime":1.0,"fullText":"倒着的时间"}]}"""
        val line = MinimalLyrics.fromRows(broken, "tx:1", "e", "v").lines.single()
        assertEquals(3.0, line.startSec, 0.0)
        assertTrue("结束时间必须落在开始之后", line.endSec > line.startSec)
    }

    @Test fun versionIsCarriedForChangeDetection() {
        val lyrics = MinimalLyrics.fromRows(sample, "tx:1", "epoch", "bridge-3")
        assertEquals("bridge-3", lyrics.version)
        assertEquals("epoch", lyrics.epoch)
    }

    @Test fun rowsWithUnknownSongKeyAreTrusted() {
        // 老 rows 可能不带 songKey；不带的时候不能因此判成旧歌。
        val lyrics = MinimalLyrics.fromRows("""{"state":"ready","lines":[{"startTime":0,"endTime":1,"fullText":"x"}]}""", "tx:9", "e", "v")
        assertEquals(MinimalLyricsStatus.READY, lyrics.status)
    }
}
