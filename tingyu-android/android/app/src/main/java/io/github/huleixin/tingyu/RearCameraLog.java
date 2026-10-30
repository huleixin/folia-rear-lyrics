package io.github.huleixin.tingyu;

import android.content.Context;
import android.os.IBinder;
import android.os.Parcel;
import android.os.SystemClock;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

// android/app/src/main/java/io/github/huleixin/tingyu/RearCameraLog.java
/**
 * Bounded, filtered system-log snapshot for the one question the app cannot answer by itself:
 * did the camera <em>finish</em> or <em>crash</em>?
 *
 * <p>Only camera / activity-task / window / display tags are read, no screen content, no
 * filenames and no media metadata, and only a fixed number of snapshots per process. The
 * snapshot is taken when a camera session ends suspiciously fast (it may have been dismissed),
 * when the camera device stays busy with no visible camera task, and when a rebuild keeps
 * failing - the three cases where "the lyrics did not come back" needs an external reason.
 *
 * <p>Only the Shizuku backend collects this: the LSP module lives inside system_server and must
 * never spawn a process there, so under LSP the snapshot is reported as unavailable instead.
 */
final class RearCameraLog {
    private static final ExecutorService WORKER = Executors.newSingleThreadExecutor();
    private static final int MAX_LINES = 200;
    private static final int MAX_CHARS = 14_000;
    private static final int MAX_PER_PROCESS = 4;
    private static final long MIN_INTERVAL_MS = 60_000;
    private static volatile String last = "not captured";
    private static long lastAt;
    private static int taken;

    private RearCameraLog() {}

    static String last() { return last; }

    static void capture(Context context, IBinder shell, String reason) {
        long now = SystemClock.elapsedRealtime();
        synchronized (RearCameraLog.class) {
            if (taken >= MAX_PER_PROCESS || now - lastAt < MIN_INTERVAL_MS) return;
            lastAt = now; taken++;
        }
        last = reason + ": snapshot requested";
        WORKER.execute(() -> {
            String text;
            if (LspRearBridge.selected(context)) {
                text = "unavailable: LSP mode never spawns a process inside system_server";
            } else if (shell == null || !shell.isBinderAlive()) {
                text = "unavailable: Shizuku 服务未连接";
            } else text = read(shell);
            String stamped = reason + " @" + (now / 1000) + "s\n" + text;
            last = stamped;
            context.getSharedPreferences("rear_lyrics", 0).edit().putString("camera_log", stamped).apply();
            RearLyricsTrace.record(context, "camera-log", reason + " → " + (text.startsWith("unavailable") ? text : text.split("\n").length + " lines"));
        });
    }

    private static String read(IBinder shell) {
        Parcel data = Parcel.obtain(), reply = Parcel.obtain();
        try {
            data.writeInterfaceToken(ShellUserService.DESCRIPTOR);
            data.writeInt(0); data.writeString("camera-log"); data.writeInt(-1);
            if (!shell.transact(ShellUserService.TRANSACTION_LOG_SNAPSHOT, data, reply, 0)) return "unavailable: 旧版背屏服务，重启 Shizuku 后重试";
            reply.readException();
            int code = reply.readInt();
            String output = reply.readString();
            if (code != 0) return "unavailable: " + output;
            return output == null || output.trim().isEmpty() ? "empty: no camera/window entries in the last 400 lines" : output;
        } catch (Throwable error) {
            return "failed: " + error;
        } finally {
            data.recycle(); reply.recycle();
        }
    }

    /** Reads a bounded logcat dump; called inside the shell user service process. */
    static String snapshot() {
        String[] command = { "/system/bin/logcat", "-d", "-t", "400", "-v", "time", "-s",
            "CameraService", "Camera2Client", "Camera3Device", "CameraDevice",
            "ActivityTaskManager", "WindowManager", "DisplayManager", "AndroidRuntime" };
        Process process = null;
        try {
            process = new ProcessBuilder(command).redirectErrorStream(true).start();
            StringBuilder text = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                String line;
                int lines = 0;
                while ((line = reader.readLine()) != null && lines < MAX_LINES && text.length() < MAX_CHARS) {
                    text.append(line).append('\n');
                    lines++;
                }
            }
            process.waitFor(3, TimeUnit.SECONDS);
            return text.toString().trim();
        } catch (Exception error) {
            return "failed: " + error.getMessage();
        } finally {
            if (process != null) process.destroy();
        }
    }
}
