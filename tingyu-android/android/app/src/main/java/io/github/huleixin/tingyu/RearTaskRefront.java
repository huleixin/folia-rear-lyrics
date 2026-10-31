package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearTaskRefront.java
import android.app.ActivityManager;
import android.content.Context;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 把<b>我们自己的</b>背屏歌词任务重新置顶，不重建 Activity、不重建 WebView、不碰电源。
 *
 * <h3>为什么这条路径必须存在</h3>
 * 1.3.61 的恢复只有一条命令：{@code am start --display 1 -n …/.RearLyricsActivity}。
 * 真机诊断显示它退出码 0、却从未把任务拉回前台（{@code task=56938} 的 {@code visible}
 * 一直是 false，背屏前台始终是 {@code SubScreenLauncher}）。{@code am start} 只是
 * 「请求启动」，被 {@code ActivityStarter} 静默丢弃时不会有任何错误输出 ——
 * 于是代码只能在 8 秒超时后判失败，再原样重试。
 *
 * <p>{@link ActivityManager#moveTaskToFront(int, int)} 是另一条 ATMS 入口：
 * 它的语义是「把<b>这个任务</b>提到前台」，而不是「启动一个组件」。对自有任务而言它是
 * 官方允许的操作，需要 {@code android.permission.REORDER_TASKS}（normal 级，安装即授予），
 * 不需要 shell、不需要 root、不会新建任何对象。这才是「恢复已有歌词任务」的正确原语。
 *
 * <p>它与 {@code am start} 的差别不是「又一个重试」：前者走
 * {@code ActivityTaskManagerService.moveTaskToFront → RootTask.moveToFront}，
 * 后者走 {@code ActivityStarter.executeRequest → startActivityUnchecked}。
 * 后者会因为「正在睡眠的显示」「后台启动限制」在 {@code ActivityStarter} 里被静默取消，
 * 而前者不经过那段判定。
 *
 * <p>失败时把异常原样带回（{@code SecurityException} / {@code IllegalStateException}），
 * 因为「系统拒绝」本身就是需要的结论 —— 不能吞掉之后再假装重试。
 */
final class RearTaskRefront {
    private static final ExecutorService WORKER = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "tingyu-rear-refront");
        thread.setDaemon(true);
        return thread;
    });

    enum Outcome {
        /** 调用被接受；是否真的可见由调用方回读窗口确认。 */
        MOVED,
        /** 系统明确拒绝（权限 / 任务不可见），{@code detail} 是异常原文。 */
        REFUSED,
        /** 任务 id 不可用，无法置顶。 */
        NO_TASK,
        /** 当前 Android 版本没有这个入口（理论上不会发生）。 */
        UNAVAILABLE
    }

    static final class Result {
        final Outcome outcome;
        final String detail;

        Result(Outcome outcome, String detail) {
            this.outcome = outcome; this.detail = detail == null ? "" : detail;
        }

        boolean refused() { return outcome == Outcome.REFUSED || outcome == Outcome.UNAVAILABLE; }

        @Override public String toString() { return outcome + (detail.isEmpty() ? "" : "(" + detail + ")"); }
    }

    interface Callback { void complete(Result result); }

    private RearTaskRefront() {}

    /** 在工作线程上执行，回调切回调用方给定的线程（协调器用主线程）。 */
    static void moveToFront(Context context, int taskId, Callback callback) {
        if (taskId <= 0) { callback.complete(new Result(Outcome.NO_TASK, "taskId=" + taskId)); return; }
        Context app = context.getApplicationContext();
        WORKER.execute(() -> callback.complete(run(app, taskId)));
    }

    /** 同步执行，给已经在线程上的调用方用。 */
    static Result moveToFrontNow(Context context, int taskId) {
        if (taskId <= 0) return new Result(Outcome.NO_TASK, "taskId=" + taskId);
        return run(context.getApplicationContext(), taskId);
    }

    private static Result run(Context context, int taskId) {
        try {
            ActivityManager manager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
            if (manager == null) return new Result(Outcome.UNAVAILABLE, "no ActivityManager");
            manager.moveTaskToFront(taskId, 0);
            return new Result(Outcome.MOVED, "task=" + taskId);
        } catch (SecurityException denied) {
            // 典型：HyperOS 在锁定/显示睡眠时拒绝把非前台任务提到前台。
            return new Result(Outcome.REFUSED, "SecurityException: " + message(denied));
        } catch (IllegalStateException | IllegalArgumentException invalid) {
            return new Result(Outcome.REFUSED, invalid.getClass().getSimpleName() + ": " + message(invalid));
        } catch (RuntimeException error) {
            return new Result(Outcome.UNAVAILABLE, error.getClass().getSimpleName() + ": " + message(error));
        }
    }

    private static String message(Throwable error) {
        String text = error.getMessage();
        return text == null || text.isEmpty() ? error.getClass().getSimpleName() : text;
    }
}
