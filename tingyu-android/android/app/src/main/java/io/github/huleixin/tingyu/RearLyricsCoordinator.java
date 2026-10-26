package io.github.huleixin.tingyu;

import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.graphics.Point;
import android.hardware.display.DisplayManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.view.Display;
import java.util.ArrayList;
import java.util.List;
import rikka.shizuku.Shizuku;

/** Process-scoped rear window keeper; uses the existing playback foreground service, not another app. */
final class RearLyricsCoordinator {
    private static RearLyricsCoordinator instance;
    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final List<RearLyricsLauncher.Callback> callbacks = new ArrayList<>();
    private final RearCoverMonitor coverMonitor;
    private volatile boolean coverSleepEnabled, sleeping, powerBusy, sleepUnsupported;
    private boolean physicalCover;
    private boolean preservedSleepSession;
    private String powerDetail = "not tested";
    private volatile boolean enabled, playing, manual, pending;
    private boolean scheduled, waking, wakeTried, probing, covered, lockRecovery;
    private String frontTask = "unknown";
    private long lastProbe;
    private IBinder shell;
    private int failures, generation;
    private long nextAttempt;
    private final Runnable check = () -> { scheduled = false; checkWindow(); };
    private final Runnable bindTimeout = () -> finishFailure("连接背屏服务超时，已保留自动启动开关", null);
    private final ServiceConnection connection = new ServiceConnection() {
        @Override public void onServiceConnected(ComponentName name, IBinder service) {
            main.post(() -> { if (LspRearBridge.selected(context)) return; main.removeCallbacks(bindTimeout); shell = service; if (pending && wanted()) launch(); });
        }
        @Override public void onServiceDisconnected(ComponentName name) {
            main.post(() -> { if (LspRearBridge.selected(context)) return; shell = null; if (pending) finishFailure("Shizuku 已断开，等待恢复后自动重试", null); });
        }
    };

