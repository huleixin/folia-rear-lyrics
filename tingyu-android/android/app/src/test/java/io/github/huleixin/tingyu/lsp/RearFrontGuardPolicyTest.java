package io.github.huleixin.tingyu.lsp;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * 「压住系统背屏桌面抢前台」的判定测试。
 *
 * <p>被覆盖的真实错误路径：1.3.61 的钩子挂在 {@code executeRequest} 与
 * {@code moveRootTaskToDisplay} 上，而真机日志显示这两个位置一次都没被接管路径经过
 * （{@code startConsulted=13} 全是我们自己的启动、{@code moveConsulted=0}），
 * 背屏前台变成一个**早就存在**的 {@code task=3 SubScreenLauncher}。
 *
 * <p>这里钉住的是判定边界：只有「租约持有 + 无相机 + 目标就是租约背屏 + 能正向识别为
 * 背屏中心」才允许拦；主屏、其它应用、本应用自己的置顶永远放行。
 */
public class RearFrontGuardPolicyTest {

    private static final boolean HELD = true;
    private static final boolean NO_CAMERA = false;
    private static final int REAR = 1;
    private static final String CENTRE = RearFrontGuardPolicy.REAR_CENTRE_PACKAGE;
    private static final String OURS = "io.github.huleixin.tingyu";

    private static boolean move(boolean held, boolean camera, int leased, int target,
                                String caller, String task) {
        return RearFrontGuardPolicy.block(RearFrontGuardPolicy.Path.MOVE_TASK,
            held, camera, leased, target, caller, task, false);
    }

    private static boolean home(boolean held, boolean camera, int leased, int target, boolean ownWindow) {
        return RearFrontGuardPolicy.block(RearFrontGuardPolicy.Path.RESUME_HOME,
            held, camera, leased, target, null, null, ownWindow);
    }

    @Test
    public void theRearCentreBringingItsOwnTaskForwardIsBlocked() {
        assertTrue(move(HELD, NO_CAMERA, REAR, REAR, CENTRE, CENTRE));
        // 调用方解析不到、但任务根 Activity 是背屏中心：同样命中。
        assertTrue(move(HELD, NO_CAMERA, REAR, REAR, null, CENTRE));
        // 目标显示解析不到（-1）：仍然按「背屏中心的任务」拦，这正是 1.3.61 漏掉的情形。
        assertTrue(move(HELD, NO_CAMERA, REAR, -1, CENTRE, null));
    }

    @Test
    public void ourOwnRefrontIsNeverBlocked() {
        // 1.3.62 起应用侧用 moveTaskToFront 恢复自己的任务，绝不能被自己的系统钩子拦掉。
        assertFalse(move(HELD, NO_CAMERA, REAR, REAR, OURS, OURS));
        assertFalse(move(HELD, NO_CAMERA, REAR, REAR, CENTRE, OURS));
    }

    @Test
    public void theMainDisplayAndOtherDisplaysAreNeverTouched() {
        // 目标显示明确不是租约背屏：一律放行，即使调用方就是背屏中心。
        assertFalse(move(HELD, NO_CAMERA, REAR, 0, CENTRE, CENTRE));
        assertFalse(move(HELD, NO_CAMERA, REAR, 2, CENTRE, CENTRE));
        assertFalse(home(HELD, NO_CAMERA, REAR, 0, true));
    }

    @Test
    public void noLeaseOrACameraMeansPurePassthrough() {
        assertFalse(move(false, NO_CAMERA, REAR, REAR, CENTRE, CENTRE));
        assertFalse(move(HELD, true, REAR, REAR, CENTRE, CENTRE));
        assertFalse(home(false, NO_CAMERA, REAR, REAR, true));
        assertFalse(home(HELD, true, REAR, REAR, true));
        // 租约背屏 id 不可用：没有可保护的目标，一律放行。
        assertFalse(move(HELD, NO_CAMERA, -1, REAR, CENTRE, CENTRE));
    }

    @Test
    public void resumingHomeOnOurDisplayNeedsOurWindowAsProof() {
        // 窗口确实在租约背屏上：压住桌面，否则锁屏瞬间就会被背屏桌面盖掉。
        assertTrue(home(HELD, NO_CAMERA, REAR, REAR, true));
        // 窗口不在（或探测不到）：不压 —— 否则可能把背屏压成黑屏，代价比漏拦大得多。
        assertFalse(home(HELD, NO_CAMERA, REAR, REAR, false));
        // 目标显示读不到时也不压：无法证明是我们的显示。
        assertFalse(home(HELD, NO_CAMERA, REAR, -1, true));
    }
}
