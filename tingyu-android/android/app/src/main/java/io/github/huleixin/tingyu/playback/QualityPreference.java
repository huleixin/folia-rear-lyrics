package io.github.huleixin.tingyu.playback;

/**
 * 后台解析时用的偏好音质。由 JS 在同步逻辑歌单时一并下发，不落盘（进程内即可）。
 *
 * 为什么单独一个小类：后台链路拿不到 React 的 store，而音质档位直接决定解析器要走哪一档
 * 请求。缺省 high 与前端 `audioQuality` 的默认值保持一致。
 */
public final class QualityPreference {

    private static volatile String value = "high";

    private QualityPreference() { throw new AssertionError(); }

    public static void set(String quality) {
        if (quality == null || quality.isEmpty()) return;
        value = quality;
    }

    public static String get() {
        return value;
    }

    public static void resetForTest() {
        value = "high";
    }
}
