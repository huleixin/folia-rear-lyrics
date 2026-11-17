package io.github.huleixin.tingyu.playback;

import static org.junit.Assert.*;

import java.util.List;
import org.junit.Test;

public final class NativeListeningTrackerTest {

    private static NativeListeningTracker.TrackMeta track(String key, long durationMs) {
        return new NativeListeningTracker.TrackMeta(key, "netease", key, "Song " + key, "Artist", "Album", "", durationMs);
    }

    @Test
    public void accumulatesOnlyPlayingTimeAndIgnoresPauseAndSeeks() {
        NativeListeningTracker tracker = new NativeListeningTracker();
        long wall = 1_000_000L;
        long elapsed = 10_000L;
        tracker.onTrackOrPlayState(true, elapsed, wall, track("s1", 180_000L));

        // 20 seconds of real playback (4 ticks of 5s)
        for (int i = 0; i < 4; i++) {
            elapsed += 5_000L;
            wall += 5_000L;
            tracker.onTick(true, elapsed, wall);
        }

        // Pause for 60 seconds — must NOT count!
        tracker.onTrackOrPlayState(false, elapsed, wall, track("s1", 180_000L));
        elapsed += 60_000L;
        wall += 60_000L;
        tracker.onTick(false, elapsed, wall);
        assertNull("20s is below 30s threshold even after 60s pause", tracker.peekActive(false, elapsed, wall));

        // Resume and play 15 more seconds -> total 35s >= 30s
        tracker.onTrackOrPlayState(true, elapsed, wall, track("s1", 180_000L));
        for (int i = 0; i < 3; i++) {
            elapsed += 5_000L;
            wall += 5_000L;
            tracker.onTick(true, elapsed, wall);
        }
        NativeListeningTracker.SessionSnapshot active = tracker.peekActive(true, elapsed, wall);
        assertNotNull(active);
        assertEquals(35.0, active.seconds, 0.01);

        // Transition to next track finalizes s1 into pending
        tracker.onTrackOrPlayState(true, elapsed, wall, track("s2", 180_000L));
        List<NativeListeningTracker.SessionSnapshot> drained = tracker.drainPending();
        assertEquals(1, drained.size());
        assertEquals("s1", drained.get(0).meta.songKey);
        assertEquals(35.0, drained.get(0).seconds, 0.01);
        assertEquals(active.id, drained.get(0).id);
    }

    @Test
    public void skipsBelowThirtySecondsAreNeverRecorded() {
        NativeListeningTracker tracker = new NativeListeningTracker();
        tracker.onTrackOrPlayState(true, 0L, 1_000L, track("short", 180_000L));
        tracker.onTick(true, 4_000L, 5_000L);
        tracker.onTick(true, 8_000L, 9_000L);
        tracker.onEndedOrStopped(10_000L, 11_000L);
        assertTrue(tracker.drainPending().isEmpty());
    }
}
