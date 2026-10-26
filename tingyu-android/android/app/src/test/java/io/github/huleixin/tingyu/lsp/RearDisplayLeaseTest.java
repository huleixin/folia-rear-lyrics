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
}
