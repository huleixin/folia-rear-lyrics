package io.github.huleixin.tingyu.playback;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/LyricTimelineOffset.java
/**
 * 歌词时间轴偏移在三端之间保持一致的支撑件。
 *
 * <h3>偏移的坐标系</h3>
 * <ul>
 *   <li><b>权威坐标</b>：歌词原始时间轴 + 用户偏移（正 = 延后）。三端（舞台、背屏、灵动岛）
 *       最终拿到的每一版 payload 都必须烘焙在同一坐标上。</li>
 *   <li><b>舞台链</b>：JS 侧 {@code buildColorOsLyricInfo(timelineOffsetMs)} 烘焙 —— 一直在做。</li>
 *   <li><b>预取/应答链</b>：JS 侧 {@code nativeLyricPriming.publishTimeline} 烘焙 —— 1.3.67 起。</li>
 *   <li><b>原生兜底链</b>：{@code SongInfoLoader} 取词落库前，用本类记录的偏移烘焙 ——
 *       偏移由 JS 经插件 {@code setLyricOffset} 同步（JS 侧才有单曲/全局偏移的权威值）。</li>
 * </ul>
 *
 * <p>烘焙恰好一次：舞台版在 JS 烘焙、原生版在这里烘焙，两条链互不重入；
 * 权威选择（{@link LyricTimelineAuthority}）之后的所有读端（桥、背屏行构建）都不再加。
 *
 * <p>纯逻辑 + 静态单例，无 Android 依赖；JVM 上逐条断言。
 */
public final class LyricTimelineOffset {

    /** LRC / 逐字行首时间标签：{@code [mm:ss.xx]}、{@code [mm:ss.mmm]}。 */
    private static final Pattern LINE_TAG =
            Pattern.compile("\\[(\\d{1,2}):(\\d{1,2})(?:[.:](\\d{1,3}))?\\]");
    /** 逐字（卡拉OK）词标签：{@code <mm:ss.mmm>} 或 KRC 风格 {@code <start,duration>}。 */
    private static final Pattern WORD_TAG =
            Pattern.compile("<(\\d{1,2}):(\\d{1,2})(?:[.:](\\d{1,3}))?(,[^>]*)?>");

