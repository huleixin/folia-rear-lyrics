package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

/**
 * Regression tests for the camera handoff. These encode the two real failures:
 * the lyrics never coming back after the camera closed, and the lyrics stealing the panel
 * while the camera was opening. No Android API is touched, so they run on the JVM.
 */
public class RearHandoffStateTest {
    private final RearHandoffState.Observation input = new RearHandoffState.Observation();

    private static RearHandoffState.Observation idle() {
        RearHandoffState.Observation value = new RearHandoffState.Observation();
        value.set(true, false, false, false, true, true, false);
        return value;
    }
    private static RearHandoffState.Observation camera(boolean deviceBusy, boolean rearTask, boolean mainTask) {
        RearHandoffState.Observation value = new RearHandoffState.Observation();
        value.set(true, deviceBusy, rearTask, mainTask, true, false, false);
        return value;
    }
    /** Drives the machine to CAMERA_OWNED with everything released. */
    private static void takeOver(RearHandoffState state, long now) {
        assertEquals(RearHandoffState.Action.RELEASE, state.evaluate(camera(true, false, false), now));
        assertTrue(state.blocksPresentation());
        assertEquals(RearHandoffState.Action.NONE, state.evaluate(camera(true, false, false), now + 10));
        state.releaseFinished(true, now + 20);
    }

    @Test public void cameraTakesOverImmediatelyAndBlocksEveryRearOperation() {
        RearHandoffState state = new RearHandoffState();
        state.markActive();
        assertEquals(RearHandoffState.Action.RELEASE, state.evaluate(camera(true, false, false), 1_000));
        assertEquals(RearHandoffState.State.CAMERA_TAKEOVER, state.state());
        assertTrue(state.blocksPresentation());
        assertFalse(state.allowsWake());
        assertFalse(state.allowsLease());
        assertFalse(state.allowsSleep());
        // A second tick must not ask for a second teardown.
        assertEquals(RearHandoffState.Action.NONE, state.evaluate(camera(true, false, false), 1_020));
        assertEquals(RearHandoffState.State.RELEASING, state.state());
    }

    @Test public void rearCameraTaskAloneIsEnoughEvenWhenEveryCameraDeviceLooksFree() {
        // HyperCamera draws its rear preview before (or without) holding the camera hardware.
        RearHandoffState state = new RearHandoffState();
        assertEquals(RearHandoffState.Action.RELEASE, state.evaluate(camera(false, true, false), 500));
        assertTrue(state.blocksPresentation());
    }

    @Test public void cameraInFrontOnTheMainDisplayAloneIsEnough() {
        RearHandoffState state = new RearHandoffState();
        assertEquals(RearHandoffState.Action.RELEASE, state.evaluate(camera(false, false, true), 500));
        assertTrue(state.blocksPresentation());
    }

    @Test public void exitNeedsAConfirmationWindowBeforeRebuilding() {
        RearHandoffState state = new RearHandoffState();
        takeOver(state, 10_000);
        assertEquals(RearHandoffState.State.CAMERA_OWNED, state.state());
        // Device idle: enter WAITING_CAMERA_EXIT, still blocked, no launch.
        assertEquals(RearHandoffState.Action.NONE, state.evaluate(idle(), 11_000));
        assertEquals(RearHandoffState.State.WAITING_CAMERA_EXIT, state.state());
        assertTrue(state.blocksPresentation());
        assertEquals(RearHandoffState.Action.NONE, state.evaluate(idle(), 11_000 + RearHandoffState.EXIT_CONFIRM_MS - 1));
        // Confirmed: exactly one restore, and the state machine stops issuing launches until the
        // launcher reports back.
        assertEquals(RearHandoffState.Action.RESTORE, state.evaluate(idle(), 11_000 + RearHandoffState.EXIT_CONFIRM_MS));
        assertEquals(RearHandoffState.State.TINGYU_RESTORING, state.state());
        assertEquals(RearHandoffState.Action.NONE, state.evaluate(idle(), 11_010));
        state.restoreFinished(true, 11_020);
        assertEquals(RearHandoffState.State.TINGYU_ACTIVE, state.state());
        assertEquals(RearHandoffState.Action.NONE, state.evaluate(idle(), 11_030));
    }

