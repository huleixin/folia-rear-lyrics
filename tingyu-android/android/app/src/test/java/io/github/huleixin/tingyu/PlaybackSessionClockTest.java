package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/PlaybackSessionClockTest.java
public class PlaybackSessionClockTest {
    @Test public void nativePauseFreezesProgressEvenWhenTheWebViewStillSaysPlaying() {
        PlaybackSessionClock clock = PlaybackSessionClock.resolve(true, 97000, new long[]{87000, 0});
        assertFalse(clock.playing); assertEquals(87000, clock.position);
        assertEquals(87000, PlaybackPositionClock.at(clock.playing, clock.position, 1000, 61000, 285000));
    }
    @Test public void nativeResumeOverridesAPausedWebViewAndReanchorsProgress() {
        PlaybackSessionClock clock = PlaybackSessionClock.resolve(false, 80000, new long[]{87000, 1});
        assertTrue(clock.playing);
        assertEquals(88000, PlaybackPositionClock.at(clock.playing, clock.position, 1000, 2000, 285000));
    }
    @Test public void delayedWebUpdatesCannotUndoANativeSeekWhilePaused() {
        PlaybackSessionClock clock = PlaybackSessionClock.resolve(true, 87000, new long[]{120000, 0});
        assertEquals(120000, PlaybackPositionClock.at(clock.playing, clock.position, 2000, 6000, 285000));
    }
    @Test public void compatibilityPlaybackKeepsItsOwnClockWithoutANativeOwner() {
        PlaybackSessionClock playing = PlaybackSessionClock.resolve(true, 5000, null);
        assertTrue(playing.playing); assertEquals(6000, PlaybackPositionClock.at(true, playing.position, 1000, 2000, 10000));
        PlaybackSessionClock paused = PlaybackSessionClock.resolve(false, -1, null);
        assertFalse(paused.playing); assertEquals(0, paused.position);
    }
    @Test public void pauseAndResumeAlwaysPublishEvenWithNoPositionChange() {
        PlaybackSessionClock paused = PlaybackSessionClock.resolve(true, 87000, new long[]{87000, 0});
        assertTrue(paused.shouldPublish(true, 87000, false));
        PlaybackSessionClock playing = PlaybackSessionClock.resolve(false, 87000, new long[]{87000, 1});
        assertTrue(playing.shouldPublish(false, 87000, false));
    }
    @Test public void repeatedStateCallbacksDoNotRebuildTheSameSystemPublication() {
        PlaybackSessionClock paused = PlaybackSessionClock.resolve(true, 87000, new long[]{87000, 0});
        assertFalse(paused.shouldPublish(false, 87000, false));
        PlaybackSessionClock playing = PlaybackSessionClock.resolve(false, 87000, new long[]{88000, 1});
        assertFalse(playing.shouldPublish(true, 87995, false));
    }
    @Test public void explicitSmallSeeksAreNeverLostToStateDeduplication() {
        PlaybackSessionClock clock = PlaybackSessionClock.resolve(false, 87000, new long[]{87005, 0});
        assertTrue(clock.shouldPublish(false, 87000, true));
    }
    @Test public void decoderDiscontinuitiesCorrectTheSystemClockWithoutAStateChange() {
        PlaybackSessionClock clock = PlaybackSessionClock.resolve(true, 87000, new long[]{90000, 1});
        assertTrue(clock.shouldPublish(true, 87000, false));
    }
}
