package io.github.huleixin.tingyu.playback;

import java.util.ArrayList;
import java.util.List;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/QueueLedger.java
/**
 * Reconciles an offered queue window against the native playlist.
 *
 * This used to live inline in {@code NativeAudioEngine.applyQueue}, where the only way to know
 * whether an anchor rule was right was to listen to a phone for an hour. The reconciliation is
 * a pure function of two immutable inputs, so the "50 boundaries with a frozen WebView" case is
 * a unit test instead of a device session.
 *
 * The invariants it protects:
 * <ul>
 *   <li>nothing is ever replayed: entries up to and including the engine's own current item are
 *       dropped, so a window built from a stale UI anchor cannot rewind playback;</li>
 *   <li>a window that contains neither the anchor nor the current item is refused instead of
 *       overwriting the order - the caller then asks again rather than corrupting the queue;</li>
 *   <li>an empty window is a valid answer ("I resolved nothing"), not a refusal.</li>
 * </ul>
 */
final class QueueLedger {

    /** Why a window was accepted or refused; also the diagnostics vocabulary. */
    enum Reason {
        /** Usable as offered. */
        OK,
        /** Usable after dropping entries the engine has already played. */
        TRIMMED,
        /** Nobody offered a successor: a legitimate "nothing to add" answer. */
        EMPTY,
        /** The offered window neither contains the anchor nor the current item. */
        STALE_ANCHOR
    }

    static final class Plan {
        final boolean accepted;
        final Reason reason;
        /** Entries to drop from the head of the offered window. */
        final int trim;
        /** The item the engine is on, as both sides understand it. */
        final String currentKey;

        private Plan(boolean accepted, Reason reason, int trim, String currentKey) {
            this.accepted = accepted;
            this.reason = reason;
            this.trim = trim;
            this.currentKey = currentKey;
        }

        int acceptedCount(int offered) {
            return accepted ? Math.max(0, offered - trim) : 0;
        }
    }

    private QueueLedger() {
    }

    /**
     * @param nativeIds  the media ids currently in the native playlist, in order
     * @param index      the native current item index (-1 when the playlist is empty)
     * @param anchor     the item the offered window was computed for
     * @param offeredIds the media ids the window would add, in order
     */
    static Plan reconcile(List<String> nativeIds, int index, String anchor, List<String> offeredIds) {
        boolean hasCurrent = index >= 0 && index < nativeIds.size();
        String current = hasCurrent ? nativeIds.get(index) : "";
        if (offeredIds.isEmpty()) {
            return new Plan(true, Reason.EMPTY, 0, current);
        }
        // No current item means nothing has played yet (a fresh prepare, or a playlist the engine
        // cleared): the whole window may be used. Refusing here would strand the very first refill.
        if (!hasCurrent) {
            return new Plan(true, Reason.OK, 0, "");
        }
        if (anchor == null || anchor.isEmpty() || anchor.equals(current)) {
            return new Plan(true, Reason.OK, 0, current);
        }
        int position = offeredIds.indexOf(current);
        if (position >= 0) {
            return new Plan(true, Reason.TRIMMED, position + 1, current);
        }
        return new Plan(false, Reason.STALE_ANCHOR, 0, current);
    }

    /** Convenience for callers that only have ids to compare against. */
    static List<String> ids(List<String> values) {
        return values == null ? new ArrayList<>() : new ArrayList<>(values);
    }
}
