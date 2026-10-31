package io.github.huleixin.tingyu;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * 锁屏后被系统背屏桌面（AOD）顶掉时的重夺节流测试。
 * 重点是「能夺回，但绝不每 2 秒对抢一次」，用完额度要留下确定结论。
 */
public class RearTakeoverPolicyTest {

    @Test
    public void aSystemCoveredRearDisplayIsRecoveredOnce() {
        RearTakeoverPolicy policy = new RearTakeoverPolicy();
        assertEquals(RearTakeoverPolicy.Decision.RECOVER,
            policy.evaluate(true, true, true, false, false, 1000));
        assertEquals(1, policy.attempts());
    }

    @Test
    public void nothingHappensUnlessWeWantLyricsOnALockedCoveredDisplay() {
        RearTakeoverPolicy policy = new RearTakeoverPolicy();
        assertEquals(RearTakeoverPolicy.Decision.NONE, policy.evaluate(false, true, true, false, false, 1000));
        assertEquals(RearTakeoverPolicy.Decision.NONE, policy.evaluate(true, false, true, false, false, 1000));
        assertEquals(RearTakeoverPolicy.Decision.NONE, policy.evaluate(true, true, false, false, false, 1000));
        assertEquals(RearTakeoverPolicy.Decision.NONE, policy.evaluate(true, true, true, true, false, 1000));
        assertEquals(RearTakeoverPolicy.Decision.NONE, policy.evaluate(true, true, true, false, true, 1000));
        assertEquals(0, policy.attempts());
    }

    @Test
    public void attemptsAreSpacedAndCappedPerLock() {
        RearTakeoverPolicy policy = new RearTakeoverPolicy();
        long t = 1000;
        assertEquals(RearTakeoverPolicy.Decision.RECOVER, policy.evaluate(true, true, true, false, false, t));
        // 20 秒内不再对抢
        assertEquals(RearTakeoverPolicy.Decision.NONE,
            policy.evaluate(true, true, true, false, false, t + RearTakeoverPolicy.MIN_GAP_MS - 1));
        t += RearTakeoverPolicy.MIN_GAP_MS + 1;
        assertEquals(RearTakeoverPolicy.Decision.RECOVER, policy.evaluate(true, true, true, false, false, t));
        t += RearTakeoverPolicy.MIN_GAP_MS + 1;
        assertEquals(RearTakeoverPolicy.Decision.RECOVER, policy.evaluate(true, true, true, false, false, t));
        // 额度用完：本锁屏周期不再重夺，并给出 exhausted
        t += RearTakeoverPolicy.MIN_GAP_MS + 1;
        assertEquals(RearTakeoverPolicy.Decision.NONE, policy.evaluate(true, true, true, false, false, t));
        assertTrue(policy.exhausted());
        assertEquals(RearTakeoverPolicy.MAX_ATTEMPTS_PER_LOCK, policy.attempts());
    }

    @Test
    public void unlockingRestoresTheBudget() {
        RearTakeoverPolicy policy = new RearTakeoverPolicy();
        long t = 1000;
        for (int i = 0; i < RearTakeoverPolicy.MAX_ATTEMPTS_PER_LOCK; i++) {
            policy.evaluate(true, true, true, false, false, t);
            t += RearTakeoverPolicy.MIN_GAP_MS + 1;
        }
        assertEquals(RearTakeoverPolicy.Decision.NONE, policy.evaluate(true, true, true, false, false, t));
        assertTrue(policy.exhausted());
        policy.reset();
        assertFalse(policy.exhausted());
        assertEquals(RearTakeoverPolicy.Decision.RECOVER, policy.evaluate(true, true, true, false, false, t));
    }

    @Test
    public void aSuccessfulRecoveryDoesNotSpendTheNextAttemptImmediately() {
        RearTakeoverPolicy policy = new RearTakeoverPolicy();
        policy.evaluate(true, true, true, false, false, 1000);
        policy.onRecovered();
        // 刚夺回就再判一次：间隔被清空，但额度仍然只用了 1 次
        assertEquals(RearTakeoverPolicy.Decision.RECOVER, policy.evaluate(true, true, true, false, false, 2000));
        assertEquals(2, policy.attempts());
    }
}
