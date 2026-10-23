package io.github.huleixin.tingyu;

/** Physical rear bounds win over a task's temporarily retained main-screen window size. */
final class RearLyricsViewportGeometry {
    static int[] fit(int width, int height, int x, int y, int displayWidth, int displayHeight) {
        int left = Math.max(0, -x), top = Math.max(0, -y);
        int right = Math.min(width, displayWidth - x), bottom = Math.min(height, displayHeight - y);
        return new int[] { left, top, Math.max(1, right - left), Math.max(1, bottom - top) };
    }
}
