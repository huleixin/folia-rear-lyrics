package io.github.huleixin.tingyu.playback;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/LyricPublishGuard.java
/**
 * 灵动岛歌词「会话侧自检」的纯决策：这一轮该不该重建 metadata。
 *
 * <h3>v1.3.59 的缺陷</h3>
 * {@code FoliaPlaybackService.ensureLyricPublished()} 是「每首歌只跑一次」的实现：
 *
 * <pre>
 * if (cachedSongKey.equals(lyricSelfHealDoneFor)) return;
 * lyricSelfHealDoneFor = cachedSongKey;          // ← 先标记，再判条件
 * boolean bridgeReady = "ready".equals(stateOf(cachedSongKey));
 * int sessionLen = readSessionLyricLen();
 * if (bridgeReady &amp;&amp; sessionLen &lt; 0) publishMetadata(...);
 * </pre>
 *
 * 三个问题叠在一起，正好是「连续切歌后灵动岛歌词消失」：
 * <ol>
 *   <li><b>先标记后判断</b>：换歌瞬间歌词还是 pending（后台取词没回来，WebView 也还没推），
 *       这一首的自检额度当场被消耗掉；等歌词真的 ready 时，函数第一行就 return 了，
 *       整首歌再也不会重建 metadata；</li>
 *   <li><b>只看长度、不看身份</b>：{@code sessionLen >= 0} 就算「会话有词」。可是上一首的
 *       时间轴、或者本首的 {@code noLyric} 占位桩，长度都 ≥ 0 —— 会话里明明不是这首的词，
 *       自检却认为一切正常；</li>
 *   <li><b>没有代次</b>：判定在异步回调里做，中途换歌就会把旧结论套到新歌上。</li>
 * </ol>
 *
 * <h3>现在的规则</h3>
 * <ul>
 *   <li>pending <b>不消耗</b>任何额度、不标记完成，只返回「等」（{@link Layer#FETCH}）；</li>
 *   <li>ready 时必须同时验证：会话 MEDIA_ID 是本首、payload 不是占位桩、且会话内容对应的
 *      歌词版本就是桥上当前版本 —— 三者任一不满足才受控重发；</li>
 *   <li>每个 (songKey, 歌词版本) 最多重发 {@link #MAX_ATTEMPTS_PER_KEY} 次，用尽即停并标记
 *       {@code exhausted}，绝不进入重试循环；</li>
 *   <li>{@code generation} 不匹配（已经换歌）直接丢弃，旧任务不能污染新歌；</li>
 *   <li>每次判定都带 {@link Layer}，把「取词失败 / 交付失败 / 会话发布失败 / 系统消费端
 *       没显示」四种情况分开，诊断能直接归因。</li>
 * </ul>
 *
 * <p>纯逻辑，无 Android 依赖，可在 JVM 上逐条断言。
 */
public final class LyricPublishGuard {

    /** 同一个 (songKey, 歌词版本) 最多重发几次。3 次足够覆盖一次 MediaController 回读延迟。 */
    public static final int MAX_ATTEMPTS_PER_KEY = 3;

    /** 会话里没有 {@code lyricInfo} 字段。 */
    public static final int SESSION_ABSENT = -1;
    /** 会话本身读不到（MediaController 拿不到 metadata）：与「没有字段」必须分开。 */
    public static final int SESSION_UNREADABLE = -2;

    /** 失败发生在哪一层。**不要**把四层混成一个布尔。 */
    public enum Layer {
        /** 歌词还没取到（桥上是 pending）。此时任何重发都是错的。 */
        FETCH,
        /** 歌词已在桥上，但会话里的内容缺失/错曲/是占位桩。 */
        SESSION,
        /** 会话内容与桥上版本一致，仍不显示只能是系统消费端。 */
        CONSUMER,
        /** 已换代次，本轮结论作废。 */
        STALE,
        /** 重发次数用尽。 */
        EXHAUSTED,
        /** 没有要修的东西。 */
        NONE
    }

    public enum Action { NONE, PUBLISH }

    public static final class Observation {
        public String songKey = "";
        public String bridgeState = "";
        public int bridgeRevision;
        /** 会话 metadata 的 MEDIA_ID；null 表示读不到会话。 */
        public String sessionSongKey;
        /** lyricInfo 长度；-1 表示字段缺失。 */
        public int sessionPayloadLen = -1;
        /** 会话里的 payload 是不是 {@code noLyric} 占位桩。 */
        public boolean sessionPayloadIsStub;
        public long generation;

        public static Observation of(String songKey, long generation) {
            Observation observation = new Observation();
            observation.songKey = songKey == null ? "" : songKey;
            observation.generation = generation;
            return observation;
        }
    }

    public static final class Verdict {
        public final Action action;
        public final String reason;
        public final Layer layer;

        Verdict(Action action, String reason, Layer layer) {
            this.action = action;
            this.reason = reason;
            this.layer = layer;
        }

        public boolean publish() { return action == Action.PUBLISH; }

