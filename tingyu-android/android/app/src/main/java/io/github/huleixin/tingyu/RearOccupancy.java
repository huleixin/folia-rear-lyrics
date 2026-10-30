package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearOccupancy.java
/**
 * Who owns the rear display, and what the coordinator may do about it. Pure logic: no Android
 * API, no callbacks, every decision takes {@code now}.
 *
 * <p>This replaces two overlapping models the app grew over several revisions -
 * {@code RearHandoffState} (8 states, driven by three independent camera signals) and
 * {@code RearOwnershipState} (6 states, derived from coordinator flags). Both are kept for the
 * legacy engine while this one is being verified on a device.
 *
 * <p>Rules, each traceable to a real failure or a verified open-source implementation:
 *
 * <ul>
 *   <li><b>One witness.</b> Ownership is decided from the rear display's front task only.
 *       CameraManager availability is not consulted: a lens switch flips it for ~900 ms and
 *       used to cause a yield/restore cycle that destroyed and rebuilt the lyric window.
 *       (Mi Back Screen, MIT: {@code LendWatchdog} reads {@code am stack list} and nothing else.)</li>
 *   <li><b>Unreadable is not free.</b> A listing that could not be parsed never ends an
 *       external owner. (Same source: {@code LendMisses.inFront} returns null, which "counts for
 *       nothing".)</li>
 *   <li><b>Two looks to leave.</b> One miss has been observed with the rear task missing from
 *       the dump entirely; two consecutive looks are required before the panel is taken back.</li>
 *   <li><b>Idempotent.</b> One YIELD per camera episode, one RESTORE per episode, and a stale
 *       generation can never report a result for a newer attempt.</li>
 *   <li><b>Dismissed means dismissed.</b> After the user closes the window, this machine never
 *       issues RESTORE or WAKE again until {@link #setDismissed(boolean) dismissed=false}.</li>
 *   <li><b>Throttled wake.</b> A wake lights the panel for seconds; a second one within
 *       {@link #WAKE_MIN_GAP_MS} is refused (Mi Back Screen {@code WakeThrottle}).</li>
 * </ul>
 */
final class RearOccupancy {
    enum Owner {
        /** Xiaomi's own rear screen, or nothing of ours is up. */
        SYSTEM,
        /** Our lyric window is the rear front task. */
        TINGYU,
        /** Another app (a camera) owns the panel. Nothing of ours may present, wake or lease. */
        EXTERNAL,
        /** The user closed the rear window on purpose. Stay away until they ask again. */
        DISMISSED
    }

    /** The single effect the coordinator may perform for one look. */
    enum Action { NONE, YIELD, RESTORE, WAKE }

    /** Consecutive readable looks without the external app before the panel is taken back. */
    static final int RETURN_LOOKS_TO_RESTORE = 2;
    /** A wake lights the panel for roughly 16 s; bursts are what keeps it awake for nothing. */
    static final long WAKE_MIN_GAP_MS = 10_000L;
    private static final long[] RESTORE_BACKOFF_MS = { 1_200, 3_000, 6_000, 12_000 };
    private static final long RESTORE_SLOW_MS = 20_000;

    /** One observation of the rear display. Mutable and reused: this runs on a 1-2 s heartbeat. */
    static final class Look {
        boolean wanted;
        boolean readable;
        boolean ownFront;
        boolean panelLit;
        String frontPackage;
        int frontTaskId;
        long now;

        void set(boolean wanted, boolean readable, String frontPackage, int frontTaskId,
                 boolean ownFront, boolean panelLit, long now) {
            this.wanted = wanted; this.readable = readable;
            this.frontPackage = frontPackage; this.frontTaskId = frontTaskId;
            this.ownFront = ownFront; this.panelLit = panelLit; this.now = now;
        }

        String describe() {
            return "wanted=" + wanted + ", readable=" + readable + ", front=" + frontPackage
                + ", task=" + frontTaskId + ", ownFront=" + ownFront + ", lit=" + panelLit;
        }
    }

    private final String ownPackage;
    private Owner owner = Owner.SYSTEM;
    private RearLend lend;
    private long lendIds, generation, episodes, yields, restores, wakeAt, nextRestoreAt;
    private int returnLooks, restoreAttempts;
    private boolean dismissed, pendingRestore, woke;

    RearOccupancy(String ownPackage) {
        this.ownPackage = ownPackage == null ? "" : ownPackage;
    }

    Owner owner() { return owner; }
    RearLend lend() { return lend; }
    long generation() { return generation; }
    long episodes() { return episodes; }
    long yields() { return yields; }
    long restores() { return restores; }
    boolean externalOwned() { return owner == Owner.EXTERNAL; }
    boolean dismissed() { return dismissed; }

    /**
     * The user closed the rear window, or asked for it again. Invalidates any in-flight restore,
     * so a callback that was already on its way cannot resurrect the window.
     */
    void setDismissed(boolean value) {
        if (dismissed == value) return;
        dismissed = value;
        generation++;
        pendingRestore = false;
        returnLooks = 0;
        restoreAttempts = 0;
        nextRestoreAt = 0;
        if (value) {
            if (owner != Owner.EXTERNAL) { owner = Owner.DISMISSED; lend = null; }
        } else if (owner == Owner.DISMISSED) {
            owner = Owner.SYSTEM;
        }
    }