    static synchronized RearLyricsCoordinator get(Context context) {
        if (instance == null) instance = new RearLyricsCoordinator(context.getApplicationContext());
        return instance;
    }
    private RearLyricsCoordinator(Context context) {
        this.context = context;
        enabled = context.getSharedPreferences("rear_lyrics", 0).getBoolean("auto_enabled", false);
        coverSleepEnabled = context.getSharedPreferences("rear_lyrics", 0).getBoolean("cover_sleep", false);
        coverMonitor = new RearCoverMonitor(context, main, value -> {
            physicalCover = value;
            if (coverSleepEnabled && wanted()) changeSleep(value);
        });
        main.post(this::watchDisplays);
    }
    boolean isEnabled() { return enabled; }
    boolean canChangeBackend() { return !wanted() && !isStarting() && !sleeping && !powerBusy; }
    void backendChanged() { main.post(() -> { shell = null; nextAttempt = 0; nudge(); }); }
    void lspConnected() { main.post(() -> { if (LspRearBridge.selected(context)) { shell = LspRearBridge.get(); nextAttempt = 0; nudge(); } }); }
    boolean isStarting() { return pending || RearLyricsLauncher.isStarting(); }
    boolean wanted() { return RearLyricsPolicy.shouldMaintain(enabled, playing, manual); }
    boolean isSleeping() { return sleeping; }
    boolean preserveSleepSession() { return preservedSleepSession; }
    boolean coverSleepEnabled() { return coverSleepEnabled; }
    boolean sleepUnsupported() { return sleepUnsupported; }
    boolean sensorAvailable() { return coverMonitor.available(); }
    String sleepDiagnostics() { return coverMonitor.description() + ", sleeping=" + sleeping + ", unsupported=" + sleepUnsupported + "\n" + powerDetail; }
    void setCoverSleep(boolean value) {
        main.post(() -> {
            coverSleepEnabled = value; sleepUnsupported = false;
            context.getSharedPreferences("rear_lyrics", 0).edit().putBoolean("cover_sleep", value).apply();
            if (!value && sleeping) changeSleep(false);
            syncCoverMonitor();
        });
    }
    private void syncCoverMonitor() {
        if (coverSleepEnabled && wanted() && !sleepUnsupported) coverMonitor.start(); else coverMonitor.stop();
    }
    private void closeWindow() {
        if (!sleeping && !powerBusy) { RearLyricsLauncher.close(context); return; }
        int rear = findRearDisplayId(context);
        // Release our power override before invalidating the session used by the shell.
        if (shell != null && rear > 0) RearLyricsLauncher.setRearSleeping(context, shell, rear, false, (success, detail) -> main.post(() -> {
            powerDetail = detail;
            if (success) { sleeping = false; RearLyricsActivity.setPowerSleeping(false); RearLyricsLauncher.close(context); }
        }));
    }
    private void changeSleep(boolean value) {
        if (powerBusy || value == sleeping || (value && sleepUnsupported)) return;
        int rear = findRearDisplayId(context);
        if (rear <= 0 || shell == null || !shell.isBinderAlive() || (value && !active(rear))) return;
        powerBusy = true;
        if (value) sleeping = true; // Guard before the display-off event reaches the keeper.
        RearLyricsActivity.setPowerSleeping(value);
        RearLyricsLauncher.setRearSleeping(context, shell, rear, value, (success, detail) -> main.post(() -> {
            powerBusy = false; powerDetail = detail;
            nextAttempt = SystemClock.elapsedRealtime() + 4000;
            if (success) { sleeping = value; if (value) preservedSleepSession = true; }
            else if (value) { sleeping = false; sleepUnsupported = true; }
            // A failed wake retains the sleep guard; never recreate the lyric task behind a power override.
            RearLyricsActivity.setPowerSleeping(sleeping);
            RearLyricsTrace.record(context, "cover-power", "requested=" + value + ", success=" + success + ", " + detail);
            syncCoverMonitor();
            if (!sleeping) { nextAttempt = SystemClock.elapsedRealtime() + 2500; nudge(); }
            else if (success && !physicalCover) changeSleep(false);
        }));
    }
    String diagnostics() { return "enabled=" + enabled + ", playing=" + playing + ", manual=" + manual
        + ", pending=" + pending + ", failures=" + failures + ", rearWakeTried=" + wakeTried
        + ", covered=" + covered + ", lockRecovery=" + lockRecovery + ", frontTask=" + frontTask
        + ", backend=" + (LspRearBridge.selected(context) ? "lsp" : "shizuku") + ", lsp=" + LspRearBridge.detail(); }

