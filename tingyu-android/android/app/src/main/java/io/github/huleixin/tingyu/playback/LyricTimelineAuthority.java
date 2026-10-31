package io.github.huleixin.tingyu.playback;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/LyricTimelineAuthority.java
/**
 * 三端共用的**唯一时间轴版本**：任何一端要拿歌词，都必须从这里取，不许自己选。
 *
 * <p>修的是「三端各自独立取词、独立选版本」这个结构问题。修复前：
 * <ul>
 *   <li>灵动岛读 {@code ColorOsLyricBridge}（谁最后写进去谁算，native 与 stage 会互相顶）；</li>
 *   <li>背屏读 {@code RearNativeLyricLines}（优先桥，其次统一仓库，再其次原生磁盘缓存）；</li>
 *   <li>舞台读自己的 React 状态。</li>
 * </ul>
 * 于是同一首歌可以出现「岛上是原生逐行 LRC、背屏是舞台版、舞台又是另一版」。
 *
 * <p>规则只有一条：<b>{@link UnifiedLyricsStore} 里的记录就是最终选定版本</b>，
 * 由 {@link UnifiedLyricPolicy} 的层级裁决产生。桥（灵动岛的交付通道）不再是版本仲裁者，
 * 它只是「权威版本的一份缓存」，写进去的内容必须是 {@code select} 的返回值。
 *
 * <p>因此三端的版本哈希必然相同：
 * <pre>
 *   舞台 publish ──► UnifiedLyricsStore.put(stage) ─┐
 *   原生 fetch  ──► UnifiedLyricsStore.put(native) ─┼─► select(record) ─► 桥 ─► 灵动岛
 *                                                   │                  └─► 背屏
 *                                                   └─► 舞台（它自己就是这条记录的作者）
 * </pre>
 *
 * <p>纯逻辑，无 Android 依赖；JVM 上逐条断言。
 */
public final class LyricTimelineAuthority {

    public enum State {
        /** 有时间轴，三端都该显示它。 */
        READY,
        /** 已确认这首歌没有同步歌词：显示「无词」是正确行为，不是链路故障。 */
        NONE,
        /** 还没有结论：谁都不许宣告无词。 */
        PENDING
    }

    public static final class Selection {
        public final State state;
        /** {@link State#READY} 时的完整 lyricInfo JSON；其余为 null。 */
        public final String json;
        public final boolean hasTranslation;
        /** 版本哈希（sha1 前 16 位）；非 READY 为空串。三端用它比对是否同一版。 */
        public final String hash;
        /** 统一仓库的 revision；没有记录时 -1。 */
        public final int revision;
        /** 这一版的来源（stage / stage-override / native-lrclib / …）；没有记录时为空串。 */
        public final String sourceId;
        /** json 是否确认是原始时间轴（用户偏移未烘焙）；旧缓存为 false，交付点据此跳过烘焙。 */
        public final boolean offsetKnown;

        Selection(State state, String json, boolean hasTranslation, String hash,
                  int revision, String sourceId) {
            this(state, json, hasTranslation, hash, revision, sourceId, true);
        }

        Selection(State state, String json, boolean hasTranslation, String hash,
                  int revision, String sourceId, boolean offsetKnown) {
            this.state = state;
            this.json = json;
            this.hasTranslation = hasTranslation;
            this.hash = hash == null ? "" : hash;
            this.revision = revision;
            this.sourceId = sourceId == null ? "" : sourceId;
            this.offsetKnown = offsetKnown;
        }

        public boolean ready() {
            return state == State.READY;
        }

        /** 三端比对键：只要这一串相同，三端就是同一首、同一版。 */
        public String versionKey() {
            return state.name().toLowerCase(java.util.Locale.US) + ":" + hash + "@" + revision;
        }

        @Override public String toString() {
            return state.name().toLowerCase(java.util.Locale.US)
                + (state == State.READY ? "(" + sourceId + ",hash=" + hash + ",rev=" + revision + ")" : "");
        }
    }

    private static final Selection PENDING =
        new Selection(State.PENDING, null, false, "", -1, "");

    private LyricTimelineAuthority() {
    }

    public static Selection pending() {
        return PENDING;
    }

    /** 与仓库同一条哈希算法（sha1 前 16 位），保证三端比的是同一个值。 */
    public static String hashOf(String json) {
        if (json == null || json.isEmpty()) return "";
        return UnifiedLyricsStore.shortHash(json);
    }

    /**
     * 选出这一首的三端共用版本。
     *
     * @param record    {@link UnifiedLyricsStore} 在本次写入**之后**读回的记录（可能为 null）
     * @param incoming  刚刚到达、试图发布的 payload（舞台推来的 / 原生刚取到的）；可为空
     * @param incomingHasTranslation incoming 是否带翻译 lane
     */
    public static Selection select(UnifiedLyricsStore.Record record, String incoming,
                                   boolean incomingHasTranslation) {
        return select(record, incoming, incomingHasTranslation, true);
    }

