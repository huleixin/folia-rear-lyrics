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
    /**
     * 最近一次租约结束的原因。
     *
     * <p>「背屏为什么灭」的一半答案在这里：是客户端主动 release、还是 60 秒到期没人续、
     * 到期时已经续了几次。没有这一项，诊断只能看到 {@code lease=none}，无法区分
     * 「用户关了歌词」和「续租链路断了」。
     */
    private String lastEnd = "";

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
     * @param presence 三值窗口证据：PRESENT / ABSENT / UNKNOWN。UNKNOWN 只在本帧内保守保持
     *                 （避免锁屏瞬间黑一下），<b>不</b>参与续租（见 {@link RearWindowRenewPolicy}）。
     * @param ownActivityOnTop 本应用界面是否就在该背屏最前（独立的第二条正向证据）。
     */
    synchronized boolean holdsWindow(int id, String pkg, String activity,
                                    WindowTreeProbe.Presence presence, boolean ownActivityOnTop, long now) {
        if (!holds(id, now)) return false;
        if (RearBridgeContract.PACKAGE.equals(pkg) && RearBridgeContract.ACTIVITY.equals(activity)) return true;
        // A camera is never overridden, even with our window still attached underneath.
        if (RearBridgeContract.isCameraPackage(pkg)) return false;
        if (ownActivityOnTop) return true;
        if (RearBridgeContract.isSystemOverlay(pkg) || pkg == null || pkg.isEmpty()) {
            // 确定没有我们的窗口时不再压制休眠；PRESENT/UNKNOWN 都保守保持。
            return presence != WindowTreeProbe.Presence.ABSENT;
        }
        // Another app is genuinely in front on the rear display: it owns the panel now.
        return false;
    }

    /**
     * Extends the lease on evidence of a live rear window; never past MAX_WINDOW_RENEWALS.
     *
     * <p>v1.3.59 只在「距到期不足 {@code WINDOW_RENEW_MS / 2}」时接受续租，而续租循环也是每
     * {@code WINDOW_RENEW_MS / 2} 一跳 —— 一次 60 秒的租约里<b>只有一次</b>续租机会。那一次
     * 探测恰好落在 Activity 重排的空档（窗口短暂 detach）就已经足够让整段锁屏再也亮不起来。
     * 现在改为：每个带正向证据的 tick 都续租，仍然受 {@link #MAX_WINDOW_RENEWALS} 硬上限约束
     * （240 次 × 15 秒 ≈ 60 分钟，与上限的原意一致）。这样单次探测失手不再致命，
     * 也没有引入任何新的保活机制或唤醒源。
     */
    synchronized boolean renewForWindow(int id, long now) {
        if (id <= 0 || id != display || windowRenewals >= MAX_WINDOW_RENEWALS) return false;
        if (now >= until) return false; // 已过期：不偷偷复活，让 expire() 正常收尾。
        windowRenewals++;
        until = now + TIMEOUT_MS;
        return true;
    }

    synchronized int displayId() { return display; }
    synchronized int windowRenewals() { return windowRenewals; }
    synchronized String sessionToken() { return session; }

    synchronized boolean release(int id, String token) {
        if (id != display || !session.equals(token)) return false;
        clearWith("release by client after " + windowRenewals + " renewals");
        return true;
    }

    synchronized int clear() { return clearWith("cleared"); }

    /** 到期即清理，语义与 v1.3.59 一致：过期的租约不能靠定时器自己续命。 */
    synchronized int expire(long now) {
        return display > 0 && now >= until
            ? clearWith("expired after " + windowRenewals + " renewals") : -1;
    }

    private int clearWith(String reason) {
        int old = display;
        if (old > 0) lastEnd = reason;
        display = -1; session = ""; until = 0; windowRenewals = 0;
        return old;
    }

    synchronized String lastEnd() { return lastEnd; }

    synchronized long remaining(long now) { return display > 0 ? Math.max(0, until - now) : 0; }

    /** Diagnostic snapshot; the session is a random UUID, so a prefix carries no user data. */
    synchronized String describe() {
        if (display <= 0) return "lease=none";
        return "lease=display" + display
            + ", session=" + session.substring(0, Math.min(8, session.length())) + "…"
            + ", remainingMs=" + Math.max(0, until - SystemClock.elapsedRealtime())
            + ", windowRenewals=" + windowRenewals
            + (lastEnd.isEmpty() ? "" : ", lastEnd=" + lastEnd);
    }
}
