package io.github.huleixin.tingyu.lsp;

import android.os.SystemClock;

// android/app/src/main/java/io/github/huleixin/tingyu/lsp/RearDisplayLease.java
/** A renewable, session-scoped rear-only lease. A crashed/stalled player cannot hold it forever. */
final class RearDisplayLease {
    static final long TIMEOUT_MS = 60_000;
    /**
     * While a lyric window is still attached to the rear display the client cannot be gone -
     * the window manager would have removed the window with its process. HyperOS freezes
     * background processes once the main display locks, so the client's periodic renew IPC
     * simply stops arriving and the lease used to lapse one minute into a locked screen,
     * which is exactly when the rear panel fell asleep. Renewing on the window's behalf fixes
     * that without weakening the crash guarantee: the absolute cap below still applies.
     */
    static final long WINDOW_RENEW_MS = 30_000;
    /**
     * 240 renewals ≈ 60 minutes. The old cap of 30 stopped renewing after ~7 minutes, which is
     * shorter than a normal locked listening session: the lease lapsed, the bright override
     * stopped being applied and the rear panel fell asleep mid-album even though the window was
     * still attached. The window itself is the crash guarantee (a dead client's window is
     * removed with its process), so a longer cap does not weaken it.
     */
    static final int MAX_WINDOW_RENEWALS = 240;
    private int display = -1;
    private String session = "";
    private long until;
    private int windowRenewals;

    synchronized int acquire(int id, String token, long now) {
        if (id <= 0 || !RearBridgeContract.validSession(token)) throw new IllegalArgumentException("Invalid rear lease");
        int previous = display;
        display = id; session = token; until = now + TIMEOUT_MS; windowRenewals = 0;
        return previous;
    }
    synchronized boolean holds(int id, long now) { return id > 0 && id == display && now < until; }
    /**
     * Sleep must be refused when the leased panel still carries our window, even if something
     * legitimate moved above it. Locking the main display pushes the keyguard to the top of
     * every other display; requiring our activity to stay topmost made the lease a no-op at
     * exactly the moment it was needed.
     *
     * [ownWindowPresent] is three-valued: TRUE/FALSE when the window list was readable and
     * null when reflection failed. Unreadable stays conservative (keep the panel behind a
     * keyguard layer) but still yields to any camera and to any third-party app.
     */
    synchronized boolean holdsWindow(int id, String pkg, String activity, Boolean ownWindowPresent, long now) {
        if (!holds(id, now)) return false;
        if (RearBridgeContract.PACKAGE.equals(pkg) && RearBridgeContract.ACTIVITY.equals(activity)) return true;
        // A camera is never overridden, even with our window still attached underneath.
        if (RearBridgeContract.isCameraPackage(pkg)) return false;
        if (RearBridgeContract.isSystemOverlay(pkg) || pkg.isEmpty()) return !Boolean.FALSE.equals(ownWindowPresent);
        // Another app is genuinely in front on the rear display: it owns the panel now.
        return false;
    }
    /** Extends the lease on evidence of a live rear window; never past MAX_WINDOW_RENEWALS. */
    synchronized boolean renewForWindow(int id, long now) {
        if (id <= 0 || id != display || windowRenewals >= MAX_WINDOW_RENEWALS) return false;
        if (now < until - WINDOW_RENEW_MS / 2) return false;
        windowRenewals++;
        until = now + TIMEOUT_MS;
        return true;
    }
    synchronized int displayId() { return display; }
    synchronized int windowRenewals() { return windowRenewals; }
    synchronized boolean release(int id, String token) {
        if (id != display || !session.equals(token)) return false;
        clear(); return true;
    }
    synchronized int clear() { int old = display; display = -1; session = ""; until = 0; windowRenewals = 0; return old; }
    synchronized int expire(long now) { return display > 0 && now >= until ? clear() : -1; }
    synchronized long remaining(long now) { return display > 0 ? Math.max(0, until - now) : 0; }
    /** Diagnostic snapshot; the session is a random UUID, so a prefix carries no user data. */
    synchronized String describe() { return display <= 0 ? "lease=none" : "lease=display" + display
        + ", session=" + session.substring(0, Math.min(8, session.length())) + "…"
        + ", remainingMs=" + Math.max(0, until - SystemClock.elapsedRealtime())
        + ", windowRenewals=" + windowRenewals; }
}
