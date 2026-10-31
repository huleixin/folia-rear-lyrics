package io.github.huleixin.tingyu.resolver;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.Test;

// android/app/src/test/java/io/github/huleixin/tingyu/resolver/KugouResolverTest.java
/**
 * 酷狗解析器的**签名与解析回归**。
 *
 * <p>签名黄金向量由与前端 kugou.js:834-840/1637-1643 完全同构的 Node 脚本生成。
 * 2026-10-31 真网证据（同一算法）：
 * <ul>
 *   <li>VIP 曲《晴天》匿名链正确被拒（playInfo error=需要付费 / tracker status=2）——
 *       请求与签名被服务端接受到"能评权限"的程度，说明格式正确；</li>
 *   <li>免费曲目匿名 playInfo 取到真实 URL（host sharefs.kugou.com）。</li>
 * </ul>
 */
public class KugouResolverTest {

    private static Map<String, String> params(Object... pairs) {
        Map<String, String> out = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) out.put((String) pairs[i], (String) pairs[i + 1]);
        return out;
    }

    @Test
    public void androidSignatureMatchesTheFrontendGoldenVector() {
        // node 黄金向量：signatureKGAndroidParams（kugou.js:834-840 同构脚本）。
        Map<String, String> params = params(
            "hash", "abc123", "userid", "42", "token", "tok",
            "clienttime", "1720000000", "mid", "12345678901234567",
            "dfid", "AAAAAAAAAAAAAAAAAAAAAAAA", "appid", "3116", "quality", "128");
        assertEquals("d8f01ffb81150f128c45c49c16e4b62f",
            KugouResolver.signatureAndroidParams(params));
    }

    @Test
    public void trackerKeyMatchesTheFrontendGoldenVector() {
        assertEquals("e0402628b002e595570dd23cf94836cc",
            KugouResolver.trackerKey("ABC123", "12345678901234567", "42", "1005"));
        // 匿名（userid 空）与历史拼接兼容：hash 归一小写、userid 非数字归 0。
        assertEquals("5a52c2e3aafa994746f33480db6910e2",
            KugouResolver.trackerKey("abc123", "12345678901234567", "0", "3116"));
        assertEquals("5a52c2e3aafa994746f33480db6910e2",
            KugouResolver.trackerKey("ABC123", "12345678901234567", "abc", "3116"));
    }

    @Test
    public void qualityChainFollowsTheProviderMapping() {
        // kugouProvider.ts:757-768：standard→128, high→320, lossless/hires→flac。
        String[] hires = KugouResolver.qualityChain("hires");
        assertEquals("flac", hires[0]);
        assertEquals("320", hires[1]);
        assertEquals("128", hires[2]);
        String[] high = KugouResolver.qualityChain("high");
        assertEquals("320", high[0]);
        assertEquals("128", high[1]);
        String[] standard = KugouResolver.qualityChain("standard");
        assertEquals(1, standard.length);
        assertEquals("128", standard[0]);
        // 未知偏好按最低档，不高估权限。
        assertEquals("128", KugouResolver.qualityChain("whatever")[0]);
    }

    @Test
    public void parsePlayUrlWalksAllDocumentedFields() {
        assertEquals("https://fs.example/a.mp3", KugouResolver.parsePlayUrl("{\"url\":\"https://fs.example/a.mp3\"}"));
        assertEquals("https://fs.example/b.mp3", KugouResolver.parsePlayUrl("{\"backupUrl\":[\"https://fs.example/b.mp3\"]}"));
        assertEquals("https://fs.example/c.mp3", KugouResolver.parsePlayUrl("{\"data\":{\"play_url\":\"https://fs.example/c.mp3\"}}"));
        // 非http项被跳过。
        assertEquals("https://fs.example/d.mp3", KugouResolver.parsePlayUrl(
            "{\"backupUrl\":[\"\",\"https://fs.example/d.mp3\"]}"));
        assertEquals("", KugouResolver.parsePlayUrl("{\"status\":2}"));
        assertEquals("", KugouResolver.parsePlayUrl(""));
    }

    @Test
    public void parsePlayInfoUrlHandlesTheMobileEndpoint() {
        assertEquals("https://sharefs.kugou.com/x.mp3",
            KugouResolver.parsePlayInfoUrl("{\"url\":\"https://sharefs.kugou.com/x.mp3\"}"));
        assertEquals("https://sharefs.kugou.com/y.mp3",
            KugouResolver.parsePlayInfoUrl("{\"backup_url\":[\"https://sharefs.kugou.com/y.mp3\"]}"));
        assertEquals("", KugouResolver.parsePlayInfoUrl("{\"error\":\"需要付费\"}"));
        assertEquals("", KugouResolver.parsePlayInfoUrl("{\"url\":\"not-a-url\"}"));
    }

    @Test
    public void trackerStatusDetectsVipBlocked() {
        assertEquals(2, KugouResolver.trackerStatus("{\"status\":2}"));
        assertEquals(0, KugouResolver.trackerStatus("{}"));
        assertEquals(0, KugouResolver.trackerStatus("garbage"));
    }

    @Test
    public void resolveReportsMissingHashInsteadOfGuessing() {
        KugouResolver resolver = new KugouResolver("");
        io.github.huleixin.tingyu.playback.NativePlaylist.Track badHash =
            new io.github.huleixin.tingyu.playback.NativePlaylist.Track("k1", "kugou", "not-a-hash",
                "T", "A", "B", 1L, "", "");
        SourceResolution result = resolver.resolve(badHash, "high");
        assertEquals(SourceResolution.Status.FAILURE, result.status);
        assertTrue(result.reason.contains("MISSING_HASH"));
    }

    @Test
    public void resolveFallsBackToProviderDataHashWhenMediaIdIsNotAHash() {
        // 老同步包 mediaId 可能是 mixSongId：providerData.hash 是第二身份来源。
        KugouResolver resolver = new KugouResolver("");
        io.github.huleixin.tingyu.playback.NativePlaylist.Track track =
            new io.github.huleixin.tingyu.playback.NativePlaylist.Track("k1", "kugou", "998877",
                "T", "A", "B", 1L, "", "{\"hash\":\"b3a52a7a958bf0aed0ebfba2e9a818b7\",\"albumId\":\"123\"}");
        // 这里不发真实网络：只验证身份提取成功后进入网络阶段（JVM 上网络失败如实报 failure）。
        SourceResolution result = resolver.resolve(track, "high");
        assertEquals(SourceResolution.Status.FAILURE, result.status);
        assertTrue("进入网络阶段后失败原因应是网络类而非 MISSING_HASH：" + result.reason,
            !result.reason.contains("MISSING_HASH"));
    }
}
