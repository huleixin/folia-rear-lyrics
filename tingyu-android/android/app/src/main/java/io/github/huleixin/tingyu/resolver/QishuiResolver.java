package io.github.huleixin.tingyu.resolver;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import io.github.huleixin.tingyu.playback.NativePlaylist;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

// android/app/src/main/java/io/github/huleixin/tingyu/resolver/QishuiResolver.java
/**
 * 汽水音乐的原生解析器 —— 从 {@code src/nativeBridge/api/qishui.js} 逐字段移植。
 *
 * <p><b>缺口同网易云</b>：取址链跑在 WebView（resolveAudio），冻结后只能 FALLBACK_TO_JS。
 *
 * <p><b>这是字节系车机开放协议（LunaOpenSDK），没有 X-Argus/X-Khronos 之类的设备风控签名</b>：
 * 全部签名要素是标准 ECDSA P-256（SHA256withECDSA，Java 平台原生支持）。
 * 移植的两条取址路径（qishui.js:429-476 platform + 890-951 resolveAudio）：
 * <ol>
 *   <li><b>匿名</b>：GET {@code open.qishui.com/api/luna/v1/platform/client/token/get/} 拿
 *       client_token → POST {@code open.douyin.com/api/luna/v1/platform/media/mget/}
 *       （access-token 头），免费曲目可取；</li>
 *   <li><b>登录</b>：会话 {ticket, guardKey(P-256 PKCS#8 PEM), guardCert, guardTsSign, userId,
 *       deviceId} 由 JS 从 localStorage qishuiSessionV1/qishuiDeviceId 同步进内存。请求头
 *       bd-ticket-guard-client-data = base64(JSON{ts_sign, req_content, req_sign, timestamp})，
 *       其中 req_sign = base64(SHA256withECDSA(私钥, "ticket=…&path=…&timestamp=…")) 的 DER 签名
 *       （qishui.js:197-218 qishuiGuardHeaders 的镜像 —— WebCrypto 出 raw r||s 需转 DER，
 *       Java 直接输出 DER，反而少一步）。</li>
 * </ol>
 *
 * <p><b>响应解析</b>（qishui.js:890-951）：track_entity.player_info 的 full → preview 两个变体；
 * video_model（JSON 字符串）→ video_list[]，跳过加密轨道，main_url 必须命中 19 个白名单 host，
 * 音质按 rank(full≤请求档) 取最高、码率其次；preview 不伪装成全曲，如实报 failure。
 * 加密轨道-only → 如实报 unsupported（解密被禁用，与前台一致）。
 */
public final class QishuiResolver implements SourceResolver {

    public static final String UA = "LunaOpenSDK/1.0.10";
    public static final String PREFIX = "/api/luna/v1/platform";

    static final String[] QISHUI_COMMON_KEYS = {
        "aid", "app_id", "app_name", "version_code", "version_name", "channel", "sdk_aid",
        "caller_name", "sdk_version_code", "sdk_version_name", "sdk_channel", "vehicle_type",
        "device_brand", "device_type", "device_platform", "resolution", "os_version", "ac",
    };
    static final String[] QISHUI_COMMON_VALUES = {
        "765213", "765213", "byte_autoservice_lite", "100010", "1.0.10", "bydSong", "753999",
        "luna_open_sdk", "100000100", "0.0.1", "Test", "BYD",
        "BYD", "BYD", "android", "1920x1080", "13", "wifi",
    };

    static final String[] MEDIA_HOSTS = {
        "365yg.com", "douyinvod.com", "douyinscdn.com", "bytefcdn.com", "bytecdn.cn", "byteicdn.com",
        "ibytedtos.com", "pstatp.com", "snssdk.com", "bytedance.com", "bytetos.com", "volcvideo.com",
        "volccdn.com", "volces.com", "volcengineapi.com", "douyin.com", "qishui.com", "zijieapi.com", "zjcdn.com",
    };

    private static final String[] AUTH_UPSTREAM_CODES = { "28001003", "28001007", "28001008", "10007" };

    private static final OkHttpClient CLIENT = new OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build();

