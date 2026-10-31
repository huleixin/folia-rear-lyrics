package io.github.huleixin.tingyu.resolver;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.net.URLEncoder;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.TimeUnit;

import io.github.huleixin.tingyu.playback.NativePlaylist;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

// android/app/src/main/java/io/github/huleixin/tingyu/resolver/BodianResolver.java
/**
 * 波点音乐的原生解析器 —— 从 {@code src/nativeBridge/api/bodian.js} 逐字段移植。
 *
 * <p><b>为什么需要它：</b>波点的取址链跑在 WebView 里（bodian.js），WebView 冻结后
 * BackgroundContinuation 只能 FALLBACK_TO_JS —— 与网易云修复前一模一样的缺口。
 *
 * <p><b>移植的请求流程</b>（bodian.js:442-481 createPlaybackOperation）：
 * <ol>
 *   <li>{@code GET bd-api.kuwo.cn/api/play/music/v2/checkRight?musicId&freeSign&uid&token&timestamp&sign}</li>
 *   <li>status=3 → 试听（前台 bodianProvider 直接拒绝试听，这里同样如实报告不播放）；
 *       status=7 / status 缺失 → not-playable / auth-required；</li>
 *   <li>{@code GET /api/play/music/v2/audioUrl?devId&musicId&format&br&freeSign&uid&token&timestamp&sign}</li>
 * </ol>
 *
 * <p><b>签名</b>（bodian.js:91-96 signQuery）：
 * query 串里只保留字母数字字符 → <b>字符级</b>排序 → 拼在常量 {@code kuwotest} 后 →
 * 拼 path → MD5。GET 无 body。没有任何密钥之外的输入，纯 JVM 可复现。
 *
 * <p><b>身份与登录态</b>：mediaId 是数字歌曲 id；会话 {uid,token} 由 JS 从
 * localStorage bodianSessionV1 经 ResolverCredentials('bodian','session') 同步（只存内存）。
 * 匿名（uid=-1）可播免费曲目；受限曲目回 407/11012/20018，如实映射。
 */
public final class BodianResolver implements SourceResolver {

    public static final String API_ORIGIN = "https://bd-api.kuwo.cn";

    /** bodian.js:426-430 QUALITIES；hires 在 bodian.js:444 映射为 lossless。 */
    private static final String[][] QUALITY_LEVELS = {
        { "standard", "mp3", "128kmp3" },
        { "high", "mp3", "320kmp3" },
        { "lossless", "flac", "2000kflac" },
    };

    private static final OkHttpClient CLIENT = new OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build();

    /** 进程级设备身份（bodian.js:642-653 的 32 hex 随机 deviceId；进程内固定避免环境漂移）。 */
    private static final String DEVICE_ID = randomHex(32);

    private final String sessionJson;

    public BodianResolver(String sessionJson) {
        this.sessionJson = sessionJson == null ? "" : sessionJson.trim();
    }

    public static BodianResolver fromCredentials() {
        return new BodianResolver(ResolverCredentials.value("bodian", "session"));
    }

    /** 波点不强制登录：匿名也能取免费曲目，所以恒可尝试。 */
    public boolean canAttempt() {
        return true;
    }

    @Override public String id() {
        return "bodian";
    }

    @Override public boolean supports(String providerId) {
        return "bodian".equals(providerId);
    }

    // ---------------------------------------------------------------- 会话

    private String uid() {
        return jsonField(sessionJson, "uid");
    }

    private String token() {
        return jsonField(sessionJson, "token");
    }

    // ---------------------------------------------------------------- 签名（bodian.js:91-96 的镜像，纯函数）

