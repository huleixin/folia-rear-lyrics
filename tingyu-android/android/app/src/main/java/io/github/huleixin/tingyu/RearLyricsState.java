package io.github.huleixin.tingyu;

import org.json.JSONObject;

/** In-memory relay: full visual configuration changes rarely, clock/audio are cheap incremental updates. */
final class RearLyricsState {
    private static JSONObject config, clock, audio;
    private static JSONObject uploadedFont;
    private static int revision;
    static synchronized boolean hasConfig() { return config != null; }

    static synchronized void update(JSONObject value) {
        JSONObject nextConfig = value.optJSONObject("config");
        if (nextConfig != null) {
            config = nextConfig; revision++;
        }
        if (value.has("uploadedFont")) uploadedFont = value.optJSONObject("uploadedFont");
        if (value.optJSONObject("clock") != null) clock = value.optJSONObject("clock");
        if (value.optJSONObject("audio") != null) audio = value.optJSONObject("audio");
    }

    static synchronized String snapshot(int knownRevision) {
        try {
            JSONObject value = new JSONObject().put("revision", revision).put("clock", clock).put("audio", audio);
            if (knownRevision != revision && config != null) value.put("config", config).put("uploadedFont", uploadedFont);
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
                value.put("track", track);
            }
            return value.toString();
        } catch (Exception error) { return "{}"; }
    }
}
