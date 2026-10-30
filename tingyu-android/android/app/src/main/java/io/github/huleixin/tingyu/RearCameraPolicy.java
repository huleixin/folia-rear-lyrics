package io.github.huleixin.tingyu;

import java.util.Locale;
import java.util.HashSet;
import java.util.Set;

// android/app/src/main/java/io/github/huleixin/tingyu/RearCameraPolicy.java
/**
 * Camera switching and exit are asymmetric: a lens switch often closes one camera before
 * opening the next (short gap), but HyperCamera keeps owning the rear task long after both
 * camera handles close (long tail). Entering the camera block settles quickly; leaving it
 * waits much longer and additionally requires rear-task confirmation from the coordinator.
 *
 * [episode] increments on every device-idle-to-device-busy edge. Scheduled resume
 * confirmations carry the episode they were created for; a late callback from an older
 * camera session can never release a newer one (same rule as Mi Back Screen's Lend ids).
 */
final class RearCameraPolicy {
    /** Lens-switch gap: one camera closes before the next opens. */
    static final long ENTER_SETTLE_MS = 900;
    /** HyperCamera holds the rear task after closing; resume no earlier than this. */
    static final long EXIT_SETTLE_MS = 2500;
    /** Device idle but the camera task still owns the rear display this long: report, never force. */
    static final long STUCK_REPORT_MS = 12_000;
    /**
     * The rear task list can be unreadable (Shizuku not bound yet, protected tasks on newer
     * releases). Task evidence must never pin the display forever: after this long without a
     * single successful read, the task-based hold is dropped and only device availability
     * decides. Never the other way round - an already-proven camera task is kept.
     */
    static final long EVIDENCE_STALE_MS = 8_000;

    private final Set<String> unavailable = new HashSet<>();
    private boolean running;
    private long readyAt;
    private long episode;
    private long lastBusyAt;

    /**
     * Registering the availability callback is not a camera event. Nothing is busy at start,
     * so [readyAt] stays 0: seeding it with ENTER_SETTLE_MS made blocked() report true for the
     * first 900ms of every enable(), which the coordinator read as "a camera just took over"
     * and used to abort the launch.
     */
    void start(long now) { running = true; unavailable.clear(); readyAt = 0; }
    void stop() { running = false; unavailable.clear(); readyAt = 0; }

    void available(String id, boolean available, long now) {
        if (!running) return;
        boolean wasDeviceBusy = !unavailable.isEmpty();
        if (available) unavailable.remove(id); else unavailable.add(id);
        boolean isDeviceBusy = !unavailable.isEmpty();
        if (isDeviceBusy) {
            if (!wasDeviceBusy) episode++;
            lastBusyAt = now;
            readyAt = now + ENTER_SETTLE_MS;
        } else if (wasDeviceBusy) {
            // The last camera handle closed: the long exit tail starts here. Late duplicate
            // idle events while already idle must never postpone the resume.
            readyAt = now + EXIT_SETTLE_MS;
        }
    }

    boolean blocked(long now) { return running && (!unavailable.isEmpty() || now < readyAt); }
    int busyCount() { return unavailable.size(); }
    /** Monotonic token of the current (or just-ended) camera session. */
    long episodeId() { return episode; }
    /** Milliseconds since the last camera-device activity; -1 while blocked or never busy. */
    long idleFor(long now) { return blocked(now) || lastBusyAt == 0 ? -1 : now - lastBusyAt; }
    long remaining(long now) { return running && unavailable.isEmpty() ? Math.max(0, readyAt - now) : 0; }

    /** True once task-list evidence has gone unreadable for too long to be trusted. */
    static boolean evidenceStale(long lastReadAt, long now) {
        return lastReadAt <= 0 || now - lastReadAt > EVIDENCE_STALE_MS;
    }

    /**
     * Rear-display front task says a camera is showing there even when every camera handle
     * looks free (HyperCamera opens its rear preview before/without holding the sensors).
     * Any package whose name mentions camera counts; the failure direction is safe (yield).
     */
    static boolean isCameraTask(String component) {
        if (component == null) return false;
        String normalized = component.toLowerCase(Locale.ROOT);
        int slash = normalized.indexOf('/');
        String pkg = slash >= 0 ? normalized.substring(0, slash) : normalized;
        return pkg.contains("camera") && !pkg.startsWith("io.github.huleixin");
    }
}
