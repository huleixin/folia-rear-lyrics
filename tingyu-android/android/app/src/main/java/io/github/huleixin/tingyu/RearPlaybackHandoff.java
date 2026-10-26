package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearPlaybackHandoff.java
/** Pause deadlines follow playback transitions, not repeated status reports or display events. */
final class RearPlaybackHandoff {
    static final long PAUSE_DELAY_MS = 30_000;
    private long pausedAt = -1;
    private volatile boolean returned;
    void start(boolean playing, long now) { returned = false; pausedAt = playing ? -1 : now; }
    void playback(boolean playing, long now) {
        if (playing) { returned = false; pausedAt = -1; }
        else if (pausedAt < 0) pausedAt = now;
    }
    boolean due(long now) { return !returned && pausedAt >= 0 && now - pausedAt >= PAUSE_DELAY_MS; }
    long remaining(long now) { return pausedAt < 0 ? PAUSE_DELAY_MS : Math.max(0, PAUSE_DELAY_MS - (now - pausedAt)); }
    void returnToSystem() { returned = true; }
    boolean returned() { return returned; }
    boolean wanted(boolean enabled, boolean playing, boolean manual, boolean lsp) {
        return RearLyricsPolicy.shouldMaintain(enabled, playing, manual) && (!lsp || !returned);
    }
    void reset() { pausedAt = -1; returned = false; }
}
