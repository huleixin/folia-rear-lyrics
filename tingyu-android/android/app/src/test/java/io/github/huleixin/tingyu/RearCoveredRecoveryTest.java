package io.github.huleixin.tingyu;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * COVERED_RECOVERY 状态机测试。
 *
 * <p>被覆盖的真实错误路径：
 * <ul>
 *   <li>1.3.63 真机：三个「机制」里有两个都是 {@code am start}，返回
 *       {@code before=task-not-listed}（解析失败被当成任务不存在），三次之后 {@code attempt-cap}；</li>
 *   <li>1.3.64 真机：置顶命令被接受但无效，且 {@code recovered=true} 与 {@code visible=false}
 *       同时出现。</li>
 * </ul>
 *
 * <p>现在只剩两条**真正不同**的机制：让旧任务回前台（A），和在 Display 0 新建任务再迁移（B）。
 * 1.3.39 的真机验证只覆盖过 B，所以 A 失败不能推出 B 失败 —— 两者必须都能单独关掉，
 * 否则真机无法判断是哪一条生效。
 */
public class RearCoveredRecoveryTest {

    private static final boolean WANTED = true;
    private static final boolean CAMERA = false;
    private static final boolean CLOSING = false;
    private static final boolean ALIVE = true;
    private static final boolean HIDDEN = false;
    private static final boolean SYSTEM_FRONT = true;

    private static RearCoveredRecovery.Plan evaluate(RearCoveredRecovery recovery, long now) {
        return recovery.evaluate(WANTED, CAMERA, CLOSING, ALIVE, HIDDEN, SYSTEM_FRONT,
            true, true, now);
    }

    private static RearCoveredRecovery.Plan evaluate(RearCoveredRecovery recovery,
                                                     boolean allowRefront, boolean allowMigrate, long now) {
        return recovery.evaluate(WANTED, CAMERA, CLOSING, ALIVE, HIDDEN, SYSTEM_FRONT,
            allowRefront, allowMigrate, now);
    }

    @Test
    public void aCoveredButAliveWindowIsNeverTreatedAsDestroyed() {
        RearCoveredRecovery recovery = new RearCoveredRecovery();
        RearCoveredRecovery.Plan plan = evaluate(recovery, 1_000);
        assertEquals(RearCoveredRecovery.Decision.ATTEMPT, plan.decision);
        assertEquals(RearCoveredRecovery.Mechanism.IN_APP_MOVE_TO_FRONT, plan.mechanism);
        assertFalse(recovery.windowGone());
    }

    @Test
    public void aTrulyDestroyedWindowIsTheOnlyReasonToRebuild() {
        RearCoveredRecovery recovery = new RearCoveredRecovery();
        RearCoveredRecovery.Plan plan = recovery.evaluate(WANTED, CAMERA, CLOSING, false, HIDDEN,
            SYSTEM_FRONT, true, true, 1_000);
        assertEquals(RearCoveredRecovery.Decision.REBUILD, plan.decision);
        assertTrue(recovery.windowGone());
    }

    /**
     * A 失败之后必须换机制，而不是重复同一个命令。
     *
     * <p>第二顺位是 1.3.39 的迁移（新建任务 + move-stack），不是又一次 {@code am start}。
     */
    @Test
    public void theSecondMechanismIsTheHistoricalMigrationNotAnotherLaunch() {
        assertEquals(2, RearCoveredRecovery.MAX_ATTEMPTS);
        RearCoveredRecovery recovery = new RearCoveredRecovery();
        long now = 1_000;
        assertEquals(RearCoveredRecovery.Mechanism.IN_APP_MOVE_TO_FRONT, evaluate(recovery, now).mechanism);
        recovery.onResult(RearCoveredRecovery.Mechanism.IN_APP_MOVE_TO_FRONT,
            RearCoveredRecovery.Result.NOT_FRONTED, false, "front=com.xiaomi.subscreencenter", now + 1_500);

        now += RearCoveredRecovery.MIN_GAP_MS + 1;
        assertEquals(RearCoveredRecovery.Mechanism.MAIN_STAGE_MIGRATE, evaluate(recovery, now).mechanism);
        recovery.onResult(RearCoveredRecovery.Mechanism.MAIN_STAGE_MIGRATE,
            RearCoveredRecovery.Result.SYSTEM_RETAKEN, false, "front is the rear centre again", now + 1_500);

        now += RearCoveredRecovery.MIN_GAP_MS + 1;
        assertEquals(RearCoveredRecovery.Decision.NONE, evaluate(recovery, now).decision);
        assertTrue(recovery.blocked());
        assertEquals("system-retaken", recovery.blockedReason());
    }

