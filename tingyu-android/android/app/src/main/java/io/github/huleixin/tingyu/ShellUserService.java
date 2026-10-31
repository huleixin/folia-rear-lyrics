package io.github.huleixin.tingyu;

import android.os.Binder;
import android.os.Parcel;
import android.os.RemoteException;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Starts, moves, refronts and wakes only Folia's lyrics window through the Shizuku shell process. */
public final class ShellUserService extends Binder {
    static final int VERSION = 255;
    static final String DESCRIPTOR = "io.github.huleixin.tingyu.REAR_LYRICS_V2";
    static final int TRANSACTION_START = FIRST_CALL_TRANSACTION;
    static final int TRANSACTION_MOVE = FIRST_CALL_TRANSACTION + 1;
    static final int TRANSACTION_WAKE = FIRST_CALL_TRANSACTION + 2;
    static final int TRANSACTION_FRONT_TASK = FIRST_CALL_TRANSACTION + 3;
    static final int TRANSACTION_SLEEP = FIRST_CALL_TRANSACTION + 4;
    static final int TRANSACTION_RESTORE_POWER = FIRST_CALL_TRANSACTION + 5;
    /** Read the HyperOS rear-screen sleep timeout (read-only evidence; this build never writes it). */
    static final int TRANSACTION_TIMEOUT_GET = FIRST_CALL_TRANSACTION + 6;
    /**
     * Former "write the timeout" transaction, retired in 1.3.59: the key only governs the
     * unlocked rear timeout, never the lock-time sleep, and leaving a global setting at
     * 2147483647 created a restore debt for no benefit. The slot stays reserved so the
     * transaction numbering of an installed client cannot shift.
     */
    static final int TRANSACTION_TIMEOUT_PUT_RETIRED = FIRST_CALL_TRANSACTION + 7;
    /** Bounded camera/window log snapshot; the only transaction that returns no command output. */
    static final int TRANSACTION_LOG_SNAPSHOT = FIRST_CALL_TRANSACTION + 8;
    /**
     * 读回背屏的真实前台任务（1.3.63 起替代 1.3.62 的 {@code TRANSACTION_REFRONT}）。
     *
     * <p><b>为什么删掉 REFRONT：</b>它做的全部事情是「读表 → am display move-stack（仅跨屏时）
     * → am stack move-task → am start」，而 {@code TRANSACTION_START} 本来就是 {@code am start}。
     * 真机上它返回 {@code before=task-not-listed front=-1 unknown}，既没定位到任务，也没产生
     * 任何与 am start 不同的效果 —— 它只是把同一条失败命令又占掉了一次恢复额度。
     *
     * <p>现在这个事务只做一件事：用 {@link RearTaskTable} 把 {@code am stack list} 解析成
     * 「表是否可读 / 任务是否存在 / 背屏前台是谁」，供调用方把失败分类成
     * TASK_NOT_FOUND / COMMAND_UNSUPPORTED / SYSTEM_RETAKEN，而不是一律当「没置顶」。
     *
     * <p>1.3.61 的旧说明留作背景：
     * {@code am start --display 1} exiting 0 while {@code task=56938} never became visible and
     * {@code SubScreenLauncher} kept the rear front. That means the launch was accepted by
     * {@code ActivityStarter} and then dropped — a rejected launch prints nothing, so the old
     * code could only time out after 8 s and repeat the same call.
     *
     * <p>This transaction therefore changes the <i>mechanism</i>, in the order that costs least:
     * <ol>
     *   <li>read the real task table and locate our task's root task and display;</li>
     *   <li>if the task sits on another display, {@code am display move-stack <root> <display>}
     *       — the only documented way to move a whole root task;</li>
     *   <li>{@code am stack move-task <task> <root> true} — reorder inside the display's stack,
     *       which is what "put the existing task on top" actually means;</li>
     *   <li>{@code am start} as the last resort, recorded separately so a failure can never be
     *       confused with the two steps above;</li>
     *   <li>read the table again and return the <b>real</b> rear front task, so success is judged
     *       by the system's own answer instead of by an exit code.</li>
     * </ol>
     *
     * <p>Every step's exit code and output is returned verbatim. A command that this ROM does not
     * implement reports it here instead of being silently treated as success.
     */
    static final int TRANSACTION_FRONT_PROBE = FIRST_CALL_TRANSACTION + 9;
    /** HyperOS rear-screen sleep timeout; observed only, never written since 1.3.59. */
    static final String SUBSYSTEM_TIMEOUT_SETTING = "subscreen_display_time";
    private static final ExecutorService OUTPUT_READER = Executors.newCachedThreadPool();

