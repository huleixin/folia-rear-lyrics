package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearHandoffState.java
/**
 * The single authority for rear-screen ownership during a camera handoff.
 *
 * <p>Before this class the coordinator kept six independent booleans ({@code cameraBusy},
 * {@code rearTaskCamera}, {@code cameraYielding}, {@code closing}, {@code sleeping},
 * {@code pending}) that were written by five different callers (availability callback, task
 * probe, activity lifecycle, power callback, launcher callback). Whoever wrote last won, so a
 * late callback from an old camera session could unblock a newer one, and a callback that
 * never arrived left the screen blocked forever. Two real failures came out of that:
 * the lyrics never came back after the camera closed (Fault A), and the lyrics kept fighting
 * the camera while it was opening (Fault B).
 *
 * <p>This class is deterministic and free of Android APIs: every method takes {@code now},
 * returns an {@link Action} for the caller to perform, and never calls back. Transitions are
 * therefore reproducible in a JVM unit test, and every state has a deadline so the machine can
 * never park itself.
 *
 * <pre>
 * SYSTEM_OWNED / TINGYU_ACTIVE
 *        |  camera evidence (device busy | camera task on the rear display | camera task on the main display)
 *        v
 *  CAMERA_TAKEOVER --(next tick)--> RELEASING --(release done | timeout)--> CAMERA_OWNED
 *                                                                             |
 *                                     camera device idle + no camera task     v
 *                                                              WAITING_CAMERA_EXIT
 *                                                                             |  exit confirmed
 *                                                                             v
 *                                                                     RESTORE_PENDING
 *                                                                             |  (backoff gate)
 *                                                                             v
 *                                                                   TINGYU_RESTORING
 *                                                              success -> TINGYU_ACTIVE
 *                                                              failure -> RESTORE_PENDING
 * </pre>
 *
 * <p>While the state is {@code CAMERA_TAKEOVER..WAITING_CAMERA_EXIT} the coordinator may not
 * launch, move, wake, sleep or lease anything. The camera has absolute priority: an unknown
 * state keeps the panel free for the camera.
 */
final class RearHandoffState {
    enum State {
        /** No lyric session; the system (or nothing) owns the rear display. */
        SYSTEM_OWNED,
        /** Our viewport is the visible rear task. */
        TINGYU_ACTIVE,
        /** Camera evidence seen; new rear operations are forbidden from this instant. */
        CAMERA_TAKEOVER,
        /** Hiding our window, dropping the power lease, restoring the panel policy. */
        RELEASING,
        /** The camera owns the panel; nothing of ours may touch it. */
        CAMERA_OWNED,
        /** Camera device idle but the rear task or the settle window still says camera. */
        WAITING_CAMERA_EXIT,
        /** Exit confirmed; waiting for the backoff gate before rebuilding the lyric session. */
        RESTORE_PENDING,
        /** A rebuild is in flight; carries an attempt id so stale callbacks can be dropped. */
        TINGYU_RESTORING
    }

    /** What the coordinator must do after {@link #evaluate}. Effects never run inside here. */
    enum Action { NONE, RELEASE, RESTORE }

    /**
     * Extra quiet time required after the camera device reports idle. The camera policy already
     * holds a 2.5s exit tail of its own; this covers the gap between the last camera handle and
     * HyperCamera's rear task actually leaving.
     */
    static final long EXIT_CONFIRM_MS = 800;
    /** Same, when the rear task list could not be read: wait longer, then act with a diagnostic. */
    static final long EXIT_CONFIRM_UNVERIFIED_MS = 4_000;
    /** A release that has not completed by now is retried, and eventually abandoned. */
    static final long RELEASE_TIMEOUT_MS = 3_500;
    static final int MAX_RELEASE_ATTEMPTS = 4;
    /** Fast retries before the restore falls back to a slow, non-hammering retry. */
    static final int MAX_FAST_RESTORE_ATTEMPTS = 4;
    static final long RESTORE_SLOW_RETRY_MS = 20_000;
    private static final long[] RESTORE_BACKOFF_MS = { 1_200, 3_000, 6_000, 12_000 };

    /** Inputs of one evaluation. Mutable and reused to keep the 350ms heartbeat allocation free. */
    static final class Observation {
        boolean wanted;
        boolean deviceBusy;
        boolean rearCameraTask;
        boolean mainCameraTask;
        boolean taskReadable;
        boolean windowVisible;
        boolean restoreInFlight;