    /** Advances the machine and reports the single effect to perform. */
    Action evaluate(Look look) {
        // No evidence changes nothing. "Unreadable" must never be read as "the camera left".
        if (!look.readable) return Action.NONE;

        boolean camera = isCameraPackage(look.frontPackage);

        if (dismissed) {
            // A camera that is still there keeps the panel; we simply never act.
            if (!camera && owner == Owner.EXTERNAL) owner = Owner.DISMISSED;
            return Action.NONE;
        }

        if (!look.wanted) {
            // Playback stopped or the feature was switched off. Do not pretend a present camera
            // has left: the ownership stays EXTERNAL until the task list says otherwise.
            if (owner != Owner.EXTERNAL && owner != Owner.SYSTEM) {
                owner = Owner.SYSTEM;
                lend = null;
                pendingRestore = false;
                returnLooks = 0;
            }
            return Action.NONE;
        }

        if (camera) {
            if (owner != Owner.EXTERNAL || lend == null) {
                lend = new RearLend(RearLend.Reason.CAMERA, look.frontPackage, look.frontTaskId, ++lendIds);
                owner = Owner.EXTERNAL;
                episodes++;
                generation++;
                yields++;
                returnLooks = 0;
                pendingRestore = false;
                restoreAttempts = 0;
                nextRestoreAt = 0;
                return Action.YIELD;
            }
            // Already yielded for this episode: repeated camera looks must not thrash the window.
            returnLooks = 0;
            pendingRestore = false;
            return Action.NONE;
        }

        if (owner == Owner.EXTERNAL) {
            // The camera may open its rear preview before holding the sensors and close them
            // before leaving the panel, so departure is judged by this list alone.
            if (++returnLooks < RETURN_LOOKS_TO_RESTORE) return Action.NONE;
            owner = Owner.SYSTEM;
            lend = null;
            returnLooks = 0;
            pendingRestore = true;
            generation++;
            return restore(look);
        }

        if (pendingRestore) {
            Action action = restore(look);
            if (action != Action.NONE) return action;
        }

        if (look.ownFront) owner = Owner.TINGYU;
        else if (owner == Owner.TINGYU) owner = Owner.SYSTEM;

        // Only wake for something of ours: a lit panel over Xiaomi's own screen is a flicker.
        // The first wake is never throttled - a clock-derived timestamp of zero would otherwise
        // suppress it for the first ten seconds after boot.
        if (!look.panelLit && (look.ownFront || owner == Owner.TINGYU)
                && (!woke || look.now - wakeAt >= WAKE_MIN_GAP_MS)) {
            woke = true;
            wakeAt = look.now;
            return Action.WAKE;
        }
        return Action.NONE;
    }

    private Action restore(Look look) {
        if (!look.wanted) return Action.NONE;
        if (restoreAttempts > 0 && look.now < nextRestoreAt) return Action.NONE;
        restoreAttempts++;
        generation++;
        return Action.RESTORE;
    }

    /**
     * Reports the outcome of the RESTORE that carried {@code attemptGeneration}. A stale value
     * (a newer camera episode, a dismissal, or a second attempt) is ignored.
     *
     * @return true when the result was applied
     */
    boolean restoreFinished(boolean success, long attemptGeneration, long now) {
        if (attemptGeneration != generation) return false;
        if (success) {
            owner = Owner.TINGYU;
            pendingRestore = false;
            restoreAttempts = 0;
            nextRestoreAt = 0;
            restores++;
            return true;
        }
        // Keep trying, but on a backoff: a failed rebuild must not become a launch loop.
        pendingRestore = true;
        nextRestoreAt = now + backoff(restoreAttempts);
        return true;
    }

    /** The window disappeared without a camera episode (killed, moved, or closed by the ROM). */
    void windowLost(long now) {
        if (dismissed || owner == Owner.EXTERNAL) return;
        owner = Owner.SYSTEM;
        if (pendingRestore) return;
        pendingRestore = true;
        restoreAttempts = 0;
        nextRestoreAt = now;
    }

    static long backoff(int attempts) {
        if (attempts <= 0) return RESTORE_BACKOFF_MS[0];
        if (attempts >= RESTORE_BACKOFF_MS.length) return RESTORE_SLOW_MS;
        return RESTORE_BACKOFF_MS[attempts - 1];
    }

    /** Same rule the legacy policy used; the own package can never be a camera. */
    boolean isCameraPackage(String packageName) {
        if (packageName == null || packageName.isEmpty()) return false;
        if (packageName.equals(ownPackage)) return false;
        return packageName.toLowerCase(java.util.Locale.ROOT).contains("camera");
    }

    String describe(long now) {
        return "owner=" + owner + ", lend=" + (lend == null ? "-" : lend.toString())
            + ", episodes=" + episodes + ", yields=" + yields + ", restores=" + restores
            + ", dismissed=" + dismissed + ", returnLooks=" + returnLooks
            + ", pendingRestore=" + pendingRestore + ", restoreAttempts=" + restoreAttempts
            + ", nextRestoreIn=" + (nextRestoreAt == 0 ? "-" : Math.max(0, nextRestoreAt - now) + "ms")
            + ", generation=" + generation;
    }
}
