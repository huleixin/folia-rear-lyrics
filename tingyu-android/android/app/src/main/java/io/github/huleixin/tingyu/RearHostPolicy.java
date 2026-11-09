package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearHostPolicy.java
/**
 * 背屏中心宿主（RearHostHooks / RearHostView）的纯逻辑判定。
 *
 * <p>1.3.95 及以前，宿主只在「背屏中心自己创建了一张可见的 MAML 音乐卡片，且那张卡片的
 * MediaController 包名等于听屿」时才成立：{@code ownMedia()} 是硬前置，{@code eligible()}
 * 的第一个参数就是媒体包名。听屿正常播放时小米并不一定建卡，于是宿主永远接管失败。
 *
 * <p>1.3.96 曾将宿主搬进 launcher；1.3.105 已移除该覆盖层挂载路径。
 * 当前调用方必须先通过 {@link RearNativeCardPolicy} 的真实 MAML 卡片与听屿媒体身份校验，
 * 本类继续只负责显示会话、相机/AOD、电源及恢复预算，不能单独作为接管授权。
 *
 * <p>所有方法都不依赖 Android（{@code Display.STATE_ON == 2} 以字面量出现），可在 JVM
 * 单测中直接验证 —— 宿主最危险的几条规则（不抢屏、不无限重建）必须是可测的。
 */
final class RearHostPolicy {
    /** 同一个显示会话内允许重建宿主视图的次数；launcher 反复销毁时不允许无限重建。 */
    static final int MAX_REBINDS = 4;
    /** 同一个显示会话内允许主动请求背屏中心回到背屏的次数。 */
    static final int MAX_LAUNCH_REQUESTS = 2;
    /** 两次主动请求之间的最小间隔。 */
    static final long LAUNCH_GAP_MS = 6_000;
    /** 上滑手势与「宿主被隐藏」之间的最大时间差。 */
    static final long EXIT_WINDOW_MS = 1_500;
    /** Display.STATE_ON，避免为一条常量把纯逻辑拖进 Android 运行时。 */
    static final int STATE_ON = 2;

    private RearHostPolicy() {}
    /** Business availability is not a new draw/visibility verdict for an already active native host. */
    static boolean invalidatesDrawnState(String event,String mode){
        return "paused".equals(event)||"card-collapsed".equals(event)&&"HIDDEN".equals(mode);
    }

    static boolean requiresNewView(boolean exists,boolean closed,boolean sameActivity){
        return !exists || closed || !sameActivity;
    }

    static boolean mayWake(boolean current, boolean sleeping, boolean busy, boolean covered, boolean camera) {
        return current && !sleeping && !busy && !covered && !camera;
    }

    /** 显示会话 token 只允许 UUID 形态；空白、路径片段、超长串都不能成为宿主所有权。 */
    static boolean validSession(String value) {
        return value != null && value.matches("[a-zA-Z0-9-]{16,80}");
    }

    /** 宿主启动仍受应用侧同一条显示意图约束：token 未过期且当前允许呈现。 */
    static boolean mayStart(int requested, int current, boolean canPresent) {
        return requested == current && canPresent;
    }

    /**
     * 宿主视图此刻是否应该显示。
     *
     * @param requested 当前显示会话仍属于听屿（模块侧 lease 匹配）
     * @param suspended 相机或应用侧显式挂起
     * @param resumed   背屏中心 launcher 窗口处于 resumed
     * @param attached  听屿宿主视图已经挂在该窗口上
     * @param display   窗口所在显示 id；0/-1 表示不在背屏
     * @param state     该显示的 {@code Display#getState()}
     */
    static boolean render(boolean requested, boolean suspended, boolean resumed, boolean attached,
            int display, int state) {
        return requested && !suspended && resumed && attached && display > 0 && state == STATE_ON;
    }
    /** Display power pauses pixels, not card ownership. Explicit system-AOD preference/camera still release. */
    static boolean retainCardOwnership(boolean requested,boolean ownMedia,boolean attached,boolean suspended,boolean restoreSystemAod){
        return requested&&ownMedia&&attached&&!suspended&&!restoreSystemAod;
    }
    /** Outside the bounded AOD bridge, HIDDEN must not keep a cancelled/inactive card masked. */
    static boolean retainCardOwnership(boolean requested,boolean ownMedia,boolean attached,boolean suspended,
            boolean restoreSystemAod,boolean selected,int power){
        return selected&&power==STATE_ON&&retainCardOwnership(requested,ownMedia,attached,suspended,restoreSystemAod);
    }

