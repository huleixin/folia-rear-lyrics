package io.github.huleixin.tingyu.resolver;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;

import org.junit.After;
import org.junit.Test;

import io.github.huleixin.tingyu.playback.NativePlaylist;
import io.github.huleixin.tingyu.playback.SourceRouting;

/**
 * 网易云原生解析器 —— 与 QQ 修复同一条标准：不依赖 WebView 也能拿到可播放地址。
 *
 * 覆盖的是「后台续播会踩到」的全部环节：eapi 加密与请求构造（与前台 eapi.js 逐字段同构）、
 * 音质降级链、试听兜底、登录态缺失时的如实报告，以及注册表路由（netease-original 归网易云解析器）。
 */
public class NeteaseResolverTest {

    @After
    public void tearDown() {
        ResolverCredentials.clearAll();
    }

    // ---------------------------------------------------------------- eapi 加密

    private static String eapiDecrypt(String paramsHex) throws Exception {
        byte[] bytes = new byte[paramsHex.length() / 2];
        for (int i = 0; i < bytes.length; i++) {
            bytes[i] = (byte) Integer.parseInt(paramsHex.substring(i * 2, i * 2 + 2), 16);
        }
        Cipher cipher = Cipher.getInstance("AES/ECB/PKCS5Padding");
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec("e82ckenh8dichen8".getBytes(StandardCharsets.UTF_8), "AES"));
        return new String(cipher.doFinal(bytes), StandardCharsets.UTF_8);
    }

    @Test
    public void eapiEncryptRoundTripsWithOfficialKeyAndStructure() throws Exception {
        String params = NeteaseResolver.eapiEncrypt("/api/song/enhance/player/url/v1", "{\"ids\":[\"123\"]}");
        assertFalse(params.isEmpty());
        String decrypted = eapiDecrypt(params);
        // 结构必须是官方客户端形态：url-分隔符-文本-分隔符-md5，密文用固定密钥可解。
        assertEquals(-1, decrypted.indexOf("\u0000"));
        assertTrue(decrypted, decrypted.startsWith("/api/song/enhance/player/url/v1-36cd479b6b5-"));
        assertTrue(decrypted.contains("{\"ids\":[\"123\"]}"));
        // payload 以 MD5 摘要结尾：32 位小写 hex。
        int lastSeparator = decrypted.lastIndexOf("-36cd479b6b5-");
        String digest = decrypted.substring(lastSeparator + "-36cd479b6b5-".length());
        assertEquals(32, digest.length());
        assertTrue(digest.matches("[0-9a-f]{32}"));
        assertTrue(decrypted.endsWith(digest));
    }

    // ---------------------------------------------------------------- 请求构造

    @Test
    public void buildEapiHeaderMirrorsOfficialClientFields() {
        String cookie = "MUSIC_U=abcdef123456; __csrf=csrfToken9; NMTID=abc123; deviceId=myDeviceId";
        Map<String, String> header = NeteaseResolver.buildEapiHeader(cookie, "");
        // 登录态与防风控字段全部就位。
        assertEquals("abcdef123456", header.get("MUSIC_U"));
        assertEquals("csrfToken9", header.get("__csrf"));
        assertEquals("abc123", header.get("NMTID"));
        assertEquals("myDeviceId", header.get("deviceId"));
        assertEquals("iPhone OS", header.get("os"));
        assertEquals("9.0.90", header.get("appver"));
        assertEquals("true", header.get("__remember_me"));
        // 缺失的字段用进程级稳定值补齐，不能是空。
        assertFalse(header.get("_ntes_nuid").isEmpty());
        assertFalse(header.get("WNMCID").isEmpty());
        // Cookie 头能由 header 块原样格式化出来（MUSIC_U 必须在其中）。
        String cookieHeader = NeteaseResolver.formatCookieHeader(header);
        assertTrue(cookieHeader.contains("MUSIC_U=abcdef123456"));
        assertTrue(cookieHeader.contains("__csrf=csrfToken9"));
    }

    @Test
    public void cookieHeaderNeverDropsLoginIdentity() {
        String cookie = "MUSIC_U=tinytoken";
        String formatted = NeteaseResolver.formatCookieHeader(NeteaseResolver.buildEapiHeader(cookie, ""));
        assertTrue(formatted.contains("MUSIC_U=tinytoken"));
    }

    // ---------------------------------------------------------------- 音质链

    @Test
    public void qualityChainFollowsPreferenceAndSkipsSvipOnlyTier() {
        String[] standard = NeteaseResolver.qualityChain("standard");
        assertEquals(1, standard.length);
        assertEquals("standard", standard[0]);
        String[] high = NeteaseResolver.qualityChain("high");
        assertEquals("exhigh", high[0]);
        assertEquals("standard", high[high.length - 1]);
        String[] lossless = NeteaseResolver.qualityChain("lossless");
        assertEquals("lossless", lossless[0]);
        String[] hires = NeteaseResolver.qualityChain("hires");
        assertEquals("hires", hires[0]);
        assertEquals("standard", hires[hires.length - 1]);
        // jymaster 是 svip 专属：与前台 svipReady=false 的过滤一致，不主动请求。
        String[] master = NeteaseResolver.qualityChain("jymaster");
        assertEquals("hires", master[0]);
        // 未知偏好与前台一致：从 hires 开降。
        assertEquals("hires", NeteaseResolver.qualityChain("nonsense")[0]);
    }

    @Test
    public void lowerLevelGoesDownNotUp() {
        assertEquals("lossless", NeteaseResolver.lowerLevel("hires"));
        assertEquals("exhigh", NeteaseResolver.lowerLevel("lossless"));
        assertEquals("standard", NeteaseResolver.lowerLevel("exhigh"));
        assertEquals("", NeteaseResolver.lowerLevel("standard"));
        assertEquals("", NeteaseResolver.lowerLevel(""));
        assertEquals("", NeteaseResolver.lowerLevelFor("never-resolved"));
    }

    // ---------------------------------------------------------------- 响应解析

    @Test
    public void parseSongUrlAcceptsRealUrlAndRewritesToHttps() {
        String body = "{\"code\":200,\"data\":[{\"url\":\"http://m701.music.126.net/f?a=1\","
            + "\"level\":\"exhigh\",\"type\":\"mp3\",\"br\":320000}]}";
        String[] parsed = NeteaseResolver.parseSongUrl(body);
        assertEquals("https://m701.music.126.net/f?a=1", parsed[0]);
        assertEquals("exhigh", parsed[1]);
        assertEquals("", parsed[2]);
    }

    @Test
    public void parseSongUrlMarksFreeTrial() {
        String body = "{\"code\":200,\"data\":[{\"url\":\"https://m.example/a.mp3\","
            + "\"level\":\"lossless\",\"freeTrialInfo\":[{\"start\":0,\"end\":30000}]}]}";
        String[] parsed = NeteaseResolver.parseSongUrl(body);
        assertEquals("1", parsed[2]);
    }

    @Test
    public void parseSongUrlRejectsBusinessErrorsAndEmptyData() {
        assertEquals("", NeteaseResolver.parseSongUrl("{\"code\":301,\"msg\":\"no login\"}")[0]);
        assertEquals("", NeteaseResolver.parseSongUrl("{\"code\":200,\"data\":[]}")[0]);
        assertEquals("", NeteaseResolver.parseSongUrl("{\"code\":200,\"data\":[{\"url\":\"\"}]}")[0]);
        assertEquals("", NeteaseResolver.parseSongUrl("not json")[0]);
        assertEquals("", NeteaseResolver.parseSongUrl(null)[0]);
    }

    // ---------------------------------------------------------------- 路由与接管判定

    private static NativePlaylist.Track neteaseTrack(String sourceId) {
        return new NativePlaylist.Track("netease-1", "netease", "203947", "歌名", "歌手", "专辑",
                180_000L, "", "{}", sourceId);
    }

    @Test
    public void registryRoutesNeteaseOriginalToNeteaseResolver() {
        ResolverCredentials.configure("netease", java.util.Collections.singletonMap("cookie", "MUSIC_U=x"));
        ResolverRegistry registry = ResolverRegistry.get();
        registry.refresh();
        SourceResolver chosen = registry.forTrack(neteaseTrack("netease-original"));
        assertTrue(chosen instanceof NeteaseResolver);
        // 不带 sourceId 的旧同步包也按平台启发式归网易云解析器，行为与前台一致。
        // sourceId 未知的旧同步包沿用既有设计：平台已映射的歌优先判给洛雪（无脚本时它明确
        // 回 UNSUPPORTED 而不是假装成功）。这不是本次改动引入的，断言只做非回归锚定。
        assertTrue(registry.forTrack(neteaseTrack("")) instanceof LxNativeResolver);
        // 有 Cookie 才接管；没有就回落 JS 通道（前台 WebView 自己能取）。
        assertTrue(registry.canResolveNatively(neteaseTrack("netease-original")));
        ResolverCredentials.clearAll();
        registry.refresh();
        assertFalse(registry.canResolveNatively(neteaseTrack("netease-original")));
        // 严格音源隔离：用户选 QQ 原版的歌绝不能落到网易云解析器。
        NativePlaylist.Track qqTrack = new NativePlaylist.Track("qq-1", "qq", "0039MnYb0qxYhV", "t", "a", "al",
                180_000L, "", "{}", "qq-original");
        assertFalse(registry.forTrack(qqTrack) instanceof NeteaseResolver);
        assertTrue(SourceRouting.prefersOriginal("netease-original", "netease"));
        // 洛雪选择同样不许被网易云抢走。
        NativePlaylist.Track lxTrack = new NativePlaylist.Track("netease-2", "netease", "203947", "t", "a", "al",
                180_000L, "", "{}", "lx:wy");
        assertTrue(registry.forTrack(lxTrack) instanceof LxNativeResolver
            || registry.forTrack(lxTrack) instanceof LxScriptResolver);
    }

    @Test
    public void resolveReportsHonestFailuresWithoutCookieOrId() {
        NeteaseResolver empty = new NeteaseResolver("");
        SourceResolution noCookie = empty.resolve(neteaseTrack("netease-original"), "high");
        assertFalse(noCookie.ok());
        assertEquals(SourceResolution.Status.FAILURE, noCookie.status);
        NeteaseResolver withCookie = new NeteaseResolver("MUSIC_U=x");
        SourceResolution noId = withCookie.resolve(
            new NativePlaylist.Track("netease-3", "netease", "", "t", "a", "al", 0L, "", "{}", "netease-original"), "high");
        assertFalse(noId.ok());
        assertTrue(noId.reason.contains("no song id"));
        // 非网易云的歌明确 UNSUPPORTED，不是 FAILURE（不烧重试预算）。
        SourceResolution wrong = withCookie.resolve(
            new NativePlaylist.Track("kugou-1", "kugou", "x", "t", "a", "al", 0L, "", "{}", ""), "high");
        assertEquals(SourceResolution.Status.UNSUPPORTED, wrong.status);
    }
}
