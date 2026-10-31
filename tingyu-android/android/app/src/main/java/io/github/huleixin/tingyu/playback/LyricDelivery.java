package io.github.huleixin.tingyu.playback;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/LyricDelivery.java
/**
 * 「这一首现在能不能出词」的唯一判定（纯函数，无 Android 依赖）。
 *
 * <p>修的是一个把「有词」判成「无词」的次序错误：背屏取词入口以前**先**读原生磁盘缓存，
 * 而原生磁盘缓存里有一条 {@code status=none} 的负记录（LRCLIB + 酷狗两个源都没命中时写的，
 * TTL 三天）。只要这条记录在，入口就直接返回 0 行，**再也不会**去看 ColorOS 歌词桥或统一
 * 歌词仓库 —— 哪怕前台舞台刚刚确认过这首歌的完整时间轴。QQ/网易云独占曲、以及任何
 * LRCLIB 没收的中文歌都会踩中，表现就是「个别歌曲没有歌词」且重开 App 才恢复。
 *
 * <p>所以判定次序必须是：**任何一处有时间轴 → READY**；只有三处都没有时间轴、且确实存在
 * 「服务端明确无词」的结论时才是 NONE；其余一律 PENDING（继续等，不冒充无词）。
 *
 * <p>三个来源的可信度顺序只用于给诊断标注来源，不影响 READY/NONE 的结论：
 * <ol>
 *   <li>{@code bridge} —— ColorOS 歌词桥的内存表（前台舞台刚发布的版本，最全：可能带逐字/翻译）；</li>
 *   <li>{@code unified} —— 统一歌词仓库（落盘，进程重启后仍然在）；</li>
 *   <li>{@code native-cache} —— 原生取词自己的磁盘缓存（LRCLIB / 酷狗逐行 LRC）。</li>
 * </ol>
 */
public final class LyricDelivery {

    public enum State {
        /** 有时间轴，可以直接渲染。 */
        READY,
        /** 已确认没有同步歌词：显示「无词」是正确行为，不是链路故障。 */
        NONE,
        /** 还没有结论：必须继续等待，绝不能当成无词。 */
        PENDING
    }

    public static final class Decision {
        public final State state;
        /** 时间轴来自哪里；NONE/PENDING 时为空串。 */
        public final String source;

        Decision(State state, String source) {
            this.state = state;
            this.source = source;
        }

        public boolean ready() {
            return state == State.READY;
        }

        @Override public String toString() {
            return state.name().toLowerCase(java.util.Locale.US) + (source.isEmpty() ? "" : ":" + source);
        }
    }

    public static final Decision NONE = new Decision(State.NONE, "");
    public static final Decision PENDING = new Decision(State.PENDING, "");

    private LyricDelivery() {
    }

    /**
     * @param bridgeTimeline   歌词桥内存表里有这一首的时间轴
     * @param unifiedTimeline  统一歌词仓库里有这一首的时间轴
     * @param nativeTimeline   原生取词磁盘缓存里有这一首的时间轴
     * @param confirmedNone    任一处宣告过「这一首没有同步歌词」（桥上的 noLyric 标记或原生负记录）
     */
    public static Decision decide(boolean bridgeTimeline, boolean unifiedTimeline,
                                  boolean nativeTimeline, boolean confirmedNone) {
        if (bridgeTimeline) return new Decision(State.READY, "bridge");
        if (unifiedTimeline) return new Decision(State.READY, "unified");
        if (nativeTimeline) return new Decision(State.READY, "native-cache");
        // 负结论只在「谁都没有时间轴」时才成立：它记录的是**当时**某条链没词，
        // 而不是这首歌永远没有词（舞台可能之后才确认，用户也可能手动匹配）。
        if (confirmedNone) return NONE;
        return PENDING;
    }

    /** 与 {@link #decide} 同义，给只关心状态的调用方（渲染器、账本）。 */
    public static State stateOf(boolean bridgeTimeline, boolean unifiedTimeline,
                                boolean nativeTimeline, boolean confirmedNone) {
        return decide(bridgeTimeline, unifiedTimeline, nativeTimeline, confirmedNone).state;
    }
}
