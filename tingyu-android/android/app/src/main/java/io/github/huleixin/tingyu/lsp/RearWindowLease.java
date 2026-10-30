package io.github.huleixin.tingyu.lsp;

import android.os.Handler;
import android.os.SystemClock;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Predicate;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;

// android/app/src/main/java/io/github/huleixin/tingyu/lsp/RearWindowLease.java
/** Display brightness and the window-manager sleep state are separate Android policies. */
final class RearWindowLease {
    /** Matches a WindowState owned by this package; the only witness that the client is alive. */
    private static final Predicate<Object> OWN_WINDOW = window -> {
        try {
            Object attrs = XposedHelpers.getObjectField(window, "mAttrs");
            return RearBridgeContract.PACKAGE.equals(XposedHelpers.getObjectField(attrs, "packageName"));
        } catch (Throwable ignored) { return false; }
    };

    private final RearDisplayLease lease;
    private final Map<Integer, Object> displays = new ConcurrentHashMap<>();
    private final ThreadLocal<Boolean> inspecting = new ThreadLocal<>();
    private boolean installed;
    private volatile boolean failed;
    // Sleep-path diagnostics: on-device evidence of whether the hook is consulted at lock
    // time and whether our lease was actually held there. Counters only; no task content.
    private volatile long consulted, keptAwake, systemSleepRequests, windowRenewals;
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
                        Object component = top == null ? null : XposedHelpers.getObjectField(top, "mActivityComponent");
                        String pkg = readString(component, "getPackageName");
                        String activity = readString(component, "getClassName");
                        lastTop = pkg + "/" + component;
                        // The client is frozen while the main screen is locked, so its renew
                        // IPC stops arriving. A still-attached window is proof it is alive.
                        Boolean ownWindow = hasOwnWindow(hook.thisObject);
                        if (Boolean.TRUE.equals(ownWindow) && lease.renewForWindow(id, SystemClock.elapsedRealtime())) {
                            windowRenewals++;
                            lastDecision = "renewed-on-window";
                        }
                        if (lease.holdsWindow(id, pkg, activity, ownWindow, SystemClock.elapsedRealtime())) {
                            keptAwake++;
                            if (!"renewed-on-window".equals(lastDecision)) lastDecision = "kept-own-window";
                            hook.setResult(false);
                        } else {
                            systemSleepRequests++;
                            if (!"renewed-on-window".equals(lastDecision)) {
                                lastDecision = RearBridgeContract.isCameraPackage(pkg) ? "camera-on-top" : "top-not-own";
                            }
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

    private static String readString(Object owner, String method) {
        if (owner == null) return "";
        try {
            Object value = XposedHelpers.callMethod(owner, method);
            return value instanceof String ? (String) value : "";
        } catch (Throwable ignored) { return ""; }
    }

    /**
     * TRUE when the display still hosts a window owned by this package, FALSE when the list
     * was readable and none matched, null when reflection failed. Tries the modern
     * DisplayContent.getWindow(Predicate) first and falls back to walking mChildren, because
     * the accessor name differs between releases.
     */
    Boolean hasOwnWindow(Object display) {
        if (display == null) return null;
        try {
            return XposedHelpers.callMethod(display, "getWindow", OWN_WINDOW) != null;
        } catch (Throwable ignored) { /* fall through */ }
        try {
            Object children = XposedHelpers.getObjectField(display, "mChildren");
            int size = (Integer) XposedHelpers.callMethod(children, "size");
            for (int i = 0; i < size; i++) {
                if (Boolean.TRUE.equals(OWN_WINDOW.test(XposedHelpers.callMethod(children, "get", i)))) return true;
            }
            return false;
        } catch (Throwable ignored) { return null; }
    }
    Boolean hasOwnWindow(int id) { return hasOwnWindow(displays.get(id)); }

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
        + ", systemSleep=" + systemSleepRequests + ", windowRenewals=" + windowRenewals
        + ", lastDecision=" + lastDecision + ", lastTop=" + lastTop; }
    private void logOnce(Throwable error) {
        if (!failed) { failed = true; XposedBridge.log("Tingyu rear window: " + error); }
    }
}
