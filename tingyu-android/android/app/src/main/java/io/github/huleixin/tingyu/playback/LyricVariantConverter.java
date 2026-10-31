package io.github.huleixin.tingyu.playback;

import android.content.Context;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

import io.github.huleixin.tingyu.R;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/LyricVariantConverter.java
/**
 * 歌词简繁转换（原生侧）。
 *
 * <p>统一歌词数据源要求三端应用**同一条**简繁规则。Web 端用 opencc-js（带词组表）；
 * 原生端拿不到词组引擎，这里用同一套 OpenCC 词表导出的**单字**映射
 * （{@code res/raw/lyric_t2s_pairs.txt}，3448 对，由 opencc-js 枚举 CJK 区生成），
 * 覆盖后台独立取词（LRCLIB / 酷狗）可能带回来的繁体歌词。
 *
 * <p>设计约束：
 * <ul>
 *   <li>规则只有 {@code off} 与 {@code t2s} 两种；由 Web 通过插件
 *       {@code setVariantRule} 同步，落在本进程 SharedPreferences；</li>
 *   <li>转换只作用于原生取词结果；统一仓库里来自前台（舞台）的记录已经由 Web 转换过，
 *       原样转发，**不再二次转换**（幂等性由「记录里带 variantRule」保证）；</li>
 *   <li>单字映射不处理词组级差异（如「皇后/皇後」），这类场景由统一仓库向前台版本收敛兜底：
 *       舞台一旦确认过这首歌，后台用的就是舞台那份已转换的文本。</li>
 * </ul>
 */
public final class LyricVariantConverter {

    /** 统一简繁规则。 */
    public enum Rule {
        OFF("off"),
        T2S("t2s");

        public final String id;

        Rule(String id) {
            this.id = id;
        }

        public static Rule of(String value) {
            return "t2s".equalsIgnoreCase(value) ? T2S : OFF;
        }
    }

    private static final Object LOCK = new Object();
    private static volatile Map<String, String> t2sMap = null;

    private LyricVariantConverter() {
    }

    /** 当前生效的规则（Web 通过 {@code setVariantRule} 写入；默认 off）。 */
    public static Rule currentRule(Context context) {
        try {
            return Rule.of(prefs(context).getString("variantRule", "off"));
        } catch (Throwable error) {
            return Rule.OFF;
        }
    }

    /** Web 侧同步规则过来；返回规则是否真的变化（变了需要三端重新收敛）。 */
    public static boolean setRule(Context context, String value) {
        Rule next = Rule.of(value);
        String previous;
        synchronized (LOCK) {
            previous = prefs(context).getString("variantRule", "off");
            prefs(context).edit().putString("variantRule", next.id).apply();
        }
        return !previous.equals(next.id);
    }

    private static android.content.SharedPreferences prefs(Context context) {
        return context.getApplicationContext()
                .getSharedPreferences("unified-lyrics", Context.MODE_PRIVATE);
    }

    /**
     * 按当前规则转换一段 LRC 文本（保留行结构、时间标签与空白，只替换汉字）。
     */
    public static String convertLrcText(Context context, String text) {
        Rule rule = currentRule(context);
        if (rule != Rule.T2S || text == null || text.isEmpty()) return text;
        return convert(context, text);
    }

    /**
     * 对一份已构建好的 {@code lyricInfo} JSON 做转换：只动 {@code lyric} 与
     * {@code translationLyric} 两条 lane 的正文，其余字段（身份、时间轴之外的元数据）原样。
     * 输入不是合法 JSON 或没有这两条 lane 时原串返回。
     */
    public static String convertLyricInfoJson(Context context, String json) {
        Rule rule = currentRule(context);
        if (rule != Rule.T2S || json == null || json.isEmpty()) return json;
        try {
            org.json.JSONObject payload = new org.json.JSONObject(json);
            boolean changed = false;
            String lyric = payload.optString("lyric", null);
            if (lyric != null && !lyric.isEmpty()) {
                String converted = convert(context, lyric);
                if (!converted.equals(lyric)) {
                    payload.put("lyric", converted);
                    changed = true;
                }
            }
            if (payload.has("translationLyric")) {
                String translation = payload.optString("translationLyric", "");
                if (!translation.isEmpty()) {
                    String converted = convert(context, translation);
                    if (!converted.equals(translation)) {
                        payload.put("translationLyric", converted);
                        changed = true;
                    }
                }
            }
            return changed ? payload.toString() : json;
        } catch (Throwable error) {
            return json;
        }
    }

    static String convert(Context context, String text) {
        return convert(text, loadMap(context));
    }

    /** 逻辑与映射表解耦，便于 JVM 测试。 */
    static String convert(String text, Map<String, String> map) {
        if (map == null || map.isEmpty() || text == null || text.isEmpty()) return text;
        StringBuilder out = null;
        int start = 0;
        final int length = text.length();
        for (int i = 0; i < length; i++) {
            String replacement = map.get(text.substring(i, i + 1));
            if (replacement != null) {
                if (out == null) out = new StringBuilder(length);
                out.append(text, start, i).append(replacement);
                start = i + 1;
            }
        }
        if (out == null) return text;
        out.append(text, start, length);
        return out.toString();
    }

    private static Map<String, String> loadMap(Context context) {
        Map<String, String> cached = t2sMap;
        if (cached != null) return cached;
        synchronized (LOCK) {
            if (t2sMap != null) return t2sMap;
            Map<String, String> map = new HashMap<>(4096);
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                    context.getResources().openRawResource(R.raw.lyric_t2s_pairs), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    String trimmed = line.trim();
                    // 每行两个字符：繁 -> 简。BMP 之外的补充平面字符是 surrogate 对，长度为 2+2。
                    if (trimmed.isEmpty()) continue;
                    int split = trimmed.indexOf('\t');
                    if (split < 0) split = trimmed.indexOf(' ');
                    String from;
                    String to;
                    if (split > 0) {
                        from = trimmed.substring(0, split);
                        to = trimmed.substring(split + 1).trim();
                    } else if (trimmed.length() % 2 == 0) {
                        // 兼容无分隔符写法（成对紧排）。
                        from = trimmed.substring(0, trimmed.length() / 2);
                        to = trimmed.substring(trimmed.length() / 2);
                    } else {
                        continue;
                    }
                    if (!from.isEmpty() && !to.isEmpty()) map.put(from, to);
                }
            } catch (IOException | android.content.res.Resources.NotFoundException error) {
                // 表读不到就按「不转换」处理：歌词照常显示，只是不做简繁归一。
            }
            t2sMap = map;
            return map;
        }
    }
}