    void enable(RearLyricsLauncher.Callback callback) {
        main.post(() -> {
            enabled = true; manual = true; failures = 0; nextAttempt = 0;
            syncCoverMonitor();
            context.getSharedPreferences("rear_lyrics", 0).edit().putBoolean("auto_enabled", true).apply();
            int rear = findRearDisplayId(context);
            if (active(rear)) { callback.success(rear, "背屏歌词已启用，之后播放时自动显示"); return; }
            callbacks.add(callback);
            if (!pending && !RearLyricsLauncher.isStarting()) begin();
            schedule(2000);
        });
    }
    void disable() {
        // Cancel the session before queued shell commands can launch another window.
        enabled = false;
        context.getSharedPreferences("rear_lyrics", 0).edit().putBoolean("auto_enabled", false).apply();
        main.post(() -> {
            coverMonitor.stop(); physicalCover = false;
            closeWindow();
            manual = false; preservedSleepSession = false; generation++; pending = false;
            main.removeCallbacks(bindTimeout); main.removeCallbacks(check); scheduled = false;
            complete(false, -1, "背屏歌词已关闭", null);
        });
    }
    void playback(boolean value) {
        if (playing == value) return;
        main.post(() -> {
            if (playing == value) return;
            playing = value;
            syncCoverMonitor();
            if (value) { failures = 0; nextAttempt = 0; }
            schedule(150);
        });
    }
    void stopped() {
        main.post(() -> {
            coverMonitor.stop(); physicalCover = false;
            closeWindow();
            playing = false; manual = false; generation++; pending = false;
            main.removeCallbacks(bindTimeout); main.removeCallbacks(check); scheduled = false;
            complete(false, -1, "播放服务已停止，背屏开关仍保留", null);
        });
    }
    void windowChanged() { main.post(this::nudge); }
    private void nudge() {
        // Lock/power transitions should not wait behind an ordinary two-second heartbeat.
        main.removeCallbacks(check); scheduled = false; schedule(350);
    }
    private void schedule(long delay) {
        if (scheduled || !wanted()) return;
        scheduled = true; main.postDelayed(check, delay);
    }
    private void checkWindow() {
        if (!wanted()) return;
        syncCoverMonitor();
        if (!RearCoverPolicy.mayRecoverWindow(sleeping, powerBusy)) {
            if (sleeping && !physicalCover && !powerBusy && SystemClock.elapsedRealtime() >= nextAttempt) changeSleep(false);
            schedule(2000); return;
        }
        int rear = findRearDisplayId(context);
        boolean visible = rear >= 0 && !covered && RearLyricsActivity.isShowingOnDisplay(rear);
        long now = SystemClock.elapsedRealtime();
        inspectFront(rear, now);
        if (active(rear)) wakeTried = false;
        if (!pending && !waking && !wakeTried && now >= nextAttempt && rear >= 0 && shell != null && shell.isBinderAlive()
                && RearLyricsActivity.isEnabled() && RearLyricsLauncher.displayState(context, rear) != Display.STATE_ON) {
            waking = true; wakeTried = true; nextAttempt = now + 4000;
            RearLyricsLauncher.wake(context, shell, rear, () -> main.post(() -> { waking = false; schedule(700); }));
        } else if (RearLyricsPolicy.shouldAttempt(enabled, playing, manual, RearLyricsState.hasConfig(),
                visible && RearLyricsLauncher.displayState(context, rear) == Display.STATE_ON,
                pending || waking || RearLyricsLauncher.isStarting(), now, nextAttempt, lockRecovery)) begin();
        schedule(2000);
    }
    private void begin() {
        if (!wanted()) return;
        try {
            if (LspRearBridge.selected(context)) {
                LspRearBridge.request(context);
                shell = LspRearBridge.get();
                if (shell == null) { finishFailure(LspRearBridge.detail(), null); return; }
                if (findRearDisplayId(context) < 0) { finishFailure("未检测到适配的背屏", null); return; }
                pending = true; launch(); return;
            }
            if (!Shizuku.pingBinder() || Shizuku.checkSelfPermission() != PackageManager.PERMISSION_GRANTED) {
                finishFailure("等待 Shizuku 运行并授权听屿；自动启动开关已保留", null); return;
            }
            if (findRearDisplayId(context) < 0) { finishFailure("未检测到小米背屏，等待背屏可用后重试", null); return; }
            pending = true;
            if (shell != null && shell.isBinderAlive()) { launch(); return; }
            main.removeCallbacks(bindTimeout); main.postDelayed(bindTimeout, 12_000);
            Shizuku.bindUserService(new Shizuku.UserServiceArgs(new ComponentName(context, ShellUserService.class))
                .tag("folia-rear-lyrics").version(ShellUserService.VERSION).processNameSuffix("rear_lyrics").daemon(false), connection);
        } catch (Exception error) { finishFailure("无法连接 Shizuku：" + error.getMessage(), error); }
    }
    private void inspectFront(int rear, long now) {
        if (rear < 0 || probing || pending || RearLyricsLauncher.isStarting() || now - lastProbe < 2000
                || shell == null || !shell.isBinderAlive() || RearLyricsActivity.windowState() == null) return;
        probing = true; lastProbe = now;
        String session = RearLyricsActivity.currentSession();
        RearLyricsLauncher.inspectFront(shell, rear, summary -> main.post(() -> {
            probing = false;
            if (!RearLyricsActivity.isCurrentSession(session)) return;
            RearLyricsActivity.WindowState window = RearLyricsActivity.windowState();
            int top = RearLyricsTaskList.taskId(summary);
            boolean occluded = top >= 0 && window != null && top != window.taskId;
            if (!summary.equals(frontTask)) { frontTask = summary; RearLyricsTrace.record(context, "rear-front", summary); }
            if (top >= 0 && covered != occluded) {
                covered = occluded;
                if (covered) nextAttempt = 0;
                nudge();
            }
        }));
    }
    private void launch() {
        if (!wanted()) { pending = false; return; }
        if (RearLyricsLauncher.isStarting()) return;
        int token = ++generation;
        RearLyricsLauncher.start(context, new RearLyricsLauncher.Callback() {
            @Override public void success(int rear, String message) {
                main.post(() -> {
                    if (token != generation) return;
                    pending = false; covered = false; lockRecovery = false; failures = 0; nextAttempt = SystemClock.elapsedRealtime() + 2000;
                    if (coverSleepEnabled && physicalCover) changeSleep(true);
                    complete(true, rear, message, null); schedule(2000);
                });
            }
            @Override public void failure(String message, Exception error) {
                main.post(() -> { if (token == generation) finishFailure(message, error); });
            }
        }, shell, findRearDisplayId(context));
    }
    private void finishFailure(String message, Exception error) {
        pending = false; main.removeCallbacks(bindTimeout);
        nextAttempt = SystemClock.elapsedRealtime() + RearLyricsPolicy.retryDelay(failures++);
        context.getSharedPreferences("rear_lyrics", 0).edit().putString("launch_message", message).apply();
        complete(false, -1, message, error); schedule(2000);
    }
    private void complete(boolean success, int rear, String message, Exception error) {
        List<RearLyricsLauncher.Callback> completed = new ArrayList<>(callbacks); callbacks.clear();
        for (RearLyricsLauncher.Callback callback : completed) {
            if (success) callback.success(rear, message); else callback.failure(message, error);
        }
    }
    private boolean active(int rear) {
        return rear >= 0 && !covered && RearLyricsActivity.isShowingOnDisplay(rear) && RearLyricsLauncher.displayState(context, rear) == Display.STATE_ON;
    }
    private void watchDisplays() {
        IntentFilter filter = new IntentFilter(Intent.ACTION_SCREEN_OFF);
        filter.addAction(Intent.ACTION_SCREEN_ON); filter.addAction(Intent.ACTION_USER_PRESENT);
        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                if (Intent.ACTION_SCREEN_OFF.equals(intent.getAction()) && wanted() && !sleeping && !powerBusy) {
                    lockRecovery = true; nextAttempt = 0;
                }
                lastProbe = 0; RearLyricsTrace.record(context, "power-event", intent.getAction()); nudge();
            }
        };
        if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else context.registerReceiver(receiver, filter);
        DisplayManager manager = (DisplayManager) context.getSystemService(Context.DISPLAY_SERVICE);
        if (manager != null) manager.registerDisplayListener(new DisplayManager.DisplayListener() {
            @Override public void onDisplayAdded(int id) { nudge(); }
            @Override public void onDisplayRemoved(int id) { nudge(); }
            @Override public void onDisplayChanged(int id) {
                if (id == findRearDisplayId(context) && sleeping && !powerBusy && RearLyricsLauncher.displayState(context, id) == Display.STATE_ON) {
                    // OEM double-tap-to-wake is handled by the system, then reuses this same WebView.
                    sleeping = false; physicalCover = false; coverMonitor.userWake();
                    RearLyricsActivity.setPowerSleeping(false);
                    nextAttempt = SystemClock.elapsedRealtime() + 2500;
                }
                nudge();
            }
        }, main);
    }
    static int findRearDisplayId(Context context) {
        DisplayManager manager = (DisplayManager) context.getSystemService(Context.DISPLAY_SERVICE);
        if (manager == null) return -1;
        int fallback = -1;
        for (Display display : manager.getDisplays()) {
            if (display.getDisplayId() == Display.DEFAULT_DISPLAY || (display.getFlags() & Display.FLAG_PRIVATE) != 0) continue;
            Point size = new Point(); display.getRealSize(size);
            int shortSide = Math.min(size.x, size.y), longSide = Math.max(size.x, size.y);
            if ((shortSide == 572 && longSide == 904) || (shortSide == 596 && longSide == 976)) return display.getDisplayId();
            if (shortSide >= 540 && shortSide <= 650 && longSide >= 850 && longSide <= 1050) fallback = display.getDisplayId();
        }
        return fallback;
    }
}
