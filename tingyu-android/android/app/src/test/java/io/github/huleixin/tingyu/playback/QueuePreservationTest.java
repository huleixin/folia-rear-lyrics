package io.github.huleixin.tingyu.playback;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import io.github.huleixin.tingyu.resolver.ResolverRegistry;
import io.github.huleixin.tingyu.resolver.SourceResolution;
import io.github.huleixin.tingyu.resolver.SourceResolver;

/**
 * 真机 1.3.50 停播的回归测试：**已经准备好的下一首，不许在任何一条通道里消失。**
 *
 * 现场链条（11:54:09 → 11:58:19）：
 * adopt 成功 → playlist-sync 换代次 → 同一首被重新解析 → activity-stop → 备用域名
 * connection closed 连打三次 → giveup → `queue-replenish accepted=0 removed=1` → 剩余 1→0
 * → 当前曲播到 252001/252000 → queue-exhausted。
 *
 * 三处独立缺陷各自对应一组断言：空窗口清空了队列、已接管的项被同步带走、
 * 代次变化把已到手的地址作废后重取。
 */
public class QueuePreservationTest {

    // ------------------------------------------------------------------ A1 空窗口不删队列

    @Test
    public void anEmptyWindowNeverTouchesWhatIsAlreadyQueued() {
        // 真机那一行：accepted=0（窗口一首都没解析出来）却 removed=1。
        QueuePrune.Plan plan = QueuePrune.plan(
            Collections.singletonList("song-2"),
            Collections.singletonList(Boolean.TRUE),
            Collections.emptySet());
        assertFalse("空窗口的意思是「这一轮没解析出东西」，不是「后面应该清空」", plan.replace);
        assertEquals(0, plan.preserveCount());
    }

    @Test
    public void anAlreadyResolvedTrackIsKeptWhenTheWindowCannotCoverIt() {
        // 窗口解析出了 song-3/song-4，但漏掉了已经在手的 song-9（备用域名对它失败了）。
        QueuePrune.Plan plan = QueuePrune.plan(
            Collections.singletonList("song-9"),
            Collections.singletonList(Boolean.TRUE),
            new LinkedHashSet<>(Arrays.asList("song-3", "song-4")));
        assertTrue(plan.replace);
        assertEquals("已接管的下一首必须跟着队列活下来", 1, plan.preserveCount());
        assertEquals(Integer.valueOf(0), plan.keepIndices.get(0));
    }

    @Test
    public void anAlreadyResolvedTrackThatTheWindowDoesCoverIsDeduplicated() {
        // 新窗口本来就含这首：交给新窗口，不要保留成两份。
        QueuePrune.Plan plan = QueuePrune.plan(
            Arrays.asList("song-2"),
            Arrays.asList(Boolean.TRUE),
            new LinkedHashSet<>(Arrays.asList("song-2", "song-3")));
        assertTrue(plan.replace);
        assertEquals("同一首不能出现两遍", 0, plan.preserveCount());
    }

    @Test
    public void aJsOnlyTailIsStillReplacedNormally() {
        // JS 窗口项由 JS 负责：窗口换代时整体替换是正确行为，不能被这条修复挡住。
        QueuePrune.Plan plan = QueuePrune.plan(
            Arrays.asList("song-2", "song-3"),
            Arrays.asList(Boolean.FALSE, Boolean.FALSE),
            new LinkedHashSet<>(Arrays.asList("song-8", "song-9")));
        assertTrue(plan.replace);
        assertEquals(0, plan.preserveCount());
    }

    // ------------------------------------------------------------------ A2/A3 续播编排

    /** 精简假引擎：只保留这条链路真正用到的状态。 */
    static final class Engine implements BackgroundContinuation.Host {
        final List<String> queue = new ArrayList<>();
        int cursor;
        boolean ended;
        boolean paused;
        long msSinceJsWindow = -1L;
        final List<String> adopted = new ArrayList<>();
        final List<Long> adoptedGenerations = new ArrayList<>();
        int rearms;

        @Override public String currentSongKey() { return queue.isEmpty() ? "" : queue.get(cursor); }
        @Override public boolean desiredPaused() { return paused; }
        @Override public int remaining() { return Math.max(0, queue.size() - cursor - 1); }
        @Override public boolean ended() { return ended; }
        @Override public long msSinceJsWindow() { return msSinceJsWindow; }
        @Override public boolean queueContains(String songKey) {
            for (int i = cursor; i < queue.size(); i++) if (queue.get(i).equals(songKey)) return true;
            return false;
        }
        @Override public void adopt(NativePlaylist.Track track, String uri, long requestId, long generation) {
            adopted.add(track.songKey);
            adoptedGenerations.add(generation);
            queue.add(track.songKey);
            if (ended) { ended = false; cursor = queue.indexOf(track.songKey); }
        }
        @Override public void rearmSupervision(long delayMs) { rearms++; }
        @Override public void runOnMain(Runnable action) { action.run(); }

        void drain() {
            if (cursor < queue.size() - 1) { cursor++; ended = false; }
            else ended = true;
        }

        String lastAdopted() { return adopted.isEmpty() ? "" : adopted.get(adopted.size() - 1); }
    }

    static final class Resolver implements SourceResolver {
        final List<String> asked = new ArrayList<>();
        int failuresLeft;
        Runnable onResolve;

        @Override public String id() { return "demo"; }
        @Override public boolean supports(String providerId) { return "demo".equals(providerId); }
        @Override public SourceResolution resolve(NativePlaylist.Track track, String quality) {
            asked.add(track.songKey);
            if (onResolve != null) onResolve.run();
            if (failuresLeft > 0) { failuresLeft--; return SourceResolution.failure("connection closed"); }
            return SourceResolution.ok("https://cdn.example/" + track.songKey + ".mp3", quality, 1L);
        }
    }

