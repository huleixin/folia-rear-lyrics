package io.github.huleixin.tingyu.resolver;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.util.HashMap;
import java.util.Map;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import io.github.huleixin.tingyu.lx.LxRuntimeHost;
import io.github.huleixin.tingyu.playback.NativePlaylist;

/**
 * 音源路由：这首歌的地址到底该由谁去取。
 *
 * 真机 1.3.48 的诊断是 `provider=qq lxSource=tx resolver=qq`，随后 187 次
 * `musicu returned no playable url`。根因就在路由：只看 provider 身份，
 * 不看这首歌实际走的是哪条取地址链路。这里把六条规则固定成测试。
 *
 * 注意 `provider=qq` 只说明**这首歌是谁**，`lxSource=tx` 才说明**地址从哪来**。
 * `omni.getAudioSource` 里只要用户启用了脚本，所有在线歌曲都先走洛雪。
 */
public class ResolverRoutingTest {

    private static final String SCRIPT =
        "const http=require('http');"
        + "lx.on('init',()=>{lx.send('lx:inited',{sources:{"
        + "tx:{type:'music',actions:['musicUrl'],qualitys:['320k','128k']}}})});"
        + "lx.on('musicUrl',(a,i)=>{lx.send('lx:result',{id:a,value:'https://cdn.example/' + i.musicInfo.id + '.mp3'})});";

    private static NativePlaylist.Track track(String songKey, String providerId) {
        return new NativePlaylist.Track(songKey, providerId, "mid-" + songKey, "T", "A", "B", 100_000L, "", "");
    }

    @Before
    public void setUp() {
        LxRuntimeHost.INSTANCE.clear();
        ResolverRegistry.get().resetForTest();
        ResolverRegistry.get().refresh();
        QqResolver.resetMusicuBreakerForTest();
    }

    @After
    public void tearDown() {
        LxRuntimeHost.INSTANCE.clear();
        ResolverCredentials.configure("qq", new HashMap<String, String>());
        ResolverRegistry.get().resetForTest();
        ResolverRegistry.get().refresh();
        QqResolver.resetMusicuBreakerForTest();
    }

    @Test
    public void qqSongFromLxSourceIsRoutedToTheNativeScript() {
        // A：provider=qq（身份）+ lxSource=tx（链路）+ 脚本已装 → 必须选 lx-native。
        assertTrue("脚本必须真的装进原生宿主", LxRuntimeHost.INSTANCE.install(
            "s1", "测试源", "1.0.0", "", "", "", SCRIPT));
        NativePlaylist.Track song = track("song-a", "qq");

        SourceResolver chosen = ResolverRegistry.get().forTrack(song);
        assertNotNull("provider=qq + lxSource=tx 必须有原生解析器认领", chosen);
        assertEquals("lx-native", chosen.id());
        assertTrue(ResolverRegistry.get().canResolveNatively(song));
    }

    @Test
    public void lxProviderIdsAlsoRouteToTheNativeScript() {
        // providerId 本身带 lx- 前缀（洛雪目录里的歌）同样归 lx-native。
        assertTrue(LxRuntimeHost.INSTANCE.install("s1", "测试源", "1.0.0", "", "", "", SCRIPT));
        assertEquals("lx-native", ResolverRegistry.get().forTrack(track("song-b", "lx-tx")).id());
    }

    @Test
    public void withoutAScriptTheLxRouteSaysSoInsteadOfSilentlyUsingMusicu() {
        // B：脚本没装 → 明确 SCRIPT_NOT_INSTALLED，绝不能悄悄改走匿名 musicu。
        NativePlaylist.Track song = track("song-c", "qq");
        SourceResolver chosen = ResolverRegistry.get().forTrack(song);
        assertNotNull(chosen);
        assertEquals("lx-native", chosen.id());
        assertFalse("没有脚本时原生不能宣称自己能取地址", ResolverRegistry.get().canResolveNatively(song));

        SourceResolution resolution = ResolverRegistry.get().resolve(song, "high");
        assertEquals(SourceResolution.Status.UNSUPPORTED, resolution.status);
        assertTrue("原因必须写清楚，不能是含糊的失败：" + resolution.reason,
            resolution.reason.contains("SCRIPT_NOT_INSTALLED"));
    }

