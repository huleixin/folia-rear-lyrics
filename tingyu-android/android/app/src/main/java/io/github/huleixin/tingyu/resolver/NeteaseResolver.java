package io.github.huleixin.tingyu.resolver;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;

import io.github.huleixin.tingyu.playback.NativePlaylist;
import okhttp3.FormBody;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * 网易云歌曲的原生解析器 —— 与 {@link QqResolver} 对齐的那条链路。
 *
 * <p><b>根因（为什么网易云后台停播而 QQ 不停）：</b>续播编排器（BackgroundContinuation /
 * ResolverRegistry）是音源无关的，但注册表里只有 lx-native / qq / lx-script 三个解析器。
 * 网易云的 {@code forTrack} 走到平台启发式后无人认领 → {@code canResolveNatively=false} →
 * 永远 {@code FALLBACK_TO_JS}。前台网易云取地址跑在 WebView 里的
 * {@code nativeBridge/api/netease.js}（eapi 加密直连 {@code interface.music.163.com}），
 * WebView 被冻结后这条 JS 链就死了 —— 当前这首播完即停。
 *
 * <p><b>本类把前台已验证的取地址流程逐字段移植到原生：</b>
 * <ul>
 *   <li>传输：eapi（AES-128-ECB，固定密钥 + MD5 摘要），POST
 *       {@code https://interface.music.163.com/eapi/song/enhance/player/url/v1}；
 *       UA 是官方 iOS 客户端形态；请求体带官方客户端的 header 块（deviceId/appver/os…），
 *       缺了会被风控按「非官方客户端」拒绝（前台 eapi.js 注释里踩过的 8821）。</li>
 *   <li>登录态：{@link ResolverCredentials} 里 JS 同步过来的网易云 Cookie（含 MUSIC_U），
 *       只存内存，绝不落盘、不进日志、不输出完整 URL。</li>
 *   <li>音质：与前台 {@code qualityCandidates} 同一条降级链
 *       （jymaster→hires→lossless→exhigh→standard），拿不到高档自动落低档，
 *       只给试听片段时最后兜底试听 —— 不改变平台原有的播放权限限制。</li>
 * </ul>
 *
 * 取不到就是取不到：绝不伪造地址，也绝不静默换音源。
 */
public final class NeteaseResolver implements SourceResolver {

    public static final String EAPI_BASE = "https://interface.music.163.com";
    static final String EAPI_KEY = "e82ckenh8dichen8";
    public static final String EAPI_UA = "NeteaseMusic 9.0.90/5038 (iPhone; iOS 16.2; zh_CN)";

    static final String URL_V1_PATH = "/api/song/enhance/player/url/v1";
    static final String URL_LEGACY_PATH = "/api/song/enhance/player/url";

    /** 与前台 NETEASE_QUALITY 同构：顺序即降级顺序，br 仅供 legacy 接口使用。 */
    static final String[][] QUALITY_LEVELS = {
        { "jymaster", "999000" }, { "hires", "1999000" }, { "lossless", "999000" },
        { "exhigh", "320000" }, { "standard", "128000" },
    };
    private static final String[] QUALITY_ORDER = { "jymaster", "hires", "lossless", "exhigh", "standard" };

    private static final OkHttpClient CLIENT = new OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .followRedirects(true)
        .build();

    private final String cookie;

    public NeteaseResolver(String cookie) {
        this.cookie = cookie == null ? "" : cookie.trim();
    }

    /** 从内存凭据构造；没有 Cookie 时 canAttempt=false，续播继续回落 JS 通道。 */
    public static NeteaseResolver fromCredentials() {
        return new NeteaseResolver(ResolverCredentials.value("netease", "cookie"));
    }

    /** 是否具备可用的登录态上下文：JS 同步过 Cookie（匿名设备 Cookie 也算，可解析免费曲目）。 */
    public boolean canAttempt() {
        return !cookie.isEmpty();
    }

    @Override
    public String id() {
        return "netease";
    }

    @Override
    public boolean supports(String providerId) {
        return "netease".equals(providerId);
    }

    // ---------------------------------------------------------------- eapi 加密（与 eapi.js 逐字段同构）

    /** JS {@code eapiEncrypt} 的镜像。返回 params 的大写十六进制密文。纯函数。 */
    public static String eapiEncrypt(String uri, String text) {
        try {
            String digest = md5("nobody" + uri + "use" + text + "md5forencrypt");
            String payload = uri + "-36cd479b6b5-" + text + "-36cd479b6b5-" + digest;
            Cipher cipher = Cipher.getInstance("AES/ECB/PKCS5Padding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(EAPI_KEY.getBytes(StandardCharsets.UTF_8), "AES"));
            byte[] encrypted = cipher.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            return hexUpper(encrypted);
        } catch (Exception error) {
            return "";
        }
    }

    private static String md5(String text) throws Exception {
        byte[] bytes = MessageDigest.getInstance("MD5").digest(text.getBytes(StandardCharsets.UTF_8));
        StringBuilder out = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            String hex = Integer.toHexString(0xff & b);
            if (hex.length() == 1) out.append('0');
            out.append(hex);
        }
        return out.toString();
    }

    private static String hexUpper(byte[] bytes) {
        StringBuilder out = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            String hex = Integer.toHexString(0xff & b);
            if (hex.length() == 1) out.append('0');
            out.append(hex);
        }
        return out.toString().toUpperCase(java.util.Locale.US);
    }

    // ---------------------------------------------------------------- 进程级设备状态

    /** 官方客户端的稳定标识：进程内固定，避免每次请求换设备被风控判「环境异常」。 */
    private static final String DEVICE_ID = randomChars(16, "abcdefghijklmnopqrstuvwxyz0123456789");
    private static final String NUID = randomChars(32, "0123456789abcdef");
    private static final String WNMCID = randomChars(6, "abcdefghijklmnopqrstuvwxyz") + "." + System.currentTimeMillis() + ".01.0";
    /** 服务端在首个不带 NMTID 的响应里下发它，之后每个请求都要带上。 */
    private static volatile String nmtid = "";

    private static String randomChars(int length, String alphabet) {
        java.util.Random random = new java.util.Random();
        StringBuilder out = new StringBuilder(length);
        for (int i = 0; i < length; i++) out.append(alphabet.charAt(random.nextInt(alphabet.length())));
        return out.toString();
    }

    // ---------------------------------------------------------------- 请求构造（纯函数，JVM 可测）

    /** 官方客户端 cookie 里会回传的键；顺序无关紧要，值来自用户 Cookie。 */
    private static final String[] EAPI_COOKIE_KEYS = {
        "MUSIC_U", "MUSIC_A", "__csrf", "NMTID", "WNMCID", "WEVNSM",
        "_ntes_nuid", "_ntes_nnid", "MUSIC_R_U", "deviceId", "sDeviceId", "WM_TID", "WM_NI", "WM_NIKE",
    };

    static String cookieValue(String cookieHeader, String name) {
        return QqResolver.cookieValue(cookieHeader, name);
    }

    /**
     * 官方客户端 eapi body 的 header 块。前台 {@code buildEapiHeader} 的镜像：
     * 客户端形态字段一个不能少，__csrf/MUSIC_U/NMTID 从用户 Cookie 取，缺失的用进程级随机值补齐。
     */
    public static Map<String, String> buildEapiHeader(String cookieHeader, String csrfToken) {
        Map<String, String> header = new LinkedHashMap<>();
        header.put("osver", "16.2");
        header.put("deviceId", firstNonEmpty(cookieValue(cookieHeader, "deviceId"), DEVICE_ID));
        header.put("appver", "9.0.90");
        header.put("versioncode", "140");
        header.put("mobilename", "");
        header.put("buildver", String.valueOf(System.currentTimeMillis()).substring(0, 10));
        header.put("resolution", "1920x1080");
        header.put("__csrf", firstNonEmpty(csrfToken, cookieValue(cookieHeader, "__csrf")));
        header.put("os", "iPhone OS");
        header.put("channel", "distribution");
        header.put("requestId", System.currentTimeMillis() + "_"
            + String.format(java.util.Locale.US, "%04d", new java.util.Random().nextInt(10000)));
        String nuid = firstNonEmpty(cookieValue(cookieHeader, "_ntes_nuid"), NUID);
        header.put("_ntes_nuid", nuid);
        header.put("_ntes_nnid", firstNonEmpty(cookieValue(cookieHeader, "_ntes_nnid"), nuid + "," + System.currentTimeMillis()));
        header.put("WNMCID", firstNonEmpty(cookieValue(cookieHeader, "WNMCID"), WNMCID));
        header.put("WEVNSM", firstNonEmpty(cookieValue(cookieHeader, "WEVNSM"), "1.0.0"));
        header.put("__remember_me", "true");
        header.put("ntes_kaola_ad", "1");
        String cookieNmtid = firstNonEmpty(cookieValue(cookieHeader, "NMTID"), nmtid);
        if (!cookieNmtid.isEmpty()) header.put("NMTID", cookieNmtid);
        String musicU = cookieValue(cookieHeader, "MUSIC_U");
        if (!musicU.isEmpty()) header.put("MUSIC_U", musicU);
        String musicA = cookieValue(cookieHeader, "MUSIC_A");
        if (!musicA.isEmpty()) header.put("MUSIC_A", musicA);
        for (String key : EAPI_COOKIE_KEYS) {
            String value = cookieValue(cookieHeader, key);
            if (!value.isEmpty() && !header.containsKey(key)) header.put(key, value);
        }
        return header;
    }

    private static String firstNonEmpty(String a, String b) {
        return a != null && !a.isEmpty() ? a : (b == null ? "" : b);
    }

    static String formatCookieHeader(Map<String, String> header) {
        StringBuilder out = new StringBuilder();
        for (Map.Entry<String, String> entry : header.entrySet()) {
            String value = entry.getValue();
            if (value == null || value.isEmpty()) continue;
            if (out.length() > 0) out.append("; ");
            out.append(entry.getKey()).append('=').append(value);
        }
        return out.toString();
    }

    /** 音质偏好 → 从哪一档开始降（与前台 qualityCandidates 同规则；unknown → hires）。纯函数。 */
    static int qualityStart(String quality) {
        String value = quality == null ? "" : quality.trim().toLowerCase(java.util.Locale.US);
        if ("standard".equals(value) || "normal".equals(value) || "std".equals(value)) return 4;
        if ("exhigh".equals(value) || "high".equals(value) || "320k".equals(value) || "hq".equals(value)) return 3;
        if ("lossless".equals(value) || "flac".equals(value) || "sq".equals(value)) return 2;
        if ("hires".equals(value) || "hi-res".equals(value) || "highest".equals(value)) return 1;
        if ("jymaster".equals(value) || "master".equals(value) || "svip".equals(value)) return 0;
        return 1;
    }

    /** 音质降级链；jymaster 是 svip 专属，与前台 svipReady=false 时的过滤一致地跳过。纯函数。 */
    static String[] qualityChain(String quality) {
        int start = Math.min(qualityStart(quality), QUALITY_ORDER.length - 1);
        if ("jymaster".equals(QUALITY_ORDER[start])) start = 1; // svip-only 档不主动请求
        String[] out = new String[QUALITY_ORDER.length - start];
        for (int i = start; i < QUALITY_ORDER.length; i++) out[i - start] = QUALITY_ORDER[i];
        return out;
    }

    static String brFor(String level) {
        for (String[] entry : QUALITY_LEVELS) if (entry[0].equals(level)) return entry[1];
        return "128000";
    }

    // ---------------------------------------------------------------- 响应解析（纯函数，JVM 可测）

    /**
     * 从 /song/enhance/player/url(/v1) 响应里取地址。返回 [url, level, trial]；
     * 取不到时 url 为空串。与前台 {@code handleSongUrl} 同规则：
     * 非试听 URL 直接采纳；试听 URL 先记住、把低档问完再兜底。
     */
    static String[] parseSongUrl(String body) {
        if (body == null || body.isEmpty()) return new String[] { "", "", "" };
        try {
            org.json.JSONObject root = new org.json.JSONObject(body);
            int code = root.optInt("code", -1);
            if (code != 200 && code != 0 && code != -1) return new String[] { "", "", "" };
            org.json.JSONArray data = root.optJSONArray("data");
            if (data == null || data.length() == 0) return new String[] { "", "", "" };
            org.json.JSONObject item = data.optJSONObject(0);
            if (item == null) return new String[] { "", "", "" };
            String url = item.optString("url", "");
            if (url.isEmpty()) return new String[] { "", "", "" };
            boolean trial = item.optJSONArray("freeTrialInfo") != null && item.optJSONArray("freeTrialInfo").length() > 0;
            return new String[] { url.replaceFirst("^http:", "https:"), item.optString("level", ""), trial ? "1" : "" };
        } catch (Exception error) {
            return new String[] { "", "", "" };
        }
    }

    // ---------------------------------------------------------------- resolve

    /** 单次 eapi 尝试的结果：ok / trial（有地址但只是试听）/ error。 */
    private static final class Attempt {
        final String url;
        final String level;
        final boolean trial;
        final String error;

        Attempt(String url, String level, boolean trial, String error) {
            this.url = url == null ? "" : url;
            this.level = level == null ? "" : level;
            this.trial = trial;
            this.error = error == null ? "" : error;
        }

        static Attempt fail(String error) { return new Attempt("", "", false, error); }
        boolean ok() { return !url.isEmpty() && !trial; }
    }

    @Override
    public SourceResolution resolve(NativePlaylist.Track track, String quality) {
        if (!supports(track.providerId)) {
            return SourceResolution.unsupported("not a netease track");
        }
        String songId = track.mediaId;
        if (songId == null || songId.isEmpty()) {
            return SourceResolution.failure("netease track carries no song id");
        }
        if (!canAttempt()) {
            return SourceResolution.failure("netease resolver has no cookie (login state not synced)");
        }
        Attempt trialFallback = null;
        String lastReason = "netease returned no playable url";
        for (String level : qualityChain(quality)) {
            Attempt attempt = viaEapi(track.songKey, songId, level);
            if (attempt.ok()) return SourceResolution.ok(attempt.url, attempt.level, System.currentTimeMillis());
            if (!attempt.url.isEmpty()) {
                // 试听兜底：记住这份，把低档问完，全都没有再给试听（与前台 handleSongUrl 同规则）。
                if (trialFallback == null) trialFallback = attempt;
                continue;
            }
            lastReason = attempt.error;
        }
        if (trialFallback != null) {
            return SourceResolution.ok(trialFallback.url, trialFallback.level, System.currentTimeMillis());
        }
        return SourceResolution.failure(lastReason);
    }

    /** 单档音质的 eapi 请求；v1 失败时按前台同构回落 legacy 接口。 */
    private Attempt viaEapi(String songKey, String songId, String level) {
        Attempt v1 = viaEapiPath(songKey, songId, level, URL_V1_PATH, "flac");
        if (v1.ok() || !v1.url.isEmpty()) return v1;
        Attempt legacy = viaEapiPath(songKey, songId, level, URL_LEGACY_PATH, "");
        return legacy.ok() || !legacy.url.isEmpty() ? legacy : v1;
    }

    private Attempt viaEapiPath(String songKey, String songId, String level, String apiPath, String encodeType) {
        String uri = apiPath;
        String eapiPath = uri.substring("/api".length()); // /eapi/song/enhance/...
        Map<String, String> header = buildEapiHeader(cookie, "");
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("ids", "[" + songId + "]");
            if (!encodeType.isEmpty()) payload.put("encodeType", encodeType);
            if (URL_LEGACY_PATH.equals(apiPath)) payload.put("br", brFor(level));
            payload.put("header", header);
            String text = new org.json.JSONObject(payload).toString();
            String params = eapiEncrypt(uri, text);
            if (params.isEmpty()) return Attempt.fail("eapi encrypt failed");
            RequestBody form = new FormBody.Builder().add("params", params).build();
            Request request = new Request.Builder()
                .url(EAPI_BASE + "/eapi" + eapiPath)
                .addHeader("Content-Type", "application/x-www-form-urlencoded")
                .addHeader("User-Agent", EAPI_UA)
                .addHeader("Cookie", formatCookieHeader(header))
                .post(form)
                .build();
            try (Response response = CLIENT.newCall(request).execute()) {
                rememberNmtid(response);
                int status = response.code();
                if (status == 401 || status == 403) {
                    return Attempt.fail("netease rejected the session (HTTP " + status + ")");
                }
                if (status < 200 || status >= 300) {
                    return Attempt.fail("netease eapi HTTP " + status);
                }
                String body = response.body() == null ? "" : response.body().string();
                String[] parsed = parseSongUrl(body);
                if (parsed[0].isEmpty()) {
                    return Attempt.fail("netease eapi returned no url at " + level
                        + " (login may be expired or VIP required)");
                }
                String resolvedLevel = parsed[1].isEmpty() ? level : parsed[1];
                rememberLevel(songKey, resolvedLevel);
                return new Attempt(parsed[0], resolvedLevel, "1".equals(parsed[2]), "");
            }
        } catch (IOException error) {
            return Attempt.fail("netease unreachable: " + error.getClass().getSimpleName());
        } catch (Exception error) {
            return Attempt.fail("netease eapi failed: " + error.getClass().getSimpleName());
        }
    }


    private static void rememberNmtid(Response response) {
        try {
            java.util.List<String> cookies = response.headers("set-cookie");
            for (String entry : cookies) {
                java.util.regex.Matcher matcher = java.util.regex.Pattern
                    .compile("(?:^|;\\s*)NMTID=([^;]+)").matcher(entry == null ? "" : entry);
                if (matcher.find()) {
                    nmtid = matcher.group(1).trim();
                    return;
                }
            }
        } catch (Exception ignored) {
            // NMTID 只是风控连贯性优化，拿不到不致命。
        }
    }

    // ---------------------------------------------------------------- 播放失败音质降级（引擎接λ）

    private static final int LEVEL_TRACKED_MAX = 64;
    private static final Map<String, String> LAST_LEVELS =
        java.util.Collections.synchronizedMap(new LinkedHashMap<String, String>() {
            @Override protected boolean removeEldestEntry(Map.Entry<String, String> eldest) {
                return size() > LEVEL_TRACKED_MAX;
            }
        });

    private static void rememberLevel(String songKey, String level) {
        if (songKey == null || songKey.isEmpty() || level == null || level.isEmpty()) return;
        LAST_LEVELS.put(songKey, level);
    }

    /** 这首歌实际解析到的音质档；不知道返回空串。 */
    public static String lastLevelFor(String songKey) {
        String value = LAST_LEVELS.get(songKey);
        return value == null ? "" : value;
    }

    /** 当前档的下一低档（hires→lossless→exhigh→standard）；已在最低档或未知时返回空串。纯函数。 */
    public static String lowerLevel(String level) {
        for (int i = 0; i < QUALITY_ORDER.length - 1; i++) {
            if (QUALITY_ORDER[i].equals(level)) return QUALITY_ORDER[i + 1];
        }
        return "";
    }

    /**
     * 引擎播放失败时问「这首歌还能降到哪一档」：按上次实际解析到的档位往下降一档。
     * 已降到最低档、没降过、或不是网易云的歌返回空串（引擎据此走普通重试/跳过）。
     */
    public static String lowerLevelFor(String songKey) {
        String current = lastLevelFor(songKey);
        if (current.isEmpty()) return "";
        String lower = lowerLevel(current);
        // 降级目标若是 svip 专属档就再降一档（高→低方向上 jymaster 不可能出现，防御性处理）。
        if ("jymaster".equals(lower)) return "";
        return lower;
    }

    /** 诊断用：只说通道是否可用，绝不输出地址与凭据。 */
    public String describe() {
        return "netease{cookie=" + !cookie.isEmpty() + "}";
    }
}