    /** JS URLSearchParams 序列化：application/x-www-form-urlencoded，空格→'+'（与 URLEncoder 一致）。 */
    static String urlEncode(String value) {
        try {
            return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8.name());
        } catch (Exception error) {
            return "";
        }
    }

    static String serializeQuery(Map<String, String> params) {
        StringBuilder out = new StringBuilder();
        for (Map.Entry<String, String> entry : params.entrySet()) {
            if (out.length() > 0) out.append('&');
            out.append(urlEncode(entry.getKey())).append('=').append(urlEncode(entry.getValue()));
        }
        return out.toString();
    }

    /**
     * signQuery 的镜像。注意排序对象是<b>字符</b>（不是参数）：query 里所有 [a-zA-Z0-9]
     * 字符逐个收集后按码位排序。Java 的 char[] 排序与 JS 的默认字符串排序同为 UTF-16 码位序。
     */
    public static String signQuery(String path, Map<String, String> params) {
        String query = serializeQuery(params);
        StringBuilder chars = new StringBuilder();
        for (int i = 0; i < query.length(); i++) {
            char c = query.charAt(i);
            if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) chars.append(c);
        }
        char[] sorted = chars.toString().toCharArray();
        java.util.Arrays.sort(sorted);
        String seed = "kuwotest" + new String(sorted);
        return md5(seed + path);
    }

    static String md5(String text) {
        try {
            byte[] bytes = MessageDigest.getInstance("MD5").digest(text.getBytes(StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) out.append('0');
                out.append(hex);
            }
            return out.toString();
        } catch (Exception error) {
            return "";
        }
    }

    private static String randomHex(int length) {
        String alphabet = "0123456789abcdef";
        java.util.Random random = new java.util.Random();
        StringBuilder out = new StringBuilder(length);
        for (int i = 0; i < length; i++) out.append(alphabet.charAt(random.nextInt(alphabet.length())));
        return out.toString();
    }

    // ---------------------------------------------------------------- 音质（与前台同链 + 有界降级）

    /** 请求档 → [format, br]；hires 按 bodian.js:444 映射为 lossless。未知回 standard。 */
    static int qualityIndex(String quality) {
        String value = quality == null ? "" : quality.trim().toLowerCase(java.util.Locale.US);
        if ("lossless".equals(value) || "flac".equals(value) || "sq".equals(value)) return 2;
        if ("hires".equals(value) || "hi-res".equals(value)) return 2;
        if ("high".equals(value) || "exhigh".equals(value) || "320k".equals(value)) return 1;
        return 0;
    }

    /** 从请求档到最低档的降级链（前台 bodianProvider 只发一次；后台续播给了有界降级）。 */
    static int[] qualityChain(String quality) {
        int start = qualityIndex(quality);
        int[] out = new int[start + 1];
        for (int i = 0; i <= start; i++) out[i] = start - i;
        return out;
    }

    // ---------------------------------------------------------------- 响应解析（纯函数，JVM 可测）

    /** 从 audioUrl 响应取地址；与 bodian.js:477 同序（audioHttpsUrl → audioUrl）。 */
    static String parseAudioUrl(String body) {
        if (body == null || body.isEmpty()) return "";
        try {
            org.json.JSONObject root = new org.json.JSONObject(body);
            if (root.optInt("code", -1) != 200) return "";
            org.json.JSONObject data = root.optJSONObject("data");
            if (data == null) return "";
            String url = data.optString("audioHttpsUrl", "");
            if (url.isEmpty()) url = data.optString("audioUrl", "");
            if (!isPlayableUrl(url)) return "";
            return url;
        } catch (Exception error) {
            return "";
        }
    }

    /** bodian.js:432-440 validateAudioUrl 的镜像：http(s) 且不带用户名/密码。 */
    static boolean isPlayableUrl(String value) {
        if (value == null) return false;
        String url = value.trim();
        if (!(url.startsWith("http://") || url.startsWith("https://"))) return false;
        // URL userinfo 检查：scheme 之后第一个 '/' 之前不允许出现 '@' 前的凭据段。
        int schemeEnd = url.indexOf("://") + 3;
        int pathStart = url.indexOf('/', schemeEnd);
        String authority = pathStart < 0 ? url.substring(schemeEnd) : url.substring(schemeEnd, pathStart);
        return !authority.contains("@");
    }

    /** checkRight 响应的 status 字段；缺失返回 -1。 */
    static int rightStatus(String body) {
        if (body == null || body.isEmpty()) return -1;
        try {
            org.json.JSONObject root = new org.json.JSONObject(body);
            if (root.optInt("code", -1) != 200) return -1;
            org.json.JSONObject data = root.optJSONObject("data");
            if (data == null || !data.has("status")) return -1;
            return (int) data.optLong("status", -1);
        } catch (Exception error) {
            return -1;
        }
    }

    // ---------------------------------------------------------------- resolve

    @Override
    public SourceResolution resolve(NativePlaylist.Track track, String quality) {
        if (!supports(track.providerId)) {
            return SourceResolution.unsupported("not a bodian track");
        }
        String mediaId = track.mediaId == null ? "" : track.mediaId.trim();
        if (!mediaId.matches("\\d{1,20}") || mediaId.matches("0+")) {
            return SourceResolution.failure("bodian track carries no valid media id");
        }
        String freeSign = jsonField(track.providerData, "freeSign");
        if (freeSign.length() > 4096) {
            return SourceResolution.failure("bodian playback context too large");
        }
        boolean loggedIn = !uid().isEmpty() && !token().isEmpty();
        String lastReason = "bodian returned no playable url";
        for (int level : qualityChain(quality)) {
            String format = QUALITY_LEVELS[level][1];
            String br = QUALITY_LEVELS[level][2];
            // 1) checkRight（bodian.js:448-469）
            Attempt right = call("/api/play/music/v2/checkRight", checkRightParams(mediaId, freeSign), loggedIn);
            if (right.error.isEmpty()) {
                int status = rightStatus(right.body);
                if (status == 3) {
                    return SourceResolution.failure(
                        "bodian preview-only: free audition refused (provider does not play previews)");
                }
                if (status == 7 || status == -1) {
                    lastReason = status == 7 && loggedIn
                        ? "bodian requires additional playback rights (status 7)"
                        : "bodian playback rights unavailable (status " + status + ", login may be required)";
                    continue;
                }
            } else {
                lastReason = right.error;
                if (right.authRequired) continue;   // 换低档不会解决权限问题
            }
            // 2) audioUrl（bodian.js:470-475）
            Attempt audio = call("/api/play/music/v2/audioUrl",
                audioUrlParams(mediaId, format, br, freeSign), loggedIn);
            if (audio.error.isEmpty()) {
                String url = parseAudioUrl(audio.body);
                if (!url.isEmpty()) return SourceResolution.ok(url, QUALITY_LEVELS[level][0], System.currentTimeMillis());
                lastReason = "bodian audioUrl returned no url at " + br;
            } else {
                lastReason = audio.error;
                if (right.authRequired) break;
            }
        }
        return SourceResolution.failure(lastReason);
    }

    private static Map<String, String> checkRightParams(String mediaId, String freeSign) {
        java.util.Map<String, String> params = new java.util.LinkedHashMap<>();
        params.put("musicId", mediaId);
        params.put("freeSign", freeSign);
        return params;
    }

    private static Map<String, String> audioUrlParams(String mediaId, String format, String br, String freeSign) {
        java.util.Map<String, String> params = new java.util.LinkedHashMap<>();
        params.put("devId", DEVICE_ID);
        params.put("musicId", mediaId);
        params.put("format", format);
        params.put("br", br);
        params.put("freeSign", freeSign);
        return params;
    }

    /** 一次签名 GET。uid/token/timestamp/sign 由这里统一补（bodian.js:146-152）。 */
    private Attempt call(String path, Map<String, String> baseParams, boolean loggedIn) {
        java.util.TreeMap<String, String> query = new TreeMap<>();
        query.putAll(baseParams);
        query.put("uid", loggedIn ? uid() : "-1");
        query.put("token", loggedIn ? token() : "");
        query.put("timestamp", String.valueOf(System.currentTimeMillis()));
        query.put("sign", signQuery(path, query));
        StringBuilder url = new StringBuilder(API_ORIGIN).append(path).append('?');
        for (Map.Entry<String, String> entry : query.entrySet()) {
            if (url.charAt(url.length() - 1) != '?') url.append('&');
            url.append(urlEncode(entry.getKey())).append('=').append(urlEncode(entry.getValue()));
        }
        Request.Builder builder = new Request.Builder().url(url.toString())
            .header("User-Agent", "Dart/3.3 (dart:io)")
            .header("plat", "win")
            .header("channel", "W1")
            .header("ver", "1.1.7")
            .header("svrver", "13")
            .header("api-ver", "application/json")
            .header("brand", "Windows")
            .header("net", "wifi")
            .header("devid", DEVICE_ID)
            .header("qimei36", DEVICE_ID)
            .header("Content-Type", "application/json");
        if (loggedIn) {
            builder.header("uid", uid()).header("token", token());
        }
        try (Response response = CLIENT.newCall(builder.build()).execute()) {
            int status = response.code();
            String body = response.body() == null ? "" : response.body().string();
            if (status == 401) return Attempt.auth("bodian sign-in required (HTTP 401)");
            if (status < 200 || status >= 300) return Attempt.fail("bodian HTTP " + status);
            // 业务错误码（bodian.js:179-196）：407 地区限制 / 11012 需登录 / 20018 不可播。
            if (!body.isEmpty()) {
                try {
                    org.json.JSONObject root = new org.json.JSONObject(body);
                    int code = root.optInt("code", 200);
                    if (code != 200) {
                        if (code == 407) return Attempt.fail("bodian region-restricted (code 407)");
                        if (code == 11012) return Attempt.auth("bodian sign-in required (code 11012)");
                        if (code == 20018) return Attempt.fail("bodian not-playable (code 20018)");
                        return Attempt.fail("bodian rejected the request (code " + code + ")");
                    }
                } catch (Exception ignored) {
                    // JSON 解析失败留待上层按"无地址"处理。
                }
            }
            return new Attempt(body, "", false);
        } catch (IOException error) {
            return Attempt.fail("bodian unreachable: " + error.getClass().getSimpleName());
        } catch (Exception error) {
            return Attempt.fail("bodian request failed: " + error.getClass().getSimpleName());
        }
    }

    /** 诊断用：只说会话有没有，绝不输出 token。 */
    public String describe() {
        return "bodian{session=" + !sessionJson.isEmpty() + "}";
    }

    // ---------------------------------------------------------------- 小工具

    private static final class Attempt {
        final String body;
        final String error;
        final boolean authRequired;

        Attempt(String body, String error, boolean authRequired) {
            this.body = body == null ? "" : body;
            this.error = error == null ? "" : error;
            this.authRequired = authRequired;
        }

        static Attempt fail(String error) { return new Attempt("", error, false); }
        static Attempt auth(String error) { return new Attempt("", error, true); }
    }

    /** 从 providerData/session JSON 里取字符串字段（浅层，不抛异常）。 */
    static String jsonField(String json, String name) {
        if (json == null || json.isEmpty()) return "";
        try {
            org.json.JSONObject root = new org.json.JSONObject(json);
            String value = root.optString(name, "");
            return value == null ? "" : value.trim();
        } catch (Exception error) {
            return "";
        }
    }
}
