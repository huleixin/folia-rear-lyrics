package io.github.huleixin.tingyu.resolver;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/**
 * 原生解析所需的凭据，**只放在内存里**。
 *
 * 为什么不用 SharedPreferences 落盘：这里装的是用户在设置里填的后端地址与后端下发的会话串。
 * 落盘等于把凭据复制到一个生命周期更长、更容易被别的东西读走的地方。而后台续播所需要的
 * 只是"本次进程内解析下一首"——进程一旦被杀，Media3 也一起没了，落盘没有任何收益。
 *
 * 因此：由 JS 在前台每次同步歌单时一并刷新；进程结束即消失；不做任何硬编码、不写默认值。
 */
public final class ResolverCredentials {

    private static final Map<String, Map<String, String>> BY_PROVIDER =
        Collections.synchronizedMap(new HashMap<>());

    /** 每次配置的时刻：后台长时间播放时，会话可能早就过期了，必须能说出"配了多久"。 */
    private static final Map<String, Long> STAMPED_AT =
        Collections.synchronizedMap(new HashMap<>());

    private ResolverCredentials() { throw new AssertionError(); }

    public static void configure(String providerId, Map<String, String> values) {
        if (providerId == null || providerId.isEmpty()) return;
        if (values == null || values.isEmpty()) {
            BY_PROVIDER.remove(providerId);
            STAMPED_AT.remove(providerId);
            return;
        }
        BY_PROVIDER.put(providerId, Collections.unmodifiableMap(new HashMap<>(values)));
        STAMPED_AT.put(providerId, System.currentTimeMillis());
    }

    public static void clear(String providerId) {
        if (providerId != null) BY_PROVIDER.remove(providerId);
        if (providerId != null) STAMPED_AT.remove(providerId);
    }

    public static void clearAll() {
        BY_PROVIDER.clear();
        STAMPED_AT.clear();
    }

    /** 这次凭据配了多久；没配返回 -1。后台会话失效排查要用，但永远不写值。 */
    public static long ageMs(String providerId) {
        Long at = providerId == null ? null : STAMPED_AT.get(providerId);
        return at == null ? -1L : Math.max(0L, System.currentTimeMillis() - at);
    }

    public static String value(String providerId, String key) {
        Map<String, String> values = providerId == null ? null : BY_PROVIDER.get(providerId);
        String value = values == null ? null : values.get(key);
        return value == null ? "" : value;
    }

    public static boolean configured(String providerId) {
        Map<String, String> values = providerId == null ? null : BY_PROVIDER.get(providerId);
        return values != null && !values.isEmpty();
    }

    /** 诊断用：只暴露"配了没有"和配了哪些键，绝不暴露值。 */
    public static String describe() {
        if (BY_PROVIDER.isEmpty()) return "none";
        StringBuilder text = new StringBuilder();
        for (Map.Entry<String, Map<String, String>> entry : BY_PROVIDER.entrySet()) {
            if (text.length() > 0) text.append(',');
            text.append(entry.getKey()).append('[').append(String.join("|", entry.getValue().keySet())).append(']');
        }
        return text.toString();
    }
}
