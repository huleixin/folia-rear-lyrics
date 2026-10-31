package io.github.huleixin.tingyu.playback;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/LyricChainLedger.java
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 最近 {@value #CAPACITY} 首的轻量歌词状态账本 + 自动归因（纯逻辑，可 JVM 直测）。
 *
 * <p>为什么必须有它：上一轮排查里，「第 N 首开始没词」这件事本身无法被证伪 —— 因为
 * 「这一首到底是没有词、没取到、取到了没发布、发布了没人收」四种状态在代码里是四个不同的
 * 布尔，日志里散落在四条泳道。这里把每首歌压缩成<b>一行</b>（身份哈希 + 代次 + 结论 +
 * 是否交付背屏 + 是否进过 MediaSession），并给出六类可直接读出的归因码：
 *
 * <ul>
 *   <li>{@code song-missing} —— 这一首确实没有同步歌词（**不是**故障，但要和故障分开统计）；</li>
 *   <li>{@code fetch-failed} —— 取词失败（网络/超预算），可重试，绝不写负缓存；</li>
 *   <li>{@code chain-broken} —— 连续两首以上既没结论也没失败：调度器根本没跑到；</li>
 *   <li>{@code prefetch-stalled} —— 最近三首都不是「提前安排」进来的：预取窗口停止滚动；</li>
 *   <li>{@code ready-not-delivered} —— 有时间轴、也确实播到过，但背屏一次都没拿到；</li>
 *   <li>{@code ready-not-published} —— 有时间轴、也播到过，但会话 metadata 没发布过。</li>
 * </ul>
 *
 * <p>只记事件，不采样、不轮询、不唤醒：每条都是调度/交付那一刻顺手写一行。
 */
public final class LyricChainLedger {

    public static final int CAPACITY = 50;

    public enum Outcome {
        /** 已排进预取窗口，还没有结论。 */
        PLANNED,
        /** 拿到了时间轴。 */
        READY,
        /** 服务端明确回答没有同步歌词。 */
        NONE,
        /** 这次没取到（网络/超预算/取消）：可重试，不是「没有词」。 */
        FAILED
    }

    public static final class Entry {
        public final int seq;
        public final String songKey;
        public int generation;
        /** 是否**曾经**以后面几首的身份被提前安排（预取窗口还在滚动的证据）。 */
        public boolean everAhead;
        /** 是否真的成为过当前曲（只有播到过的歌才谈得上「有词没交付」）。 */
        public boolean played;
        public Outcome outcome = Outcome.PLANNED;
        public String source = "";
        public int lines;
        public int chars;
        /** 背屏真的把这一首渲染出去过（渲染端回报）。 */
        public boolean rearDelivered;
        /** 这一首作为当前曲时，会话 metadata 真的发布过它的时间轴。 */
        public boolean sessionPublished;

        Entry(int seq, String songKey, int generation) {
            this.seq = seq;
            this.songKey = songKey;
            this.generation = generation;
        }

        @Override public String toString() {
            return "#" + seq + " " + PlaybackDiagnostics.anonKey(songKey)
                + " gen=" + generation + " ahead=" + everAhead + " played=" + played
                + " " + outcome + (source.isEmpty() ? "" : "/" + source) + " lines=" + lines
                + " rear=" + rearDelivered + " session=" + sessionPublished;
        }
    }

    private final Map<String, Entry> entries = new LinkedHashMap<String, Entry>(16, 0.75f, false) {
        @Override protected boolean removeEldestEntry(java.util.Map.Entry<String, LyricChainLedger.Entry> eldest) {
            return size() > CAPACITY;
        }
    };
    private int sequence;

    /** 一首歌进了预取窗口（由 {@code onTrackChanged} / 队列同步调用）。 */
    public synchronized void planned(String songKey, int generation, boolean ahead) {
        if (songKey == null || songKey.isEmpty()) return;
        Entry entry = entries.get(songKey);
        if (entry == null) {
            entry = new Entry(++sequence, songKey, generation);
            entries.put(songKey, entry);
        }
        entry.generation = generation;
        if (ahead) {
            entry.everAhead = true;
        } else {
            entry.played = true;
        }
    }

    public synchronized void outcome(String songKey, Outcome outcome, String source, int lines) {
        Entry entry = entries.get(songKey);
        if (entry == null) {
            entry = new Entry(++sequence, songKey, 0);
            entries.put(songKey, entry);
        }
        entry.outcome = outcome;
        if (source != null && !source.isEmpty()) entry.source = source;
        entry.lines = Math.max(0, lines);
    }

    public synchronized void rearDelivered(String songKey, int lines) {
        Entry entry = entries.get(songKey);
        if (entry == null) return;
        entry.rearDelivered = true;
        if (lines > 0) entry.lines = lines;
    }

    public synchronized void sessionPublished(String songKey, int chars) {
        Entry entry = entries.get(songKey);
        if (entry == null) return;
        entry.sessionPublished = true;
        entry.chars = Math.max(0, chars);
    }

    public synchronized void clear() {
        entries.clear();
        sequence = 0;
    }

    public synchronized int size() {
        return entries.size();
    }

    public synchronized Entry entryForTest(String songKey) {
        return entries.get(songKey);
    }

    public synchronized List<Entry> entriesForTest() {
        return new ArrayList<>(entries.values());
    }

    /**
     * 归因码（只返回真的出现了的）。{@code song-missing} 是信息项：
     * 这首歌确实没有同步歌词，属正确行为，但必须能和故障分开看。
     */
    public synchronized List<String> classify() {
        List<String> codes = new ArrayList<>();
        List<Entry> all = new ArrayList<>(entries.values());

        int missing = 0, failed = 0, readyNotDelivered = 0, readyNotPublished = 0;
        for (Entry entry : all) {
            if (entry.outcome == Outcome.NONE) missing++;
            if (entry.outcome == Outcome.FAILED) failed++;
            if (entry.outcome == Outcome.READY && entry.played) {
                if (!entry.rearDelivered) readyNotDelivered++;
                if (!entry.sessionPublished) readyNotPublished++;
            }
        }

        // 连续未终止：调度器没有把结论写回来（任务被丢、线程死、窗口没滚）。
        int trailing = 0;
        for (int index = all.size() - 1; index >= 0; index--) {
            if (all.get(index).outcome != Outcome.PLANNED) break;
            trailing++;
        }
        if (trailing >= 2) codes.add("chain-broken:" + trailing);

        // 预取窗口是否还在滚：最近三首里没有一首是「提前安排」进来的，说明只看得到当前曲。
        int probes = Math.min(3, all.size());
        if (probes == 3) {
            boolean anyAhead = false;
            for (int index = all.size() - probes; index < all.size(); index++) {
                if (all.get(index).everAhead) { anyAhead = true; break; }
            }
            if (!anyAhead) codes.add("prefetch-stalled");
        }

        if (failed > 0) codes.add("fetch-failed:" + failed);
        if (readyNotDelivered > 0) codes.add("ready-not-delivered:" + readyNotDelivered);
        if (readyNotPublished > 0) codes.add("ready-not-published:" + readyNotPublished);
        if (missing > 0) codes.add("song-missing:" + missing);
        return codes;
    }

    /** 除「确实没词」之外还有没有需要处理的结论。 */
    public synchronized boolean healthy() {
        for (String code : classify()) {
            if (!code.startsWith("song-missing")) return false;
        }
        return true;
    }

    /** 一行摘要，进现有诊断（不含歌词正文、不含明文身份）。 */
    public synchronized String describe() {
        int ready = 0, none = 0, failed = 0, planned = 0;
        for (Entry entry : entries.values()) {
            switch (entry.outcome) {
                case READY: ready++; break;
                case NONE: none++; break;
                case FAILED: failed++; break;
                default: planned++; break;
            }
        }
        return "lyricLedger=" + entries.size() + "/" + CAPACITY
            + " ready=" + ready + " none=" + none + " failed=" + failed + " planned=" + planned
            + " codes=" + (classify().isEmpty() ? "ok" : String.join(",", classify()));
    }
}
