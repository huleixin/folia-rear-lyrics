package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/top/izuna/foliamajor/RearCoverPolicyTest.java
public class RearCoverPolicyTest {
    @Test public void frontProximityCannotClaimRearCover() {
        assertFalse(RearCoverPolicy.rearSensor("Front proximity sensor"));
        assertFalse(RearCoverPolicy.rearSensor("Proximity sensor"));
        assertTrue(RearCoverPolicy.rearSensor("Rear Proximity"));
        assertTrue(RearCoverPolicy.rearSensor("Back cover distance"));
    }
    @Test public void onlyStableRearDownPoseCanSleep() {
        assertTrue(RearCoverPolicy.tabletop(0, 0, 9.8f, .1f, true));
        assertFalse(RearCoverPolicy.tabletop(0, 0, 9.8f, .1f, false));
        assertFalse(RearCoverPolicy.tabletop(0, 0, -9.8f, .1f, true));
        assertFalse(RearCoverPolicy.tabletop(0, 0, 9.8f, 2f, true));
        assertFalse(RearCoverPolicy.tabletop(6, 0, 9.8f, .1f, true));
    }
    @Test public void deliberateSleepAndPowerTransitionsCannotRelaunchLyrics() {
        assertFalse(RearCoverPolicy.mayRecoverWindow(true, false));
        assertFalse(RearCoverPolicy.mayRecoverWindow(false, true));
        assertFalse(RearCoverPolicy.mayRecoverWindow(true, true));
        assertTrue(RearCoverPolicy.mayRecoverWindow(false, false));
    }
}
