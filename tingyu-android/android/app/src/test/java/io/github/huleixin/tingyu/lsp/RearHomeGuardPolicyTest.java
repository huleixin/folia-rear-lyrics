package io.github.huleixin.tingyu.lsp;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * 锁屏背屏接管拦截的纯逻辑测试。证据链（REAREye SubScreenBackHomeWhitelistModule）：
 * 锁屏 + 背屏息屏开启 → 背屏中心以 reason="aod" 把 SubScreenLauncher 拉到背屏 Display。
 *
 * <p>三条必须同时成立，否则真机就是「永远放行」：
 * <ul>
 *   <li>HOME 意图（无显式组件）落在租约背屏上也算接管；</li>
 *   <li>目标显示是主屏或其它显示时，无论包名多像都放行；</li>
 *   <li>目标显示解析不出来时只拦明确识别为背屏桌面组件的启动。</li>
 * </ul>
 */
public class RearHomeGuardPolicyTest {

    private static RearHomeGuardPolicy.Decision start(String pkg, String cls, boolean home,
            int launchDisplay, boolean held, boolean camera) {
        return RearHomeGuardPolicy.evaluateStart(pkg, cls, home, launchDisplay, 1, held, camera);
    }

    @Test
    public void blocksTheRearCentreLauncherStartWhileTheLeaseIsHeld() {
        assertEquals(RearHomeGuardPolicy.Decision.BLOCK, start(
            "com.xiaomi.subscreencenter", "com.xiaomi.subscreencenter.SubScreenLauncher", false, 1, true, false));
        assertEquals(RearHomeGuardPolicy.Decision.BLOCK, start(
            "com.xiaomi.subscreencenter", "com.xiaomi.subscreencenter.SubScreenHome", false, 1, true, false));
        assertEquals(RearHomeGuardPolicy.Decision.BLOCK, start(
            "com.xiaomi.subscreencenter", "com.xiaomi.subscreencenter.aod.AodActivity", false, 1, true, false));
    }

    @Test
    public void aHomeIntentOnTheLeasedDisplayIsATakeover() {
        // 背屏桌面通常以 HOME 意图启动：intent 没有 component，包名解析为 null。
        assertEquals(RearHomeGuardPolicy.Decision.BLOCK, start(null, null, true, 1, true, false));
        assertEquals(RearHomeGuardPolicy.Decision.BLOCK, start(
            "com.xiaomi.subscreencenter", null, true, 1, true, false));
    }

    @Test
    public void theMainDisplayHomeIsNeverTouched() {
        assertEquals(RearHomeGuardPolicy.Decision.ALLOW, start(null, null, true, 0, true, false));
        assertEquals(RearHomeGuardPolicy.Decision.ALLOW, start(
            "com.xiaomi.subscreencenter", "com.xiaomi.subscreencenter.SubScreenLauncher", false, 0, true, false));
        assertEquals(RearHomeGuardPolicy.Decision.ALLOW, start(
            "com.miui.home", "com.miui.home.launcher.Launcher", true, 0, true, false));
        // 其它副屏（例如外接屏）同样不碰
        assertEquals(RearHomeGuardPolicy.Decision.ALLOW, start(null, null, true, 2, true, false));
    }

    @Test
    public void unresolvedTargetDisplayOnlyBlocksAPositivelyIdentifiedRearHome() {
        // 解析不出目标显示：HOME 意图放行（不能拿主屏桌面冒险），明确的背屏桌面组件才拦
        assertEquals(RearHomeGuardPolicy.Decision.ALLOW, start(null, null, true, -1, true, false));
        assertEquals(RearHomeGuardPolicy.Decision.BLOCK, start(
            "com.xiaomi.subscreencenter", "com.xiaomi.subscreencenter.SubScreenLauncher", false, -1, true, false));
    }

    @Test
    public void withoutTheLeaseEveryStartPassesThrough() {
        assertEquals(RearHomeGuardPolicy.Decision.ALLOW, start(
            "com.xiaomi.subscreencenter", "com.xiaomi.subscreencenter.SubScreenLauncher", false, 1, false, false));
        assertEquals(RearHomeGuardPolicy.Decision.ALLOW, start(null, null, true, 1, false, false));
    }

    @Test
    public void cameraGraceAllowsTheStart() {
        assertEquals(RearHomeGuardPolicy.Decision.ALLOW, start(
            "com.xiaomi.subscreencenter", "com.xiaomi.subscreencenter.SubScreenLauncher", false, 1, true, true));
    }

    @Test
    public void noLeasedDisplayMeansNoInterference() {
        assertEquals(RearHomeGuardPolicy.Decision.ALLOW, RearHomeGuardPolicy.evaluateStart(
            "com.xiaomi.subscreencenter", "com.xiaomi.subscreencenter.SubScreenLauncher", false, 1, -1, true, false));
    }

    @Test
    public void nonRearCentreComponentsAreNeverBlocked() {
        assertEquals(RearHomeGuardPolicy.Decision.ALLOW, start(
            "com.miui.home", "com.miui.home.launcher.Launcher", true, 1, true, false));
        assertEquals(RearHomeGuardPolicy.Decision.ALLOW, start(
            "com.android.systemui", "com.android.systemui.recents.RecentsActivity", false, 1, true, false));
        // 近似包名欺骗不放行判断为命中
        assertEquals(RearHomeGuardPolicy.Decision.ALLOW, start(
            "com.xiaomi.subscreencenter.fake", "com.xiaomi.subscreencenter.fake.Launcher", false, 1, true, false));
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