    private static final Pattern ROOT_LINE =
        Pattern.compile("^\\s*(?:RootTask|Stack|Task) id=#?(\\d+)\\b.*\\bdisplayId=(\\d+)\\b");
    private static final Pattern TASK_LINE = Pattern.compile("^\\s*\\* Task\\{[^}]*#(\\d+)\\b");
    private static final Pattern ACTIVITY_LINE =
        Pattern.compile("([A-Za-z][\\w]*(?:\\.[\\w]+)+/[\\w.$]+) t(\\d+)\\b");
    private static final Pattern RESUMED_LINE =
        Pattern.compile("(mResumedActivity|topResumedActivity)[:=].*?([A-Za-z][\\w]*(?:\\.[\\w]+)+/[\\w.$]+)");

    public ShellUserService() {
        attachInterface(null, DESCRIPTOR);
    }

    @Override
    protected boolean onTransact(int code, Parcel data, Parcel reply, int flags) throws RemoteException {
        // Shizuku's reserved destroy transaction is used when this service version changes.
        if (code == 16777115) { System.exit(0); return true; }
        if (code < TRANSACTION_START || (code > TRANSACTION_LOG_SNAPSHOT && code != TRANSACTION_FRONT_PROBE))
            return super.onTransact(code, data, reply, flags);
        data.enforceInterface(DESCRIPTOR);
        int displayId = data.readInt();
        String session = data.readString();
        int taskId = data.readInt();
        try {
            if (code == TRANSACTION_LOG_SNAPSHOT) {
                reply.writeNoException();
                reply.writeInt(0);
                reply.writeString(RearCameraLog.snapshot());
                return true;
            }
            if (displayId < 0 || session == null || session.isEmpty()) throw new IllegalArgumentException("Invalid rear-screen request");
            if (code == TRANSACTION_FRONT_PROBE) {
                // 只读：不改电源、不搬任务，所以主屏之外的任何显示都可以问，主屏拒绝。
                if (displayId == 0) throw new IllegalArgumentException("Never probe the main display");
                reply.writeNoException();
                reply.writeInt(0);
                reply.writeString(probeFront(displayId, taskId));
                return true;
            }
            String targetDisplay = Integer.toString(displayId);
            String[] command;
            if (code == TRANSACTION_START) {
                command = new String[] {"/system/bin/am", "start", "--user", "current", "--display", targetDisplay,
                    // am accepts numeric intent flags; --activity-new-task is not a valid shell option.
                    "-n", "io.github.huleixin.tingyu/.RearLyricsActivity", "-f", "0x10000000",
                    "--es", RearLyricsActivity.EXTRA_SESSION, session};
            } else if (code == TRANSACTION_MOVE) {
                if (taskId < 0 || displayId == 0) throw new IllegalArgumentException("Invalid rear task");
                // 1.3.39 的迁移在这里被加强了：先定位真实 root task，再按候选命令逐个尝试，
                // 每一步都回读「任务到底在哪个显示上」。命令退出码不再等于成功。
                reply.writeNoException();
                reply.writeInt(0);
                reply.writeString(stageMove(displayId, taskId));
                return true;
            } else if (code == TRANSACTION_FRONT_TASK) {
                if (displayId == 0) throw new IllegalArgumentException("Only the rear task may be inspected");
                command = new String[] {"/system/bin/am", "stack", "list"};
            } else if (code == TRANSACTION_TIMEOUT_GET) {
                // Read-only. The value is recorded at lock and unlock purely as evidence that it
                // does not change across a lock and does not govern the lock-time sleep.
                command = new String[] {"/system/bin/settings", "get", "system", SUBSYSTEM_TIMEOUT_SETTING};
            } else if (code == TRANSACTION_TIMEOUT_PUT_RETIRED) {
                throw new IllegalArgumentException("这个版本不再写 subscreen_display_time（锁屏熄屏与它无关）");
            } else if (code == TRANSACTION_SLEEP || code == TRANSACTION_RESTORE_POWER) {
                if (displayId == 0) throw new IllegalArgumentException("Never change the main display power");
                // Android 15 uses power-on, Android 16 restores the normal policy with power-reset.
                command = new String[] {"/system/bin/cmd", "display", code == TRANSACTION_SLEEP ? "power-off"
                    : android.os.Build.VERSION.SDK_INT >= 36 ? "power-reset" : "power-on", targetDisplay};
            } else {
                if (displayId == 0) throw new IllegalArgumentException("Only the rear screen may be woken");
                command = new String[] {"/system/bin/input", "-d", targetDisplay, "keyevent", "KEYCODE_WAKEUP"};
            }
            Exec result = exec(command, code == TRANSACTION_FRONT_TASK ? 100000 : 3000);
            // The whole listing is returned, not just the rear front: the app parses both the
            // rear and the main display from it (camera task on either one suspends the lyrics),
            // and parsing app-side keeps that logic unit-testable instead of living in the
            // Shizuku daemon.
            reply.writeNoException();
            reply.writeInt(result.exit);
            reply.writeString(result.output);
            return true;
        } catch (Exception error) {
            throw new RemoteException(error.getMessage());
        }
    }