    /** qishui.js:886 LEVELS + rank 的镜像。 */
    static final String[] LEVEL_ORDER = { "standard", "high", "lossless", "hires" };

    private final String sessionJson;

    public QishuiResolver(String sessionJson) {
        this.sessionJson = sessionJson == null ? "" : sessionJson.trim();
    }

    public static QishuiResolver fromCredentials() {
        return new QishuiResolver(ResolverCredentials.value("qishui", "session"));
    }

    /** 匿名 client-token 通道恒可尝试（免费曲目）。 */
    public boolean canAttempt() {
        return true;
    }

    @Override public String id() {
        return "qishui";
    }

    @Override public boolean supports(String providerId) {
        return "qishui".equals(providerId);
    }

    private boolean loggedIn() {
        return !BodianResolver.jsonField(sessionJson, "ticket").isEmpty()
            && !BodianResolver.jsonField(sessionJson, "guardKey").isEmpty();
    }

    // ---------------------------------------------------------------- 公共 query 参数（qishui.js:255-266 镜像，纯函数）

    /** 进程级 19 位数字设备 id（qishui.js:248-253 createQishuiDeviceId；会话自带时优先）。 */
    private static final String DEVICE_ID = randomDeviceId();

    static String randomDeviceId() {
        java.util.Random random = new java.util.Random();
        StringBuilder out = new StringBuilder(19);
        out.append((char) ('1' + random.nextInt(9)));
        for (int i = 1; i < 19; i++) out.append((char) ('0' + random.nextInt(10)));
        return out.toString();
    }

    public static Map<String, String> commonParams(String deviceId) {
        Map<String, String> params = new LinkedHashMap<>();
        for (int i = 0; i < QISHUI_COMMON_KEYS.length; i++) params.put(QISHUI_COMMON_KEYS[i], QISHUI_COMMON_VALUES[i]);
        params.put("device_id", deviceId);
        params.put("did", deviceId);
        params.put("iid", deviceId);
        params.put("vehicle_id", "qishui-" + deviceId);
        params.put("_timestamp", String.valueOf(System.currentTimeMillis() / 1000L));
        params.put("_nonce", String.valueOf(new java.util.Random().nextInt(65536)));
        return params;
    }

