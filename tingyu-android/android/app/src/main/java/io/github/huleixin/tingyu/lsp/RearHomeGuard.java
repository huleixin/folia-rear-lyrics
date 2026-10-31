package io.github.huleixin.tingyu.lsp;

import android.content.ComponentName;
import android.content.Intent;
import java.lang.reflect.Method;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;

// android/app/src/main/java/io/github/huleixin/tingyu/lsp/RearHomeGuard.java
/**
 * system_server 内对「锁屏背屏接管真实路径」的拦截（REAREye 证据：背屏中心以
 * reason="aod" 调自己的 home-to-front 把 SubScreenLauncher 拉到背屏）。
 *
 * <p>v1.3.59 的四处缺陷与对应修正：
 * <ol>
 *   <li><b>只认显式组件名</b>：背屏桌面多以 HOME 意图启动（无 component），旧判定拿到
 *       null 包名就放行。现在把 HOME 意图与目标显示一起判定（见 RearHomeGuardPolicy）。</li>
 *   <li><b>只看 intent，不看请求</b>：新版本 {@code executeRequest} 仍带 {@code Request}
 *       参数，但不同固件可能是无参方法（请求在 {@code mRequest} 字段）。现在两种签名都取，
 *       取不到就明确计入 {@code startUnresolved}，不再是静默放行。</li>
 *   <li><b>迁移只挂 ATMS</b>：真正搬任务的是 {@link com.android.server.wm.RootWindowContainer}，
 *       现在两条路径都挂（{@code moveRootTaskToDisplay} 的实现层是最靠内的漏斗）。</li>
 *   <li><b>零命中不可见</b>：所有 hook 的匹配数、调用数、拦截数、无法解析数全部计数上报，
 *       {@code startHooks=0} 能一眼看出固件路径不同。</li>
 * </ol>
 *
 * <p>v1.3.60 修正：
 * <ul>
 *   <li>{@link #topPackageOf} 不再把 {@code getAllRootTaskInfos()} 的 {@code List} 强转成
 *       {@code Object[]}（那次强转必然抛 ClassCastException 并被吞掉，导致迁移拦截在真机上
 *       从未命中）。解析移到可单测的 {@link RootTaskLookup}。</li>
 *   <li>安装时把真实方法签名记进诊断（名称+参数类型+返回类型），并记录每次放行的原因，
 *       真机日志可以直接回答「到底有没有挂钩上、挂的是哪个重载」。</li>
 *   <li>HOME 判定收紧为 {@code CATEGORY_HOME}：不再把任意无组件的 ACTION_MAIN 当作 HOME，
 *       避免误伤主屏上以 MAIN 意图发起的启动。</li>
 * </ul>
 *
 * <p>只在歌词租约有效、无相机宽限期时干预；租约释放后所有 hook 回到纯透传。系统的
 * 「背屏息屏」开关从未被改动，主屏桌面与其它显示的启动永远不碰。
 */
final class RearHomeGuard {
    private boolean installed;
    /**
     * 三条安装路径分开记错误。
     *
     * <p>1.3.61 用一个 {@code failed} 同时表示「executeRequest 装失败」「迁移钩子装失败」
     * 「零命中」，日志只能看到 {@code homeHookError=true}，无法定位。现在每一路都有原文。
     */
    private volatile String startError = "", moveError = "", rootError = "";
    private volatile int startHooks, moveHooks, rootMoveHooks;
    private volatile int startConsulted, startBlocked, startUnresolved, startCameraAllowed, startOtherDisplay;
    private volatile int moveConsulted, moveBlocked, rootMoveConsulted, rootMoveBlocked;
    private volatile int moveUnresolved, moveAbsent, moveUnreadable, moveSkipped, startSkipped;
    private volatile String startSignatures = "none", moveSignatures = "none", rootMoveSignatures = "none";
    private volatile String abortCode = "unresolved";
    private volatile String lastDecision = "not consulted";
    private volatile String lastRootContainer = "not queried";
    private volatile boolean loggedFirstStart, loggedFirstMove;

