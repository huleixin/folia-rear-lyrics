package io.github.huleixin.tingyu;

import android.content.Context;
import android.app.KeyguardManager;
import android.hardware.display.DisplayManager;
import android.os.IBinder;
import android.os.Parcel;
import android.os.SystemClock;
import android.view.Display;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Verifies the actual rear window, with a launch-on-main-and-move fallback for HyperOS. */
final class RearLyricsLauncher {
    private static final ExecutorService WORKER = Executors.newSingleThreadExecutor();
    private static volatile boolean starting;
    private static final String PREFS = "rear_lyrics";
    private static final String REVISION = "r" + ShellUserService.VERSION;
    private static final String KEY_REAR_DISPLAY = "last_rear_display";
    /** A syntactically valid token for display-scoped commands that have no lyric session. */
    private static final String NO_SESSION = "missing-rear";
    private static volatile int rememberedRear = Integer.MIN_VALUE;
    interface Callback {
        void success(int displayId, String message);
        void failure(String message, Exception error);
        /**
         * The attempt stopped because the camera (or the user) took the rear display back.
         * This is a normal handoff step, not an error: no user-visible failure, no backoff.
         */
        default void cancelled(String reason) { failure(reason, null); }
    }

    static boolean isStarting() { return starting; }
    static String message(Context context) { return context.getSharedPreferences(PREFS, 0).getString("launch_message", ""); }
    static String diagnostics(Context context) { return context.getSharedPreferences(PREFS, 0).getString("launch_diagnostics", ""); }

    /**
     * The rear display can disappear from DisplayManager while the camera owns it (the panel is
     * powered off, or the OEM rear host removes the logical display). Recovery then has to wake
     * a display that no scan can find, so the last id we ever saw is remembered.
     */
    static void rememberRear(Context context, int id) {
        if (id <= 0) return;
        if (rememberedRear == id) return;
        rememberedRear = id;
        context.getSharedPreferences(PREFS, 0).edit().putInt(KEY_REAR_DISPLAY, id).apply();
    }
    static int rememberedRear(Context context) {
        int cached = rememberedRear;
        if (cached != Integer.MIN_VALUE) return cached;
        cached = context.getSharedPreferences(PREFS, 0).getInt(KEY_REAR_DISPLAY, -1);
        rememberedRear = cached;
        return cached;
    }

    static synchronized void start(Context context, Callback callback, IBinder shell, int rearDisplayId) {
        if (starting) { callback.failure("背屏歌词正在启动，请稍候", null); return; }
        starting = true;
        boolean locked = isLocked(context);
        // Plan A: an existing task is always preferred, locked or not. HyperOS rejects new
        // third-party rear launches behind the keyguard, but a task we still own can be brought
        // back - and reusing it is the difference between a resumed window and a rebuilt WebView.
        boolean reuse = RearWindowPolicy.mayReuseWindow(
            RearLyricsActivity.attachedWindowOnDisplay(rearDisplayId) != null,
            locked, LspRearBridge.selected(context),
            RearLyricsCoordinator.get(context).preserveSleepSession(), RearPlanA.enabled(context));
        // A reused instance that yielded to a camera must be allowed to draw again before the
        // launch is validated, otherwise awaitWindow() can never see it visible.
        if (reuse) RearLyricsActivity.resumeFromCamera();
        // HyperOS rejects third-party direct rear launches while locked, including an existing task.
        // Recreate only the native host and stage it transparently; Chromium starts after migration.
        if (locked && !reuse) RearLyricsActivity.finishIfShown();
        String session = reuse ? RearLyricsActivity.currentSession() : RearLyricsActivity.prepareLaunch(rearDisplayId);
        RearLyricsTrace.record(context, "launch-route", locked ? "main-to-rear" : reuse ? "reuse-unlocked" : "direct");
        save(context, "正在直接启动背屏歌词…", REVISION + " · target display=" + rearDisplayId);
        WORKER.execute(() -> launch(context, callback, shell, rearDisplayId, session, reuse));
    }

