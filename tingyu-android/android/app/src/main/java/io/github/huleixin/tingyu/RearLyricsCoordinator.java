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

/**
 * Process-scoped rear window keeper; uses the existing playback foreground service, not another app.
 *
 * <p>Camera ownership is decided in exactly one place, {@link RearHandoffState}. This class only
 * performs the two effects that machine asks for - release the rear screen, or rebuild the lyric
 * session - and never starts a window, a wake or a lease on its own while a camera owns the panel.
 */
final class RearLyricsCoordinator {
    private static volatile RearLyricsCoordinator instance;
    /** Release retries before the teardown is abandoned (with a diagnostic) instead of looping. */
    private static final int MAX_CLOSE_RETRIES = 5;
    /** Wake attempts for a rear display that vanished from DisplayManager after a camera used it. */
    private static final int MAX_MISSING_REAR_WAKES = 8;

    private enum CloseReason { USER, CAMERA }

    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final List<RearLyricsLauncher.Callback> callbacks = new ArrayList<>();
    private final RearCoverMonitor coverMonitor;
    private final RearCameraMonitor cameraMonitor;
    private final RearPlaybackHandoff playback = new RearPlaybackHandoff();
    /** Sole owner of "who has the rear screen" for the previous engine; see RearHandoffState. */
    private final RearHandoffState rear = new RearHandoffState();
    private final RearHandoffState.Observation observation = new RearHandoffState.Observation();
    /**
     * Plan A: one owner machine instead of three overlapping ones. When it is in charge,
     * {@link #rear} is not evaluated at all and {@link #gate} refuses every legacy command, so
     * the two engines can never yield, wake or restore at the same time.
     */
    private final RearOccupancy occupancy;
    private final RearOccupancy.Look planLook = new RearOccupancy.Look();
    private final RearCommandGate gate = new RearCommandGate();
    private volatile RearLyricsTaskList.Evidence evidence;
    private long lastReadableAt, planAttemptGeneration, nextPlanWakeAt;
    private boolean planRestoring, reuseBroken, dismissed;
    private int hardYieldTries;
    /**
     * Shizuku backend only. Under LSP the module keeps the rear panel awake through its own
     * shouldSleep hook, so nothing here runs. Without that hook HyperOS powers the rear panel
     * down on lock and a single failed {@code input keyevent} used to end every recovery attempt
     * for the whole session: the window was still attached, the panel was simply dark.
     */
    private final RearLockWakeBudget lockBudget = new RearLockWakeBudget();
    /**
     * Shizuku 后端专用：锁屏播放期间临时接管背屏休眠超时（subscreen_display_time），
     * 退出时原值恢复。事件驱动，没有轮询唤醒；策略层修复而非 CPU 保活。
     */
    private final RearKeepAwakePolicy keepAwake = new RearKeepAwakePolicy();
    private boolean keepAwakeBusy;
    private static final String PREF_KEEP_AWAKE_PREV = "keep_awake_prev_value";
    private static final String PREF_KEEP_AWAKE_OWED = "keep_awake_restore_owed";

    private volatile boolean coverSleepEnabled, sleeping, powerBusy, sleepUnsupported;
    private boolean physicalCover, preservedSleepSession;
    /** Latest rear-display task evidence; only trusted while [lastRearTaskAt] is fresh. */
    private volatile boolean rearTaskCamera, mainTaskCamera;
    private long lastRearTaskAt, lastProbe, nextMissingWake, episodeSince, lastEpisode, lastRestoreAt;
    private boolean stuckReported;
    private int missingRearWakes;
    private RearOwnershipState.State lastOwnership;
    private String powerDetail = "not tested";
    private volatile boolean enabled, playing, manual, pending;
    private volatile boolean requestedPlaying;
    private boolean scheduled, waking, wakeTried, probing, covered, lockRecovery;
    private String frontTask = "unknown";
    private int lastRearPower = Display.STATE_UNKNOWN;
    private IBinder shell;
    private int failures, attemptToken;
    private long nextAttempt;
    private volatile boolean closing;
    private CloseReason closeReason = CloseReason.USER;
    private int closeRetries;
    private boolean lspPowerBusy, lspHolding, lastHoldDesired;
    private long nextHoldRefresh;
    private String leaseSession = "", lspPowerDetail = "not requested";
    private final Runnable pauseTimeout = this::returnAfterPause;
    private final Runnable check = () -> { scheduled = false; checkWindow(); };
    private final Runnable bindTimeout = () -> finishFailure("连接背屏服务超时，已保留自动启动开关", null);
    private final ServiceConnection connection = new ServiceConnection() {
        @Override public void onServiceConnected(ComponentName name, IBinder service) {
            main.post(() -> { if (LspRearBridge.selected(context)) return; main.removeCallbacks(bindTimeout); shell = service; syncShizukuKeepAwake(); if (pending && wanted()) launch(); });
        }
        @Override public void onServiceDisconnected(ComponentName name) {
            main.post(() -> { if (LspRearBridge.selected(context)) return; shell = null; syncShizukuKeepAwake(); if (pending) finishFailure("Shizuku 已断开，等待恢复后自动重试", null); });
        }
    };

    static synchronized RearLyricsCoordinator get(Context context) {
        if (instance == null) instance = new RearLyricsCoordinator(context.getApplicationContext());
        return instance;
    }
    private RearLyricsCoordinator(Context context) {
        this.context = context;
        occupancy = new RearOccupancy(context.getPackageName());
        // A dismissal outlives this object on purpose: the service, the Activity and this
        // coordinator are recreated independently, and none of them may undo the user's choice.
        dismissed = RearPlanA.dismissed(context);
        occupancy.setDismissed(dismissed);
        gate.install(RearPlanA.enabled(context) ? RearCommandGate.Source.PLAN_A : RearCommandGate.Source.LEGACY);
        enabled = context.getSharedPreferences("rear_lyrics", 0).getBoolean("auto_enabled", false);
        coverSleepEnabled = context.getSharedPreferences("rear_lyrics", 0).getBoolean("cover_sleep", false);
        // A previous process may have died while holding the MAX timeout: adopt the persisted
        // restore debt so the first usable shell write repairs the system state.
        android.content.SharedPreferences prefs = context.getSharedPreferences("rear_lyrics", 0);
        if (prefs.getBoolean(PREF_KEEP_AWAKE_OWED, false)) {
            keepAwake.adoptOwedRestore(prefs.getString(PREF_KEEP_AWAKE_PREV, RearKeepAwakePolicy.DEFAULT_VALUE));
            RearLyricsTrace.record(context, "keep-awake-adopt", "restore owed from a previous process; " + keepAwake);
        }
        coverMonitor = new RearCoverMonitor(context, main, value -> {
            physicalCover = value;
            if (coverSleepEnabled && wanted()) changeSleep(value);
        });
        cameraMonitor = new RearCameraMonitor(context, main, this::cameraChanged);
        main.post(() -> { watchDisplays(); if (enabled) cameraMonitor.start(); });
    }
    boolean isEnabled() { return enabled; }
    boolean canChangeBackend() { return !wanted() && !isStarting() && !sleeping && !powerBusy && !closing; }
    void backendChanged() { main.post(() -> { shell = null; playback.reset(); nextAttempt = 0; nudge(); }); }
    void lspConnected() { main.post(() -> { if (LspRearBridge.selected(context)) { shell = LspRearBridge.get(); nextAttempt = 0; nextHoldRefresh = 0; nudge(); } }); }
    boolean isStarting() { return closing || pending || RearLyricsLauncher.isStarting(); }
    boolean wanted() { return playback.wanted(enabled, playing, manual, LspRearBridge.selected(context)); }

