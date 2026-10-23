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
    static final int VERSION = 250;
    static final String DESCRIPTOR = "io.github.huleixin.tingyu.REAR_LYRICS_V2";
    static final int TRANSACTION_START = FIRST_CALL_TRANSACTION;
    static final int TRANSACTION_MOVE = FIRST_CALL_TRANSACTION + 1;
    static final int TRANSACTION_WAKE = FIRST_CALL_TRANSACTION + 2;
    static final int TRANSACTION_FRONT_TASK = FIRST_CALL_TRANSACTION + 3;
    static final int TRANSACTION_SLEEP = FIRST_CALL_TRANSACTION + 4;
    static final int TRANSACTION_RESTORE_POWER = FIRST_CALL_TRANSACTION + 5;
    private static final ExecutorService OUTPUT_READER = Executors.newCachedThreadPool();

    public ShellUserService() {
        attachInterface(null, DESCRIPTOR);
    }

    @Override
    protected boolean onTransact(int code, Parcel data, Parcel reply, int flags) throws RemoteException {
        // Shizuku's reserved destroy transaction is used when this service version changes.
        if (code == 16777115) { System.exit(0); return true; }
        if (code < TRANSACTION_START || code > TRANSACTION_RESTORE_POWER) return super.onTransact(code, data, reply, flags);
        data.enforceInterface(DESCRIPTOR);
        int displayId = data.readInt();
        String session = data.readString();
        int taskId = data.readInt();
        try {
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
            if (code == TRANSACTION_FRONT_TASK && process.exitValue() == 0) result = RearLyricsTaskList.front(result, displayId);
            reply.writeNoException();
            reply.writeInt(process.exitValue());
            reply.writeString(result);
            return true;
        } catch (Exception error) {
            throw new RemoteException(error.getMessage());
        }
    }
}