    @Test public void unreadableTaskEvidenceWaitsLongerThenRebuildsWithADiagnostic() {
        RearHandoffState state = new RearHandoffState();
        takeOver(state, 0);
        RearHandoffState.Observation unreadable = new RearHandoffState.Observation();
        unreadable.set(true, false, false, false, false, false, false);
        assertEquals(RearHandoffState.Action.NONE, state.evaluate(unreadable, 100));
        assertEquals(RearHandoffState.Action.NONE, state.evaluate(unreadable, 100 + RearHandoffState.EXIT_CONFIRM_MS + 10));
        assertEquals(RearHandoffState.Action.RESTORE,
            state.evaluate(unreadable, 100 + RearHandoffState.EXIT_CONFIRM_UNVERIFIED_MS));
        assertTrue(state.reason().startsWith("exit-unverified") || state.reason().startsWith("restore-"));
    }

    @Test public void aLensSwitchGapNeverRestoresTheLyrics() {
        RearHandoffState state = new RearHandoffState();
        takeOver(state, 0);
        // Both handles closed for 300ms between the wide and the tele lens.
        assertEquals(RearHandoffState.Action.NONE, state.evaluate(idle(), 1_000));
        assertEquals(RearHandoffState.Action.NONE, state.evaluate(idle(), 1_300));
        // The next lens opens: still the same camera session, still fully blocked.
        assertEquals(RearHandoffState.Action.NONE, state.evaluate(camera(true, false, false), 1_400));
        assertEquals(RearHandoffState.State.CAMERA_OWNED, state.state());
        assertTrue(state.blocksPresentation());
        // A long idle afterwards does hand the panel back.
        assertEquals(RearHandoffState.Action.NONE, state.evaluate(idle(), 20_000));
        assertEquals(RearHandoffState.Action.RESTORE, state.evaluate(idle(), 20_000 + RearHandoffState.EXIT_CONFIRM_MS));
    }

    @Test public void cameraReturningDuringTheRebuildCancelsItAndReleasesAgain() {
        RearHandoffState state = new RearHandoffState();
        takeOver(state, 0);
        state.evaluate(idle(), 1_000);
        assertEquals(RearHandoffState.Action.RESTORE, state.evaluate(idle(), 1_000 + RearHandoffState.EXIT_CONFIRM_MS));
        long generation = state.generation();
        assertEquals(RearHandoffState.Action.RELEASE, state.evaluate(camera(true, false, false), 2_000));
        assertEquals(RearHandoffState.State.CAMERA_TAKEOVER, state.state());
        assertEquals(generation + 1, state.generation());
        assertEquals(1, state.cancelled());
        // The late success of the cancelled launch must not claim the panel.
        state.restoreFinished(true, 2_050);
        assertFalse(state.active());
        assertTrue(state.blocksPresentation());
    }

    @Test public void aFailedRebuildBacksOffInsteadOfGivingUpOrHammering() {
        RearHandoffState state = new RearHandoffState();
        takeOver(state, 0);
        state.evaluate(idle(), 1_000);
        assertEquals(RearHandoffState.Action.RESTORE, state.evaluate(idle(), 1_000 + RearHandoffState.EXIT_CONFIRM_MS));
        long failedAt = 1_000 + RearHandoffState.EXIT_CONFIRM_MS + 500;
        state.restoreFinished(false, failedAt);
        assertEquals(RearHandoffState.State.RESTORE_PENDING, state.state());
        assertEquals(RearHandoffState.Action.NONE, state.evaluate(idle(), failedAt + 100));
        assertEquals(RearHandoffState.Action.RESTORE,
            state.evaluate(idle(), failedAt + RearHandoffState.backoff(1)));
        // Repeated failures fall back to a slow retry, and never to "stopped forever".
        for (int attempt = 2; attempt <= 8; attempt++) {
            long now = failedAt + attempt * 30_000L;
            state.restoreFinished(false, now);
            assertEquals(RearHandoffState.State.RESTORE_PENDING, state.state());
            assertEquals(RearHandoffState.Action.RESTORE, state.evaluate(idle(), now + RearHandoffState.RESTORE_SLOW_RETRY_MS));
        }
    }

