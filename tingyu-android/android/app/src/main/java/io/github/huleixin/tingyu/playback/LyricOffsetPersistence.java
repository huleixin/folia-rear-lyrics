package io.github.huleixin.tingyu.playback;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/LyricOffsetPersistence.java
/**
 * 歌词偏移的持久化（进程重建后原生兜底取词仍能拿到正确偏移）。
 *
 * <p>偏移的<b>权威值在 JS 侧</b>（单曲手动 + 设备全局），由 {@code setLyricOffset} 随
 * 发布同步给原生；这里只做原生的镜像落盘，用于「WebView 还没启动、后台已经在取词」
 * 的窗口 —— 没有它，进程重建后原生兜底出词的偏移全部归零，用户校准过的蓝牙延迟
 * 在冷启动后的第一首歌上丢失。
 *
 * <p>只复用 {@link LyricTimelineOffset} 这一份内存权威（快照/恢复），不构成第二套权威：
 * JS 的下一次同步永远覆盖这里。单曲条目沿用同一 LRU 上界。
 */
public final class LyricOffsetPersistence {

    private static final String PREFS = "lyric-offsets";
    private static final String KEY_GLOBAL = "globalMs";
    private static final String KEY_PER_SONG = "perSong";
    private static final String KEY_LOADED = "loadedInFlight";

    private static volatile boolean loaded = false;

    private LyricOffsetPersistence() {}

    /** 幂等加载：进程内只真正读一次盘，之后的权威回到 JS 同步。 */
    public static void loadOnce(Context context) {
        if (loaded) return;
        synchronized (LyricOffsetPersistence.class) {
            if (loaded) return;
            try {
                SharedPreferences prefs = context.getApplicationContext()
                        .getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                long global = prefs.getLong(KEY_GLOBAL, 0L);
                Map<String, Long> perSong = new LinkedHashMap<>();
                String raw = prefs.getString(KEY_PER_SONG, null);
                if (raw != null && !raw.isEmpty()) {
                    JSONObject map = new JSONObject(raw);
                    Iterator<String> keys = map.keys();
                    while (keys.hasNext()) {
                        String key = keys.next();
                        perSong.put(key, map.getLong(key));
                    }
                }
                LyricTimelineOffset.restore(perSong, global);
            } catch (Throwable ignored) {
                // 读不出持久化就保持内存值：偏移丢失只影响校准，不影响播放。
            } finally {
                loaded = true;
            }
        }
    }

    /** JS 同步偏移之后调用：把当前内存权威镜像到盘上。失败静默（下次同步再写）。 */
    public static void save(Context context) {
        if (context == null) return;
        try {
            Map<String, Long> perSong = LyricTimelineOffset.snapshotPerSong();
            JSONObject map = new JSONObject();
            for (Map.Entry<String, Long> entry : perSong.entrySet()) {
                map.put(entry.getKey(), entry.getValue().longValue());
            }
            context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putLong(KEY_GLOBAL, LyricTimelineOffset.global())
                    .putString(KEY_PER_SONG, map.toString())
                    .apply();
        } catch (Throwable ignored) {
            // 落盘失败不影响本次播放；下一次 JS 同步会重写。
        }
    }
}