    /** No UI thread waits on Binder or am; only a drawn, visible window on the target screen succeeds. */
    private static void launch(Context context, Callback callback, IBinder shell, int rear, String session, boolean reuse) {
        StringBuilder trace = new StringBuilder("Folia rear " + REVISION + "\nTarget display=" + rear + "\n");
        try {
            trace.append("Backend: ").append(LspRearBridge.selected(context) ? LspRearBridge.detail() : "Shizuku").append('\n');
            boolean locked = isLocked(context);
            if (LspRearBridge.selected(context)) {
                command(shell, io.github.huleixin.tingyu.lsp.RearBridgeContract.HOLD_POWER, rear, session, -1, "Hold rear before launch", trace);
            }
            boolean shown = false;
            if (!locked || reuse || LspRearBridge.selected(context)) {
                // A camera can leave the panel powered off with our power override undone. Reset
                // the policy first: forcing it on with a bare wake sometimes does nothing while
                // the display still carries the camera's own off-request.
                if (displayState(context, rear) != Display.STATE_ON)
                    command(shell, ShellUserService.TRANSACTION_RESTORE_POWER, rear, session, -1, "Reset rear power", trace);
                command(shell, ShellUserService.TRANSACTION_START, rear, session, -1, "Direct launch", trace);
                command(shell, ShellUserService.TRANSACTION_WAKE, rear, session, -1, "Wake rear", trace);
                shown = awaitWindow(context, session, rear, 8000, true);
            } else trace.append("Locked: use transparent main-to-rear task route; never unlock or wake display 0.\n");
            if (!shown && cancelled(session)) throw new Cancelled();
            if (!shown) {
                if (reuse) throw new IllegalStateException("原背屏歌词窗口未能恢复到前台，已保留原窗口与播放状态");
                save(context, "系统未直接显示背屏窗口，正在尝试独立任务迁移…", trace.toString());
                RearLyricsActivity.WindowState window = RearLyricsActivity.windowState(session);
                if (window == null) {
                    RearLyricsCommandResult result = command(shell, ShellUserService.TRANSACTION_START, 0, session, -1, "Fallback launch on main", trace);
                    if (result.failed()) throw new IllegalStateException("主屏备用启动被系统拒绝：" + result.output);
                    awaitWindow(context, session, rear, 1800, false);
                    window = RearLyricsActivity.windowState(session);
                }
                if (window == null) throw new IllegalStateException("系统没有创建歌词窗口，可能被 HyperOS 的背屏策略拦截");
                if (cancelled(session)) throw new Cancelled();
                trace.append("Before move: ").append(window).append('\n');
                RearLyricsCommandResult moved = command(shell, ShellUserService.TRANSACTION_MOVE, rear, session, window.taskId, "Move lyrics task", trace);
                if (moved.failed()) throw new IllegalStateException("歌词任务迁移失败：" + moved.output);
                command(shell, ShellUserService.TRANSACTION_WAKE, rear, session, -1, "Wake after move", trace);
                shown = awaitWindow(context, session, rear, 8000, true);
            }
            trace.append("Final window: ").append(RearLyricsActivity.windowState(session)).append('\n');
            trace.append("Rear power state: ").append(displayState(context, rear));
            if (!shown && cancelled(session)) throw new Cancelled();
            if (!shown) throw new IllegalStateException("背屏未确认显示。" + windowDescription(session) + "；屏幕状态=" + displayState(context, rear));
            if (!RearLyricsActivity.isCurrentSession(session)) throw new IllegalStateException("启动已取消");
            String message = "已确认背屏歌词窗口正在显示（屏幕 ID " + rear + "）";
            save(context, message, trace.toString());
            callback.success(rear, message);
        } catch (Cancelled stopped) {
            // The camera took the panel back mid-launch. Report a cancellation so the coordinator
            // keeps its handoff state machine driving instead of backing off as if it had failed.
            trace.append("\nCancelled: the rear display was handed over mid-launch");
            if (RearLyricsActivity.isCurrentSession(session)) save(context, "等待相机空闲后自动恢复背屏歌词", trace.toString());
            callback.cancelled("相机接管背屏，本次启动已取消");
        } catch (Exception error) {
            trace.append("\nFailure: ").append(error.getMessage()).append("\nWindow: ").append(windowDescription(session));
            String failure = "背屏启动失败：" + error.getMessage();
            if (RearLyricsActivity.isCurrentSession(session)) {
                if (!reuse) RearLyricsActivity.finishIfShown();
                save(context, failure, trace.toString());
            }
            callback.failure(failure, error);
        } finally {
            starting = false;
        }
    }

    /** A launch that is no longer wanted must stop immediately, not after two 8s timeouts. */
    private static boolean cancelled(String session) {
        return !RearLyricsActivity.isCurrentSession(session) || !RearLyricsCoordinator.presentationAllowed();
    }
    private static final class Cancelled extends Exception { Cancelled() { super("cancelled"); } }