    /** The active engine decides; callers never ask one machine about the other one's state. */
    private boolean planA() { return RearPlanA.enabled(context); }
    /** True while an external app (a camera) legitimately owns the rear panel. */
    boolean cameraOwned() { return planA() ? occupancy.externalOwned() : rear.blocksPresentation(); }
    /** Presentation (launch / move / wake) is allowed unless a camera owns the panel. */
    boolean canPresent() { return wanted() && !dismissed && !cameraOwned(); }
    boolean cameraSuspended() { return cameraOwned(); }
    static boolean presentationAllowed() { RearLyricsCoordinator value = instance; return value != null && value.canPresent(); }
    boolean returnedToSystem() { return LspRearBridge.selected(context) && playback.returned()
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

    // ---------------------------------------------------------------- camera handoff

    /**
     * Camera arrival/departure only nudges the state machine; it never decides anything itself.
     * The old build treated this callback as the whole truth, so a camera that kept a stale
     * handle (or never reported one) left the coordinator permanently parked.
     */
    private void cameraChanged(boolean blocked) {
        if (!enabled) { evaluateRear(SystemClock.elapsedRealtime()); return; }
        RearLyricsTrace.record(context, "camera-availability", "blocked=" + blocked + ", " + cameraMonitor.status());
        evaluateRear(SystemClock.elapsedRealtime());
        nudge();
    }

    /**
     * One evaluation per heartbeat. Evidence is refreshed from the task list before the decision,
     * so "the camera left" is never inferred from a single availability edge.
     */
    private void evaluateRear(long now) {
        int display = findRearDisplayId(context);
        if (display > 0) { RearLyricsLauncher.rememberRear(context, display); missingRearWakes = 0; }
        if (planA()) { evaluatePlanA(display, now); return; }
        boolean readable = lastRearTaskAt > 0 && !RearCameraPolicy.evidenceStale(lastRearTaskAt, now);
        if (!readable && (rearTaskCamera || mainTaskCamera)) {
            // An unreadable list must not pin the panel forever; camera availability takes over.
            rearTaskCamera = false; mainTaskCamera = false;
            RearLyricsTrace.record(context, "camera-evidence-stale",
                "task list unreadable for >" + RearCameraPolicy.EVIDENCE_STALE_MS + "ms; availability decides now");
        }
        observation.set(wanted(), cameraMonitor.blocked(), rearTaskCamera, mainTaskCamera, readable,
            display >= 0 && RearLyricsActivity.isShowingOnDisplay(display),
            pending || RearLyricsLauncher.isStarting());
        if (rear.episode() != lastEpisode) {
            lastEpisode = rear.episode(); episodeSince = now; stuckReported = false;
        }
        RearHandoffState.Action action = rear.evaluate(observation, now);
        if (action == RearHandoffState.Action.RELEASE) startCameraRelease(now);
        else if (action == RearHandoffState.Action.RESTORE) startCameraRestore(now);
        if (rear.blocksPresentation() && observation.deviceBusy && !rearTaskCamera && !mainTaskCamera
                && !stuckReported && now - episodeSince > RearCameraPolicy.STUCK_REPORT_MS) {
            // The camera device has been in use for a long time while no camera task is visible on
            // either display: a wedged vendor camera, a crash that never released the device, or a
            // task we are not allowed to read. Keep the panel for the camera - but say so, because
            // "no lyrics came back" then has an exact, exportable reason.
            stuckReported = true;
            RearLyricsTrace.record(context, "camera-stuck", "device busy for " + (now - episodeSince)
                + "ms with no camera task visible (rear=" + frontTask + "); not restoring");
        }
        recordOwnershipChange();
    }

    // ---------------------------------------------------------------- plan A: one owner

    /**
     * One look, one effect. Ownership comes from the rear task list alone; the camera
     * availability callback no longer decides anything, it only shortens the wait for the next
     * look. That is what removes the three overlapping camera signals the old engine had.
     */
    private void evaluatePlanA(int display, long now) {
        RearLyricsTaskList.Evidence current = evidence;
        boolean fresh = lastRearTaskAt > 0 && !RearCameraPolicy.evidenceStale(lastRearTaskAt, now);
        boolean readable = display >= 0 && current != null && current.readable && fresh;
        if (readable) lastReadableAt = now;
        long unreadableFor = readable ? 0 : (lastReadableAt == 0 ? Long.MAX_VALUE : now - lastReadableAt);
        boolean ours = readable && context.getPackageName().equals(current.rearPackage())
            && RearLyricsActivity.isShowingOnDisplay(display);
        planLook.set(wanted(), readable, readable ? current.component : null, readable ? current.taskId : -1,
            ours, display >= 0 && RearLyricsLauncher.displayState(context, display) == Display.STATE_ON,
            now, cameraMonitor.blocked(), unreadableFor);
        RearOccupancy.Action action = occupancy.evaluate(planLook);
        if (action == RearOccupancy.Action.YIELD) planYield(now);
        else if (action == RearOccupancy.Action.RESTORE) planRestore(now);
        else if (action == RearOccupancy.Action.WAKE) planWake(display, now);
        recordOwnershipChange();
    }

    /**
     * The camera takes the panel, not the window. Hiding the viewport and moving the task behind
     * the camera is enough - a task that is not in front cannot keep the touch surface - and it
     * lets the exit reuse the same Activity and the same WebView instead of rebuilding both,
     * which is the black frame the previous engine produced on every camera open.
     *
     * <p>The power lease is not released here with a new mechanism: {@link #syncLspPower} already
     * asks for exactly that once {@link #cameraOwned()} is true, so the camera gets a panel with
     * no foreign bright policy and no second power path is introduced.
     */
    private void planYield(long now) {
        if (!gate.submit(RearCommandGate.Source.PLAN_A, RearCommandGate.YIELD, now)) return;
        RearLyricsTrace.record(context, "camera-yield", occupancy.describe(now) + "; " + planLook.describe()
            + "; window=" + RearLyricsActivity.windowState() + "; " + cameraMonitor.status());
        RearLyricsActivity.yieldToCamera();
        covered = false; lockRecovery = false; wakeTried = false; hardYieldTries = 0;
        main.removeCallbacks(check); scheduled = false;
        syncCoverMonitor();
        syncLspPower();
        syncShizukuKeepAwake();
        schedule(700);
    }

    /**
     * Rebuild the lyric session via the same launcher the rest of the app uses, at most one
     * attempt in flight. The generation is captured here and quoted back on completion, so a
     * callback that belongs to an earlier camera episode can never report a result for this one.
     */
    private void planRestore(long now) {
        if (planRestoring) return;
        if (!wanted()) return;
        if (!gate.submit(RearCommandGate.Source.PLAN_A, RearCommandGate.RESTORE, now)) return;
        planRestoring = true;
        planAttemptGeneration = occupancy.generation();
        lastRestoreAt = now;
        if (reuseBroken) {
            // The reused window could not be brought back (a lock transition, or the task was
            // moved by the ROM). Only now is a fresh task staged - the single rebuild this
            // engine allows, and the reason the reuse path is safe to prefer everywhere else.
            reuseBroken = false;
            RearLyricsTrace.record(context, "reuse-fallback", "reusing the existing window failed; staging one new task");
            RearLyricsActivity.finishIfShown();
        }
        failures = 0; nextAttempt = 0; covered = false; lockRecovery = false; wakeTried = false;
        // A window that yielded is hidden, not gone; make it drawable again before validating.
        RearLyricsActivity.resumeFromCamera();
        RearLyricsTrace.record(context, "camera-restore", "attemptGen=" + planAttemptGeneration + "; "
            + occupancy.describe(now) + "; " + planLook.describe());
        begin();
        // begin() can decline without ever calling back (no shell, no display, a launch already
        // running). Release the single-flight flag instead of leaving the machine waiting for a
        // result that will never arrive.
        if (planRestoring && !pending && !RearLyricsLauncher.isStarting()) finishPlanARestore(false);
    }

    /** Reports the outcome of a plan-A restore; a stale generation is dropped, not applied. */
    private void finishPlanARestore(boolean success) {
        planRestoring = false;
        long now = SystemClock.elapsedRealtime();
        if (!occupancy.restoreFinished(success, planAttemptGeneration, now)) {
            RearLyricsTrace.record(context, "camera-restore-stale",
                "attemptGen=" + planAttemptGeneration + " superseded; " + occupancy.describe(now));
            return;
        }
        if (!success) reuseBroken = true;
        else { reuseBroken = false; covered = false; }
    }

    /** A wake is only ever a hint that the panel may have slept; it is throttled by the machine. */
    private void planWake(int display, long now) {
        if (display < 0 || waking || now < nextPlanWakeAt) return;
        if (shell == null || !shell.isBinderAlive()) return;
        if (RearLyricsLauncher.displayState(context, display) == Display.STATE_ON) return;
        if (!gate.submit(RearCommandGate.Source.PLAN_A, RearCommandGate.WAKE, now)) return;
        nextPlanWakeAt = now + RearOccupancy.WAKE_MIN_GAP_MS;
        waking = true; wakeTried = true; nextAttempt = now + 4000;
        RearLyricsTrace.record(context, "camera-wake", occupancy.describe(now));
        RearLyricsLauncher.wake(context, shell, display, () -> main.post(() -> { waking = false; schedule(700); }));
    }

    /** The user closed the window: no component may present, wake or rebuild it again. */
    private void dismiss(String why) {
        dismissed = true;
        RearPlanA.markDismissed(context);
        occupancy.setDismissed(true);
        planRestoring = false; reuseBroken = false;
        RearLyricsTrace.record(context, "camera-dismiss", why + "; " + occupancy.describe(SystemClock.elapsedRealtime()));
    }

    /** Called when the engine preference changes; hands the command channel over atomically. */
    void engineChanged() {
        main.post(() -> {
            boolean plan = planA();
            gate.install(plan ? RearCommandGate.Source.PLAN_A : RearCommandGate.Source.LEGACY);
            occupancy.setDismissed(dismissed);
            planRestoring = false; reuseBroken = false;
            nextAttempt = 0;
            RearLyricsTrace.record(context, "engine-changed", "engine=" + RearPlanA.engine(context));
            nudge();
        });
    }
    /**
     * Legacy engine only. Hide the viewport at once, then tear the window, lease and power down
     * in the background - which is exactly the destroy-on-yield this plan replaces. Plan A
     * reaches {@link #planYield} instead and never calls this.
     */
    private void startCameraRelease(long now) {
        if (lastRestoreAt != 0 && now - lastRestoreAt < 4_000) {
            // The camera came back within seconds of a rebuild: either it was never really gone,
            // or our own window pushed it away. This is exactly the case that needs system logs.
            RearCameraLog.capture(context, shell, "camera-returned " + (now - lastRestoreAt) + "ms after a restore");
        }
        RearLyricsTrace.record(context, "camera-takeover", rear.describe(now) + "; " + observation.describe()
            + "; " + cameraMonitor.status() + "; front=" + frontTask);
        RearLyricsActivity.yieldToCamera();
        pending = false; covered = false; lockRecovery = false; wakeTried = false;
        main.removeCallbacks(check); scheduled = false;
        if (RearLyricsActivity.isEnabled() || lspHolding || sleeping || powerBusy || closing) closeWindow(CloseReason.CAMERA);
        else rear.releaseFinished(true, now);   // nothing of ours is on the panel
        syncCoverMonitor();
        schedule(700);
    }

    /** Legacy engine only. Rebuild the lyric session once the camera is confirmed gone. */
    private void startCameraRestore(long now) {
        if (!wanted()) { rear.markSystemOwned("no-intent"); return; }
        lastRestoreAt = now;
        if (episodeSince != 0 && now - episodeSince < 2_500) {
            // A camera session that ended almost immediately may have been dismissed by a task
            // switch rather than by the user; capture the camera/window log before it scrolls away.
            RearCameraLog.capture(context, shell, "camera session lasted only " + (now - episodeSince) + "ms");
        }
        RearLyricsTrace.record(context, "camera-restore", "attempt=" + rear.restoreAttempts() + "; "
            + rear.describe(now) + "; " + observation.describe());
        failures = 0; nextAttempt = 0; covered = false; lockRecovery = false; wakeTried = false;
        // A window that survived a failed release may still be hidden; make it drawable again
        // before the launcher validates it.
        RearLyricsActivity.resumeFromCamera();
        begin();
    }

    // ---------------------------------------------------------------- teardown

    private void closeWindow(CloseReason reason) {
        if (closing) return;
        closing = true; closeReason = reason; closeRetries = 0;
        // Whatever the reason, the timeout override must go back to the system now that the
        // window is going away (user close, pause expiry or camera handoff).
        syncShizukuKeepAwake();
        releaseLeaseThenClose();
    }
    private void releaseLeaseThenClose() {
        String current = RearLyricsActivity.currentSession();
        String session = current.isEmpty() ? leaseSession : current;
        int display = rearDisplayForShell();
        if (LspRearBridge.selected(context) && session.isEmpty() && lspHolding) {
            // Our own session token is gone (the process restarted while the module still held a
            // lease). It cannot be matched anymore; the module's own expiry is the only cleanup,
            // so record it rather than pretending the release succeeded.
            RearLyricsTrace.record(context, "lsp-release", "no session token to match the held lease; waiting for module expiry");
        }
        if (LspRearBridge.selected(context) && !session.isEmpty()) {
            RearLspPowerControl.apply(main, shell, display, session, false, (success, detail) -> {
                lspPowerDetail = detail; lspHolding = false;
                if (!success) RearLyricsTrace.record(context, "lsp-release", "success=false, " + detail);
                restorePowerThenClose();
            });
        } else restorePowerThenClose();
    }
    /** Finish only after cover power restoration, and block resume launches until this cleanup completes. */
    private void restorePowerThenClose() {
        if (!sleeping && !powerBusy) { finishClosing(); return; }
        int display = rearDisplayForShell();
        if (shell != null && shell.isBinderAlive() && display > 0) {
            RearLyricsLauncher.restoreRearPowerPolicy(shell, display, (success, detail) -> main.post(() -> {
                powerDetail = detail;
                if (success) { sleeping = false; powerBusy = false; RearLyricsActivity.setPowerSleeping(false); finishClosing(); }
                else retryClose("power-restore-failed");
            }));
        } else retryClose("no-shell");
    }
    /**
     * A failed release is retried, but a bounded number of times: an unbounded loop (the 1.3.43
     * behaviour) left {@code closing}/{@code sleeping} latched forever whenever the shell or the
     * LSP binder was unavailable, which is one of the ways the lyrics never came back.
     */
    private void retryClose(String why) {
        closing = false;
        closeRetries++;
        if (closeRetries >= MAX_CLOSE_RETRIES) {
            sleeping = false; powerBusy = false;
            RearLyricsActivity.setPowerSleeping(false);
            powerDetail = "release abandoned after " + closeRetries + " attempts (" + why + "); the panel may still carry our override";
            RearLyricsTrace.record(context, "release-give-up", powerDetail);
            finishClosing();
            return;
        }
        RearLyricsTrace.record(context, "release-retry", why + " #" + closeRetries);
        main.postDelayed(() -> {
            // Even after the user turned the feature off the teardown must finish: a half
            // released panel is what leaves the rear screen dark or stuck later.
            if (closing) return;
            closing = true; releaseLeaseThenClose();
        }, 1_200);
    }
    private void finishClosing() {
        long now = SystemClock.elapsedRealtime();
        CloseReason reason = closeReason;
        RearLyricsLauncher.close(context, reason == CloseReason.CAMERA);
        closing = false; closeReason = CloseReason.USER; closeRetries = 0;
        lockRecovery = false; covered = false; nextAttempt = 0;
        if (reason == CloseReason.CAMERA) { if (!planA()) rear.releaseFinished(true, now); }
        else rear.markSystemOwned("window-closed");
        if (planA()) planRestoring = false;
        if (wanted()) nudge();
    }

    private void changeSleep(boolean value) {
        // Only a real camera hold (or its exit tail) blocks power work.
        if (cameraOwned()) return;
        if (!value && !closing && enabled && !playing && LspRearBridge.selected(context)
                && playback.due(SystemClock.elapsedRealtime())) { returnAfterPause(); return; }
        if (closing || powerBusy || value == sleeping || (value && sleepUnsupported)) return;
        int display = rearDisplayForShell();
        if (display <= 0 || shell == null || !shell.isBinderAlive()
                || (value && RearLyricsActivity.attachedWindowOnDisplay(display) == null)) return;
        powerBusy = true;
        if (value) sleeping = true; // Guard before the display-off event reaches the keeper.
        RearLyricsActivity.setPowerSleeping(value);
        Runnable apply = () -> RearLyricsLauncher.setRearSleeping(context, shell, display, value, (success, detail) -> main.post(() -> {
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
            RearLspPowerControl.apply(main, shell, display, RearLyricsActivity.currentSession(), !value && wanted(), (success, detail) -> {
                lspPowerDetail = detail; lspHolding = success && !value; nextHoldRefresh = 0;
                apply.run();
            });
        } else apply.run();
    }

    String diagnostics() {
        long now = SystemClock.elapsedRealtime();
        return "enabled=" + enabled + ", playing=" + playing + ", manual=" + manual
            + ", pending=" + pending + ", failures=" + failures + ", rearWakeTried=" + wakeTried
            + ", covered=" + covered + ", lockRecovery=" + lockRecovery + ", frontTask=" + frontTask
            + ", ownership=" + RearOwnershipState.describe(lastOwnership)
            + ", engine=" + RearPlanA.engine(context) + ", " + gate.describe(now)
            + ", occupied=" + occupancy.describe(now)
            + ", planRestoring=" + planRestoring + ", reuseBroken=" + reuseBroken
            + ", hardYieldTries=" + hardYieldTries + ", dismissed=" + dismissed
            + ", look={" + planLook.describe() + "}"
            + ", " + rear.describe(now)
            + ", live=" + observation.describe()
            + ", cameraIdleFor=" + cameraMonitor.idleFor() + "ms"
            + ", missingRearWakes=" + missingRearWakes
            + ", backend=" + (LspRearBridge.selected(context) ? "lsp" : "shizuku") + ", lsp=" + LspRearBridge.detail()
            + ", keepAwake=" + keepAwake
            + ", closing=" + closing + ", closeRetries=" + closeRetries + ", returnedToSystem=" + returnedToSystem()
            + ", lspHolding=" + lspHolding + ", lspPower=" + lspPowerDetail + ", " + cameraMonitor.status()
            + "\nSystem log snapshot: " + RearCameraLog.last();
    }

    private void schedulePauseReturn() {
        main.removeCallbacks(pauseTimeout);
        if (enabled && !playing && LspRearBridge.selected(context) && !playback.returned())
            main.postDelayed(pauseTimeout, playback.remaining(SystemClock.elapsedRealtime()));
    }
    private void returnAfterPause() {
        if (!enabled || playing || !LspRearBridge.selected(context) || !playback.due(SystemClock.elapsedRealtime())) return;
        playback.returnToSystem(); manual = false; attemptToken++;
        coverMonitor.stop(); physicalCover = false;
        main.removeCallbacks(check); main.removeCallbacks(bindTimeout); scheduled = false;
        rear.markSystemOwned("pause-return");
        complete(false, -1, "暂停超时，已让回系统背屏；恢复播放后自动切回", null);
        closeWindow(CloseReason.USER);
    }
    /**
     * Shizuku 后端：锁屏播放期间把背屏休眠超时临时写成 MAX，停止播放/关闭/相机/断连时
     * 恢复原值。从所有状态变化点调用（锁屏广播、播放回调、开关、相机让屏、关窗），
     * 策略对象保证每个转换只执行一次写操作 —— 没有定时器，没有轮询唤醒。
     */
    private void syncShizukuKeepAwake() {
        if (LspRearBridge.selected(context) || keepAwakeBusy) return;
        boolean shellUsable = shell != null && shell.isBinderAlive();
        RearKeepAwakePolicy.Action action = keepAwake.sync(
            !LspRearBridge.selected(context), shellUsable, wanted(), playing,
            cameraOwned(), closing, sleeping);
        if (action == RearKeepAwakePolicy.Action.NONE) return;
        keepAwakeBusy = true;
        android.content.SharedPreferences prefs = context.getSharedPreferences("rear_lyrics", 0);
        switch (action) {
            case READ_THEN_APPLY:
                RearLyricsLauncher.readSubscreenTimeout(shell, (ok, raw) -> main.post(() -> {
                    keepAwakeBusy = false;
                    if (!ok) {
                        // Cannot read the original: refuse to overwrite it. A single wake via
                        // the existing budget stays the fallback for this lock.
                        RearLyricsTrace.record(context, "keep-awake-read-failed", "raw=" + raw + "; not overwriting");
                        return;
                    }
                    keepAwake.onPreviousRead(raw);
                    prefs.edit().putString(PREF_KEEP_AWAKE_PREV, keepAwake.restoreValue()).apply();
                    RearLyricsTrace.record(context, "keep-awake-captured", "original=" + keepAwake.restoreValue());
                    keepAwakeBusy = true;
                    applyMaxTimeout(prefs);
                }));
                return;
            case WRITE_MAX:
                applyMaxTimeout(prefs);
                return;
            case WRITE_RESTORE: {
                String value = keepAwake.restoreValue();
                RearLyricsLauncher.writeSubscreenTimeout(shell, parseTimeout(value), (ok, detail) -> main.post(() -> {
                    keepAwakeBusy = false;
                    if (ok) {
                        keepAwake.onRestored();
                        prefs.edit().putBoolean(PREF_KEEP_AWAKE_OWED, false).remove(PREF_KEEP_AWAKE_PREV).apply();
                        RearLyricsTrace.record(context, "keep-awake-restored", "value=" + value);
                    } else {
                        prefs.edit().putBoolean(PREF_KEEP_AWAKE_OWED, true).apply();
                        RearLyricsTrace.record(context, "keep-awake-restore-retry", "value=" + value + ", " + detail);
                    }
                    nudge();
                }));
                return;
            }
            case MARK_RESTORE_OWED:
                keepAwakeBusy = false;
                prefs.edit().putBoolean(PREF_KEEP_AWAKE_OWED, true)
                    .putString(PREF_KEEP_AWAKE_PREV, keepAwake.restoreValue()).apply();
                RearLyricsTrace.record(context, "keep-awake-debt", "shell lost while holding; restore owed; " + keepAwake);
                return;
            default:
                keepAwakeBusy = false;
        }
    }

    private void applyMaxTimeout(android.content.SharedPreferences prefs) {
        RearLyricsLauncher.writeSubscreenTimeout(shell, parseTimeout(RearKeepAwakePolicy.MAX_VALUE), (ok, detail) -> main.post(() -> {
            keepAwakeBusy = false;
            if (ok) {
                keepAwake.onMaxApplied();
                prefs.edit().putBoolean(PREF_KEEP_AWAKE_OWED, true).apply();
                RearLyricsTrace.record(context, "keep-awake-held",
                    "rear sleep timeout set to MAX while lyrics play; " + keepAwake);
            } else {
                RearLyricsTrace.record(context, "keep-awake-apply-failed", detail);
            }
            nudge();
        }));
    }

    private static int parseTimeout(String value) {
        try { return (int) Long.parseLong(value.trim()); }
        catch (NumberFormatException error) { return (int) Long.parseLong(RearKeepAwakePolicy.DEFAULT_VALUE); }
    }

    /** Renew every 20 seconds; ordinary two-second window checks do not make another IPC call. */
    private void syncLspPower() {

        if (!LspRearBridge.selected(context) || closing || powerBusy || lspPowerBusy) return;
        String session = RearLyricsActivity.currentSession();
        if (session.isEmpty() || shell == null || !shell.isBinderAlive()) return;
        boolean desired = !cameraOwned() && wanted() && !sleeping
            && !(coverSleepEnabled && physicalCover);
        long now = SystemClock.elapsedRealtime();
        if (desired == lastHoldDesired && session.equals(leaseSession) && now < nextHoldRefresh) return;
        if (!desired && !lspHolding && !lastHoldDesired) return;
        lspPowerBusy = true; lastHoldDesired = desired; leaseSession = session;
        RearLspPowerControl.apply(main, shell, rearDisplayForShell(), session, desired, (success, detail) -> {
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
            // Asking for the window again is the only thing that clears a dismissal.
            dismissed = false;
            RearPlanA.clearDismissed(context);
            occupancy.setDismissed(false);
            reuseBroken = false;
            playback.start(playing, SystemClock.elapsedRealtime()); schedulePauseReturn();
            syncCoverMonitor();
            context.getSharedPreferences("rear_lyrics", 0).edit().putBoolean("auto_enabled", true).apply();
            cameraMonitor.start();
            int display = rearDisplayForShell();
            evaluateRear(SystemClock.elapsedRealtime());
            if (cameraOwned()) {
                // The camera is already up: never take the panel from it, just record the intent.
                callback.success(display, "背屏歌词已启用；相机使用期间让屏，空闲后自动恢复");
                schedule(1000);
                return;
            }
            if (!closing && active(display)) { callback.success(display, "背屏歌词已启用，之后播放时自动显示"); return; }
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
            // The user closed the window. Persist it: a restarted service or a camera episode
            // that outlives this process must not be able to bring it back.
            dismiss("user-disabled");
            cameraMonitor.stop();
            coverMonitor.stop(); physicalCover = false;
            main.removeCallbacks(pauseTimeout); playback.reset();
            rear.markSystemOwned("disabled");
            attemptToken++; pending = false; missingRearWakes = 0;
            main.removeCallbacks(bindTimeout); main.removeCallbacks(check); scheduled = false;
            complete(false, -1, "背屏歌词已关闭", null);
            closeWindow(CloseReason.USER);
        });
    }
    synchronized void playback(boolean value) {
        if (requestedPlaying == value) return;
        requestedPlaying = value;
        main.post(() -> {
            if (playing == value) return;
            playing = value;
            playback.playback(value, SystemClock.elapsedRealtime()); schedulePauseReturn();
            syncCoverMonitor();
            if (value) { failures = 0; nextAttempt = 0; }
            syncShizukuKeepAwake(); // pause stops holding immediately; resume re-applies
            nudge();
        });
    }
    void stopped() {
        main.post(() -> {
            coverMonitor.stop(); physicalCover = false;
            main.removeCallbacks(pauseTimeout); playback.reset();
            if (LspRearBridge.selected(context)) playback.returnToSystem();
            playing = false; requestedPlaying = false; manual = false;
            syncShizukuKeepAwake();
            rear.markSystemOwned("stopped");
            attemptToken++; pending = false;
            main.removeCallbacks(bindTimeout); main.removeCallbacks(check); scheduled = false;
            complete(false, -1, "播放服务已停止，背屏开关仍保留", null);
            closeWindow(CloseReason.USER);
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
        long now = SystemClock.elapsedRealtime();
        evaluateRear(now);
        if (cameraOwned()) {
            // A camera owns the panel. Only a read-only probe is allowed here; it keeps the exit
            // evidence fresh so the machine can confirm the departure instead of guessing.
            if (!closing && !pending && !RearLyricsLauncher.isStarting()) inspectFront(findRearDisplayId(context), now);
            // Fast while the handoff is settling, slower while a camera is confirmed to be using
            // the panel: the task list is the only evidence of the exit, but it must not turn into
            // a two-second shell poll for the whole camera session.
            schedule(planA() ? RearWindowPolicy.cameraBeatMs(planRestoring, planLook.deviceBusy)
                : rear.state() == RearHandoffState.State.RELEASING ? 600 : observation.deviceBusy ? 3_000 : 1_000);
            return;
        }
        if (pending || RearLyricsLauncher.isStarting()) { schedule(1_200); return; }
        if (!playing && LspRearBridge.selected(context) && playback.due(now)) { returnAfterPause(); return; }
        if (closing) { schedule(500); return; }
        recordOwnershipChange();
        syncCoverMonitor();
        syncLspPower();
        syncShizukuKeepAwake();
        if (!RearCoverPolicy.mayRecoverWindow(sleeping, powerBusy, coverSleepEnabled, physicalCover)) {
            if (coverSleepEnabled && physicalCover && !sleeping && !powerBusy) changeSleep(true);
            if (sleeping && !physicalCover && !powerBusy && now >= nextAttempt) changeSleep(false);
            schedule(2000); return;
        }
        int display = findRearDisplayId(context);
        boolean visible = display >= 0 && !covered && RearLyricsActivity.isShowingOnDisplay(display);
        inspectFront(display, now);
        if (active(display)) {
            wakeTried = false;
            // A leased, still-visible LSP window survived the lock; do not restart its WebView.
            if (LspRearBridge.selected(context) && lspHolding) lockRecovery = false;
        }
        if (display < 0) {
            wakeMissingRear(now);
            schedule(2000); return;
        }
        if (!pending && !waking && (!wakeTried || lockBudget.take())
                && now >= nextAttempt && shell != null && shell.isBinderAlive()
                && RearLyricsActivity.isEnabled() && RearLyricsLauncher.displayState(context, display) != Display.STATE_ON) {
            waking = true; wakeTried = true; nextAttempt = now + 4000;
            if (lockBudget.candidate()) probeLock("wake" + lockBudget.wakes());
            RearLyricsLauncher.wake(context, shell, display, () -> main.post(() -> { waking = false; schedule(700); }));
        } else if (RearLyricsPolicy.shouldAttempt(enabled, playing, manual, RearLyricsState.hasConfig(),
                visible && RearLyricsLauncher.displayState(context, display) == Display.STATE_ON,
                pending || waking || RearLyricsLauncher.isStarting(), now, nextAttempt, lockRecovery)) begin();
        schedule(2000);
    }
    /**
     * The camera can power the rear panel off, after which the logical display disappears and no
     * scan can find it - and nothing would ever wake it again. The remembered id is woken
     * directly, a bounded number of times per episode, then the display listener takes over.
     */
    private void wakeMissingRear(long now) {
        int known = RearLyricsLauncher.rememberedRear(context);
        if (known <= 0 || waking || now < nextMissingWake) return;
        if (shell == null || !shell.isBinderAlive()) return;
        if (missingRearWakes >= MAX_MISSING_REAR_WAKES) return;
        missingRearWakes++;
        waking = true; nextMissingWake = now + 5_000;
        if (missingRearWakes == MAX_MISSING_REAR_WAKES)
            RearLyricsTrace.record(context, "rear-missing", "display " + known + " is gone; last wake attempt, waiting for it to reappear");
        RearLyricsLauncher.wakeMissing(context, shell, known, () -> main.post(() -> { waking = false; nudge(); }));
    }
    private void begin() {
        if (!canPresent()) return;
        if (closing) { schedule(500); return; }
        try {
            if (LspRearBridge.selected(context)) {
                LspRearBridge.request(context);
                shell = LspRearBridge.get();
                if (shell == null) { finishFailure(LspRearBridge.detail(), null); return; }
                if (rearDisplayForShell() < 0) { finishFailure("未检测到适配的背屏", null); return; }
                pending = true; launch(); return;
            }
            if (!Shizuku.pingBinder() || Shizuku.checkSelfPermission() != PackageManager.PERMISSION_GRANTED) {
                finishFailure("等待 Shizuku 运行并授权听屿；自动启动开关已保留", null); return;
            }
            if (rearDisplayForShell() < 0) { finishFailure("未检测到小米背屏，等待背屏可用后重试", null); return; }
            pending = true;
            if (shell != null && shell.isBinderAlive()) { launch(); return; }
            main.removeCallbacks(bindTimeout); main.postDelayed(bindTimeout, 12_000);
            Shizuku.bindUserService(new Shizuku.UserServiceArgs(new ComponentName(context, ShellUserService.class))
                .tag("folia-rear-lyrics").version(ShellUserService.VERSION).processNameSuffix("rear_lyrics").daemon(false), connection);
        } catch (Exception error) { finishFailure("无法连接 Shizuku：" + error.getMessage(), error); }
    }
    private void inspectFront(int display, long now) {
        // Camera ownership must be observable even while our own window is absent, so the
        // session guard only applies to the occlusion logic inside the callback.
        if (display < 0 || probing || pending || RearLyricsLauncher.isStarting() || now - lastProbe < 2000
                || shell == null || !shell.isBinderAlive()) return;
        probing = true; lastProbe = now;
        String session = RearLyricsActivity.currentSession();
        RearLyricsLauncher.inspectFront(shell, display, summary -> main.post(() -> {
            probing = false;
            RearLyricsTaskList.Evidence evidence = RearLyricsTaskList.parse(summary, display);
            // Plan A decides on this evidence; keep the whole look, not just the camera flags.
            this.evidence = evidence;
            // Only a real listing refreshes the evidence clock. An unreadable dump must let the
            // evidence go stale, otherwise it would keep the camera hold alive forever.
            if (evidence.readable) lastRearTaskAt = SystemClock.elapsedRealtime();
            String described = evidence.describe();
            if (!described.equals(frontTask)) { frontTask = described; RearLyricsTrace.record(context, "rear-front", described); }
            if (!evidence.readable) {
                if (planA()) evaluateRear(SystemClock.elapsedRealtime());
                schedule(1_500);
                return;
            }
            boolean rearCamera = evidence.rearCameraTask(), mainCamera = evidence.mainCameraTask();
            boolean changed = rearCamera != rearTaskCamera || mainCamera != mainTaskCamera;
            rearTaskCamera = rearCamera; mainTaskCamera = mainCamera;
            // The decision runs on fresh evidence, not only on the heartbeat.
            if (planA()) evaluateRear(SystemClock.elapsedRealtime());
            if (changed) {
                RearLyricsTrace.record(context, "rear-front-ownership", "rearCameraTask=" + rearCamera + ", mainCameraTask=" + mainCamera);
                nudge();
                return;
            }
            if (!rearCamera && cameraOwned() && context.getPackageName().equals(evidence.rearPackage())) {
                if (RearWindowPolicy.mayFinishForCamera(planA())) {
                    // Legacy: moveTaskToBack lost the race. Finish it outright.
                    RearLyricsTrace.record(context, "camera-yield-hard-release", "our task is still front on the rear display; finishing it");
                    RearLyricsActivity.finishIfShown();
                } else if (hardYieldTries++ < 3) {
                    // Plan A: moveTaskToBack lost the race. Ask again before destroying anything;
                    // a rebuild costs a renderer and a black frame, and the camera only needs the
                    // task to stop being in front.
                    RearLyricsTrace.record(context, "camera-yield-retry",
                        "our task is still front on the rear display; retry " + hardYieldTries);
                    RearLyricsActivity.yieldToCamera();
                } else {
                    // Three moves were refused. A window in front of a running camera is worse
                    // than a rebuilt one, so this is the only place plan A gives up the Activity.
                    RearLyricsTrace.record(context, "camera-yield-fallback",
                        "moveTaskToBack refused 3x; finishing the window so the camera can draw");
                    RearLyricsActivity.finishIfShown();
                }
                return;
            }
            if (!RearLyricsActivity.isCurrentSession(session)) return; // Our window is gone; ownership handled above.
            RearLyricsActivity.WindowState window = RearLyricsActivity.windowState();
            boolean occluded = evidence.taskId >= 0 && window != null && evidence.taskId != window.taskId;
            if (evidence.taskId >= 0 && covered != occluded) {
                covered = occluded;
                if (covered) nextAttempt = 0;
                nudge();
            }
        }));
    }
    private void launch() {
        if (!canPresent()) { pending = false; return; }
        if (RearLyricsLauncher.isStarting()) return;
        final int token = ++attemptToken;
        RearLyricsLauncher.start(context, new RearLyricsLauncher.Callback() {
            @Override public void success(int display, String message) {
                main.post(() -> {
                    if (token != attemptToken) return;
                    pending = false;
                    long now = SystemClock.elapsedRealtime();
                    if (!canPresent()) {
                        // The camera took the panel while we were confirming the window.
                        if (planA()) { if (planRestoring) finishPlanARestore(false); }
                        else rear.restoreFinished(true, now);
                        RearLyricsTrace.record(context, "camera-restore-superseded",
                            (planA() ? occupancy.describe(now) : rear.describe(now)));
                        schedule(700);
                        return;
                    }
                    covered = false; lockRecovery = false; failures = 0; nextAttempt = now + 2000;
                    if (planA()) { if (planRestoring) finishPlanARestore(true); }
                    else { rear.restoreFinished(true, now); rear.markActive(); }
                    if (coverSleepEnabled && physicalCover) changeSleep(true);
                    complete(true, display, message, null); schedule(2000);
                });
            }
            @Override public void failure(String message, Exception error) {
                main.post(() -> { if (token == attemptToken) finishFailure(message, error); });
            }
            @Override public void cancelled(String reason) {
                main.post(() -> { if (token == attemptToken) finishCancelled(reason); });
            }
        }, shell, rearDisplayForShell());
        syncLspPower();
    }
    private void finishFailure(String message, Exception error) {
        pending = false; main.removeCallbacks(bindTimeout);
        long now = SystemClock.elapsedRealtime();
        boolean restoring = planA() ? planRestoring : rear.restoring();
        if (restoring) {
            // A rebuild failure is retried on the handoff backoff, not the launch backoff that
            // grows to a minute: the user is holding the phone and just closed the camera.
            int attempts;
            if (planA()) { finishPlanARestore(false); attempts = 1; nextAttempt = now + 2_000; }
            else { rear.restoreFinished(false, now); attempts = rear.restoreAttempts();
                nextAttempt = now + Math.min(6_000, RearHandoffState.backoff(attempts)); }
            context.getSharedPreferences("rear_lyrics", 0).edit()
                .putString("launch_message", "相机退出后恢复背屏歌词失败：" + message + "，稍后自动重试").apply();
            RearLyricsTrace.record(context, "camera-restore-failed", message);
            if (attempts >= 3) RearCameraLog.capture(context, shell, "restore failed " + attempts + "x: " + message);
        } else {
            nextAttempt = now + RearLyricsPolicy.retryDelay(failures++);
            context.getSharedPreferences("rear_lyrics", 0).edit().putString("launch_message", message).apply();
        }
        complete(false, -1, message, error); schedule(1_500);
    }
    /**
     * A cancelled attempt is not a failure: the camera (or the user) took the panel back while the
     * launcher was still confirming. No error message, no backoff - the state machine already knows
     * what happens next.
     */
    private void finishCancelled(String reason) {
        pending = false;
        // The attempt ended without a verdict. Release the single-flight flag, and let the
        // generation check decide whether the outcome still belongs to the current episode.
        if (planA() && planRestoring) finishPlanARestore(false);
        RearLyricsTrace.record(context, "camera-restore-cancelled", reason);
        schedule(600);
    }
    private void complete(boolean success, int display, String message, Exception error) {
        List<RearLyricsLauncher.Callback> completed = new ArrayList<>(callbacks); callbacks.clear();
        for (RearLyricsLauncher.Callback callback : completed) {
            if (success) callback.success(display, message); else callback.failure(message, error);
        }
    }
    private boolean active(int display) {
        return display >= 0 && !covered && RearLyricsActivity.isShowingOnDisplay(display)
            && RearLyricsLauncher.displayState(context, display) == Display.STATE_ON;
    }
    /**
     * One line that tells the four ways a rear window can "disappear" apart: the panel was
     * physically switched off, the window was moved off the rear display, the window is there
     * but stopped rendering, or something else (the OEM rear centre / a keyguard layer) is on top.
     * They must never be answered with the same wake() patch.
     */
    private void probeLock(String tag) {
        int display = findRearDisplayId(context);
        int state = display >= 0 ? RearLyricsLauncher.displayState(context, display) : -1;
        RearLyricsActivity.WindowState window = RearLyricsActivity.windowState();
        String verdict;
        if (display < 0) verdict = "rear-display-absent";
        else if (state != Display.STATE_ON) verdict = "panel-off";
        else if (window == null || window.displayId != display) verdict = "window-not-on-rear";
        else if (!window.visible || !window.drawn) verdict = "window-not-rendering";
        else verdict = "window-visible";
        long now = SystemClock.elapsedRealtime();
        RearLyricsTrace.record(context, "lock-probe", tag + ": " + verdict
            + ", display=" + display + ", state=" + state + ", window=" + window
            + ", front=" + frontTask
            + ", backend=" + (LspRearBridge.selected(context) ? "lsp" : "shizuku")
            + ", engine=" + RearPlanA.engine(context)
            + ", sleeping=" + sleeping + ", covered=" + covered + ", coverSleep=" + coverSleepEnabled
            + ", physicalCover=" + physicalCover + ", lock=" + lockBudget
            + ", holding=" + lspHolding + ", lease=" + lspPowerDetail
            + ", " + (planA() ? occupancy.describe(now) : rear.describe(now)));
    }
    private void watchDisplays() {
        IntentFilter filter = new IntentFilter(Intent.ACTION_SCREEN_OFF);
        filter.addAction(Intent.ACTION_SCREEN_ON); filter.addAction(Intent.ACTION_USER_PRESENT);
        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                if (Intent.ACTION_SCREEN_OFF.equals(intent.getAction()) && wanted() && !sleeping && !powerBusy) {
                    lockRecovery = true; nextAttempt = 0; wakeTried = false; nextHoldRefresh = 0;
                    if (LspRearBridge.selected(context)) {
                        // LSP keeps the panel awake through the module's own shouldSleep hook.
                        lockBudget.lockStarted(true);
                        probeLock("lsp");
                    } else {
                        // Shizuku has no such hook: HyperOS may power the rear panel down on lock.
                        // Allow a bounded number of wake attempts for THIS lock instead of the
                        // single one a failure used to consume for the rest of the session.
                        lockBudget.lockStarted(false);
                        probeLock("shizuku");
                    }
                    // Renew the window/power lease immediately; normal heartbeats may be delayed
                    // while Android stops the main Activity during the lock transition.
                    syncLspPower();
                    syncShizukuKeepAwake();
                } else if (!Intent.ACTION_SCREEN_OFF.equals(intent.getAction())) {
                    lockBudget.unlocked();
                }
                lastProbe = 0; RearLyricsTrace.record(context, "power-event", intent.getAction()); nudge();
            }
        };
        if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else context.registerReceiver(receiver, filter);
        DisplayManager manager = (DisplayManager) context.getSystemService(Context.DISPLAY_SERVICE);
        if (manager != null) manager.registerDisplayListener(new DisplayManager.DisplayListener() {
            @Override public void onDisplayAdded(int id) {
                missingRearWakes = 0; nextMissingWake = 0; nextAttempt = 0; lastProbe = 0;
                RearLyricsTrace.record(context, "rear-display-added", "display=" + id);
                nudge();
            }
            @Override public void onDisplayRemoved(int id) {
                if (id == findRearDisplayId(context)) missingRearWakes = 0;
                nudge();
            }
            @Override public void onDisplayChanged(int id) {
                if (id == findRearDisplayId(context)) {
                    int state = RearLyricsLauncher.displayState(context, id);
                    if (state != lastRearPower) {
                        lastRearPower = state;
                        // Key HyperOS 4 evidence: the panel went off while we held a valid
                        // bright lease and were not dimming on purpose. This distinguishes
                        // "system rear-sleep defeats our lease" from our own cover sleep.
                        if (state == Display.STATE_OFF && lspHolding && !sleeping && !powerBusy && !cameraOwned())
                            RearLyricsTrace.record(context, "rear-sleep-defeated", "lease held but the panel slept; " + lspPowerDetail);
                        RearLyricsTrace.record(context, "rear-power-changed", "window=" + RearLyricsActivity.windowState()
                            + ", holding=" + lspHolding + ", " + lspPowerDetail);
                    }
                }
                if (id == findRearDisplayId(context) && sleeping && !powerBusy && !cameraOwned()
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
    /** Live rear display, or the last one we ever saw while a camera holds the panel. */
    static int rearDisplayForShell(Context context) {
        int live = findRearDisplayId(context);
        if (live > 0) { RearLyricsLauncher.rememberRear(context, live); return live; }
        return RearLyricsLauncher.rememberedRear(context);
    }
    int rearDisplayForShell() { return rearDisplayForShell(context); }

    private RearOwnershipState.State ownership() {
        int display = findRearDisplayId(context);
        return RearOwnershipState.resolve(cameraOwned(),
            closing || (planA() ? planRestoring : rear.state() == RearHandoffState.State.RELEASING),
            sleeping, covered, physicalCover,
            display >= 0 && RearLyricsActivity.isShowingOnDisplay(display));
    }
    private void recordOwnershipChange() {
        RearOwnershipState.State state = ownership();
        if (state == lastOwnership) return;
        lastOwnership = state;
        RearLyricsTrace.record(context, "ownership", RearOwnershipState.describe(state) + "; " + rear.describe(SystemClock.elapsedRealtime()));
    }
}
