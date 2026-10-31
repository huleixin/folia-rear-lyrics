package io.github.huleixin.tingyu.lsp;

import android.content.ComponentName;
import java.lang.reflect.Method;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;

// android/app/src/main/java/io/github/huleixin/tingyu/lsp/RearFrontGuard.java
/**
 * 在 system_server 里压住「系统背屏桌面抢前台」的两条真实路径。
 *
 * <h3>为什么换位置（1.3.61 真机证据）</h3>
 * 1.3.61 挂的是 {@code ActivityStarter.executeRequest} 与
 * {@code moveRootTaskToDisplay}。日志显示：
 * <ul>
 *   <li>{@code startConsulted=13}，`lastDecision` 全部是我们自己的启动，{@code rearHomeStartBlocked=0}；</li>
 *   <li>{@code moveConsulted=0}、{@code rootMoveConsulted=0} —— 迁移路径一次都没被调用；</li>
 *   <li>锁屏后背屏前台变成 {@code task=3 com.xiaomi.subscreencenter/.SubScreenLauncher}，
 *       而 **3** 是一个早已存在的任务。</li>
 * </ul>
 * 一个已经存在的任务被拿到前台，走的不是「启动请求」，而是：
 * <ol>
 *   <li>{@code ActivityTaskManagerService.moveTaskToFront(...)} —— 背屏中心把自己的任务提上来；</li>
 *   <li>{@code TaskDisplayArea.resumeHomeActivity(...)} —— 系统在该显示上恢复桌面。</li>
 * </ol>
 * 这两条路都不经过 `executeRequest`，所以旧钩子「装上了却从不命中」。本类就挂这两处。
 *
 * <h3>安全边界</h3>
 * <ul>
 *   <li>只有本应用**正持有该背屏的歌词租约**、且该背屏无相机时才可能拦截；否则纯透传，
 *       连反射都不做。</li>
 *   <li>只认背屏中心这一个包（调用方或任务根 Activity 命中其一）；主屏桌面、其它应用、
 *       本应用自己的任务永远放行。</li>
 *   <li>目标显示能解析时必须等于租约背屏；主屏（0）永远不碰。</li>
 *   <li>{@code resumeHomeActivity} 额外要求「我们的窗口确实在该显示的窗口树里」——
 *       拿不到这个证据就不压，宁可漏拦也不能把背屏压成黑屏。</li>
 *   <li>租约释放（用户关闭歌词、停止播放、相机接管）后立刻回到纯透传。</li>
 * </ul>
 */
final class RearFrontGuard {
    private final RearLeaseView lease;
    private final RearWindowLease windows;

    private volatile int moveHooks, rootMoveHooks, homeHooks;
    private volatile long moveConsulted, moveBlocked, moveUnresolved, moveNoTask;
    private volatile long homeConsulted, homeBlocked, homeNoWindow;
    private volatile String moveSigs = "none", rootMoveSigs = "none", homeSigs = "none";
    /** 每个钩子的安装结果分开记：一个布尔量同时表示三件事，正是 1.3.61 的病。 */
    private volatile String moveError = "", rootMoveError = "", homeError = "";
    private volatile String lastDecision = "not consulted";
    private volatile boolean loggedFirst;

    RearFrontGuard(RearLeaseView lease, RearWindowLease windows) {
        this.lease = lease;
        this.windows = windows;
    }

    void install(ClassLoader loader) {
        installMove(loader, "com.android.server.wm.ActivityTaskManagerService", false);
        installMove(loader, "com.android.server.wm.RootWindowContainer", true);
        installHome(loader);
    }

    // ------------------------------------------------------------------ moveTaskToFront

    private void installMove(ClassLoader loader, String owner, boolean roots) {
        try {
            Class<?> type = XposedHelpers.findClass(owner, loader);
            XC_MethodHook guard = new XC_MethodHook() {
                @Override protected void beforeHookedMethod(MethodHookParam hook) {
                    try {
                        moveConsulted++;
                        if (!loggedFirst) {
                            loggedFirst = true;
                            XposedBridge.log("Tingyu rear front guard: moveTaskToFront consulted on "
                                + type.getSimpleName() + ", args=" + signature(hook.args));
                        }
                        int task = taskIdOf(hook.args);
                        String caller = callerOf(hook.args);
                        if (task <= 0) { moveUnresolved++; lastDecision = "move unresolved args=" + signature(hook.args); return; }
                        String top = taskPackage(hook, task);
                        if (top == null) moveNoTask++;
                        boolean held = lease.lyricsLeaseHeld();
                        boolean camera = lease.cameraRecentlyOnLeasedDisplay();
                        int display = taskDisplay(hook, task);
                        if (!RearFrontGuardPolicy.block(RearFrontGuardPolicy.Path.MOVE_TASK, held, camera,
                                lease.leasedDisplayId(), display, caller, top, false)) {
                            if (held) lastDecision = "allow move task=" + task + " caller=" + caller
                                + " top=" + top + " display=" + display;
                            return;
                        }
                        Class<?> returns = returnTypeOf(hook);
                        if (returns != void.class && returns != boolean.class) {
                            lastDecision = "cannot-abort move task=" + task + " return=" + returns.getSimpleName();
                            return;
                        }
                        moveBlocked++;
                        lastDecision = "blocked rear-centre front task=" + task + " caller=" + caller
                            + " top=" + top + " display=" + display;
                        XposedBridge.log("Tingyu rear front guard: " + lastDecision);
                        hook.setResult(returns == void.class ? null : Boolean.FALSE);
                    } catch (Throwable error) { logMove(error); }
                }
            };
            XposedBridge.hookAllMethods(type, "moveTaskToFront", guard);
            int count = countMethods(type, "moveTaskToFront");
            String sigs = describe("moveTaskToFront", type);
            if (roots) { rootMoveHooks = count; rootMoveSigs = sigs; }
            else { moveHooks = count; moveSigs = sigs; }
            // 零命中必须报错，而不是「安装了但一个方法都没有」。
            if (count == 0) {
                String text = "no moveTaskToFront on " + type.getSimpleName() + "; declared=" + declared(type);
                if (roots) rootMoveError = text; else moveError = text;
            }
        } catch (Throwable error) {
            if (roots) rootMoveError = text(error); else moveError = text(error);
        }
    }