    void install(ClassLoader loader, RearLeaseView lease) {
        installStartGuard(loader, lease);
        try {
            Class<?> atms = XposedHelpers.findClass("com.android.server.wm.ActivityTaskManagerService", loader);
            moveHooks = hookMoves(atms, lease, false);
            moveSignatures = describe("moveRootTaskToDisplay", atms);
            if (moveHooks == 0) moveError = "no moveRootTaskToDisplay on ATMS; declared=" + declared(atms);
        } catch (Throwable error) { moveError = text(error); }
        try {
            Class<?> roots = XposedHelpers.findClass("com.android.server.wm.RootWindowContainer", loader);
            rootMoveHooks = hookMoves(roots, lease, true);
            rootMoveSignatures = describe("moveRootTaskToDisplay", roots);
            if (rootMoveHooks == 0) rootError = "no moveRootTaskToDisplay on RootWindowContainer; declared=" + declared(roots);
        } catch (Throwable error) { rootError = text(error); }
        installed = startHooks > 0 || moveHooks > 0 || rootMoveHooks > 0;
    }

    private void installStartGuard(ClassLoader loader, RearLeaseView lease) {
        try {
            Class<?> starter = XposedHelpers.findClass("com.android.server.wm.ActivityStarter", loader);
            XC_MethodHook guard = new XC_MethodHook() {
                @Override protected void beforeHookedMethod(MethodHookParam hook) {
                    try {
                        startConsulted++;
                        Object request = requestOf(hook);
                        if (request == null) { startUnresolved++; return; }
                        Intent intent = (Intent) field(request, "intent");
                        if (intent == null) { startUnresolved++; return; }
                        if (startConsulted == 1 && !loggedFirstStart) {
                            loggedFirstStart = true;
                            XposedBridge.log("Tingyu rear home guard: start path consulted, args="
                                + signature(hook.args) + ", request=" + request.getClass().getName()
                                + ", hooks=" + startSignatures);
                        }
                        ComponentName component = intent.getComponent();
                        String pkg = component == null ? null : component.getPackageName();
                        String cls = component == null ? null : component.getClassName();
                        int launchDisplay = launchDisplayOf(request);
                        boolean home = isHomeIntent(intent);
                        boolean held = lease.lyricsLeaseHeld();
                        boolean camera = lease.cameraRecentlyOnLeasedDisplay();
                        RearHomeGuardPolicy.Decision decision = RearHomeGuardPolicy.evaluateStart(
                            pkg, cls, home, launchDisplay, lease.leasedDisplayId(), held, camera);
                        if (decision != RearHomeGuardPolicy.Decision.BLOCK) {
                            if (camera) startCameraAllowed++;
                            else if (launchDisplay >= 0 && launchDisplay != lease.leasedDisplayId()) startOtherDisplay++;
                            lastDecision = "allow start pkg=" + pkg + "/" + cls + ", home=" + home
                                + ", display=" + launchDisplay + ", held=" + held + ", camera=" + camera;
                            return;
                        }
                        // 只有 int 返回值的重载才能安全地「不启动」；其它返回类型宁可放行，
                        // 也不要在 system_server 里制造一个无法解释的返回。
                        if (returnTypeOf(hook) != int.class) {
                            startSkipped++;
                            lastDecision = "cannot-abort start pkg=" + pkg + "/" + cls
                                + " return=" + returnTypeOf(hook).getSimpleName();
                            return;
                        }
                        startBlocked++;
                        lastDecision = "blocked rear-home start pkg=" + pkg + "/" + cls + ", home=" + home
                            + ", display=" + launchDisplay;
                        XposedBridge.log("Tingyu rear home guard: " + lastDecision);
                        hook.setResult(abortResult(loader));
                    } catch (Throwable error) { logOnce("start", error); }
                }
            };
            XposedBridge.hookAllMethods(starter, "executeRequest", guard);
            startHooks = countMethods(starter, "executeRequest");
            startSignatures = describe("executeRequest", starter);
            if (startHooks == 0) startError = "no executeRequest on ActivityStarter; declared=" + declared(starter);
        } catch (Throwable error) { startError = text(error); }
    }

