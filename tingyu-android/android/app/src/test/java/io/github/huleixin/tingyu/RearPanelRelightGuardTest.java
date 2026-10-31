package io.github.huleixin.tingyu;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * Shizuku 侧「点亮背屏会不会误亮主屏」的安全阀测试。
 *
 * <p>被覆盖的真实错误路径：
 * <ul>
 *   <li>验证窗口内用户自己解锁 —— 主屏当然亮了，v1.3.59 把这算成自己的错，整场会话停止点亮；</li>
 *   <li>锁存永不解除 —— 一次误判之后，解锁、重新锁屏都不再尝试点亮背屏；</li>
 *   <li>主屏已经亮着还去发唤醒事件 —— 那会把「用户活动」续在主屏上，是拿功耗换表面稳定。</li>
 * </ul>
 */
public class RearPanelRelightGuardTest {

    @Test
    public void aLitMainDisplayIsNotRelitAtAll() {
        RearPanelRelightGuard guard = new RearPanelRelightGuard();
        assertEquals(RearPanelRelightGuard.Verdict.SKIP_MAIN_ON, guard.verdict(true));
        assertEquals(RearPanelRelightGuard.Verdict.RELIGHT, guard.verdict(false));
    }

    @Test
    public void anUnchangedMainDisplayIsNotAttributedToUs() {
        RearPanelRelightGuard guard = new RearPanelRelightGuard();
        // 主屏本来就亮：与本次点亮无关。
        assertEquals(RearPanelRelightGuard.Attribution.NONE, guard.attribute(true, true, true));
        // 主屏仍然熄灭：更与我们无关。
        assertEquals(RearPanelRelightGuard.Attribution.NONE, guard.attribute(false, false, true));
        assertEquals(RearPanelRelightGuard.Verdict.RELIGHT, guard.verdict(false));
        assertEquals(0, guard.confirmedMainWakes());
    }

    @Test
    public void theUserUnlockingDuringVerificationIsNotOurFault() {
        RearPanelRelightGuard guard = new RearPanelRelightGuard();
        // 主屏从熄到亮，但锁屏已经解除 —— 是用户解锁。
        assertEquals(RearPanelRelightGuard.Attribution.USER_UNLOCK, guard.attribute(false, true, false));
        assertFalse(guard.disabled());
        assertEquals(0, guard.confirmedMainWakes());
        // 仍然允许本次会话继续尝试：这才是「不误判」的意义。
        assertEquals(RearPanelRelightGuard.Verdict.RELIGHT, guard.verdict(false));
    }

    @Test
    public void mainWokenWhileStillLockedLatchesThisLockCycleOnly() {
        RearPanelRelightGuard guard = new RearPanelRelightGuard();
        guard.onLock();
        assertEquals(RearPanelRelightGuard.Attribution.OURS, guard.attribute(false, true, true));
        assertEquals(RearPanelRelightGuard.Verdict.STOP_SESSION, guard.verdict(false));
        // 解锁：本周期结束，锁存解除，但跨周期计数保留。
        guard.onUnlock();
        assertEquals(RearPanelRelightGuard.Verdict.RELIGHT, guard.verdict(false));
        assertEquals(1, guard.confirmedMainWakes());
    }

    @Test
    public void asecondConfirmedMainWakeDisablesRelightForTheProcess() {
        RearPanelRelightGuard guard = new RearPanelRelightGuard();
        guard.onLock();
        assertEquals(RearPanelRelightGuard.Attribution.OURS, guard.attribute(false, true, true));
        guard.onUnlock();
        guard.onLock();
        assertEquals(RearPanelRelightGuard.Attribution.OURS_FINAL, guard.attribute(false, true, true));
        assertTrue(guard.disabled());
        assertEquals(RearPanelRelightGuard.Verdict.STOP_DISABLED, guard.verdict(false));
        // 再解锁、再锁屏也不会复活：这个 ROM 的行为不会因为解锁而改变。
        guard.onUnlock();
        guard.onLock();
        assertEquals(RearPanelRelightGuard.Verdict.STOP_DISABLED, guard.verdict(false));
        assertEquals(2, guard.confirmedMainWakes());
    }

    @Test
    public void aDisabledGuardReportsWhyItStopped() {
        RearPanelRelightGuard guard = new RearPanelRelightGuard();
        for (int i = 0; i < RearPanelRelightGuard.MAX_CONFIRMED_MAIN_WAKES; i++) {
            guard.onLock();
            guard.attribute(false, true, true);
            if (i == 0) guard.onUnlock();
        }
        assertTrue(guard.describe(), guard.describe().contains("disabled=true"));
        assertTrue(guard.describe(), guard.describe().contains("main-woken-by-relight-final"));
        assertTrue(guard.describe(), guard.describe().contains("2/2"));
    }
}
