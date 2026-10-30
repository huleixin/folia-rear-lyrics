package io.github.huleixin.tingyu.lx;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/**
 * 洛雪原生引擎里**不需要 QuickJS** 的那部分：工具函数、平台/音质映射、musicInfo 构造、
 * 以及 HTTP 的边界校验。
 *
 * 这些是脚本能跑对的前提：身份拼错就是"取到别的歌"，边界放错就是把本机代理暴露给第三方脚本。
 */
public class LxEngineTest {

    private static JSONObject call(String op, Object... args) throws Exception {
        JSONArray array = new JSONArray();
        for (Object arg : args) array.put(arg);
        String raw = LxUtility.INSTANCE.handle(new JSONObject().put("op", op).put("args", array).toString());
        return new JSONObject(raw);
    }

    @Test public void md5MatchesTheReferenceDigest() throws Exception {
        assertEquals("900150983cd24fb0d6963f7d28e17f72", call("md5", "abc").optString("value"));
    }

    @Test public void bufferFromAcceptsHexBase64AndUtf8() throws Exception {
        JSONArray hex = call("buffer", "616263", "hex").optJSONArray("value");
        assertEquals(3, hex.length());
        assertEquals(97, hex.optInt(0));
        JSONArray base64 = call("buffer", "YWJj", "base64").optJSONArray("value");
        assertEquals(3, base64.length());
        assertEquals(99, base64.optInt(2));
        JSONArray utf8 = call("buffer", "abc", "utf8").optJSONArray("value");
        assertEquals(3, utf8.length());
    }

    @Test public void bufToStringRoundTrips() throws Exception {
        JSONArray bytes = call("buffer", "abc", "utf8").optJSONArray("value");
        assertEquals("abc", call("string", bytes, "utf8").optString("value"));
        assertEquals("616263", call("string", bytes, "hex").optString("value"));
        assertEquals("YWJj", call("string", bytes, "base64").optString("value"));
    }

