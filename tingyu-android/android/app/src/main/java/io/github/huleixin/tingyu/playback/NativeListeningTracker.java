package io.github.huleixin.tingyu.playback;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Pure wall-clock-bounded effective listening accumulator for Media3 native playback.
 *
 * <p>Counts only elapsed time while {@code player.isPlaying() == true}, completely ignoring
 * paused time, buffering time, and seek position jumps. Sessions with {@code >= 30_000ms}
 * effective playback are queued for JS {@code listening_sessions} & Time Radar ingestion.
 */
public final class NativeListeningTracker {

    public static final long MIN_EFFECTIVE_MS = 30_000L;
    private static final long MAX_STEP_MS = 5_000L;
    private static final int MAX_PENDING = 500;
    private static final String PREFS = "tingyu_native_listening_sessions";
    private static final String KEY_PENDING = "pending_json";

    public static final class TrackMeta {
        public final String songKey;
        public final String providerId;
        public final String mediaId;
        public final String title;
        public final String artist;
        public final String album;
        public final String artwork;
        public final long durationMs;

        public TrackMeta(String songKey, String providerId, String mediaId, String title,
                         String artist, String album, String artwork, long durationMs) {
            this.songKey = songKey == null ? "" : songKey;
            this.providerId = providerId == null ? "" : providerId;
            this.mediaId = mediaId == null ? "" : mediaId;
            this.title = title == null ? "" : title;
            this.artist = artist == null ? "" : artist;
            this.album = album == null ? "" : album;
            this.artwork = artwork == null ? "" : artwork;
            this.durationMs = Math.max(0L, durationMs);
        }
    }

    public static final class SessionSnapshot {
        public final String id;
        public final TrackMeta meta;
        public final long startedAtWallMs;
        public final long endedAtWallMs;
        public final double seconds;
        public final boolean completed;

        SessionSnapshot(String id, TrackMeta meta, long startedAtWallMs, long endedAtWallMs,
                        double seconds, boolean completed) {
            this.id = id;
            this.meta = meta;
            this.startedAtWallMs = startedAtWallMs;
            this.endedAtWallMs = endedAtWallMs;
            this.seconds = seconds;
            this.completed = completed;
        }

        public JSONObject toJson() {
            JSONObject obj = new JSONObject();
            try {
                obj.put("id", id);
                obj.put("songKey", meta.songKey);
                obj.put("providerId", meta.providerId);
                obj.put("mediaId", meta.mediaId);
                obj.put("title", meta.title);
                obj.put("artist", meta.artist);
                obj.put("album", meta.album);
                obj.put("artwork", meta.artwork);
                obj.put("durationMs", meta.durationMs);
                obj.put("startedAt", startedAtWallMs);
                obj.put("endedAt", endedAtWallMs);
                obj.put("seconds", seconds);
                obj.put("completed", completed);
            } catch (Exception ignored) {}
            return obj;
        }

        static SessionSnapshot fromJson(JSONObject obj) {
            if (obj == null) return null;
            String id = obj.optString("id", "");
            String songKey = obj.optString("songKey", "");
            if (id.isEmpty() || songKey.isEmpty()) return null;
            TrackMeta meta = new TrackMeta(
                songKey,
                obj.optString("providerId", ""),
                obj.optString("mediaId", ""),
                obj.optString("title", ""),
                obj.optString("artist", ""),
                obj.optString("album", ""),
                obj.optString("artwork", ""),
                obj.optLong("durationMs", 0L));
            return new SessionSnapshot(
                id, meta,
                obj.optLong("startedAt", 0L),
                obj.optLong("endedAt", 0L),
                obj.optDouble("seconds", 0.0),
                obj.optBoolean("completed", false));
        }
    }

    public interface Listener {
        void onSessionFinalized(SessionSnapshot snapshot);
    }

    private final List<SessionSnapshot> pending = new ArrayList<>();
    private SharedPreferences prefs;
    private Listener listener;

    private String activeId = "";
    private TrackMeta activeMeta = null;
    private long startedAtWallMs = 0L;
    private long accumulatedMs = 0L;
    private long lastPlayingElapsedMs = -1L;
    private boolean lastKnownPlaying = false;

    public NativeListeningTracker() {}

    public synchronized void attachContext(Context context, Listener listener) {
        this.listener = listener;
        if (context != null && this.prefs == null) {
            this.prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            loadPersistedLocked();
        }
    }

