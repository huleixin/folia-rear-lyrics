package io.github.huleixin.tingyu.playback;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import io.github.huleixin.tingyu.resolver.ResolverRegistry;
import io.github.huleixin.tingyu.resolver.SourceResolution;
import io.github.huleixin.tingyu.resolver.SourceResolver;

/**
 * 后台续播的整段模拟。
 *
 * 要证明的不是"会话没被错误结束"，而是**主界面 WebView 一句 JS 都不跑时，
 * Media3 仍然持续拿到下一首的有效播放地址并自动播下去**。
 *
 * 模拟里的假 WebView 从不回调、从不补窗口 —— 这是真机复现里被系统冻结的那 507 秒。
 * 所有推进都必须由原生自己完成：逻辑歌单给身份，原生解析器给地址，引擎给 Media3。
 */
public class BackgroundContinuationTest {

    /** 假引擎：持有 Media3 队列、当前位置、用户意图，以及"JS 有没有说过话"。 */
    static final class FakeEngine implements BackgroundContinuation.Host {
        final List<String> queue = new ArrayList<>();
        int cursor = 0;
        boolean ended;
        boolean paused;
        /** -1 = JS 从未补过窗口（后台被冻结的情况）。 */
        long msSinceJsWindow = -1L;
        final List<String> adopted = new ArrayList<>();
        final List<String> played = new ArrayList<>();
        int rearms;

        void offerInitial(String... songKeys) {
            for (String key : songKeys) queue.add(key);
        }

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
            queue.add(track.songKey);
            if (ended) {
                ended = false;
                cursor = queue.indexOf(track.songKey);
            }
        }
        @Override public void rearmSupervision() { rearms++; }
        @Override public void runOnMain(Runnable action) { action.run(); }

        /**
         * 当前这首播完：Media3 能自动推进就推进（新的当前项、未结束），
         * 推不动了才 STATE_ENDED 停在原地 —— 这正是真机里"窗口耗尽"那一刻。
         */
        void drain() {
            played.add(currentSongKey());
            if (cursor < queue.size() - 1) {
                cursor++;
                ended = false;
            } else {
                ended = true;
            }
        }

