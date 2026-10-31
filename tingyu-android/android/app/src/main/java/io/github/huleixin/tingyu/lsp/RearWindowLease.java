package io.github.huleixin.tingyu.lsp;

import android.os.Handler;
import android.os.SystemClock;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;

// android/app/src/main/java/io/github/huleixin/tingyu/lsp/RearWindowLease.java
/** Display brightness and the window-manager sleep state are separate Android policies. */
final class RearWindowLease {
    private final RearDisplayLease lease;
    private final Map<Integer, Object> displays = new ConcurrentHashMap<>();
    private final ThreadLocal<Boolean> inspecting = new ThreadLocal<>();
    /** ActivityTaskManagerService，仅用于按 displayId 反查 DisplayContent（续租循环在定时器里跑）。 */
    private volatile Object atmService;
    private boolean installed;
    /**
     * 安装失败分成两份。
     *
     * <p>1.3.61 只有一个 {@code failed} 布尔量，而它同时被「ATM 服务钩子」和「shouldSleep
     * 钩子」两条安装路径写入。真机日志因此出现自相矛盾的一行：
     * {@code rearWindowHook=true, windowHookError=true} —— 钩子装上了，却报错；报错的其实是
     * 另一条路径。诊断必须能分辨「哪一处失败、原因是什么」。
     */
    private volatile String atmError = "", windowError = "";
    // Sleep-path diagnostics: on-device evidence of whether the hook is consulted at lock
    // time and whether our lease was actually held there. Counters only; no task content.
    private volatile long consulted, keptAwake, systemSleepRequests, windowRenewals;
    /** 续租循环被触发的次数（第一行就加），用来区分「循环没跑」与「跑了没证据」。 */
    private volatile long renewTicks;
    private volatile String lastRenewTick = "never";
    private volatile String lastTop = "", lastDecision = "not consulted";
    /** 三值探测的分项计数：真机上「读不到」和「确实没有」必须能分辨。 */
    private volatile long probePresent, probeAbsent, probeUnknown;
    private volatile String lastProbe = "not probed";
    private volatile String lastRenew = "not consulted";
    /**
     * Last time a camera package was seen on top of a rear display. Used to stop renewing our
     * bright-policy lease while a camera is using the panel: the OEM camera requests power for
     * its own preview, and a stale bright override from us is exactly the interference that
     * makes the camera dismiss itself or come back to the front. Recorded from the existing
     * shouldSleep hook, so no extra lock or reflection call is introduced.
     */
    private final Map<Integer, Long> cameraOnTopAt = new ConcurrentHashMap<>();
    private volatile long cameraPreemptions;

    RearWindowLease(RearDisplayLease lease) { this.lease = lease; }