    /**
     * 一次 shell 调用的结果。
     *
     * <p>刻意做成返回值而不是实例字段：{@code onTransact} 会被多个 Binder 线程并发进入，
     * 用一个共享的 {@code lastExit} 记录退出码会让 A 的退出码被 B 覆盖 —— 1.3.61 之前的实现
     * 用的是局部变量，这里不能退化成共享状态。
     */
    private static final class Exec {
        final int exit;
        final String output;
        Exec(int exit, String output) { this.exit = exit; this.output = output == null ? "" : output; }
    }

    // ------------------------------------------------------------------ stage move

    /**
     * 把 Display 0 上刚建好的透明歌词任务整体迁到背屏（1.3.39 的机制，按 API 37 修正）。
     *
     * <h3>为什么要重写命令而不是照抄</h3>
     * 1.3.39 直接跑 {@code am display move-stack <window.taskId> <rear>}。这条命令的参数是
     * <b>stack / root task</b>，而不是任意子任务；当时能生效，是因为「在 Display 0 上用
     * FLAG_ACTIVITY_NEW_TASK 新建一个任务」得到的那个任务本身就是它自己的 root task，
     * 于是 {@code taskId == rootTaskId} 恰好成立。
     *
     * <p>在 API 37 上这个巧合不能假设：同一个 id 也可能被组织进别的 root。所以这里先读
     * {@code am stack list} 拿到真实 root id，优先按 root 搬；读不出来时退回 1.3.39 的写法
     * （直接传 taskId）—— 也就是说「老命令」仍然会被执行，只是不再是唯一选择。
     *
     * <h3>成功的判据</h3>
     * 每条命令之后都回读一次表，只有「目标任务确实出现在目标 display 上」才算搬成功。
     * 退出码为 0 但任务没动的情况在真机上出现过（{@code am start} 就是如此），所以不能
     * 用它判定。全部候选都失败时，输出里保留每一条命令的原文与退出码。
     */
    private String stageMove(int displayId, int taskId) {
        final String[] list = {"/system/bin/am", "stack", "list"};
        final String target = Integer.toString(displayId);
        Exec before = exec(list, 200000);
        RearTaskTable.Lookup lookup = RearTaskTable.parse(before.output, taskId, displayId);
        int root = lookup.task != null && lookup.task.root > 0 ? lookup.task.root : taskId;
        StringBuilder text = new StringBuilder("stage-move display=").append(displayId)
            .append(" task=").append(taskId)
            .append(" listing-exit=").append(before.exit)
            .append(before.exit == 0 ? " ok" : " rejected").append('\n');
        text.append("rows=").append(lookup.rows).append(", status=").append(lookup.status).append('\n');
        if (lookup.task != null) text.append("before=").append(lookup.task.describe()).append('\n');
        text.append("root=").append(root).append('\n');

        java.util.List<String[]> candidates = new java.util.ArrayList<>();
        candidates.add(new String[] {"/system/bin/am", "display", "move-stack", Integer.toString(root), target});
        if (root != taskId) {
            // 读到的 root 与任务不同：再试一次 1.3.39 的原始写法，避免「表读错就彻底搬不动」。
            candidates.add(new String[] {"/system/bin/am", "display", "move-stack", Integer.toString(taskId), target});
        }
        boolean moved = false;
        for (int i = 0; i < candidates.size() && !moved; i++) {
            String[] candidate = candidates.get(i);
            Exec result = exec(candidate, 6000);
            text.append("cmd[").append(i + 1).append("]=").append(join(candidate))
                .append(" -> exit=").append(result.exit)
                .append(result.exit == 0 ? " ok" : " rejected")
                .append(" out=").append(oneLine(result.output)).append('\n');
            Exec after = exec(list, 200000);
            RearTaskTable.Lookup now = RearTaskTable.parse(after.output, taskId, displayId);
            if (now.task != null && now.task.display == displayId) {
                moved = true;
                text.append("after=").append(now.task.describe()).append('\n');
            } else if (now.status == RearTaskTable.Status.UNREADABLE) {
                text.append("after-unreadable rows=").append(now.rows).append('\n');
            } else if (now.task != null) {
                text.append("after=").append(now.task.describe()).append('\n');
            }
        }
        text.append("moved=").append(moved);
        return text.toString();
    }

