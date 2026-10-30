package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearOwnershipState.java
/**
 * Single rear-screen ownership model shared by the camera, cover, lock and (future) gesture
 * paths. The coordinator's flags stay the source of truth; this class derives the public
 * state from them so every module reads one answer instead of re-interpreting flags, and
 * the transition rules are pure enough to regression-test without a device.
 *
 * The camera has absolute priority: while CAMERA_OWNED, no presentation, wake, sleep,
 * resume or lease renewal may touch the rear display - not even a cover-release recovery.
 * Architecture borrowed from Mi Back Screen's RearSnapshot (MIT): ownership first, actions
 * gated by ownership.
 */
final class RearOwnershipState {
    enum State {
        /** Xiaomi's own rear screen; Tingyu holds nothing. */
        SYSTEM_OWNED,
        /** The lyric viewport is the visible rear task. */
        TINGYU_ACTIVE,
        /** A camera owns the rear screen; Tingyu must not touch it at all. */
        CAMERA_OWNED,
        /** Tingyu is tearing its rear window/power down; launches stay blocked. */
        RELEASING,
        /** Another task is in front on the rear display, or the physical cover is on. */
        COVERED,
        /** Power override (cover sleep now; double-tap dim later). Music keeps playing. */
        USER_DIMMED,
    }

    private RearOwnershipState() {}

    /**
     * Derives the state from the coordinator's inputs. Order is the priority: camera,
     * then teardown, then dim, then cover, then presentation. [rearTaskOurs] is
     * RearLyricsActivity.isShowingOnDisplay(rear); [occluded] is another task in front.
     */
    static State resolve(boolean cameraOwned, boolean releasing, boolean powerDimmed,
            boolean occluded, boolean physicallyCovered, boolean rearTaskOurs) {
        if (cameraOwned) return State.CAMERA_OWNED;
        if (releasing) return State.RELEASING;
        if (powerDimmed) return State.USER_DIMMED;
        if (occluded || physicallyCovered) return State.COVERED;
        return rearTaskOurs ? State.TINGYU_ACTIVE : State.SYSTEM_OWNED;
    }

    /** Starting or keeping a visible lyric viewport. RELEASING stays blocked until it finishes. */
    static boolean allowsPresentation(State state) {
        return state == State.SYSTEM_OWNED || state == State.TINGYU_ACTIVE
            || state == State.COVERED || state == State.USER_DIMMED;
    }

    /** Bringing the rear panel back on (wake). Never while a camera owns the screen. */
    static boolean allowsWake(State state) {
        return allowsPresentation(state);
    }

    /** Powering the rear panel off (cover sleep). A camera may be turning it off itself. */
    static boolean allowsSleep(State state) {
        return state == State.TINGYU_ACTIVE;
    }

    /** Renewing the LSP bright-policy lease. Release remains allowed in any state. */
    static boolean allowsLeaseRenewal(State state) {
        return state == State.TINGYU_ACTIVE;
    }

    /** Anything that ends our session (close, release power) is always permitted. */
    static boolean allowsRelease(State state) {
        return true;
    }

    static String describe(State state) { return state == null ? "unknown" : state.name(); }
}
