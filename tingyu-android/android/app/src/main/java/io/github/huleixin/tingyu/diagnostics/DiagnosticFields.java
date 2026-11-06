package io.github.huleixin.tingyu.diagnostics;

import org.json.JSONObject;

import java.util.Iterator;
import java.util.Locale;

// android/app/src/main/java/io/github/huleixin/tingyu/diagnostics/DiagnosticFields.java
/**
 * 事件字段的白名单过滤器（纯 JVM，可单测）。
 *
 * <p>诊断日志最大的隐私风险不是「写了密码」，而是调用方顺手把整份响应体塞进 fields：
 * 里面可能有账号、Cookie、完整歌词、音频地址。这里只放行标量，并把键名命中敏感词的字段
 * 整条丢掉 —— 宁可少一条上下文，也不让用户的私人数据离开设备。
 */
public final class DiagnosticFields {
    public static final int MAX_VALUE_CHARS = 240;
    static final int MAX_KEY_CHARS = 32;

    private DiagnosticFields() {}

    /** 只保留 String / Number / Boolean；对象、数组、null 一律丢弃。 */
    public static JSONObject sanitize(JSONObject fields) {
        if (fields == null) return null;
        JSONObject out = new JSONObject();
        Iterator<String> keys = fields.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            if (key == null || key.isEmpty() || isSensitiveKey(key)) continue;
            Object value = fields.opt(key);
            try {
                if (value == null || value == JSONObject.NULL) continue;
                if (value instanceof Boolean || value instanceof Number) {
                    out.put(limit(key, MAX_KEY_CHARS), value);
                } else if (value instanceof String) {
                    out.put(limit(key, MAX_KEY_CHARS), limit((String) value, MAX_VALUE_CHARS));
                }
                // 其它类型（JSONObject / JSONArray / 集合）直接丢弃。
            } catch (Exception ignored) {
                // 单个字段失败不影响其它字段。
            }
        }
        return out;
    }

    /**
     * 敏感键判定。刻意做得宽：多丢一个 bpm、少丢一个 token，代价完全不对等。
     * 命中即整条字段不落盘。
     */
    public static boolean isSensitiveKey(String key) {
        if (key == null) return true;
        String lower = key.toLowerCase(Locale.ROOT);
        return lower.contains("token") || lower.contains("cookie") || lower.contains("password")
            || lower.contains("secret") || lower.contains("authorization") || lower.contains("uin")
            || lower.contains("phone") || lower.contains("email") || lower.contains("lyric")
            || lower.contains("path") || lower.contains("file") || lower.contains("url")
            || lower.contains("nickname") || lower.contains("account");
    }

    public static String limit(String value, int max) {
        if (value == null) return "";
        String text = value.replace('\u0000', ' ').trim();
        return text.length() <= max ? text : text.substring(0, max) + "…";
    }
}
