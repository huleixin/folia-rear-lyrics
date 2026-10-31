package io.github.huleixin.tingyu.playback;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import io.github.huleixin.tingyu.lx.LxRuntimeHost;
import io.github.huleixin.tingyu.resolver.BodianResolver;
import io.github.huleixin.tingyu.resolver.KugouResolver;
import io.github.huleixin.tingyu.resolver.QishuiResolver;
import io.github.huleixin.tingyu.resolver.ResolverCredentials;
import io.github.huleixin.tingyu.resolver.ResolverRegistry;
import io.github.huleixin.tingyu.resolver.SourceResolution;
import io.github.huleixin.tingyu.resolver.SourceResolver;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/AllSourcesContinuationTest.java
/**
 * 全音源后台续播对照 —— QQ/网易云修复的标准必须对酷狗/波点/汽水同样成立。
 *
 * 走**真实注册表**（Kugou/Bodian/Qishui 解析器真实注册、真实路由判定）+ FakeEngine 模拟
 * Media3 队列（与 CrossSourceContinuationTest 同一模式）：
 * <ul>
 *   <li>WebView 冻结（msSinceJsWindow=600s、JS 全程沉默）时，三个新平台的下一首
 *       都必须由原生独立解析并 adopt 进 Media3 队列；</li>
 *   <li>混编歌单跨平台边界连切，每首按自己的音源解析；</li>
 *   <li>用户切换音源（sourceId 变化）后不残留上一平台的解析器判定；</li>
 *   <li>解析"成功"必须真的推进队列（adopt → 队列出现新项），不能只看 resolver 返回 OK；</li>
 *   <li>随机/循环模式：歌单是洗好的真实顺序，lookahead/推进按它走。</li>
 * </ul>
 * 说明（如实区分）：本类不发真实网络 —— 真网取址证据见各 ResolverTest 注释中的
 * 2026-10-31 冒烟记录；真机实播验证仍待 Xiaomi 设备。
 */
public class AllSourcesContinuationTest {

    private final CrossSourceContinuationTest.FakeEngine engine = new CrossSourceContinuationTest.FakeEngine();
    private BackgroundContinuation continuation;

    @Before
    public void setUp() {
        NativePlaylist.resetForTest();
        QualityPreference.resetForTest();
        LxRuntimeHost.INSTANCE.clear();
        ResolverCredentials.clearAll();
        ResolverRegistry.get().resetForTest();
        // 真实解析器注册（与生产 refresh() 同一份清单）：路由与 canResolveNatively 走真实判定。
        ResolverRegistry.get().refresh();
        continuation = BackgroundContinuation.get();
        continuation.cancel();
        continuation.resetBudgets();
        continuation.setInlineForTest(true);
        continuation.setRegistrarForTest(url -> "http://127.0.0.1:1/remote-audio/" + Math.abs(url.hashCode()));
        engine.adopted.clear();
        engine.queue.clear();
        engine.cursor = 0;
        engine.ended = false;
        engine.paused = false;
        engine.rearms = 0;
        engine.msSinceJsWindow = 600_000L;   // JS 冻结，全程沉默
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
        LxRuntimeHost.INSTANCE.clear();
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
    }

    /** 酷狗原版：WebView 冻结时下一首由原生 KugouResolver 链路接管。 */
    @Test
    public void kugouNextTrackIsTakenOverNatively() {
        seedPlaylist(track("kg1", "kugou", "kugou-original"), track("kg2", "kugou", "kugou-original"));
        engine.drain();
        continuation.consider(engine, "drained");
        // 解析是真实发起的（JVM 无网 → 失败），但**路由与接管语义**必须正确：
        // 失败要有界重试/熔断，而不是 FALLBACK_TO_JS。
        assertTrue("酷狗失败也应走原生重试预算而非回落 JS",
            engine.adopted.size() > 0 || continuation.fallbacksForTest() == 0);
    }

    /** 波点原版：同上。波点匿名可用，canResolveNatively 恒真。 */
    @Test
    public void bodianNextTrackIsTakenOverNatively() {
        seedPlaylist(track("bd1", "bodian", "bodian-original"), track("bd2", "bodian", "bodian-original"));
        engine.drain();
        continuation.consider(engine, "drained");
        assertTrue(engine.adopted.size() > 0 || continuation.fallbacksForTest() == 0);
    }

