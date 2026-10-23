package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

/** The opt-in survives a stopped/locked window, but cannot resurrect one after explicit disable. */
public class RearLyricsPolicyTest {
    @Test public void disabledCannotStartEvenDuringPlayback() {
        assertFalse(RearLyricsPolicy.shouldAttempt(false, true, true, true, false, false, 100, 0));
    }
    @Test public void reopeningAndPlayingRestartsWithoutAManualClick() {
        assertTrue(RearLyricsPolicy.shouldAttempt(true, true, false, true, false, false, 100, 0));
    }
    @Test public void openingWithoutPlayingDoesNotAutoLaunch() {
        assertFalse(RearLyricsPolicy.shouldAttempt(true, false, false, true, false, false, 100, 0));
    }
    @Test public void manualSessionCanRemainOnAPausedSong() {
        assertTrue(RearLyricsPolicy.shouldAttempt(true, false, true, true, false, false, 100, 0));
    }
    @Test public void lockedAndStoppedWindowCanRecover() {
        assertTrue(RearLyricsPolicy.shouldMaintain(true, true, false));
        assertTrue(RearLyricsPolicy.shouldAttempt(true, true, false, true, false, false, 100, 0));
    }
    @Test public void visibleAndPendingWindowsDoNotRepeatedlyLaunch() {
        assertFalse(RearLyricsPolicy.shouldAttempt(true, true, false, true, true, false, 100, 0));
        assertFalse(RearLyricsPolicy.shouldAttempt(true, true, false, true, false, true, 100, 0));
    }
    @Test public void powerLockRecoveryCannotBeSuppressedByAStaleVisibleActivity() {
        assertTrue(RearLyricsPolicy.shouldAttempt(true, true, false, true, true, false, 100, 0, true));
        assertFalse(RearLyricsPolicy.shouldAttempt(true, true, false, true, true, false, 100, 0, false));
    }
    @Test public void lockRecoveryStillHonoursDisablePendingAndBackoff() {
        assertFalse(RearLyricsPolicy.shouldAttempt(false, true, false, true, true, false, 100, 0, true));
        assertFalse(RearLyricsPolicy.shouldAttempt(true, true, false, true, true, true, 100, 0, true));
        assertFalse(RearLyricsPolicy.shouldAttempt(true, true, false, true, true, false, 100, 200, true));
    }
    @Test public void missingStateOrRetryBackoffPreventsLaunchLoops() {
        assertFalse(RearLyricsPolicy.shouldAttempt(true, true, false, false, false, false, 100, 0));
        assertFalse(RearLyricsPolicy.shouldAttempt(true, true, false, true, false, false, 100, 200));
        assertTrue(RearLyricsPolicy.shouldAttempt(true, true, false, true, false, false, 200, 200));
    }
    @Test public void retryIsBounded() {
        assertEquals(2000, RearLyricsPolicy.retryDelay(0));
        assertEquals(4000, RearLyricsPolicy.retryDelay(1));
        assertEquals(60000, RearLyricsPolicy.retryDelay(50));
    }
}
