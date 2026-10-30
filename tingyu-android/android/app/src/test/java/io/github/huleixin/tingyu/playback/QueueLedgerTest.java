package io.github.huleixin.tingyu.playback;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/QueueLedgerTest.java
/** The anchor rules of a queue window, without a device. */
public class QueueLedgerTest {

    private static final List<String> NATIVE = Arrays.asList("a", "b", "c");

    @Test
    public void aWindowAnchoredOnTheCurrentItemIsUsedWhole() {
        QueueLedger.Plan plan = QueueLedger.reconcile(NATIVE, 1, "b", Arrays.asList("c", "d", "e"));
        assertTrue(plan.accepted);
        assertEquals(QueueLedger.Reason.OK, plan.reason);
        assertEquals(0, plan.trim);
        assertEquals(3, plan.acceptedCount(3));
    }

    @Test
    public void aWindowComputedFromAStaleUiAnchorDropsTheHistoryItContains() {
        // The UI still thinks "a" plays while Media3 already moved on to "b": "b" is history and
        // must never be replayed.
        QueueLedger.Plan plan = QueueLedger.reconcile(NATIVE, 1, "a", Arrays.asList("b", "c", "d"));
        assertTrue(plan.accepted);
        assertEquals(QueueLedger.Reason.TRIMMED, plan.reason);
        assertEquals(1, plan.trim);
        assertEquals(2, plan.acceptedCount(3));
    }

    @Test
    public void aWindowThatContainsNeitherAnchorNorCurrentItemIsRefused() {
        QueueLedger.Plan plan = QueueLedger.reconcile(NATIVE, 1, "z", Arrays.asList("d", "e"));
        assertFalse(plan.accepted);
        assertEquals(QueueLedger.Reason.STALE_ANCHOR, plan.reason);
        assertEquals(0, plan.acceptedCount(2));
    }

    @Test
    public void aStaleAnchorIsNotRescuedByTheCurrentItemBeingAbsentFromTheWindow() {
        // "b" is playing, the caller offered the tracks after "d": applying that would skip c.
        assertFalse(QueueLedger.reconcile(NATIVE, 1, "d", Arrays.asList("e", "f")).accepted);
    }

    @Test
    public void anEmptyWindowIsAnAnswerNotARefusal() {
        QueueLedger.Plan plan = QueueLedger.reconcile(NATIVE, 1, "b", new ArrayList<>());
        assertTrue(plan.accepted);
        assertEquals(QueueLedger.Reason.EMPTY, plan.reason);
        assertEquals(0, plan.acceptedCount(0));
    }

    @Test
    public void anEmptyNativePlaylistCannotClaimHistory() {
        QueueLedger.Plan plan = QueueLedger.reconcile(new ArrayList<>(), -1, "a", Arrays.asList("a", "b"));
        // Nothing has played yet, so nothing may be dropped.
        assertTrue(plan.accepted);
        assertEquals(0, plan.trim);
    }
}