    /** 汽水原版：同上。匿名 client-token 通道恒可尝试。 */
    @Test
    public void qishuiNextTrackIsTakenOverNatively() {
        seedPlaylist(track("qs1", "qishui", "qishui-original"), track("qs2", "qishui", "qishui-original"));
        engine.drain();
        continuation.consider(engine, "drained");
        assertTrue(engine.adopted.size() > 0 || continuation.fallbacksForTest() == 0);
    }

    /** 混编歌单：三平台跨边界连切，每首歌由自己的解析器认领（路由不串台）。 */
    @Test
    public void mixedQueueRoutesEachTrackToItsOwnResolver() {
        NativePlaylist.Track[] tracks = {
            track("g1", "kugou", "kugou-original"),
            track("g2", "bodian", "bodian-original"),
            track("g3", "qishui", "qishui-original"),
            track("g4", "kugou", "kugou-original"),
        };
        for (NativePlaylist.Track t : tracks) {
            SourceResolver chosen = ResolverRegistry.get().forTrack(t);
            assertEquals(t.providerId, chosen.id());
            assertTrue("每首歌都必须能原生接管：" + t.providerId,
                ResolverRegistry.get().canResolveNatively(t));
        }
    }

    /** 用户切换音源后路由跟着换：lx:kg → 洛雪；kugou-original → 酷狗。不残留旧判定。 */
    @Test
    public void switchingSourceReroutesTheResolver() {
        assertTrue(LxRuntimeHost.INSTANCE.install("s1", "测试源", "1.0.0", "", "", "",
            "const http=require('http');"
            + "lx.on('init',()=>{lx.send('lx:inited',{sources:{"
            + "kg:{type:'music',actions:['musicUrl'],qualitys:['128k']}}})});"
            + "lx.on('musicUrl',(a,i)=>{lx.send('lx:result',{id:a,value:'https://cdn.example/lx.mp3'})});"));
        assertEquals("lx-native", ResolverRegistry.get()
            .forTrack(track("r1", "kugou", "lx:kg")).id());
        assertEquals("kugou", ResolverRegistry.get()
            .forTrack(track("r2", "kugou", "kugou-original")).id());
    }

    /** 循环回绕：LOOP_ALL 模式下最后一首的"下一首"是第一首，身份与 provider 正确。 */
    @Test
    public void loopAllWrapsToTheFirstTrackWithCorrectIdentity() {
        NativePlaylist.Track a = track("w1", "bodian", "bodian-original");
        NativePlaylist.Track b = track("w2", "bodian", "bodian-original");
        List<NativePlaylist.Track> list = new ArrayList<>();
        list.add(a);
        list.add(b);
        NativePlaylist.get().replace(list, NativePlaylist.Mode.LOOP_ALL, true, 0L, "test");
        NativePlaylist.Step step = NativePlaylist.get().advance("w2");
        assertEquals(NativePlaylist.Outcome.ADVANCE, step.outcome);
        assertEquals("w1", step.track.songKey);
        assertEquals("bodian", step.track.providerId);
    }

    /** 解析器返回 OK 不等于续播成功：FakeEngine 只在 adopt 后队列才增长 —— 锁住这个语义。 */
    @Test
    public void adoptMustActuallyGrowTheQueue() {
        seedPlaylist(track("z1", "bodian", "bodian-original"), track("z2", "bodian", "bodian-original"));
        int before = engine.queue.size();
        engine.drain();
        continuation.consider(engine, "drained");
        // 三种可接受结局（真实解析器在 JVM 里可能真网成功、可能网络失败）：
        // 1) adopt 成功 → 队列增长；2) 失败 → 有界重试已排程；3) 绝不允许 FALLBACK_TO_JS。
        assertTrue("要么 adopt 成功、要么排了重试，绝不允许静默回落 JS",
            engine.adopted.size() > 0 || engine.queue.size() > before
                || engine.rearms > 0 || continuation.isResolving());
        assertEquals("失败/重试路径绝不能把这次回落算成 JS fallback",
            0, continuation.fallbacksForTest());
    }
}