    private static String join(String[] command) {
        StringBuilder text = new StringBuilder();
        for (String part : command) {
            if (text.length() > 0) text.append(' ');
            text.append(part);
        }
        return text.toString();
    }

    // ------------------------------------------------------------------ front probe

    /**
     * 读回背屏前台的**三态**结论（可读 / 任务不存在 / 表读不出来）。
     *
     * <p>回复是一行 key=value，调用方用 {@link RearTaskTable} 同样的规则判读；
     * 这里刻意不再自己解析一遍 —— 1.3.62 就是因为「服务端一套正则、客户端另一套正则」，
     * 真机上一套匹配失败被当成「任务不存在」。
     */
    private String probeFront(int displayId, int taskId) {
        Exec listing = exec(new String[] {"/system/bin/am", "stack", "list"}, 200000);
        RearTaskTable.Lookup lookup = RearTaskTable.parse(listing.output, taskId, displayId);
        StringBuilder text = new StringBuilder("front-probe display=").append(displayId)
            .append(" task=").append(taskId)
            .append(" exit=").append(listing.exit).append(listing.exit == 0 ? " ok" : " rejected")
            .append('\n');
        text.append("status=").append(lookup.status).append('\n');
        text.append("rows=").append(lookup.rows).append('\n');
        if (lookup.task != null) text.append("task-row=").append(lookup.task.describe()).append('\n');
        text.append("front=").append(lookup.front == null ? "-1 unknown"
            : lookup.front.task + " " + (lookup.front.component == null ? "?" : lookup.front.component)).append('\n');
        if (!lookup.reason.isEmpty()) text.append("why=").append(lookup.reason).append('\n');
        String trimmed = listing.output.trim();
        if (trimmed.isEmpty()) text.append("listing=empty");
        else text.append("listing-head=").append(oneLine(trimmed));
        return text.toString();
    }

    private static String oneLine(String text) {
        String flat = text.replace('\n', ' ').replace('\r', ' ').trim();
        return flat.length() <= 200 ? flat : flat.substring(0, 200) + "…";
    }

    // ------------------------------------------------------------------ process exec

    /** Runs one command with the historical 10 s cap; returns its exit code and merged output. */
    private Exec exec(String[] command, int cap) {
        try {
            Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
            Future<String> output = OUTPUT_READER.submit((Callable<String>) () -> {
                StringBuilder text = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        if (text.length() < cap) text.append(line).append('\n');
                    }
                }
                return text.toString().trim();
            });
            if (!process.waitFor(10, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                return new Exec(-1, "timed out after 10s");
            }
            String result = output.get(2, TimeUnit.SECONDS);
            return new Exec(process.exitValue(), result);
        } catch (Exception error) {
            String message = error.getMessage();
            return new Exec(-1, message == null ? error.getClass().getSimpleName() : message);
        }
    }
}
