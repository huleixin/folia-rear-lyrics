package io.github.huleixin.tingyu.lsp;

import android.content.ComponentName;
import android.content.Intent;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;

// android/app/src/main/java/io/github/huleixin/tingyu/lsp/RearHomeGuard.java
/**
 * system_server 内对「锁屏背屏接管真实路径」的拦截（REAREye 证据：背屏中心以
 * reason="aod" 调自己的 home-to-front 把 SubScreenLauncher 拉到背屏）。
 *
 * <p>v1.3.57 的四处缺陷与对应修正：
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
 * <p>只在歌词租约有效、无相机宽限期时干预；租约释放后所有 hook 回到纯透传。系统的
 * 「背屏息屏」开关从未被改动，主屏桌面与其它显示的启动永远不碰。
 */
final class RearHomeGuard {
    private boolean installed;
    private volatile boolean failed;
    private volatile int startHooks, moveHooks, rootMoveHooks;
    private volatile int startConsulted, startBlocked, startUnresolved, startCameraAllowed;
    private volatile int moveConsulted, moveBlocked, rootMoveConsulted, rootMoveBlocked;
    private volatile String lastDecision = "not consulted";
    private volatile boolean loggedFirstStart, loggedFirstMove;

    void install(ClassLoader loader, RearLeaseView lease) {
        installStartGuard(loader, lease);
        try {
            Class<?> atms = XposedHelpers.findClass("com.android.server.wm.ActivityTaskManagerService", loader);
            moveHooks = hookMoves(atms, lease, false);
        } catch (Throwable error) { logOnce("atms", error); }
        try {
            Class<?> roots = XposedHelpers.findClass("com.android.server.wm.RootWindowContainer", loader);
            rootMoveHooks = hookMoves(roots, lease, true);
        } catch (Throwable error) { logOnce("root", error); }
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
                                + signature(hook.args) + ", request=" + request.getClass().getName());
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
                            lastDecision = "allow start pkg=" + pkg + "/" + cls + ", home=" + home
                                + ", display=" + launchDisplay;
                            return;
                        }
                        startBlocked++;
                        lastDecision = "blocked rear-home start pkg=" + pkg + "/" + cls + ", home=" + home
                            + ", display=" + launchDisplay;
                        XposedBridge.log("Tingyu rear home guard: " + lastDecision);
                        hook.setResult(abortedResult(loader));
                    } catch (Throwable error) { logOnce("start", error); }
                }
            };
            XposedBridge.hookAllMethods(starter, "executeRequest", guard);
            startHooks = countMethods(starter, "executeRequest");
        } catch (Throwable error) { logOnce("start-install", error); }
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
                            + owner.getSimpleName() + ", args=" + signature(hook.args));
                    }
                    int task = hook.args.length > 0 && hook.args[0] instanceof Integer ? (Integer) hook.args[0] : -1;
                    int display = hook.args.length > 1 && hook.args[1] instanceof Integer ? (Integer) hook.args[1] : -1;
                    if (task <= 0 || !lease.lyricsLeaseHeld() || display != lease.leasedDisplayId()) return;
                    if (lease.cameraRecentlyOnLeasedDisplay()) return;
                    String top = topPackageOf(task);
                    RearHomeGuardPolicy.Decision decision =
                        RearHomeGuardPolicy.evaluateMove(top, display, lease.leasedDisplayId(), true, false);
                    if (decision != RearHomeGuardPolicy.Decision.BLOCK) {
                        lastDecision = "allow move task=" + task + " top=" + top;
                        return;
                    }
                    if (root) rootMoveBlocked++; else moveBlocked++;
                    lastDecision = "blocked rear-home move on " + owner.getSimpleName()
                        + " task=" + task + " top=" + top;
                    XposedBridge.log("Tingyu rear home guard: " + lastDecision);
                    hook.setResult(null);
                } catch (Throwable error) { logOnce("move", error); }
            }
        };
        XposedBridge.hookAllMethods(owner, "moveRootTaskToDisplay", guard);
        return countMethods(owner, "moveRootTaskToDisplay");
    }

    /** {@code executeRequest(Request)} 与无参版本（请求在 {@code mRequest}）都能取到请求。 */
    private static Object requestOf(XC_MethodHook.MethodHookParam hook) {
        if (hook.args != null && hook.args.length > 0 && hook.args[0] != null) return hook.args[0];
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
        if (options == null) options = safe;
        try {
            Object id = XposedHelpers.callMethod(options, "getLaunchDisplayId");
            if (id instanceof Integer) return (Integer) id;
        } catch (Throwable ignored) { /* Not an ActivityOptions. */ }
        return -1;
    }

    private static boolean isHomeIntent(Intent intent) {
        try {
            java.util.Set<String> categories = intent.getCategories();
            if (categories != null && categories.contains(Intent.CATEGORY_HOME)) return true;
            return Intent.ACTION_MAIN.equals(intent.getAction()) && intent.getComponent() == null;
        } catch (Throwable error) { return false; }
    }

    private int countMethods(Class<?> owner, String name) {
        try {
            int count = 0;
            for (java.lang.reflect.Method method : owner.getDeclaredMethods())
                if (method.getName().equals(name)) count++;
            return count;
        } catch (Throwable error) { return -1; }
    }

    /** executeRequest 的正常返回是 @StartResult；用 START_ABORTED，反射失败退化为通用取消。 */
    private int abortedResult(ClassLoader loader) {
        try {
            return XposedHelpers.getStaticIntField(
                XposedHelpers.findClass("android.app.ActivityManager", loader), "START_ABORTED");
        } catch (Throwable error) {
            return 1; // A benign generic cancellation.
        }
    }

    /** 任务顶层包名；查不到返回 null → 判定放行（不确定绝不拦）。 */
    private String topPackageOf(int taskId) {
        try {
            Object atm = Class.forName("android.app.ActivityTaskManager").getMethod("getService").invoke(null);
            Object[] roots = (Object[]) Class.forName("android.app.IActivityTaskManager")
                .getMethod("getAllRootTaskInfos").invoke(atm);
            if (roots == null) return null;
            for (Object root : roots) {
                int id = ((Number) root.getClass().getField("taskId").get(root)).intValue();
                if (id != taskId) continue;
                Object top = root.getClass().getField("topActivity").get(root);
                return top == null ? null : (String) top.getClass().getMethod("getPackageName").invoke(top);
            }
        } catch (Throwable ignored) { /* Verification unavailable: allow. */ }
        return null;
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
        return "rearHomeHook=" + installed + ", homeHookError=" + failed
            + ", startHooks=" + startHooks + ", startConsulted=" + startConsulted
            + ", rearHomeStartBlocked=" + startBlocked + ", startUnresolved=" + startUnresolved
            + ", moveHooks=" + moveHooks + ", moveConsulted=" + moveConsulted
            + ", rearHomeMoveBlocked=" + moveBlocked
            + ", rootMoveHooks=" + rootMoveHooks + ", rootMoveConsulted=" + rootMoveConsulted
            + ", rootMoveBlocked=" + rootMoveBlocked
            + ", cameraAllowed=" + startCameraAllowed + ", lastDecision=" + lastDecision;
    }
    private void logOnce(String path, Throwable error) {
        if (!failed) { failed = true; XposedBridge.log("Tingyu rear home guard (" + path + "): " + error); }
    }
}
