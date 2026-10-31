package io.github.huleixin.tingyu.lsp;

import android.os.Handler;
import android.os.SystemClock;
import android.content.Context;
import android.os.PowerManager;
import java.util.HashMap;
import java.util.Map;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;

// android/app/src/main/java/io/github/huleixin/tingyu/lsp/RearDisplayPower.java
/** Preserve the system request; temporarily clone only the leased rear controller's power policy. */
final class RearDisplayPower {
    private final RearDisplayLease lease = new RearDisplayLease();
    private final RearWindowLease windows = new RearWindowLease(lease);
    private final RearDirectPower direct = new RearDirectPower(lease);
    private final RearDreamGuard dreams = new RearDreamGuard();
    /** 锁屏背屏接管的真实路径（背屏中心 home-to-front）在系统调用层的拦截。 */
    private final RearHomeGuard homes = new RearHomeGuard();
    private final RearLeaseView leaseView = new RearLeaseView() {
        @Override public boolean lyricsLeaseHeld() {
            int id = lease.displayId();
            return id > 0 && lease.holds(id, SystemClock.elapsedRealtime());
        }
        @Override public boolean cameraRecentlyOnLeasedDisplay() {
            int id = lease.displayId();
            return id > 0 && windows.cameraOnTopRecently(id, SystemClock.elapsedRealtime());
        }
        @Override public int leasedDisplayId() { return lease.displayId(); }
    };
    private final Map<Integer, Request> requests = new HashMap<>();
    private final ThreadLocal<Boolean> replaying = new ThreadLocal<>();
    private Handler timer;
    private PowerManager.WakeLock cpuLease;
    private Class<?> requestType;
    private int brightPolicy;
    private volatile boolean installed, loggedFailure;
    private final Runnable expiry = this::expire;
    private final Runnable releaseCpuWhenIdle = () -> {
        synchronized (RearDisplayPower.this) {
            if (lease.remaining(SystemClock.elapsedRealtime()) == 0 && cpuLease != null && cpuLease.isHeld()) cpuLease.release();
        }
    };
    private final Runnable windowRenew = this::runWindowRenew;
    /**
     * Keeps the lease alive while the rear window is still attached. HyperOS freezes the
     * client once the main display locks, so its own renew IPC stops arriving; without this
     * the lease lapsed exactly one minute into a locked screen and the panel went to sleep.
     * Bounded by RearDisplayLease.MAX_WINDOW_RENEWALS.
     */
    private void runWindowRenew() {
        long now = SystemClock.elapsedRealtime();
        int id = lease.displayId();
        if (id <= 0) return;
        try {
            // A camera on the rear display owns the panel: stop extending our bright lease so the
            // OEM camera's own power requests are not overridden while it is starting.
            if (Boolean.TRUE.equals(windows.hasOwnWindow(id)) && !windows.cameraOnTopRecently(id, now))
                lease.renewForWindow(id, now);
        }
        catch (Throwable error) { logOnce(error); }
        Handler handler = timer;
        if (handler != null && lease.remaining(now) > 0) handler.postDelayed(windowRenew, RearDisplayLease.WINDOW_RENEW_MS / 2);
    }

