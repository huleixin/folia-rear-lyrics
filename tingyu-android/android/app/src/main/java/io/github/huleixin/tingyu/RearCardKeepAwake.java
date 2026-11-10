package io.github.huleixin.tingyu;

import android.content.Context;
import android.os.IBinder;
import android.os.Parcel;
import android.os.SystemClock;
import io.github.huleixin.tingyu.lsp.RearBridgeContract;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// android/app/src/main/java/io/github/huleixin/tingyu/RearCardKeepAwake.java
// Native card receipts, never the foreground WebView clock, renew a short rear-only power lease.
final class RearCardKeepAwake {
    private static final ExecutorService IO = Executors.newSingleThreadExecutor();
    private static volatile boolean active;
    private static volatile long activeUntil;
    private static volatile String detail = "";
    private static String desiredSession = "";
    private static int desiredDisplay = -1;
    private static long lastSent, revision;
    private static IBinder heldService;
    private static String heldSession = "";
    private static int heldDisplay = -1;

    static boolean requested(Context context) { return context.getSharedPreferences("rear-card", 0).getBoolean("keep-awake", false); }
    static boolean active() { return active && SystemClock.elapsedRealtime() < activeUntil; }
    static String detail() { return detail; }

    /** Called on native host events and its existing probe heartbeat; no new app polling loop. */
    static synchronized void sync(Context context, String session, int display, boolean eligible) {
        boolean wanted = requested(context) && LspRearBridge.selected(context) && eligible && display > 0;
        String next = wanted ? session : "";
        long now = SystemClock.elapsedRealtime();
        if (next.equals(desiredSession) && (!wanted || display == desiredDisplay && now - lastSent < 4000)) return;
        desiredSession = next; desiredDisplay = wanted ? display : -1; lastSent = now;
        final long generation = ++revision;
        final int target = desiredDisplay;
        final IBinder service = LspRearBridge.get();
        IO.execute(() -> apply(generation, next, target, service));
    }

    static synchronized void release() {
        desiredSession = ""; desiredDisplay = -1; active = false;
        final long generation = ++revision;
        IO.execute(() -> apply(generation, "", -1, null));
    }

    private static void apply(long generation, String session, int display, IBinder service) {
        synchronized (RearCardKeepAwake.class) { if (generation != revision) return; }
        if (!heldSession.isEmpty() && (!heldSession.equals(session) || heldDisplay != display || heldService != service)) {
            transact(heldService, RearBridgeContract.RELEASE_POWER, heldSession, heldDisplay);
            heldSession = ""; heldDisplay = -1; heldService = null; active = false;
        }
        if (session.isEmpty()) return;
        if (transact(service, RearBridgeContract.HOLD_CARD_POWER, session, display)) {
            heldService = service; heldSession = session; heldDisplay = display;
            synchronized (RearCardKeepAwake.class) { active = generation == revision; activeUntil = SystemClock.elapsedRealtime() + 12_000; }
        } else active = false;
    }

    private static boolean transact(IBinder binder, int code, String session, int display) {
        Parcel data = Parcel.obtain(), reply = Parcel.obtain();
        try {
            if (binder == null || !binder.isBinderAlive()) throw new IllegalStateException("Enable the system framework scope and reboot");
            data.writeInterfaceToken(RearBridgeContract.DESCRIPTOR);
            data.writeInt(display); data.writeString(session); data.writeInt(-1);
            if (!binder.transact(code, data, reply, 0)) throw new IllegalStateException("Update the LSP module and reboot");
            reply.readException(); boolean ok = reply.readInt() == 0; detail = reply.readString(); return ok;
        } catch (Exception error) { detail = error.getMessage(); return false; }
        finally { data.recycle(); reply.recycle(); }
    }
}