    void install(ClassLoader loader) {
        // The renew loop lives on our own handler, so it cannot rely on a shouldSleep call
        // having populated `displays` first. Capture the ATM instance once, at boot.
        try {
            Class<?> atms = XposedHelpers.findClass("com.android.server.wm.ActivityTaskManagerService", loader);
            XposedBridge.hookAllMethods(atms, "systemReady", new XC_MethodHook() {
                @Override protected void afterHookedMethod(MethodHookParam hook) {
                    atmService = hook.thisObject;
                }
            });
        } catch (Throwable error) {
            // 这条路径失败只影响「按 displayId 反查 DisplayContent」的兜底，不影响 shouldSleep
            // 钩子本身；1.3.61 把它记成 windowHookError，掩盖了真正的状态。
            atmError = text(error);
        }
        try {
            Class<?> displayType = XposedHelpers.findClass("com.android.server.wm.DisplayContent", loader);
            XC_MethodHook keepOwnWindow = new XC_MethodHook() {
                @Override protected void afterHookedMethod(MethodHookParam hook) {
                    if (hook.hasThrowable() || Boolean.TRUE.equals(inspecting.get())) return;
                    try {
                        int id = XposedHelpers.getIntField(hook.thisObject, "mDisplayId");
                        if (id <= 0) return;
                        displays.put(id, hook.thisObject);
                        // 续租循环跑在我们自己的 Handler 上，不能指望 systemReady 钩子一定成功。
                        // DisplayContent 上就有 mAtmService，任何一次 shouldSleep 都能把它补齐。
                        if (atmService == null) atmService = field(hook.thisObject, "mAtmService");
                        if (!Boolean.TRUE.equals(hook.getResult())) return;
                        consulted++;
                        if (!lease.holds(id, SystemClock.elapsedRealtime())) {
                            systemSleepRequests++;
                            lastDecision = "no-lease";
                            return;
                        }
                        inspecting.set(true);
                        Object top = XposedHelpers.callMethod(hook.thisObject, "topRunningActivity");
                        Object component = top == null ? null : XposedHelpers.getObjectField(top, "mActivityComponent");
                        String pkg = readString(component, "getPackageName");
                        String activity = readString(component, "getClassName");
                        lastTop = pkg + "/" + activity;
                        if (RearBridgeContract.isCameraPackage(pkg)) {
                            cameraOnTopAt.put(id, SystemClock.elapsedRealtime());
                            cameraPreemptions++;
                            lastDecision = "camera-on-top";
                            systemSleepRequests++;
                            return; // Never keep the panel awake on behalf of a stale lease.
                        }
                        boolean ownActivityOnTop = RearBridgeContract.PACKAGE.equals(pkg);
                        // The client is frozen while the main screen is locked, so its renew
                        // IPC stops arriving. A still-attached window is proof it is alive.
                        WindowTreeProbe.Outcome probe = probe(hook.thisObject);
                        RearWindowRenewPolicy.Verdict renew = RearWindowRenewPolicy.decide(
                            new RearWindowRenewPolicy.Evidence(probe.presence, ownActivityOnTop, false, probe.reason),
                            lease.holds(id, SystemClock.elapsedRealtime()),
                            lease.windowRenewals(), RearDisplayLease.MAX_WINDOW_RENEWALS);
                        if (renew.decision == RearWindowRenewPolicy.Decision.RENEW
                                && lease.renewForWindow(id, SystemClock.elapsedRealtime())) {
                            windowRenewals++;
                            lastRenew = "renewed:" + renew.reason;
                        } else {
                            lastRenew = renew.toString();
                        }
                        if (lease.holdsWindow(id, pkg, activity, probe.presence, ownActivityOnTop,
                                SystemClock.elapsedRealtime())) {
                            keptAwake++;
                            lastDecision = "kept:" + probe.presence + (ownActivityOnTop ? "/ownTop" : "");
                            hook.setResult(false);
                        } else {
                            systemSleepRequests++;
                            lastDecision = "sleep:" + probe.presence + "/" + lastTop;
                        }
                    } catch (Throwable error) { logOnce(error); }
                    finally { inspecting.remove(); }
                }
            };
            XposedHelpers.findAndHookMethod(displayType, "shouldSleep", keepOwnWindow);
            // Newer Android releases also consult the display's screen-sleep state for keyguard.
            try { XposedHelpers.findAndHookMethod(displayType, "isScreenSleeping", keepOwnWindow); }
            catch (NoSuchMethodError ignored) { /* Older releases use shouldSleep only. */ }
            installed = true;
        } catch (Throwable error) { windowError = text(error); }
    }

    private static String readString(Object owner, String method) {
        if (owner == null) return "";
        try {
            Object value = XposedHelpers.callMethod(owner, method);
            return value instanceof String ? (String) value : "";
        } catch (Throwable ignored) { return ""; }
    }

    /**
     * 三层窗口树探测（DisplayContent → DisplayArea… → Task → ActivityRecord → WindowState）。
     * 结果三值，见 {@link WindowTreeProbe}。
     */
    WindowTreeProbe.Outcome probe(Object display) {
        if (display == null) {
            probeUnknown++;
            lastProbe = "no-display";
            return new WindowTreeProbe.Outcome(WindowTreeProbe.Presence.UNKNOWN, "no-display", 0, 0);
        }
        WindowTreeProbe.Outcome outcome = WindowTreeProbe.probe(
            XposedWindowNode.of(display), RearBridgeContract.PACKAGE);
        switch (outcome.presence) {
            case PRESENT: probePresent++; break;
            case ABSENT: probeAbsent++; break;
            default: probeUnknown++; break;
        }
        lastProbe = outcome.toString();
        return outcome;
    }

    /** 续租循环用的证据快照：窗口三值 + 本应用是否在该背屏最前 + 相机宽限。 */
    RearWindowRenewPolicy.Evidence evidence(int id, long now) {
        Object display = resolveDisplay(id);
        WindowTreeProbe.Outcome outcome = probe(display);
        boolean ownTop = false;
        if (display != null) {
            try {
                Object top = XposedHelpers.callMethod(display, "topRunningActivity");
                Object component = top == null ? null : XposedHelpers.getObjectField(top, "mActivityComponent");
                ownTop = RearBridgeContract.PACKAGE.equals(readString(component, "getPackageName"));
            } catch (Throwable ignored) { /* 读不到就只靠窗口树。 */ }
        }
        return new RearWindowRenewPolicy.Evidence(outcome.presence, ownTop,
            cameraOnTopRecently(id, now), outcome.reason);
    }

