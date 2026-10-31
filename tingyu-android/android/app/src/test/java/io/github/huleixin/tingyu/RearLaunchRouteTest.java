package io.github.huleixin.tingyu;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * 锁屏路线判定测试。
 *
 * <p>被覆盖的真实回归（1.3.39 真机可用 → 1.3.59+ 不可用）：
 * <pre>
 * 1.3.39  reuse = (!locked || lsp || preserve) &amp;&amp; attached
 * 1.3.59+ reuse = (!locked || lsp || preserve || planA) &amp;&amp; attached
 * </pre>
 * {@code planA} 默认 true 之后，锁屏 + Shizuku 永远复用旧窗口，
 * 「Display 0 暂存 → move-stack」这条唯一在真机上验证过能穿锁屏的路径再也没被执行过。
 * 这里的断言就是把这个布尔量钉死。
 */
public class RearLaunchRouteTest {

    private static final boolean ATTACHED = true;
    private static final boolean DETACHED = false;
    private static final boolean VISIBLE = true;
    private static final boolean HIDDEN = false;
    private static final boolean LOCKED = true;
    private static final boolean UNLOCKED = false;
    private static final boolean PLAN_A = true;
    private static final boolean LEGACY = false;

    @Test
    public void unlockedAlwaysReusesWhateverIsAttached() {
        assertEquals(RearLaunchRoute.Route.REUSE,
            RearLaunchRoute.decide(ATTACHED, VISIBLE, UNLOCKED, PLAN_A, RearLaunchRoute.Mode.AUTO));
        assertEquals(RearLaunchRoute.Route.REUSE,
            RearLaunchRoute.decide(ATTACHED, HIDDEN, UNLOCKED, PLAN_A, RearLaunchRoute.Mode.REUSE));
        assertEquals(RearLaunchRoute.Route.DIRECT,
            RearLaunchRoute.decide(DETACHED, HIDDEN, UNLOCKED, PLAN_A, RearLaunchRoute.Mode.AUTO));
    }

    /**
     * 这条就是回归本身：锁屏、Shizuku、窗口还在但被背屏桌面盖住 —— 必须走迁移。
     *
     * <p>1.3.59~1.3.64 在这里返回 REUSE，于是 {@code if (reuse)} 提前 return，
     * 迁移代码成为死代码。
     */
    @Test
    public void aCoveredWindowWhileLockedMustMigrate() {
        assertEquals(RearLaunchRoute.Route.MIGRATE,
            RearLaunchRoute.decide(ATTACHED, HIDDEN, LOCKED, PLAN_A, RearLaunchRoute.Mode.AUTO));
    }

    @Test
    public void aWindowThatIsStillVisibleIsNeverRebuilt() {
        assertEquals(RearLaunchRoute.Route.REUSE,
            RearLaunchRoute.decide(ATTACHED, VISIBLE, LOCKED, PLAN_A, RearLaunchRoute.Mode.AUTO));
    }

    @Test
    public void aMissingWindowWhileLockedAlsoMigrates() {
        // 1.3.39 的 locked &amp;&amp; !reuse 分支同样覆盖「窗口不存在」：先在 Display 0 建出来再搬。
        assertEquals(RearLaunchRoute.Route.MIGRATE,
            RearLaunchRoute.decide(DETACHED, HIDDEN, LOCKED, PLAN_A, RearLaunchRoute.Mode.AUTO));
    }

    @Test
    public void theLegacyEngineIsThe139Semantics() {
        // 旧引擎（planA=false）就是 1.3.39 的判定：锁屏一律重建再迁移。
        assertEquals(RearLaunchRoute.Route.MIGRATE,
            RearLaunchRoute.decide(ATTACHED, VISIBLE, LOCKED, LEGACY, RearLaunchRoute.Mode.AUTO));
        assertEquals(RearLaunchRoute.Route.MIGRATE,
            RearLaunchRoute.decide(DETACHED, HIDDEN, LOCKED, LEGACY, RearLaunchRoute.Mode.REUSE));
    }