    static String serializeQuery(Map<String, String> params) {
        StringBuilder out = new StringBuilder();
        for (Map.Entry<String, String> entry : params.entrySet()) {
            if (out.length() > 0) out.append('&');
            try {
                out.append(URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8.name()))
                    .append('=').append(URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8.name()));
            } catch (Exception error) {
                return "";
            }
        }
        return out.toString();
    }

    // ---------------------------------------------------------------- ticket-guard 签名（qishui.js:197-218 镜像，纯函数可测）

    /** ECDSA P-256 签名内容：qishui.js:205 的 content 格式。 */
    public static String guardContent(String ticket, String path, long timestampSeconds) {
        return "ticket=" + ticket + "&path=" + PREFIX + path + "&timestamp=" + timestampSeconds;
    }

    /** bd-ticket-guard-client-data 的 JSON（ts_sign/req_content/req_sign/timestamp）。 */
    public static String guardClientData(String tsSign, String reqSignBase64, long timestampSeconds) {
        try {
            return new org.json.JSONObject()
                .put("ts_sign", tsSign)
                .put("req_content", "ticket,path,timestamp")
                .put("req_sign", reqSignBase64)
                .put("timestamp", timestampSeconds)
                .toString();
        } catch (Exception error) {
            return "";
        }
    }

    /** PKCS#8 PEM → 私钥；签名 SHA256withECDSA（Java 直接输出 DER，正合 bd-ticket-guard 要求）。 */
    static byte[] signWithGuardKey(String pem, byte[] content) {
        try {
            String body = pem.replace("-----BEGIN PRIVATE KEY-----", "")
                .replace("-----END PRIVATE KEY-----", "")
                .replaceAll("\\s", "");
            byte[] der = Base64.getDecoder().decode(body);
            PrivateKey key = KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(der));
            Signature signature = Signature.getInstance("SHA256withECDSA");
            signature.initSign(key);
            signature.update(content);
            return signature.sign();
        } catch (Exception error) {
            return null;
        }
    }

    // ---------------------------------------------------------------- 响应解析（qishui.js:886-951 镜像，纯函数）

    /** 一个候选明文轨道。 */
    static final class Candidate {
        final String url;
        final String quality;
        final long bitrate;
        final boolean preview;

        Candidate(String url, String quality, long bitrate, boolean preview) {
            this.url = url;
            this.quality = quality;
            this.bitrate = bitrate;
            this.preview = preview;
        }
    }

    static int rankOf(String quality) {
        for (int i = 0; i < LEVEL_ORDER.length; i++) if (LEVEL_ORDER[i].equals(quality)) return i;
        return 0;
    }

    static String levelFor(String raw) {
        if ("medium".equals(raw)) return "standard";
        if ("higher".equals(raw) || "highest".equals(raw)) return "high";
        if ("lossless".equals(raw)) return "lossless";
        if ("hi_res".equals(raw)) return "hires";
        return "standard";
    }

    static boolean encrypted(org.json.JSONObject item) {
        org.json.JSONObject encryptInfo = item.optJSONObject("encrypt_info");
        if (encryptInfo != null
            && (encryptInfo.optBoolean("encrypt", false) || !encryptInfo.optString("spade_a", "").isEmpty())) {
            return true;
        }
        return item.has("PlayAuth") || item.optInt("Encrypt", 0) != 0;
    }

    /** mediaUrl 白名单校验（qishui.js:374-382）：必须 https 且命中 19 个可信 host。 */
    static boolean trustedMediaHost(String raw) {
        if (raw == null) return false;
        String url = raw.trim();
        if (!url.startsWith("https://")) return false;
        int schemeEnd = 8;
        int pathStart = url.indexOf('/', schemeEnd);
        String authority = pathStart < 0 ? url.substring(schemeEnd) : url.substring(schemeEnd, pathStart);
        int port = authority.indexOf(':');
        if (port >= 0) {
            String portText = authority.substring(port + 1);
            if (!portText.equals("443")) return false;
            authority = authority.substring(0, port);
        }
        if (authority.isEmpty()) return false;
        for (String host : MEDIA_HOSTS) {
            if (authority.equals(host) || authority.endsWith("." + host)) return true;
        }
        return false;
    }

    /** mget 响应里的 track_entity.player_info。 */
    static org.json.JSONObject playerInfoOf(String mgetBody) {
        if (mgetBody == null || mgetBody.isEmpty()) return null;
        try {
            org.json.JSONObject root = new org.json.JSONObject(mgetBody);
            org.json.JSONObject data = root.optJSONObject("data");
            org.json.JSONArray mediaList = data == null ? null : data.optJSONArray("media_list");
            org.json.JSONObject media = mediaList == null ? null : mediaList.optJSONObject(0);
            org.json.JSONObject track = media == null ? null : media.optJSONObject("track_entity");
            return track == null ? null : track.optJSONObject("player_info");
        } catch (Exception error) {
            return null;
        }
    }

    /**
     * video_model 的明文候选（qishui.js:910-918）。加密轨道跳过；白名单外 URL 丢弃；
     * preview 变体的候选带 preview 标记（不伪装成全曲）。
     */
    static java.util.List<Candidate> candidatesFromVideoModel(org.json.JSONObject player, String variant) {
        java.util.List<Candidate> out = new java.util.ArrayList<>();
        org.json.JSONObject variantInfo = player == null ? null : player.optJSONObject(variant);
        org.json.JSONObject modelInfo = variantInfo == null ? null : variantInfo.optJSONObject("video_model_info");
        if (modelInfo == null) return out;
        org.json.JSONArray videoList = videoListOf(modelInfo);
        if (videoList == null) return out;
        for (int i = 0; i < videoList.length(); i++) {
            org.json.JSONObject item = videoList.optJSONObject(i);
            if (item == null || encrypted(item)) continue;
            String url = item.optString("main_url", "");
            if (!trustedMediaHost(url)) continue;
            org.json.JSONObject meta = item.optJSONObject("video_meta");
            out.add(new Candidate(url, levelFor(meta == null ? "" : meta.optString("quality", "")),
                meta == null ? 0L : meta.optLong("bitrate", 0L), "preview".equals(variant)));
        }
        return out;
    }

    /** video_model 既可能是对象也可能是 JSON 字符串（qishui.js:910-913）。 */
    private static org.json.JSONArray videoListOf(org.json.JSONObject modelInfo) {
        Object model = modelInfo.opt("video_model");
        if (model instanceof org.json.JSONArray) return (org.json.JSONArray) model;
        if (model instanceof org.json.JSONObject) return ((org.json.JSONObject) model).optJSONArray("video_list");
        String text = modelInfo.optString("video_model", "");
        if (!text.isEmpty()) {
            try {
                org.json.JSONObject parsed = new org.json.JSONObject(text);
                return parsed.optJSONArray("video_list");
            } catch (Exception ignored) { }
        }
        return null;
    }

    /** url_player_info（AWS 签名 GetPlayInfo 的明文兜底，qishui.js:919-920）。 */
    static String urlPlayerInfoUrl(org.json.JSONObject player, String variant) {
        org.json.JSONObject variantInfo = player == null ? null : player.optJSONObject(variant);
        org.json.JSONObject modelInfo = variantInfo == null ? null : variantInfo.optJSONObject("video_model_info");
        String url = modelInfo == null ? "" : modelInfo.optString("url_player_info", "");
        return url.startsWith("https://") ? url : "";
    }

    /** GetPlayInfo 响应 → 候选（qishui.js:923-928：MainPlayUrl/Quality/Bitrate，Q 大写开头）。 */
    static java.util.List<Candidate> candidatesFromPlayInfoList(String body) {
        java.util.List<Candidate> out = new java.util.ArrayList<>();
        if (body == null || body.isEmpty()) return out;
        try {
            org.json.JSONObject root = new org.json.JSONObject(body);
            org.json.JSONArray list = null;
            org.json.JSONObject result = root.optJSONObject("Result");
            org.json.JSONObject resultData = result == null ? null : result.optJSONObject("Data");
            if (resultData != null) list = resultData.optJSONArray("PlayInfoList");
            if (list == null) {
                org.json.JSONObject data = root.optJSONObject("data");
                if (data != null) list = data.optJSONArray("PlayInfoList");
            }
            if (list == null) list = root.optJSONArray("PlayInfoList");
            if (list == null) return out;
            for (int i = 0; i < list.length(); i++) {
                org.json.JSONObject item = list.optJSONObject(i);
                if (item == null || encrypted(item)) continue;
                String url = item.optString("MainPlayUrl", "");
                if (!trustedMediaHost(url)) continue;
                out.add(new Candidate(url, levelFor(item.optString("Quality", "")),
                    item.optLong("Bitrate", 0L), false));
            }
        } catch (Exception ignored) { }
        return out;
    }

    /** 音质选取（qishui.js:936-937）：≤请求档里最高，其次码率；没有合规则的取全部最高。 */
    static Candidate pickCandidate(java.util.List<Candidate> candidates, String requestedQuality) {
        if (candidates == null || candidates.isEmpty()) return null;
        int requestedRank = rankOf(requestedQuality);
        Candidate best = null;
        int bestRank = -1;
        long bestBitrate = -1;
        for (Candidate candidate : candidates) {
            int candidateRank = rankOf(candidate.quality);
            if (candidateRank > requestedRank) candidateRank = requestedRank;
            if (best == null || candidateRank > bestRank
                || (candidateRank == bestRank && candidate.bitrate > bestBitrate)) {
                best = candidate;
                bestRank = candidateRank;
                bestBitrate = candidate.bitrate;
            }
        }
        return best;
    }

    // ---------------------------------------------------------------- resolve

    @Override
    public SourceResolution resolve(NativePlaylist.Track track, String quality) {
        if (!supports(track.providerId)) {
            return SourceResolution.unsupported("not a qishui track");
        }
        String mediaId = track.mediaId == null ? "" : track.mediaId.trim();
        if (mediaId.isEmpty() || mediaId.length() > 30 || !mediaId.matches("\\d+")) {
            return SourceResolution.failure("qishui track carries no valid media id");
        }
        String requested = quality == null ? "" : quality.trim().toLowerCase(java.util.Locale.US);
        if (!requested.matches("standard|high|lossless|hires")) requested = "high";
        try {
            String body = viaMget(mediaId);
            if (body == null) return SourceResolution.failure("qishui media/mget request failed");
            org.json.JSONObject player = playerInfoOf(body);
            if (player == null) {
                return SourceResolution.failure("qishui media/mget returned no player_info");
            }
            java.util.List<Candidate> candidates = new java.util.ArrayList<>();
            for (String variant : new String[] { "full", "preview" }) {
                candidates.addAll(candidatesFromVideoModel(player, variant));
            }
            // video_model 全加密/无候选时的明文兜底：url_player_info（AWS 签名 GetPlayInfo，
            // 前台 qishui.js:919-929 的同一条路；匿名也可访问）。
            if (candidates.isEmpty()) {
                for (String variant : new String[] { "full", "preview" }) {
                    String playInfoUrl = urlPlayerInfoUrl(player, variant);
                    if (playInfoUrl.isEmpty()) continue;
                    Request request = new Request.Builder().url(playInfoUrl).header("user-agent", UA).get().build();
                    try (Response response = CLIENT.newCall(request).execute()) {
                        if (response.isSuccessful() && response.body() != null) {
                            candidates.addAll(candidatesFromPlayInfoList(response.body().string()));
                        }
                    }
                }
            }
            Candidate best = pickCandidate(candidates, requested);
            if (best == null) {
                return SourceResolution.failure(
                    "qishui returned no playable plaintext audio (protected or preview-only track)");
            }
            if (best.preview) {
                return SourceResolution.failure("qishui preview-only (free audition refused)");
            }
            return SourceResolution.ok(best.url, best.quality, System.currentTimeMillis());
        } catch (AuthRequired error) {
            return SourceResolution.failure("qishui sign-in required (upstream " + error.upstream + ")");
        } catch (IOException error) {
            return SourceResolution.failure("qishui unreachable: " + error.getClass().getSimpleName());
        } catch (Exception error) {
            return SourceResolution.failure("qishui request failed: " + error.getClass().getSimpleName());
        }
    }

    private static final class AuthRequired extends RuntimeException {
        final String upstream;
        AuthRequired(String upstream) { super("auth"); this.upstream = upstream; }
    }

    /** mget 请求：匿名走 client-token；有会话走 ticket-guard。返回原始 body。 */
    private String viaMget(String mediaId) throws IOException {
        String deviceId = BodianResolver.jsonField(sessionJson, "deviceId");
        if (deviceId.isEmpty() || !deviceId.matches("\\d{19}")) deviceId = DEVICE_ID;
        StringBuilder url = new StringBuilder("https://open.douyin.com").append(PREFIX)
            .append("/media/mget/?").append(serializeQuery(commonParams(deviceId)));
        org.json.JSONObject body = new org.json.JSONObject();
        try {
            org.json.JSONArray mediaList = new org.json.JSONArray()
                .put(new org.json.JSONObject().put("id", mediaId).put("type", "track"));
            body.put("media_list", mediaList);
            body.put("card_context", new org.json.JSONObject());
            body.put("common_params", new org.json.JSONObject());
        } catch (Exception error) {
            throw new IOException("qishui body build failed");
        }
        Request.Builder builder = new Request.Builder().url(url.toString())
            .header("user-agent", UA)
            .header("Content-Type", "application/json")
            .post(RequestBody.create(body.toString(), MediaType.parse("application/json")));
        if (loggedIn()) {
            long timestamp = System.currentTimeMillis() / 1000L;
            String ticket = BodianResolver.jsonField(sessionJson, "ticket");
            String pem = BodianResolver.jsonField(sessionJson, "guardKey");
            byte[] der = signWithGuardKey(pem, guardContent(ticket, "/media/mget/", timestamp).getBytes(StandardCharsets.UTF_8));
            if (der == null) throw new IOException("qishui guard key unusable");
            String clientData = guardClientData(BodianResolver.jsonField(sessionJson, "guardTsSign"),
                Base64.getEncoder().encodeToString(der), timestamp);
            builder.header("access-token", ticket)
                .header("bd-ticket-guard-version", "1")
                .header("bd-ticket-guard-client-cert", BodianResolver.jsonField(sessionJson, "guardCert"))
                .header("bd-ticket-guard-client-data",
                    Base64.getEncoder().encodeToString(clientData.getBytes(StandardCharsets.UTF_8)));
        } else {
            builder.header("access-token", clientToken(deviceId));
        }
        try (Response response = CLIENT.newCall(builder.build()).execute()) {
            int status = response.code();
            if (status == 401 || status == 403) throw new AuthRequired("HTTP " + status);
            if (status == 429) throw new IOException("qishui rate limited (HTTP 429)");
            if (status < 200 || status >= 300) throw new IOException("qishui HTTP " + status);
            String text = response.body() == null ? "" : response.body().string();
            requireBusinessOk(text);
            return text;
        }
    }

    /** qishui.js:367-372 checked 的镜像：err_no/error_code 非 0 → auth 或 unavailable。 */
    private static void requireBusinessOk(String body) {
        if (body == null || body.isEmpty()) throw new IllegalStateException("empty body");
        try {
            org.json.JSONObject root = new org.json.JSONObject(body);
            long code = root.optLong("err_no", 0L);
            if (code == 0L) {
                org.json.JSONObject data = root.optJSONObject("data");
                if (data != null) code = data.optLong("error_code", 0L);
            }
            if (code == 0L) return;
            String text = String.valueOf(code);
            for (String auth : AUTH_UPSTREAM_CODES) if (auth.equals(text)) throw new AuthRequired(text);
            throw new IllegalStateException("qishui rejected the request (code " + text + ")");
        } catch (AuthRequired error) {
            throw error;
        } catch (IllegalStateException error) {
            throw error;
        } catch (Exception error) {
            throw new IllegalStateException("qishui response is not JSON");
        }
    }

    /** 匿名 client token（qishui.js:429-444）；进程内缓存，28001008 时由调用方感知失败。 */
    private static volatile String cachedClientToken = "";
    private static volatile long clientTokenAt = 0L;

    private static String clientToken(String deviceId) throws IOException {
        if (!cachedClientToken.isEmpty() && System.currentTimeMillis() - clientTokenAt < 30L * 60_000L) {
            return cachedClientToken;
        }
        String url = "https://open.qishui.com" + PREFIX + "/client/token/get/?"
            + serializeQuery(commonParams(deviceId)) + "&trigger_type=cold_start";
        Request request = new Request.Builder().url(url).header("user-agent", UA).get().build();
        try (Response response = CLIENT.newCall(request).execute()) {
            if (response.code() == 401 || response.code() == 403) throw new AuthRequired("HTTP " + response.code());
            if (!response.isSuccessful()) throw new IOException("qishui client token HTTP " + response.code());
            String body = response.body() == null ? "" : response.body().string();
            org.json.JSONObject root = new org.json.JSONObject(body);
            String token = root.optString("client_token", "");
            if (token.isEmpty() && root.optJSONObject("data") != null) {
                token = root.optJSONObject("data").optString("client_token", "");
            }
            if (token.isEmpty()) throw new IOException("qishui client token missing");
            cachedClientToken = token;
            clientTokenAt = System.currentTimeMillis();
            return token;
        } catch (AuthRequired error) {
            throw error;
        } catch (IOException error) {
            throw error;
        } catch (Exception error) {
            throw new IOException("qishui client token failed: " + error.getClass().getSimpleName());
        }
    }

    /** 诊断用：只说通道形态。 */
    public String describe() {
        return "qishui{" + (loggedIn() ? "guard-session" : "client-token") + "}";
    }
}
