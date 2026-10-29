package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/PlaybackSessionClock.java
/** A delayed Web publication cannot resume the system clock after the native decoder has paused. */
final class PlaybackSessionClock {
    final boolean playing;
    final long position;
    private PlaybackSessionClock(boolean playing, long position) {
        this.playing = playing; this.position = Math.max(0, position);
    }
    static PlaybackSessionClock resolve(boolean webPlaying, long webPosition, long[] nativeClock) {
        return nativeClock != null && nativeClock.length >= 2
            ? new PlaybackSessionClock(nativeClock[1] == 1, nativeClock[0])
            : new PlaybackSessionClock(webPlaying, webPosition);
    }
    boolean shouldPublish(boolean previousPlaying, long projectedPosition, boolean forcePosition) {
        return forcePosition || playing != previousPlaying || Math.abs(position - projectedPosition) >= 250;
    }
}