    @Test
    public void modeReuseIsTheOldBehaviourAndNeverMigrates() {
        // A 侧对照：只让旧任务回前台。真机用它证明「A 单独确实不行」。
        assertEquals(RearLaunchRoute.Route.REUSE,
            RearLaunchRoute.decide(ATTACHED, HIDDEN, LOCKED, PLAN_A, RearLaunchRoute.Mode.REUSE));
        assertEquals(RearLaunchRoute.Route.DIRECT,
            RearLaunchRoute.decide(DETACHED, HIDDEN, LOCKED, PLAN_A, RearLaunchRoute.Mode.REUSE));
    }

    @Test
    public void modeMigrateForcesTheHistoricalPath() {
        // B 侧对照：无条件迁移，即使窗口看起来还在。
        assertEquals(RearLaunchRoute.Route.MIGRATE,
            RearLaunchRoute.decide(ATTACHED, VISIBLE, LOCKED, PLAN_A, RearLaunchRoute.Mode.MIGRATE));
        assertEquals(RearLaunchRoute.Route.MIGRATE,
            RearLaunchRoute.decide(DETACHED, HIDDEN, LOCKED, PLAN_A, RearLaunchRoute.Mode.MIGRATE));
    }

    @Test
    public void theModeValueRoundTripsAndFallsBackToAuto() {
        assertEquals(RearLaunchRoute.Mode.AUTO, RearLaunchRoute.Mode.of("auto"));
        assertEquals(RearLaunchRoute.Mode.REUSE, RearLaunchRoute.Mode.of("reuse"));
        assertEquals(RearLaunchRoute.Mode.MIGRATE, RearLaunchRoute.Mode.of("migrate"));
        // 未知/空值一律回落到默认，不抛异常：这个值来自持久化设置，可能被旧版本写坏。
        assertEquals(RearLaunchRoute.Mode.AUTO, RearLaunchRoute.Mode.of(null));
        assertEquals(RearLaunchRoute.Mode.AUTO, RearLaunchRoute.Mode.of(""));
        assertEquals(RearLaunchRoute.Mode.AUTO, RearLaunchRoute.Mode.of("legacy"));
    }

    @Test
    public void aNullModeBehavesLikeAuto() {
        assertEquals(RearLaunchRoute.Route.MIGRATE,
            RearLaunchRoute.decide(ATTACHED, HIDDEN, LOCKED, PLAN_A, null));
    }

    @Test
    public void theCameraAndTheUserAlwaysWin() {
        // 相机占用背屏、或用户关了歌词：两条路线都不允许接管。
        assertFalse(RearLaunchRoute.allowedWhenLocked(RearLaunchRoute.Route.MIGRATE, true, true));
        assertFalse(RearLaunchRoute.allowedWhenLocked(RearLaunchRoute.Route.REUSE, true, true));
        assertFalse(RearLaunchRoute.allowedWhenLocked(RearLaunchRoute.Route.MIGRATE, false, false));
        assertFalse(RearLaunchRoute.allowedWhenLocked(RearLaunchRoute.Route.DIRECT, false, true));
        assertTrue(RearLaunchRoute.allowedWhenLocked(RearLaunchRoute.Route.MIGRATE, false, true));
        assertTrue(RearLaunchRoute.allowedWhenLocked(RearLaunchRoute.Route.REUSE, false, true));
    }

    @Test
    public void theDiagnosticLineNamesTheDecisionAndItsInputs() {
        String text = RearLaunchRoute.describe(RearLaunchRoute.Mode.AUTO,
            RearLaunchRoute.Route.MIGRATE, ATTACHED, HIDDEN, LOCKED);
        assertTrue(text, text.contains("lockedRoute=auto"));
        assertTrue(text, text.contains("->MIGRATE"));
        assertTrue(text, text.contains("attached=true"));
        assertTrue(text, text.contains("visible=false"));
    }
}