        @Override public String toString() {
            return action + "(" + reason + ", layer=" + layer + ")";
        }
    }

    private static final Verdict KEEP = new Verdict(Action.NONE, "in-sync", Layer.CONSUMER);

    private String key = "";
    private long generation;
    private int attempts;
    private int attemptsRevision = -1;
    private int publishedRevision = -1;
    private boolean exhausted;
    private String lastReason = "not consulted";

    /** 换歌 / 换代：重置本轮额度，但保留「会话里现在是什么版本」的记录。 */
    public synchronized void onTrack(String songKey, long generation) {
        String next = songKey == null ? "" : songKey;
        if (next.equals(key) && generation == this.generation) return;
        key = next;
        this.generation = generation;
        attempts = 0;
        attemptsRevision = -1;
        exhausted = false;
        lastReason = "track-change";
    }

    /** 每次真的重建了 metadata 都要记一次：这是「会话里现在装的是哪个版本」的唯一来源。 */
    public synchronized void onPublished(String songKey, int revision, long generation) {
        if (songKey == null || !songKey.equals(key) || generation != this.generation) return;
        publishedRevision = revision;
        lastReason = "published@" + revision;
    }

    public synchronized Verdict evaluate(Observation observation) {
        if (observation == null) return verdict(Action.NONE, "no-observation", Layer.NONE);
        String songKey = observation.songKey == null ? "" : observation.songKey;
        if (songKey.isEmpty()) return verdict(Action.NONE, "no-song", Layer.NONE);
        if (observation.generation != generation || !songKey.equals(key)) {
            return verdict(Action.NONE, "stale-generation", Layer.STALE);
        }
        if ("pending".equals(observation.bridgeState)) {
            // 关键修复：pending 不消耗额度、不标记完成。歌词到齐后还会再来问。
            return verdict(Action.NONE, "bridge-pending", Layer.FETCH);
        }
        boolean ready = "ready".equals(observation.bridgeState);
        boolean none = "none".equals(observation.bridgeState);
        if (!ready && !none) return verdict(Action.NONE, "bridge-" + observation.bridgeState, Layer.FETCH);

        if (observation.sessionSongKey != null && !observation.sessionSongKey.equals(songKey)) {
            return request(songKey, observation.bridgeRevision, "session-other-song");
        }
        if (observation.sessionPayloadLen == SESSION_UNREADABLE) {
            // 读不到会话：不盲发，但仍给一次受控重建（上限由 MAX_ATTEMPTS_PER_KEY 兜住）。
            return request(songKey, observation.bridgeRevision, "session-unreadable");
        }
        if (!ready) {
            // 明确无词：会话里应当是一条 noLyric 桩。缺失就补一次，有了就不动。
            if (observation.sessionPayloadLen < 0) {
                return request(songKey, observation.bridgeRevision, "none-stub-missing");
            }
            return verdict(Action.NONE, "none-stub-present", Layer.NONE);
        }
        if (observation.sessionPayloadLen < 0) {
            return request(songKey, observation.bridgeRevision, "session-absent");
        }
        if (observation.sessionPayloadIsStub) {
            // 会话里还是占位桩，桥上已经有真时间轴：这是「有词但岛上看不到」的典型形态。
            return request(songKey, observation.bridgeRevision, "session-stub");
        }
        // 「会话里现在是哪个版本」只由本状态机自己记账（每条发布路径都经过 onPublished），
        // 不接受调用方传进来的快照：那可能是重建之前取的，会让我们反复重发。
        if (publishedRevision != observation.bridgeRevision) {
            return request(songKey, observation.bridgeRevision,
                publishedRevision < 0 ? "revision-unknown" : "stale-revision");
        }
        return verdict(Action.NONE, "in-sync", Layer.CONSUMER);
    }

    private Verdict request(String songKey, int revision, String reason) {
        if (attemptsRevision != revision) { attempts = 0; attemptsRevision = revision; }
        if (attempts >= MAX_ATTEMPTS_PER_KEY) {
            exhausted = true;
            return verdict(Action.NONE, reason + "-attempts-exhausted", Layer.EXHAUSTED);
        }
        attempts++;
        return verdict(Action.PUBLISH, reason + "#" + attempts, Layer.SESSION);
    }

    private Verdict verdict(Action action, String reason, Layer layer) {
        lastReason = reason;
        return new Verdict(action, reason, layer);
    }

    public synchronized int attempts() { return attempts; }
    public synchronized boolean exhausted() { return exhausted; }
    public synchronized int publishedRevision() { return publishedRevision; }

    public synchronized String describe() {
        return "publishGuard={key=" + hash(key) + ", gen=" + generation
            + ", attempts=" + attempts + "/" + MAX_ATTEMPTS_PER_KEY
            + ", publishedRev=" + publishedRevision + ", exhausted=" + exhausted
            + ", last=" + lastReason + "}";
    }

    private static String hash(String value) {
        return value == null || value.isEmpty() ? "-" : Integer.toHexString(value.hashCode());
    }
}
