package io.github.huleixin.tingyu;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * Shizuku 后端背屏常亮策略的状态机测试：持有、恢复、断连欠账、进程死亡接续。
 * 纯 JVM；不碰 Shizuku、不碰 Settings。
 */
public class RearKeepAwakePolicyTest {

    private static RearKeepAwakePolicy.Action sync(RearKeepAwakePolicy policy, boolean shellUsable,
            boolean wanted, boolean playing, boolean camera, boolean closing, boolean cover) {
        return policy.sync(true, shellUsable, wanted, playing, camera, closing, cover);
    }

    @Test
    public void holdBeginsWithReadThenMaxWrite() {
        RearKeepAwakePolicy policy = new RearKeepAwakePolicy();
        assertEquals(RearKeepAwakePolicy.Action.READ_THEN_APPLY,
            sync(policy, true, true, true, false, false, false));
        policy.onPreviousRead("10000");
        assertEquals(RearKeepAwakePolicy.Action.WRITE_MAX,
            sync(policy, true, true, true, false, false, false));
        policy.onMaxApplied();
        assertTrue(policy.holding());
        assertEquals(RearKeepAwakePolicy.Action.NONE,
            sync(policy, true, true, true, false, false, false));
    }

    @Test
    public void pauseStopsHoldingAndRestoresTheOriginalValue() {
        RearKeepAwakePolicy policy = new RearKeepAwakePolicy();
        sync(policy, true, true, true, false, false, false);
        policy.onPreviousRead("30000");
        sync(policy, true, true, true, false, false, false);
        policy.onMaxApplied();
        // 暂停播放：立即恢复，不允许继续占用
        assertEquals(RearKeepAwakePolicy.Action.WRITE_RESTORE,
            sync(policy, true, true, false, false, false, false));
        assertEquals("30000", policy.restoreValue());
        policy.onRestored();
        assertFalse(policy.restoreOwed());
        assertEquals(RearKeepAwakePolicy.Action.NONE,
            sync(policy, true, true, false, false, false, false));
    }

    @Test
    public void cameraYieldAndUserCloseRestoreToo() {
        RearKeepAwakePolicy policy = new RearKeepAwakePolicy();
        sync(policy, true, true, true, false, false, false);
        policy.onPreviousRead("10000");
        sync(policy, true, true, true, false, false, false);
        policy.onMaxApplied();
        assertEquals(RearKeepAwakePolicy.Action.WRITE_RESTORE,
            sync(policy, true, true, true, true, false, false)); // camera
        policy.onRestored();

        sync(policy, true, true, true, false, false, false);
        policy.onPreviousRead("15000");
        sync(policy, true, true, true, false, false, false);
        policy.onMaxApplied();
        assertEquals(RearKeepAwakePolicy.Action.WRITE_RESTORE,
            sync(policy, true, true, true, false, true, false)); // closing
        assertEquals("15000", policy.restoreValue());
    }

    @Test
    public void shellLossWhileHoldingRecordsADebtInsteadOfPretendingSuccess() {
        RearKeepAwakePolicy policy = new RearKeepAwakePolicy();
        sync(policy, true, true, true, false, false, false);
        policy.onPreviousRead("8000");
        sync(policy, true, true, true, false, false, false);
        policy.onMaxApplied();
        // Shizuku 断开：不能执行任何写操作，也不得谎报已恢复
        assertEquals(RearKeepAwakePolicy.Action.MARK_RESTORE_OWED,
            sync(policy, false, true, true, false, false, false));
        assertTrue(policy.restoreOwed());
        assertEquals("8000", policy.restoreValue());
        // 重连后：先补恢复，再谈新的持有
        assertEquals(RearKeepAwakePolicy.Action.WRITE_RESTORE,
            sync(policy, true, true, true, false, false, false));
        policy.onRestored();
        assertEquals(RearKeepAwakePolicy.Action.READ_THEN_APPLY,
            sync(policy, true, true, true, false, false, false));
    }

    @Test
    public void restoreDebtSurvivesAProcessRestart() {
        RearKeepAwakePolicy policy = new RearKeepAwakePolicy();
        // 新进程：标记与原值从持久化里来
        policy.adoptOwedRestore("12000");
        assertTrue(policy.restoreOwed());
        assertEquals(RearKeepAwakePolicy.Action.WRITE_RESTORE,
            sync(policy, true, true, true, false, false, false));
        assertEquals("12000", policy.restoreValue());
        policy.onRestored();
        // 恢复完成后才允许开始新的持有
        assertEquals(RearKeepAwakePolicy.Action.READ_THEN_APPLY,
            sync(policy, true, true, true, false, false, false));
    }

    @Test
    public void aFailedReadNeverOverwritesTheTimeout() {
        RearKeepAwakePolicy policy = new RearKeepAwakePolicy();
        assertEquals(RearKeepAwakePolicy.Action.READ_THEN_APPLY,
            sync(policy, true, true, true, false, false, false));
        // 读失败（ok=false）：协调器不调用 onPreviousRead，状态机再次只提供 READ，不提供 WRITE_MAX
        assertEquals(RearKeepAwakePolicy.Action.READ_THEN_APPLY,
            sync(policy, true, true, true, false, false, false));
        assertFalse(policy.holding());
        // 读成功后才有 MAX 写
        policy.onPreviousRead("10000");
        assertEquals(RearKeepAwakePolicy.Action.WRITE_MAX,
            sync(policy, true, true, true, false, false, false));
    }

    @Test
    public void captureOfOurOwnMaxFallsBackToTheFactoryDefault() {
        RearKeepAwakePolicy policy = new RearKeepAwakePolicy();
        sync(policy, true, true, true, false, false, false);
        policy.onPreviousRead(RearKeepAwakePolicy.MAX_VALUE); // 上一次持有的残留
        assertTrue(policy.previousWasOurOwnMax());
        assertEquals(RearKeepAwakePolicy.DEFAULT_VALUE, policy.restoreValue());
    }

    @Test
    public void sanitizeHandlesSettingsGetOutput() {
        assertEquals("10000", RearKeepAwakePolicy.sanitize(""));
        assertEquals("10000", RearKeepAwakePolicy.sanitize("null"));
        assertEquals("10000", RearKeepAwakePolicy.sanitize(null));
        assertEquals("30000", RearKeepAwakePolicy.sanitize("30000\n"));
        assertEquals("2147483647", RearKeepAwakePolicy.sanitize("2147483647"));
        assertEquals("10000", RearKeepAwakePolicy.sanitize("garbage"));
        assertEquals("10000", RearKeepAwakePolicy.sanitize("0x2710"));
    }

    @Test
    public void coverSleepAndLspBackendNeverHold() {
        RearKeepAwakePolicy policy = new RearKeepAwakePolicy();
        // 合盖睡眠时不允许持有所属超时
        assertEquals(RearKeepAwakePolicy.Action.READ_THEN_APPLY,
            sync(policy, true, true, true, false, false, false));
        RearKeepAwakePolicy covered = new RearKeepAwakePolicy();
        RearKeepAwakePolicy.Action withCover = covered.sync(true, true, true, true, false, false, true);
        assertEquals(RearKeepAwakePolicy.Action.NONE, withCover);
        // 相机优先于歌词
        RearKeepAwakePolicy camera = new RearKeepAwakePolicy();
        assertEquals(RearKeepAwakePolicy.Action.NONE,
            camera.sync(true, true, true, true, true, false, false));
    }
}
