package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

/**
 * Regression tests for the single-owner rear screen model (plan A).
 *
 * <p>They encode the four device scenarios the plan is judged by - a camera opened and closed
 * repeatedly, the screen locked while a track changes, playback continuing in the background,
 * and the user closing the window by hand - plus the races that produced the old faults.
 * No Android API is touched, so they run on the JVM.
 */
public class RearOccupancyTest {
    private static final String OWN = "io.github.huleixin.tingyu";
    private static final String CAMERA = "com.android.camera";

    private final RearOccupancy occupancy = new RearOccupancy(OWN);
    private final RearOccupancy.Look look = new RearOccupancy.Look();

    private RearOccupancy.Action at(boolean wanted, boolean readable, String front, boolean ownFront,
            boolean lit, long now) {
        look.set(wanted, readable, front, front == null ? -1 : 42, ownFront, lit, now);
        return occupancy.evaluate(look);
    }

    private RearOccupancy.Action camera(long now) {
        return at(true, true, CAMERA, false, true, now);
    }    private RearOccupancy.Action ours(long now) {
        return at(true, true, OWN, true, true, now);
    }

    /** The listing could not be parsed; {@code unreadableFor} is how long that has been the case. */
    private RearOccupancy.Action blind(boolean deviceBusy, long unreadableFor, long now) {
        look.set(true, false, null, -1, false, true, now, deviceBusy, unreadableFor);
        return occupancy.evaluate(look);
    }

    /** Camera arrives, then leaves and the panel is confirmed back with us. */
    private long episode(long now) {
        assertEquals(RearOccupancy.Action.YIELD, camera(now));
        assertEquals(RearOccupancy.Action.NONE, camera(now + 900));
        assertEquals(RearOccupancy.Action.NONE, ours(now + 1_800));
        assertEquals(RearOccupancy.Action.RESTORE, ours(now + 2_000));
        long attempt = occupancy.generation();
        assertTrue(occupancy.restoreFinished(true, attempt, now + 2_100));
        return now + 3_000;
    }

    @Test public void tenCameraEpisodesYieldOnceAndRestoreOnceEach() {
        long now = 10_000;
        for (int i = 0; i < 10; i++) now = episode(now);

        assertEquals(10, occupancy.episodes());
        assertEquals(10, occupancy.yields());
        assertEquals(10, occupancy.restores());
        assertEquals(RearOccupancy.Owner.TINGYU, occupancy.owner());
    }

    @Test public void aLensSwitchThatFlashesTheCameraBackDoesNotYieldTwice() {
        assertEquals(RearOccupancy.Action.YIELD, camera(1_000));
        // The camera's rear preview disappeared for a moment, then came back before two looks.
        assertEquals(RearOccupancy.Action.NONE, ours(1_500));
        assertEquals(RearOccupancy.Action.NONE, camera(2_100));
        assertEquals(1, occupancy.episodes());
        assertEquals(1, occupancy.yields());

        assertEquals(RearOccupancy.Action.NONE, ours(3_000));
        assertEquals(RearOccupancy.Action.RESTORE, ours(3_400));
    }

    @Test public void anUnreadableTaskListNeverEndsTheCameraHold() {
        assertEquals(RearOccupancy.Action.YIELD, camera(1_000));
        long generation = occupancy.generation();
        for (int i = 0; i < 6; i++) {
            assertEquals(RearOccupancy.Action.NONE, at(true, false, null, false, true, 2_000 + i * 1_000L));
        }
        assertTrue(occupancy.externalOwned());
        assertEquals(generation, occupancy.generation());
        assertEquals(1, occupancy.yields());
    }

    @Test public void aStaleRestoreResultCannotResurrectAWindowDuringANewCameraEpisode() {
        assertEquals(RearOccupancy.Action.YIELD, camera(1_000));
        assertEquals(RearOccupancy.Action.NONE, ours(1_600));
        assertEquals(RearOccupancy.Action.RESTORE, ours(2_000));
        long staleAttempt = occupancy.generation();

        // The camera comes straight back while that rebuild is still in flight.
        assertEquals(RearOccupancy.Action.YIELD, camera(2_200));
        assertFalse(occupancy.restoreFinished(true, staleAttempt, 2_300));
        assertTrue(occupancy.externalOwned());
        assertEquals(2, occupancy.episodes());
    }

