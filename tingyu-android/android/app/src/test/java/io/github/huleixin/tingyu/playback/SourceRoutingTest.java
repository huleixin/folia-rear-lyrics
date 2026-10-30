package io.github.huleixin.tingyu.playback;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import io.github.huleixin.tingyu.lx.LxRuntimeHost;
import io.github.huleixin.tingyu.resolver.ResolverCredentials;
import io.github.huleixin.tingyu.resolver.ResolverRegistry;
import io.github.huleixin.tingyu.resolver.SourceResolver;

/**
 * 「这首歌是谁」与「地址从哪来」必须分开。
 *
 * <p>真机报告 {@code provider=qq lxSource=tx} 被判给 {@code resolver=lx-native}，而设备
 * {@code lx engine installed=no}：原生只能回答 SCRIPT_NOT_INSTALLED，于是 takeovers=0、
 * fallbacks=16，最后 queue-exhausted 停播。根因就是路由只看了 provider 身份，没看用户选的音源。
 */
public class SourceRoutingTest {

    private static final String SCRIPT =
        "const http=require('http');"
        + "lx.on('init',()=>{lx.send('lx:inited',{sources:{"
        + "tx:{type:'music',actions:['musicUrl'],qualitys:['320k','128k']}}})});"
        + "lx.on('musicUrl',(a,i)=>{lx.send('lx:result',{id:a,value:'https://cdn.example/' + i.musicInfo.id + '.mp3'})});";

    private static NativePlaylist.Track track(String songKey, String providerId, String sourceId) {
        return new NativePlaylist.Track(songKey, providerId, "mid-" + songKey, "T", "A", "B",
            200_000L, "", "", sourceId);
    }

    @Before
    public void setUp() {
        NativePlaylist.get().resetForTest();
        LxRuntimeHost.INSTANCE.clear();
        ResolverRegistry.get().resetForTest();
        ResolverRegistry.get().refresh();
    }

    @After
    public void tearDown() {
        NativePlaylist.get().resetForTest();
        LxRuntimeHost.INSTANCE.clear();
        ResolverCredentials.clearAll();
        ResolverRegistry.get().resetForTest();
        ResolverRegistry.get().refresh();
    }

    // ---------------------------------------------------------------- 纯规则

    @Test
    public void kindIsReadFromTheSourceIdNotTheProvider() {
        assertEquals(SourceRouting.Kind.LX, SourceRouting.kindOf("lx:tx"));
        assertEquals(SourceRouting.Kind.ORIGINAL, SourceRouting.kindOf("qq-original"));
        assertEquals(SourceRouting.Kind.ORIGINAL, SourceRouting.kindOf("original:qq"));
        assertEquals(SourceRouting.Kind.UNKNOWN, SourceRouting.kindOf(""));
        assertEquals(SourceRouting.Kind.UNKNOWN, SourceRouting.kindOf(null));
    }

    @Test
    public void anOriginalSelectionOnlyCountsForItsOwnProvider() {
        assertTrue(SourceRouting.prefersOriginal("qq-original", "qq"));
        assertFalse("换了平台就不再是这个平台的原版", SourceRouting.prefersOriginal("qq-original", "netease"));
        assertTrue(SourceRouting.prefersLx("LX:TX"));
        assertFalse(SourceRouting.prefersLx("qq-original"));
    }

    @Test
    public void expectedResolverFollowsTheSelection() {
        assertEquals("lx-native", SourceRouting.expectedResolverId("lx:tx", "qq"));
        assertEquals("qq", SourceRouting.expectedResolverId("qq-original", "qq"));
        // 前端没说就交给旧的平台启发式，不在这一层替它做决定。
        assertEquals("", SourceRouting.expectedResolverId("", "qq"));
    }

    @Test
    public void theFiftyHundredBugIsDetectedAsAMismatch() {
        // 这就是报告里那一行：选了 QQ 原版，却由洛雪解析器接了。
        assertFalse(SourceRouting.matchesSelection("qq-original", "qq", "lx-native"));
        assertTrue(SourceRouting.matchesSelection("qq-original", "qq", "qq"));
        assertTrue(SourceRouting.matchesSelection("lx:tx", "qq", "lx-native"));
    }

    // ---------------------------------------------------------------- 注册表实际路由

    @Test
    public void aQqOriginalTrackIsHandledByTheQqResolverEvenWithoutAScript() {
        NativePlaylist.Track song = track("song-a", "qq", "qq-original");
        SourceResolver chosen = ResolverRegistry.get().forTrack(song);
        assertEquals("选了 QQ 原版就必须走 QQ 自己的解析器，不能因为平台有 tx 源就塞给洛雪",
            "qq", chosen.id());
    }

    @Test
    public void theSameSongFromTheLxSourceStillGoesToTheNativeScript() {
        assertTrue(LxRuntimeHost.INSTANCE.install("s1", "测试源", "1.0.0", "", "", "", SCRIPT));
        SourceResolver chosen = ResolverRegistry.get().forTrack(track("song-b", "qq", "lx:tx"));
        assertEquals("lx-native", chosen.id());
    }

    @Test
    public void anLxSelectionNeverSilentlyDegradesToTheQqBackend() {
        // 用户选了洛雪，脚本却没装：必须回答 SCRIPT_NOT_INSTALLED，而不是悄悄换解析器。
        NativePlaylist.Track song = track("song-c", "qq", "lx:tx");
        assertEquals("lx-native", ResolverRegistry.get().forTrack(song).id());
        assertFalse(ResolverRegistry.get().canResolveNatively(song));
    }

    @Test
    public void legacySyncPacketsWithoutASourceIdKeepTheOldBehaviour() {
        // 老版本同步包不打 sourceId：行为必须与 1.3.50 完全一致，一条不多一条不少。
        assertTrue(LxRuntimeHost.INSTANCE.install("s1", "测试源", "1.0.0", "", "", "", SCRIPT));
        assertEquals("lx-native", ResolverRegistry.get().forTrack(track("song-d", "qq", "")).id());
    }

    // ---------------------------------------------------------------- 凭据

    @Test
    public void credentialsAreReportedWithoutTheirValues() {
        java.util.Map<String, String> values = new java.util.HashMap<>();
        values.put("base", "https://very-secret-backend.example.com");
        values.put("cookie", "qqmusic_session=SUPERSECRET");
        values.put("cookieAsHeader", "false");
        ResolverCredentials.configure("qq", values);

        String described = ResolverCredentials.describe();
        assertTrue(described.contains("qq"));
        assertFalse("诊断里绝不能出现后端地址或会话串", described.contains("SUPERSECRET"));
        assertFalse(described.contains("very-secret-backend"));
        assertTrue("配了多久要说出来，方便判断后台会话是否已经过期", ResolverCredentials.ageMs("qq") >= 0L);
        assertEquals(-1L, ResolverCredentials.ageMs("netease"));
    }
}
