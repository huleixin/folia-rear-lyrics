package io.github.huleixin.tingyu.playback;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/ShuffleCycle.java
// Keep the unsigned hash/LCG identical to src/services/shuffleCycle.ts.
final class ShuffleCycle {
    static List<NativePlaylist.Track> next(List<NativePlaylist.Track> order) {
        int seed = (int)2166136261L;
        for (NativePlaylist.Track track : order) {
            for (int i = 0; i < track.songKey.length(); i++) seed = (seed ^ track.songKey.charAt(i)) * 16777619;
            seed *= 16777619;
        }
        List<NativePlaylist.Track> result = new ArrayList<>(order);
        for (int i = result.size() - 1; i > 0; i--) {
            seed = seed * 1664525 + 1013904223;
            Collections.swap(result, i, (int)(Integer.toUnsignedLong(seed) % (i + 1)));
        }
        if (result.size() > 1 && result.get(0).songKey.equals(order.get(order.size() - 1).songKey))
            Collections.swap(result, 0, 1);
        return result;
    }
}