    public synchronized void onTrackOrPlayState(boolean isPlaying, long elapsedMs, long wallMs, TrackMeta meta) {
        accumulateLocked(elapsedMs);
        String nextKey = meta == null ? "" : meta.songKey;
        String currentKey = activeMeta == null ? "" : activeMeta.songKey;
        if (!nextKey.equals(currentKey)) {
            finalizeActiveLocked(wallMs);
            if (meta != null && !nextKey.isEmpty()) {
                activeId = "native:" + UUID.randomUUID().toString();
                activeMeta = meta;
                startedAtWallMs = wallMs;
                accumulatedMs = 0L;
            } else {
                clearActiveLocked();
            }
        } else if (meta != null && activeMeta != null) {
            // Enrich metadata if title/artwork arrived late without resetting the active session.
            if (activeMeta.title.isEmpty() && !meta.title.isEmpty()) {
                activeMeta = meta;
            }
        }
        lastKnownPlaying = isPlaying;
        lastPlayingElapsedMs = isPlaying ? elapsedMs : -1L;
    }

    public synchronized void onTick(boolean isPlaying, long elapsedMs, long wallMs) {
        accumulateLocked(elapsedMs);
        lastKnownPlaying = isPlaying;
        lastPlayingElapsedMs = isPlaying ? elapsedMs : -1L;
    }

    public synchronized void onEndedOrStopped(long elapsedMs, long wallMs) {
        accumulateLocked(elapsedMs);
        lastKnownPlaying = false;
        lastPlayingElapsedMs = -1L;
        finalizeActiveLocked(wallMs);
        clearActiveLocked();
    }

    public synchronized SessionSnapshot peekActive(boolean isPlaying, long elapsedMs, long wallMs) {
        accumulateLocked(elapsedMs);
        lastKnownPlaying = isPlaying;
        lastPlayingElapsedMs = isPlaying ? elapsedMs : -1L;
        if (activeMeta == null || accumulatedMs < MIN_EFFECTIVE_MS) return null;
        return buildSnapshotLocked(wallMs);
    }

    public synchronized List<SessionSnapshot> drainPending() {
        List<SessionSnapshot> copy = new ArrayList<>(pending);
        pending.clear();
        savePersistedLocked();
        return copy;
    }

    public synchronized void clearAll() {
        pending.clear();
        clearActiveLocked();
        savePersistedLocked();
    }

    private void accumulateLocked(long elapsedMs) {
        if (activeMeta != null && lastKnownPlaying && lastPlayingElapsedMs >= 0L && elapsedMs > lastPlayingElapsedMs) {
            long delta = Math.min(MAX_STEP_MS, elapsedMs - lastPlayingElapsedMs);
            accumulatedMs += delta;
        }
    }

    private SessionSnapshot buildSnapshotLocked(long wallMs) {
        double seconds = accumulatedMs / 1000.0;
        boolean completed = activeMeta.durationMs > 0 && accumulatedMs >= activeMeta.durationMs * 0.95;
        return new SessionSnapshot(activeId, activeMeta, startedAtWallMs, Math.max(startedAtWallMs, wallMs), seconds, completed);
    }

    private void finalizeActiveLocked(long wallMs) {
        if (activeMeta == null || accumulatedMs < MIN_EFFECTIVE_MS) return;
        SessionSnapshot snapshot = buildSnapshotLocked(wallMs);
        if (pending.size() >= MAX_PENDING) pending.remove(0);
        pending.add(snapshot);
        savePersistedLocked();
        if (listener != null) listener.onSessionFinalized(snapshot);
    }

    private void clearActiveLocked() {
        activeId = "";
        activeMeta = null;
        startedAtWallMs = 0L;
        accumulatedMs = 0L;
        lastPlayingElapsedMs = -1L;
        lastKnownPlaying = false;
    }

    private void loadPersistedLocked() {
        if (prefs == null) return;
        try {
            String raw = prefs.getString(KEY_PENDING, "[]");
            JSONArray array = new JSONArray(raw);
            for (int i = 0; i < array.length(); i++) {
                SessionSnapshot item = SessionSnapshot.fromJson(array.optJSONObject(i));
                if (item != null) pending.add(item);
            }
        } catch (Exception ignored) {}
    }

    private void savePersistedLocked() {
        if (prefs == null) return;
        try {
            JSONArray array = new JSONArray();
            for (SessionSnapshot item : pending) array.put(item.toJson());
            prefs.edit().putString(KEY_PENDING, array.toString()).apply();
        } catch (Exception ignored) {}
    }
}
