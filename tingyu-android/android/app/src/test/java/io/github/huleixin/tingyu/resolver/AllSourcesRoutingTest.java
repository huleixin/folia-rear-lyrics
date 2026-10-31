package io.github.huleixin.tingyu.resolver;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import io.github.huleixin.tingyu.lx.LxRuntimeHost;
import io.github.huleixin.tingyu.playback.NativePlaylist;

// android/app/src/test/java/io/github/huleixin/tingyu/resolver/AllSourcesRoutingTest.java
/**
 * 2026-10-31 全音源续播能力的**路由回归**：酷狗/波点/汽水加入原生注册表后，
 * <ul>
 *   <li>明确选了平台原版（{@code kugou-original} 等，前台 nativePlaylistSync 在未启用洛雪时
 *       恒定下发这个形态）→ 必须由平台自己的解析器认领；</li>
 *   <li>用户启用洛雪脚本（{@code lx:kg}）→ 仍然由 lx-native 认领，平台解析器绝不抢；</li>
 *   <li>前台同步包没带 sourceId（老版本）时，既有启发式行为不变。</li>
 * </ul>
 * 这是"新增音源只接前台不接后台"这类缺口的直接防线。
 */
public class AllSourcesRoutingTest {

    private static final String SCRIPT =
        "const http=require('http');"
        + "lx.on('init',()=>{lx.send('lx:inited',{sources:{"
        + "kg:{type:'music',actions:['musicUrl'],qualitys:['320k','128k']}}})});"
        + "lx.on('musicUrl',(a,i)=>{lx.send('lx:result',{id:a,value:'https://cdn.example/' + i.musicInfo.id + '.mp3'})});";

    private static NativePlaylist.Track track(String songKey, String providerId, String sourceId) {
        return new NativePlaylist.Track(songKey, providerId, "mid-" + songKey, "T", "A", "B",
            100_000L, "", "", sourceId);
    }

    @Before
    public void setUp() {
        LxRuntimeHost.INSTANCE.clear();
        ResolverRegistry.get().resetForTest();
        ResolverRegistry.get().refresh();
    }

    @After
    public void tearDown() {
        LxRuntimeHost.INSTANCE.clear();
        ResolverRegistry.get().resetForTest();
        ResolverRegistry.get().refresh();
    }

    @Test
    public void kugouOriginalRoutesToTheKugouResolver() {
        SourceResolver chosen = ResolverRegistry.get().forTrack(track("s1", "kugou", "kugou-original"));
        assertEquals("kugou", chosen.id());
        assertTrue(ResolverRegistry.get().canResolveNatively(track("s1", "kugou", "kugou-original")));
    }

    @Test
    public void bodianOriginalRoutesToTheBodianResolver() {
        SourceResolver chosen = ResolverRegistry.get().forTrack(track("s2", "bodian", "bodian-original"));
        assertEquals("bodian", chosen.id());
        assertTrue(ResolverRegistry.get().canResolveNatively(track("s2", "bodian", "bodian-original")));
    }

    @Test
    public void qishuiOriginalRoutesToTheQishuiResolver() {
        SourceResolver chosen = ResolverRegistry.get().forTrack(track("s3", "qishui", "qishui-original"));
        assertEquals("qishui", chosen.id());
        assertTrue(ResolverRegistry.get().canResolveNatively(track("s3", "qishui", "qishui-original")));
    }

    @Test
    public void lxScriptStillOwnsKugouWhenTheUserChoseIt() {
        // 用户选了洛雪（lx:kg）：即使酷狗有自己的解析器，也不能抢洛雪的链路。
        assertTrue(LxRuntimeHost.INSTANCE.install("s1", "测试源", "1.0.0", "", "", "", SCRIPT));
        SourceResolver chosen = ResolverRegistry.get().forTrack(track("s4", "kugou", "lx:kg"));
        assertEquals("lx-native", chosen.id());
    }

    @Test
    public void unknownSourceIdKugouKeepsTheLegacyHeuristic() {
        // 老同步包没有 sourceId：kugou 在洛雪平台表里（kg），沿用既有启发式归 lx-native。
        SourceResolver chosen = ResolverRegistry.get().forTrack(track("s5", "kugou", ""));
        assertEquals("lx-native", chosen.id());
        // bodian/qishui 不在洛雪平台表里：UNKNOWN 直接落到自己的解析器。
        assertEquals("bodian", ResolverRegistry.get().forTrack(track("s6", "bodian", "")).id());
        assertEquals("qishui", ResolverRegistry.get().forTrack(track("s7", "qishui", "")).id());
    }

    @Test
    public void registryDescribesAllSevenResolvers() {
        String text = ResolverRegistry.get().describe();
        for (String id : new String[] { "lx-native", "qq", "netease", "kugou", "bodian", "qishui", "lx-script" }) {
            assertTrue("注册表必须包含 " + id + "：" + text, text.contains(id));
        }
    }
}
