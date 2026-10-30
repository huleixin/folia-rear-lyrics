package io.github.huleixin.tingyu.playback;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/PlaybackDiagnostics.java
/**
 * Always-on, bounded, privacy-safe playback failure trail.
 *
 * Release builds used to have zero native playback evidence: PlaybackTestDiagnostics is
 * test-build only, so a "music stopped after a while" report could not be diagnosed.
 * This recorder persists a small ring of key failure moments (stop reason, queue state,
 * focus/suppression changes, service lifecycle) to SharedPreferences and never stores
 * audio URLs, cookies, tokens or titles - song identities are hashed via {@link #anonKey}.
 */
public final class PlaybackDiagnostics {
    private static final int MAX_ENTRIES = 80;
    private static final String PREFS_NAME = "tingyu_playback_diagnostics";
    private static final String KEY_EVENTS = "events";
    private static SharedPreferences prefs;
    private static JSONArray buffer;

    public static synchronized void initialize(Context context) {
        if (prefs != null) return;
        prefs = context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        try {
            buffer = new JSONArray(prefs.getString(KEY_EVENTS, "[]"));
        } catch (Exception error) {
            buffer = new JSONArray();
        }
        trim();
    }

    /** Callers must only pass anonymous fields; URLs/credentials are never accepted here. */
    public static synchronized void note(String type, JSONObject data) {
        if (prefs == null || buffer == null) return;
        try {
            JSONObject entry = new JSONObject();
            entry.put("at", System.currentTimeMillis());
            entry.put("type", type);
            if (data != null && data.length() > 0) entry.put("data", data);
            buffer.put(entry);
            trim();
            prefs.edit().putString(KEY_EVENTS, buffer.toString()).apply();
        } catch (Exception ignored) {
            // Diagnostics must never break playback; the next note will land fine.
        }
    }

    public static synchronized JSONArray snapshot() {
        if (buffer == null) return new JSONArray();
        try {
            return new JSONArray(buffer.toString());
        } catch (Exception error) {
            return new JSONArray();
        }
    }

    public static synchronized void clear() {
        buffer = new JSONArray();
        if (prefs != null) prefs.edit().putString(KEY_EVENTS, "[]").apply();
    }

    /** Anonymous track identity: a stable short hex digest of the song key, never the key itself. */
    public static String anonKey(String songKey) {
        if (songKey == null || songKey.isEmpty()) return "";
        return Integer.toHexString(songKey.hashCode());
    }

    private static void trim() {
        while (buffer.length() > MAX_ENTRIES) {
            JSONArray next = new JSONArray();
            for (int i = 1; i < buffer.length(); i++) {
                try { next.put(buffer.get(i)); } catch (Exception ignored) {}
            }
            buffer = next;
        }
    }

    private PlaybackDiagnostics() {}
}