    private Engine engine;
    private Resolver resolver;
    private BackgroundContinuation continuation;

    @Before public void setUp() {
        NativePlaylist.resetForTest();
        QualityPreference.resetForTest();
        ResolverRegistry.get().resetForTest();
        resolver = new Resolver();
        ResolverRegistry.get().registerForTest(resolver);
        engine = new Engine();
        continuation = BackgroundContinuation.get();
        continuation.cancel();
        continuation.resetBudgets();
        continuation.setInlineForTest(true);
        continuation.setRegistrarForTest(url -> "http://127.0.0.1:1/remote-audio/" + Math.abs(url.hashCode()));
    }

    @After public void tearDown() {
        continuation.setInlineForTest(false);
        continuation.setRegistrarForTest(null);
        continuation.cancel();
        continuation.resetBudgets();
        ResolverRegistry.get().resetForTest();
        NativePlaylist.resetForTest();
    }

    private static List<NativePlaylist.Track> ledger(int count) {
        List<NativePlaylist.Track> tracks = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            tracks.add(new NativePlaylist.Track("song-" + i, "demo", "mid-" + i, "T", "A", "B", 100_000L, "", ""));
        }
        return tracks;
    }

    private void backgroundSession(int ledgerSize, int prefetched) {
        NativePlaylist.get().replace(ledger(ledgerSize), NativePlaylist.Mode.SEQUENCE, false, 0L, "test");
        for (int i = 0; i < prefetched; i++) engine.queue.add("song-" + i);
        engine.cursor = 0;
        engine.msSinceJsWindow = 600_000L;   // JS 已冻结
    }

    @Test
    public void aTrackAlreadyInTheQueueIsNotResolvedASecondTime() {
        backgroundSession(6, 2);
        engine.drain();                       // 现在播 song-1，窗口已空
        continuation.consider(engine, "drained");
        assertEquals("第一次接管", 1, engine.adopted.size());
        assertEquals("song-2", engine.lastAdopted());
        int askedOnce = resolver.asked.size();

        // 监督器下一次 tick：这首已经在队列里了，不能再取一次。
        // 真机 11:54:09 的 "adopt 成功 → 同一首被重新解析 → duplicate" 就是这里。
        continuation.consider(engine, "tick");
        continuation.consider(engine, "tick");
        assertEquals("已在队列里的歌不许重复解析", askedOnce, resolver.asked.size());
        assertEquals(1, engine.adopted.size());
    }

    @Test
    public void aPlaylistGenerationBumpDoesNotThrowAwayAResolvedUrl() {
        backgroundSession(6, 2);
        // 解析在飞的时候 JS 做了一次普通同步：内容一样，代次 +1。真机 11:55:10 就是这两条连在一起。
        resolver.onResolve = () -> NativePlaylist.get().replace(ledger(6), NativePlaylist.Mode.SEQUENCE, false, 0L, "webview");

        engine.drain();
        continuation.consider(engine, "drained");

        assertEquals("代次变化不能作废已经取到的地址", 1, engine.adopted.size());
        assertEquals("song-2", engine.lastAdopted());
    }

    @Test
    public void aTrackRemovedFromThePlaylistIsStillRejected() {
        backgroundSession(6, 2);
        // 用户换了歌单：这首歌真的不在里面了，迟到的结果不许插回去。
        List<NativePlaylist.Track> replaced = new ArrayList<>();
        for (NativePlaylist.Track track : ledger(6)) {
            if (!"song-2".equals(track.songKey)) replaced.add(track);
        }
        resolver.onResolve = () -> NativePlaylist.get().replace(
            replaced, NativePlaylist.Mode.SEQUENCE, false, 0L, "webview");

        engine.drain();
        continuation.consider(engine, "drained");

        assertTrue("被移出歌单的歌不该再被采纳", engine.adopted.isEmpty());
    }

    /**
     * 完整验收场景：原生成功接管下一首 → JS 歌单同步 → 网络开始失败 →
     * 已经准备好的那首**不能消失**，并且仍然能播。
     */
    @Test
    public void thePreparedNextTrackSurvivesASyncAndAFailedNetwork() {
        backgroundSession(6, 2);
        engine.drain();                                  // 播 song-1，窗口空
        continuation.consider(engine, "drained");
        assertEquals("song-2", engine.lastAdopted());
        assertEquals("接管后队列里确有这首", "song-2", engine.queue.get(2));

        // 同步换代次（真机 generation 5→7），窗口一首都没解析出来。
        NativePlaylist.get().replace(ledger(6), NativePlaylist.Mode.SEQUENCE, false, 0L, "webview");
        QueuePrune.Plan plan = QueuePrune.plan(
            Collections.singletonList("song-2"),
            Collections.singletonList(Boolean.TRUE),
            Collections.emptySet());
        assertFalse("空窗口不许删掉它", plan.replace);
        assertTrue(engine.queueContains("song-2"));

        // 网络此后全部失败（真机 97abc.com connection closed ×3）。
        resolver.failuresLeft = 3;
        continuation.consider(engine, "drained");
        continuation.consider(engine, "tick");
        assertTrue("解析失败也不能把已备好的下一首弄丢", engine.queueContains("song-2"));

        // 当前曲播完，Media3 走到 song-2：没有出现"队列空"。
        engine.drain();
        assertEquals("song-2", engine.currentSongKey());
        assertFalse("准备好了就必须真的能接着播", engine.ended);
    }
}