    @Test
    public void routeAOnlyNeverOffersTheMigration() {
        // A/B 的 A 侧：只允许置顶。真机用它证明「A 单独确实不行」。
        RearCoveredRecovery recovery = new RearCoveredRecovery();
        assertEquals(RearCoveredRecovery.Mechanism.IN_APP_MOVE_TO_FRONT,
            evaluate(recovery, true, false, 1_000).mechanism);
        recovery.onResult(RearCoveredRecovery.Mechanism.IN_APP_MOVE_TO_FRONT,
            RearCoveredRecovery.Result.NOT_FRONTED, false, "no effect", 1_500);
        long now = 1_000 + RearCoveredRecovery.MIN_GAP_MS + 1;
        RearCoveredRecovery.Plan plan = evaluate(recovery, true, false, now);
        assertEquals(RearCoveredRecovery.Decision.NONE, plan.decision);
        assertTrue(recovery.blocked());
        assertEquals("all-mechanisms-refused", recovery.blockedReason());
        assertFalse("A 路由绝不能偷偷跑迁移", recovery.tried(RearCoveredRecovery.Mechanism.MAIN_STAGE_MIGRATE));
    }

    @Test
    public void routeBGoesStraightToTheMigration() {
        // A/B 的 B 侧：跳过置顶，直接验证迁移本身在当前固件是否还成立。
        RearCoveredRecovery recovery = new RearCoveredRecovery();
        assertEquals(RearCoveredRecovery.Mechanism.MAIN_STAGE_MIGRATE,
            evaluate(recovery, false, true, 1_000).mechanism);
    }

    @Test
    public void anUnreadableTableIsNotATaskThatDoesNotExist() {
        RearCoveredRecovery recovery = new RearCoveredRecovery();
        evaluate(recovery, 1_000);
        // 表读不出来 = 命令层面不可用：停手，而不是「任务没了」去重建。
        recovery.onResult(RearCoveredRecovery.Mechanism.IN_APP_MOVE_TO_FRONT,
            RearCoveredRecovery.Result.COMMAND_UNSUPPORTED, false, "no root/task line matched", 1_500);
        assertTrue(recovery.blocked());
        assertEquals("command-unsupported", recovery.blockedReason());
        assertFalse("读不出来不等于窗口没了", recovery.windowGone());
    }

    @Test
    public void aTaskMissingFromAReadableTableAllowsOneRebuild() {
        RearCoveredRecovery recovery = new RearCoveredRecovery();
        evaluate(recovery, 1_000);
        recovery.onResult(RearCoveredRecovery.Mechanism.IN_APP_MOVE_TO_FRONT,
            RearCoveredRecovery.Result.TASK_NOT_FOUND, false, "task absent from a readable table", 1_500);
        assertTrue(recovery.windowGone());
        assertFalse(recovery.blocked());
    }

    @Test
    public void aPermissionDenialStopsImmediately() {
        RearCoveredRecovery recovery = new RearCoveredRecovery();
        evaluate(recovery, 1_000);
        recovery.onResult(RearCoveredRecovery.Mechanism.IN_APP_MOVE_TO_FRONT,
            RearCoveredRecovery.Result.PERMISSION_DENIED, false, "SecurityException: denied", 1_500);
        assertTrue(recovery.blocked());
        assertEquals("permission-denied", recovery.blockedReason());
        assertEquals(RearCoveredRecovery.Result.PERMISSION_DENIED, recovery.lastResult());
    }

    @Test
    public void recoveryIsOnlyDeclaredWhenTheWindowIsActuallyVisible() {
        RearCoveredRecovery recovery = new RearCoveredRecovery();
        evaluate(recovery, 1_000);
        // 命令执行了但窗口不可见：绝不能算 recovered。
        recovery.onResult(RearCoveredRecovery.Mechanism.IN_APP_MOVE_TO_FRONT,
            RearCoveredRecovery.Result.NOT_FRONTED, false, "window still stopped", 1_500);
        assertFalse(recovery.recovered());
        recovery.onResult(RearCoveredRecovery.Mechanism.MAIN_STAGE_MIGRATE,
            RearCoveredRecovery.Result.RECOVERED, true, "window visible", 7_000);
        assertTrue(recovery.recovered());
    }