    @Test public void aStalledReleaseIsRetriedThenAbandonedWithADiagnostic() {
        RearHandoffState state = new RearHandoffState();
        assertEquals(RearHandoffState.Action.RELEASE, state.evaluate(camera(true, false, false), 0));
        assertEquals(RearHandoffState.Action.NONE, state.evaluate(camera(true, false, false), 1));
        // The release never reports back: the pending guard keeps presentation blocked, but the
        // machine must never park here forever.
        assertEquals(RearHandoffState.Action.RELEASE,
            state.evaluate(camera(true, false, false), RearHandoffState.RELEASE_TIMEOUT_MS + 2));
        long now = RearHandoffState.RELEASE_TIMEOUT_MS * RearHandoffState.MAX_RELEASE_ATTEMPTS + 10;
        state.evaluate(camera(true, false, false), now);
        for (int attempt = 0; attempt <= RearHandoffState.MAX_RELEASE_ATTEMPTS; attempt++)
            state.evaluate(camera(true, false, false), now + attempt * RearHandoffState.RELEASE_TIMEOUT_MS);
        assertEquals(1, state.releaseFailures());
        assertTrue(state.blocksPresentation());   // the camera still owns the panel
        // Once the camera leaves, the handoff still completes.
        assertEquals(RearHandoffState.Action.NONE, state.evaluate(idle(), 100_000));
        assertEquals(RearHandoffState.Action.RESTORE, state.evaluate(idle(), 100_000 + RearHandoffState.EXIT_CONFIRM_MS));
    }

    @Test public void turningTheFeatureOffDuringACameraHoldNeverAutoRestarts() {
        RearHandoffState state = new RearHandoffState();
        takeOver(state, 0);
        RearHandoffState.Observation off = new RearHandoffState.Observation();
        off.set(false, true, false, false, true, false, false);
        assertEquals(RearHandoffState.Action.NONE, state.evaluate(off, 100));
        assertEquals(RearHandoffState.State.SYSTEM_OWNED, state.state());
        // The camera leaves while the feature is off: no restore, ever.
        RearHandoffState.Observation offIdle = new RearHandoffState.Observation();
        offIdle.set(false, false, false, false, true, false, false);
        for (long now = 200; now < 60_000; now += 1_000)
            assertEquals(RearHandoffState.Action.NONE, state.evaluate(offIdle, now));
        assertEquals(RearHandoffState.State.SYSTEM_OWNED, state.state());
        assertEquals(0, state.restores());
    }

    @Test public void everyTakeoverStartsANewEpisode() {
        RearHandoffState state = new RearHandoffState();
        takeOver(state, 0);
        long first = state.episode();
        state.evaluate(idle(), 1_000);
        state.evaluate(idle(), 1_000 + RearHandoffState.EXIT_CONFIRM_MS);
        state.restoreFinished(true, 5_000);
        takeOver(state, 10_000);
        assertEquals(first + 1, state.episode());
    }

    @Test public void anInFlightLaunchIsNeverDuplicated() {
        RearHandoffState state = new RearHandoffState();
        takeOver(state, 0);
        state.evaluate(idle(), 1_000);
        RearHandoffState.Observation launching = new RearHandoffState.Observation();
        launching.set(true, false, false, false, true, false, true); // restore already in flight
        assertEquals(RearHandoffState.Action.NONE,
            state.evaluate(launching, 1_000 + RearHandoffState.EXIT_CONFIRM_MS));
        assertEquals(RearHandoffState.State.RESTORE_PENDING, state.state());
    }

    @Test public void enableWhileTheCameraIsOpenNeverStealsThePanel() {
        RearHandoffState state = new RearHandoffState();
        RearHandoffState.Observation off = new RearHandoffState.Observation();
        off.set(false, false, false, false, true, false, false);
        assertEquals(RearHandoffState.Action.NONE, state.evaluate(off, 0));
        // enable() turns "wanted" on while the camera is already using the panel.
        assertEquals(RearHandoffState.Action.RELEASE, state.evaluate(camera(true, false, false), 100));
        assertTrue(state.blocksPresentation());
        assertFalse(state.allowsWake());
    }

    @Test public void observationNeverTreatsAnUnreadableListAsProofOfAFreePanel() {
        input.set(true, false, false, false, false, false, false);
        assertFalse(input.camera());
        // ...but an unreadable list is also not proof that a camera is there: only the device and
        // the tasks that were actually read can suspend us.
        input.set(true, true, false, false, true, false, false);
        assertTrue(input.camera());
    }
}