    /**
     * 直接拦截到的上滑，只有在「宿主当时确实可交互」时才归因为用户退出：可见、未被相机/
     * 应用侧挂起、没有因为 AOD/熄屏停渲染。相机/AOD/熄屏期间 {@code canInteract()} 已经是
     * false，这里是第二道闸门 —— 任何一种「不是用户在看得见的歌词上滑动」的情况都不能
     * 结束显示会话，更不能顺手把 dismissed 写死。
     *
     * @param interactive 宿主当时可见且可交互
     * @param suspended   相机或应用侧挂起
     * @param sleeping    渲染因 AOD/熄屏暂停
     */
    static boolean userExit(boolean interactive, boolean suspended, boolean sleeping, long gestureAt, long now) {
        if (!interactive || suspended || sleeping) return false;
        return gestureAt >= 0 && now >= gestureAt && now - gestureAt <= EXIT_WINDOW_MS;
    }

    /**
     * 是否允许主动请求背屏中心回到背屏。
     *
     * <p>只在「窗口没挂上、未被挂起、launcher 当前不在前台、面板亮着」时成立，且只用于
     * <b>本次会话还没见过 launcher</b> 的冷启动：一旦观察到 launcher 被别的界面暂停过
     * （相机、用户打开别的背屏应用、AOD），就绝不把它拉回来 —— 那是用户/系统把背屏交给了
     * 别的东西，宿主没有资格抢。
     */
    static boolean mayLaunch(boolean attached, boolean suspended, boolean resumed, int display, int state,
            int attempts, long nextAt, long pausedAt, long now) {
        if (attached || suspended || resumed || display <= 0 || state != STATE_ON) return false;
        if (attempts >= MAX_LAUNCH_REQUESTS || now < nextAt) return false;
        return pausedAt <= 0;
    }

    /** 每个显示会话的重建预算是硬的：launcher 反复 onDestroy 不能变成无限重建。 */
    static boolean mayRebind(int rebinds) {
        return rebinds < MAX_REBINDS;
    }

    /**
     * 多进程注册的选择规则。
     *
     * <p>背屏中心可能同时在主进程和 {@code :subscreen} 等进程加载模块；每个进程都会主动
     * register。规则只有三条：当前 Binder 已死 → 接受；有显示会话 → 不换（换 Binder 会让
     * 已挂载的宿主视图失去所有者）；否则只接受不低于当前 priority 的注册。UI Hook 成功的
     * 进程 priority=2，仅通信可用的进程 priority=1，后者只在没有更好候选时承担诊断。
     *
     * @param currentPriority 当前 Binder 的优先级；-1 表示没有可用 Binder
     * @param alive           当前 Binder 是否仍活着
     * @param sessionActive   是否已经有一个显示会话绑在这个 Binder 上
     * @param incoming        新注册者的优先级
     */
    static boolean acceptRegistration(int currentPriority, boolean alive, boolean sessionActive, int incoming) {
        if (!alive) return true;
        if (sessionActive) return false;
        return incoming >= currentPriority;
    }

    /** 一行诊断：重建/请求预算用了多少（不参与显示判定）。 */
    static String describe(int rebinds, int launches) {
        return "rebinds=" + rebinds + "/" + MAX_REBINDS + ", launches=" + launches + "/" + MAX_LAUNCH_REQUESTS;
    }
}
