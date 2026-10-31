package io.github.huleixin.tingyu.resolver;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;
import java.util.Base64;
import java.util.List;

import org.json.JSONObject;
import org.junit.Test;

// android/app/src/test/java/io/github/huleixin/tingyu/resolver/QishuiResolverTest.java
/**
 * 汽水解析器的**签名与解析回归**。
 *
 * <p>2026-10-31 真网证据（同一参数集/同一解析规则，Node 复刻）：
 * 匿名 client token → /search/ → /media/mget/ 全链 err_no=0；VIP 曲《晴天》
 * video_model 全加密（encrypt_info.encrypt=true），但 full 变体的 url_player_info
 * （AWS 签名 GetPlayInfo）匿名 GET 200 且 PlayInfoList 给出未加密 medium 明文
 * （host v95-…365yg.com）—— 这正是 url_player_info 兜底路径必须存在的原因。
 */
public class QishuiResolverTest {

    @Test
    public void commonParamsCarryTheCarSdkIdentity() {
        java.util.Map<String, String> params = QishuiResolver.commonParams("1234567890123456789");
        assertEquals("765213", params.get("aid"));
        assertEquals("byte_autoservice_lite", params.get("app_name"));
        assertEquals("bydSong", params.get("channel"));
        assertEquals("luna_open_sdk", params.get("caller_name"));
        assertEquals("1234567890123456789", params.get("device_id"));
        assertEquals("1234567890123456789", params.get("did"));
        assertEquals("1234567890123456789", params.get("iid"));
        assertEquals("qishui-1234567890123456789", params.get("vehicle_id"));
        assertTrue(params.get("_timestamp").matches("\\d+"));
        assertTrue(params.get("_nonce").matches("\\d+"));
    }

    @Test
    public void deviceIdIsNineteenDigits() {
        String id = QishuiResolver.randomDeviceId();
        assertTrue(id.matches("\\d{19}"));
        assertTrue(id.charAt(0) != '0');
    }

    @Test
    public void guardContentMatchesTheFrontendFormat() {
        // qishui.js:205：`ticket=<t>&path=<PREFIX><path>&timestamp=<秒>`。
        assertEquals("ticket=tok-1&path=/api/luna/v1/platform/media/mget/&timestamp=1720000000",
            QishuiResolver.guardContent("tok-1", "/media/mget/", 1720000000L));
    }

    @Test
    public void guardClientDataCarriesAllFourFields() throws Exception {
        String data = QishuiResolver.guardClientData("ts-sign-value", "req-sign-base64", 1720000000L);
        JSONObject json = new JSONObject(data);
        assertEquals("ts-sign-value", json.getString("ts_sign"));
        assertEquals("ticket,path,timestamp", json.getString("req_content"));
        assertEquals("req-sign-base64", json.getString("req_sign"));
        assertEquals(1720000000L, json.getLong("timestamp"));
    }

    @Test
    public void guardKeySignsVerifiablyWithSha256Ecdsa() throws Exception {
        // 真实 P-256 密钥：PKCS#8 PEM → signWithGuardKey → 用公钥验证 DER 签名。
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        KeyPair pair = generator.generateKeyPair();
        String pem = "-----BEGIN PRIVATE KEY-----\n"
            + Base64.getMimeEncoder(64, "\n".getBytes()).encodeToString(pair.getPrivate().getEncoded())
            + "\n-----END PRIVATE KEY-----\n";
        byte[] content = QishuiResolver.guardContent("t", "/media/mget/", 42L).getBytes("UTF-8");
        byte[] der = QishuiResolver.signWithGuardKey(pem, content);
        assertNotNull("合法 PKCS#8 P-256 私钥必须能签名", der);
        Signature verifier = Signature.getInstance("SHA256withECDSA");
        verifier.initVerify(pair.getPublic());
        verifier.update(content);
        assertTrue("签名必须能用对应公钥验证", verifier.verify(der));
        // 坏 PEM 如实返回 null（不抛出）。
        assertNull(QishuiResolver.signWithGuardKey("not a pem", content));
    }

    @Test
    public void trustedMediaHostEnforcesTheWhitelist() {
        assertTrue(QishuiResolver.trustedMediaHost("https://v95-abc-default.365yg.com/a.m4a"));
        assertTrue(QishuiResolver.trustedMediaHost("https://www.douyinvod.com/x"));
        assertFalse("http 不收", QishuiResolver.trustedMediaHost("http://v.365yg.com/x"));
        assertFalse("非 443 端口不收", QishuiResolver.trustedMediaHost("https://v.365yg.com:8080/x"));
        assertFalse("相似域名不收", QishuiResolver.trustedMediaHost("https://365yg.com.evil.example/x"));
        assertFalse(QishuiResolver.trustedMediaHost("https://evil.example/x"));
        assertFalse(QishuiResolver.trustedMediaHost(null));
    }

    @Test
    public void levelMappingMatchesTheFrontendTable() {
        assertEquals("standard", QishuiResolver.levelFor("medium"));
        assertEquals("high", QishuiResolver.levelFor("higher"));
        assertEquals("high", QishuiResolver.levelFor("highest"));
        assertEquals("lossless", QishuiResolver.levelFor("lossless"));
        assertEquals("hires", QishuiResolver.levelFor("hi_res"));
        assertEquals("standard", QishuiResolver.levelFor("unknown"));
        assertEquals(0, QishuiResolver.rankOf("standard"));
        assertEquals(3, QishuiResolver.rankOf("hires"));
    }

