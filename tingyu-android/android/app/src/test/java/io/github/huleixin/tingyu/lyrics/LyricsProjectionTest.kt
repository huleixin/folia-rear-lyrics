package io.github.huleixin.tingyu.lyrics

import io.github.huleixin.tingyu.minimal.*
import org.junit.Assert.*
import org.junit.Test

// Verify the shared playback anchor, race guards and boundary scheduling without a second clock.
class LyricsProjectionTest {
    private fun state() = MinimalPlayerState(
        playback = MinimalPlayback(MinimalTrack("tx:1", durationMs = 30000), true, 2000, 1000, source = MinimalClockSource.ENGINE, epoch = "1"),
        lyrics = MinimalLyrics("tx:1", "1", status = MinimalLyricsStatus.READY, lines = listOf(
            MinimalLyricLine(1.0, 5.0, "第一行"), MinimalLyricLine(5.0, 10.0, "第二行"), MinimalLyricLine(10.0, 15.0, "第三行"))))
    @Test fun boundaryUsesExistingMonotonicAnchor() { assertEquals(0, LyricsProjection.at(state(), 2000).index); assertEquals(2000L, LyricsProjection.nextDelay(state(), 2000)) }
    @Test fun speedChangesBoundaryAndActiveLine() { val s = state().let { it.copy(playback = it.playback.copy(playbackRate = 2f)) }; assertEquals(1000L, LyricsProjection.nextDelay(s, 1500)); assertEquals(1, LyricsProjection.at(s, 3000).index) }
    @Test fun pauseKeepsLineAndSchedulesNothing() { val s = state().let { it.copy(playback = it.playback.copy(playing = false)) }; assertEquals(0, LyricsProjection.at(s, 90000).index); assertNull(LyricsProjection.nextDelay(s, 2000)) }
    @Test fun bufferingFreezesDrawingAndLineChanges() { val s = state().let { it.copy(playback = it.playback.copy(buffering = true)) }; assertEquals(2000L, s.playback.positionMsAt(90000)); assertNull(LyricsProjection.nextDelay(s, 2000)) }
    @Test fun seekSelectsTheNewLineImmediately() { val s = state().let { it.copy(playback = it.playback.copy(anchorPositionMs = 11000, anchorElapsedMs = 3000)) }; assertEquals("第三行", LyricsProjection.at(s, 3000).line?.text) }
    @Test fun trackChangeRejectsOldLyricsAndNextLine() { val s = state().let { it.copy(playback = it.playback.copy(track = MinimalTrack("tx:2"), epoch = "2")) }; val p = LyricsProjection.at(s, 1000); assertNull(p.line); assertNull(p.next); assertNull(LyricsProjection.nextDelay(s, 1000)) }
    @Test fun sameTrackNewEpochRejectsLateLyrics() { val s = state().let { it.copy(playback = it.playback.copy(epoch = "2")) }; assertNull(LyricsProjection.at(s, 1000).next) }
    @Test fun compatibleCapStopsFutureBoundaryJobs() { val s = state().let { it.copy(playback = it.playback.copy(maxExtrapolationMs = 1500, source = MinimalClockSource.BRIDGE)) }; assertNull(LyricsProjection.nextDelay(s, 2000)); assertEquals(0, LyricsProjection.at(s, 90000).index) }
    @Test fun missingLyricsSchedulesNothing() { val s = state().copy(lyrics = MinimalLyrics()); assertNull(LyricsProjection.at(s, 1000).line); assertNull(LyricsProjection.nextDelay(s, 1000)) }
    @Test fun beforeFirstLineOnlyShowsUpcomingLine() { val s = state().let { it.copy(playback = it.playback.copy(anchorPositionMs = 0)) }; val p = LyricsProjection.at(s, 1000); assertNull(p.line); assertEquals("第一行", p.next?.text) }
}
