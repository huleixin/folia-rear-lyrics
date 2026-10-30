package io.github.huleixin.tingyu.playback;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/**
 * 逻辑播放列表的原生副本 —— 阶段 A。
 *
 * 这是"下一首是谁"的权威。之前这个问题只能由 WebView 回答：Media3 播完窗口里的最后一首就停下，
 * 因为**没有任何一个原生字段**写着后面还有哪首歌。后台页面被冻结时，那个答案永远不来。
 *
 * 这里存的是 JS 在前台同步下来的**播放顺序**（随机模式时 JS 已经洗好牌），所以原生的推进规则
 * 就是"游标 +1"，不需要在 Kotlin 里复刻任何洗牌算法，也不会和 JS 的随机序列打架。
 *
 * 与 Media3 队列的关系：
 * - Media3 队列是**已解析地址的窗口**，最多几首，且随时会被换掉；
 * - 这里是**逻辑歌单**，可以几十上百首，只存身份与引用，不存播放地址；
 * - 两者靠 songKey 对账。任何时候两者不一致，以 Media3 的真实位置为准（它才是播到哪了），
 *   逻辑列表只负责回答"再往后是谁"。
 *
 * 所有实例方法都是纯的：不碰 Android、不碰 Media3，因此整个推进规则可以在 JVM 上直接测。
 */
public final class NativePlaylist {

    public enum Mode {
        /** 顺序播放，播完最后一首结束。 */
        SEQUENCE,
        /** 列表循环。 */
        LOOP_ALL,
        /** 单曲循环：原生不推进。 */
        REPEAT_ONE,
        /** 随机：JS 同步时已给出洗好的顺序，走到头是否回头看 loopAll。 */
        SHUFFLE
    }

    public enum Outcome { ADVANCE, REPEAT_CURRENT, END }

    /** 逻辑歌单里的一首。只带身份与引用，绝不带播放地址（地址会过期）。 */
    public static final class Track {
        public final String songKey;
        public final String providerId;
        public final String mediaId;
        public final String title;
        public final String artist;
        public final String album;
        public final long durationMs;
        /** 封面地址，只用于 MediaMetadata，不参与播放。 */
        public final String artwork;
        /** 音源引用里解析地址要用的补充数据（如 QQ 的 mediaMid）。 */
        public final String providerData;

        public Track(String songKey, String providerId, String mediaId, String title, String artist,
                     String album, long durationMs, String artwork, String providerData) {
            this.songKey = songKey == null ? "" : songKey;
            this.providerId = providerId == null ? "" : providerId;
            this.mediaId = mediaId == null ? "" : mediaId;
            this.title = title == null ? "" : title;
            this.artist = artist == null ? "" : artist;
            this.album = album == null ? "" : album;
            this.durationMs = durationMs;
            this.artwork = artwork == null ? "" : artwork;
            this.providerData = providerData == null ? "" : providerData;
        }

        @Override
        public String toString() {
            return "Track{" + songKey + "," + providerId + "," + mediaId + "}";
        }
    }

    /** 推进结果。带 {code generation}，采纳前必须比对，过期结果一律丢弃。 */
    public static final class Step {
        public final Outcome outcome;
        public final Track track;
        public final int index;
        public final long generation;

        Step(Outcome outcome, Track track, int index, long generation) {
            this.outcome = outcome;
            this.track = track;
            this.index = index;
            this.generation = generation;
        }

        public boolean hasTrack() {
            return track != null;
        }
    }

    private static final NativePlaylist INSTANCE = new NativePlaylist();

    private final Object lock = new Object();
    private List<Track> tracks = Collections.emptyList();
    private Mode mode = Mode.SEQUENCE;
    private boolean loopAll;
    private long generation;
    private long syncedAt;
    private String origin = "none";

    private NativePlaylist() { }

    public static NativePlaylist get() {
        return INSTANCE;
    }

