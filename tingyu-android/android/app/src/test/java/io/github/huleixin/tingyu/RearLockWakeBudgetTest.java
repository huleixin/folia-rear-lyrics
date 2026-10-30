package io.github.huleixin.tingyu;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

// android/app/src/test/java/io/github/huleixin/tingyu/RearLockWakeBudgetTest.java
// The four ways a rear window "disappears" on lock are not one bug, and neither are the two
// backends. LSP already holds the panel through a system hook; Shizuku has to wake it itself.
// These assertions are what keeps the Shizuku fix from quietly becoming LSP behaviour too.
public class RearLockWakeBudgetTest {

    @Test public void theLspBackendNeverWakesOnItsOwn() {
        RearLockWakeBudget budget = new RearLockWakeBudget();
        budget.lockStarted(true);
        assertFalse("the module owns idle behaviour under LSP", budget.candidate());
        assertFalse(budget.take());
        assertFalse(budget.take());
        assertEquals(0, budget.wakes());
    }

    @Test public void oneFailedWakeNoLongerEndsTheWholeLockForShizuku() {
        RearLockWakeBudget budget = new RearLockWakeBudget();
        budget.lockStarted(false);
        assertTrue(budget.candidate());
        for (int attempt = 1; attempt <= RearLockWakeBudget.MAX_WAKES; attempt++) {
            assertTrue("attempt " + attempt + " stays available even after earlier ones failed", budget.take());
            assertEquals(attempt, budget.wakes());
        }
        assertFalse("but it is still bounded", budget.take());
    }

    @Test public void theBudgetIsPerLockThenArmedAgain() {
        RearLockWakeBudget budget = new RearLockWakeBudget();
        budget.lockStarted(false);
        assertTrue(budget.take());
        budget.unlocked();
        assertFalse("unlocking must disarm it, not leave a wake pending", budget.candidate());
        budget.lockStarted(false);
        assertEquals(0, budget.wakes());
        assertTrue(budget.take());
    }

    @Test public void aBackendSwitchMidSessionTakesTheSafeBranch() {
        RearLockWakeBudget budget = new RearLockWakeBudget();
        budget.lockStarted(false);
        assertTrue(budget.take());
        // Re-arming as the hooked backend during the same lock stops any further wake attempt.
        budget.lockStarted(true);
        assertFalse(budget.take());
    }
}
