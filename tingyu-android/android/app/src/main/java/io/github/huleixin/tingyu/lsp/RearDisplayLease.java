package io.github.huleixin.tingyu.lsp;

// android/app/src/main/java/io/github/huleixin/tingyu/lsp/RearDisplayLease.java
/** A renewable, session-scoped rear-only lease. A crashed/stalled player cannot hold it forever. */
final class RearDisplayLease {
    static final long TIMEOUT_MS = 60_000;
    private int display = -1;
    private String session = "";
    private long until;
    synchronized int acquire(int id, String token, long now) {
        if (id <= 0 || !RearBridgeContract.validSession(token)) throw new IllegalArgumentException("Invalid rear lease");
        int previous = display;
        display = id; session = token; until = now + TIMEOUT_MS;
        return previous;
    }
    synchronized boolean holds(int id, long now) { return id > 0 && id == display && now < until; }
    synchronized boolean holdsWindow(int id, String pkg, String activity, long now) {
        return holds(id, now) && RearBridgeContract.PACKAGE.equals(pkg) && RearBridgeContract.ACTIVITY.equals(activity);
    }
    synchronized boolean release(int id, String token) {
        if (id != display || !session.equals(token)) return false;
        clear(); return true;
    }
    synchronized int clear() { int old = display; display = -1; session = ""; until = 0; return old; }
    synchronized int expire(long now) { return display > 0 && now >= until ? clear() : -1; }
    synchronized long remaining(long now) { return display > 0 ? Math.max(0, until - now) : 0; }
}