    /** 按 displayId 找 DisplayContent：先查钩子里缓存的，再走 RootWindowContainer。 */
    private Object resolveDisplay(int id) {
        Object cached = displays.get(id);
        if (cached != null) return cached;
        Object service = atmService;
        if (service == null || id <= 0) return null;
        try {
            Object roots = XposedHelpers.getObjectField(service, "mRootWindowContainer");
            Object children = roots == null ? null : XposedHelpers.getObjectField(roots, "mChildren");
            if (!(children instanceof List)) return null;
            for (Object child : (List<?>) children) {
                if (child == null) continue;
                Object displayId = XposedHelpers.getObjectField(child, "mDisplayId");
                if (displayId instanceof Integer && (Integer) displayId == id) {
                    displays.put(id, child);
                    return child;
                }
            }
        } catch (Throwable ignored) { /* 结构不同：返回 null，调用方按 UNKNOWN 处理。 */ }
        return null;
    }

    /** True when a camera was on top of this rear display within [CAMERA_GRACE_MS]. */
    boolean cameraOnTopRecently(int id, long now) {
        Long at = cameraOnTopAt.get(id);
        return at != null && now - at <= CAMERA_GRACE_MS;
    }
    static final long CAMERA_GRACE_MS = 10_000;

    /** True while the sleep hook has already been consulted for this display. */
    boolean knows(int id) { return displays.containsKey(id); }

    /** Re-evaluate existing sleep tokens, without deleting them or unlocking the main display. */
    void refresh(int id) {
        Object display = displays.get(id);
        if (id <= 0 || display == null || !installed) return;
        try {
            Object service = XposedHelpers.getObjectField(display, "mAtmService");
            Handler handler = (Handler) XposedHelpers.getObjectField(service, "mH");
            Object lock = XposedHelpers.getObjectField(service, "mGlobalLock");
            handler.post(() -> {
                try { synchronized (lock) { XposedHelpers.callMethod(service, "updateSleepIfNeededLocked"); } }
                catch (Throwable error) { logOnce(error); }
            });
        } catch (Throwable error) { logOnce(error); }
    }

    void noteWindowRenewed() { windowRenewals++; }
    void noteRenewTick(int display, long now) {
        renewTicks++;
        lastRenewTick = "display=" + display + (atmService == null ? ", atm=null" : ", atm=ok")
            + ", cached=" + displays.containsKey(display);
    }
    void noteRenewDecision(String text) { lastRenew = text; }

    String status() { return "rearWindowHook=" + installed + ", windowHookError=" + !windowError.isEmpty()
        + (windowError.isEmpty() ? "" : "(" + windowError + ")")
        + ", atmHookError=" + !atmError.isEmpty() + (atmError.isEmpty() ? "" : "(" + atmError + ")")
        + ", atmCaptured=" + (atmService != null)
        + ", renewTicks=" + renewTicks + ", lastRenewTick=" + lastRenewTick
        + ", cameraPreemptions=" + cameraPreemptions
        + ", sleepConsulted=" + consulted + ", keptOwnWindow=" + keptAwake
        + ", systemSleep=" + systemSleepRequests + ", windowRenewals=" + windowRenewals
        + ", probePresent=" + probePresent + ", probeAbsent=" + probeAbsent
        + ", probeUnknown=" + probeUnknown + ", lastProbe=" + lastProbe
        + ", lastRenew=" + lastRenew
        + ", lastDecision=" + lastDecision + ", lastTop=" + lastTop; }

    private static Object field(Object owner, String name) {
        if (owner == null) return null;
        try { return XposedHelpers.getObjectField(owner, name); } catch (Throwable ignored) { return null; }
    }

    private static String text(Throwable error) {
        String message = error.getMessage();
        return error.getClass().getSimpleName() + (message == null || message.isEmpty() ? "" : ": " + message);
    }

    /** 单次记录（保留给 probe/refresh 的偶发异常），不再参与安装状态判定。 */
    private void logOnce(Throwable error) {
        if (windowError.isEmpty()) XposedBridge.log("Tingyu rear window: " + text(error));
    }
}
