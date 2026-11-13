package io.github.huleixin.tingyu.lyrics

import org.junit.Assert.*
import org.junit.Test

// Seek/paused anchors choose the same offset; the long sentence is never truncated.
class DesktopLyricsScrollTest {
    @Test fun longLineTracksSungWidthAndClampsBothEnds() {
        assertEquals(0f, desktopLyricTextOffset(600f, 200f, 0f, true, 0), .001f)
        assertEquals(-176f, desktopLyricTextOffset(600f, 200f, 300f, true, 0), .001f)
        assertEquals(-400f, desktopLyricTextOffset(600f, 200f, 600f, true, 0), .001f)
        assertEquals(0f, desktopLyricTextOffset(600f, 200f, 300f, false, 1), .001f)
    }
    @Test fun shortSplitLinesUseTheWholeWidthAndOppositeEdges() {
        assertEquals(0f, desktopLyricTextOffset(80f, 200f, 0f, true, -1), .001f)
        assertEquals(120f, desktopLyricTextOffset(80f, 200f, 0f, true, 1), .001f)
        assertEquals(60f, desktopLyricTextOffset(80f, 200f, 0f, true, 0), .001f)
    }
}
