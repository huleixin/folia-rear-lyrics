package io.github.huleixin.tingyu.playback;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/QueueSupervision.java
/**
 * Decides when the native playlist needs WebView help, and what "help never comes" means.
 *
 * Media3 only knows the items it was handed. The logical playlist lives in JS, so a resolved
 * window can always run dry while the user still wants music. Before this, draining the window
 * meant {@code STATE_ENDED}: terminal, silent, and indistinguishable from "playlist finished".
 *
 * The three states this machine distinguishes:
 * <ul>
 *   <li>healthy: enough resolved items left, nothing to do;</li>
 *   <li>low water: ask for a refill once per track, keeping playback untouched;</li>
 *   <li>waiting for next: the window is empty but the logical playlist is not, so playback is
 *       held open (not "ended") and a bounded, back-off refill schedule keeps asking. Any late
 *       queue resumes playback; a user pause, a stop or a real list end exits the state.</li>
 * </ul>
 *
 * Pure logic on purpose: every branch below is unit tested without a device.
 */
final class QueueSupervision {

    enum Action {
        /** Nothing to do. */
        NONE,
        /** Low water: ask JS for the next window. */
        REQUEST,
        /** Window drained with more playlist left: hold playback open and ask. */
        WAIT,
        /** Still waiting: one more bounded attempt. */
        RETRY
    }

    /** Requests start one item before the end so a refill can land before the gap. */
    static final int LOW_WATER = 1;

    /**
     * Back-off for a drained window. Deliberately sparse: the first attempts cover a WebView
     * that is merely throttled, the tail covers a device that dozed off. No polling, no
     * wake locks - each attempt is a single event to a listener that may not be running.
     */
    private static final long[] RETRY_DELAYS_MS = {4_000L, 10_000L, 30_000L, 60_000L, 120_000L, 300_000L};

    private boolean continues;
    private long generation = -1L;
    private boolean waiting;
    private int retries;
    private long lastRequestAt;
    private String lastRequestSong = "";
    private int lastRequestRemaining = Integer.MAX_VALUE;

    /**
     * Whether the logical playlist has more tracks after the window JS handed over.
     *
     * A stale generation is ignored for the "true" direction (an old window cannot declare new
     * music) but always honoured for "false": ending the list is a safe, terminal statement.
     */
    void continuation(boolean continues, long generation) {
        if (generation >= this.generation) {
            this.generation = generation;
            this.continues = continues;
        } else if (!continues) {
            this.continues = false;
        }
        if (!this.continues) {
            waiting = false;
            retries = 0;
            lastRequestSong = "";
            lastRequestRemaining = Integer.MAX_VALUE;
        }
    }

    boolean continues() {
        return continues;
    }

    boolean waiting() {
        return waiting;
    }

    long generation() {
        return generation;
    }

    int retries() {
        return retries;
    }

    /**
     * @param songKey   the item Media3 is on right now; dedupes one request per track
     * @param remaining items after the current one
     * @param ended     Media3 reached STATE_ENDED
     * @param paused    the user (or the system) actually wants silence
     */
    Action evaluate(String songKey, int remaining, boolean ended, boolean paused, long now) {
        if (paused || !continues) {
            waiting = false;
            retries = 0;
            return Action.NONE;
        }
        if (ended) {
            if (!waiting) {
                waiting = true;
                retries = 0;
                lastRequestAt = now;
                lastRequestSong = songKey == null ? "" : songKey;
                lastRequestRemaining = 0;
                return Action.WAIT;
            }
            if (retries >= RETRY_DELAYS_MS.length) {
                return Action.NONE;
            }
            if (now - lastRequestAt < RETRY_DELAYS_MS[retries]) {
                return Action.NONE;
            }
            retries++;
            lastRequestAt = now;
            return Action.RETRY;
        }
        if (waiting) {
            waiting = false;
            retries = 0;
        }
        if (remaining <= LOW_WATER
                && (!songKey.equals(lastRequestSong) || remaining < lastRequestRemaining)) {
            lastRequestSong = songKey;
            lastRequestRemaining = remaining;
            lastRequestAt = now;
            return Action.REQUEST;
        }
        return Action.NONE;
    }

    /** A window landed (or playback restarted): forget the waiting episode entirely. */
    void satisfied() {
        waiting = false;
        retries = 0;
        lastRequestSong = "";
        lastRequestRemaining = Integer.MAX_VALUE;
    }

    /**
     * A window arrived but resolved nothing (every candidate failed) while playback is drained.
     * That is an answer, not progress: keep the session waiting but immediately owe another
     * attempt, so a temporarily broken provider does not burn the retry budget in silence.
     */
    void rearm(long now) {
        if (!continues) {
            return;
        }
        waiting = true;
        retries = 0;
        lastRequestAt = now - RETRY_DELAYS_MS[0];
    }

    /** Millis until the next scheduled attempt, or -1 when the schedule is exhausted. */
    long retryDelay(long now) {
        if (!waiting || retries >= RETRY_DELAYS_MS.length) {
            return -1L;
        }
        return Math.max(0L, lastRequestAt + RETRY_DELAYS_MS[retries] - now);
    }

    /** Diagnostics hook so the retry budget is visible in an exported report. */
    static int retryBudget() {
        return RETRY_DELAYS_MS.length;
    }
}