    @Test
    public void aNewCoveredEpisodeClearsTheOldVerdict() {
        RearCoveredRecovery recovery = new RearCoveredRecovery();
        recovery.onVisible();
        assertTrue(recovery.recovered());
        // 用户看到的那条自相矛盾状态：recovered=true 配 visible=false。
        // 新的覆盖事件必须重新判定。
        recovery.beginEpisode();
        assertFalse(recovery.recovered());
        assertEquals(RearCoveredRecovery.Decision.ATTEMPT, evaluate(recovery, 1_000).decision);
    }

    @Test
    public void aVisibleWindowNeedsNothing() {
        RearCoveredRecovery recovery = new RearCoveredRecovery();
        RearCoveredRecovery.Plan plan = recovery.evaluate(WANTED, CAMERA, CLOSING, ALIVE, true,
            SYSTEM_FRONT, true, true, 1_000);
        assertEquals(RearCoveredRecovery.Decision.NONE, plan.decision);
        assertEquals("visible", plan.reason);
        assertTrue(recovery.recovered());
        assertEquals(0, recovery.attempts());
    }

    @Test
    public void aCameraAlwaysWinsAndIdleMeansNoCommand() {
        RearCoveredRecovery recovery = new RearCoveredRecovery();
        assertEquals(RearCoveredRecovery.Decision.NONE,
            recovery.evaluate(WANTED, true, CLOSING, ALIVE, HIDDEN, SYSTEM_FRONT, true, true, 1_000).decision);
        assertEquals(RearCoveredRecovery.Decision.NONE,
            recovery.evaluate(false, CAMERA, CLOSING, ALIVE, HIDDEN, SYSTEM_FRONT, true, true, 1_000).decision);
        assertEquals(RearCoveredRecovery.Decision.NONE,
            recovery.evaluate(WANTED, CAMERA, true, ALIVE, HIDDEN, SYSTEM_FRONT, true, true, 1_000).decision);
        // 前台不是系统背屏桌面（比如别的应用）：不是本病。
        assertEquals(RearCoveredRecovery.Decision.NONE,
            recovery.evaluate(WANTED, CAMERA, CLOSING, ALIVE, HIDDEN, false, true, true, 1_000).decision);
        assertEquals(0, recovery.attempts());
    }

    @Test
    public void theCooldownPreventsBackToBackPreemption() {
        RearCoveredRecovery recovery = new RearCoveredRecovery();
        assertEquals(RearCoveredRecovery.Decision.ATTEMPT, evaluate(recovery, 1_000).decision);
        recovery.onResult(RearCoveredRecovery.Mechanism.IN_APP_MOVE_TO_FRONT,
            RearCoveredRecovery.Result.NOT_FRONTED, false, "", 1_400);
        assertEquals(RearCoveredRecovery.Decision.NONE, evaluate(recovery, 2_000).decision);
        assertEquals("cooldown", evaluate(recovery, 2_000).reason);
    }

    @Test
    public void resetOpensANewLockCycle() {
        RearCoveredRecovery recovery = new RearCoveredRecovery();
        evaluate(recovery, 1_000);
        recovery.onResult(RearCoveredRecovery.Mechanism.IN_APP_MOVE_TO_FRONT,
            RearCoveredRecovery.Result.PERMISSION_DENIED, false, "denied", 1_200);
        assertTrue(recovery.blocked());
        recovery.reset();
        assertFalse(recovery.blocked());
        assertEquals(0, recovery.attempts());
        assertEquals(RearCoveredRecovery.Mechanism.IN_APP_MOVE_TO_FRONT, evaluate(recovery, 9_000).mechanism);
    }

    @Test
    public void theVerdictIsReportedOnlyOnce() {
        RearCoveredRecovery recovery = new RearCoveredRecovery();
        evaluate(recovery, 1_000);
        recovery.onResult(RearCoveredRecovery.Mechanism.IN_APP_MOVE_TO_FRONT,
            RearCoveredRecovery.Result.SYSTEM_RETAKEN, false, "front centre", 1_200);
        assertTrue(recovery.claimReport());
        assertFalse("同一条结论不应被写进轨迹第二遍", recovery.claimReport());
    }

    @Test
    public void theDiagnosticSnapshotNamesTheState() {
        RearCoveredRecovery recovery = new RearCoveredRecovery();
        evaluate(recovery, 1_000);
        String described = recovery.toString();
        assertTrue(described, described.contains("attempts=1/2"));
        assertTrue(described, described.contains("IN_APP_MOVE_TO_FRONT"));
    }
}