    /** 测试用：把单例恢复到"从未同步过"的状态。 */
    public static void resetForTest() {
        synchronized (INSTANCE.lock) {
            INSTANCE.tracks = Collections.emptyList();
            INSTANCE.mode = Mode.SEQUENCE;
            INSTANCE.loopAll = false;
            INSTANCE.generation = 0;
            INSTANCE.syncedAt = 0;
            INSTANCE.origin = "none";
        }
    }

    /**
     * 整体替换逻辑歌单。任何一次替换都会让代次 +1 —— 之前所有在飞的解析结果因此全部作废。
     *
     * @param ordered 已经按播放顺序排好的列表（随机模式由 JS 洗好）
     * @param mode    播放模式
     */
    public long replace(List<Track> ordered, Mode mode, boolean loopAll, long syncedAt, String origin) {
        synchronized (lock) {
            this.tracks = ordered == null
                ? Collections.<Track>emptyList()
                : Collections.unmodifiableList(new ArrayList<>(ordered));
            this.mode = mode == null ? Mode.SEQUENCE : mode;
            this.loopAll = loopAll;
            this.syncedAt = syncedAt;
            this.origin = origin == null ? "none" : origin;
            this.generation += 1;
            return this.generation;
        }
    }

    /** 只改模式（用户在通知栏/界面切了循环），同样换代次。 */
    public long setMode(Mode mode, boolean loopAll) {
        synchronized (lock) {
            this.mode = mode == null ? Mode.SEQUENCE : mode;
            this.loopAll = loopAll;
            this.generation += 1;
            return this.generation;
        }
    }

    public long generation() {
        synchronized (lock) { return generation; }
    }

    public int size() {
        synchronized (lock) { return tracks.size(); }
    }

    public Mode mode() {
        synchronized (lock) { return mode; }
    }

    public boolean loopAll() {
        synchronized (lock) { return loopAll; }
    }

    public long syncedAt() {
        synchronized (lock) { return syncedAt; }
    }

    public String origin() {
        synchronized (lock) { return origin; }
    }

    public boolean isEmpty() {
        synchronized (lock) { return tracks.isEmpty(); }
    }

    /**
     * 这首歌是否仍在这份逻辑歌单里。
     *
     * 续播结果的过期判定用它，而不是用「代次必须相等」：代次表达的是「歌单内容变过一次」，
     * 一次普通同步（哪怕只是顺序微调）就会 +1，但**已经取到的播放地址与歌单重排无关**。
     * 用代次当过期条件，会让握手成功的地址在同步之后被丢掉、然后重新解析一遍 ——
     * 真机 1.3.50 的 "adopt 成功 → playlist-sync 换代次 → 同一首重新解析 → 网络失败 giveup"
     * 就是这条。这首歌真的被移出歌单时才该作废。
     */
    public boolean contains(String songKey) {
        if (songKey == null || songKey.isEmpty()) return false;
        synchronized (lock) {
            for (Track track : tracks) if (songKey.equals(track.songKey)) return true;
            return false;
        }
    }

    /**
     * 逻辑歌单里这首歌的封面地址（没有就空串）。
     *
     * <p>存在的理由：已经进入 Media3 队列的 MediaItem 带着**当时**的 tag。如果那一次同步
     * 交上来的封面是空的（旧版本读错了字段），即使之后 JS 重新同步补上了正确地址，
     * 队列里那一项的 tag 也不会变 —— 切到它时仍然没有封面。这里给读取方一条「按 songKey
     * 回到当前逻辑歌单查一次」的路，让修正过的数据能追上已经在队列里的项。
     */
    public String artworkFor(String songKey) {
        if (songKey == null || songKey.isEmpty()) return "";
        synchronized (lock) {
            for (Track track : tracks) {
                if (songKey.equals(track.songKey)) return track.artwork;
            }
            return "";
        }
    }

    /** 逻辑歌单里第 index 首。越界返回 null。 */
    public Track at(int index) {        synchronized (lock) {
            return index >= 0 && index < tracks.size() ? tracks.get(index) : null;
        }
    }

    /** 取逻辑歌单里 songKey 对应的那一首，用于诊断说明"这首歌原本从哪个音源来"。 */
    public Track trackFor(String songKey) {
        int index = indexOf(songKey);
        return index < 0 ? null : at(index);
    }

