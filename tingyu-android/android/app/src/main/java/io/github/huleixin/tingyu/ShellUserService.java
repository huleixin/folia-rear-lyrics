package io.github.huleixin.tingyu;

import android.os.Binder;
import android.os.Parcel;
import android.os.RemoteException;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

/** Starts, moves and wakes only Folia's lyrics window through the Shizuku shell process. */
public final class ShellUserService extends Binder {
    static final int VERSION = 253;
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
    /** HyperOS rear-screen sleep timeout; observed only, never written since 1.3.59. */
    static final String SUBSYSTEM_TIMEOUT_SETTING = "subscreen_display_time";
    private static final ExecutorService OUTPUT_READER = Executors.newCachedThreadPool();

    public ShellUserService() {
        attachInterface(null, DESCRIPTOR);
    }

    @Override
    protected boolean onTransact(int code, Parcel data, Parcel reply, int flags) throws RemoteException {
        // Shizuku's reserved destroy transaction is used when this service version changes.
        if (code == 16777115) { System.exit(0); return true; }
        if (code < TRANSACTION_START || (code > TRANSACTION_TIMEOUT_PUT_RETIRED && code != TRANSACTION_LOG_SNAPSHOT))
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
            String targetDisplay = Integer.toString(displayId);
            String[] command;
            if (code == TRANSACTION_START) {
                command = new String[] {"/system/bin/am", "start", "--user", "current", "--display", targetDisplay,
                    // am accepts numeric intent flags; --activity-new-task is not a valid shell option.
                    "-n", "io.github.huleixin.tingyu/.RearLyricsActivity", "-f", "0x10000000",
                    "--es", RearLyricsActivity.EXTRA_SESSION, session};
            } else if (code == TRANSACTION_MOVE) {
                if (taskId < 0 || displayId == 0) throw new IllegalArgumentException("Invalid rear task");
                command = new String[] {"/system/bin/am", "display", "move-stack", Integer.toString(taskId), targetDisplay};
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
            Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
            Future<String> output = OUTPUT_READER.submit((Callable<String>) () -> {
                StringBuilder text = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        if (text.length() < (code == TRANSACTION_FRONT_TASK ? 100000 : 3000)) text.append(line).append('\n');
                    }
                }
                return text.toString().trim();
            });
            if (!process.waitFor(10, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                throw new RemoteException("Timed out running am start on display " + targetDisplay);
            }
            String result = output.get(2, TimeUnit.SECONDS);
            // The whole listing is returned, not just the rear front: the app parses both the
            // rear and the main display from it (camera task on either one suspends the lyrics),
            // and parsing app-side keeps that logic unit-testable instead of living in the
            // Shizuku daemon.
            reply.writeNoException();
            reply.writeInt(process.exitValue());
            reply.writeString(result);
            return true;
        } catch (Exception error) {
            throw new RemoteException(error.getMessage());
        }
    }
}
