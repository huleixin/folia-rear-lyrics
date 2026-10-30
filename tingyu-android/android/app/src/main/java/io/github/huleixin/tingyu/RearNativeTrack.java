package io.github.huleixin.tingyu;

import android.os.SystemClock;

import com.getcapacitor.JSObject;

import org.json.JSONObject;

// android/app/src/main/java/io/github/huleixin/tingyu/RearNativeTrack.java
/**
 * 背屏的「当前歌曲」权威来源：直接由 Media3 的真实 MediaItem 喂养，不经过主界面 WebView。
 *
 * <p>为什么需要它：背屏的歌词/时钟原本只有一条来源 —— 主界面 WebView 里的
 * {@code useRearLyricsPublisher} 每 100 ms 调一次 {@code publishRearLyricsSnapshot}。锁屏或
 * 切到后台后 Chromium 冻结这个 WebView，发布就停了；背屏页面只能拿最后一次快照里的
 * {@code timelineId/currentTime} 往前外推，于是第一首播完后时间轴越过末句、索引夹在最后一行，
 * 而背景动画（rAF，不依赖快照）照常运行 —— 现象正是「歌词停在第一首最后一屏、背景还在动」。
 *
 * <p>所以这里只做一件事：以 {@code MediaItem.mediaId}（songKey）为身份，暴露一个可以随时读取的
 * 当前歌曲 + 播放位置。{@code epoch} 在真实换曲时递增，异步结果用它做代次校验，旧歌的回调永远
 * 无法覆盖新歌。
 *
 * <p>位置是锚点 + 单调时钟外推，不轮询播放器：读取全部在应用线程内完成，非线程安全地调用
 * {@code Player} 会直接抛 {@code IllegalStateException}。
 */
public final class RearNativeTrack {

    private static volatile String songKey = "";
    private static volatile String title = "";
    private static volatile String artist = "";
    private static volatile String epoch = "";
    private static volatile long generation = 0L;
    private static volatile long durationMs = 0L;
    private static volatile long positionMs = 0L;
    private static volatile long anchorAt = 0L;
    private static volatile boolean playing = false;
    private static volatile long updatedAt = 0L;

    private RearNativeTrack() {}

    /** 真实换曲（Media3 onMediaItemTransition）。seq 由引擎给，保证同一个 MediaItem 不会被重复计为新曲。 */
    public static synchronized void onTrack(String key, JSObject queued) {
        String next = key == null ? "" : key;
        if (next.equals(songKey)) {
            // Same item re-announced (seek / re-prepare): update metadata, keep the epoch.
            if (queued != null) applyMeta(queued);
            return;
        }
        songKey = next;
        generation += 1;
        epoch = next + "#" + generation;
        positionMs = 0L;
        anchorAt = SystemClock.elapsedRealtime();
        durationMs = 0L;
        playing = false;
        updatedAt = System.currentTimeMillis();
        if (queued != null) applyMeta(queued);
    }

    private static void applyMeta(JSObject queued) {
        String nextTitle = queued.optString("title", "");
        String nextArtist = queued.optString("artist", "");
        long nextDuration = queued.optLong("durationMs", 0L);
        if (!nextTitle.isEmpty()) title = nextTitle;
        if (!nextArtist.isEmpty()) artist = nextArtist;
        if (nextDuration > 0L) durationMs = nextDuration;
    }

    /** Play/pause 与位置同步；由引擎在应用线程上调用。 */
    public static synchronized void onPlayback(boolean isPlaying, long positionMsNow) {
        if (songKey.isEmpty()) return;
        if (positionMsNow >= 0L) {
            positionMs = positionMsNow;
            anchorAt = SystemClock.elapsedRealtime();
        }
        playing = isPlaying;
        updatedAt = System.currentTimeMillis();
    }

    /** 时长补齐（Media3 的 duration 在换曲瞬间常常还是 TIME_UNSET）。 */
    public static synchronized void onDuration(long valueMs) {
        if (valueMs > 0L) durationMs = valueMs;
    }

    public static String songKey() { return songKey; }
    public static String epoch() { return epoch; }
    public static long generation() { return generation; }
    public static boolean hasTrack() { return !songKey.isEmpty(); }

    /** 锚点外推；暂停时就是暂停那一刻的位置。 */
    public static long positionNow() {
        if (!playing) return positionMs;
        long delta = SystemClock.elapsedRealtime() - anchorAt;
        return positionMs + Math.max(0L, delta);
    }

    /** 幂等快照；字段名与背屏页面的字段一一对应，缺失时给 0 或空串而不是 null。 */
    public static JSONObject snapshot() {
        JSONObject value = new JSONObject();
        try {
            long position = positionNow();
            if (durationMs > 0L && position > durationMs) position = durationMs;
            value.put("songKey", songKey);
            value.put("epoch", epoch);
            value.put("generation", generation);
            value.put("title", title);
            value.put("artist", artist);
            value.put("durationMs", Math.max(0L, durationMs));
            value.put("positionMs", Math.max(0L, position));
            value.put("playing", playing);
            value.put("sentAtMs", System.currentTimeMillis());
            value.put("updatedAtMs", updatedAt);
        } catch (Exception ignored) {
            // JSONObject only rejects non-finite numbers, which are already clamped above.
        }
        return value;
    }

    static synchronized void reset() {
        songKey = ""; title = ""; artist = ""; epoch = "";
        durationMs = 0L; positionMs = 0L; anchorAt = 0L; playing = false; updatedAt = 0L;
    }
}