        String lastAdopted() {
            return adopted.isEmpty() ? "" : adopted.get(adopted.size() - 1);
        }
    }

    /** 假解析器：可注入失败次数，并记录被问了哪些歌。 */
    static final class FakeResolver implements SourceResolver {
        final List<String> asked = new ArrayList<>();
        int failuresLeft;
        String unsupportedProvider = null;

        FakeResolver(String providerId) {
            this.id = providerId;
        }
        private final String id;

        @Override public String id() { return id; }
        @Override public boolean supports(String providerId) { return id.equals(providerId); }
        @Override public SourceResolution resolve(NativePlaylist.Track track, String quality) {
            asked.add(track.songKey);
            if (unsupportedProvider != null && unsupportedProvider.equals(track.providerId)) {
                return SourceResolution.unsupported("scripts cannot run natively");
            }
            if (failuresLeft > 0) {
                failuresLeft--;
                return SourceResolution.failure("simulated network failure");
            }
            return SourceResolution.ok("https://cdn.example/" + track.songKey + ".mp3", quality, System.currentTimeMillis());
        }
    }

    private FakeEngine engine;
    private FakeResolver resolver;
    private BackgroundContinuation continuation;

    @Before
    public void setUp() {
        NativePlaylist.resetForTest();
        QualityPreference.resetForTest();
        ResolverRegistry.get().resetForTest();
        resolver = new FakeResolver("qq");
        ResolverRegistry.get().registerForTest(resolver);
        engine = new FakeEngine();
        continuation = BackgroundContinuation.get();
        continuation.cancel();
        continuation.setInlineForTest(true);
        continuation.setRegistrarForTest(url -> "http://127.0.0.1:1/remote-audio/" + Math.abs(url.hashCode()));
    }

    @After
    public void tearDown() {
        continuation.setInlineForTest(false);
        continuation.setRegistrarForTest(null);
        continuation.cancel();
        ResolverRegistry.get().resetForTest();
        NativePlaylist.resetForTest();
    }

    private static List<NativePlaylist.Track> ledger(int count) {
        List<NativePlaylist.Track> tracks = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            tracks.add(new NativePlaylist.Track("song-" + i, "qq", "mid-" + i, "T", "A", "B", 100_000L, "", ""));
        }
        return tracks;
    }

    /** 真机场景的初始状态：JS 在前台补过 2 首，然后页面被冻结。 */
    private void startBackgroundSession(int ledgerSize, int prefetched) {
        NativePlaylist.get().replace(ledger(ledgerSize), NativePlaylist.Mode.SEQUENCE, false, 0L, "test");
        for (int i = 0; i < prefetched; i++) engine.offerInitial("song-" + i);
        engine.cursor = 0;
        // JS 从此沉默：这个数字会一直涨到十几分钟，而它一次都没有回调过。
        engine.msSinceJsWindow = 600_000L;
    }

    @Test
    public void thirtyTracksPlayThroughWithJsSilentForTheWholeSession() {
        // 31 首逻辑歌曲（song-0 … song-30），JS 只在进入后台前补进了前 2 首的地址。
        final int total = 31;
        startBackgroundSession(total, 2);
        assertEquals(2, engine.queue.size());

        // 每一步 = 当前这首播完 + 原生接手。JS 全程沉默（msSinceJsWindow 保持 10 分钟）。
        int expected = 2;
        for (int step = 1; step <= 29; step++) {
            engine.drain();
            int before = engine.adopted.size();
            continuation.consider(engine, "drained");
            assertEquals("step " + step + " must be resolved natively, not waited for",
                before + 1, engine.adopted.size());
            assertEquals("step " + step, "song-" + expected, engine.lastAdopted());
            assertFalse("playback must not be left ended at step " + step, engine.ended());
            expected++;
        }
        assertEquals("29 boundaries crossed without the WebView", 29, engine.adopted.size());
        assertEquals("one native resolution per boundary, not a bigger prefetch window",
            29, resolver.asked.size());
        assertTrue(resolver.asked.contains("song-30"));
        assertEquals("song-30", engine.lastAdopted());

        // 逻辑歌单真的到头了：song-30 之后不许再凭空造一首出来。
        engine.drain();
        int before = engine.adopted.size();
        continuation.consider(engine, "drained");
        assertEquals("the real end must not invent another track", before, engine.adopted.size());
        assertEquals(29, resolver.asked.size());
    }

    @Test
    public void aJsWindowThatIsFreshKeepsNativeOutOfTheWay() {
        startBackgroundSession(10, 3);
        engine.msSinceJsWindow = 500L;   // JS 刚补过窗口：前台正常情况
        engine.drain();
        continuation.consider(engine, "drained");
        assertTrue("a live WebView must keep answering, not be raced by native", engine.adopted.isEmpty());
        assertEquals(BackgroundContinuation.Decision.WAIT_FOR_JS,
            BackgroundContinuation.decide(new BackgroundContinuation.Facts(
                0, true, false, 500L, true, true, true)));
    }

    @Test
    public void anUnsupportedSourceFallsBackInsteadOfEndingOrFaking() {
        NativePlaylist.get().replace(ledger(5), NativePlaylist.Mode.SEQUENCE, false, 0L, "test");
        engine.offerInitial("song-0");
        engine.msSinceJsWindow = 600_000L;
        resolver.unsupportedProvider = "qq";

        engine.drain();
        continuation.consider(engine, "drained");

        assertTrue("an unsupported source must not be faked into a URL", engine.adopted.isEmpty());
        assertEquals(BackgroundContinuation.Decision.FALLBACK_TO_JS,
            BackgroundContinuation.decide(new BackgroundContinuation.Facts(
                0, true, false, 600_000L, true, true, false)));
    }

    @Test
    public void aNetworkFailureRearmsInsteadOfEndingTheSession() {
        startBackgroundSession(10, 1);
        resolver.failuresLeft = 1;

        engine.drain();
        continuation.consider(engine, "drained");
        assertTrue("a failed resolution must not invent a track", engine.adopted.isEmpty());
        assertTrue("and it must ask again on the existing sparse schedule", engine.rearms > 0);

        // 退避之后再问一次：这一次成功了，播放继续。
        continuation.consider(engine, "retry");
        assertEquals("song-1", engine.adopted.get(0));
    }

    @Test
    public void aUserPauseStopsTheTakeoverEntirely() {
        startBackgroundSession(10, 1);
        engine.paused = true;
        engine.drain();
        continuation.consider(engine, "drained");
        assertTrue("a paused session must never be filled behind the user's back", engine.adopted.isEmpty());
        assertEquals(BackgroundContinuation.Decision.STOP,
            BackgroundContinuation.decide(new BackgroundContinuation.Facts(
                0, true, true, 600_000L, true, true, true)));
    }

    @Test
    public void aPlaylistReplacementMakesAnEarlierAnswerStale() {
        startBackgroundSession(10, 1);
        NativePlaylist.Step before = NativePlaylist.get().advance("song-0");
        // 用户换了个歌单：之前那次推进的答案必须作废，绝不能拿去给新歌单用。
        NativePlaylist.get().replace(ledger(10), NativePlaylist.Mode.SEQUENCE, false, 0L, "test");
        assertTrue("a replaced playlist must invalidate answers computed before it",
            before.generation != NativePlaylist.get().generation());
        // 作废之后仍然知道下一首是谁 —— 不是"播完了"。
        assertEquals("song-1", NativePlaylist.get().advance("song-0").track.songKey);
    }

    @Test
    public void aCancelledTakeoverWaitsForTheNextBoundary() {
        startBackgroundSession(10, 1);
        engine.paused = true;
        engine.drain();
        continuation.consider(engine, "drained");
        continuation.cancel();
        assertTrue("cancelling must leave nothing half-adopted", engine.adopted.isEmpty());
        // 用户重新按下播放：下一个边界照常接上。
        engine.paused = false;
        continuation.consider(engine, "user-play");
        assertEquals("song-1", engine.lastAdopted());
    }

    @Test
    public void aRealPlaylistEndStopsAndIsNotConfusedWithALostWindow() {
        NativePlaylist.get().replace(ledger(3), NativePlaylist.Mode.SEQUENCE, false, 0L, "test");
        engine.offerInitial("song-0", "song-1", "song-2");
        engine.msSinceJsWindow = 600_000L;
        // 播到最后一首：逻辑歌单真的到头了。
        engine.cursor = 2;
        engine.ended = true;
        continuation.consider(engine, "drained");
        assertTrue("the real end must not invent another track", engine.adopted.isEmpty());
        assertEquals(BackgroundContinuation.Decision.STOP,
            BackgroundContinuation.decide(new BackgroundContinuation.Facts(
                0, true, false, 600_000L, true, false, true)));
    }

    @Test
    public void listLoopKeepsGoingAcrossTheWrap() {
        final int total = 5;
        NativePlaylist.get().replace(ledger(total), NativePlaylist.Mode.LOOP_ALL, true, 0L, "test");
        engine.offerInitial("song-0");
        engine.msSinceJsWindow = 600_000L;
        for (int i = 0; i < 7; i++) {
            engine.cursor = engine.queue.size() - 1;
            engine.ended = true;
            continuation.consider(engine, "drained");
        }
        assertEquals("loop-all crosses the wrap natively", 7, engine.adopted.size());
        assertEquals("song-1", engine.adopted.get(0));
        assertEquals("song-2", engine.adopted.get(1));
        assertEquals("song-3", engine.adopted.get(2));
        assertEquals("song-4", engine.adopted.get(3));
        assertEquals("song-0", engine.adopted.get(4));
    }

    @Test
    public void theWindowIsOnlyFilledWhenItIsActuallyRunningDry() {
        startBackgroundSession(10, 6);
        engine.cursor = 0;   // 后面还有 5 首，远高于低水位
        continuation.consider(engine, "transition");
        assertTrue("a healthy window must not be topped up", engine.adopted.isEmpty());
        assertEquals(BackgroundContinuation.Decision.WAIT_FOR_JS,
            BackgroundContinuation.decide(new BackgroundContinuation.Facts(
                5, false, false, 600_000L, true, true, true)));
    }

    @Test
    public void anAudioFocusLossThatPausesIsHonoured() {
        startBackgroundSession(10, 1);
        // 音频焦点丢失表现为引擎侧 desiredPaused（用户/系统要求安静），不是"卡顿"。
        engine.paused = true;
        engine.drain();
        continuation.consider(engine, "focus-loss");
        assertTrue(engine.adopted.isEmpty());
        // 焦点回来：恢复播放，续播照常。
        engine.paused = false;
        continuation.consider(engine, "focus-gain");
        assertEquals("song-1", engine.adopted.get(0));
    }

    @Test
    public void theSameTrackIsNeverAdoptedTwice() {
        startBackgroundSession(10, 2);
        engine.drain();
        continuation.consider(engine, "drained");       // 原生解析 song-2
        int afterFirst = engine.adopted.size();
        engine.msSinceJsWindow = 100L;                   // JS 这时才补上窗口
        engine.queue.add("song-2");
        continuation.consider(engine, "drained");
        assertEquals("a late JS window must not duplicate what native already added",
            afterFirst, engine.adopted.size());
    }

    @Test
    public void theTakeoverCountIsRecordedForDiagnostics() {
        startBackgroundSession(6, 1);
        AtomicInteger before = new AtomicInteger(continuation.takeoversForTest());
        engine.drain();
        continuation.consider(engine, "drained");
        assertTrue(continuation.takeoversForTest() > before.get());
        assertTrue(continuation.snapshot().has("lastDecision"));
    }
}
