package io.github.huleixin.tingyu.lsp;

// android/app/src/main/java/io/github/huleixin/tingyu/lsp/RearFrontGuardPolicy.java
/**
 * 「把背屏前台让给系统背屏桌面」这条动作的纯逻辑判定。
 *
 * <h3>为什么需要它（1.3.61 真机日志的直接结论）</h3>
 * <pre>
 * startHooks=1, startSigs=[executeRequest(Request):int], startConsulted=13, rearHomeStartBlocked=0
 * moveHooks=1, moveSigs=[moveRootTaskToDisplay(int,int):void], moveConsulted=0
 * rootMoveHooks=1, rootMoveConsulted=0
 * dreamHooks=0
 * frontTask: rear=3 com.xiaomi.subscreencenter/.SubScreenLauncher
 * </pre>
 * 13 次 {@code executeRequest} 全部是我们自己的启动（`lastDecision` 里能看到
 * `pkg=io.github.huleixin.tingyu/.RearLyricsActivity`），迁移钩子一次都没被调用，
 * 而背屏前台在锁屏后变成了 <b>task=3</b> 的 SubScreenLauncher —— 一个**早就存在**的任务。
 *
 * <p>把这三件事放在一起，接管只可能是：背屏中心把自己的旧任务**提到前台**
 * （{@code ActivityTaskManagerService.moveTaskToFront}），或者系统在该显示上**恢复桌面**
 * （{@code TaskDisplayArea.resumeHomeActivity}）。两条路都不经过 `ActivityStarter.executeRequest`，
 * 也不经过 `moveRootTaskToDisplay` —— 这正是 1.3.61「钩子都装上了却从不命中」的原因。
 *
 * <p>判定只在本应用**真的持有背屏租约**（即歌词正在背屏显示）且无相机时成立；
 * 其余情况一律放行，连读都不读。
 */
final class RearFrontGuardPolicy {

    static final String REAR_CENTRE_PACKAGE = "com.xiaomi.subscreencenter";

    enum Path {
        /** 背屏中心把自己的任务提到前台（ActivityTaskManagerService.moveTaskToFront）。 */
        MOVE_TASK,
        /** 系统在租约背屏上恢复桌面（TaskDisplayArea.resumeHomeActivity）。 */
        RESUME_HOME
    }

    /**
     * @param leaseHeld       本应用是否正持有该背屏的歌词租约
     * @param cameraRecently  该背屏最近是否有相机
     * @param leasedDisplay   租约背屏 id（&lt;=0 表示没有）
     * @param targetDisplay   本次动作的目标显示；&lt;=0 表示无法解析
     * @param callerPackage   moveTaskToFront 的调用方包名（Binder 参数）
     * @param taskPackage     目标任务根 Activity 的包名（可为 null）
     * @param ownWindow      租约背屏上是否真的存在我们的窗口（窗口树探测结果）
     */
    static boolean block(Path path, boolean leaseHeld, boolean cameraRecently, int leasedDisplay,
                         int targetDisplay, String callerPackage, String taskPackage, boolean ownWindow) {
        if (!leaseHeld || cameraRecently) return false;
        if (leasedDisplay <= 0) return false;
        // 主屏（display 0）永远不干预：这是本功能最硬的一条边界。
        if (targetDisplay == 0) return false;
        if (path == Path.RESUME_HOME) {
            // 系统恢复桌面是「针对某个显示」的动作，没有任务身份可查，所以证据换成窗口：
            // 目标显示必须精确等于租约背屏，且我们的窗口确实在它的窗口树里。
            // 拿不到这个证据就不压 —— 宁可漏拦一次（应用侧还有 COVERED_RECOVERY 兜底），
            // 也不能把背屏压成黑屏。
            if (targetDisplay != leasedDisplay) return false;
            return ownWindow;
        }
        if (targetDisplay > 0 && targetDisplay != leasedDisplay) return false;
        // moveTaskToFront：任务身份优先于调用方身份。
        // 目标任务就是我们自己的歌词任务时永远放行（1.3.62 的 RearTaskRefront 走的正是这条路），
        // 只有当任务身份读不出来时才退回调用方包名。
        if (taskPackage != null) return REAR_CENTRE_PACKAGE.equals(taskPackage);
        return REAR_CENTRE_PACKAGE.equals(callerPackage);
    }

    private RearFrontGuardPolicy() {}
}
