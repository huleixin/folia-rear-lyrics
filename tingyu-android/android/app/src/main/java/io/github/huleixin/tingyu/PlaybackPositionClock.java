package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/PlaybackPositionClock.java
/** Metadata arriving between progress reports must not rewind the media-session clock. */
final class PlaybackPositionClock {
    static long at(boolean playing, long position, long reportedAt, long now, long duration) {
        long value = Math.max(0, position) + (playing ? Math.max(0, now - reportedAt) : 0);
        return duration > 0 ? Math.min(duration, value) : value;
    }
}