    // ------------------------------------------------------------------ resumeHomeActivity

    private void installHome(ClassLoader loader) {
        try {
            Class<?> area = XposedHelpers.findClass("com.android.server.wm.TaskDisplayArea", loader);
            XC_MethodHook guard = new XC_MethodHook() {
                @Override protected void beforeHookedMethod(MethodHookParam hook) {
                    try {
                        homeConsulted++;
                        Object display = displayContentOf(hook.thisObject);
                        int id = displayIdOf(display);
                        boolean held = lease.lyricsLeaseHeld();
                        boolean camera = lease.cameraRecentlyOnLeasedDisplay();
                        boolean ownWindow = false;
                        if (held && !camera && id > 0 && id == lease.leasedDisplayId()) {
                            // 只有「我们的窗口确实在这个显示上」才允许压住桌面。
                            ownWindow = windows.probe(display).presence == WindowTreeProbe.Presence.PRESENT;
                        }
                        if (!RearFrontGuardPolicy.block(RearFrontGuardPolicy.Path.RESUME_HOME, held, camera,
                                lease.leasedDisplayId(), id, null, null, ownWindow)) {
                            if (held && id == lease.leasedDisplayId()) homeNoWindow++;
                            return;
                        }
                        // 返回值安全性：这个方法是 void 还是 boolean 随版本不同。对非 void 方法
                        // 「取消却不给返回值」会让调用方拆箱失败 —— 1.3.61 的梦境钩子就栽在这里。
                        Class<?> returns = returnTypeOf(hook);
                        if (returns != void.class && returns != boolean.class) {
                            lastDecision = "cannot-abort home resume display=" + id + " return=" + returns.getSimpleName();
                            return;
                        }
                        homeBlocked++;
                        lastDecision = "blocked rear home resume display=" + id + " ownWindow=" + ownWindow;
                        XposedBridge.log("Tingyu rear front guard: " + lastDecision);
                        hook.setResult(returns == void.class ? null : Boolean.FALSE);
                    } catch (Throwable error) { logHome(error); }
                }
            };
            XposedBridge.hookAllMethods(area, "resumeHomeActivity", guard);
            homeHooks = countMethods(area, "resumeHomeActivity");
            homeSigs = describe("resumeHomeActivity", area);
            if (homeHooks == 0) homeError = "no resumeHomeActivity on TaskDisplayArea; declared=" + declared(area);
        } catch (Throwable error) { homeError = text(error); }
    }

    // ------------------------------------------------------------------ reflection helpers

    /** {@code moveTaskToFront(…, int taskId, …)}：按位置取，取不到就返回 -1（计入 unresolved）。 */
    private static int taskIdOf(Object[] args) {
        if (args == null) return -1;
        if (args.length >= 5 && args[2] instanceof Integer) return (Integer) args[2];
        if (args.length == 4 && args[2] instanceof Integer) return (Integer) args[2];
        if (args.length == 2 && args[1] instanceof Integer) return (Integer) args[1];
        return -1;
    }

    /** moveTaskToFront 的第二个参数是调用方包名（ActivityManager 传 getOpPackageName()）。 */
    private static String callerOf(Object[] args) {
        if (args == null) return null;
        for (int i = 1; i < Math.min(args.length, 3); i++) {
            if (args[i] instanceof String) return (String) args[i];
        }
        return null;
    }

    /**
     * 目标任务根 Activity 的包名。用 {@code anyTaskForId} 在进程内直接拿 Task，
     * 不做 Binder 往返（这里在 wm 锁内，任何 IPC 都是风险）。
     */
    private String taskPackage(XC_MethodHook.MethodHookParam hook, int taskId) {
        Object task = taskOf(hook, taskId);
        if (task == null) return null;
        Object component = field(task, "realActivity");
        if (component instanceof ComponentName) return ((ComponentName) component).getPackageName();
        Object top = null;
        try { top = XposedHelpers.callMethod(task, "getTopActivity"); } catch (Throwable ignored) { }
        if (top == null) top = field(task, "topActivity");
        Object activityComponent = top == null ? null : field(top, "mActivityComponent");
        if (activityComponent instanceof ComponentName) return ((ComponentName) activityComponent).getPackageName();
        return null;
    }

