package io.github.huleixin.tingyu.minimal.immersive

import io.github.huleixin.tingyu.minimal.*
import io.github.huleixin.tingyu.minimal.immersive.port.*
import org.junit.Assert.*
import org.junit.Test

// Real timing is preserved; malformed and stale inputs cannot manufacture word timing.
class ImmersiveStateAdapterTest {
    private fun lyrics(lines: List<MinimalLyricLine>, words: Boolean = false) = MinimalLyrics(
        songKey = "song", epoch = "epoch", status = MinimalLyricsStatus.READY, lines = lines, wordByWord = words)
    @Test fun staleLoadingAndNoneCannotLeakPreviousSong() {
        val l = lyrics(listOf(MinimalLyricLine(1.0, 3.0, "词")))
        assertNull(l.toImmersiveDocument("other", "epoch"))
        assertNull(l.toImmersiveDocument("song", "new"))
        assertNull(l.copy(status = MinimalLyricsStatus.LOADING).toImmersiveDocument("song", "epoch"))
        assertNull(l.copy(status = MinimalLyricsStatus.NONE).toImmersiveDocument("song", "epoch"))
    }
    @Test fun exactWordsTranslationAndOverlapAreRetained() {
        val line = MinimalLyricLine(1.0, 4.0, "听屿", "Tingyu", listOf(
            MinimalLyricWord("听", 1.25, 2.5), MinimalLyricWord("屿", 2.0, 3.75)))
        val document = lyrics(listOf(line), true).toImmersiveDocument("song", "epoch")!!
        assertEquals(LyricQuality.WordSynchronized, document.quality)
        assertEquals(listOf(1250L, 2000L), document.lines.single().syllables.map { it.startTimeMs })
        assertEquals("Tingyu", document.lines.single().translation)
        assertFalse(document.pseudoTimingAllowed)
    }
    @Test fun lineAndStaticLyricsHaveNoSyntheticSyllables() {
        val line = MinimalLyricLine(3.0, 8.0, "整行", words = listOf(MinimalLyricWord("整行", 3.0, 8.0)))
        val doc = lyrics(listOf(line)).toImmersiveDocument("song", "epoch")!!
        assertTrue(doc.lines.single().syllables.isEmpty())
        assertEquals(LyricTimingKind.LineSynchronized, doc.lines.single().timingKind)
        assertTrue(lyrics(listOf(MinimalLyricLine(text="静态"))).toImmersiveDocument("song", "epoch")!!.isUnsynchronized)
    }
    @Test fun invalidAndNegativeTimesAreSanitizedWithoutZeroLengthWords() {
        val l = lyrics(listOf(MinimalLyricLine(Double.NaN, 4.0, "bad"),
            MinimalLyricLine(-2.0, 1.0, "词", words = listOf(
                MinimalLyricWord("bad", -2.0, -1.0), MinimalLyricWord("bad", Double.NaN, 1.0),
                MinimalLyricWord("词", -.5, .5)))), true)
        val doc = l.toImmersiveDocument("song", "epoch")!!
        assertEquals(1, doc.lines.size)
        assertEquals(0L, doc.lines.single().timeMs)
        assertEquals(listOf(LyricSyllable("词", 0, 500)), doc.lines.single().syllables)
    }
}
