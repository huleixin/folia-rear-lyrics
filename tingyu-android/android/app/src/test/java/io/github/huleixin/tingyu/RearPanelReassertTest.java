package io.github.huleixin.tingyu;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * Shizuku 锁屏保亮「观测→有界恢复」状态机测试。
 * 模拟 bright 的真机行为：锁屏后系统把背屏压灭；WAKE 能点亮；
 * 点亮后系统可能再次压灭；预算耗尽必须停止。
 */
public class RearPanelReassertTest {

    private static RearPanelReassert.Action observe(RearPanelReassert r, boolean awake, long now) {
        return r.observe(true, awake, now);
    }

    @Test
    public void firstDarkObservationIssuesAWake() {
        RearPanelReassert r = new RearPanelReassert();
        assertEquals(RearPanelReassert.Action.NONE, observe(r, true, 1000)); // awake: no action
        r.begin();
        assertEquals(RearPanelReassert.Action.WAKE, observe(r, false, 2000)); // dark: wake
    }

    @Test
    public void attemptsRespectTheMinimumInterval() {
        RearPanelReassert r = new RearPanelReassert();
        r.begin();
        assertEquals(RearPanelReassert.Action.WAKE, observe(r, false, 2000));
        // 1.2s 内再次观测到暗屏：不动作（不是高频唤醒）
        assertEquals(RearPanelReassert.Action.NONE, observe(r, false, 3200));
        assertEquals(RearPanelReassert.Action.WAKE, observe(r, false, 4000)); // >1.5s
        assertEquals(2, r.attempts());
    }

    @Test
    public void recoveryResetsTheAwakeBaselineButNotTheEpisodeBudget() {
        RearPanelReassert r = new RearPanelReassert();
        r.begin();
        observe(r, false, 1000);
        assertTrue(observe(r, true, 2000) == RearPanelReassert.Action.NONE);
        assertEquals(1, r.recoveries());
        // 点亮后再次被压灭：继续用剩余预算
        assertEquals(RearPanelReassert.Action.WAKE, observe(r, false, 5000));
        assertEquals(2, r.attempts());
    }

    @Test
    public void consecutiveFailuresEscalateToPowerResetThenStop() {
        RearPanelReassert r = new RearPanelReassert();
        r.begin();
        long t = 1000;
        for (int i = 1; i <= RearPanelReassert.MAX_ATTEMPTS_PER_EPISODE; i++) {
            RearPanelReassert.Action action = observe(r, false, t);
            if (i <= RearPanelReassert.POWER_RESET_AFTER) assertEquals(RearPanelReassert.Action.WAKE, action);
            else assertEquals(RearPanelReassert.Action.POWER_RESET, action);
            t += RearPanelReassert.MIN_INTERVAL_MS + 100;
        }
        // 预算耗尽：永远不再动作，直到周期结束
        assertEquals(RearPanelReassert.Action.NONE, observe(r, false, t + 10_000));
        assertTrue(r.exhausted());
        assertFalse(r.holdingBudget());
        // 解锁结束周期：预算清零，可再次开始
        r.end();
        r.begin();
        assertEquals(RearPanelReassert.Action.WAKE, observe(r, false, t + 20_000));
    }

    @Test
    public void healthyObservationsNeverConsumeBudget() {
        RearPanelReassert r = new RearPanelReassert();
        r.begin();
        for (long t = 0; t < 100_000; t += 500) observe(r, true, t);
        assertEquals(0, r.attempts());
        assertFalse(r.exhausted());
    }

    @Test
    public void pauseOrCameraEndsTheEpisode() {
        RearPanelReassert r = new RearPanelReassert();
        r.begin();
        observe(r, false, 1000);
        r.end(); // 暂停/相机/关闭：立即交还系统
        assertEquals(RearPanelReassert.Action.NONE, observe(r, false, 2000));
        assertEquals(0, r.attempts());
    }

    @Test
    public void beginIsIdempotentWithinAnEpisode() {
        RearPanelReassert r = new RearPanelReassert();
        r.begin();
        observe(r, false, 1000);
        r.begin(); // 已在周期内：预算不被重置
        assertEquals(1, r.attempts());
    }
}
