package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/PlaybackPositionClock.java
/**
 * Metadata arriving between progress reports must not rewind the media-session clock.
 *
 * <p>公开是给 Compose 极简播放页用的：它和媒体会话读的是同一条锚点外推规则，
 * 不自己再写一份「位置 = 锚点 + 经过时间」。这里只有一次乘加，谁都不是"第二个时钟"。
 */
public final class PlaybackPositionClock {
    public static long at(boolean playing, long position, long reportedAt, long now, long duration) {
        return at(playing, position, reportedAt, now, duration, 1f);
    }
    public static long at(boolean playing, long position, long reportedAt, long now, long duration, float speed) {
        float rate = Float.isFinite(speed) && speed > 0f ? speed : 1f;
        long value = Math.max(0, position) + (playing ? (long)(Math.max(0, now - reportedAt) * (double)rate) : 0);
        return duration > 0 ? Math.min(duration, value) : value;
    }
}