    /** Wake only the rear display on a worker, without rebuilding a still-visible lyric window. */
    static void wake(Context context, IBinder shell, int rear, Runnable completed) {
        if (!RearLyricsCoordinator.presentationAllowed()) { completed.run(); return; } // Never fight a camera for power.
        String session = RearLyricsActivity.currentSession();
        WORKER.execute(() -> {
            try { command(shell, ShellUserService.TRANSACTION_WAKE, rear, session, -1, "Restore rear power", new StringBuilder()); }
            catch (Exception error) { save(context, "背屏唤醒失败：" + error.getMessage(), REVISION + " · rear wake only"); }
            finally { completed.run(); }
        });
    }

    /**
     * The camera can power the rear panel off, after which the logical display is gone and every
     * scan reports "no rear screen". Nothing else would ever wake it again, so the remembered id
     * is reset and woken directly. Bounded by the caller (a handful of attempts per episode).
     */
    static void wakeMissing(Context context, IBinder shell, int rear, Runnable completed) {
        if (rear <= 0) { completed.run(); return; }
        if (!RearLyricsCoordinator.presentationAllowed()) { completed.run(); return; }
        WORKER.execute(() -> {
            StringBuilder trace = new StringBuilder("Rear display " + rear + " is not in DisplayManager\n");
            try { command(shell, ShellUserService.TRANSACTION_RESTORE_POWER, rear, NO_SESSION, -1, "Reset missing rear power", trace); }
            catch (Exception error) { trace.append("reset: ").append(error.getMessage()).append('\n'); }
            try { command(shell, ShellUserService.TRANSACTION_WAKE, rear, NO_SESSION, -1, "Wake missing rear", trace, false); }
            catch (Exception error) { trace.append("wake: ").append(error.getMessage()).append('\n'); }
            RearLyricsTrace.record(context, "rear-missing-wake", trace.toString().replace('\n', ' '));
            completed.run();
        });
    }

    interface FrontTaskCallback { void complete(String summary); }
    interface PowerCallback { void complete(boolean success, String detail); }
    /** Relinquish power without waking a paused/covered screen merely to close its lyric window. */
    static void restoreRearPowerPolicy(IBinder shell, int rear, PowerCallback callback) {
        String session = RearLyricsActivity.currentSession();
        WORKER.execute(() -> {
            StringBuilder trace = new StringBuilder();
            try {
                if (rear <= 0) throw new IllegalStateException("No rear display");
                RearLyricsCommandResult result = command(shell, ShellUserService.TRANSACTION_RESTORE_POWER,
                    rear, session, -1, "Relinquish rear power", trace);
                callback.complete(!result.failed(), trace.toString());
            } catch (Exception error) { callback.complete(false, trace + "\n" + error.getMessage()); }
        });
    }
    static void setRearSleeping(Context context, IBinder shell, int rear, boolean sleeping, PowerCallback callback) {
        String session = RearLyricsActivity.currentSession();
        WORKER.execute(() -> {
            StringBuilder trace = new StringBuilder();
            try {
                if (rear <= 0) throw new IllegalStateException("No rear display");
                // Validate the matching restore operation BEFORE switching a display off.
                RearLyricsCommandResult restored = command(shell, ShellUserService.TRANSACTION_RESTORE_POWER, rear, session, -1, "Rear power restore", trace);
                if (restored.failed() || restored.output.contains("Unknown command")) throw new IllegalStateException(restored.output);
                if (sleeping) {
                    RearLyricsCommandResult result = command(shell, ShellUserService.TRANSACTION_SLEEP, rear, session, -1, "Rear power off", trace);
                    if (result.failed() || result.output.contains("Unknown command")) throw new IllegalStateException(result.output);
                } else command(shell, ShellUserService.TRANSACTION_WAKE, rear, session, -1, "Rear wake only", trace);
                SystemClock.sleep(500);
                boolean confirmed = displayState(context, rear) == (sleeping ? Display.STATE_OFF : Display.STATE_ON);
                if (!confirmed && sleeping) command(shell, ShellUserService.TRANSACTION_RESTORE_POWER, rear, session, -1, "Restore after rejected sleep", trace);
                callback.complete(confirmed, trace.toString() + "state=" + displayState(context, rear));
            } catch (Exception error) { callback.complete(false, trace + "\n" + error.getMessage()); }
        });
    }

