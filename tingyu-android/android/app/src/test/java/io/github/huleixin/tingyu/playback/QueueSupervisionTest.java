package io.github.huleixin.tingyu.playback;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/QueueSupervisionTest.java
/**
 * Regression cover for the "background playback stops after a while" state machine.
 *
 * The device symptom was always the same - playback stops at a track boundary with the playlist
 * still full - and it was never a single bug: the window could drain, the refill request could be
 * dropped, and nothing distinguished "the playlist ended" from "the window ended". These tests
 * pin the decisions that difference depends on.
 */
public class QueueSupervisionTest {

    private static QueueSupervision running(long generation) {
        QueueSupervision supervision = new QueueSupervision();
        supervision.continuation(true, generation);
        return supervision;
    }

    @Test
    public void asksOnceAtLowWaterInsteadOfOnEveryCallback() {
        QueueSupervision supervision = running(1);
        assertEquals(QueueSupervision.Action.NONE, supervision.evaluate("a", 2, false, false, 0));
        assertEquals(QueueSupervision.Action.REQUEST, supervision.evaluate("a", 1, false, false, 500));
        // Same track, same water mark: the first answer may still be in flight.
        assertEquals(QueueSupervision.Action.NONE, supervision.evaluate("a", 1, false, false, 900));
        // Draining further is new information.
        assertEquals(QueueSupervision.Action.REQUEST, supervision.evaluate("a", 0, false, false, 1200));
        assertEquals(QueueSupervision.Action.NONE, supervision.evaluate("a", 0, false, false, 1500));
    }

    @Test
    public void asksAgainForEveryNewTrack() {
        QueueSupervision supervision = running(1);
        assertEquals(QueueSupervision.Action.REQUEST, supervision.evaluate("a", 0, false, false, 0));
        assertEquals(QueueSupervision.Action.REQUEST, supervision.evaluate("b", 0, false, false, 10));
    }

    @Test
    public void neverAsksWhileTheUserWantsSilence() {
        QueueSupervision supervision = running(1);
        assertEquals(QueueSupervision.Action.NONE, supervision.evaluate("a", 0, false, true, 0));
        assertEquals(QueueSupervision.Action.NONE, supervision.evaluate("a", 0, true, true, 0));
        assertFalse(supervision.waiting());
    }

    @Test
    public void aFinishedPlaylistIsNotAWaitingEpisode() {
        QueueSupervision supervision = running(1);
        supervision.continuation(false, 2);
        assertEquals(QueueSupervision.Action.NONE, supervision.evaluate("a", 0, true, false, 0));
        assertFalse(supervision.waiting());
    }

    @Test
    public void aDrainedWindowHoldsTheSessionOpenAndRetriesOnSchedule() {
        QueueSupervision supervision = running(1);
        assertEquals(QueueSupervision.Action.WAIT, supervision.evaluate("a", 0, true, false, 0));
        assertTrue(supervision.waiting());
        assertEquals(QueueSupervision.Action.NONE, supervision.evaluate("a", 0, true, false, 3_000));
        assertEquals(QueueSupervision.Action.RETRY, supervision.evaluate("a", 0, true, false, 4_000));
        assertEquals(QueueSupervision.Action.NONE, supervision.evaluate("a", 0, true, false, 8_000));
        assertEquals(QueueSupervision.Action.RETRY, supervision.evaluate("a", 0, true, false, 14_000));
    }

    @Test
    public void theRetryBudgetIsBounded() {
        QueueSupervision supervision = running(1);
        long now = 0;
        assertEquals(QueueSupervision.Action.WAIT, supervision.evaluate("a", 0, true, false, now));
        int retries = 0;
        for (int i = 0; i < 40; i++) {
            now += 300_000;
            if (supervision.evaluate("a", 0, true, false, now) == QueueSupervision.Action.RETRY) retries++;
        }
        assertEquals(QueueSupervision.retryBudget(), retries);
        assertEquals(-1L, supervision.retryDelay(now));
    }

    @Test
    public void aLandedWindowEndsTheWaitingEpisode() {
        QueueSupervision supervision = running(1);
        supervision.evaluate("a", 0, true, false, 0);
        assertTrue(supervision.waiting());
        supervision.satisfied();
        assertFalse(supervision.waiting());
        // The same drained boundary afterwards is a new episode, not a silent continuation.
        assertEquals(QueueSupervision.Action.WAIT, supervision.evaluate("b", 0, true, false, 1_000));
    }

    @Test
    public void anOldWindowCannotDeclareNewMusicButCanEndTheList() {
        QueueSupervision supervision = running(5);
        supervision.continuation(false, 6);
        assertFalse(supervision.continues());
        // A late window from the previous episode must not resurrect continuation.
        supervision.continuation(true, 4);
        assertFalse(supervision.continues());
        // A newer window may.
        supervision.continuation(true, 7);
        assertTrue(supervision.continues());
        assertNotEquals(0L, supervision.generation());
    }

    @Test
    public void pausingDuringAWaitStopsTheSchedule() {
        QueueSupervision supervision = running(1);
        supervision.evaluate("a", 0, true, false, 0);
        assertEquals(QueueSupervision.Action.NONE, supervision.evaluate("a", 0, true, true, 5_000));
        assertFalse(supervision.waiting());
        assertEquals(-1L, supervision.retryDelay(5_000));
    }

    /**
     * A window that resolved nothing (every candidate failed) is an answer, not a refill: the
     * session must stay waiting and immediately owe another attempt, or a temporary provider
     * outage would silently consume the whole retry budget.
     */
    @Test
    public void anEmptyWindowKeepsTheSessionWaitingAndOwesAnotherAttempt() {
        QueueSupervision supervision = running(1);
        assertEquals(QueueSupervision.Action.WAIT, supervision.evaluate("a", 0, true, false, 0));
        supervision.rearm(10_000);
        assertTrue(supervision.waiting());
        assertEquals(0L, supervision.retryDelay(10_000));
        assertEquals(QueueSupervision.Action.RETRY, supervision.evaluate("a", 0, true, false, 10_000));
    }

    @Test
    public void rearmCannotResurrectAFinishedPlaylist() {
        QueueSupervision supervision = running(1);
        supervision.continuation(false, 2);
        supervision.rearm(0);
        assertFalse(supervision.waiting());
    }
}
