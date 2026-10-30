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
    /**
     * 发布错单位时卡片是什么样 —— 这条断言就是真机上看到的「进度条不动」。
     *
     * 200 秒的歌被发布成 200ms 后，任何真实位置都会被钳到 200ms，系统插值也走不动；
     * 而同一首歌按毫秒发布时，进度正常增长。修复前后各断言一次，防止再退回秒。
     */
    @Test public void aDurationPublishedInSecondsFreezesTheProgressBar() {
        assertEquals(200, PlaybackPositionClock.at(true, 10000, 0, 1000, 200));
        assertEquals(11000, PlaybackPositionClock.at(true, 10000, 0, 1000, 200000));
    }
}
