package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/PlaybackPositionClock.java
/** Metadata arriving between progress reports must not rewind the media-session clock. */
final class PlaybackPositionClock {
    static long at(boolean playing, long position, long reportedAt, long now, long duration) {
        return at(playing, position, reportedAt, now, duration, 1f);
    }
    static long at(boolean playing, long position, long reportedAt, long now, long duration, float speed) {
        float rate = Float.isFinite(speed) && speed > 0f ? speed : 1f;
        long value = Math.max(0, position) + (playing ? (long)(Math.max(0, now - reportedAt) * (double)rate) : 0);
        return duration > 0 ? Math.min(duration, value) : value;
    }
}
