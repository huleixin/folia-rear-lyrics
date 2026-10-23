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
            return value.toString();
        } catch (Exception error) { return "{}"; }
    }
}
