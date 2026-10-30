package io.github.huleixin.tingyu.lsp;

import android.app.ActivityOptions;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Point;
import android.hardware.display.DisplayManager;
import android.os.Binder;
import android.os.Bundle;
import android.os.Parcel;
import android.os.RemoteException;
import android.os.SystemClock;
import android.os.UserHandle;
import android.view.Display;
import android.view.InputEvent;
import android.view.KeyEvent;
import java.lang.reflect.Method;
import java.util.List;

// android/app/src/main/java/io/github/huleixin/tingyu/lsp/SystemRearBinder.java
/** Fixed rear operations under system identity; never spawn a shell in system_server. */
final class SystemRearBinder extends Binder {
    private final Context context;
    private final RearDisplayPower power;
    private volatile android.os.IBinder client;
    private volatile int overriddenDisplay = -1;
    SystemRearBinder(Context context, RearDisplayPower power) {
        this.context = context; this.power = power; attachInterface(null, RearBridgeContract.DESCRIPTOR);
    }

    synchronized void watchClient(android.os.IBinder lifeline, android.os.Handler handler) throws RemoteException {
        if (lifeline == null || lifeline.equals(client)) return;
        client = lifeline;
        lifeline.linkToDeath(() -> handler.post(() -> {
            synchronized (SystemRearBinder.this) {
                if (!lifeline.equals(client)) return;
                client = null;
                power.clear();
                int display = overriddenDisplay;
                if (display <= 0) return;
                try { requireRear(display, false); execute(5, display, "cleanup", -1, 0); }
                catch (Exception ignored) { /* An unavailable ROM API must not crash system_server. */ }
            }
        }), 0);
    }

    String profile() {
        return "LSP bridge v" + RearBridgeContract.VERSION + " · " + android.os.Build.MANUFACTURER
            + " / " + android.os.Build.DEVICE + " · Android API " + android.os.Build.VERSION.SDK_INT
            + " · " + power.status() + " · ROM behavior requires device verification";
    }
    @Override protected boolean onTransact(int code, Parcel data, Parcel reply, int flags) throws RemoteException {
        if (code < FIRST_CALL_TRANSACTION || code > RearBridgeContract.LOG_SNAPSHOT)
            return super.onTransact(code, data, reply, flags);
        data.enforceInterface(RearBridgeContract.DESCRIPTOR);
        int uid = Binder.getCallingUid();
        // UID lookup uses the caller's user, so another profile cannot act on the owner's lyrics.
        try {
            Context callerContext = (Context) Context.class.getMethod("createContextAsUser", UserHandle.class, int.class)
                .invoke(context, UserHandle.class.getMethod("of", int.class).invoke(null, uid / 100000), 0);
            if (callerContext.getPackageManager().getApplicationInfo(RearBridgeContract.PACKAGE, 0).uid != uid)
                throw new SecurityException("Only Tingyu may control its rear activity");
        } catch (Exception error) { throw new SecurityException("Untrusted rear bridge caller", error); }
        int display = data.readInt(); String session = data.readString(); int task = data.readInt();
        long identity = Binder.clearCallingIdentity();
        try {
            if (!RearBridgeContract.validSession(session)) throw new IllegalArgumentException("Invalid lyric session");
            if (code != RearBridgeContract.LOG_SNAPSHOT) requireRear(display, code == FIRST_CALL_TRANSACTION);
            String result = execute(code - FIRST_CALL_TRANSACTION, display, session, task, uid / 100000);
            reply.writeNoException(); reply.writeInt(0); reply.writeString(result);
        } catch (Throwable error) {
            // A missing OEM method fails this operation, never a system boot or unrelated activity.
            Throwable cause = error.getCause() == null ? error : error.getCause();
            reply.writeNoException(); reply.writeInt(1); reply.writeString("LSP operation unavailable: " + cause);
        } finally { Binder.restoreCallingIdentity(identity); }
        return true;
    }
    private void requireRear(int id, boolean launch) {
        if (id == 0 && launch) return; // Existing transparent migration fallback only.
        DisplayManager manager = context.getSystemService(DisplayManager.class);
        Display display = manager == null ? null : manager.getDisplay(id);
        if (id <= 0 || display == null) throw new SecurityException("Not a rear display");
        Point size = new Point(); display.getRealSize(size);
        if (!RearBridgeContract.isRearSize(size.x, size.y)) throw new SecurityException("Unrecognized rear display geometry");
    }
    private String execute(int operation, int display, String session, int task, int user) throws Exception {
        if (operation == 8) {
            // Deliberately unsupported: forking logcat from system_server is not worth the risk.
            return "unavailable: LSP mode does not collect system logs";
        }
        if (operation == 6 || operation == 7) {
            synchronized (this) {
                if (operation == 6) {
                    if (client == null || !client.isBinderAlive()) throw new IllegalStateException("Player process disconnected");
                    power.acquire(display, session);
                } else power.release(display, session);
            }
            return (operation == 6 ? "Rear bright policy leased for 60s; " : "Matching rear bright policy released; ") + power.status();
        }
        if (operation == 0) {
            Intent intent = new Intent().setComponent(new ComponentName(RearBridgeContract.PACKAGE, RearBridgeContract.ACTIVITY))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK).putExtra("folia_rear_session", session);
            ActivityOptions options = ActivityOptions.makeBasic().setLaunchDisplayId(display);
            UserHandle handle = (UserHandle) UserHandle.class.getMethod("of", int.class).invoke(null, user);
            Context.class.getMethod("startActivityAsUser", Intent.class, Bundle.class, UserHandle.class)
                .invoke(context, intent, options.toBundle(), handle);
            return "LSP rear launch requested; visibility must be confirmed by app";
        }
        if (operation == 1 || operation == 3) {
            Object atm = Class.forName("android.app.ActivityTaskManager").getMethod("getService").invoke(null);
            Class<?> api = Class.forName("android.app.IActivityTaskManager");
            if (operation == 3) {
                List<?> roots = (List<?>) api.getMethod("getAllRootTaskInfosOnDisplay", int.class).invoke(atm, display);
                return RearTaskMetadata.front(roots);
            }
            List<?> roots = (List<?>) api.getMethod("getAllRootTaskInfos").invoke(atm);
            int ownRoot = RearTaskMetadata.ownedRoot(roots, task, user);
            api.getMethod("moveRootTaskToDisplay", int.class, int.class).invoke(atm, ownRoot, display);
            return "LSP moved own rear task, root=" + ownRoot + ", task=" + task;
        }

