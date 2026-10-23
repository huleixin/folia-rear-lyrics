package io.github.huleixin.tingyu;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Handler;
import android.os.SystemClock;

// android/app/src/main/java/top/izuna/foliamajor/RearCoverMonitor.java
/** Conservative rear-cover detection: never treat the front earpiece proximity sensor as rear. */
final class RearCoverMonitor implements SensorEventListener {
    interface Callback { void cover(boolean covered); }
    private final SensorManager manager;
    private final Handler main;
    private final Callback callback;
    private final Sensor gravity, rearProximity;
    private boolean running, rearNear, candidate, reported;
    private long ignoreUntil;
    private float lastX, lastY, lastZ;
    private boolean hasSample;
    private final Runnable settle = this::settled;
    private void settled() { if (running && candidate && SystemClock.elapsedRealtime() >= ignoreUntil) { reported = true; callback.cover(true); } }

    RearCoverMonitor(Context context, Handler main, Callback callback) {
        this.main = main; this.callback = callback;
        manager = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
        Sensor rear = null, acceleration = null;
        if (manager != null) {
            acceleration = manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER, true);
            if (acceleration == null) acceleration = manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            for (Sensor sensor : manager.getSensorList(Sensor.TYPE_PROXIMITY)) {
                if (RearCoverPolicy.rearSensor(sensor.getName())) { rear = sensor; break; }
            }
        }
        gravity = acceleration; rearProximity = rear;
    }
    boolean available() { return gravity != null || rearProximity != null; }
    String description() { return "tabletop=" + (gravity != null) + ", rearCoverSensor=" + (rearProximity == null ? "unavailable" : rearProximity.getName()); }
    void start() {
        if (running || manager == null) return;
        running = true; hasSample = false;
        if (gravity != null) manager.registerListener(this, gravity, SensorManager.SENSOR_DELAY_NORMAL, main);
        if (rearProximity != null) manager.registerListener(this, rearProximity, SensorManager.SENSOR_DELAY_NORMAL, main);
    }
    void stop() {
        running = false; main.removeCallbacks(settle);
        if (manager != null) manager.unregisterListener(this);
        candidate = reported = rearNear = false;
    }
    void userWake() {
        ignoreUntil = SystemClock.elapsedRealtime() + 10_000;
        candidate = reported = false; main.removeCallbacks(settle);
    }
    @Override public void onSensorChanged(SensorEvent event) {
        if (!running) return;
        boolean covered;
        if (event.sensor == rearProximity) {
            rearNear = event.values[0] < Math.min(5f, rearProximity.getMaximumRange());
            covered = rearNear;
        } else {
            float x = event.values[0], y = event.values[1], z = event.values[2];
            float motion = Math.abs(x-lastX) + Math.abs(y-lastY) + Math.abs(z-lastZ);
            covered = rearNear || RearCoverPolicy.tabletop(x, y, z, motion, hasSample);
            lastX=x; lastY=y; lastZ=z; hasSample=true;
        }
        if (SystemClock.elapsedRealtime() < ignoreUntil) covered = false;
        if (covered == candidate) return;
        candidate = covered; main.removeCallbacks(settle);
        if (covered) main.postDelayed(settle, 1800);
        else if (reported) { reported = false; callback.cover(false); }
    }
    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) { }
}