    @Test public void theUserDismissalIsNeverUndoneByACameraOrABackgroundTrackChange() {
        occupancy.setDismissed(true);
        assertEquals(RearOccupancy.Action.NONE, camera(1_000));
        assertEquals(RearOccupancy.Action.NONE, ours(2_000));
        // Panel off, playback still going, a new track: still nothing.
        assertEquals(RearOccupancy.Action.NONE, at(true, true, OWN, true, false, 20_000));
        assertEquals(RearOccupancy.Action.NONE, camera(30_000));
        assertEquals(RearOccupancy.Action.NONE, ours(40_000));
        assertFalse(occupancy.externalOwned());
        assertEquals(0, occupancy.restores());
    }

    @Test public void askingForTheWindowAgainResumesNormalHandling() {
        occupancy.setDismissed(true);
        assertEquals(RearOccupancy.Action.NONE, ours(1_000));
        occupancy.setDismissed(false);
        assertEquals(RearOccupancy.Action.NONE, ours(2_000));
        assertEquals(RearOccupancy.Owner.TINGYU, occupancy.owner());
    }

    @Test public void wakesAreThrottledAndNeverSentAtALitPanel() {
        assertEquals(RearOccupancy.Action.NONE, at(true, true, OWN, true, true, 1_000));
        assertEquals(RearOccupancy.Action.WAKE, at(true, true, OWN, true, false, 2_000));
        assertEquals(RearOccupancy.Action.NONE, at(true, true, OWN, true, false, 7_000));
        assertEquals(RearOccupancy.Action.WAKE, at(true, true, OWN, true, false, 12_000));
    }

    @Test public void aRequestToWakeIsNeverSentWithoutSomethingOfOursBehindIt() {
        // Xiaomi's own launcher is in front and the panel is off: waking it would be a flicker.
        assertEquals(RearOccupancy.Action.NONE, at(true, true, "com.xiaomi.subscreencenter", false, false, 1_000));
        assertEquals(RearOccupancy.Owner.SYSTEM, occupancy.owner());
    }

    @Test public void playbackStoppingWhileACameraIsUpDoesNotClaimTheCameraLeft() {
        assertEquals(RearOccupancy.Action.YIELD, camera(1_000));
        assertEquals(RearOccupancy.Action.NONE, at(false, true, CAMERA, false, true, 2_000));
        assertTrue(occupancy.externalOwned());

        assertEquals(RearOccupancy.Action.NONE, at(false, true, OWN, true, true, 3_000));
        assertTrue(occupancy.externalOwned());
        assertEquals(RearOccupancy.Action.NONE, at(true, true, OWN, true, true, 4_000));
        assertEquals(RearOccupancy.Action.RESTORE, at(true, true, OWN, true, true, 4_400));
    }

    @Test public void aFailedRestoreBacksOffInsteadOfLaunchingInALoop() {
        assertEquals(RearOccupancy.Action.YIELD, camera(1_000));
        assertEquals(RearOccupancy.Action.NONE, ours(1_600));
        assertEquals(RearOccupancy.Action.RESTORE, ours(2_000));
        long attempt = occupancy.generation();
        assertTrue(occupancy.restoreFinished(false, attempt, 2_100));

        assertEquals(RearOccupancy.Action.NONE, ours(2_500));
        assertEquals(RearOccupancy.Action.RESTORE, ours(3_400));
        long second = occupancy.generation();
        assertTrue(occupancy.restoreFinished(true, second, 3_500));
        assertEquals(RearOccupancy.Owner.TINGYU, occupancy.owner());
        assertEquals(1, occupancy.restores());
    }

    @Test public void aWindowLostWithoutACameraIsRebuiltOnlyWhenWanted() {
        occupancy.windowLost(1_000);
        assertEquals(RearOccupancy.Action.NONE, at(false, true, "com.xiaomi.subscreencenter", false, true, 1_500));
        assertEquals(RearOccupancy.Action.RESTORE, at(true, true, "com.xiaomi.subscreencenter", false, true, 2_000));
    }

    @Test public void theCameraPackageRuleIgnoresOurOwnPackageAndTheRearHost() {
        assertTrue(occupancy.isCameraPackage("com.android.camera"));
        assertTrue(occupancy.isCameraPackage("com.miui.camera"));
        assertFalse(occupancy.isCameraPackage("com.xiaomi.subscreencenter"));
        assertFalse(occupancy.isCameraPackage(OWN));
        assertFalse(occupancy.isCameraPackage(null));
    }

