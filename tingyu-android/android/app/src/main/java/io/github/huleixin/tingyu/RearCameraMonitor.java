package io.github.huleixin.tingyu;

import android.content.Context;
import android.hardware.camera2.CameraManager;
import android.os.Handler;
import android.os.SystemClock;

// android/app/src/main/java/io/github/huleixin/tingyu/RearCameraMonitor.java
/** Availability events only: never opens a camera, requests permission, or polls the camera service. */
final class RearCameraMonitor {
    interface Callback { void changed(boolean blocked); }
    private final CameraManager manager;
    private final Handler main;
    private final Callback changed;
    private final RearCameraPolicy policy = new RearCameraPolicy();
    private boolean running, reported;
    private String error = "";
    private CameraManager.AvailabilityCallback listener;
    private final Runnable settle = this::publish;

    RearCameraMonitor(Context context, Handler main, Callback changed) {
        manager = context.getSystemService(CameraManager.class);
        this.main = main; this.changed = changed;
    }
    void start() {
        if (running || manager == null) return;
        running = true; error = ""; policy.start(SystemClock.elapsedRealtime());
        // A separate callback per registration rejects events queued before stop/re-enable.
        listener = new CameraManager.AvailabilityCallback() {
            @Override public void onCameraAvailable(String id) { availability(this, id, true); }
            @Override public void onCameraUnavailable(String id) { availability(this, id, false); }
        };
        try { manager.registerAvailabilityCallback(listener, main); publish(); }
        catch (RuntimeException failure) {
            error = failure.getClass().getSimpleName(); stop();
        }
    }
    void stop() {
        running = false; main.removeCallbacks(settle); policy.stop();
        CameraManager.AvailabilityCallback previous = listener; listener = null;
        if (previous != null) try { manager.unregisterAvailabilityCallback(previous); }
        catch (RuntimeException failure) { error = failure.getClass().getSimpleName(); }
        publish();
    }
    boolean blocked() { return policy.blocked(SystemClock.elapsedRealtime()); }
    String status() { return "cameraMonitor=" + running + ", cameraBlocked=" + blocked()
        + ", unavailableCameras=" + policy.busyCount() + ", cameraMonitorError=" + error; }
    private void availability(CameraManager.AvailabilityCallback owner, String id, boolean available) {
        if (!running || listener != owner) return;
        policy.available(id, available, SystemClock.elapsedRealtime()); publish();
    }
    private void publish() {
        main.removeCallbacks(settle);
        boolean next = blocked();
        if (reported != next) { reported = next; changed.changed(next); }
        long delay = policy.remaining(SystemClock.elapsedRealtime());
        if (delay > 0) main.postDelayed(settle, delay);
    }
}
