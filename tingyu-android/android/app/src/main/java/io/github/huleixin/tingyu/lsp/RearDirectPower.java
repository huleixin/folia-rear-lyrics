package io.github.huleixin.tingyu.lsp;

import android.os.Handler;
import android.os.SystemClock;
import java.util.HashMap;
import java.util.Map;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;

// android/app/src/main/java/io/github/huleixin/tingyu/lsp/RearDirectPower.java
/** requestDisplayPower can address a panel directly, bypassing DisplayPowerController's policy. */
final class RearDirectPower {
    private final RearDirectPowerPolicy policy;
    private final Map<Integer, Object> services = new HashMap<>();
    private final ThreadLocal<RearDirectPowerPolicy.Request> replaying = new ThreadLocal<>();
    private volatile boolean installed, failed;
    private volatile int intercepted, replayFailures;
    private volatile String lastReply = "not requested";
    private Handler timer;
    RearDirectPower(RearDisplayLease lease) { policy = new RearDirectPowerPolicy(lease); }

    void install(ClassLoader loader) {
        try {
            Class<?> service = XposedHelpers.findClass("com.android.server.display.DisplayManagerService", loader);
            XposedHelpers.findAndHookMethod(service, "requestDisplayPower", int.class, int.class, new XC_MethodHook() {
                @Override protected void beforeHookedMethod(MethodHookParam hook) {
                    try {
                        int display = (int) hook.args[0];
                        if (display <= 0) return;
                        RearDirectPowerPolicy.Request request = replaying.get();
                        if (request == null) {
                            request = policy.record(display, (int) hook.args[1]);
                            synchronized (services) { services.put(display, hook.thisObject); }
                        } else if (!policy.current(request)) { hook.setResult(false); return; }
                        int effective = policy.effective(request, SystemClock.elapsedRealtime());
                        if (effective != request.original) intercepted++;
                        hook.setObjectExtra("tingyu-direct-request", request);
                        hook.setObjectExtra("tingyu-direct-state", effective);
                        hook.args[1] = effective;
                    } catch (Throwable error) { logOnce(error); }
                }
                @Override protected void afterHookedMethod(MethodHookParam hook) {
                    try {
                        Object value = hook.getObjectExtra("tingyu-direct-request");
                        if (!(value instanceof RearDirectPowerPolicy.Request)) return;
                        RearDirectPowerPolicy.Request request = (RearDirectPowerPolicy.Request) value;
                        int effective = (int) hook.getObjectExtra("tingyu-direct-state");
                        if (!hook.hasThrowable() && Boolean.TRUE.equals(hook.getResult())) policy.applied(request, effective);
                        lastReply = "display=" + request.display + ", requested=" + request.original + ", effective=" + effective
                            + ", result=" + (hook.hasThrowable() ? "exception" : hook.getResult());
                        if (!policy.current(request)) replay(request.display);
                    } catch (Throwable error) { logOnce(error); }
                }
            });
            installed = true;
        } catch (Throwable error) { logOnce(error); }
    }
    void setTimer(Handler handler) { timer = handler; }
    /** One event-driven replay on acquire/release; renewals with the same applied state do nothing. */
    void replay(int display) {
        Handler handler = timer;
        if (!installed || handler == null || display <= 0) return;
        handler.post(() -> {
            RearDirectPowerPolicy.Request request = policy.latest(display);
            if (request == null || !policy.needsReplay(request, SystemClock.elapsedRealtime())) return;
            Object service;
            synchronized (services) { service = services.get(display); }
            if (service == null) return;
            try {
                replaying.set(request);
                XposedHelpers.callMethod(service, "requestDisplayPower", display, request.original);
            } catch (Throwable error) { replayFailures++; logOnce(error); }
            finally { replaying.remove(); }
        });
    }
    String status() { return "rearDirectPowerHook=" + installed + ", directHookError=" + failed
        + ", rearDirectIntercepts=" + intercepted + ", directReplayFailures=" + replayFailures + ", directLast=" + lastReply; }
    private void logOnce(Throwable error) {
        if (!failed) { failed = true; XposedBridge.log("Tingyu rear direct power: " + error); }
    }
}
