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
 * 后台续播的**取流路径同构**回归（真机 1.3.182 后台 QQ 连续 502）。
 *
 * 前台对 kuwo/网易/波点/洛雪/汽水的地址先经 {@code proxyNativeRemoteAudioUrl} 进本地代理，
 * 对 QQ 却把 CDN 直链直接交给 Media3 —— 后台续播必须与前台走**同一条**路径：
 *  - 解析器声明直连（SourceResolution.okDirect，QQ 系）→ 不得登记代理，直链原样交给播放器；
 *  - 默认（代理系）→ 仍然登记本地代理。
 *
 * 1.3.182 的故障正是 QQ 被塞进代理：代理用兑底的 kuwo Referer + 固定 UA 去请求 QQ CDN，
 * 上游拒收后代理包成 502，后台连续 31 次 502 @127.0.0.1，回前台直连立刻恢复。
 */
public class ContinuationProxyParityTest {

    static final class FakeEngine implements BackgroundContinuation.Host {
        final List<String> queue = new ArrayList<>();
        int cursor = 0;
        boolean ended;
        boolean paused;
        long msSinceJsWindow = -1L;
        final List<String> adopted = new ArrayList<>();
        final List<String> adoptedUris = new ArrayList<>();
        void offerInitial(String... songKeys) { for (String key : songKeys) queue.add(key); }
        void drain() {
            if (cursor < queue.size() - 1) { cursor++; ended = false; }
            else if (!ended && !queue.isEmpty()) { ended = true; }
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
            adoptedUris.add(uri);
            queue.add(track.songKey);
            if (ended) { ended = false; cursor = queue.indexOf(track.songKey); }
        }
        @Override public void rearmSupervision(long delayMs) { }
        @Override public void runOnMain(Runnable action) { action.run(); }
        String lastAdoptedUri() { return adoptedUris.isEmpty() ? "" : adoptedUris.get(adoptedUris.size() - 1); }
    }

    /** 可配置返回直连或代理地址的假解析器，并记录登记动作是否发生。 */
    static final class FakeResolver implements SourceResolver {
        private final String id;
        boolean direct;
        @Override public String id() { return id; }
        @Override public boolean supports(String providerId) { return id.equals(providerId); }
        @Override public SourceResolution resolve(NativePlaylist.Track track, String quality) {
            return direct
                ? SourceResolution.okDirect("https://cdn.example/" + track.songKey + ".mp3", quality, System.currentTimeMillis())
                : SourceResolution.ok("https://cdn.example/" + track.songKey + ".mp3", quality, System.currentTimeMillis());
        }
        FakeResolver(String id) { this.id = id; }
    }

    private FakeEngine engine;
    private FakeResolver resolver;
    private BackgroundContinuation continuation;
    private final AtomicInteger registrations = new AtomicInteger();

    @Before
    public void setUp() {
        NativePlaylist.resetForTest();
        QualityPreference.resetForTest();
        ResolverRegistry.get().resetForTest();
        resolver = new FakeResolver("demo");
        ResolverRegistry.get().registerForTest(resolver);
        engine = new FakeEngine();
        continuation = BackgroundContinuation.get();
        continuation.cancel();
        continuation.resetBudgets();
        continuation.setInlineForTest(true);
        registrations.set(0);
        continuation.setRegistrarForTest(url -> {
            registrations.incrementAndGet();
            return "http://127.0.0.1:1/remote-audio/" + Math.abs(url.hashCode());
        });
    }

    @After
    public void tearDown() {
        continuation.setInlineForTest(false);
        continuation.setRegistrarForTest(null);
        continuation.cancel();
        continuation.resetBudgets();
        ResolverRegistry.get().resetForTest();
        NativePlaylist.resetForTest();
        QualityPreference.resetForTest();
    }

    private static List<NativePlaylist.Track> ledger(int count, String providerId) {
        List<NativePlaylist.Track> tracks = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            tracks.add(new NativePlaylist.Track("song-" + i, providerId, "mid-" + i, "T", "A", "B", 100_000L, "", ""));
        }
        return tracks;
    }

    private void startSession(String providerId) {
        // providerId 必须与假解析器的 id 一致（注册表按它路由，与 BackgroundContinuationTest 同约定）。
        NativePlaylist.get().replace(ledger(4, providerId), NativePlaylist.Mode.SEQUENCE, false, 0L, "test");
        engine.offerInitial("song-0");
        engine.msSinceJsWindow = 600_000L;
        engine.drain();
    }

    @Test
    public void aDirectResolutionNeverEntersTheLocalProxy() {
        // QQ：前台直连，后台也必须直连。登记一次都不许发生。
        resolver.direct = true;
        startSession("demo");
        continuation.consider(engine, "drained");
        assertEquals("the next track must be adopted natively", 1, engine.adopted.size());
        assertEquals("song-1", engine.adopted.get(0));
        assertEquals("a direct URL must reach Media3 verbatim, not through 127.0.0.1",
            "https://cdn.example/song-1.mp3", engine.lastAdoptedUri());
        assertEquals("the local proxy must not be involved for direct sources", 0, registrations.get());
    }

    @Test
    public void aProxiedResolutionStillRegistersWithTheLocalProxy() {
        // kuwo/网易/波点/洛雪/汽水：前台先过代理，后台同构。
        resolver.direct = false;
        startSession("demo");
        continuation.consider(engine, "drained");
        assertEquals(1, engine.adopted.size());
        assertTrue("proxied sources keep the local proxy hop",
            engine.lastAdoptedUri().startsWith("http://127.0.0.1:1/remote-audio/"));
        assertEquals("exactly one registration per adoption", 1, registrations.get());
    }

    @Test
    public void okDirectIsTheOnlyNonProxyFactory() {
        assertTrue("ok() 默认走代理（前台同构）", SourceResolution.ok("https://x/y", "high", 1L).proxy());
        assertTrue("带头的 ok() 同样默认走代理",
            SourceResolution.ok("https://x/y", "high", java.util.Collections.emptyMap(), 1L).proxy());
        assertFalse("okDirect() 必须直连（QQ 与前台直连同构）",
            SourceResolution.okDirect("https://x/y", "high", 1L).proxy());
    }
}
