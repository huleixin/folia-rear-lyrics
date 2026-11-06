package io.github.huleixin.tingyu.playback;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/PlaybackDiagnostics.java
/**
 * Always-on, bounded, privacy-safe, crash-durable playback failure trail.
 *
 * <p>Two lanes, because a single ring buffer is what made earlier reports useless: a routine
 * retry tick fired every few seconds and quietly evicted the one record that explained the
 * stop. Critical events (state transitions, errors, lifecycle, lyric publication) live in the
 * critical lane and can only be evicted by other critical events. Routine events (queue asks,
 * wait ticks, heartbeat) live in the routine lane, are coalesced when identical and adjacent,
 * and are bounded separately. Bookkeeping itself is in {@link DiagnosticLanes}.
 *
 * <p>Durability: the critical lane is written with {@code commit()} (synchronous) so a process
 * kill immediately after a stop does not lose the record; the routine lane uses {@code apply()}.
 * Everything lives in SharedPreferences, so the trail outlives the WebView, the Activity and
 * the renderer, and is still exportable after the app is reopened.
 *
 * <p>Never stores audio URLs, cookies, tokens or titles; song identities are hashed via
 * {@link #anonKey}.
 */
public final class PlaybackDiagnostics {
    private static final String PREFS_NAME = "tingyu_playback_diagnostics";
    private static final String KEY_CRITICAL = "critical";
    private static final String KEY_ROUTINE = "routine";
    private static final String KEY_EPOCH = "epoch";

    private static SharedPreferences prefs;
    private static DiagnosticLanes lanes;
    private static int epoch;
    private static Context appContext;

    /**
     * 进程级 ApplicationContext。后台续播要在没有 Activity、没有插件实例的情况下登记本地代理地址，
     * 所以它需要一个不随 Activity 消失的 context（持有的是 applicationContext，不存在泄漏）。
     */
    public static Context contextOrNull() {
        return appContext;
    }

    public static synchronized void initialize(Context context) {
        if (context != null) {
            Context app = context.getApplicationContext();
            appContext = app == null ? context : app;
        }
        if (prefs != null) return;
        if (context == null) return;
        Context app = context.getApplicationContext();
        if (app == null) app = context;
        prefs = app.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        lanes = new DiagnosticLanes(load(KEY_CRITICAL, DiagnosticLanes.MAX_CRITICAL),
            load(KEY_ROUTINE, DiagnosticLanes.MAX_ROUTINE));
        epoch = prefs.getInt(KEY_EPOCH, 0) + 1;
        prefs.edit().putInt(KEY_EPOCH, epoch).apply();
        // One record per process start, so a report can tell whether the trail spans a restart.
        try {
            lanes.record("process-start", new JSONObject().put("epoch", epoch));
            persistCritical();
        } catch (Exception ignored) {
            // The trail is best effort; a failure here must never block app start.
        }
    }

    /** Callers must only pass anonymous fields; URLs/credentials are never accepted here. */
    public static synchronized void note(String type, JSONObject data) {
        if (prefs == null || lanes == null) return;
        boolean routine = DiagnosticLanes.isRoutine(type);
        lanes.record(type, data);
        try {
            if (routine) prefs.edit().putString(KEY_ROUTINE, lanes.routine().toString()).apply();
            else persistCritical();
        } catch (Exception ignored) {
            // Diagnostics must never break playback.
        }
        // 统一事件流：只镜像非 routine 事件（routine 是节拍，不是信息）。这一层不改变原泳道
        // 的任何行为，只是把同一条记录再送一份到跨模块时间线上，便于和前端事件混排。
        if (!routine) {
            io.github.huleixin.tingyu.diagnostics.DiagnosticLog.event(
                "playback",
                levelFor(type),
                type,
                null,
                data
            );
        }
    }

    /**
     * 失败类事件标 warn，其余 info；只影响统一事件流的级别标签。
     *
     * <p>这里刻意不用 error：{@code note()} 在播放线程上被调用，而 error 级别会同步落盘，
     * 会把这个类的类锁一起占住。失败信息本身已经在 type 里，级别只是筛选标签。
     */
    private static String levelFor(String type) {
        if (type == null) return "info";
        String lower = type.toLowerCase(java.util.Locale.ROOT);
        if (lower.contains("error") || lower.contains("fail") || lower.contains("blocked")
            || lower.contains("give-up") || lower.contains("refused")) {
            return "warn";
        }
        return "info";
    }

    /**
     * Merged, oldest-first view of both lanes. Kept for existing callers; new readers should use
     * {@link #snapshotCritical()} / {@link #snapshotRoutine()} so a retry tick can never hide a
     * failure record.
     */
    public static synchronized JSONArray snapshot() {
        return merge(lanes == null ? null : lanes.critical(), lanes == null ? null : lanes.routine());
    }

    public static synchronized JSONArray snapshotCritical() {
        return copy(lanes == null ? null : lanes.critical());
    }

    public static synchronized JSONArray snapshotRoutine() {
        return copy(lanes == null ? null : lanes.routine());
    }

    public static synchronized int epoch() {
        return epoch;
    }

    public static synchronized void clear() {
        lanes = new DiagnosticLanes();
        if (prefs != null) {
            prefs.edit().putString(KEY_CRITICAL, "[]").putString(KEY_ROUTINE, "[]").apply();
        }
    }

    /** Anonymous track identity: a stable short hex digest of the song key, never the key itself. */
    public static String anonKey(String songKey) {
        if (songKey == null || songKey.isEmpty()) return "";
        return Integer.toHexString(songKey.hashCode());
    }

    private static JSONArray load(String key, int max) {
        try {
            JSONArray parsed = new JSONArray(prefs.getString(key, "[]"));
            while (parsed.length() > max) parsed.remove(0);
            return parsed;
        } catch (Exception error) {
            return new JSONArray();
        }
    }

    /** Synchronous: the record must survive the process being killed right after the stop. */
    private static void persistCritical() {
        if (prefs == null || lanes == null) return;
        try {
            prefs.edit().putString(KEY_CRITICAL, lanes.critical().toString()).commit();
        } catch (Exception ignored) {
            try { prefs.edit().putString(KEY_CRITICAL, lanes.critical().toString()).apply(); }
            catch (Exception ignored2) { }
        }
    }

    private static JSONArray copy(JSONArray source) {
        if (source == null) return new JSONArray();
        try {
            return new JSONArray(source.toString());
        } catch (Exception error) {
            return new JSONArray();
        }
    }

    private static JSONArray merge(JSONArray a, JSONArray b) {
        if (a == null) return copy(b);
        if (b == null) return copy(a);
        JSONArray out = new JSONArray();
        try {
            int i = 0, j = 0;
            while (i < a.length() && j < b.length()) {
                long ta = a.optJSONObject(i).optLong("at", 0L);
                long tb = b.optJSONObject(j).optLong("at", 0L);
                if (ta <= tb) out.put(a.get(i++)); else out.put(b.get(j++));
            }
            while (i < a.length()) out.put(a.get(i++));
            while (j < b.length()) out.put(b.get(j++));
        } catch (Exception ignored) {
            return copy(a);
        }
        return out;
    }

    private PlaybackDiagnostics() {}
}