        void set(boolean wanted, boolean deviceBusy, boolean rearCameraTask, boolean mainCameraTask,
                 boolean taskReadable, boolean windowVisible, boolean restoreInFlight) {
            this.wanted = wanted; this.deviceBusy = deviceBusy;
            this.rearCameraTask = rearCameraTask; this.mainCameraTask = mainCameraTask;
            this.taskReadable = taskReadable; this.windowVisible = windowVisible;
            this.restoreInFlight = restoreInFlight;
        }

        /**
         * A camera is using (or is about to use) the rear display. Three independent sources:
         * the camera device itself, a camera task on the rear display, a camera task in front on
         * the main display. Any single one suspends us - the failure direction must be "yield".
         */
        boolean camera() { return deviceBusy || rearCameraTask || mainCameraTask; }

        String describe() {
            return "deviceBusy=" + deviceBusy + ", rearTaskCamera=" + rearCameraTask
                + ", mainTaskCamera=" + mainCameraTask + ", readable=" + taskReadable
                + ", visible=" + windowVisible;
        }
    }

    private State state = State.SYSTEM_OWNED;
    private long episode, generation;
    private long exitSince, releaseDeadline, nextRestoreAt;
    private int releaseAttempts, restoreAttempts, cancelled, releaseFailures, restores;
    private String reason = "boot";

    State state() { return state; }
    long episode() { return episode; }
    long generation() { return generation; }
    int restoreAttempts() { return restoreAttempts; }
    int restores() { return restores; }
    int cancelled() { return cancelled; }
    int releaseFailures() { return releaseFailures; }
    String reason() { return reason; }
    long nextRestoreAt() { return nextRestoreAt; }

    boolean cameraOwned() {
        return state == State.CAMERA_TAKEOVER || state == State.RELEASING
            || state == State.CAMERA_OWNED || state == State.WAITING_CAMERA_EXIT;
    }
    boolean blocksPresentation() { return cameraOwned(); }
    boolean restoring() { return state == State.TINGYU_RESTORING; }
    boolean active() { return state == State.TINGYU_ACTIVE; }
    /** A lease may only be renewed while our viewport really owns the panel. */
    boolean allowsLease() { return state == State.TINGYU_ACTIVE; }
    boolean allowsSleep() { return state == State.TINGYU_ACTIVE; }
    boolean allowsWake() { return !cameraOwned(); }

    /**
     * Advances the machine and reports the single effect to perform. Idempotent: calling it
     * twice with the same observation never issues two launches (RESTORE requires
     * {@code !restoreInFlight} and moves the state to TINGYU_RESTORING immediately).
     */
    Action evaluate(Observation in, long now) {
        if (!in.wanted) {
            if (state != State.SYSTEM_OWNED) {
                if (state == State.TINGYU_RESTORING) cancelled++;
                state = State.SYSTEM_OWNED;
                generation++;
                restoreAttempts = 0; nextRestoreAt = 0; exitSince = 0; releaseAttempts = 0;
                reason = "user-disabled";
            }
            return Action.NONE;
        }
        boolean camera = in.camera();
        switch (state) {
            case SYSTEM_OWNED:
            case TINGYU_ACTIVE:
                if (camera) return takeOver(now, "camera-observed");
                state = in.windowVisible ? State.TINGYU_ACTIVE : State.SYSTEM_OWNED;
                return Action.NONE;
            case CAMERA_TAKEOVER:
                // The release was requested on the tick that entered this state; now wait for it.
                state = State.RELEASING;
                releaseDeadline = now + RELEASE_TIMEOUT_MS;
                return Action.NONE;
            case RELEASING:
                if (now < releaseDeadline) return Action.NONE;
                releaseAttempts++;
                if (releaseAttempts < MAX_RELEASE_ATTEMPTS) {
                    releaseDeadline = now + RELEASE_TIMEOUT_MS;
                    reason = "release-retry-" + releaseAttempts;
                    return Action.RELEASE;
                }
                // A stalled binder must not pin the panel forever. Commit to CAMERA_OWNED with a
                // diagnostic: presentation stays blocked while the camera is there, and the exit
                // path below can still hand the panel back.
                releaseFailures++;
                state = State.CAMERA_OWNED;
                exitSince = camera ? 0 : now;
                reason = "release-gave-up";
                return Action.NONE;
            case CAMERA_OWNED:
            case WAITING_CAMERA_EXIT:
                if (camera) {
                    if (state != State.CAMERA_OWNED) { state = State.CAMERA_OWNED; reason = "camera-returned"; }
                    exitSince = 0;
                    return Action.NONE;
                }
                if (exitSince == 0) {
                    exitSince = now; state = State.WAITING_CAMERA_EXIT;
                    reason = "camera-device-idle";
                    return Action.NONE;
                }
                long need = in.taskReadable ? EXIT_CONFIRM_MS : EXIT_CONFIRM_UNVERIFIED_MS;
                if (now - exitSince < need) { state = State.WAITING_CAMERA_EXIT; return Action.NONE; }
                exitSince = 0;
                state = State.RESTORE_PENDING;
                reason = in.taskReadable ? "exit-confirmed" : "exit-unverified";
                // fall through: the backoff gate decides whether to restore on this same tick.
            case RESTORE_PENDING:
                if (camera) return takeOver(now, "camera-returned-during-restore");
                if (in.restoreInFlight) return Action.NONE;
                if (now < nextRestoreAt) return Action.NONE;
                restoreAttempts++;
                generation++;
                state = State.TINGYU_RESTORING;
                reason = "restore-" + restoreAttempts;
                return Action.RESTORE;
            case TINGYU_RESTORING:
                if (camera) return takeOver(now, "camera-returned-during-restore");
                return Action.NONE;
            default:
                return Action.NONE;
        }
    }

