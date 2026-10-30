package io.github.huleixin.tingyu;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Rear-screen ownership rules: the camera always wins, and no state skips the camera. */
public class RearOwnershipStateTest {

    private static RearOwnershipState.State resolve(boolean camera, boolean releasing, boolean dim,
            boolean occluded, boolean covered, boolean ours) {
        return RearOwnershipState.resolve(camera, releasing, dim, occluded, covered, ours);
    }

    @Test
    public void systemOwned_whenNothingHoldsTheScreen() {
        assertEquals(RearOwnershipState.State.SYSTEM_OWNED, resolve(false, false, false, false, false, false));
    }

    @Test
    public void active_whenOurWindowShows() {
        assertEquals(RearOwnershipState.State.TINGYU_ACTIVE, resolve(false, false, false, false, false, true));
    }

    @Test
    public void cameraBeatsEveryOtherState() {
        for (boolean releasing : new boolean[] {false, true}) {
            for (boolean dim : new boolean[] {false, true}) {
                for (boolean occluded : new boolean[] {false, true}) {
                    assertEquals(RearOwnershipState.State.CAMERA_OWNED,
                        resolve(true, releasing, dim, occluded, true, true));
                }
            }
        }
    }

    @Test
    public void releasing_beatsDimAndCover_butNotCamera() {
        assertEquals(RearOwnershipState.State.RELEASING, resolve(false, true, true, true, true, true));
    }

    @Test
    public void dimmed_beatsCover() {
        assertEquals(RearOwnershipState.State.USER_DIMMED, resolve(false, false, true, false, true, true));
    }

    @Test
    public void covered_whenAnotherTaskOccludesOrPhysicallyCovered() {
        assertEquals(RearOwnershipState.State.COVERED, resolve(false, false, false, true, false, true));
        assertEquals(RearOwnershipState.State.COVERED, resolve(false, false, false, false, true, true));
    }

    @Test
    public void cameraBlocksPresentationWakeAndLeaseRenewal() {
        assertFalse(RearOwnershipState.allowsPresentation(RearOwnershipState.State.CAMERA_OWNED));
        assertFalse(RearOwnershipState.allowsWake(RearOwnershipState.State.CAMERA_OWNED));
        assertFalse(RearOwnershipState.allowsSleep(RearOwnershipState.State.CAMERA_OWNED));
        assertFalse(RearOwnershipState.allowsLeaseRenewal(RearOwnershipState.State.CAMERA_OWNED));
        assertTrue(RearOwnershipState.allowsRelease(RearOwnershipState.State.CAMERA_OWNED));
    }

    @Test
    public void presentationSurvivesCoverAndDim_butNotReleasingOrCamera() {
        assertTrue(RearOwnershipState.allowsPresentation(RearOwnershipState.State.SYSTEM_OWNED));
        assertTrue(RearOwnershipState.allowsPresentation(RearOwnershipState.State.TINGYU_ACTIVE));
        assertTrue(RearOwnershipState.allowsPresentation(RearOwnershipState.State.COVERED));
        assertTrue(RearOwnershipState.allowsPresentation(RearOwnershipState.State.USER_DIMMED));
        assertFalse(RearOwnershipState.allowsPresentation(RearOwnershipState.State.RELEASING));
    }

    @Test
    public void sleepOnlyWhileActive() {
        assertTrue(RearOwnershipState.allowsSleep(RearOwnershipState.State.TINGYU_ACTIVE));
        assertFalse(RearOwnershipState.allowsSleep(RearOwnershipState.State.SYSTEM_OWNED));
        assertFalse(RearOwnershipState.allowsSleep(RearOwnershipState.State.USER_DIMMED));
    }
}
