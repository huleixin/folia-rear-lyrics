package io.github.huleixin.tingyu;

import java.util.HashSet;
import java.util.Set;

// android/app/src/main/java/io/github/huleixin/tingyu/RearCameraPolicy.java
/** Camera switches often close one lens before opening the next; resume only after settling. */
final class RearCameraPolicy {
    static final long SETTLE_MS = 900;
    private final Set<String> unavailable = new HashSet<>();
    private boolean running;
    private long readyAt;

    void start(long now) { running = true; unavailable.clear(); readyAt = now + SETTLE_MS; }
    void stop() { running = false; unavailable.clear(); readyAt = 0; }
    void available(String id, boolean available, long now) {
        if (!running) return;
        if (available) { if (unavailable.remove(id)) readyAt = now + SETTLE_MS; }
        else { unavailable.add(id); readyAt = now + SETTLE_MS; }
    }
    boolean blocked(long now) { return running && (!unavailable.isEmpty() || now < readyAt); }
    int busyCount() { return unavailable.size(); }
    long remaining(long now) { return running && unavailable.isEmpty() ? Math.max(0, readyAt - now) : 0; }
}
