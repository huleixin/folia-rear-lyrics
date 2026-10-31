package io.github.huleixin.tingyu.playback;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import io.github.huleixin.tingyu.resolver.ResolverCredentials;
import io.github.huleixin.tingyu.resolver.ResolverRegistry;
import io.github.huleixin.tingyu.resolver.SourceResolution;
import io.github.huleixin.tingyu.resolver.SourceResolver;

/**
 * 跨音源后台续播对照 —— QQ 修复的标准必须对网易云同样成立。
 *
 * 同一条原生链路（BackgroundContinuation + NativePlaylist + ResolverRegistry）、
 * 同样的"WebView 冻结、JS 全程沉默"条件：
 * - QQ 下一首能独立解析，网易云下一首也必须能独立解析；
 * - 网易云没有登录态同步时如实回落 JS 通道（前台还活着时的正常行为）；
 * - 用户主动暂停绝不被子自动恢复；
 * - 混编歌单连续多首切换，Media3 不会退回"只剩一首"。
 * 洛雪的非回归由 BackgroundContinuationTest / ResolverRoutingTest 覆盖，全量套件保证不回归。
 */
public class CrossSourceContinuationTest {

    static final class FakeEngine implements BackgroundContinuation.Host {
        final List<String> queue = new ArrayList<>();
        int cursor = 0;
        boolean ended;
        boolean paused;
        long msSinceJsWindow = -1L;
        final List<String> adopted = new ArrayList<>();
        int rearms;

        void offerInitial(String... keys) { for (String k : keys) queue.add(k); }

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
            adopted.add(track.songKey + "@" + track.providerId);
            queue.add(track.songKey);
            if (ended) { ended = false; cursor = queue.indexOf(track.songKey); }
        }
        @Override public void rearmSupervision(long delayMs) { rearms++; }
        @Override public void runOnMain(Runnable action) { action.run(); }

        void drain() {
            if (cursor < queue.size() - 1) { cursor++; ended = false; } else { ended = true; }
        }