    void install(ClassLoader loader) {
        windows.install(loader);
        direct.install(loader);
        // Fault B: the real lock-time takeover (REAREye evidence) is the rear centre's
        // home-to-front pulling SubScreenLauncher onto the rear display. Intercept both the
        // start and the move paths while our lyric lease is held; the dream path is a fallback.
        homes.install(loader, leaseView);
        // The DreamService route stays guarded as a lower-confidence second layer, now with
        // explicit match counting so a silent zero-match install can never masquerade as success.
        dreams.install(loader, leaseView);
        try {
            requestType = XposedHelpers.findClass("android.hardware.display.DisplayManagerInternal$DisplayPowerRequest", loader);
            brightPolicy = XposedHelpers.getStaticIntField(requestType, "POLICY_BRIGHT");
            Class<?> controller = XposedHelpers.findClass("com.android.server.display.DisplayPowerController", loader);
            XposedHelpers.findAndHookMethod(controller, "requestPowerState", requestType, boolean.class, new XC_MethodHook() {
                @Override protected void beforeHookedMethod(MethodHookParam hook) {
                    try {
                        int display = XposedHelpers.getIntField(hook.thisObject, "mDisplayId");
                        if (display <= 0) return; // Never alter or copy the main display's request.
                        if (!Boolean.TRUE.equals(replaying.get())) {
                            Request record = new Request(hook.thisObject, copy(hook.args[0]), (boolean) hook.args[1],
                                (Handler) XposedHelpers.getObjectField(hook.thisObject, "mHandler"));
                            synchronized (requests) { requests.put(display, record); }
                        }
                        if (lease.holds(display, SystemClock.elapsedRealtime())
                                && !windows.cameraOnTopRecently(display, SystemClock.elapsedRealtime())) {
                            Object own = copy(hook.args[0]);
                            XposedHelpers.setIntField(own, "policy", brightPolicy);
                            hook.args[0] = own;
                        }
                    } catch (Throwable error) { logOnce(error); }
                }
            });
            installed = true;
        } catch (Throwable error) { logOnce(error); }
    }
    void setTimer(Context context, Handler handler) {
        timer = handler;
        direct.setTimer(handler);
        PowerManager manager = context.getSystemService(PowerManager.class);
        if (manager != null) {
            cpuLease = manager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Tingyu:RearDisplayLease");
            cpuLease.setReferenceCounted(false);
        }
    }
    String status() { return "rearPowerHook=" + installed + ", hookError=" + loggedFailure + ", " + windows.status()
        + ", " + direct.status() + ", " + homes.status() + ", " + dreams.status() + ", " + lease.describe() + ", leaseRemainingMs=" + lease.remaining(SystemClock.elapsedRealtime()); }
    synchronized void acquire(int display, String session) {
        synchronized (requests) {
            if (!installed || loggedFailure || timer == null || cpuLease == null || !requests.containsKey(display))
                throw new IllegalStateException("Rear power controller unavailable; reboot after updating the module");
        }
        // Keeps the expiry and pause handoff runnable while the main display is asleep.
        // PARTIAL_WAKE_LOCK does not wake display 0; every acquire has a bounded timeout.
        cpuLease.acquire(RearDisplayLease.TIMEOUT_MS + 5000);
        timer.removeCallbacks(releaseCpuWhenIdle);
        int previous = lease.acquire(display, session, SystemClock.elapsedRealtime());
        if (previous > 0 && previous != display) { replay(previous); windows.refresh(previous); direct.replay(previous); }
        replay(display); windows.refresh(display); direct.replay(display);
        Handler handler = timer;
        if (handler != null) {
            handler.removeCallbacks(expiry); handler.postDelayed(expiry, RearDisplayLease.TIMEOUT_MS);
            handler.removeCallbacks(windowRenew); handler.postDelayed(windowRenew, RearDisplayLease.WINDOW_RENEW_MS / 2);
        }
    }
    synchronized void release(int display, String session) {
        if (lease.release(display, session)) { if (timer != null) timer.removeCallbacks(windowRenew); replay(display); windows.refresh(display); direct.replay(display); releaseCpu(); }
    }
    synchronized void clear() {
        int old = lease.clear(); if (timer != null) { timer.removeCallbacks(expiry); timer.removeCallbacks(windowRenew); }
        if (old > 0) { replay(old); windows.refresh(old); direct.replay(old); } releaseCpu();
    }
    private synchronized void expire() {
        int old = lease.expire(SystemClock.elapsedRealtime());
        if (old > 0) { if (timer != null) timer.removeCallbacks(windowRenew); replay(old); windows.refresh(old); direct.replay(old); releaseCpu(); }
        long remaining = lease.remaining(SystemClock.elapsedRealtime());
        if (remaining > 0 && timer != null) timer.postDelayed(expiry, remaining);
    }
    private void releaseCpu() {
        // Let the power-controller handler apply the restored request before autosuspend can run.
        if (timer != null) { timer.removeCallbacks(releaseCpuWhenIdle); timer.postDelayed(releaseCpuWhenIdle, 1000); }
        else releaseCpuWhenIdle.run();
    }
    private Object copy(Object request) { return XposedHelpers.newInstance(requestType, request); }
    /** Reapply the latest original policy on the controller's own handler, not system_server's main thread. */
    private void replay(int display) {
        Request record;
        synchronized (requests) { record = requests.get(display); }
        if (record == null) return;
        record.handler.post(() -> {
            Request latest;
            synchronized (requests) { latest = requests.get(display); }
            if (latest == null || latest.controller != record.controller) return;
            try {
                replaying.set(true);
                XposedHelpers.callMethod(latest.controller, "requestPowerState", copy(latest.original), latest.waitForProximity);
            } catch (Throwable error) { logOnce(error); }
            finally { replaying.remove(); }
        });
    }
    private void logOnce(Throwable error) {
        if (!loggedFailure) { loggedFailure = true; XposedBridge.log("Tingyu rear power: " + error); }
    }
    private static final class Request {
        final Object controller, original; final boolean waitForProximity; final Handler handler;
        Request(Object controller, Object original, boolean waitForProximity, Handler handler) {
            this.controller = controller; this.original = original; this.waitForProximity = waitForProximity; this.handler = handler;
        }
    }
}
