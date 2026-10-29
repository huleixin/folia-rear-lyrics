package io.github.huleixin.tingyu.playback;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/NativeTransportIntent.java
/** A persistent notification button toggles the current intent, even before its icon refresh arrives. */
final class NativeTransportIntent {
    static String resolve(String action, boolean desiredPaused, boolean playWhenReady) {
        return "toggle".equals(action) ? (desiredPaused || !playWhenReady ? "play" : "pause") : action;
    }
}
