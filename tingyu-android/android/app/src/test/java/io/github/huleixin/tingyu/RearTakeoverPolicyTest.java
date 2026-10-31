package io.github.huleixin.tingyu;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * 重夺节流的状态机测试。
 *
 * <p>被覆盖的真实错误路径：v1.3.59 的 {@code attempts} 只增不减，{@code onRecovered()} 仅清
 * 冷却时间。一次长锁屏里「被顶掉 → 成功夺回」发生 3 次之后，第 4 次被顶掉时额度已被历史
 * <b>成功</b>耗尽，{@code exhausted} 永久置位 —— 用户看到的是「连播几首后背屏停在系统桌面」。
 */
public class RearTakeoverPolicyTest {

    private static final boolean WANTED = true;
    private static final boolean LOCKED = true;
    private static final boolean COVERED = true;
    private static final boolean CAMERA = false;
    private static final boolean CLOSING = false;

    private static RearTakeoverPolicy.Decision covered(RearTakeoverPolicy policy, long now) {
        return policy.evaluate(WANTED, LOCKED, COVERED, CAMERA, CLOSING, now);
    }

    /** 模拟一次「夺回并稳定」：观测到我们在最前，并持续超过 STABLE_MS。 */
    private static long stableRecovery(RearTakeoverPolicy policy, long now) {
        policy.observe(true, now);
        long stable = now + RearTakeoverPolicy.STABLE_MS;
        policy.observe(true, stable);
        return stable;
    }

    @Test
    public void theCooldownStillGatesEveryRecovery() {
        RearTakeoverPolicy policy = new RearTakeoverPolicy();
        assertEquals(RearTakeoverPolicy.Decision.RECOVER, covered(policy, 1_000));
        assertEquals(RearTakeoverPolicy.Decision.NONE,
            covered(policy, 1_000 + RearTakeoverPolicy.MIN_GAP_MS - 1));
        assertEquals(RearTakeoverPolicy.Decision.RECOVER,
            covered(policy, 1_000 + RearTakeoverPolicy.MIN_GAP_MS));
    }

    @Test
    public void nothingHappensWhenTheUserDoesNotWantLyricsOrTheCameraOwnsThePanel() {
        RearTakeoverPolicy policy = new RearTakeoverPolicy();
        assertEquals(RearTakeoverPolicy.Decision.NONE,
            policy.evaluate(false, LOCKED, COVERED, CAMERA, CLOSING, 1_000));
        assertEquals(RearTakeoverPolicy.Decision.NONE,
            policy.evaluate(WANTED, false, COVERED, CAMERA, CLOSING, 1_000));
        assertEquals(RearTakeoverPolicy.Decision.NONE,
            policy.evaluate(WANTED, LOCKED, true, true, CLOSING, 1_000));
        assertEquals(RearTakeoverPolicy.Decision.NONE,
            policy.evaluate(WANTED, LOCKED, true, CAMERA, true, 1_000));
        // 我们的窗口在最前时不需要重夺。
        assertEquals(RearTakeoverPolicy.Decision.NONE,
            policy.evaluate(WANTED, LOCKED, false, CAMERA, CLOSING, 1_000));
    }

    @Test
    public void threeConsecutiveFailuresStopTheFight() {
        RearTakeoverPolicy policy = new RearTakeoverPolicy();
        long now = 1_000;
        for (int i = 0; i < RearTakeoverPolicy.MAX_CONSECUTIVE_FAILURES; i++) {
            assertEquals("attempt " + i, RearTakeoverPolicy.Decision.RECOVER, covered(policy, now));
            now += RearTakeoverPolicy.MIN_GAP_MS + 1;
        }
        // 第四次：连续无效已达上限，停止并留下确定结论。
        assertEquals(RearTakeoverPolicy.Decision.NONE, covered(policy, now));
        assertTrue(policy.exhausted());
        assertEquals(RearTakeoverPolicy.MAX_CONSECUTIVE_FAILURES, policy.consecutiveFailures());
    }

    @Test
    public void successfulRecoveriesDoNotConsumeTheFailureBudget() {
        RearTakeoverPolicy policy = new RearTakeoverPolicy();
        long now = 0;
        for (int round = 0; round < 8; round++) {
            assertEquals("round " + round, RearTakeoverPolicy.Decision.RECOVER, covered(policy, now));
            now = stableRecovery(policy, now + 1_000) + RearTakeoverPolicy.MIN_GAP_MS + 1;
        }
        // 八次成功之后仍然可以再抢：失败额度没有被历史成功占用。
        assertFalse(policy.exhausted());
        assertEquals(0, policy.consecutiveFailures());
        assertEquals(8, policy.attempts());
        assertEquals(RearTakeoverPolicy.Decision.RECOVER, covered(policy, now));
    }

    @Test
    public void theTotalCapStillStopsAnEndlessPreemptionLoop() {
        RearTakeoverPolicy policy = new RearTakeoverPolicy();
        long now = 0;
        for (int round = 0; round < RearTakeoverPolicy.MAX_ATTEMPTS_PER_LOCK; round++) {
            assertEquals("round " + round, RearTakeoverPolicy.Decision.RECOVER, covered(policy, now));
            now = stableRecovery(policy, now + 1_000) + RearTakeoverPolicy.MIN_GAP_MS + 1;
        }
        assertEquals(RearTakeoverPolicy.MAX_ATTEMPTS_PER_LOCK, policy.attempts());
        assertEquals(RearTakeoverPolicy.Decision.NONE, covered(policy, now));
        assertTrue("总量到顶后必须停，成功再多也不能无限抢占", policy.exhausted());
    }

    @Test
    public void aFlappingWindowDoesNotCountAsStableRecovery() {
        RearTakeoverPolicy policy = new RearTakeoverPolicy();
        long now = 1_000;
        assertEquals(RearTakeoverPolicy.Decision.RECOVER, covered(policy, now));
        // 只闪回 2 秒就被再次顶掉：不算成功，连续失败照常累加。
        now += 2_000;
        policy.observe(true, now);
        now += 1_000;
        policy.observe(false, now);
        now += RearTakeoverPolicy.MIN_GAP_MS;
        assertEquals(RearTakeoverPolicy.Decision.RECOVER, covered(policy, now));
        now += RearTakeoverPolicy.MIN_GAP_MS;
        covered(policy, now);
        assertTrue(policy.consecutiveFailures() >= 1);
    }

    @Test
    public void resetOpensANewLockCycle() {
        RearTakeoverPolicy policy = new RearTakeoverPolicy();
        long now = 1_000;
        for (int i = 0; i < RearTakeoverPolicy.MAX_CONSECUTIVE_FAILURES; i++) {
            covered(policy, now);
            now += RearTakeoverPolicy.MIN_GAP_MS + 1;
        }
        covered(policy, now);
        assertTrue(policy.exhausted());

        policy.reset();
        assertFalse(policy.exhausted());
        assertEquals(0, policy.attempts());
        assertEquals(RearTakeoverPolicy.Decision.RECOVER, covered(policy, now));
    }
}