        if (operation == 2) {
            Class<?> type = Class.forName("android.hardware.input.InputManagerGlobal");
            Object manager = type.getMethod("getInstance").invoke(null);
            Method inject = type.getMethod("injectInputEvent", InputEvent.class, int.class);
            Method setDisplay = InputEvent.class.getMethod("setDisplayId", int.class);
            long time = SystemClock.uptimeMillis();
            for (int action : new int[] { KeyEvent.ACTION_DOWN, KeyEvent.ACTION_UP }) {
                KeyEvent event = new KeyEvent(time, time, action, KeyEvent.KEYCODE_WAKEUP, 0);
                setDisplay.invoke(event, display);
                if (!Boolean.TRUE.equals(inject.invoke(manager, event, 0))) throw new IllegalStateException("Rear input rejected");
            }
            return "LSP rear wake requested";
        }
        // Same per-display override as Android's cmd display power-off / power-reset.
        Class<?> sm = Class.forName("android.os.ServiceManager");
        Object binder = sm.getMethod("getService", String.class).invoke(null, "display");
        Object dm = Class.forName("android.hardware.display.IDisplayManager$Stub")
            .getMethod("asInterface", android.os.IBinder.class).invoke(null, binder);
        Object result = Class.forName("android.hardware.display.IDisplayManager")
            .getMethod("requestDisplayPower", int.class, int.class)
            .invoke(dm, display, operation == 4 ? Display.STATE_OFF : Display.STATE_UNKNOWN);
        // AOSP returns false when the physical panel already matches the requested policy.
        // Reset is idempotent; an already-off rear also counts as a successful sleep request.
        if (!Boolean.TRUE.equals(result) && operation != 5
                && context.getSystemService(DisplayManager.class).getDisplay(display).getState() != Display.STATE_OFF)
            throw new IllegalStateException("Rear power override rejected");
        overriddenDisplay = operation == 4 ? display : -1;
        return "LSP rear power policy updated";
    }
}