    @Test public void aesEncryptsWithTheDocumentedModesAndRoundTrips() throws Exception {
        JSONObject key = call("buffer", "0123456789abcdef", "utf8");
        JSONObject iv = call("buffer", "abcdef0123456789", "utf8");
        JSONObject data = call("buffer", "hello lx source", "utf8");
        for (String mode : new String[] { "aes-128-cbc", "aes-128-ecb" }) {
            JSONArray cipher = call("aes", data.optJSONArray("value"), mode,
                key.optJSONArray("value"), iv.optJSONArray("value")).optJSONArray("value");
            assertTrue(mode + " produced no ciphertext", cipher != null && cipher.length() >= 16);
            byte[] raw = new byte[cipher.length()];
            for (int i = 0; i < raw.length; i++) raw[i] = (byte) cipher.optInt(i);
            // 同一实现解密回来必须还原明文，证明模式/填充/iv 与 CryptoJS 一致。
            javax.crypto.spec.SecretKeySpec secret = new javax.crypto.spec.SecretKeySpec(
                "0123456789abcdef".getBytes(java.nio.charset.StandardCharsets.UTF_8), "AES");
            javax.crypto.Cipher decoder = javax.crypto.Cipher.getInstance(
                mode.endsWith("ecb") ? "AES/ECB/PKCS5Padding" : "AES/CBC/PKCS5Padding");
            if (mode.endsWith("ecb")) {
                decoder.init(javax.crypto.Cipher.DECRYPT_MODE, secret);
            } else {
                decoder.init(javax.crypto.Cipher.DECRYPT_MODE, secret,
                    new javax.crypto.spec.IvParameterSpec(
                        "abcdef0123456789".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
            }
            byte[] plain = decoder.doFinal(raw);
            assertEquals(mode, "hello lx source", new String(plain, java.nio.charset.StandardCharsets.UTF_8));
        }
    }

    @Test public void aesRejectsUnknownModes() throws Exception {
        JSONObject empty = call("buffer", "", "utf8");
        assertTrue(call("aes", empty.optJSONArray("value"), "des-cbc", empty.optJSONArray("value"),
            empty.optJSONArray("value")).has("error"));
    }

    @Test public void randomBytesAreBounded() throws Exception {
        assertEquals(8, call("random", 8).optJSONArray("value").length());
        assertTrue(call("random", 99999).has("error"));
        assertTrue(call("random", -1).has("error"));
    }

    @Test public void platformMappingCoversTheFaultChain() throws Exception {
        // 真机故障链路是 provider=qq / kind=lx:tx —— 必须落到 tx。
        assertEquals("tx", LxPlatform.INSTANCE.sourceFor("qq"));
        assertEquals("tx", LxPlatform.INSTANCE.sourceFor("lx-tx"));
        assertEquals("wy", LxPlatform.INSTANCE.sourceFor("netease"));
        assertNull(LxPlatform.INSTANCE.sourceFor("local"));
        assertNull(LxPlatform.INSTANCE.sourceFor(null));
    }

    @Test public void qualityFallsBackInsteadOfFailing() throws Exception {
        assertEquals("320k", LxPlatform.INSTANCE.qualityFor("high", java.util.Arrays.asList("128k", "320k")));
        assertEquals("128k", LxPlatform.INSTANCE.qualityFor("lossless", java.util.Collections.singletonList("128k")));
        try {
            LxPlatform.INSTANCE.qualityFor("high", java.util.Collections.emptyList());
            fail("no usable quality must fail loudly");
        } catch (Exception expected) {
            // 期望的行为：明确失败，而不是假装 high 可用。
        }
    }

    @Test public void capabilitiesKeepOnlyUsablePlatforms() throws Exception {
        JSONObject sources = new JSONObject()
            .put("tx", new JSONObject().put("type", "music")
                .put("actions", new JSONArray().put("musicUrl"))
                .put("qualitys", new JSONArray().put("128k").put("320k").put("192k")))
            .put("kg", new JSONObject().put("type", "music")
                .put("actions", new JSONArray().put("lyric"))
                .put("qualitys", new JSONArray().put("128k")));
        java.util.Map<String, java.util.List<String>> parsed =
            LxPlatform.INSTANCE.validateCapabilities(sources);
        assertTrue(parsed.containsKey("tx"));
        assertFalse(parsed.containsKey("kg"));
        // 192k 不是移动版支持的档位，必须被过滤掉。
        assertEquals(2, parsed.get("tx").size());
    }

    @Test public void musicInfoCarriesTheIdentityTheScriptReads() throws Exception {
        JSONObject info = LxPlatform.INSTANCE.musicInfo("tx", "qq", "0039MnYb0qxYhV", "晴天", "周杰伦",
            "叶惠美", 269, "https://img/cover.jpg",
            new JSONObject().put("songMid", "0039MnYb0qxYhV").put("mediaMid", "003Qui1q2u1Zho").toString(),
            java.util.Arrays.asList("128k", "320k"));
        assertEquals("0039MnYb0qxYhV", info.optString("songmid"));
        assertEquals("tx", info.optString("source"));
        assertEquals("周杰伦", info.optString("singer"));
        assertEquals("4:29", info.optString("interval"));
        assertEquals(2, info.optJSONArray("types").length());
        assertEquals(2, info.optJSONObject("meta").optJSONArray("qualitys").length());
        // providerData 里的原平台字段要透传，脚本常常直接读它们。
        assertEquals("003Qui1q2u1Zho", info.optString("mediaMid"));
    }

    @Test public void httpGuardBlocksEverythingThatIsNotPublicHttp() throws Exception {
        String[] blocked = {
            "http://127.0.0.1:8080/remote-audio/token",
            "http://localhost/x",
            "http://192.168.1.5/x",
            "http://10.0.0.2/x",
            "file:///sdcard/secret",
            "https://user:pass@example.com/x",
            "http://example",
        };
        for (String url : blocked) {
            try {
                LxHttp.INSTANCE.validateUrl(url);
                fail("should have blocked " + url);
            } catch (Exception expected) {
                // 期望的行为：第三方脚本不能碰到本机代理与内网。
            }
        }
        assertEquals("https://api.vkeys.cn/x", LxHttp.INSTANCE.validateUrl("https://api.vkeys.cn/x"));
    }

    @Test public void httpHostIsReportableWithoutTheUrl() throws Exception {
        assertEquals("api.vkeys.cn", LxHttp.INSTANCE.hostOf("https://api.vkeys.cn/a/b?token=secret"));
    }
}
