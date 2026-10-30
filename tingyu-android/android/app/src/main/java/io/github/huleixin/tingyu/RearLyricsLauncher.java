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
    interface Callback {
        void success(int displayId, String message);
        void failure(String message, Exception error);
    }

    static boolean isStarting() { return starting; }
    static String message(Context context) { return context.getSharedPreferences(PREFS, 0).getString("launch_message", ""); }
    static String diagnostics(Context context) { return context.getSharedPreferences(PREFS, 0).getString("launch_diagnostics", ""); }

    static synchronized void start(Context context, Callback callback, IBinder shell, int rearDisplayId) {
        if (starting) { callback.failure("背屏歌词正在启动，请稍候", null); return; }
        starting = true;
        boolean locked = isLocked(context);
        boolean reuse = (!locked || LspRearBridge.selected(context) || RearLyricsCoordinator.get(context).preserveSleepSession())
            && RearLyricsActivity.attachedWindowOnDisplay(rearDisplayId) != null;
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
                command(shell, ShellUserService.TRANSACTION_START, rear, session, -1, "Direct launch", trace);
                command(shell, ShellUserService.TRANSACTION_WAKE, rear, session, -1, "Wake rear", trace);
                shown = awaitWindow(context, session, rear, 8000, true);
            } else trace.append("Locked: use transparent main-to-rear task route; never unlock or wake display 0.\n");
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
                trace.append("Before move: ").append(window).append('\n');
                RearLyricsCommandResult moved = command(shell, ShellUserService.TRANSACTION_MOVE, rear, session, window.taskId, "Move lyrics task", trace);
                if (moved.failed()) throw new IllegalStateException("歌词任务迁移失败：" + moved.output);
                command(shell, ShellUserService.TRANSACTION_WAKE, rear, session, -1, "Wake after move", trace);
                shown = awaitWindow(context, session, rear, 8000, true);
            }
            trace.append("Final window: ").append(RearLyricsActivity.windowState(session)).append('\n');
            trace.append("Rear power state: ").append(displayState(context, rear));
            if (!shown) throw new IllegalStateException("背屏未确认显示。" + windowDescription(session) + "；屏幕状态=" + displayState(context, rear));
            if (!RearLyricsActivity.isCurrentSession(session)) throw new IllegalStateException("启动已取消");
            String message = "已确认背屏歌词窗口正在显示（屏幕 ID " + rear + "）";
            save(context, message, trace.toString());
            callback.success(rear, message);
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
        // Camera-priority gate: launching, moving, waking or sleeping the rear display is
        // forbidden while a camera owns it. Releasing power and reading the task list stay
        // allowed - releasing is exactly what a camera handoff needs, and the task list is
        // how ownership is observed.
        boolean sessionBound = transaction == ShellUserService.TRANSACTION_START
            || transaction == ShellUserService.TRANSACTION_MOVE
            || transaction == ShellUserService.TRANSACTION_WAKE
            || transaction == ShellUserService.TRANSACTION_SLEEP
            || transaction == io.github.huleixin.tingyu.lsp.RearBridgeContract.HOLD_POWER;
        if (sessionBound && !RearLyricsActivity.isCurrentSession(session)) throw new IllegalStateException("启动已取消");
        if (sessionBound && !RearLyricsCoordinator.presentationAllowed()) throw new IllegalStateException("背屏已让给相机或本次显示已取消");
        if (!shell.isBinderAlive()) throw new IllegalStateException("Shizuku 服务已断开");
        Parcel data = Parcel.obtain(), reply = Parcel.obtain();
        try {
            data.writeInterfaceToken(ShellUserService.DESCRIPTOR);
            data.writeInt(display); data.writeString(session); data.writeInt(task);
            if (!shell.transact(transaction, data, reply, 0)) throw new IllegalStateException("Shizuku 服务版本不匹配，请重启 Shizuku 后重试");
            reply.readException();
            RearLyricsCommandResult result = new RearLyricsCommandResult(reply.readInt(), reply.readString());
            trace.append(label).append(": ").append(result.describe()).append('\n');
            return result;
        } finally {
            data.recycle(); reply.recycle();
        }
    }

    private static boolean awaitWindow(Context context, String session, int display, long timeoutMs, boolean requireRear) {
        long until = SystemClock.elapsedRealtime() + timeoutMs;
        while (SystemClock.elapsedRealtime() < until && RearLyricsActivity.isCurrentSession(session)) {
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

    static void close(Context context) {
        RearLyricsActivity.finishIfShown();
        save(context, "背屏歌词已关闭", REVISION + " · closed by user");
    }

    private static void save(Context context, String message, String diagnostic) {
        context.getSharedPreferences(PREFS, 0).edit().putString("launch_message", message)
            .putString("launch_diagnostics", diagnostic).apply();
        RearLyricsTrace.record(context, "launcher", message);
    }
}
