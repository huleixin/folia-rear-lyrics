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
    /** 面板从被点亮到 {@code getState()==ON} 的等待上限；只等一次，不重试。 */
    private static final long PANEL_READY_MS = 1_200;
    /**
     * 在 Display 0 上创建透明任务后，等它发布 {@code WindowState} 的上限。
     *
     * <p>1.3.39 用的是 1800ms。锁屏态下 Activity 冷启动会更慢（WebView 未起、进程可能被冻结），
     * 1.8 秒常常只够走到 onCreate 之前。这里放宽到 6 秒，但仍然是「等到就继续、等不到就报错」，
     * 不引入重试。
     */
    private static final long STAGE_WAIT_MS = 6_000;
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
        /**
         * 窗口还在、只是被系统背屏桌面盖住了。
         *
         * <p>这不是失败：{@code am start} 在这个场景下不会生效（1.3.61 真机：exit=0 但任务
         * 从未回到前台），所以必须交给 {@link RearCoveredRecovery} 去换**机制**，
         * 而不是抛异常让上层重复同一条命令。
         */
        default void covered(String message, String detail) { failure(message, null); }
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
        start(context, callback, shell, rearDisplayId, false);
    }

    /**
     * @param forceMigrate true 时强制走 1.3.39 的「Display 0 暂存 → 迁移」路径。
     *                     只有 COVERED_RECOVERY 的迁移机制会用它（A/B 的 B 侧），
     *                     界面上的常规启动一律传 false，由 {@link RearLaunchRoute} 判定。
     */
    static synchronized void start(Context context, Callback callback, IBinder shell, int rearDisplayId,
                                   boolean forceMigrate) {
        if (starting) { callback.failure("背屏歌词正在启动，请稍候", null); return; }
        starting = true;
        boolean locked = isLocked(context);
        boolean lsp = LspRearBridge.selected(context);
        boolean attached = RearLyricsActivity.attachedWindowOnDisplay(rearDisplayId) != null;
        boolean shown = RearLyricsActivity.isShowingOnDisplay(rearDisplayId);
        boolean planA = RearPlanA.enabled(context);
        // LSP 路线一律沿用 1.3.59 以来的判定，一行都不改：本次回归修复只针对 Shizuku。
        RearLaunchRoute.Mode mode = forceMigrate ? RearLaunchRoute.Mode.MIGRATE
            : RearLaunchRoute.readMode(context);
        RearLaunchRoute.Route route = lsp
            ? (RearWindowPolicy.mayReuseWindow(attached, locked, true,
                RearLyricsCoordinator.get(context).preserveSleepSession(), planA)
                ? RearLaunchRoute.Route.REUSE : RearLaunchRoute.Route.DIRECT)
            : RearLaunchRoute.decide(attached, shown, locked, planA, mode);
        boolean reuse = route == RearLaunchRoute.Route.REUSE;
        routeLabel = RearLaunchRoute.describe(mode, route, attached, shown, locked);
        // A reused instance that yielded to a camera must be allowed to draw again before the
        // launch is validated, otherwise awaitWindow() can never see it visible.
        if (reuse) RearLyricsActivity.resumeFromCamera();
        // HyperOS rejects third-party direct rear launches while locked, including an existing task.
        // Recreate only the native host and stage it transparently; Chromium starts after migration.
        if (locked && !reuse) RearLyricsActivity.finishIfShown();
        String session = reuse ? RearLyricsActivity.currentSession() : RearLyricsActivity.prepareLaunch(rearDisplayId);
        // 标签必须和真正执行的分支一致：1.3.61 在 reuse 时也写 "main-to-rear"，
        // 而代码走的是直接 am start —— 诊断因此指向了一条根本没被执行的路径。
        RearLyricsTrace.record(context, "launch-route",
            (locked ? (reuse ? "reuse-locked" : route == RearLaunchRoute.Route.MIGRATE
                ? "migrate-locked" : "direct-locked") : reuse ? "reuse-unlocked" : "direct")
                + "; " + routeLabel);
        save(context, route == RearLaunchRoute.Route.MIGRATE
                ? "正在用 1.3.39 兼容迁移（Display 0 暂存 → 迁移到背屏）…"
                : "正在直接启动背屏歌词…",
            REVISION + " · target display=" + rearDisplayId + "\n" + routeLabel);
        WORKER.execute(() -> launch(context, callback, shell, rearDisplayId, session, reuse,
            route == RearLaunchRoute.Route.MIGRATE));
    }

    /** 最近一次路线判定（诊断用）。 */
    private static volatile String routeLabel = "none";
    static String routeLabel() { return routeLabel; }

    /** No UI thread waits on Binder or am; only a drawn, visible window on the target screen succeeds. */
    private static void launch(Context context, Callback callback, IBinder shell, int rear, String session,
                               boolean reuse, boolean migrate) {
        StringBuilder trace = new StringBuilder("Folia rear " + REVISION + "\nTarget display=" + rear + "\n");
        try {
            trace.append("Backend: ").append(LspRearBridge.selected(context) ? LspRearBridge.detail() : "Shizuku").append('\n');
            boolean locked = isLocked(context);
            if (LspRearBridge.selected(context)) {
                command(shell, io.github.huleixin.tingyu.lsp.RearBridgeContract.HOLD_POWER, rear, session, -1, "Hold rear before launch", trace);
            }
            boolean shown = false;
            if (!locked || reuse || LspRearBridge.selected(context)) {
                // 顺序修正（1.3.62）：先点亮面板，再请求启动。
                //
                // 1.3.61 是「先 am start、后 WAKE」，而真机上锁屏时背屏正处于 DOZE /
                // DOZE_SUSPEND。ATMS 对睡眠显示上的启动请求会静默丢弃 —— am start 照样返回 0，
                // 于是代码只能等满 8 秒再判失败。等面板被点亮时，请求已经过去了。
                // 这里把电源放到启动之前，并用 getState() 确认面板真的 ON 了再发请求，
                // 没有新增任何唤醒次数：仍是每个恢复周期一次 WAKE。
                if (displayState(context, rear) != Display.STATE_ON) {
                    // A camera can leave the panel powered off with our power override undone.
                    // Reset the policy first: forcing it on with a bare wake sometimes does
                    // nothing while the display still carries the camera's own off-request.
                    command(shell, ShellUserService.TRANSACTION_RESTORE_POWER, rear, session, -1, "Reset rear power", trace);
                    wakeNumber(context, shell, rear, session, "Wake rear", trace, true);
                    awaitPanel(context, rear, PANEL_READY_MS);
                }
                trace.append("Panel before launch: ").append(RearFaultDiagnostics.stateName(displayState(context, rear))).append('\n');
                command(shell, ShellUserService.TRANSACTION_START, rear, session, -1, "Direct launch", trace);
                shown = awaitWindow(context, session, rear, 6000, true);
            } else trace.append("Locked: use transparent main-to-rear task route; never unlock or wake display 0.\n");
            if (!shown && cancelled(session)) throw new Cancelled();
            if (!shown) {
                if (reuse) {
                    // 1.3.61 在这里直接抛异常，于是每个恢复周期只剩「再跑一次 am start」。
                    // 窗口 attached=true、rendered=true、visible=false 说明它被 onStop 了，
                    // 不是被销毁；正确的下一步是「把已有任务置顶」，由 COVERED_RECOVERY 负责。
                    String detail = "window=" + windowDescription(session)
                        + ", rear=" + RearFaultDiagnostics.stateName(displayState(context, rear));
                    trace.append("\nCovered: existing window is attached but not visible; refront required\n")
                        .append(detail);
                    save(context, "背屏歌词被系统背屏桌面覆盖，正在置顶原任务…", trace.toString());
                    callback.covered("原背屏歌词窗口被系统背屏桌面覆盖（窗口仍存在）", detail);
                    return;
                }
                save(context, "系统未直接显示背屏窗口，正在尝试独立任务迁移…", trace.toString());
                trace.append("Route: migrate=").append(migrate)
                    .append(" (1.3.39 compatibility: transparent task on display 0, then move-stack)\n");
                RearLyricsActivity.WindowState window = RearLyricsActivity.windowState(session);
                if (window == null) {
                    // 1.3.39 的关键一步：先在 Display 0 上把这个**全新的**任务建出来。
                    // 它是自己的 root task，`am display move-stack` 才对它成立 —— 对一个被
                    // 系统压在下面的旧任务反复 moveTaskToFront 是另一层对象，这就是两者
                    // 效果不同的原因。这一步不点亮、不解锁主屏：Activity 在锁屏后不可见。
                    RearLyricsCommandResult staged = command(shell, ShellUserService.TRANSACTION_START, 0,
                        session, -1, "Stage transparent task on display 0", trace);
                    trace.append("Stage exit=").append(staged.exitCode)
                        .append(staged.failed() ? " FAILED" : " ok").append('\n');
                    if (staged.failed()) throw new IllegalStateException("主屏暂存启动被系统拒绝：" + staged.output);
                    awaitWindow(context, session, rear, STAGE_WAIT_MS, false);
                    window = RearLyricsActivity.windowState(session);
                }
                if (window == null) throw new IllegalStateException("系统没有创建歌词窗口，可能被 HyperOS 的背屏策略拦截");
                if (cancelled(session)) throw new Cancelled();
                // 相机在暂存与迁移之间接管：立刻放手，临时任务由 finally 里的 finishIfShown 清掉。
                if (RearLyricsActivity.isYieldingToCamera()) throw new Cancelled();
                trace.append("Before move: ").append(window).append('\n');
                RearLyricsCommandResult moved = command(shell, ShellUserService.TRANSACTION_MOVE, rear,
                    session, window.taskId, "Move lyrics task to display " + rear, trace);
                // 迁移的事务自己会回读任务表：`moved=true` 才是「任务真的到背屏了」。
                // 退出码 0 在这里没有意义（1.3.39 只看到退出码，所以失败时也以为搬成功了）。
                boolean relocated = !moved.failed() && moved.output.contains("moved=true");
                trace.append("Move exit=").append(moved.exitCode)
                    .append(", verified=").append(relocated).append('\n');
                RearLyricsTrace.record(context, "rear-migrate",
                    "task=" + window.taskId + ", display 0->" + rear + ", exit=" + moved.exitCode
                        + ", relocated=" + relocated + ", out=" + oneLine(moved.output));
                wakeNumber(context, shell, rear, session, "Wake after move", trace, true);
                shown = awaitWindow(context, session, rear, 8000, true);
                if (!shown && !relocated) throw new IllegalStateException("歌词任务迁移失败：" + oneLine(moved.output));
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

    /**
     * 最近一次背屏唤醒的**完整结果**：命令、退出码、命令输出、以及执行前后面板的真实状态。
     *
     * <p>为什么必须记「执行后」：shell 命令退出码为 0 只说明 {@code input} 把事件写进了输入队列，
     * 不代表面板真的点亮了 —— HyperOS 可以接受事件而仍拒绝点亮副屏。判据必须是
     * {@code Display.getState()} 的变化，这也是「不能仅凭命令返回成功就认定已点亮」的落点。
     */
    private static volatile String lastWake = "none";
    static String lastWake() { return lastWake; }

    private static void noteWake(Context context, String label, int rear, int before,
                                 RearLyricsCommandResult result, String error) {
        int after = displayState(context, rear);
        boolean lit = after == Display.STATE_ON || after == Display.STATE_DOZE
            || after == Display.STATE_DOZE_SUSPEND;
        StringBuilder text = new StringBuilder(label)
            .append(" display=").append(rear)
            .append(' ').append(RearFaultDiagnostics.stateName(before))
            .append("->").append(RearFaultDiagnostics.stateName(after))
            .append(" lit=").append(lit);
        if (!error.isEmpty()) text.append(" error=").append(error);
        if (result != null) {
            text.append(" exit=").append(result.exitCode).append(result.failed() ? " FAILED" : "");
            if (!result.output.isEmpty()) text.append(" out=").append(oneLine(result.output));
        }
        lastWake = text.toString();
    }

    /** 只发唤醒事件并记录前后状态；异常原样抛给调用方，不改变既有控制流。 */
    private static void wakeNumber(Context context, IBinder shell, int rear, String session, String label,
                                   StringBuilder trace, boolean sessionBound) throws Exception {
        int before = displayState(context, rear);
        RearLyricsCommandResult result = null;
        String error = "";
        try {
            result = command(shell, ShellUserService.TRANSACTION_WAKE, rear, session, -1, label, trace, sessionBound);
        } catch (Exception failure) {
            error = failure.getMessage() == null ? failure.getClass().getSimpleName() : failure.getMessage();
            throw failure;
        } finally {
            noteWake(context, label, rear, before, result, error);
        }
    }

    private static String oneLine(String text) {
        String flat = text.replace('\n', ' ').replace('\r', ' ').trim();
        return flat.length() <= 160 ? flat : flat.substring(0, 160) + "…";
    }

    /** Wake only the rear display on a worker, without rebuilding a still-visible lyric window. */
    static void wake(Context context, IBinder shell, int rear, Runnable completed) {
        if (!RearLyricsCoordinator.presentationAllowed()) { completed.run(); return; } // Never fight a camera for power.
        String session = RearLyricsActivity.currentSession();
        WORKER.execute(() -> {
            try { wakeNumber(context, shell, rear, session, "Restore rear power", new StringBuilder(), true); }
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
            try { wakeNumber(context, shell, rear, NO_SESSION, "Wake missing rear", trace, false); }
            catch (Exception error) { trace.append("wake: ").append(error.getMessage()).append('\n'); }
            RearLyricsTrace.record(context, "rear-missing-wake", trace.toString().replace('\n', ' '));
            completed.run();
        });
    }

    interface FrontTaskCallback { void complete(String summary); }
    interface PowerCallback { void complete(boolean success, String detail); }
    interface TimeoutCallback { void complete(boolean success, String value); }

    /**
     * Read the HyperOS rear sleep timeout through the Shizuku shell. Read-only by design since
     * 1.3.59: the key governs the unlocked rear timeout only, so writing it could never keep a
     * locked rear panel lit; it is now observed at lock/unlock as evidence and never changed.
     */
    static void readSubscreenTimeout(IBinder shell, TimeoutCallback callback) {
        WORKER.execute(() -> {
            try {
                RearLyricsCommandResult result = command(shell, ShellUserService.TRANSACTION_TIMEOUT_GET,
                    1, RearLyricsActivity.currentSession().isEmpty() ? NO_SESSION : RearLyricsActivity.currentSession(),
                    -1, "Read rear timeout", new StringBuilder(), false);
                callback.complete(!result.failed(), result.failed() ? "" : result.output);
            } catch (Exception error) { callback.complete(false, error.getMessage()); }
        });
    }

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

    /**
     * 读回背屏的真实前台（1.3.63）。**只读**，不搬任何任务。
     *
     * <p>1.3.62 这里调用的是「置顶」事务，但它在真机上的实现只是「读表 → am start」，
     * 与 RELAUNCH 完全重复，且解析失败时返回 {@code task-not-found}，把一次查询失败
     * 写成了事实结论。现在它只回答三个问题：表可读吗、任务还在吗、前台是谁。
     * 调用方据此把失败分类，而不是一律当成「没置顶」。
     */
    interface FrontProbeCallback { void complete(RearTaskTable.Lookup lookup, String raw); }

    private static volatile String lastRefront = "none";
    static String lastRefront() { return lastRefront; }

    static void probeFront(Context context, IBinder shell, int rear, int task, FrontProbeCallback callback) {
        WORKER.execute(() -> {
            StringBuilder trace = new StringBuilder();
            if (rear <= 0) {
                lastRefront = "probe skipped rear=" + rear;
                callback.complete(new RearTaskTable.Lookup(RearTaskTable.Status.UNREADABLE, null, null, 0, "no rear"),
                    lastRefront);
                return;
            }
            try {
                String session = RearLyricsActivity.currentSession();
                RearLyricsCommandResult result = command(shell, ShellUserService.TRANSACTION_FRONT_PROBE,
                    rear, session, task, "Front probe", trace, true);
                String raw = result.output == null ? "" : result.output;
                rearFrontProbe = raw;
                RearTaskTable.Status status = parseStatus(raw);
                RearTaskTable.Row frontRow = parseFrontRow(raw);
                RearTaskTable.Row taskRow = parseTaskRow(raw);
                RearTaskTable.Lookup lookup = new RearTaskTable.Lookup(status, taskRow, frontRow,
                    parseRows(raw), parseWhy(raw));
                lastRefront = oneLine(trace.toString());
                RearLyricsTrace.record(context, "rear-front-probe", lastRefront);
                callback.complete(lookup, raw);
            } catch (Exception error) {
                String message = error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
                lastRefront = "probe failed: " + message;
                RearLyricsTrace.record(context, "rear-front-probe", lastRefront);
                callback.complete(new RearTaskTable.Lookup(RearTaskTable.Status.UNREADABLE, null, null, 0, message),
                    message);
            }
        });
    }

    /** 最近一次前台探针的原始回复（诊断/导出用，不含歌名等用户数据）。 */
    private static volatile String rearFrontProbe = "none";
    static String lastFrontProbe() { return rearFrontProbe; }

    private static RearTaskTable.Status parseStatus(String raw) {
        String value = field(raw, "status");
        for (RearTaskTable.Status status : RearTaskTable.Status.values()) {
            if (status.name().equals(value)) return status;
        }
        return RearTaskTable.Status.UNREADABLE;
    }

    private static int parseRows(String raw) {
        try { return Integer.parseInt(field(raw, "rows")); } catch (RuntimeException ignored) { return 0; }
    }

    private static String parseWhy(String raw) { return field(raw, "why"); }

    private static RearTaskTable.Row parseFrontRow(String raw) {
        String value = field(raw, "front");
        if (value.isEmpty() || value.startsWith("-1")) return null;
        RearTaskTable.Row row = new RearTaskTable.Row();
        int space = value.indexOf(' ');
        if (space <= 0) return null;
        try { row.task = Integer.parseInt(value.substring(0, space)); } catch (RuntimeException ignored) { return null; }
        row.component = value.substring(space + 1).trim();
        return row;
    }

    private static RearTaskTable.Row parseTaskRow(String raw) {
        String value = field(raw, "task-row");
        if (value.isEmpty()) return null;
        RearTaskTable.Row row = new RearTaskTable.Row();
        for (String part : value.split(",")) {
            String[] pair = part.trim().split("=", 2);
            if (pair.length != 2) continue;
            if ("root".equals(pair[0])) row.root = number(pair[1]);
            else if ("display".equals(pair[0])) row.display = number(pair[1]);
            else if ("task".equals(pair[0])) row.task = number(pair[1]);
            else if ("component".equals(pair[0]) && !"?".equals(pair[1])) row.component = pair[1];
        }
        return row.task > 0 ? row : null;
    }

    private static int number(String value) {
        try { return Integer.parseInt(value.trim()); } catch (RuntimeException ignored) { return -1; }
    }

    /** 从 "key=value" 多行回复里取一个字段；没有就返回空串。 */
    private static String field(String raw, String key) {
        if (raw == null) return "";
        for (String line : raw.split("\r?\n")) {
            if (line.startsWith(key + "=")) return line.substring(key.length() + 1).trim();
        }
        return "";
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

    /** 面板点亮是异步的：等它真的变成 {@code STATE_ON} 再发启动请求（最多 {@link #PANEL_READY_MS}）。 */
    private static boolean awaitPanel(Context context, int display, long timeoutMs) {
        long until = SystemClock.elapsedRealtime() + timeoutMs;
        while (SystemClock.elapsedRealtime() < until) {
            if (displayState(context, display) == Display.STATE_ON) return true;
            SystemClock.sleep(80);
        }
        return displayState(context, display) == Display.STATE_ON;
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