    @Test
    public void encryptedTracksAreSkipped() throws Exception {
        JSONObject plain = new JSONObject("{\"main_url\":\"https://v.365yg.com/a\",\"video_meta\":{\"quality\":\"medium\",\"bitrate\":65000}}");
        JSONObject encrypted = new JSONObject("{\"main_url\":\"https://v.365yg.com/b\",\"video_meta\":{\"quality\":\"lossless\"},"
            + "\"encrypt_info\":{\"encrypt\":true}}");
        JSONObject playAuth = new JSONObject("{\"main_url\":\"https://v.365yg.com/c\",\"PlayAuth\":\"x\"}");
        assertFalse(QishuiResolver.encrypted(plain));
        assertTrue(QishuiResolver.encrypted(encrypted));
        assertTrue(QishuiResolver.encrypted(playAuth));
    }

    private static String mgetBody(JSONObject playerInfo) throws Exception {
        return new JSONObject().put("data", new JSONObject().put("media_list",
            new org.json.JSONArray().put(new JSONObject().put("track_entity",
                new JSONObject().put("player_info", playerInfo))))).toString();
    }

    @Test
    public void candidatesFromVideoModelParseTheStringModelAndSkipEncrypted() throws Exception {
        // 真机形态：video_model 是 JSON 字符串，轨道带 encrypt_info。
        JSONObject player = new JSONObject()
            .put("full", new JSONObject().put("video_model_info", new JSONObject()
                .put("video_model", "{\"video_list\":["
                    + "{\"main_url\":\"https://v.365yg.com/lossless\",\"video_meta\":{\"quality\":\"lossless\",\"bitrate\":900000},\"encrypt_info\":{\"encrypt\":true}},"
                    + "{\"main_url\":\"https://v.365yg.com/medium\",\"video_meta\":{\"quality\":\"medium\",\"bitrate\":65000}}"
                    + "]}")));
        List<QishuiResolver.Candidate> candidates =
            QishuiResolver.candidatesFromVideoModel(player, "full");
        assertEquals(1, candidates.size());
        assertEquals("https://v.365yg.com/medium", candidates.get(0).url);
        assertEquals("standard", candidates.get(0).quality);
        assertEquals(65000L, candidates.get(0).bitrate);
        assertFalse(candidates.get(0).preview);
    }

    @Test
    public void urlPlayerInfoFallbackIsExtracted() throws Exception {
        JSONObject player = new JSONObject()
            .put("full", new JSONObject().put("video_model_info", new JSONObject()
                .put("url_player_info", "https://vod-luna.douyin.com/?Action=GetPlayInfo"))
                .put("expire_at", 1893456000));
        assertEquals("https://vod-luna.douyin.com/?Action=GetPlayInfo",
            QishuiResolver.urlPlayerInfoUrl(player, "full"));
        assertEquals("", QishuiResolver.urlPlayerInfoUrl(player, "preview"));
        assertEquals("", QishuiResolver.urlPlayerInfoUrl(new JSONObject(), "full"));
    }

    @Test
    public void playInfoListCandidatesUseTheCapitalizedFields() throws Exception {
        String body = "{\"Result\":{\"Data\":{\"PlayInfoList\":["
            + "{\"MainPlayUrl\":\"https://v.365yg.com/medium.m4a\",\"Quality\":\"medium\",\"Bitrate\":65437},"
            + "{\"MainPlayUrl\":\"https://evil.example/x.m4a\",\"Quality\":\"lossless\",\"Bitrate\":900000}"
            + "]}}}";
        List<QishuiResolver.Candidate> candidates = QishuiResolver.candidatesFromPlayInfoList(body);
        assertEquals("白名单外的 host 必须被丢弃", 1, candidates.size());
        assertEquals("standard", candidates.get(0).quality);
        assertEquals(65437L, candidates.get(0).bitrate);
    }

    @Test
    public void pickCandidatePrefersTheHighestAllowedQualityThenBitrate() {
        List<QishuiResolver.Candidate> candidates = java.util.Arrays.asList(
            new QishuiResolver.Candidate("u-medium", "standard", 65000L, false),
            new QishuiResolver.Candidate("u-high", "high", 130000L, false),
            new QishuiResolver.Candidate("u-lossless", "lossless", 900000L, false));
        // 请求 standard：超出档位的候选被压到请求档，取码率最高的那一条（与前台 rank 过滤同语义）。
        QishuiResolver.Candidate best = QishuiResolver.pickCandidate(candidates, "standard");
        assertEquals("u-lossless", best.url);
        // 请求 high：high 与被压档的 lossless 同 rank，取码率高者。
        assertEquals("u-lossless", QishuiResolver.pickCandidate(candidates, "high").url);
        assertNull(QishuiResolver.pickCandidate(java.util.Collections.<QishuiResolver.Candidate>emptyList(), "high"));
    }

    @Test
    public void resolveRejectsTracksWithoutValidMediaId() {
        QishuiResolver resolver = new QishuiResolver("");
        io.github.huleixin.tingyu.playback.NativePlaylist.Track bad =
            new io.github.huleixin.tingyu.playback.NativePlaylist.Track("k1", "qishui", "abc",
                "T", "A", "B", 1L, "", "");
        SourceResolution result = resolver.resolve(bad, "high");
        assertEquals(SourceResolution.Status.FAILURE, result.status);
        assertTrue(result.reason.contains("no valid media id"));
    }
}
