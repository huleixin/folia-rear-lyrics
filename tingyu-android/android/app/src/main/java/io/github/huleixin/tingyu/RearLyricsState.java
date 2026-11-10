package io.github.huleixin.tingyu;

import org.json.JSONObject;

/** In-memory relay: full visual configuration changes rarely, clock/audio are cheap incremental updates. */
final class RearLyricsState {
    private static JSONObject config, clock, audio;
    private static JSONObject uploadedFont;
    private static int revision;
    private static String styleStamp = "";
    private static JSONObject styledConfig, styledSource;
    static synchronized boolean hasConfig() { return config != null; }

    static synchronized void update(JSONObject value) {
        JSONObject nextConfig = value.optJSONObject("config");
        if (nextConfig != null) {
            config = nextConfig; revision++; RearHostUpdates.changed();
        }
        if (value.has("uploadedFont")) uploadedFont = value.optJSONObject("uploadedFont");
        if (value.optJSONObject("clock") != null) clock = value.optJSONObject("clock");
        if (value.optJSONObject("audio") != null) audio = value.optJSONObject("audio");
    }

    static synchronized String snapshot(int knownRevision) {
        try {
            JSONObject value = new JSONObject().put("clock", clock).put("audio", audio);
            // Native track authority: present on every packet, because it is cheap and because a
            // rear surface that reconnects must be able to tell "this is a different song now"
            // without waiting for the (possibly frozen) foreground WebView to publish again.
            JSONObject track = RearNativeTrack.snapshot();
            if (track.length() > 0) {
                // 当前曲的歌词状态指纹：state@revision。背屏渲染器把它放进快照比较键 ——
                // 歌词从 pending 变成 ready（或版本更新）时渲染器立刻重读，不再依赖
                // 固定次数的重试预算（那正是「等到重试耗尽就永久空白」的成因）。
                track.put("lyric", io.github.huleixin.tingyu.coloros.ColorOsLyricBridge
                    .fingerprint(track.optString("songKey", "")));
                value.put("owner", track);
                value.put("track", "media3".equals(track.optString("engine"))?track:JSONObject.NULL);
            }
            JSONObject effective = config;
            if (config != null && config.optJSONObject("randomVisualizer") != null) {
                JSONObject policy = config.optJSONObject("randomVisualizer");
                String song = !"stage".equals(config.optString("activePlaybackContext")) && !track.optString("songKey").isEmpty()
                    ? track.optString("songKey") : config.optString("playbackSongKey");
                String mode = RearRandomVisualizer.select(policy, song, config.optString("visualizerMode"));
                String stamp = policy.toString() + ":" + song + ":" + mode;
                if (!stamp.equals(styleStamp) || styledSource != config) {
                    if (!stamp.equals(styleStamp)) { styleStamp = stamp; revision++; }
                    styledSource = config;
                    styledConfig = new JSONObject(config.toString()).put("visualizerMode", mode)
                        .put("randomVisualizerSongKey", song).put("randomVisualizerSelectedMode", mode);
                }
                effective = styledConfig;
            }
            value.put("revision", revision);
            if (knownRevision != revision && effective != null) value.put("config", effective).put("uploadedFont", uploadedFont);
            return value.toString();
        } catch (Exception error) { return "{}"; }
    }
}
