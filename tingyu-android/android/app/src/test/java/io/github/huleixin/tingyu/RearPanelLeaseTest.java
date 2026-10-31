package io.github.huleixin.tingyu;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * Shizuku 锁屏背屏「显示租约」测试。
 *
 * <p>模拟真机序列：锁屏 → 系统把背屏压灭（面板 OFF，但歌词窗口仍挂着、Activity 被 stop
 * 所以 visible=false）→ 点亮 → 约 16 秒后系统再次压灭 → 再点亮……整场锁屏必须一直维护，
 * 而不是像 v1.3.57 那样两次就耗尽额度。
 */
public class RearPanelLeaseTest {

    private static final long SECOND = 1000;

    private static RearPanelLease.Action dark(RearPanelLease lease, long now) {
        return lease.observe(true, false, true, now);
    }

    @Test
    public void aLitPanelCostsNothing() {
        RearPanelLease lease = new RearPanelLease();
        lease.begin(0);
        for (long t = 0; t < 120 * SECOND; t += 500) {
            assertEquals(RearPanelLease.Action.NONE, lease.observe(true, true, true, t));
        }
        assertEquals(0, lease.relights());
        assertEquals(0, lease.failures());
    }

    @Test
    public void theFirstDarkObservationRelightsOnce() {
        RearPanelLease lease = new RearPanelLease();
        lease.begin(0);
        assertEquals(RearPanelLease.Action.RELIGHT, dark(lease, 2000));
        assertTrue(lease.awaiting());
        // 回读之前再来一次观测：不叠加第二次点亮
        assertEquals(RearPanelLease.Action.NONE, dark(lease, 2400));
        assertEquals(1, lease.relights());
    }

    @Test
    public void aRecoveredPanelClearsTheFailurePath() {
        RearPanelLease lease = new RearPanelLease();
        lease.begin(0);
        dark(lease, 2000);
        lease.onResult(true, 3200);
        assertEquals(1, lease.recoveries());
        assertEquals(0, lease.failures());
        // 十六秒后系统再次压灭：立刻还能再点亮（不属于高频唤醒，间隔远大于 3 秒）
        assertEquals(RearPanelLease.Action.RELIGHT, dark(lease, 18 * SECOND));
        assertEquals(2, lease.relights());
    }

    @Test
    public void asixteenSecondRhythmIsSustainedForTheWholeLock() {
        // 30 分钟锁屏 ≈ 10 首歌：每 16 秒被压灭一次，每次点亮都生效。
        RearPanelLease lease = new RearPanelLease();
        lease.begin(0);
        long t = 0;
        for (int i = 0; i < 110; i++) {
            t += 16 * SECOND;
            assertEquals(RearPanelLease.Action.RELIGHT, dark(lease, t));
            lease.onResult(true, t + 1200);
        }
        assertEquals(110, lease.relights());
        assertEquals(110, lease.recoveries());
        assertTrue(lease.active());
        assertFalse(lease.stoppedReason().length() > 0);
    }

    @Test
    public void repeatedIneffectiveRelightsBackOffThenStop() {
        RearPanelLease lease = new RearPanelLease();
        lease.begin(0);
        long t = 1000;
        for (int i = 1; i <= RearPanelLease.MAX_CONSECUTIVE_FAILURES; i++) {
            assertEquals(RearPanelLease.Action.RELIGHT, dark(lease, t));
            lease.onResult(false, t + 1200);
            t += 1200 + RearPanelLease.backoff(i) + 100;
        }
        assertEquals(RearPanelLease.MAX_CONSECUTIVE_FAILURES, lease.failures());
        assertEquals("relight-ineffective", lease.stoppedReason());
        // 停止之后一秒、一分、十分钟都不再动作：不是无限循环点亮
        assertEquals(RearPanelLease.Action.NONE, dark(lease, t + SECOND));
        assertEquals(RearPanelLease.Action.NONE, dark(lease, t + 60 * SECOND));
        assertEquals(RearPanelLease.Action.NONE, dark(lease, t + 600 * SECOND));
    }

    @Test
    public void backoffGrowsAndIsCapped() {
        assertEquals(3000, RearPanelLease.backoff(0));
        assertEquals(3000, RearPanelLease.backoff(1));
        assertEquals(8000, RearPanelLease.backoff(2));
        assertEquals(20000, RearPanelLease.backoff(3));
        assertEquals(45000, RearPanelLease.backoff(4));
        assertEquals(60000, RearPanelLease.backoff(5));
        assertEquals(60000, RearPanelLease.backoff(9));
    }

    @Test
    public void noWindowOnTheRearNeverLightsTheOemLauncher() {
        RearPanelLease lease = new RearPanelLease();
        lease.begin(0);
        for (long t = 0; t < 60 * SECOND; t += SECOND) {
            assertEquals(RearPanelLease.Action.NONE, lease.observe(true, false, false, t));
        }
        assertEquals(0, lease.relights());
    }

    @Test
    public void pauseCameraOrCloseEndsTheLease() {
        RearPanelLease lease = new RearPanelLease();
        lease.begin(0);
        dark(lease, 2000);
        // guarding=false（暂停/关闭/相机/合盖）→ 立刻交还系统
        assertEquals(RearPanelLease.Action.NONE, lease.observe(false, false, true, 12 * SECOND));
        assertFalse(lease.active());
        assertEquals(RearPanelLease.Action.NONE, dark(lease, 20 * SECOND));

        lease.begin(30 * SECOND);
        assertEquals(RearPanelLease.Action.RELIGHT, dark(lease, 31 * SECOND));
        lease.end();
        assertFalse(lease.active());
        assertEquals(RearPanelLease.Action.NONE, dark(lease, 40 * SECOND));
    }

    @Test
    public void theSessionCapStopsAnEndlessLock() {
        RearPanelLease lease = new RearPanelLease();
        lease.begin(0);
        long t = RearPanelLease.MAX_SESSION_MS + SECOND;
        assertEquals(RearPanelLease.Action.NONE, dark(lease, t));
        assertEquals("session-cap", lease.stoppedReason());
    }
}
