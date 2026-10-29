package io.github.huleixin.tingyu.lsp;

import android.view.Display;
import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/lsp/RearDirectPowerPolicyTest.java
public class RearDirectPowerPolicyTest {
    @Test public void mainAndUnleasedDisplaysKeepTheirSystemPolicy() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "lyrics", 0);
        RearDirectPowerPolicy policy = new RearDirectPowerPolicy(lease);
        assertNull(policy.record(0, Display.STATE_OFF));
        assertEquals(Display.STATE_OFF, policy.effective(policy.record(3, Display.STATE_OFF), 1));
    }
    @Test public void directOffIsTemporarilyOnOnlyForTheActiveLease() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "lyrics", 0);
        RearDirectPowerPolicy policy = new RearDirectPowerPolicy(lease);
        RearDirectPowerPolicy.Request request = policy.record(2, Display.STATE_OFF);
        assertEquals(Display.STATE_ON, policy.effective(request, 1));
        assertEquals(Display.STATE_OFF, request.original);
        assertEquals(Display.STATE_OFF, policy.effective(request, 60000));
    }
    @Test public void releasingRestoresTheOriginalOffInsteadOfPersistingTheOnSubstitution() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "lyrics", 0);
        RearDirectPowerPolicy policy = new RearDirectPowerPolicy(lease);
        RearDirectPowerPolicy.Request request = policy.record(2, Display.STATE_OFF);
        policy.applied(request, Display.STATE_ON);
        assertFalse(policy.needsReplay(request, 1000));
        lease.release(2, "lyrics");
        assertTrue(policy.needsReplay(request, 1001));
        assertEquals(Display.STATE_OFF, policy.effective(request, 1001));
        policy.applied(request, Display.STATE_OFF); assertFalse(policy.needsReplay(request, 1002));
    }
    @Test public void latestSystemResetInvalidatesAQueuedOldOffRequest() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "lyrics", 0);
        RearDirectPowerPolicy policy = new RearDirectPowerPolicy(lease);
        RearDirectPowerPolicy.Request old = policy.record(2, Display.STATE_OFF);
        RearDirectPowerPolicy.Request reset = policy.record(2, Display.STATE_UNKNOWN);
        assertFalse(policy.current(old)); assertFalse(policy.needsReplay(old, 1));
        policy.applied(old, Display.STATE_OFF);
        assertTrue(policy.current(reset)); assertEquals(Display.STATE_UNKNOWN, policy.effective(reset, 1));
    }
    @Test public void alreadyOffBeforeAcquisitionCanBeReappliedWithoutAWakeLoop() {
        RearDisplayLease lease = new RearDisplayLease();
        RearDirectPowerPolicy policy = new RearDirectPowerPolicy(lease);
        RearDirectPowerPolicy.Request request = policy.record(2, Display.STATE_OFF);
        policy.applied(request, Display.STATE_OFF); assertFalse(policy.needsReplay(request, 0));
        lease.acquire(2, "lyrics", 1); assertTrue(policy.needsReplay(request, 1));
        policy.applied(request, Display.STATE_ON); lease.acquire(2, "lyrics", 20000);
        assertFalse(policy.needsReplay(request, 20001));
        lease.clear(); assertTrue(policy.needsReplay(request, 20002));
    }
    @Test public void staleReleaseCannotTurnOffANewSessionAndExpiryRestoresTheLatestIntent() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "old", 0);
        RearDirectPowerPolicy policy = new RearDirectPowerPolicy(lease);
        RearDirectPowerPolicy.Request request = policy.record(2, Display.STATE_OFF);
        policy.applied(request, Display.STATE_ON);
        lease.acquire(2, "new", 30000); assertFalse(lease.release(2, "old"));
        assertFalse(policy.needsReplay(request, 30001));
        lease.expire(90000); assertTrue(policy.needsReplay(request, 90000));
    }
    @Test public void coverAndPauseReleaseDoNotChangeDozeOrNormalResetRequests() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "lyrics", 0);
        RearDirectPowerPolicy policy = new RearDirectPowerPolicy(lease);
        assertEquals(Display.STATE_DOZE, policy.effective(policy.record(2, Display.STATE_DOZE), 1));
        assertEquals(Display.STATE_ON, policy.effective(policy.record(2, Display.STATE_ON), 1));
        lease.release(2, "lyrics");
        assertEquals(Display.STATE_OFF, policy.effective(policy.record(2, Display.STATE_OFF), 2));
    }
}
