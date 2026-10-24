package io.github.huleixin.tingyu;

// PlaybackArtworkSizing.java — bounded decoding for notification / Bluetooth cover thumbnails.
final class PlaybackArtworkSizing {
    static final int MAX_EDGE = 512;
    private PlaybackArtworkSizing() {}

    static int sampleSize(int width, int height) {
        int sample = 1;
        while (Math.max(width, height) / sample > MAX_EDGE * 2 && sample <= (1 << 28)) sample *= 2;
        return sample;
    }

    static int[] fit(int width, int height) {
        if (width <= 0 || height <= 0) return new int[]{1, 1};
        double scale = Math.min(1.0, MAX_EDGE / (double) Math.max(width, height));
        return new int[]{Math.max(1, (int) Math.round(width * scale)), Math.max(1, (int) Math.round(height * scale))};
    }
}
