package io.github.huleixin.tingyu.resolver;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** QQ 解析器的纯协议部分：请求体构造、响应解析、通道可用性判定。不发真实网络请求。 */
public class QqResolverTest {

    @Test
    public void anonymousMusicuNeedsNoUserCredential() {
        String body = QqResolver.buildMusicuBody("003RCA7t0y6du5", "M800", "123456789012345678");
        assertTrue(body.contains("\"module\":\"vkey.GetVkeyServer\"".replace("\"", "\\\"")) || body.contains("vkey.GetVkeyServer"));
        assertTrue(body.contains("CgiGetVkey"));
        assertTrue(body.contains("M800003RCA7t0y6du5.mp3"));
        assertTrue("anonymous gateway: uin is 0, no cookie or token is embedded",
            body.contains("\"uin\":\"0\"") || body.contains("\"uin\": \"0\""));
        assertFalse(body.contains("qqmusic_session"));
    }

    @Test
    public void flacUsesTheFlacFilename() {
        String body = QqResolver.buildMusicuBody("abc", "F000", "1");
        assertTrue(body.contains("F000abc.flac"));
    }

    @Test
    public void aVkeyResponseBecomesAPlayableUrl() {
        String body = "{\"code\":0,\"req_0\":{\"code\":0,\"data\":{"
            + "\"sip\":[\"https://a.stream.qqmusic.qq.com/\"],"
            + "\"midurlinfo\":[{\"purl\":\"M800abc.mp3?vkey=XYZ\"}]}}}";
        assertEquals("https://a.stream.qqmusic.qq.com/M800abc.mp3?vkey=XYZ", QqResolver.parseMusicu(body));
    }

    @Test
    public void aResponseWithoutSipFallsBackToTheDefaultCdn() {
        String body = "{\"code\":0,\"req_0\":{\"code\":0,\"data\":{"
            + "\"midurlinfo\":[{\"purl\":\"M500abc.mp3?vkey=K\"}]}}}";
        assertEquals(QqResolver.DEFAULT_SIP + "M500abc.mp3?vkey=K", QqResolver.parseMusicu(body));
    }

    @Test
    public void anEmptyPurlIsNotAPlayableUrl() {
        String body = "{\"code\":0,\"req_0\":{\"code\":0,\"data\":{"
            + "\"midurlinfo\":[{\"purl\":\"\"}]}}}";
        assertEquals("", QqResolver.parseMusicu(body));
        assertFalse(QqResolver.isPlayable(QqResolver.parseMusicu(body)));
    }

    @Test
    public void theBackendWrapperKeyIsAlsoAccepted() {
        String body = "{\"code\":0,\"request\":{\"code\":0,\"data\":{"
            + "\"midurlinfo\":[{\"purl\":\"p.flac?v=1\"}]}}}";
        assertEquals(QqResolver.DEFAULT_SIP + "p.flac?v=1", QqResolver.parseMusicu(body));
    }

    @Test
    public void qualityFallsBackDownwardsInsteadOfFailingAtOnce() {
        assertEquals("M500", QqResolver.qualityChain("standard")[0]);
        assertEquals(2, QqResolver.qualityChain("high").length);
        assertEquals("M800", QqResolver.qualityChain("high")[0]);
        assertEquals("M500", QqResolver.qualityChain("high")[1]);
        assertEquals(3, QqResolver.qualityChain("lossless").length);
        assertEquals("F000", QqResolver.qualityChain("lossless")[0]);
    }

    @Test
    public void theExtensionBridgeIsNotAUsableNativeBackend() {
        // 正式包里 VITE_QQ_API_BASE 就是这个值：它靠 window.postMessage 找浏览器扩展，
        // 原生侧既没有 window 也没有扩展，必须判为不可用。
        assertFalse(QqResolver.isUsableBackendBase("extension"));
        assertFalse(QqResolver.isUsableBackendBase("folia-extension://qq"));
        assertFalse(QqResolver.isUsableBackendBase("/api/qq"));
        assertFalse(QqResolver.isUsableBackendBase(""));
        assertFalse(QqResolver.isUsableBackendBase(null));
        assertTrue(QqResolver.isUsableBackendBase("https://qq.example.com"));
        assertTrue(QqResolver.isUsableBackendBase("http://127.0.0.1:3200"));
    }

    @Test
    public void theBackendRequestCarriesNoCredentialWhenNoneWasConfigured() {
        QqResolver resolver = new QqResolver("https://qq.example.com/", "", false);
        String url = resolver.buildBackendUrl("abc", "", "320", 1700000000000L);
        assertTrue(url.startsWith("https://qq.example.com/getMusicPlay/abc?quality=320"));
        assertTrue(url.endsWith("&timestamp=1700000000000"));
        assertTrue(url.contains("timestamp"));
        assertFalse(url.contains("cookie="));
    }

    @Test
    public void aRelativeBackendProducesNoRequest() {
        QqResolver resolver = new QqResolver("extension", "cookie", false);
        assertEquals("", resolver.buildBackendUrl("abc", "", "320", 1L));
    }

    @Test
    public void theSessionTokenIsReadOutOfTheCookieString() {
        assertEquals("TOKEN", QqResolver.tokenFromCookie("qqmusic_session=TOKEN; other=1"));
        assertEquals("", QqResolver.tokenFromCookie("other=1"));
    }

    @Test
    public void onlyHttpAndHttpsArePlayable() {
        assertTrue(QqResolver.isPlayable("https://a.b/c.mp3"));
        assertTrue(QqResolver.isPlayable("http://a.b/c.mp3"));
        assertFalse(QqResolver.isPlayable("content://media/x"));
        assertFalse(QqResolver.isPlayable(""));
        assertFalse(QqResolver.isPlayable(null));
    }

    @Test
    public void theBackendResponseParserPrefersTheRequestedSong() {
        String body = "{\"data\":{\"playUrl\":{\"other\":{\"url\":\"https://x/other.mp3\"},"
            + "\"abc\":{\"url\":\"https://x/abc.mp3\"}}}}";
        assertEquals("https://x/abc.mp3", QqResolver.parseBackendUrl(body, "abc"));
        assertEquals("https://x/other.mp3", QqResolver.parseBackendUrl(body, "missing"));
    }
}
