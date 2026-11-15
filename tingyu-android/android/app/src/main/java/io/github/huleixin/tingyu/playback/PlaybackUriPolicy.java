package io.github.huleixin.tingyu.playback;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/PlaybackUriPolicy.java
/** URI families supported by Media3, shared by foreground preparation and native continuation. */
public final class PlaybackUriPolicy {
    private PlaybackUriPolicy() { }

    public static boolean supports(String uri) {
        if (uri == null) return false;
        int colon = uri.indexOf(':');
        if (colon <= 0 || colon == uri.length() - 1) return false;
        String scheme = uri.substring(0, colon);
        return "http".equals(scheme) || "https".equals(scheme)
            || "content".equals(scheme) || "file".equals(scheme);
    }
}
