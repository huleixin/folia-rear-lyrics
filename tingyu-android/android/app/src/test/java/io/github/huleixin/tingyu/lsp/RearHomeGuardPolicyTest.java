package io.github.huleixin.tingyu.lsp;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * 锁屏背屏接管拦截的纯逻辑测试。证据链（REAREye SubScreenBackHomeWhitelistModule）：
 * 锁屏 + 背屏息屏开启 → 背屏中心以 reason="aod" 把 SubScreenLauncher 拉到背屏 Display。
 * 拦截必须同时覆盖「启动」与「迁移」两条系统调用，且只在歌词租约持有、无相机时生效。
 */
public class RearHomeGuardPolicyTest {

    @Test
    public void blocksTheRearCentreLauncherStartWhileTheLeaseIsHeld() {
        assertEquals(RearHomeGuardPolicy.Decision.BLOCK, RearHomeGuardPolicy.evaluateStart(
            "com.xiaomi.subscreencenter", "com.xiaomi.subscreencenter.SubScreenLauncher", true, false));
        assertEquals(RearHomeGuardPolicy.Decision.BLOCK, RearHomeGuardPolicy.evaluateStart(
            "com.xiaomi.subscreencenter", "com.xiaomi.subscreencenter.SubScreenHome", true, false));
        assertEquals(RearHomeGuardPolicy.Decision.BLOCK, RearHomeGuardPolicy.evaluateStart(
            "com.xiaomi.subscreencenter", "com.xiaomi.subscreencenter.aod.AodActivity", true, false));
    }

    @Test
    public void withoutTheLeaseEveryStartPassesThrough() {
        assertEquals(RearHomeGuardPolicy.Decision.ALLOW, RearHomeGuardPolicy.evaluateStart(
            "com.xiaomi.subscreencenter", "com.xiaomi.subscreencenter.SubScreenLauncher", false, false));
    }

    @Test
    public void cameraGraceAllowsTheStart() {
        assertEquals(RearHomeGuardPolicy.Decision.ALLOW, RearHomeGuardPolicy.evaluateStart(
            "com.xiaomi.subscreencenter", "com.xiaomi.subscreencenter.SubScreenLauncher", true, true));
    }

    @Test
    public void nonRearCentreComponentsAreNeverBlocked() {
        assertEquals(RearHomeGuardPolicy.Decision.ALLOW, RearHomeGuardPolicy.evaluateStart(
            "com.miui.home", "com.miui.home.launcher.Launcher", true, false));
        assertEquals(RearHomeGuardPolicy.Decision.ALLOW, RearHomeGuardPolicy.evaluateStart(
            "com.android.systemui", "com.android.systemui.recents.RecentsActivity", true, false));
        // 近似包名欺骗不放行判断为命中
        assertEquals(RearHomeGuardPolicy.Decision.ALLOW, RearHomeGuardPolicy.evaluateStart(
            "com.xiaomi.subscreencenter.fake", "com.xiaomi.subscreencenter.fake.Launcher", true, false));
    }

    @Test
    public void unresolvedComponentStaysFailTransparent() {
        assertEquals(RearHomeGuardPolicy.Decision.ALLOW, RearHomeGuardPolicy.evaluateStart(null, null, true, false));
    }

    @Test
    public void moveIsBlockedOnlyForVerifiedRearCentreTasksOnTheLeasedDisplay() {
        assertEquals(RearHomeGuardPolicy.Decision.BLOCK, RearHomeGuardPolicy.evaluateMove(
            "com.xiaomi.subscreencenter", 1, 1, true, false));
        // 目标显示不是租约背屏：放行
        assertEquals(RearHomeGuardPolicy.Decision.ALLOW, RearHomeGuardPolicy.evaluateMove(
            "com.xiaomi.subscreencenter", 2, 1, true, false));
        // 任务顶层不是背屏中心（相机、其他应用）：绝不拦
        assertEquals(RearHomeGuardPolicy.Decision.ALLOW, RearHomeGuardPolicy.evaluateMove(
            "com.android.camera", 1, 1, true, false));
        // 身份解析失败（null）：放行
        assertEquals(RearHomeGuardPolicy.Decision.ALLOW, RearHomeGuardPolicy.evaluateMove(
            null, 1, 1, true, false));
        // 无租约：放行
        assertEquals(RearHomeGuardPolicy.Decision.ALLOW, RearHomeGuardPolicy.evaluateMove(
            "com.xiaomi.subscreencenter", 1, -1, false, false));
    }

    @Test
    public void componentRecognitionMatchesTheEvidence() {
        assertTrue(RearHomeGuardPolicy.isRearHomeComponent(
            "com.xiaomi.subscreencenter", "com.xiaomi.subscreencenter.SubScreenLauncher"));
        assertTrue(RearHomeGuardPolicy.isRearHomeComponent("com.xiaomi.subscreencenter", null));
        assertFalse(RearHomeGuardPolicy.isRearHomeComponent(
            "com.xiaomi.subscreencenter", "com.xiaomi.subscreencenter.WidgetHost"));
        assertFalse(RearHomeGuardPolicy.isRearHomeComponent("com.miui.home", "com.miui.home.Launcher"));
    }
}