    /** 同一条迁移逻辑挂两个类：ATMS 的入口与 RootWindowContainer 的实现。 */
    private int hookMoves(Class<?> owner, RearLeaseView lease, boolean root) {
        XC_MethodHook guard = new XC_MethodHook() {
            @Override protected void beforeHookedMethod(MethodHookParam hook) {
                try {
                    if (root) rootMoveConsulted++; else moveConsulted++;
                    if (!loggedFirstMove) {
                        loggedFirstMove = true;
                        XposedBridge.log("Tingyu rear home guard: move path consulted on "
                            + owner.getSimpleName() + ", args=" + signature(hook.args)
                            + ", hooks=" + (root ? rootMoveSignatures : moveSignatures));
                    }
                    int task = intArg(hook.args, 0);
                    int display = intArg(hook.args, 1);
                    if (task <= 0) { moveUnresolved++; return; }
                    if (!lease.lyricsLeaseHeld() || display != lease.leasedDisplayId()) {
                        lastDecision = "allow move task=" + task + " display=" + display + " (no lease/other display)";
                        return;
                    }
                    if (lease.cameraRecentlyOnLeasedDisplay()) {
                        lastDecision = "allow move task=" + task + " (camera grace)";
                        return;
                    }
                    RootTaskLookup.Result identity = topPackageOf(task);
                    if (!identity.found()) {
                        if (identity.status == RootTaskLookup.Status.ABSENT) moveAbsent++;
                        else moveUnreadable++;
                        lastDecision = "allow move task=" + task + " (" + identity.status.name().toLowerCase(java.util.Locale.ROOT) + ")";
                        return;
                    }
                    RearHomeGuardPolicy.Decision decision =
                        RearHomeGuardPolicy.evaluateMove(identity.packageName, display, lease.leasedDisplayId(), true, false);
                    if (decision != RearHomeGuardPolicy.Decision.BLOCK) {
                        lastDecision = "allow move task=" + task + " top=" + identity.packageName;
                        return;
                    }
                    // 返回 void 的重载用 null 取消；boolean 重载返回 false。其它返回类型无法
                    // 安全表达「没有搬」，此时放行并计入 moveSkipped，而不是去猜。
                    Class<?> returns = returnTypeOf(hook);
                    if (returns != void.class && returns != boolean.class) {
                        moveSkipped++;
                        lastDecision = "cannot-abort move task=" + task + " return=" + returns.getSimpleName();
                        return;
                    }
                    if (root) rootMoveBlocked++; else moveBlocked++;
                    lastDecision = "blocked rear-home move on " + owner.getSimpleName()
                        + " task=" + task + " top=" + identity.packageName + " display=" + display;
                    XposedBridge.log("Tingyu rear home guard: " + lastDecision);
                    hook.setResult(returns == void.class ? null : Boolean.FALSE);
                } catch (Throwable error) { logOnce("move", error); }
            }
        };
        XposedBridge.hookAllMethods(owner, "moveRootTaskToDisplay", guard);
        return countMethods(owner, "moveRootTaskToDisplay");
    }

    /** 被挂钩方法的返回类型；{@code MethodHookParam.method} 是 {@code Member}，需要转型。 */
    private static Class<?> returnTypeOf(XC_MethodHook.MethodHookParam hook) {
        java.lang.reflect.Member member = hook.method;
        return member instanceof Method ? ((Method) member).getReturnType() : void.class;
    }

    private static int intArg(Object[] args, int index) {
        if (args == null || index >= args.length) return -1;
        Object value = args[index];
        return value instanceof Integer ? (Integer) value : -1;
    }