        String lastAdopted() { return adopted.isEmpty() ? "" : adopted.get(adopted.size() - 1); }
    }

    /** 假解析器：按平台给出地址，记录被问的歌。 */
    static final class PlatformResolver implements SourceResolver {
        private final String id;
        int failuresLeft;

        PlatformResolver(String id) { this.id = id; }

        @Override public String id() { return id; }
        @Override public boolean supports(String providerId) { return id.equals(providerId); }
        @Override public SourceResolution resolve(NativePlaylist.Track track, String quality) {
            if (failuresLeft > 0) { failuresLeft--; return SourceResolution.failure("simulated"); }
            return SourceResolution.ok("https://cdn.example/" + id + "/" + track.songKey + ".mp3",
                quality, System.currentTimeMillis());
        }
    }

    private FakeEngine engine;
    private BackgroundContinuation continuation;

    @Before
    public void setUp() {
        NativePlaylist.resetForTest();
        QualityPreference.resetForTest();
        ResolverCredentials.clearAll();
        ResolverRegistry.get().resetForTest();
        ResolverRegistry.get().registerForTest(new PlatformResolver("qq"));
        ResolverRegistry.get().registerForTest(new PlatformResolver("netease"));
        engine = new FakeEngine();
        continuation = BackgroundContinuation.get();
        continuation.cancel();
        continuation.resetBudgets();
        continuation.setInlineForTest(true);
        continuation.setRegistrarForTest(url -> "http://127.0.0.1:1/remote-audio/" + Math.abs(url.hashCode()));
    }

    @After
    public void tearDown() {
        continuation.setInlineForTest(false);
        continuation.setRegistrarForTest(null);
        continuation.cancel();
        continuation.resetBudgets();
        ResolverCredentials.clearAll();
        ResolverRegistry.get().resetForTest();
        NativePlaylist.resetForTest();
    }

    private static NativePlaylist.Track track(String key, String provider, String sourceId) {
        return new NativePlaylist.Track(key, provider, "mid-" + key, "T", "A", "B", 100_000L, "", "{}", sourceId);
    }

    private void seedPlaylist(NativePlaylist.Track... tracks) {
        List<NativePlaylist.Track> list = new ArrayList<>();
        for (NativePlaylist.Track t : tracks) list.add(t);
        NativePlaylist.get().replace(list, NativePlaylist.Mode.SEQUENCE, false, 0L, "test");
        engine.offerInitial(tracks[0].songKey);
        engine.cursor = 0;
        engine.msSinceJsWindow = 600_000L; // JS 冻结，全程沉默
    }

    /** 对照组：QQ 原版的下一首，原生独立解析（QQ 修复基线，不得回归）。 */
    @Test
    public void qqOriginalNextTrackStillResolvesNatively() {
        seedPlaylist(track("q1", "qq", "qq-original"), track("q2", "qq", "qq-original"));
        engine.drain();
        continuation.consider(engine, "drained");
        assertEquals("q2@qq", engine.lastAdopted());
        assertEquals("q2", engine.queue.get(engine.queue.size() - 1));
        assertFalse(engine.ended());
    }

    /** 修复目标：网易云原版的下一首，同样条件下原生独立解析。 */
    @Test
    public void neteaseOriginalNextTrackResolvesNativelyLikeQq() {
        seedPlaylist(track("n1", "netease", "netease-original"), track("n2", "netease", "netease-original"));
        engine.drain();
        continuation.consider(engine, "drained");
        assertEquals("n2@netease", engine.lastAdopted());
        assertEquals("n2", engine.queue.get(engine.queue.size() - 1));
        assertFalse(engine.ended());
    }

    /** 混编歌单：QQ→网易云→QQ 连续切换，每首歌都按自己的音源解析，Media3 不退回单条。 */
    @Test
    public void mixedQueueKeepsGrowingThroughProviderBoundaries() {
        seedPlaylist(
            track("m1", "qq", "qq-original"),
            track("m2", "netease", "netease-original"),
            track("m3", "qq", "qq-original"),
            track("m4", "netease", "netease-original"));
        for (int step = 0; step < 3; step++) {
            engine.drain();
            int before = engine.adopted.size();
            continuation.consider(engine, "drained");
            assertEquals("step " + step + " must materialize", before + 1, engine.adopted.size());
        }
        assertEquals("m4", engine.queue.get(engine.queue.size() - 1));
        assertEquals(3, engine.adopted.size());
        // 顺序由歌单决定：m2 是网易云、m3 是 QQ、m4 是网易云。
        assertTrue(engine.adopted.get(0).endsWith("@netease"));
        assertTrue(engine.adopted.get(1).endsWith("@qq"));
        assertTrue(engine.adopted.get(2).endsWith("@netease"));
    }

    /** 网易云凭据缺失时：不接管也不假装成功，如实回落 JS 通道（前台活着时的正常分工）。 */
    @Test
    public void neteaseWithoutCredentialsFallsBackToJsInsteadOfFakingSuccess() {
        // 把网易云假解析器换成"没有 Cookie 的真解析器"：canResolveNatively 必须为 false。
        ResolverRegistry.get().resetForTest();
        ResolverRegistry.get().registerForTest(new io.github.huleixin.tingyu.resolver.NeteaseResolver(""));
        ResolverRegistry.get().registerForTest(new PlatformResolver("qq"));
        seedPlaylist(track("n1", "netease", "netease-original"), track("n2", "netease", "netease-original"));
        engine.drain();
        continuation.consider(engine, "drained");
        assertTrue("no cookie → no takeover, WebView keeps answering while it can",
            engine.adopted.isEmpty());
        assertTrue("fallback must be observable, not silent", continuation.fallbacksForTest() > 0);
    }

    /** 用户主动暂停：任何音源都不许偷偷续上。 */
    @Test
    public void userPauseStopsEverySource() {
        seedPlaylist(track("p1", "netease", "netease-original"), track("p2", "netease", "netease-original"));
        seedPlaylist(track("p3", "qq", "qq-original"), track("p4", "qq", "qq-original"));
        engine.paused = true;
        engine.drain();
        continuation.consider(engine, "drained");
        assertEquals("paused user must never be overridden", 0, engine.adopted.size());
        assertEquals(BackgroundContinuation.Decision.STOP, BackgroundContinuation.decide(
            new BackgroundContinuation.Facts(0, true, true, 600_000L, true, true, true)));
    }

    /** 音源失败不互相传染：网易云解析连续失败只熔断网易云那一首，QQ 继续正常。 */
    @Test
    public void neteaseFailureDoesNotPoisonQqContinuation() {
        PlatformResolver netease = new PlatformResolver("netease");
        netease.failuresLeft = 99; // 永远失败 → 有界重试后熔断
        ResolverRegistry.get().resetForTest();
        ResolverRegistry.get().registerForTest(new PlatformResolver("qq"));
        ResolverRegistry.get().registerForTest(netease);
        seedPlaylist(track("x1", "netease", "netease-original"), track("x2", "netease", "netease-original"));
        engine.drain();
        continuation.consider(engine, "drained"); // attempt 1 → backoff
        int rearmsAfterFirst = engine.rearms;
        assertTrue("failure must schedule a bounded retry", rearmsAfterFirst > 0 || continuation.isResolving());
        // 换 QQ 歌单：网易云的失败预算不得影响 QQ 的解析。
        NativePlaylist.resetForTest();
        seedPlaylist(track("y1", "qq", "qq-original"), track("y2", "qq", "qq-original"));
        engine.drain();
        continuation.consider(engine, "drained");
        assertEquals("y2@qq", engine.lastAdopted());
    }
}
