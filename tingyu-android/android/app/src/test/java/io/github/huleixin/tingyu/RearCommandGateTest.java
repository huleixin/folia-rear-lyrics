package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

/**
 * "The two engines never issue commands together", as an executable statement.
 *
 * <p>Both controllers are compiled into the same APK; the switch picks one. The gate is the only
 * thing standing between a rollback and a build where the old handoff engine and plan A both
 * answer the same camera edge - which is how a camera exit used to be restored twice, the second
 * restore rebuilding the window the first had just reused.
 */
public class RearCommandGateTest {
    private static final long NOW = 5_000L;

    @Test public void onlyTheInstalledEngineMayIssueACommand() {
        RearCommandGate gate = new RearCommandGate();
        gate.install(RearCommandGate.Source.PLAN_A);

        assertTrue(gate.submit(RearCommandGate.Source.PLAN_A, RearCommandGate.YIELD, NOW));
        assertFalse(gate.submit(RearCommandGate.Source.LEGACY, RearCommandGate.CLOSE, NOW));
        assertFalse(gate.submit(RearCommandGate.Source.LEGACY, RearCommandGate.RESTORE, NOW + 1));

        assertEquals(1, gate.issued());
        assertEquals(2, gate.refused());
        assertEquals(RearCommandGate.YIELD, gate.last());
    }

    @Test public void aRollbackStopsTheNewEngineInTheSameInstant() {
        RearCommandGate gate = new RearCommandGate();
        gate.install(RearCommandGate.Source.PLAN_A);
        assertTrue(gate.submit(RearCommandGate.Source.PLAN_A, RearCommandGate.RESTORE, NOW));

        gate.install(RearCommandGate.Source.LEGACY);
        assertFalse(gate.submit(RearCommandGate.Source.PLAN_A, RearCommandGate.RESTORE, NOW + 10));
        assertTrue(gate.submit(RearCommandGate.Source.LEGACY, RearCommandGate.RESTORE, NOW + 10));
        assertEquals(2, gate.issued());
    }

    @Test public void theDefaultOwnerIsTheLegacyEngine() {
        // A build that never installed anything must behave exactly like the previous release.
        RearCommandGate gate = new RearCommandGate();
        assertEquals(RearCommandGate.Source.LEGACY, gate.owner());
        assertTrue(gate.submit(RearCommandGate.Source.LEGACY, RearCommandGate.WAKE, NOW));
    }

    @Test public void reinstallingTheSameEngineIsIdempotent() {
        RearCommandGate gate = new RearCommandGate();
        gate.install(RearCommandGate.Source.PLAN_A);
        gate.install(RearCommandGate.Source.PLAN_A);
        assertTrue(gate.submit(RearCommandGate.Source.PLAN_A, RearCommandGate.YIELD, NOW));
        assertTrue(gate.describe(NOW).contains("engine=PLAN_A"));
        assertTrue(gate.describe(NOW).contains("refused=0"));
    }
}
