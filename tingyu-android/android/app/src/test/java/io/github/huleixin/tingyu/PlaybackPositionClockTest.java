package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/PlaybackPositionClockTest.java
public class PlaybackPositionClockTest {
    @Test public void lateLyricsContinueThePublishedClock() {
        assertEquals(10750, PlaybackPositionClock.at(true, 10000, 500, 1250, 20000));
    }
    @Test public void pausedAndSeekedPositionsStayExact() {
        assertEquals(10000, PlaybackPositionClock.at(false, 10000, 500, 1250, 20000));
        assertEquals(2500, PlaybackPositionClock.at(true, 2500, 1250, 1250, 20000));
    }
    @Test public void clampsToKnownDurationWithoutReversingTime() {
        assertEquals(20000, PlaybackPositionClock.at(true, 19900, 500, 1250, 20000));
        assertEquals(10000, PlaybackPositionClock.at(true, 10000, 1000, 500, 0));
    }
}