    /** 找到 songKey 在逻辑歌单里的位置；不在列表里返回 -1。 */
    public int indexOf(String songKey) {
        if (songKey == null || songKey.isEmpty()) return -1;
        synchronized (lock) {
            for (int i = 0; i < tracks.size(); i++) if (tracks.get(i).songKey.equals(songKey)) return i;
            return -1;
        }
    }

    /** 逻辑歌单里 currentSongKey 之后还剩几首（不含它自己）。不在列表里返回 0。 */
    public int remainingAfter(String songKey) {
        synchronized (lock) {
            int index = indexOf(songKey);
            if (index < 0) return 0;
            return Math.max(0, tracks.size() - index - 1);
        }
    }

    /**
     * 从 currentSongKey 推进一次。
     *
     * 返回 END 只有一种含义：**逻辑歌单真的到头了**（顺序模式且没有列表循环）。
     * 找不到 currentSongKey 也返回 END —— 但那不是"播完了"，而是"原生不知道现在播的是谁"，
     * 调用方必须把它当成"需要重新同步"，而不是"可以停"。见 {@link #canDecide}。
     */
    public Step advance(String currentSongKey) {
        synchronized (lock) {
            if (tracks.isEmpty()) return new Step(Outcome.END, null, -1, generation);
            if (mode == Mode.REPEAT_ONE) {
                int index = indexOf(currentSongKey);
                Track current = index >= 0 ? tracks.get(index) : null;
                return new Step(Outcome.REPEAT_CURRENT, current, index, generation);
            }
            int index = indexOf(currentSongKey);
            if (index < 0) return new Step(Outcome.END, null, -1, generation);
            int next = index + 1;
            if (next < tracks.size()) return new Step(Outcome.ADVANCE, tracks.get(next), next, generation);
            boolean wrap = mode == Mode.LOOP_ALL || (mode == Mode.SHUFFLE && loopAll);
            if (!wrap) return new Step(Outcome.END, null, -1, generation);
            if (tracks.size() == 1) return new Step(Outcome.REPEAT_CURRENT, tracks.get(0), 0, generation);
            return new Step(Outcome.ADVANCE, tracks.get(0), 0, generation);
        }
    }

    /**
     * 原生能不能自己决定下一首。
     *
     * 与 {@link Step#outcome} == END 区分开：列表为空、或当前曲目不在这个列表里，
     * 都意味着"原生无法判断"，此时绝不能推出"播放结束"，只能继续走原来的 JS 通道。
     */
    public boolean canDecide(String currentSongKey) {
        synchronized (lock) {
            if (tracks.isEmpty()) return false;
            if (mode == Mode.REPEAT_ONE) return true;
            return indexOf(currentSongKey) >= 0;
        }
    }

    /** 把当前曲目之后、尚未解析的第 n 首（n 从 1 开始）取出来，用于提前补窗口。 */
    public Track lookahead(String currentSongKey, int offset) {
        synchronized (lock) {
            int index = indexOf(currentSongKey);
            if (index < 0) return null;
            int target = index + offset;
            if (target < 0 || target >= tracks.size()) {
                boolean wrap = mode == Mode.LOOP_ALL || (mode == Mode.SHUFFLE && loopAll);
                if (!wrap || tracks.isEmpty()) return null;
                target = target % tracks.size();
                if (target < 0) target += tracks.size();
            }
            return tracks.get(target);
        }
    }

    /** 诊断用快照，不含任何 URL 与歌词。 */
    public org.json.JSONObject snapshot() {
        synchronized (lock) {
            try {
                return new org.json.JSONObject()
                    .put("size", tracks.size())
                    .put("mode", mode.name().toLowerCase(Locale.US))
                    .put("loopAll", loopAll)
                    .put("generation", generation)
                    .put("syncedAt", syncedAt)
                    .put("origin", origin);
            } catch (Exception error) {
                return new org.json.JSONObject();
            }
        }
    }
}
