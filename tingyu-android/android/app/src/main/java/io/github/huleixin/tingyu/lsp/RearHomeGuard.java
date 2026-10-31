package io.github.huleixin.tingyu.lsp;

import android.content.Intent;
import android.os.SystemClock;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;

// android/app/src/main/java/io/github/huleixin/tingyu/lsp/RearHomeGuard.java
/**
 * system_server 内对「锁屏背屏接管真实路径」的拦截（REAREye 证据：背屏中心以
 * reason="aod" 调 home-to-front 把 SubScreenLauncher 拉到背屏）。
 *
 * <p>与 v1.3.56 DreamGuard 的三点区别（也是它失效的原因）：
 * <ul>
 *   <li>覆盖两条真实系统调用路径：背屏中心把 Launcher **启动**到背屏
 *       （ActivityStarter.executeRequest）与把已有 Launcher 任务**迁移**到背屏
 *       （moveRootTaskToDisplay）。DreamManagerService 只处理 Dream，不处理这两条。</li>
 *   <li>hookAllMethods 匹配数被显式统计并上报——零命中不再是静默 no-op，诊断里
 *       一眼可见（v1.3.56 的 installed=true 是假阳性）。</li>
 *   <li>迁移路径必须验证任务顶层包名确实是背屏中心才拦；解析失败放行，
 *       绝不误伤相机或其他应用的合法迁移。</li>
 * </ul>
 *
 * <p>只在歌词租约有效、无相机宽限期时干预；租约释放后所有 hook 立即回到纯透传，
 * 系统原生行为不受影响。设置开关从未被改动。
 */
final class RearHomeGuard {
    private boolean installed;
    private volatile boolean failed;
    private volatile int startHooks, moveHooks, startConsulted, startBlocked, moveConsulted, moveBlocked, allowedCamera;
    private volatile String lastDecision = "not consulted";
    private volatile boolean loggedFirstStart, loggedFirstMove;

    void install(ClassLoader loader, RearLeaseView lease) {
        try {
            Class<?> starter = XposedHelpers.findClass("com.android.server.wm.ActivityStarter", loader);
            XC_MethodHook startGuard = new XC_MethodHook() {
                @Override protected void beforeHookedMethod(MethodHookParam hook) {
                    try {
                        if (startConsulted == 0 && !loggedFirstStart) {
                            loggedFirstStart = true;
                            XposedBridge.log("Tingyu rear home guard: start path consulted, args="
                                + signature(hook.args));
                        }
                        startConsulted++;
                        Object request = hook.args.length > 0 ? hook.args[0] : null;
                        Intent intent = request == null ? null
                            : (Intent) XposedHelpers.getObjectField(request, "intent");
                        if (intent == null) return;
                        android.content.ComponentName component = intent.getComponent();
                        String pkg = component == null ? null : component.getPackageName();
                        String cls = component == null ? null : component.getClassName();
                        boolean held = lease.lyricsLeaseHeld();
                        boolean camera = lease.cameraRecentlyOnLeasedDisplay();
                        RearHomeGuardPolicy.Decision decision =
                            RearHomeGuardPolicy.evaluateStart(pkg, cls, held, camera);
                        if (decision != RearHomeGuardPolicy.Decision.BLOCK) {
                            allowedCamera += camera ? 1 : 0;
                            lastDecision = "allow start pkg=" + pkg + "/" + cls;
                            return;
                        }
                        startBlocked++;
                        lastDecision = "blocked rear-home start " + pkg + "/" + cls;
                        hook.setResult(abortedResult(loader));
                    } catch (Throwable error) { logOnce("start", error); }
                }
            };
            XposedBridge.hookAllMethods(starter, "executeRequest", startGuard);
            startHooks = countHooks(starter, "executeRequest");

            Class<?> atms = XposedHelpers.findClass("com.android.server.wm.ActivityTaskManagerService", loader);
            XC_MethodHook moveGuard = new XC_MethodHook() {
                @Override protected void beforeHookedMethod(MethodHookParam hook) {
                    try {
                        if (moveConsulted == 0 && !loggedFirstMove) {
                            loggedFirstMove = true;
                            XposedBridge.log("Tingyu rear home guard: move path consulted, args="
                                + signature(hook.args));
                        }
                        moveConsulted++;
                        int task = hook.args.length > 0 && hook.args[0] instanceof Integer ? (Integer) hook.args[0] : -1;
                        int display = hook.args.length > 1 && hook.args[1] instanceof Integer ? (Integer) hook.args[1] : -1;
                        if (task <= 0 || !lease.lyricsLeaseHeld() || display != lease.leasedDisplayId()) return;
                        if (lease.cameraRecentlyOnLeasedDisplay()) { allowedCamera++; return; }
                        String top = topPackageOf(task);
                        RearHomeGuardPolicy.Decision decision =
                            RearHomeGuardPolicy.evaluateMove(top, display, lease.leasedDisplayId(), true, false);
                        if (decision != RearHomeGuardPolicy.Decision.BLOCK) {
                            lastDecision = "allow move task=" + task + " top=" + top;
                            return;
                        }
                        moveBlocked++;
                        lastDecision = "blocked rear-home move task=" + task + " top=" + top;
                        hook.setResult(null);
                    } catch (Throwable error) { logOnce("move", error); }
                }
            };
            XposedBridge.hookAllMethods(atms, "moveRootTaskToDisplay", moveGuard);
            moveHooks = countHooks(atms, "moveRootTaskToDisplay");
            installed = true;
        } catch (Throwable error) { logOnce("install", error); }
    }

    private int countHooks(Class<?> owner, String name) {
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
            // START_SWITCHES_CANCELED: a benign generic cancellation.
            return 1;
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
            + ", rearHomeStartBlocked=" + startBlocked + ", moveHooks=" + moveHooks
            + ", moveConsulted=" + moveConsulted + ", rearHomeMoveBlocked=" + moveBlocked
            + ", cameraAllowed=" + allowedCamera + ", lastDecision=" + lastDecision;
    }
    private void logOnce(String path, Throwable error) {
        if (!failed) { failed = true; XposedBridge.log("Tingyu rear home guard (" + path + "): " + error); }
    }
}
