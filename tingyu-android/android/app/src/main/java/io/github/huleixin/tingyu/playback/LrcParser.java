package io.github.huleixin.tingyu.playback;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/LrcParser.java
/**
 * LRC → 行时间轴。纯函数，无 Android 依赖，便于 JVM 单测。
 *
 * <p>只解析**时间轴**，不做任何歌词来源特有的猜测：
 * <ul>
 *   <li>{@code [mm:ss]} / {@code [mm:ss.x]} / {@code [mm:ss.xxx]} 三种写法都接受（LRCLIB 用两位，QQ 与多数
 *       KRC 转换用三位）；</li>
 *   <li>一行多个时间标签（{@code [00:10.00][01:20.00]副歌}）展开成多条记录；</li>
 *   <li>{@code [offset:±ms]} 统一加到每一行上，负数钳到 0；</li>
 *   <li>时间**单调不减**——协议要求行起点不得倒退，倒退的行会让整块时间轴错位；</li>
 *   <li>同一时间戳连续出现两次时，第二条视为翻译（中英对照 LRC 的通行写法）。</li>
 * </ul>
 *
 * <p>不做逐字（word-by-word）：LRCLIB 的 {@code hasWordSync} 走的是 lyricsfile YAML，客户端侧没有
 * 可靠的字级时间轴可解析；伪造均匀扫光比没有更糟（见 colorOsLyricInfo.ts 的约定），所以这里
 * 只产出逐行 lane，原生补词的可达边界如实就是「逐行 + 翻译」。
 */
public final class LrcParser {

    /** `[mm:ss]`、`[mm:ss.x]`、`[mm:ss.xxx]`，允许冒号分隔毫秒（少见但存在）。 */
    private static final Pattern TIME_TAG =
            Pattern.compile("\\[(\\d{1,3}):(\\d{1,2})(?:[.:](\\d{1,3}))?\\]");
    private static final Pattern OFFSET_TAG = Pattern.compile("\\[offset\\s*:\\s*([+-]?\\d+)\\]",
            Pattern.CASE_INSENSITIVE);

    public static final class Line {
        public final long startMs;
        public final String text;
        public String translation = "";

        Line(long startMs, String text) {
            this.startMs = startMs;
            this.text = text;
        }
    }

    private LrcParser() {
    }

    /** 解析结果；{@code lines} 为空表示这段文本没有可用的时间轴。 */
    public static List<Line> parse(String lrc) {
        if (lrc == null || lrc.isEmpty()) return Collections.emptyList();
        long offsetMs = readOffset(lrc);
        List<Line> out = new ArrayList<>();
        long lastStart = -1L;
        String previousText = "";
        long previousStart = -1L;
        for (String raw : lrc.split("\r?\n")) {
            String row = raw == null ? "" : raw.trim();
            if (row.isEmpty()) continue;
            Matcher matcher = TIME_TAG.matcher(row);
            List<Long> starts = new ArrayList<>(2);
            int end = 0;
            while (matcher.find()) {
                starts.add(tagToMs(matcher) + offsetMs);
                end = matcher.end();
            }
            if (starts.isEmpty()) continue;
            String text = sanitize(row.substring(end));
            for (int i = 0; i < starts.size(); i++) {
                // 一行多个标签时只有最后一次出现的文本归属所有标签，这是 LRC 的通行行为。
                long start = Math.max(0L, starts.get(i));
                if (text.isEmpty()) continue;
                boolean sameStart = start == previousStart;
                if (sameStart && !previousText.isEmpty() && !text.equals(previousText) && !out.isEmpty()) {
                    Line last = out.get(out.size() - 1);
                    if (last.translation.isEmpty()) {
                        last.translation = text;
                        continue;
                    }
                }
                int sizeBefore = out.size();
                long clamped = Math.max(start, lastStart);
                lastStart = clamped;
                out.add(new Line(clamped, text));
                if (out.size() > sizeBefore) {
                    previousStart = start;
                    previousText = text;
                }
            }
        }
        return out;
    }

    private static long tagToMs(Matcher matcher) {
        int minutes = parseInt(matcher.group(1));
        int seconds = parseInt(matcher.group(2));
        String fraction = matcher.group(3);
        int millis = 0;
        if (fraction != null && !fraction.isEmpty()) {
            // `[00:01.5]` 是 500ms，`[00:01.50]` 也是 500ms —— 按小数位补齐，而不是当整数毫秒。
            millis = parseInt(fraction);
            if (fraction.length() == 1) millis *= 100;
            else if (fraction.length() == 2) millis *= 10;
        }
        return minutes * 60_000L + seconds * 1_000L + millis;
    }

    private static long readOffset(String lrc) {
        Matcher matcher = OFFSET_TAG.matcher(lrc);
        if (!matcher.find()) return 0L;
        try {
            return Long.parseLong(matcher.group(1));
        } catch (NumberFormatException error) {
            return 0L;
        }
    }

    private static int parseInt(String value) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException error) {
            return 0;
        }
    }

    /** 换行/制表/控制字符必须干掉：一行就是一条时间轴记录，文本里带换行会把一条拆成两条。 */
    static String sanitize(String text) {
        if (text == null) return "";
        StringBuilder builder = new StringBuilder(text.length());
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '\r' || c == '\n' || c == '\t') builder.append(' ');
            else if (c < 0x20 || c == 0x7f) continue;
            else builder.append(c);
        }
        return builder.toString().trim();
    }
}