    static void inspectFront(IBinder shell, int rear, FrontTaskCallback callback) {
        String session = RearLyricsActivity.currentSession();
        WORKER.execute(() -> {
            String summary = "-1 unavailable";
            try {
                RearLyricsCommandResult result = command(shell, ShellUserService.TRANSACTION_FRONT_TASK, rear, session, -1,
                    "Inspect rear front", new StringBuilder());
                if (!result.failed()) summary = result.output;
            } catch (Exception ignored) { }
            callback.complete(summary);
        });
    }
    private static boolean isLocked(Context context) {
        KeyguardManager keyguard = (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
        return keyguard != null && (keyguard.isKeyguardLocked()
            || (keyguard.isDeviceSecure() && displayState(context, 0) != Display.STATE_ON));
    }

    private static RearLyricsCommandResult command(IBinder shell, int transaction, int display, String session,
            int task, String label, StringBuilder trace) throws Exception {
        return command(shell, transaction, display, session, task, label, trace, true);
    }

    private static RearLyricsCommandResult command(IBinder shell, int transaction, int display, String session,
            int task, String label, StringBuilder trace, boolean sessionBound) throws Exception {
        // Camera-priority gate: launching, moving, waking or sleeping the rear display is
        // forbidden while a camera owns it. Releasing power and reading the task list stay
        // allowed - releasing is exactly what a camera handoff needs, and the task list is
        // how ownership is observed.
        if (sessionBound && !RearLyricsActivity.isCurrentSession(session)) throw new IllegalStateException("启动已取消");
        if (powerBound(transaction) && !RearLyricsCoordinator.presentationAllowed())
            throw new IllegalStateException("背屏已让给相机或本次显示已取消");
        if (shell == null || !shell.isBinderAlive()) throw new IllegalStateException("Shizuku 服务已断开");
        Parcel data = Parcel.obtain(), reply = Parcel.obtain();
        try {
            data.writeInterfaceToken(ShellUserService.DESCRIPTOR);
            data.writeInt(display); data.writeString(session == null ? "" : session); data.writeInt(task);
            if (!shell.transact(transaction, data, reply, 0)) throw new IllegalStateException("Shizuku 服务版本不匹配，请重启 Shizuku 后重试");
            reply.readException();
            RearLyricsCommandResult result = new RearLyricsCommandResult(reply.readInt(), reply.readString());
            trace.append(label).append(": ").append(result.describe()).append('\n');
            return result;
        } finally {
            data.recycle(); reply.recycle();
        }
    }
    private static boolean powerBound(int transaction) {
        return transaction == ShellUserService.TRANSACTION_START
            || transaction == ShellUserService.TRANSACTION_MOVE
            || transaction == ShellUserService.TRANSACTION_WAKE
            || transaction == ShellUserService.TRANSACTION_SLEEP
            || transaction == io.github.huleixin.tingyu.lsp.RearBridgeContract.HOLD_POWER;
    }

    private static boolean awaitWindow(Context context, String session, int display, long timeoutMs, boolean requireRear) {
        long until = SystemClock.elapsedRealtime() + timeoutMs;
        while (SystemClock.elapsedRealtime() < until) {
            if (cancelled(session)) return false;
            RearLyricsActivity.WindowState window = RearLyricsActivity.windowState(session);
            if (window != null && (!requireRear || (window.displayId == display && window.visible && window.drawn
                    && displayState(context, display) == Display.STATE_ON))) return true;
            SystemClock.sleep(80);
        }
        return false;
    }

    static int displayState(Context context, int displayId) {
        DisplayManager manager = (DisplayManager) context.getSystemService(Context.DISPLAY_SERVICE);
        Display display = manager == null ? null : manager.getDisplay(displayId);
        return display == null ? Display.STATE_UNKNOWN : display.getState();
    }

    private static String windowDescription(String session) {
        RearLyricsActivity.WindowState window = RearLyricsActivity.windowState(session);
        return window == null ? "没有收到窗口创建回执" : window.toString();
    }

    static void close(Context context, boolean quiet) {
        RearLyricsActivity.finishIfShown();
        if (quiet) RearLyricsTrace.record(context, "launcher", "rear window closed for a camera handoff");
        else save(context, "背屏歌词已关闭", REVISION + " · closed by user");
    }
    static void close(Context context) { close(context, false); }

    private static void save(Context context, String message, String diagnostic) {
        context.getSharedPreferences(PREFS, 0).edit().putString("launch_message", message)
            .putString("launch_diagnostics", diagnostic).apply();
        RearLyricsTrace.record(context, "launcher", message);
    }
}
