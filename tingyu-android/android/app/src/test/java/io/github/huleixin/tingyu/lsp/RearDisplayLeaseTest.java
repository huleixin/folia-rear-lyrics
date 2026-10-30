package io.github.huleixin.tingyu.lsp;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/lsp/RearDisplayLeaseTest.java
public class RearDisplayLeaseTest {
    @Test public void neverKeepsTheMainOrAnotherDisplayBright() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        assertFalse(lease.holds(0, 1)); assertFalse(lease.holds(1, 1)); assertTrue(lease.holds(2, 1));
    }
    @Test(expected = IllegalArgumentException.class) public void refusesMainDisplayAcquisition() {
        new RearDisplayLease().acquire(0, "session", 0);
    }
    @Test public void renewalsExtendTheDeadlineWithoutAWakeLoop() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        lease.acquire(2, "session", 20000);
        assertTrue(lease.holds(2, 60000)); assertEquals(-1, lease.expire(60000));
        assertEquals(2, lease.expire(80000)); assertFalse(lease.holds(2, 80000));
    }
    @Test public void aStalledOrCrashedClientReturnsControlToTheSystem() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        assertTrue(lease.holds(2, 59999)); assertFalse(lease.holds(2, 60000));
        assertEquals(2, lease.expire(60000)); assertEquals(-1, lease.clear());
        lease.acquire(2, "resumed", 90000); assertEquals(2, lease.clear());
        assertFalse(lease.holds(2, 90001));
    }
    @Test public void stalePauseCleanupCannotReleaseAResumedSession() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "old", 0); lease.acquire(2, "new", 30000);
        assertFalse(lease.release(2, "old")); assertTrue(lease.holds(2, 30001));
        assertTrue(lease.release(2, "new")); assertFalse(lease.holds(2, 30001));
    }
    @Test public void changingRearDisplayDoesNotKeepTheOldOneLeased() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        assertEquals(2, lease.acquire(3, "session", 1000));
        assertFalse(lease.holds(2, 1001)); assertTrue(lease.holds(3, 1001));
    }
    @Test public void onlyTheLeasedRearLyricsWindowCanStayAwakeWhileLocked() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        assertTrue(lease.holdsWindow(2, RearBridgeContract.PACKAGE, RearBridgeContract.ACTIVITY, true, 1));
        assertFalse(lease.holdsWindow(0, RearBridgeContract.PACKAGE, RearBridgeContract.ACTIVITY, true, 1));
        assertFalse(lease.holdsWindow(3, RearBridgeContract.PACKAGE, RearBridgeContract.ACTIVITY, true, 1));
        assertFalse(lease.holdsWindow(2, RearBridgeContract.PACKAGE, RearBridgeContract.PACKAGE + ".MainActivity", true, 1));
        assertFalse(lease.holdsWindow(2, RearBridgeContract.PACKAGE, RearBridgeContract.ACTIVITY, true, 60000));
        lease.release(2, "session");
        assertFalse(lease.holdsWindow(2, RearBridgeContract.PACKAGE, RearBridgeContract.ACTIVITY, true, 2));
    }

    // --- lock-screen behaviour: locking the main display pushes the keyguard on top of the
    // rear display. The lease must survive that, or "keep the system rear-sleep setting on and
    // still show lyrics" is impossible by construction.

    @Test public void keyguardOnTopDoesNotReleaseTheRearPanel() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        assertTrue(lease.holdsWindow(2, "com.android.systemui", "com.android.systemui.keyguard.KeyguardViewMediator", true, 1000));
    }
    @Test public void aodLayerOnTopAlsoKeepsThePanel() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        assertTrue(lease.holdsWindow(2, "com.miui.aod", "com.miui.aod.AodView", true, 1000));
    }
    @Test public void aCameraOnTheRearDisplayAlwaysWins() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        assertFalse(lease.holdsWindow(2, "com.android.camera", "com.android.camera.Camera", true, 1000));
        assertFalse(lease.holdsWindow(2, "com.xiaomi.camera", "com.xiaomi.camera.Camera", false, 1000));
    }
    @Test public void aThirdPartyAppOnTopTakesThePanel() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        assertFalse(lease.holdsWindow(2, "com.example.notes", "com.example.notes.Main", true, 1000));
    }
    @Test public void unreadableWindowListStaysConservativeBehindASystemLayer() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        // Reflection could not enumerate windows: keep the panel behind the keyguard...
        assertTrue(lease.holdsWindow(2, "com.android.systemui", "Keyguard", null, 1000));
        // ...but never in front of a camera or an unknown third-party app.
        assertFalse(lease.holdsWindow(2, "com.android.camera", "Camera", null, 1000));
        assertFalse(lease.holdsWindow(2, "com.example.notes", "Main", null, 1000));
    }
    @Test public void keyguardWithoutOurWindowLetsThePanelSleep() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        // Our process died and the window manager removed the window: the lease alone must
        // not keep the panel awake.
        assertFalse(lease.holdsWindow(2, "com.android.systemui", "Keyguard", false, 1000));
    }
    @Test public void ourActivityOnTopAlwaysHolds() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        assertTrue(lease.holdsWindow(2, RearBridgeContract.PACKAGE, RearBridgeContract.ACTIVITY, false, 1000));
    }
    @Test public void windowRenewalCarriesTheLeaseThroughAClientFreeze() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        assertTrue(lease.holds(2, RearDisplayLease.TIMEOUT_MS - 1));
        // The client is frozen, so no acquire() arrives. At 45s the lease is half a timeout
        // from lapsing; the window-based renewal must extend it past a 90s freeze.
        assertTrue(lease.renewForWindow(2, 45_000));
        assertTrue("lease must survive a frozen client", lease.holds(2, 90_000));
    }
    @Test public void renewalIsNotPerformedWhileTheLeaseIsStillFresh() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        assertFalse(lease.renewForWindow(2, 1_000));
        assertEquals(0, lease.windowRenewals());
    }
    @Test public void renewalIsAbsolutelyCapped() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        long now = 0;
        for (int i = 0; i < RearDisplayLease.MAX_WINDOW_RENEWALS; i++) {
            now += RearDisplayLease.TIMEOUT_MS;
            assertTrue("renewal " + i, lease.renewForWindow(2, now));
            assertTrue(lease.holds(2, now + 1));
        }
        now += RearDisplayLease.TIMEOUT_MS;
        assertFalse("capped after " + RearDisplayLease.MAX_WINDOW_RENEWALS + " renewals", lease.renewForWindow(2, now));
        assertFalse(lease.holds(2, now));
    }
    @Test public void aDifferentDisplayIsNeverCoveredByTheLease() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        assertFalse(lease.holdsWindow(3, "com.android.systemui", "Keyguard", true, 1000));
        assertFalse(lease.renewForWindow(3, 45_000));
    }
}
