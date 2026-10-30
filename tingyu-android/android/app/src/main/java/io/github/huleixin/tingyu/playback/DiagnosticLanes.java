package io.github.huleixin.tingyu.playback;

import org.json.JSONArray;
import org.json.JSONObject;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/DiagnosticLanes.java
/**
 * Pure lane bookkeeping for {@link PlaybackDiagnostics}, with no Android dependency so the
 * guarantee can be unit tested on the JVM.
 *
 * <p>The guarantee that matters: a routine retry tick must never be able to evict the one
 * record that explains a stop. Two separate rings give that; a single ring does not.
 */
final class DiagnosticLanes {
    static final int MAX_CRITICAL = 140;
    static final int MAX_ROUTINE = 40;

    private static final String[] ROUTINE_TYPES = {
        "queue-request", "queue-wait", "native-session-state", "clock", "heartbeat", "session-sample",
        // 原生歌曲信息服务（歌词/封面）的高频记账：每首歌都会有几条，属于常规痕迹，
        // 不该把 critical 泳道里「为什么停播」的证据挤掉。构建/发布/失败仍留在 critical。
        "songinfo-schedule", "lyrics-request", "lyrics-cache-hit", "lyrics-fetch",
        "artwork-uri", "artwork-cache-hit", "artwork-fetch", "lyrics-apply", "artwork-apply"
    };

    private JSONArray critical = new JSONArray();
    private JSONArray routine = new JSONArray();

    DiagnosticLanes() {}

    DiagnosticLanes(JSONArray critical, JSONArray routine) {
        this.critical = critical == null ? new JSONArray() : critical;
        this.routine = routine == null ? new JSONArray() : routine;
    }

    static boolean isRoutine(String type) {
        if (type == null) return false;
        for (String candidate : ROUTINE_TYPES) {
            if (candidate.equals(type)) return true;
        }
        return false;
    }

    void record(String type, JSONObject data) {
        if (type == null) return;
        try {
            if (isRoutine(type)) {
                if (!coalesce(routine, type, data)) append(routine, newEntry(type, data), MAX_ROUTINE);
            } else {
                append(critical, newEntry(type, data), MAX_CRITICAL);
            }
        } catch (Exception ignored) {
            // Diagnostics must never break playback.
        }
    }

    JSONArray critical() {
        return critical;
    }

    JSONArray routine() {
        return routine;
    }

    static JSONObject newEntry(String type, JSONObject data) throws Exception {
        JSONObject entry = new JSONObject();
        long now = System.currentTimeMillis();
        entry.put("at", now);
        entry.put("since", now);
        entry.put("type", type);
        if (data != null && data.length() > 0) entry.put("data", data);
        return entry;
    }

    /** Identical adjacent routine events are a cadence, not information: fold them together. */
    static boolean coalesce(JSONArray lane, String type, JSONObject data) throws Exception {
        if (lane.length() == 0) return false;
        JSONObject last = lane.optJSONObject(lane.length() - 1);
        if (last == null || !type.equals(last.optString("type"))) return false;
        JSONObject previous = last.optJSONObject("data");
        String previousData = previous == null ? "" : previous.toString();
        String nextData = data == null ? "" : data.toString();
        if (!previousData.equals(nextData)) return false;
        last.put("repeat", last.optInt("repeat", 1) + 1);
        last.put("at", System.currentTimeMillis());
        return true;
    }

    static void append(JSONArray lane, JSONObject entry, int max) {
        lane.put(entry);
        while (lane.length() > max) lane.remove(0);
    }
}
