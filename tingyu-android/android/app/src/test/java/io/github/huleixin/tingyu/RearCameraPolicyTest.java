package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/RearCameraPolicyTest.java
public class RearCameraPolicyTest {
    @Test public void waitsForInitialAvailabilityBeforeLaunchingALyricWindow() {
        RearCameraPolicy policy = new RearCameraPolicy();
        assertFalse(policy.blocked(0)); policy.start(0);
        assertTrue(policy.blocked(899)); assertFalse(policy.blocked(900));
    }
    @Test public void cameraAlreadyOpenAtRegistrationBlocksUntilItCloses() {
        RearCameraPolicy policy = new RearCameraPolicy(); policy.start(0);
        policy.available("back", false, 1);
        assertTrue(policy.blocked(60000));
        policy.available("back", true, 60001);
        assertTrue(policy.blocked(60900)); assertFalse(policy.blocked(60901));
    }
    @Test public void switchingLensesDoesNotTemporarilyReopenTheRearTask() {
        RearCameraPolicy policy = new RearCameraPolicy(); policy.start(0);
        policy.available("wide", false, 1000); policy.available("wide", true, 2000);
        assertTrue(policy.blocked(2200));
        policy.available("tele", false, 2250);
        assertTrue(policy.blocked(10000));
        policy.available("tele", true, 10100);
        assertFalse(policy.blocked(11000));
    }
    @Test public void concurrentCamerasMustBothBeReleased() {
        RearCameraPolicy policy = new RearCameraPolicy(); policy.start(0);
        policy.available("0", false, 1000); policy.available("1", false, 1000);
        policy.available("0", true, 2000); policy.available("0", true, 2500);
        assertEquals(1, policy.busyCount()); assertTrue(policy.blocked(10000));
        policy.available("1", true, 11000); assertFalse(policy.blocked(11900));
    }
    @Test public void disablingDropsLateCallbacksAndReenableRechecksTheCamera() {
        RearCameraPolicy policy = new RearCameraPolicy(); policy.start(0);
        policy.available("0", false, 1000); policy.stop(); policy.available("0", false, 2000);
        assertFalse(policy.blocked(2000)); assertEquals(0, policy.busyCount());
        policy.start(3000); assertTrue(policy.blocked(3000)); assertFalse(policy.blocked(3900));
    }
    @Test public void duplicateIdleEventsDoNotPostponeResume() {
        RearCameraPolicy policy = new RearCameraPolicy(); policy.start(0);
        policy.available("0", true, 800); assertFalse(policy.blocked(900));
        assertEquals(0, policy.remaining(900));
    }
}