    @Test
    public void aUsableSelfHostedBackendIsStillAllowedWhenNoScriptIsInstalled() {
        // F（回归）：用户自己配了可用的 QQ 后端、且没装脚本时，后端通道仍然可用。
        Map<String, String> credentials = new HashMap<>();
        credentials.put("base", "https://qq-api.example.com");
        ResolverCredentials.configure("qq", credentials);
        ResolverRegistry.get().refresh();

        SourceResolver chosen = ResolverRegistry.get().forTrack(track("song-d", "qq"));
        assertNotNull(chosen);
        assertEquals("qq", chosen.id());
        assertTrue(((QqResolver) chosen).backendUsable());
    }

    @Test
    public void theExtensionBridgeIsNeverTreatedAsAUsableBackend() {
        // F（回归）：正式包的 VITE_QQ_API_BASE=extension 在原生侧没有 HTTP 地址，
        // 不能因为"配了后端"就让 QQ 解析器抢走洛雪链路。
        Map<String, String> credentials = new HashMap<>();
        credentials.put("base", "extension");
        ResolverCredentials.configure("qq", credentials);
        ResolverRegistry.get().refresh();

        assertFalse(QqResolver.isUsableBackendBase("extension"));
        SourceResolver chosen = ResolverRegistry.get().forTrack(track("song-e", "qq"));
        assertNotNull(chosen);
        assertEquals("没有可用后端时必须回到洛雪路由", "lx-native", chosen.id());
    }

    @Test
    public void nonLxProvidersKeepTheirOwnRoute() {
        // F（回归）：本地 / Navidrome / 舞台来源完全不受洛雪路由影响。
        assertTrue(LxRuntimeHost.INSTANCE.install("s1", "测试源", "1.0.0", "", "", "", SCRIPT));
        ResolverRegistry.get().registerForTest(new SourceResolver() {
            @Override public String id() { return "navidrome"; }
            @Override public boolean supports(String providerId) { return "navidrome".equals(providerId); }
            @Override public SourceResolution resolve(NativePlaylist.Track track, String quality) {
                return SourceResolution.ok("http://127.0.0.1:1/stream", quality, System.currentTimeMillis());
            }
        });
        assertEquals("navidrome", ResolverRegistry.get().forTrack(track("song-f", "navidrome")).id());
        assertTrue(ResolverRegistry.get().canResolveNatively(track("song-f", "navidrome")));
    }

    @Test
    public void musicuFailureTripsACircuitAfterABoundedNumberOfAttempts() {
        // 匿名 musicu 今天取不到地址（实测 purl 恒空 / result=104003）。它必须能被熔断，
        // 否则真机那种"每 1.5 秒一次、几百次全是空"会一直空转。
        // 这里不发真实网络请求，只验证熔断的计数与恢复语义。
        assertTrue("熔断未打开时仍允许试", QqResolver.musicuOpen());
        QqResolver.noteMusicuMissForTest();
        QqResolver.noteMusicuMissForTest();
        assertTrue("两次空结果还不该熔断", QqResolver.musicuOpen());
        QqResolver.noteMusicuMissForTest();
        assertFalse("连续三次空结果后匿名通道必须熔断", QqResolver.musicuOpen());

        QqResolver anonymous = new QqResolver("", "", false);
        assertFalse(anonymous.canAttempt());
        SourceResolution blocked = anonymous.resolve(track("song-g", "qq"), "high");
        assertEquals(SourceResolution.Status.FAILURE, blocked.status);
        assertTrue("熔断期间连请求都不该发：" + blocked.reason, blocked.reason.contains("circuit open"));

        QqResolver.resetMusicuBreakerForTest();
        assertTrue(QqResolver.musicuOpen());
    }
}