    /**
     * {@code executeRequest(Request)} 与无参版本（请求在 {@code mRequest}）都能取到请求。
     *
     * <p>先按类型名认 {@code *Request} 参数，再退回第一个参数，最后读字段：不同固件把
     * Request 放在第 0 位、带上 startFlags 重载或干脆放进字段，这三种都出现过。
     */
    private static Object requestOf(XC_MethodHook.MethodHookParam hook) {
        if (hook.args != null) {
            for (Object arg : hook.args) {
                if (arg == null) continue;
                String name = arg.getClass().getName();
                if (name.endsWith("Request") || name.endsWith("$Request")) return arg;
            }
            if (hook.args.length > 0 && hook.args[0] != null) return hook.args[0];
        }
        for (String field : new String[] { "mRequest", "mLastStartRequestForBackgroundActivity" }) {
            try {
                Object value = XposedHelpers.getObjectField(hook.thisObject, field);
                if (value != null) return value;
            } catch (Throwable ignored) { /* Field name differs across releases. */ }
        }
        return null;
    }

    private static Object field(Object owner, String name) {
        try { return XposedHelpers.getObjectField(owner, name); }
        catch (Throwable error) { return null; }
    }

    /**
     * 本次启动的目标显示。{@code Request.activityOptions} 是 {@code SafeActivityOptions}，
     * 先取原始 ActivityOptions 再读 launchDisplayId；解析失败返回 -1（判定层按「未知」放行）。
     */
    private int launchDisplayOf(Object request) {
        Object safe = field(request, "activityOptions");
        if (safe == null) return -1;
        Object options = null;
        try { options = XposedHelpers.callMethod(safe, "getOriginalOptions"); }
        catch (Throwable ignored) { /* Older builds may expose the options directly. */ }
        if (options == null) options = field(safe, "mOriginalOptions");
        if (options == null) options = safe;
        try {
            Object id = XposedHelpers.callMethod(options, "getLaunchDisplayId");
            if (id instanceof Integer) return (Integer) id;
        } catch (Throwable ignored) { /* Not an ActivityOptions. */ }
        return -1;
    }

    /**
     * 只认 {@code CATEGORY_HOME}。旧实现把「ACTION_MAIN 且无组件」也算 HOME，那会把任何
     * 隐式 MAIN 启动（主屏上完全合法）卷进来；主屏安全优先，这里收紧。
     */
    private static boolean isHomeIntent(Intent intent) {
        try {
            java.util.Set<String> categories = intent.getCategories();
            return categories != null && categories.contains(Intent.CATEGORY_HOME);
        } catch (Throwable error) { return false; }
    }

    private int countMethods(Class<?> owner, String name) {
        try {
            int count = 0;
            for (Method method : owner.getDeclaredMethods()) if (method.getName().equals(name)) count++;
            return count;
        } catch (Throwable error) { return -1; }
    }

    /** 「名称(参数类型):返回类型」，安装时记一次，真机日志可据此判断挂的是哪个重载。 */
    private static String describe(String name, Class<?> owner) {
        try {
            StringBuilder text = new StringBuilder();
            for (Method method : owner.getDeclaredMethods()) {
                if (!method.getName().equals(name)) continue;
                if (text.length() > 0) text.append(" | ");
                text.append(method.getName()).append('(');
                Class<?>[] types = method.getParameterTypes();
                for (int i = 0; i < types.length; i++) {
                    if (i > 0) text.append(',');
                    text.append(types[i].getSimpleName());
                }
                text.append("):").append(method.getReturnType().getSimpleName());
            }
            return text.length() == 0 ? "none" : text.toString();
        } catch (Throwable error) { return "unreadable"; }
    }

    /**
     * executeRequest 的正常返回是 {@code @StartResult}；拦截时应返回「未启动」。
     * 依次尝试 {@code START_ABORTED}（ActivityManager / ActivityStarter），最后退化为 -1，
     * 并把实际取到的值记进诊断 —— 没有任何一处是猜的。
     */
    private int abortResult(ClassLoader loader) {
        for (String owner : new String[] { "android.app.ActivityManager", "com.android.server.wm.ActivityStarter" }) {
            try {
                int value = XposedHelpers.getStaticIntField(
                    XposedHelpers.findClass(owner, loader), "START_ABORTED");
                abortCode = "START_ABORTED(" + value + ")@" + owner;
                return value;
            } catch (Throwable ignored) { /* next candidate */ }
        }
        abortCode = "fallback(-1)";
        return -1; // A cancelled start: never START_SUCCESS(0), which would lie to the caller.
    }

