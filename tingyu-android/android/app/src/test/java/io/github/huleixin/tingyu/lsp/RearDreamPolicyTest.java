package io.github.huleixin.tingyu.lsp;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/**
 * LSP 模式「背屏 AOD 条件共存」策略测试：只有背屏中心 Dream + 歌词租约持有 + 无相机
 * 这一种组合被阻止；其余全部放行，系统原生行为不受影响。纯 JVM。
 */
public class RearDreamPolicyTest {

    private static RearDreamPolicy.Decision evaluate(String pkg, boolean lease, boolean camera) {
        return RearDreamPolicy.evaluate(pkg, lease, camera);
    }

    @Test
    public void blocksOnlyTheRearCentreDreamWhileTheLeaseIsHeld() {
        assertEquals(RearDreamPolicy.Decision.BLOCK,
            evaluate("com.xiaomi.subscreencenter", true, false));
    }

    @Test
    public void withoutTheLeaseNativeRearAodRunsUntouched() {
        assertEquals(RearDreamPolicy.Decision.ALLOW,
            evaluate("com.xiaomi.subscreencenter", false, false));
    }

    @Test
    public void aCameraOnThePanelOutranksTheLyricsStage() {
        assertEquals(RearDreamPolicy.Decision.ALLOW,
            evaluate("com.xiaomi.subscreencenter", true, true));
    }

    @Test
    public void otherDreamsAreNeverTouched() {
        // 主屏 AOD、防烧屏、第三方 Dream 全部放行
        assertEquals(RearDreamPolicy.Decision.ALLOW, evaluate("com.miui.aod", true, false));
        assertEquals(RearDreamPolicy.Decision.ALLOW, evaluate("com.android.systemui", true, false));
        assertEquals(RearDreamPolicy.Decision.ALLOW, evaluate("com.some.other.dream", true, false));
        // 近似包名不算命中（前缀/后缀欺骗不放行）
        assertEquals(RearDreamPolicy.Decision.ALLOW,
            evaluate("com.xiaomi.subscreencenter.evil", true, false));
    }

    @Test
    public void anUnresolvableComponentStaysFailTransparent() {
        assertEquals(RearDreamPolicy.Decision.ALLOW, evaluate(null, true, false));
        assertEquals(RearDreamPolicy.Decision.ALLOW, evaluate("", true, false));
    }

    @Test
    public void packageNameOfReadsComponentNameShapes() {
        assertEquals("com.xiaomi.subscreencenter",
            RearDreamPolicy.packageNameOf("com.xiaomi.subscreencenter/.doze.DozeService"));
        assertEquals("com.xiaomi.subscreencenter", RearDreamPolicy.packageNameOf(
            "ComponentInfo{com.xiaomi.subscreencenter/com.xiaomi.subscreencenter.doze.DozeService}"));
        assertNull(RearDreamPolicy.packageNameOf("no-slash-no-brace"));
        assertNull(RearDreamPolicy.packageNameOf(null));
        assertNull(RearDreamPolicy.packageNameOf(""));
        assertNull(RearDreamPolicy.packageNameOf("ComponentInfo{broken"));
    }
}
