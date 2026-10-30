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
    private static volatile RearLyricsCoordinator instance;
    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final List<RearLyricsLauncher.Callback> callbacks = new ArrayList<>();
    private final RearCoverMonitor coverMonitor;
    private final RearCameraMonitor cameraMonitor;
    private volatile boolean cameraBusy, cameraYielding;
    private volatile boolean rearTaskCamera;
    private volatile boolean coverSleepEnabled, sleeping, powerBusy, sleepUnsupported;
    private boolean physicalCover;
    private boolean preservedSleepSession;
    private boolean stuckReported;
    private long cameraIdleAt, cameraHoldSince, lastRearTaskAt, yieldUntil;
    private RearOwnershipState.State lastOwnership;
    private String powerDetail = "not tested";
    private volatile boolean enabled, playing, manual, pending;
    private volatile boolean requestedPlaying;
    private boolean scheduled, waking, wakeTried, probing, covered, lockRecovery;
    private String frontTask = "unknown";
    private int lastRearPower = Display.STATE_UNKNOWN;
    private long lastProbe;
    private IBinder shell;
    private int failures, generation;
    private long nextAttempt;
    private final RearPlaybackHandoff handoff = new RearPlaybackHandoff();
    private volatile boolean closing;
    private boolean lspPowerBusy, lspHolding, lastHoldDesired;
    private long nextHoldRefresh;
    private String leaseSession = "", lspPowerDetail = "not requested";
    private final Runnable pauseTimeout = this::returnAfterPause;
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
        cameraMonitor = new RearCameraMonitor(context, main, this::cameraChanged);
        main.post(() -> { watchDisplays(); if (enabled) cameraMonitor.start(); });
    }
    boolean isEnabled() { return enabled; }
    boolean canChangeBackend() { return !wanted() && !isStarting() && !sleeping && !powerBusy && !closing; }
    void backendChanged() { main.post(() -> { shell = null; handoff.reset(); nextAttempt = 0; nudge(); }); }
    void lspConnected() { main.post(() -> { if (LspRearBridge.selected(context)) { shell = LspRearBridge.get(); nextAttempt = 0; nextHoldRefresh = 0; nudge(); } }); }
    boolean isStarting() { return closing || pending || RearLyricsLauncher.isStarting(); }
    boolean wanted() { return handoff.wanted(enabled, playing, manual, LspRearBridge.selected(context)); }
    /**
     * Camera ownership is derived from evidence, never from a stored "pending exit" flag.
     * A flag that had to be cleared by a second, weaker signal (a task list behind a binder
     * that may not exist) is exactly how the previous build deadlocked: once set, nothing
     * could clear it, so presentation stayed blocked forever.
     */
    private boolean cameraHold() { return cameraBusy || rearTaskCamera; }
    /**
     * The exit tail is part of suspension, not a separate flag: for EXIT_SETTLE_MS after the
     * camera device goes idle we still refuse to present, and that refusal is what routes
     * checkWindow into cameraGuard so the exit can actually be confirmed.
     */
    private boolean exitSettling(long now) {
        return cameraIdleAt != 0 && now - cameraIdleAt < RearCameraPolicy.EXIT_SETTLE_MS;
    }
    boolean canPresent() { return wanted() && !cameraSuspended(); }
    boolean cameraSuspended() {
        return cameraHold() || cameraYielding || exitSettling(SystemClock.elapsedRealtime());
    }
    static boolean presentationAllowed() { RearLyricsCoordinator value = instance; return value != null && value.canPresent(); }
    boolean returnedToSystem() { return LspRearBridge.selected(context) && handoff.returned()
        && !closing && !RearLyricsActivity.isEnabled(); }
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
        if (coverSleepEnabled && canPresent() && !sleepUnsupported) coverMonitor.start(); else coverMonitor.stop();
    }
    /**
     * Camera handoff. Arrival is a single funnel; departure is decided by {@link #cameraGuard}
     * and never stored as a flag that some later callback has to remember to clear.
     */
    private void cameraChanged(boolean blocked) {
        cameraBusy = blocked;
        RearLyricsTrace.record(context, "camera-handoff", "availability=" + blocked + ", " + cameraMonitor.status());
        if (!enabled) { recordOwnershipChange(); return; }
        long now = SystemClock.elapsedRealtime();
        if (blocked) {
            cameraHoldSince = now; cameraIdleAt = 0; stuckReported = false;
            enterCameraOwnership("camera-availability");
        } else {
            // The policy's own readyAt already includes EXIT_SETTLE_MS, so a callback that
            // arrives after it means the settle has *already* elapsed. Seeding cameraIdleAt
            // with "now" made every resume wait the settle twice.
            long idle = cameraMonitor.idleFor();
            cameraIdleAt = idle < 0 ? now : now - idle;
            RearLyricsTrace.record(context, "camera-exit-wait", ownershipDiagnostics());
        }
        recordOwnershipChange();
        nudge();
    }

    /** Single funnel for every path that hands the rear screen to a camera. */
    private void enterCameraOwnership(String reason) {
        long now = SystemClock.elapsedRealtime();
        RearLyricsTrace.record(context, "camera-ownership", reason + ", " + ownershipDiagnostics());
        RearLyricsActivity.yieldToCamera();
        if (RearLyricsActivity.isEnabled() || lspHolding || sleeping || powerBusy) {
            cameraYielding = true; yieldUntil = now + 8000; closeWindow();
        }
        generation++; pending = false; lockRecovery = false; nextAttempt = 0; waking = false;
        main.removeCallbacks(bindTimeout);
        syncCoverMonitor();
        // physicalCover is deliberately preserved: coverSleepMonitor re-registers on resume
        // and reports the current value again, while clearing it here would forget a phone
        // that is still face-down and let the window pop up under the camera's feet.
        recordOwnershipChange();
        // Keep observing. The previous build cancelled every pending check here and relied on
        // an availability callback to come back - which never happens when the camera service
        // keeps a stale handle, leaving the coordinator permanently parked.
        scheduleGuard(1000);
    }

    /**
     * Low-frequency, read-only guard while a camera owns (or may own) the rear display. It
     * never launches, wakes, sleeps or leases anything; its only job is to decide when the
     * camera has really finished with the panel, and it always reschedules itself.
     */
    private void cameraGuard() {
        long now = SystemClock.elapsedRealtime();
        if (cameraYielding) {
            if (now > yieldUntil) {
                // closeWindow stalled behind a dead binder; drop the yield so the next pass
                // can retry instead of blocking presentation forever.
                cameraYielding = false;
                RearLyricsTrace.record(context, "camera-yield-timeout", ownershipDiagnostics());
                nudge(); return;
            }
            scheduleGuard(1000); return;
        }
        if (!cameraHold()) {
            if (cameraIdleAt == 0) cameraIdleAt = now;
            if (now - cameraIdleAt < RearCameraPolicy.EXIT_SETTLE_MS) { scheduleGuard(500); return; }
            cameraIdleAt = 0; stuckReported = false;
            if (RearLyricsActivity.isEnabled()) RearLyricsActivity.resumeFromCamera();
            RearLyricsTrace.record(context, "camera-exit-confirmed", ownershipDiagnostics());
            recordOwnershipChange();
            nudge();
            return;
        }
        if (rearTaskCamera && RearCameraPolicy.evidenceStale(lastRearTaskAt, now)) {
            // The task list is unreadable (Shizuku unbound, protected tasks). Unproven
            // evidence must not pin the panel: fall back to device availability, which is
            // the same signal a fresh camera open would re-arm instantly.
            rearTaskCamera = false; stuckReported = false;
            if (!cameraBusy && cameraIdleAt == 0) cameraIdleAt = now;
            RearLyricsTrace.record(context, "camera-evidence-stale", "rear task unreadable for >"
                + RearCameraPolicy.EVIDENCE_STALE_MS + "ms; falling back to camera availability");
            nudge();
            return;
        }
        if (rearTaskCamera && !stuckReported && now - cameraHoldSince > RearCameraPolicy.STUCK_REPORT_MS) {
            stuckReported = true;
            // Either HyperCamera wedged on the rear display or crashed while its task
            // stayed; keep waiting and surface it - never force the screen back.
            RearLyricsTrace.record(context, "camera-stuck", "camera device idle but its task still owns the rear display; not resuming");
        }
        inspectFront(findRearDisplayId(context), now);
        scheduleGuard(1500);
    }

    private void scheduleGuard(long delay) {
        if (scheduled || !wanted()) return;
        scheduled = true; main.postDelayed(check, delay);
    }
    /** Forgetting camera evidence is always safe: a real camera re-arms it in one callback. */
    private void clearCameraHold() {
        rearTaskCamera = false; cameraYielding = false;
        cameraIdleAt = 0; cameraHoldSince = 0; yieldUntil = 0; stuckReported = false;
    }

    private RearOwnershipState.State ownership() {
        int rear = findRearDisplayId(context);
        return RearOwnershipState.resolve(cameraSuspended(), closing, sleeping,
            covered, physicalCover, rear >= 0 && RearLyricsActivity.isShowingOnDisplay(rear));
    }
    private String ownershipDiagnostics() {
        return "state=" + RearOwnershipState.describe(ownership()) + ", cameraBusy=" + cameraBusy
            + ", rearTaskCamera=" + rearTaskCamera + ", cameraYielding=" + cameraYielding
            + ", frontTask=" + frontTask;
    }
    private void recordOwnershipChange() {
        RearOwnershipState.State state = ownership();
        if (state == lastOwnership) return;
        lastOwnership = state;
        RearLyricsTrace.record(context, "ownership", RearOwnershipState.describe(state));
    }
    private void closeWindow() {
        if (closing) return;
        closing = true;
        String current = RearLyricsActivity.currentSession();
        String session = current.isEmpty() ? leaseSession : current;
        if (LspRearBridge.selected(context) && !session.isEmpty()) {
            RearLspPowerControl.apply(main, shell, findRearDisplayId(context), session, false, (success, detail) -> {
                RearLyricsTrace.record(context, "lsp-release", "success=" + success + ", " + detail);
                lspPowerDetail = detail; lspHolding = false; closeAfterLease();
            });
        } else closeAfterLease();
    }
    /** Finish only after cover power restoration, and block resume launches until this cleanup completes. */
    private void closeAfterLease() {
        if (!sleeping && !powerBusy) { finishClosing(); return; }
        int rear = findRearDisplayId(context);
        // Release our power override before invalidating the session used by the shell.
        if (shell != null && rear > 0) RearLyricsLauncher.restoreRearPowerPolicy(shell, rear, (success, detail) -> main.post(() -> {
            powerDetail = detail;
            if (success) { sleeping = false; powerBusy = false; RearLyricsActivity.setPowerSleeping(false); finishClosing(); }
            else { closing = false; retryClose(); }
        }));
        else { closing = false; retryClose(); }
    }
    private void finishClosing() {
        RearLyricsLauncher.close(context);
        closing = false; cameraYielding = false; yieldUntil = 0;
        lockRecovery = false; covered = false; nextAttempt = 0;
        if (wanted()) nudge();
    }
    private void retryClose() {
        main.postDelayed(() -> { if (cameraYielding || !wanted()) closeWindow(); else nudge(); }, 5000);
    }
    private void changeSleep(boolean value) {
        // Only a real camera hold (or its short exit tail) blocks power work. A pending
        // confirmation is not a reason to disable cover sleep - that was a silent regression.
        if (cameraSuspended()) return;
        if (!value && !closing && enabled && !playing && LspRearBridge.selected(context)
                && handoff.due(SystemClock.elapsedRealtime())) { returnAfterPause(); return; }
        if (closing || powerBusy || value == sleeping || (value && sleepUnsupported)) return;
        int rear = findRearDisplayId(context);
        if (rear <= 0 || shell == null || !shell.isBinderAlive()
                || (value && RearLyricsActivity.attachedWindowOnDisplay(rear) == null)) return;
        powerBusy = true;
        if (value) sleeping = true; // Guard before the display-off event reaches the keeper.
        RearLyricsActivity.setPowerSleeping(value);
        Runnable apply = () -> RearLyricsLauncher.setRearSleeping(context, shell, rear, value, (success, detail) -> main.post(() -> {
            powerBusy = false; powerDetail = detail;
            nextAttempt = SystemClock.elapsedRealtime() + 4000;
            if (success) { sleeping = value; if (value) preservedSleepSession = true; }
            else if (value) { sleeping = false; sleepUnsupported = true; }
            // A failed wake retains the sleep guard; never recreate the lyric task behind a power override.
            RearLyricsActivity.setPowerSleeping(sleeping);
            RearLyricsTrace.record(context, "cover-power", "requested=" + value + ", success=" + success + ", " + detail);
            syncCoverMonitor();
            if (!sleeping && !closing) { nextAttempt = SystemClock.elapsedRealtime() + 2500; nudge(); }
            else if (success && !physicalCover) changeSleep(false);
        }));
        if (LspRearBridge.selected(context)) {
            RearLspPowerControl.apply(main, shell, rear, RearLyricsActivity.currentSession(), !value && wanted(), (success, detail) -> {
                lspPowerDetail = detail; lspHolding = success && !value; nextHoldRefresh = 0;
                apply.run();
            });
        } else apply.run();
    }
    String diagnostics() { return "enabled=" + enabled + ", playing=" + playing + ", manual=" + manual
        + ", pending=" + pending + ", failures=" + failures + ", rearWakeTried=" + wakeTried
        + ", covered=" + covered + ", lockRecovery=" + lockRecovery + ", frontTask=" + frontTask
        + ", ownership=" + RearOwnershipState.describe(lastOwnership)
        + ", cameraBusy=" + cameraBusy + ", rearTaskCamera=" + rearTaskCamera
        + ", cameraIdleFor=" + (cameraIdleAt == 0 ? "-" : (SystemClock.elapsedRealtime() - cameraIdleAt) + "ms")
        + ", backend=" + (LspRearBridge.selected(context) ? "lsp" : "shizuku") + ", lsp=" + LspRearBridge.detail()
        + ", closing=" + closing + ", returnedToSystem=" + returnedToSystem()
        + ", lspHolding=" + lspHolding + ", lspPower=" + lspPowerDetail + ", cameraYielding=" + cameraYielding + ", " + cameraMonitor.status(); }

    private void schedulePauseReturn() {
        main.removeCallbacks(pauseTimeout);
        if (enabled && !playing && LspRearBridge.selected(context) && !handoff.returned())
            main.postDelayed(pauseTimeout, handoff.remaining(SystemClock.elapsedRealtime()));
    }
    private void returnAfterPause() {
        if (!enabled || playing || !LspRearBridge.selected(context) || !handoff.due(SystemClock.elapsedRealtime())) return;
        handoff.returnToSystem(); manual = false; generation++; pending = false;
        coverMonitor.stop(); physicalCover = false;
        main.removeCallbacks(check); main.removeCallbacks(bindTimeout); scheduled = false;
        complete(false, -1, "暂停超时，已让回系统背屏；恢复播放后自动切回", null);
        closeWindow();
    }
    /** Renew every 20 seconds; ordinary two-second window checks do not make another IPC call. */
    private void syncLspPower() {
        if (!LspRearBridge.selected(context) || closing || powerBusy || lspPowerBusy) return;
        String session = RearLyricsActivity.currentSession();
        if (session.isEmpty() || shell == null || !shell.isBinderAlive()) return;
        boolean desired = canPresent() && !sleeping && !(coverSleepEnabled && physicalCover);
        long now = SystemClock.elapsedRealtime();
        if (desired == lastHoldDesired && session.equals(leaseSession) && now < nextHoldRefresh) return;
        if (!desired && !lspHolding && !lastHoldDesired) return;
        lspPowerBusy = true; lastHoldDesired = desired; leaseSession = session;
        RearLspPowerControl.apply(main, shell, findRearDisplayId(context), session, desired, (success, detail) -> {
            boolean wasHolding = lspHolding;
            lspPowerBusy = false; lspHolding = success && desired; lspPowerDetail = detail;
            if (wasHolding != lspHolding || !success) RearLyricsTrace.record(context, "lsp-lease", "requested=" + desired + ", success=" + success + ", " + detail);
            nextHoldRefresh = SystemClock.elapsedRealtime() + (success ? 20_000 : 10_000);
            if (!closing && RearLyricsActivity.isCurrentSession(session)) syncLspPower();
        });
    }

    void enable(RearLyricsLauncher.Callback callback) {
        main.post(() -> {
            enabled = true; manual = true; failures = 0; nextAttempt = 0;
            // A fresh opt-in starts from a clean camera slate. Nothing is known to hold the
            // panel, and a real camera open re-arms the hold through the availability
            // callback within a second. Carrying a stale hold across enable() is what made
            // the previous build refuse to start at all.
            rearTaskCamera = false; cameraIdleAt = 0; cameraHoldSince = 0; stuckReported = false;
            handoff.start(playing, SystemClock.elapsedRealtime()); schedulePauseReturn();
            syncCoverMonitor();
            context.getSharedPreferences("rear_lyrics", 0).edit().putBoolean("auto_enabled", true).apply();
            cameraMonitor.start();
            int rear = findRearDisplayId(context);
            if (cameraSuspended()) {
                callback.success(rear, "背屏歌词已启用；相机使用期间让屏，空闲后自动恢复");
                scheduleGuard(1000);
                return;
            }
            if (!closing && active(rear)) { callback.success(rear, "背屏歌词已启用，之后播放时自动显示"); return; }
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
            cameraMonitor.stop();
            coverMonitor.stop(); physicalCover = false;
            clearCameraHold();
            main.removeCallbacks(pauseTimeout); handoff.reset();
            closeWindow();
            manual = false; preservedSleepSession = false; generation++; pending = false;
            main.removeCallbacks(bindTimeout); main.removeCallbacks(check); scheduled = false;
            complete(false, -1, "背屏歌词已关闭", null);
        });
    }
    synchronized void playback(boolean value) {
        if (requestedPlaying == value) return;
        requestedPlaying = value;
        main.post(() -> {
            if (playing == value) return;
            playing = value;
            handoff.playback(value, SystemClock.elapsedRealtime()); schedulePauseReturn();
            syncCoverMonitor();
            if (value) { failures = 0; nextAttempt = 0; }
            nudge();
        });
    }
    void stopped() {
        main.post(() -> {
            coverMonitor.stop(); physicalCover = false;
            clearCameraHold();
            main.removeCallbacks(pauseTimeout); handoff.reset();
            if (LspRearBridge.selected(context)) handoff.returnToSystem();
            closeWindow();
            playing = false; requestedPlaying = false; manual = false; generation++; pending = false;
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
        // A camera owns the panel: nothing below may run, but the guard must keep ticking.
        if (cameraSuspended()) { cameraGuard(); return; }
        if (!playing && LspRearBridge.selected(context) && handoff.due(SystemClock.elapsedRealtime())) { returnAfterPause(); return; }
        if (closing) { schedule(500); return; }
        recordOwnershipChange();
        syncCoverMonitor();
        syncLspPower();
        if (!RearCoverPolicy.mayRecoverWindow(sleeping, powerBusy, coverSleepEnabled, physicalCover)) {
            if (coverSleepEnabled && physicalCover && !sleeping && !powerBusy) changeSleep(true);
            if (sleeping && !physicalCover && !powerBusy && SystemClock.elapsedRealtime() >= nextAttempt) changeSleep(false);
            schedule(2000); return;
        }
        int rear = findRearDisplayId(context);
        boolean visible = rear >= 0 && !covered && RearLyricsActivity.isShowingOnDisplay(rear);
        long now = SystemClock.elapsedRealtime();
        inspectFront(rear, now);
        if (active(rear)) {
            wakeTried = false;
            // A leased, still-visible LSP window survived the lock; do not restart its WebView.
            if (LspRearBridge.selected(context) && lspHolding) lockRecovery = false;
        }
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
        if (!canPresent()) return;
        if (closing) { schedule(500); return; }
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
        // Camera ownership must be observable even while our own window is absent, so the
        // session guard only applies to the occlusion logic inside the callback.
        if (rear < 0 || probing || pending || RearLyricsLauncher.isStarting() || now - lastProbe < 2000
                || shell == null || !shell.isBinderAlive()) return;
        probing = true; lastProbe = now;
        String session = RearLyricsActivity.currentSession();
        RearLyricsLauncher.inspectFront(shell, rear, summary -> main.post(() -> {
            probing = false;
            // Only a real read refreshes the evidence clock. A failed read ("-1 unavailable")
            // must let the evidence go stale, otherwise an unreadable task list would keep
            // the camera hold alive forever - the exact deadlock this build fixes.
            boolean readable = !summary.contains("unavailable");
            if (readable) lastRearTaskAt = SystemClock.elapsedRealtime();
            String topPackage = RearLyricsTaskList.packageName(summary);
            int top = RearLyricsTaskList.taskId(summary);
            boolean cameraFront = RearCameraPolicy.isCameraTask(summary);
            if (!summary.equals(frontTask)) { frontTask = summary; RearLyricsTrace.record(context, "rear-front", summary); }
            if (!readable) {
                // Keep whatever the last trustworthy read said; cameraGuard's stale timer is
                // the only thing allowed to drop a hold on missing evidence.
            } else if (cameraFront) {
                boolean alreadyHeld = rearTaskCamera;
                rearTaskCamera = true;
                if (!alreadyHeld && enabled) { enterCameraOwnership("rear-task=" + topPackage); return; }
            } else {
                boolean wasHeld = rearTaskCamera;
                rearTaskCamera = false;
                if (wasHeld) {
                    stuckReported = false;
                    RearLyricsTrace.record(context, "camera-rear-task", "camera released the rear display"
                        + (topPackage == null ? "" : "; front=" + topPackage));
                }
                if (cameraYielding && context.getPackageName().equals(topPackage)) {
                    // moveTaskToBack lost the race: our window is still the rear task while a
                    // camera owns the panel. Finish it outright - a finished window is always
                    // recoverable, a crashed camera is not.
                    RearLyricsTrace.record(context, "camera-yield-hard-release", "our task still front after yield; finishing the rear activity");
                    RearLyricsActivity.finishIfShown();
                    return;
                }
            }
            if (!RearLyricsActivity.isCurrentSession(session)) return; // Our window is gone; ownership handled above.
            RearLyricsActivity.WindowState window = RearLyricsActivity.windowState();
            boolean occluded = top >= 0 && window != null && top != window.taskId;
            if (top >= 0 && covered != occluded) {
                covered = occluded;
                if (covered) nextAttempt = 0;
                nudge();
            }
        }));
    }
    private void launch() {
        if (!canPresent()) { pending = false; return; }
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
        syncLspPower();
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
                    lockRecovery = true; nextAttempt = 0; wakeTried = false; nextHoldRefresh = 0;
                    // Renew the window/power lease immediately; normal heartbeats may be delayed
                    // while Android stops the main Activity during the lock transition.
                    syncLspPower();
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
                if (id == findRearDisplayId(context)) {
                    int state = RearLyricsLauncher.displayState(context, id);
                    if (state != lastRearPower) {
                        lastRearPower = state;
                        // Key HyperOS 4 evidence: the panel went off while we held a valid
                        // bright lease and were not dimming on purpose. This distinguishes
                        // "system rear-sleep defeats our lease" from our own cover sleep.
                        if (state == Display.STATE_OFF && lspHolding && !sleeping && !powerBusy && !cameraHold())
                            RearLyricsTrace.record(context, "rear-sleep-defeated", "lease held but the panel slept; " + lspPowerDetail);
                        RearLyricsTrace.record(context, "rear-power-changed", "window=" + RearLyricsActivity.windowState()
                            + ", holding=" + lspHolding + ", " + lspPowerDetail);
                    }
                }
                if (id == findRearDisplayId(context) && sleeping && !powerBusy && !cameraHold() && !cameraYielding
                        && RearLyricsLauncher.displayState(context, id) == Display.STATE_ON) {
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