    /**
     * 任务顶层包名。
     *
     * <p>v1.3.59 在这里写的是 {@code (Object[]) ...getAllRootTaskInfos()}，而该方法的真实返回
     * 类型是 {@code List<RootTaskInfo>}：强转必然抛 {@code ClassCastException}，被
     * {@code catch (Throwable ignored)} 吞掉后返回 null，判定层再把 null 当「身份未知」放行。
     * 结果是迁移拦截在真机上 100% 未命中，而且没有任何计数器能暴露它。
     *
     * <p>现在交给 {@link RootTaskLookup} 处理 List / 数组两种形态，并区分
     * FOUND / ABSENT / UNREADABLE；只有 FOUND 才可能被拦。
     */
    private RootTaskLookup.Result topPackageOf(int taskId) {
        try {
            Object atm = Class.forName("android.app.ActivityTaskManager").getMethod("getService").invoke(null);
            Object roots = Class.forName("android.app.IActivityTaskManager")
                .getMethod("getAllRootTaskInfos").invoke(atm);
            lastRootContainer = RootTaskLookup.describeContainer(roots);
            return RootTaskLookup.topPackageOf(roots, taskId);
        } catch (Throwable error) {
            lastRootContainer = "query-failed:" + error.getClass().getSimpleName();
            return RootTaskLookup.Result.UNREADABLE;
        }
    }

    private static String signature(Object[] args) {
        StringBuilder text = new StringBuilder();
        if (args != null) for (Object arg : args) {
            if (text.length() > 0) text.append(", ");
            text.append(arg == null ? "null" : arg.getClass().getName());
        }
        return "[" + text + "]";
    }

    boolean installed() { return installed; }

    String status() {
        return "rearHomeHook=" + installed + ", homeHookError=" + !startError.isEmpty()
            + (startError.isEmpty() ? "" : "(" + startError + ")")
            + (moveError.isEmpty() ? "" : ", homeMoveError=" + moveError)
            + (rootError.isEmpty() ? "" : ", homeRootError=" + rootError)
            + ", startHooks=" + startHooks + ", startSigs=[" + startSignatures + "]"
            + ", startConsulted=" + startConsulted
            + ", rearHomeStartBlocked=" + startBlocked + ", startUnresolved=" + startUnresolved
            + ", startOtherDisplay=" + startOtherDisplay + ", cameraAllowed=" + startCameraAllowed
            + ", abort=" + abortCode + ", startSkipped=" + startSkipped
            + ", moveHooks=" + moveHooks + ", moveSigs=[" + moveSignatures + "]"
            + ", moveConsulted=" + moveConsulted + ", rearHomeMoveBlocked=" + moveBlocked
            + ", moveAbsent=" + moveAbsent + ", moveUnreadable=" + moveUnreadable
            + ", moveUnresolved=" + moveUnresolved + ", moveSkipped=" + moveSkipped
            + ", rootMoveHooks=" + rootMoveHooks + ", rootMoveSigs=[" + rootMoveSignatures + "]"
            + ", rootMoveConsulted=" + rootMoveConsulted + ", rootMoveBlocked=" + rootMoveBlocked
            + ", rootContainer=" + lastRootContainer
            + ", lastDecision=" + lastDecision;
    }

    private static String text(Throwable error) {
        String message = error.getMessage();
        return error.getClass().getSimpleName() + (message == null || message.isEmpty() ? "" : ": " + message);
    }

    /** 零命中时把类里真实的方法名列出来（有上限）。 */
    private static String declared(Class<?> owner) {
        StringBuilder text = new StringBuilder();
        try {
            int shown = 0;
            for (Method method : owner.getDeclaredMethods()) {
                if (shown >= 24) { text.append("…"); break; }
                if (text.length() > 0) text.append(',');
                text.append(method.getName());
                shown++;
            }
        } catch (Throwable error) { return "unreadable"; }
        return text.toString();
    }

    /** hook 回调内的瞬时异常：只记录一次，不参与安装状态。 */
    private void logOnce(String path, Throwable error) {
        XposedBridge.log("Tingyu rear home guard (" + path + "): " + text(error));
    }
}