    /** Called once the teardown (window + lease + power) finished, successfully or not. */
    void releaseFinished(boolean success, long now) {
        if (state != State.RELEASING && state != State.CAMERA_TAKEOVER) return;
        releaseAttempts = 0;
        if (!success) releaseFailures++;
        state = State.CAMERA_OWNED;
        exitSince = 0;
        reason = success ? "released" : "release-failed";
    }

    /** Called by the launcher when a rebuild attempt really ended (not when it was cancelled). */
    void restoreFinished(boolean success, long now) {
        if (state != State.TINGYU_RESTORING) return; // stale callback for an older attempt
        if (success) {
            state = State.TINGYU_ACTIVE;
            restoreAttempts = 0; nextRestoreAt = 0; restores++;
            reason = "restored";
            return;
        }
        state = State.RESTORE_PENDING;
        nextRestoreAt = now + backoff(restoreAttempts);
        reason = "restore-failed";
    }

    /** A lyric window was confirmed visible without a camera episode (first launch, wake). */
    void markActive() {
        if (state == State.CAMERA_TAKEOVER || state == State.RELEASING
            || state == State.CAMERA_OWNED || state == State.WAITING_CAMERA_EXIT) return;
        if (state != State.TINGYU_ACTIVE) reason = "active";
        state = State.TINGYU_ACTIVE;
        restoreAttempts = 0; nextRestoreAt = 0; exitSince = 0; releaseAttempts = 0;
    }

    /** The user turned the feature off, playback stopped, or the window was closed on purpose. */
    void markSystemOwned(String why) {
        if (state == State.TINGYU_RESTORING) cancelled++;
        state = State.SYSTEM_OWNED;
        generation++;
        restoreAttempts = 0; nextRestoreAt = 0; exitSince = 0; releaseAttempts = 0;
        reason = why;
    }

    static long backoff(int attempts) {
        if (attempts <= 0) return RESTORE_BACKOFF_MS[0];
        if (attempts >= MAX_FAST_RESTORE_ATTEMPTS) return RESTORE_SLOW_RETRY_MS;
        return RESTORE_BACKOFF_MS[Math.min(RESTORE_BACKOFF_MS.length - 1, attempts - 1)];
    }

    private Action takeOver(long now, String why) {
        episode++;
        generation++;
        if (state == State.TINGYU_RESTORING) cancelled++;
        state = State.CAMERA_TAKEOVER;
        releaseDeadline = now + RELEASE_TIMEOUT_MS;
        releaseAttempts = 0; restoreAttempts = 0; nextRestoreAt = 0; exitSince = 0;
        reason = why;
        return Action.RELEASE;
    }

    String describe(long now) {
        return "handoff=" + state.name() + ", cameraEpisode=" + episode
            + ", handoffGen=" + generation + ", restoreAttempts=" + restoreAttempts
            + ", restores=" + restores + ", cancelledAttempts=" + cancelled
            + ", releaseFailures=" + releaseFailures + ", releaseRetries=" + releaseAttempts
            + ", nextRestoreIn=" + (nextRestoreAt == 0 ? "-" : Math.max(0, nextRestoreAt - now) + "ms")
            + ", handoffReason=" + reason;
    }
}
