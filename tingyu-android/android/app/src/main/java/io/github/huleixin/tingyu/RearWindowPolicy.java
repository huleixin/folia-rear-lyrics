package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearWindowPolicy.java
/**
 * Two decisions about the lyric window that must not drift apart again.
 *
 * <p><b>The camera handoff never destroys the window.</b> The previous engine answered a camera
 * arrival with {@code closeWindow(CAMERA)}, which finished the Activity; the camera exit then
 * started a new Activity and a new WebView. Every camera open/close cycle therefore produced a
 * black frame and a renderer relaunch, which is the flicker this plan exists to remove. Hiding
 * the viewport and moving the task behind the camera is enough, because a task that is not in
 * front cannot receive touch events.
 *
 * <p><b>A reused window beats a rebuilt one, even while locked.</b> HyperOS refuses new
 * third-party rear launches while the keyguard is up, but an existing task can still be brought
 * back by its owner. Preferring reuse while locked is what keeps the camera handoff from
 * turning into a rebuild whenever the phone happens to be locked.
 */
final class RearWindowPolicy {
    private RearWindowPolicy() {}

    /** True only for the old engine. Plan A hides and moves; it never finishes for a camera. */
    static boolean mayFinishForCamera(boolean planA) { return !planA; }

    /** A window that already exists is reused unless the platform forbids it. */
    static boolean mayReuseWindow(boolean attached, boolean locked, boolean lspSelected,
            boolean preservedSleepSession, boolean planA) {
        if (!attached) return false;
        return !locked || lspSelected || preservedSleepSession || planA;
    }

    /**
     * Heartbeat while a camera owns the panel. The task list is the only evidence of the exit,
     * so it stays readable fast, but not at the two-second shell-poll rate of the whole session.
     */
    static long cameraBeatMs(boolean restoring, boolean deviceBusy) {
        if (restoring) return 700L;
        return deviceBusy ? 3_000L : 1_000L;
    }
}