    /**
     * 同上；{@code incomingOffsetKnown} 说明桥上那份 payload 是否确认原始
     * （桥是内存缓存，进程重启即空；只有从旧版仓库记录搬进来的内容才可能是 false）。
     */
    public static Selection select(UnifiedLyricsStore.Record record, String incoming,
                                   boolean incomingHasTranslation, boolean incomingOffsetKnown) {
        if (record != null && record.hasTimeline()) {
            // 仓库是最终选定版本：即使 incoming 与它不同（层级被拒、或舞台稍后才到），
            // 三端也必须用它 —— 否则「岛上是 A 版、背屏是 B 版」。
            return new Selection(State.READY, record.json, record.hasTranslation,
                record.lyricsHash, record.revision, record.sourceId, record.offsetKnown);
        }
        if (record != null && "none".equals(record.status)) {
            return new Selection(State.NONE, null, false, "", record.revision, record.sourceId);
        }
        if (incoming != null && !incoming.isEmpty()) {
            // 仓库还没有记录（异步落盘前、或没有 songKey 的老调用方）：这一份就是唯一候选。
            return new Selection(State.READY, incoming, incomingHasTranslation,
                hashOf(incoming), -1, "", incomingOffsetKnown);
        }
        if (record != null) {
            // 有记录但既没有时间轴也不是「确认无词」：还没结论，继续等。
            return PENDING;
        }
        return PENDING;
    }

    /** 背屏/诊断只关心状态时的快捷入口。 */
    public static State stateOf(UnifiedLyricsStore.Record record, String incoming) {
        return select(record, incoming, false).state;
    }

    // ---- 落库 + 仲裁：写者与测试共用同一段代码，避免「插件里一套、调度器里另一套」 ----

    /**
     * 前台歌词舞台发布一版：落库（stage 层级）→ 回读 → 仲裁。
     *
     * @return 三端共用的版本；调用方把它写进桥与会话，不要再写 {@code incoming}。
     */
    public static Selection commitStage(UnifiedLyricsStore store, String songKey, String incoming,
                                        boolean hasTranslation, boolean hasWordByWord,
                                        String sourceId, boolean userChoice, String variantRule) {
        if (store == null || songKey == null || songKey.isEmpty()) {
            return select(null, incoming, hasTranslation);
        }
        if (incoming == null || incoming.isEmpty()) {
            return select(store.get(songKey), null, hasTranslation);
        }
        store.put(songKey, "ok", incoming, hasTranslation, hasWordByWord,
                sourceId == null || sourceId.isEmpty() ? "stage" : sourceId,
                "stage", userChoice, variantRule == null ? "off" : variantRule);
        return select(store.get(songKey), incoming, hasTranslation);
    }

    /**
     * 原生后台取词拿到一版：落库（native 层级）→ 回读 → 仲裁。
     *
     * <p>关键在回读：如果仓库里已经存在更高层级（stage / 用户选定）的版本，这一次的
     * {@code put} 会被 {@link UnifiedLyricPolicy} 拒绝，返回值就必须是仓库里那一版 ——
     * 这正是「灵动岛显示原生逐行 LRC、而背屏与舞台是舞台版」的根治点。
     */
    public static Selection commitNative(UnifiedLyricsStore store, String songKey, String incoming,
                                         boolean hasTranslation, String sourceId, String variantRule) {
        if (store == null || songKey == null || songKey.isEmpty()) {
            return select(null, incoming, hasTranslation);
        }
        if (incoming == null || incoming.isEmpty()) {
            return select(store.get(songKey), null, hasTranslation);
        }
        store.put(songKey, "ok", incoming, hasTranslation, false,
                sourceId == null || sourceId.isEmpty() ? "native" : sourceId,
                "native", false, variantRule == null ? "off" : variantRule);
        return select(store.get(songKey), incoming, hasTranslation);
    }

    /**
     * 宣告「这一首没有词」：落一条 none 记录 → 回读 → 仲裁。
     *
     * <p>返回 {@link State#READY} 表示仓库里**还留着**有效时间轴（用户手动选定过、
     * 或原生后台后来取到了）——此时调用方绝不能把桥清空，只能把仓库那一版重新写回去。
     */
    public static Selection commitNone(UnifiedLyricsStore store, String songKey, String sourceId,
                                       String variantRule) {
        if (store == null || songKey == null || songKey.isEmpty()) return PENDING;
        store.put(songKey, "none", null, false, false,
                sourceId == null || sourceId.isEmpty() ? "stage" : sourceId,
                "stage", false, variantRule == null ? "off" : variantRule);
        return select(store.get(songKey), null, false);
    }
}
