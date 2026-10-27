package io.github.huleixin.tingyu.chrome

import org.junit.Assert.assertEquals
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/ChromeTimelineTest.kt
class ChromeTimelineTest {
    @Test fun playingClockInterpolatesBetweenBridgeAnchors() {
        assertEquals(12.5, ChromeTimeline(12.0,180.0,true,1000).at(1500),.00001)
    }
    @Test fun pausedClockStaysStill() {
        assertEquals(12.0, ChromeTimeline(12.0,180.0,false,1000).at(20000),.00001)
    }
    @Test fun missingHeartbeatStopsExtrapolating() {
        assertEquals(14.5, ChromeTimeline(12.0,180.0,true,1000).at(20000),.00001)
    }
    @Test fun timelineClampsToSongAndHandlesOlderMonotonicSample() {
        assertEquals(13.0, ChromeTimeline(12.0,13.0,true,1000).at(3000),.00001)
        assertEquals(12.0, ChromeTimeline(12.0,180.0,true,1000).at(500),.00001)
        assertEquals(0.0, ChromeTimeline(-3.0,0.0,false,1000).at(500),.00001)
    }
}
