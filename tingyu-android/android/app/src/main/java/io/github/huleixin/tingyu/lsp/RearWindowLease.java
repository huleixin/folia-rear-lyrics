package io.github.huleixin.tingyu.lsp;

import android.content.ComponentName;
import android.os.Handler;
import android.os.SystemClock;
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
    private boolean installed;
    private volatile boolean failed;
    // Sleep-path diagnostics: on-device evidence of whether the hook is consulted at lock
    // time and whether our lease was actually held there. Counters only; no task content.
    private volatile long consulted, keptAwake, systemSleepRequests;
    private volatile String lastTop = "", lastDecision = "not consulted";
    RearWindowLease(RearDisplayLease lease) { this.lease = lease; }

    void install(ClassLoader loader) {
        try {
            Class<?> displayType = XposedHelpers.findClass("com.android.server.wm.DisplayContent", loader);
            XC_MethodHook keepOwnWindow = new XC_MethodHook() {
                @Override protected void afterHookedMethod(MethodHookParam hook) {
                    if (hook.hasThrowable() || Boolean.TRUE.equals(inspecting.get())) return;
                    try {
                        int id = XposedHelpers.getIntField(hook.thisObject, "mDisplayId");
                        if (id <= 0) return;
                        displays.put(id, hook.thisObject);
                        if (!Boolean.TRUE.equals(hook.getResult())) return;
                        consulted++;
                        if (!lease.holds(id, SystemClock.elapsedRealtime())) {
                            systemSleepRequests++;
                            lastDecision = "no-lease";
                            return;
                        }
                        inspecting.set(true);
                        Object top = XposedHelpers.callMethod(hook.thisObject, "topRunningActivity");
                        ComponentName component = top == null ? null : (ComponentName) XposedHelpers.getObjectField(top, "mActivityComponent");
                        String pkg = component == null ? "" : component.getPackageName();
                        String activity = component == null ? "" : component.getClassName();
                        lastTop = pkg + "/" + (component == null ? "?" : component.getShortClassName());
                        if (lease.holdsWindow(id, pkg, activity, SystemClock.elapsedRealtime())) {
                            keptAwake++;
                            lastDecision = "kept-own-window";
                            hook.setResult(false);
                        } else {
                            systemSleepRequests++;
                            lastDecision = "top-not-own";
                            // The rear display sleeps because something else became the top
                            // activity while we held the lease - the key HyperOS 4 lock-time
                            // signature to confirm on a real device.
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
        } catch (Throwable error) { logOnce(error); }
    }

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
    String status() { return "rearWindowHook=" + installed + ", windowHookError=" + failed
        + ", sleepConsulted=" + consulted + ", keptOwnWindow=" + keptAwake
        + ", systemSleep=" + systemSleepRequests + ", lastDecision=" + lastDecision + ", lastTop=" + lastTop; }
    private void logOnce(Throwable error) {
        if (!failed) { failed = true; XposedBridge.log("Tingyu rear window: " + error); }
    }
}
