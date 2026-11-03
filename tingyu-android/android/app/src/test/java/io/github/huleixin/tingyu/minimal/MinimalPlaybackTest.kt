package io.github.huleixin.tingyu.minimal

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/minimal/MinimalPlaybackTest.kt
// 播放投影：锚点外推、暂停、上限、时长与歌词时钟坐标。
class MinimalPlaybackTest {

    private fun playback(
        playing: Boolean = true,
        anchorMs: Long = 10_000L,
        anchorAt: Long = 1_000L,
        durationMs: Long = 200_000L,
        source: MinimalClockSource = MinimalClockSource.ENGINE,
        cap: Long = Long.MAX_VALUE,
        key: String = "tx:1",
    ) = MinimalPlayback(
        track = MinimalTrack(key = key, durationMs = durationMs),
        playing = playing,
        anchorPositionMs = anchorMs,
        anchorElapsedMs = anchorAt,
        source = source,
        maxExtrapolationMs = cap,
    )

    @Test fun playingPositionAdvancesWithTheMonotonicClock() {
        assertEquals(12_500L, playback().positionMsAt(3_500L))
        assertEquals(12.5, playback().positionSecAt(3_500L), 0.0001)
    }

    @Test fun pausedPositionStaysWhereItPaused() {
        assertEquals(10_000L, playback(playing = false).positionMsAt(90_000L))
    }

    @Test fun clockNeverRunsBackwardsOnAnOlderSample() {
        assertEquals(10_000L, playback().positionMsAt(500L))
    }

    @Test fun positionIsClampedToTheSongDuration() {
        assertEquals(200_000L, playback().positionMsAt(900_000L))
        assertEquals(1f, playback().progressAt(900_000L), 0.0001f)
    }

    @Test fun unknownDurationStillReportsPositionInsteadOfZero() {
        val value = playback(durationMs = 0L)
        assertEquals(12_500L, value.positionMsAt(3_500L))
        assertEquals(0f, value.progressAt(3_500L), 0.0001f)
    }

    @Test fun noPlaybackChannelMeansNoPosition() {
        val value = playback(source = MinimalClockSource.NONE)
        assertEquals(0L, value.positionMsAt(99_000L))
    }

    @Test fun bridgeClockFreezesAfterItsCapInsteadOfInventingMotion() {
        // 桥 1 s 一帧，4 s 没来就说明它停了：位置停在最后一次已知处，而不是继续往前跑。
        val value = playback(source = MinimalClockSource.BRIDGE, cap = 4_000L)
        assertEquals(14_000L, value.positionMsAt(60_000L))
    }

    @Test fun bridgeClockStillAdvancesInsideItsCap() {
        val value = playback(source = MinimalClockSource.BRIDGE, cap = 4_000L)
        assertEquals(12_000L, value.positionMsAt(3_000L))
    }

    @Test fun trackWithoutKeyIsTreatedAsNoTrack() {
        val value = playback(key = "")
        assertTrue(!value.track.present)
        assertEquals(0L, value.positionMsAt(3_500L))
    }

    @Test fun lyricClockIsTheRawPositionBecauseRowsAreAlreadyBaked() {
        // 极简页的行结构在交付点烘焙过用户偏移，所以歌词时钟就是原始位置 —— 这里再减一次就会二次偏移。
        assertEquals(12.5, playback().lyricSecAt(3_500L), 0.0001)
    }
}