    // ------------------------------------------------------------------ plan A wiring

    /**
     * One restore per camera episode. The launcher is slow (two 8 s timeouts), so a heartbeat can
     * easily land while a rebuild is still running; that look must not queue a second one.
     */
    @Test public void onlyOneRestoreIsIssuedPerCameraEpisode() {
        assertEquals(RearOccupancy.Action.YIELD, camera(1_000));
        assertEquals(RearOccupancy.Action.NONE, ours(1_600));
        assertEquals(RearOccupancy.Action.RESTORE, ours(2_000));
        long attempt = occupancy.generation();
        for (int i = 1; i <= 8; i++) {
            // 700 ms heartbeat while the launcher is still confirming the window.
            assertEquals(RearOccupancy.Action.NONE, ours(2_000 + i * 700L));
        }
        assertTrue(occupancy.restoreFinished(true, attempt, 8_000));
        assertEquals(1, occupancy.restores());
        assertEquals(RearOccupancy.Owner.TINGYU, occupancy.owner());
    }

    /** A track change is not a reason to touch the window; only ownership changes are. */
    @Test public void aFastTrackChangeNeverRebuildsTheWindow() {
        assertEquals(RearOccupancy.Action.NONE, ours(1_000));
        for (int i = 0; i < 12; i++) {
            // Lyrics stage republishing, metadata updates, a new song every 2 s: all ordinary looks.
            assertEquals(RearOccupancy.Action.NONE, ours(2_000 + i * 400L));
        }
        assertEquals(0, occupancy.episodes());
        assertEquals(0, occupancy.restores());
        assertEquals(RearOccupancy.Owner.TINGYU, occupancy.owner());
    }

    /** While a camera owns the panel, no wake may be attempted - not even for a dark screen. */
    @Test public void theCameraKeepsThePanelIncludingItsPower() {
        assertEquals(RearOccupancy.Action.YIELD, camera(1_000));
        for (int i = 0; i < 6; i++) {
            assertEquals(RearOccupancy.Action.NONE, at(true, true, CAMERA, false, false, 1_500 + i * 2_000L));
        }
        assertTrue(occupancy.externalOwned());
        assertEquals(1, occupancy.yields());
    }

    /**
     * The camera opened its rear preview but the task list cannot be read. Yielding is the safe
     * direction: the old build kept presenting over a running camera whenever the dump failed.
     */
    @Test public void aCameraHoldingTheDeviceTakesThePanelEvenWithoutAListing() {
        assertEquals(RearOccupancy.Action.YIELD, blind(true, 500, 1_000));
        assertTrue(occupancy.externalOwned());
        assertEquals(1, occupancy.episodes());
        // The device is still held: repeated blind looks change nothing.
        assertEquals(RearOccupancy.Action.NONE, blind(true, 1_500, 2_000));
        assertEquals(RearOccupancy.Action.NONE, blind(true, 9_000, 9_500));
        assertEquals(1, occupancy.yields());
    }

    /**
     * A ROM that stopped exposing its task list must not leave the panel dark until reboot, but
     * the escape is bounded and requires that no camera holds the device.
     */
    @Test public void anUnreadableListHandsThePanelBackOnlyAfterTheEscapeWindow() {
        assertEquals(RearOccupancy.Action.YIELD, camera(1_000));
        assertEquals(RearOccupancy.Action.NONE, blind(false, 6_000, 7_000));
        assertEquals(RearOccupancy.Action.NONE, blind(false, 11_000, 12_000));
        assertTrue(occupancy.externalOwned());
        assertEquals(RearOccupancy.Action.RESTORE, blind(false, 13_000, 14_000));
        long attempt = occupancy.generation();
        assertTrue(occupancy.restoreFinished(true, attempt, 14_100));
        assertEquals(RearOccupancy.Owner.TINGYU, occupancy.owner());
    }

    /** The same escape must never fire while the camera is still holding the device. */
    @Test public void anUnreadableListNeverHandsThePanelBackToALiveCamera() {
        assertEquals(RearOccupancy.Action.YIELD, camera(1_000));
        assertEquals(RearOccupancy.Action.NONE, blind(true, 60_000, 61_000));
        assertTrue(occupancy.externalOwned());
        assertEquals(0, occupancy.restores());
    }
}