    private static final int MAX_ENTRIES = 32;
    private static final Map<String, Long> PER_SONG = new LinkedHashMap<String, Long>(16, 0.75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<String, Long> eldest) {
            return size() > MAX_ENTRIES;
        }
    };
    private static volatile long globalMs = 0L;

    private LyricTimelineOffset() {}

    /** JS 同步来的单曲偏移（含全局部分，正 = 延后）。 */
    public static void set(String songKey, long offsetMs) {
        if (songKey == null || songKey.isEmpty()) return;
        synchronized (PER_SONG) { PER_SONG.put(songKey, offsetMs); }
    }

    /** 设备级全局偏移（songKey 为空时的兜底值）。 */
    public static void setGlobal(long offsetMs) {
        globalMs = offsetMs;
    }

    /** 这一首生效的偏移；没有单曲记录时退回全局值。 */
    public static long forSong(String songKey) {
        if (songKey != null && !songKey.isEmpty()) {
            synchronized (PER_SONG) {
                Long value = PER_SONG.get(songKey);
                if (value != null) return value;
            }
        }
        return globalMs;
    }

    // ---- 持久化支撑（读写由 Android 层 {@link LyricOffsetPersistence} 完成）----

    /** 全局偏移当前值。 */
    public static synchronized long global() {
        return globalMs;
    }

    /** 单曲偏移的快照（LRU 有界，直接可序列化）。 */
    public static synchronized Map<String, Long> snapshotPerSong() {
        return new LinkedHashMap<>(PER_SONG);
    }

    /** 从持久化恢复；只在进程启动后调用一次（重复调用以最后一次为准）。 */
    public static synchronized void restore(Map<String, Long> perSong, long global) {
        PER_SONG.clear();
        if (perSong != null) {
            for (Map.Entry<String, Long> entry : perSong.entrySet()) {
                if (entry.getKey() == null || entry.getValue() == null) continue;
                PER_SONG.put(entry.getKey(), entry.getValue());
            }
            // 恢复的条目保持 LRU 上界。
            while (PER_SONG.size() > MAX_ENTRIES) {
                PER_SONG.remove(PER_SONG.keySet().iterator().next());
            }
        }
        globalMs = global;
    }

    /**
     * 交付点烘焙：只对「确认是原始时间轴」的 payload 应用用户偏移。
     *
     * <p>{@code offsetKnown=false} 表示来源是 1.3.67 之前的旧缓存 —— 那些内容可能已经
     * 烘焙过一次偏移（当时没有记录用了多少），再烘就是二次偏移。此时原样交付：
     * 旧偏移定格但不叠加，随该版本被正常发布/取词刷新后自动回到「恰好一次」轨道。
     */
    public static String bakeIfKnown(String payloadJson, String songKey, boolean offsetKnown) {
        return offsetKnown ? bake(payloadJson, songKey) : payloadJson;
    }

    /** 换歌清理时不必调用：表是按歌存的，与播放代次无关。测试用。 */
    public static void resetForTest() {
        synchronized (PER_SONG) { PER_SONG.clear(); }
        globalMs = 0L;
    }

    /**
     * 把用户偏移烘焙进 LyricInfo JSON 的时间标签：{@code lyric} / {@code translationLyric} /
     * {@code rawLyric} 三个字段里每个行标签与逐字词标签统一平移 {@code offsetMs}
     * （正 = 延后，负值钳到 0）。偏移为 0 时原样返回，不产生新字符串。
     *
     * <p>JSON 结构解析失败时原样返回：缺偏移的词比坏掉的词好。
     */
    public static String bake(String payloadJson, String songKey) {
        long offsetMs = forSong(songKey);
        if (payloadJson == null || payloadJson.isEmpty() || offsetMs == 0L) return payloadJson;
        try {
            org.json.JSONObject payload = new org.json.JSONObject(payloadJson);
            boolean changed = false;
            for (String field : new String[]{"lyric", "translationLyric", "rawLyric"}) {
                String text = payload.optString(field, "");
                if (text.isEmpty()) continue;
                String shifted = shiftTags(text, offsetMs);
                if (!shifted.equals(text)) { payload.put(field, shifted); changed = true; }
            }
            return changed ? payload.toString() : payloadJson;
        } catch (Exception ignored) {
            return payloadJson;
        }
    }

    /** 平移一段 LRC 文本里的全部时间标签；负结果钳到 0（与原生 LrcParser 的行为一致）。 */
    static String shiftTags(String text, long offsetMs) {
        Matcher lines = LINE_TAG.matcher(text);
        StringBuilder out = new StringBuilder(text.length() + 16);
        int last = 0;
        while (lines.find()) {
            long ms = tagToMs(lines.group(1), lines.group(2), lines.group(3)) + offsetMs;
            out.append(text, last, lines.start());
            out.append('[').append(formatTag(ms)).append(']');
            last = lines.end();
        }
        out.append(text.substring(last));
        String lineShifted = out.toString();

        Matcher words = WORD_TAG.matcher(lineShifted);
        StringBuilder wordOut = new StringBuilder(lineShifted.length() + 16);
        last = 0;
        while (words.find()) {
            long ms = tagToMs(words.group(1), words.group(2), words.group(3)) + offsetMs;
            wordOut.append(lineShifted, last, words.start());
            wordOut.append('<').append(formatTag(ms));
            if (words.group(4) != null) wordOut.append(words.group(4));
            wordOut.append('>');
            last = words.end();
        }
        wordOut.append(lineShifted.substring(last));
        return wordOut.toString();
    }

    private static long tagToMs(String minute, String second, String fraction) {
        long ms = Long.parseLong(minute) * 60_000L + Long.parseLong(second) * 1_000L;
        if (fraction != null) {
            // [.:] 后 1~3 位数字，按小数理解（与 JS parseTimestamp 同语义）。
            ms += Math.round(Double.parseDouble("0." + fraction) * 1000.0);
        }
        return ms;
    }

    /** {@code m:ss.mmm} 三位毫秒格式 —— Bridge 判定正则的推荐写法。 */
    private static String formatTag(long ms) {
        long clamped = Math.max(0L, ms);
        return clamped / 60_000L + ":" + String.format(java.util.Locale.US, "%02d.%03d",
                (clamped % 60_000L) / 1_000L, clamped % 1_000L);
    }
}