    private int taskDisplay(XC_MethodHook.MethodHookParam hook, int taskId) {
        Object task = taskOf(hook, taskId);
        return task == null ? -1 : displayIdOf(task);
    }

    private Object taskOf(XC_MethodHook.MethodHookParam hook, int taskId) {
        Object roots = field(hook.thisObject, "mRootWindowContainer");
        if (roots == null) roots = hook.thisObject; // RootWindowContainer 自己
        if (roots == null) return null;
        try { return XposedHelpers.callMethod(roots, "anyTaskForId", taskId); }
        catch (Throwable ignored) { /* 签名不同：试两参重载。 */ }
        try { return XposedHelpers.callMethod(roots, "anyTaskForId", taskId, 0); }
        catch (Throwable ignored) { return null; }
    }

    private static Object displayContentOf(Object area) {
        Object display = field(area, "mDisplayContent");
        if (display != null) return display;
        return field(area, "mDisplay");
    }

    private static int displayIdOf(Object owner) {
        if (owner == null) return -1;
        Object id = field(owner, "mDisplayId");
        if (id instanceof Integer) return (Integer) id;
        Object display = field(owner, "mDisplayContent");
        if (display != null && display != owner) {
            Object nested = field(display, "mDisplayId");
            if (nested instanceof Integer) return (Integer) nested;
        }
        try {
            Object value = XposedHelpers.callMethod(owner, "getDisplayId");
            if (value instanceof Integer) return (Integer) value;
        } catch (Throwable ignored) { }
        return -1;
    }

    private static Object field(Object owner, String name) {
        if (owner == null) return null;
        try { return XposedHelpers.getObjectField(owner, name); }
        catch (Throwable ignored) { return null; }
    }

    private static Class<?> returnTypeOf(XC_MethodHook.MethodHookParam hook) {
        java.lang.reflect.Member member = hook.method;
        return member instanceof Method ? ((Method) member).getReturnType() : void.class;
    }

    private static int countMethods(Class<?> owner, String name) {
        try {
            int count = 0;
            for (Method method : owner.getDeclaredMethods()) if (method.getName().equals(name)) count++;
            return count;
        } catch (Throwable error) { return 0; }
    }

    private static String describe(String name, Class<?> owner) {
        StringBuilder text = new StringBuilder();
        try {
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
        } catch (Throwable error) { return "unreadable"; }
        return text.length() == 0 ? "none" : text.toString();
    }

    /** 零命中时把类里真实的方法名列出来（有上限），下一次日志可以直接照着改。 */
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

    private static String text(Throwable error) {
        String message = error.getMessage();
        return error.getClass().getSimpleName() + (message == null || message.isEmpty() ? "" : ": " + message);
    }

    private static String signature(Object[] args) {
        StringBuilder text = new StringBuilder();
        if (args != null) for (Object arg : args) {
            if (text.length() > 0) text.append(", ");
            text.append(arg == null ? "null" : arg.getClass().getName());
        }
        return "[" + text + "]";
    }

    private volatile String moveFailure = "", homeFailure = "";

    private void logMove(Throwable error) {
        if (moveFailure.isEmpty()) { moveFailure = text(error); XposedBridge.log("Tingyu rear front guard (move): " + moveFailure); }
    }

    private void logHome(Throwable error) {
        if (homeFailure.isEmpty()) { homeFailure = text(error); XposedBridge.log("Tingyu rear front guard (home): " + homeFailure); }
    }

    boolean installed() { return moveHooks > 0 || rootMoveHooks > 0 || homeHooks > 0; }

    /** 只有真正挂上了方法才算安装成功；零命中一律带上原因。 */
    String status() {
        return "rearFrontHook=" + installed()
            + ", frontMoveHooks=" + moveHooks + ", frontMoveSigs=[" + moveSigs + "]"
            + (moveError.isEmpty() ? "" : ", frontMoveError=" + moveError)
            + ", frontRootHooks=" + rootMoveHooks + ", frontRootSigs=[" + rootMoveSigs + "]"
            + (rootMoveError.isEmpty() ? "" : ", frontRootError=" + rootMoveError)
            + ", frontMoveConsulted=" + moveConsulted + ", frontMoveBlocked=" + moveBlocked
            + ", frontMoveNoTask=" + moveNoTask + ", frontMoveUnresolved=" + moveUnresolved
            + ", frontHomeHooks=" + homeHooks + ", frontHomeSigs=[" + homeSigs + "]"
            + (homeError.isEmpty() ? "" : ", frontHomeError=" + homeError)
            + ", frontHomeConsulted=" + homeConsulted + ", frontHomeBlocked=" + homeBlocked
            + ", frontHomeNoWindow=" + homeNoWindow
            + ", frontLast=" + lastDecision;
    }
}
