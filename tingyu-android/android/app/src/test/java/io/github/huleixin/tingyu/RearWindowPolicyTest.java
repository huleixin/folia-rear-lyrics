package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

/**
 * The two window rules plan A depends on: a camera never destroys the window, and an existing
 * window is preferred over a new task - including behind the keyguard, where HyperOS refuses a
 * fresh third-party rear launch but still lets its owner bring the task back.
 */
public class RearWindowPolicyTest {
    @Test public void aCameraArrivalNeverFinishesTheWindowInPlanA() {
        assertFalse(RearWindowPolicy.mayFinishForCamera(true));
        // The legacy engine keeps its behaviour so a rollback is a real rollback.
        assertTrue(RearWindowPolicy.mayFinishForCamera(false));
    }

    @Test public void anAttachedWindowIsReusedEvenWhileLocked() {
        assertTrue(RearWindowPolicy.mayReuseWindow(true, true, false, false, true));
        assertTrue(RearWindowPolicy.mayReuseWindow(true, false, false, false, true));
    }

    @Test public void withoutAWindowThereIsNothingToReuse() {
        assertFalse(RearWindowPolicy.mayReuseWindow(false, false, false, false, true));
        assertFalse(RearWindowPolicy.mayReuseWindow(false, true, true, true, true));
    }

    @Test public void legacyStillRefusesReuseWhileLockedWithoutLsp() {
        assertFalse(RearWindowPolicy.mayReuseWindow(true, true, false, false, false));
        assertTrue(RearWindowPolicy.mayReuseWindow(true, true, true, false, false));
        assertTrue(RearWindowPolicy.mayReuseWindow(true, true, false, true, false));
    }

    @Test public void theCameraHeartbeatStaysFastWhileAHandoffSettles() {
        assertEquals(700L, RearWindowPolicy.cameraBeatMs(true, true));
        assertEquals(3_000L, RearWindowPolicy.cameraBeatMs(false, true));
        assertEquals(1_000L, RearWindowPolicy.cameraBeatMs(false, false));
    }
}
