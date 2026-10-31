package io.github.huleixin.tingyu.resolver;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.Test;

// android/app/src/test/java/io/github/huleixin/tingyu/resolver/BodianResolverTest.java
/**
 * 波点解析器的**签名与解析回归**。
 *
 * <p>签名黄金向量由与前端 bodian.js:91-96 完全同构的 Node 脚本（真实
 * URLSearchParams + crypto.md5）生成，锁死 Java 移植版与前台算法的逐字符一致 ——
 * 签名差一个字符服务端就是 401/invalid sign，这是"移植走样"最常见的形式。
 * 另附 2026-10-31 真网证据：匿名 搜索→checkRight(status=1)→audioUrl(host bd-lv.kuwo.cn)
 * 全链在本机用同一算法取到过真实地址。
 */
public class BodianResolverTest {

    private static Map<String, String> params(Object... pairs) {
        Map<String, String> out = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) out.put((String) pairs[i], (String) pairs[i + 1]);
        return out;
    }

    @Test
    public void signMatchesTheFrontendAlgorithmGoldenVector() {
        // node 黄金向量（bodian.js signQuery 同构脚本）：
        // checkRight /api/play/music/v2/checkRight
        // {musicId:12345, freeSign:'', uid:'-1', token:'', timestamp:'1720000000000'}
        Map<String, String> query = params(
            "musicId", "12345", "freeSign", "", "uid", "-1", "token", "", "timestamp", "1720000000000");
        assertEquals("bf5a94bbb10466b22d2bda26ba167432",
            BodianResolver.signQuery("/api/play/music/v2/checkRight", query));
    }

    @Test
    public void audioUrlSignMatchesGoldenVector() {
        Map<String, String> query = params(
            "devId", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "musicId", "12345",
            "format", "mp3", "br", "128kmp3", "freeSign", "",
            "uid", "-1", "token", "", "timestamp", "1720000000000");
        assertEquals("aac35601b349cb9d032dd8b77dea479c",
            BodianResolver.signQuery("/api/play/music/v2/audioUrl", query));
    }

    @Test
    public void urlEncodingMatchesUrlSearchParams() {
        // URLSearchParams: 空格→'+'，'~' 不转义（二者与 URLEncoder 行为一致的关键字符）。
        assertEquals("a+b", BodianResolver.urlEncode("a b"));
        // URLEncoder 与 URLSearchParams 在 '~' 上编码不同（%7E vs 原样），但签名只取
        // 字母数字字符，'~' 不参与 —— 差异对签名与服务器解码结果均无影响。
        assertEquals("%7E", BodianResolver.urlEncode("~"));
        assertEquals("%26%3D", BodianResolver.urlEncode("&="));
        Map<String, String> query = params("a", "x y", "b", "z");
        assertEquals("a=x+y&b=z", BodianResolver.serializeQuery(query));
    }

    @Test
    public void qualityChainDescendsAndMapsHiresToLossless() {
        assertEquals(2, BodianResolver.qualityIndex("lossless"));
        assertEquals(2, BodianResolver.qualityIndex("hires"));
        assertEquals(1, BodianResolver.qualityIndex("high"));
        assertEquals(0, BodianResolver.qualityIndex("standard"));
        assertEquals(0, BodianResolver.qualityIndex("unknown"));
        int[] chain = BodianResolver.qualityChain("lossless");
        assertEquals(3, chain.length);
        assertEquals(2, chain[0]);
        assertEquals(1, chain[1]);
        assertEquals(0, chain[2]);
        assertEquals(2, BodianResolver.qualityChain("high").length);
    }

    @Test
    public void parseAudioUrlReadsHttpsFirstAndValidates() {
        assertEquals("https://bd-lv.kuwo.cn/x.mp3", BodianResolver.parseAudioUrl(
            "{\"code\":200,\"data\":{\"audioHttpsUrl\":\"https://bd-lv.kuwo.cn/x.mp3\"}}"));
        // http 回退字段也可用。
        assertEquals("http://bd-lv.kuwo.cn/x.mp3", BodianResolver.parseAudioUrl(
            "{\"code\":200,\"data\":{\"audioUrl\":\"http://bd-lv.kuwo.cn/x.mp3\"}}"));
        // 带 userinfo 的地址必须被拒（bodian.js validateAudioUrl 的语义）。
        assertEquals("", BodianResolver.parseAudioUrl(
            "{\"code\":200,\"data\":{\"audioUrl\":\"https://user:pass@evil.example/x.mp3\"}}"));
        // 业务码非 200 / 缺字段一律空。
        assertEquals("", BodianResolver.parseAudioUrl("{\"code\":407,\"data\":{}}"));
        assertEquals("", BodianResolver.parseAudioUrl("{\"code\":200}"));
        assertEquals("", BodianResolver.parseAudioUrl("not json"));
    }

    @Test
    public void isPlayableUrlRejectsUserinfoAndNonHttp() {
        assertTrue(BodianResolver.isPlayableUrl("https://bd-lv.kuwo.cn/a.mp3"));
        assertTrue(BodianResolver.isPlayableUrl("http://bd-lv.kuwo.cn/a.mp3"));
        assertFalse(BodianResolver.isPlayableUrl("https://u:p@host/a.mp3"));
        assertFalse(BodianResolver.isPlayableUrl("ftp://host/a.mp3"));
        assertFalse(BodianResolver.isPlayableUrl(""));
        assertFalse(BodianResolver.isPlayableUrl(null));
    }

    @Test
    public void rightStatusReadsCheckRightSemantics() {
        assertEquals(1, BodianResolver.rightStatus("{\"code\":200,\"data\":{\"status\":1}}"));
        assertEquals(3, BodianResolver.rightStatus("{\"code\":200,\"data\":{\"status\":3}}"));
        assertEquals(7, BodianResolver.rightStatus("{\"code\":200,\"data\":{\"status\":7}}"));
        assertEquals(-1, BodianResolver.rightStatus("{\"code\":200,\"data\":{}}"));
        assertEquals(-1, BodianResolver.rightStatus("{\"code\":200}"));
        assertEquals(-1, BodianResolver.rightStatus(""));
    }

    @Test
    public void resolveRejectsTracksWithoutValidMediaId() {
        BodianResolver resolver = new BodianResolver("");
        io.github.huleixin.tingyu.playback.NativePlaylist.Track noId =
            new io.github.huleixin.tingyu.playback.NativePlaylist.Track("k1", "bodian", "",
                "T", "A", "B", 1L, "", "");
        SourceResolution result = resolver.resolve(noId, "high");
        assertEquals(SourceResolution.Status.FAILURE, result.status);
        assertTrue(result.reason.contains("no valid media id"));
    }

    @Test
    public void jsonFieldReadsProviderDataSafely() {
        assertEquals("sig-1", BodianResolver.jsonField("{\"freeSign\":\"sig-1\"}", "freeSign"));
        assertEquals("", BodianResolver.jsonField("not json", "freeSign"));
        assertEquals("", BodianResolver.jsonField(null, "freeSign"));
    }
}
