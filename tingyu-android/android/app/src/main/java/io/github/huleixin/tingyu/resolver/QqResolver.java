package io.github.huleixin.tingyu.resolver;

import java.io.IOException;
import java.util.Locale;
import java.util.Random;
import java.util.concurrent.TimeUnit;

import io.github.huleixin.tingyu.playback.NativePlaylist;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * QQ 歌曲的原生解析器 —— 阶段 B 打通的那条完整链路。
 *
 * **前提，必须先说清楚：**真机报告里的 `provider=qq kind=lx:tx` 不等于"QQ 官方 API"。
 * 核对过两处实现：
 * - `qqTransport.ts` 的 `VITE_QQ_API_BASE` 在正式包里是 `extension`，即所有 QQ 后端请求都走
 *   `window.postMessage` 交给浏览器扩展 —— 没有 Activity、没有 window 的原生侧根本用不了；
 * - `lxSource/playback.ts` 的 `resolveLxSource` 把取地址交给**用户导入的洛雪脚本**，跑在
 *   WebView 的 Worker 里 —— 那是一段任意 JS，原生没有等价物。
 *
 * 所以能原生化的既不是扩展桥也不是脚本，而是它们**共同的上游协议**：QQ 的 musicu 网关
 * `https://u.y.qq.com/cgi-bin/musicu.fcg`。它是明文 HTTPS POST + JSON，没有客户端加密、
 * 不需要用户凭据，`qqSearchTransport.ts` 里搜索已经在用同一条通道（且 `u.y.qq.com` 早已在
 * 本地代理的放行名单里）。本类按同一结构发 `CgiGetVkey`，取回 `purl` 拼出播放地址。
 *
 * 两条传输通道，按序尝试：
 * 1. **用户自建的 qq-music-api**（`{base}/getMusicPlay/{songmid}`）—— 只有当 JS 给的是真实
 *    http(s) 地址时才可用，`extension` 不算。带得上用户的登录态，音质最好。
 * 2. **直连 musicu**（匿名）—— 无需任何配置，任何 QQ 身份的歌曲都能试。
 *
 * 拿不到就是拿不到：绝不伪造地址，也不把"这次没取到"说成"这首歌没有音源"。
 */
public final class QqResolver implements SourceResolver {

    // ---------------------------------------------------------------- musicu transport

    public static final String MUSICU_URL = "https://u.y.qq.com/cgi-bin/musicu.fcg?format=json";
    static final String MUSICU_USER_AGENT = "okhttp/3.14.9";
    static final String MUSICU_COOKIE = "tmeLoginType=-1;";
    /** 前台已验证可用的 web 形态请求头：不带这些，登录态 vkey 会被拒。 */
    static final String WEB_USER_AGENT =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    static final String WEB_REFERER = "https://y.qq.com/";
    /** 匿名网关给不出高音质时，把 purl 拼到这个 CDN 前缀上。 */
    static final String DEFAULT_SIP = "https://isure.stream.qqmusic.qq.com/";

    /** 与 `QQ_QUALITY_FALLBACKS` 同构：拿不到就退回下一档，而不是直接判失败。 */
    private static final String[] QUALITY_CHAIN = { "M500", "M800", "F000" };
    private static final String[] BACKEND_CHAIN = { "128", "320", "flac" };

    private static final OkHttpClient CLIENT = new OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .followRedirects(true)
        .build();

    private final String backendBase;
    private final String backendCookie;
    private final boolean cookieAsHeader;
    /** QQ 音乐登录 Cookie（含 uin + qm_keyst）。只存内存，绝不落盘、不进日志。 */
    private final String loginCookie;
    /**
     * 是否还允许匿名 musicu 直连。
     *
     * <p>实测（5 个真实 songmid × 5 档音质）：HTTP 200、code=0，但 {@code purl} 恒空、
     * {@code result=104003} —— 匿名通道今天取不到地址。正式链路一律关掉：发一堆注定空的
     * 请求既解决不了续播，又会把用户推向"好像解析过、其实没地址"的假象。
     */
    private final boolean allowAnonymous;

    public QqResolver(String backendBase, String backendCookie, boolean cookieAsHeader) {
        this(backendBase, backendCookie, cookieAsHeader, true);
    }

    public QqResolver(String backendBase, String backendCookie, boolean cookieAsHeader, boolean allowAnonymous) {
        this(backendBase, backendCookie, cookieAsHeader, allowAnonymous, "");
    }

    public QqResolver(String backendBase, String backendCookie, boolean cookieAsHeader, boolean allowAnonymous,
                      String loginCookie) {
        this.backendBase = backendBase == null ? "" : backendBase.trim();
        this.backendCookie = backendCookie == null ? "" : backendCookie;
        this.cookieAsHeader = cookieAsHeader;
        this.allowAnonymous = allowAnonymous;
        this.loginCookie = loginCookie == null ? "" : loginCookie;
    }

    /** 从内存凭据构造。`extension` 与相对路径都不算可用后端；匿名直连一律关闭。 */
    public static QqResolver fromCredentials() {
        String base = ResolverCredentials.value("qq", "base");
        if (!isUsableBackendBase(base)) base = "";
        return new QqResolver(base,
            ResolverCredentials.value("qq", "cookie"),
            Boolean.parseBoolean(ResolverCredentials.value("qq", "cookieAsHeader")), false,
            ResolverCredentials.value("qq", "loginCookie"));
    }

    // ---------------------------------------------------------------- 匿名 musicu 熔断
    //
    // 实测（5 个真实 songmid × M500/M800/F000/C400/RS01 × 8 组参数）：HTTP 200、code=0，
    // 但 midurlinfo[0].purl 恒空、result=104003 —— 匿名通道今天取不到地址。
    // 真机 1.3.48 因为路由错误连续打了 187 次（每次 3 档音质 = 561 个请求），
    // 所以这里给它一个熔断器：连续几次空结果后整条匿名通道停一段时间，不再空转。

    private static final int MUSICU_MISS_LIMIT = 3;
    private static final long MUSICU_BLOCK_MS = 15 * 60_000L;
    @SuppressWarnings("unused")
    private static volatile int musicuMisses = 0;
    private static volatile long musicuBlockedUntil = 0L;

    /** 用户自建后端是否可用（`extension` 桥不算）。 */
    public boolean backendUsable() {
        return isUsableBackendBase(backendBase);
    }

    /** 熔断是否打开。 */
    public static boolean musicuOpen() {
        return System.currentTimeMillis() >= musicuBlockedUntil;
    }

    /**
     * 这条链路现在值不值得试：自建后端可用，或带着已验证的登录态走 web 形态 musicu。
     * 匿名 musicu 已被证实取不到地址，不让它撑着"能试"的判定。
     */
    public boolean canAttempt() {
        return backendUsable() || hasLoginContext();
    }

    // ---------------------------------------------------------------- 登录态 web 形态通道
    //
    // 前台 QQ 原版成功的链路（nativeBridge/api/qq.js handleQQSongUrl）逐字段移植：
    // POST u.y.qq.com/cgi-bin/musicu.fcg，comm.uin/authst=登录票据、platform=yqq.json、
    // filename 候选全量一次带上，Referer/浏览器 UA/Cookie 一个不能少。
    // 匿名失败是因为缺这些，不是 musicu 协议本身不可用。

    /** 是否具备登录态上下文：cookie 里有 uin 和播放票据（qm_keyst / QQMusic_key）。 */
    public boolean hasLoginContext() {
        return !uinFromCookie(loginCookie).isEmpty() && !musicKeyFromCookie(loginCookie).isEmpty();
    }

    /** 从 cookie 里取 uin（QQ 的 uin 可能带 o 前缀，统一剥掉）。纯函数。 */
    static String uinFromCookie(String cookie) {
        String raw = cookieValue(cookie, "uin");
        if (raw.startsWith("o")) raw = raw.substring(1);
        return raw.matches("\\d+") ? raw : "";
    }

    /** 播放票据：qm_keyst（新）或 QQMusic_key（旧）。纯函数。 */
    static String musicKeyFromCookie(String cookie) {
        String key = cookieValue(cookie, "qm_keyst");
        return key.isEmpty() ? cookieValue(cookie, "QQMusic_key") : key;
    }

    static String cookieValue(String cookie, String name) {
        if (cookie == null) return "";
        for (String entry : cookie.split(";")) {
            int separator = entry.indexOf('=');
            if (separator <= 0) continue;
            if (entry.substring(0, separator).trim().equals(name)) return entry.substring(separator + 1).trim();
        }
        return "";
    }

    /** 前台 `QQ_QUALITY_CANDIDATE_TEMPLATES` 的原生镜像（顺序一致）。 */
    static final String[][] FILE_TEMPLATES = {
        { "RS01", ".flac" }, { "F000", ".flac" }, { "M800", ".mp3" }, { "M500", ".mp3" }, { "C400", ".m4a" },
    };

    /** filename 候选：mediaMid 优先、songmid 兜底，各乘一遍音质模板。纯函数。 */
    static String[] authedFilenameCandidates(String mediaMid, String songmid) {
        java.util.ArrayList<String> ids = new java.util.ArrayList<>();
        if (mediaMid != null && !mediaMid.isEmpty()) ids.add(mediaMid);
        if (songmid != null && !songmid.isEmpty() && !ids.contains(songmid)) ids.add(songmid);
        java.util.ArrayList<String> names = new java.util.ArrayList<>();
        for (String id : ids) for (String[] tpl : FILE_TEMPLATES) names.add(tpl[0] + id + tpl[1]);
        return names.toArray(new String[0]);
    }

    /** 前台 web 形态的 CgiGetVkey 请求体。纯函数，字段与 handleQQSongUrl 一一对应。 */
    public static String buildAuthedMusicuBody(String songmid, String mediaMid, String guid,
                                               String uin, String musicKey) {
        try {
            String[] filenames = authedFilenameCandidates(mediaMid, songmid);
            org.json.JSONArray songmids = new org.json.JSONArray();
            org.json.JSONArray types = new org.json.JSONArray();
            org.json.JSONArray files = new org.json.JSONArray();
            for (int i = 0; i < filenames.length; i++) {
                songmids.put(songmid); types.put(0); files.put(filenames[i]);
            }
            if (filenames.length == 0) { songmids.put(songmid); types.put(0); }
            org.json.JSONObject param = new org.json.JSONObject()
                .put("guid", guid)
                .put("songmid", songmids)
                .put("songtype", types)
                .put("uin", uin)
                .put("loginflag", 1)
                .put("platform", "20");
            if (files.length() > 0) param.put("filename", files);
            org.json.JSONObject comm = new org.json.JSONObject()
                .put("uin", uin)
                .put("format", "json")
                .put("ct", musicKey.isEmpty() ? 24 : 19)
                .put("cv", 0)
                .put("platform", "yqq.json");
            if (!musicKey.isEmpty()) comm.put("authst", musicKey);
            org.json.JSONObject req = new org.json.JSONObject()
                .put("module", "vkey.GetVkeyServer")
                .put("method", "CgiGetVkey")
                .put("param", param);
            return new org.json.JSONObject().put("comm", comm).put("req_0", req).toString();
        } catch (Exception error) {
            return "";
        }
    }

    /**
     * 扫描登录态响应的全部 midurlinfo 行，取第一个非空 purl。
     * 与前台 `rows.find(item => item.purl)` 同规则；filename 用于回读音质档。
     * 返回 [url, filename]；取不到时 url 为空串。纯函数。
     */
    static String[] parseAuthedMusicu(String body) {
        if (body == null || body.isEmpty()) return new String[] { "", "" };
        try {
            org.json.JSONObject root = new org.json.JSONObject(body);
            org.json.JSONObject node = root.optJSONObject("req_0");
            if (node == null) return new String[] { "", "" };
            org.json.JSONObject data = node.optJSONObject("data");
            if (data == null) return new String[] { "", "" };
            org.json.JSONArray infos = data.optJSONArray("midurlinfo");
            if (infos == null) return new String[] { "", "" };
            String sip = "";
            org.json.JSONArray sips = data.optJSONArray("sip");
            if (sips != null && sips.length() > 0) {
                String first = sips.optString(0, "");
                if (!first.isEmpty()) sip = first.endsWith("/") ? first : first + "/";
            }
            if (sip.isEmpty()) sip = DEFAULT_SIP;
            for (int i = 0; i < infos.length(); i++) {
                org.json.JSONObject info = infos.optJSONObject(i);
                if (info == null) continue;
                String purl = info.optString("purl", "");
                if (!purl.isEmpty()) return new String[] { sip + purl, info.optString("filename", "") };
            }
            return new String[] { "", "" };
        } catch (Exception error) {
            return new String[] { "", "" };
        }
    }

    /** 登录态通道：一次请求带全部 filename 候选，返回可播放地址或失败原因。 */
    private SourceResolution viaAuthedMusicu(String songmid, String mediaMid) {
        String uin = uinFromCookie(loginCookie);
        String musicKey = musicKeyFromCookie(loginCookie);
        String payload = buildAuthedMusicuBody(songmid, mediaMid, randomGuid(), uin, musicKey);
        if (payload.isEmpty()) return SourceResolution.failure("failed to build authed musicu body");
        Request request = new Request.Builder()
            .url(MUSICU_URL)
            .addHeader("Content-Type", "application/json;charset=UTF-8")
            .addHeader("Referer", WEB_REFERER)
            .addHeader("User-Agent", WEB_USER_AGENT)
            .addHeader("Cookie", loginCookie)
            .post(RequestBody.create(payload, MediaType.get("application/json; charset=utf-8")))
            .build();
        try (Response response = CLIENT.newCall(request).execute()) {
            int status = response.code();
            if (status == 401 || status == 403) {
                return SourceResolution.failure("authed musicu rejected the session (HTTP " + status + ")");
            }
            if (status < 200 || status >= 300) return SourceResolution.failure("authed musicu HTTP " + status);
            String body = response.body() == null ? "" : response.body().string();
            String[] parsed = parseAuthedMusicu(body);
            if (!isPlayable(parsed[0])) {
                return SourceResolution.failure("authed musicu returned no purl (login may be expired)");
            }
            return SourceResolution.ok(parsed[0], parsed[1], System.currentTimeMillis());
        } catch (IOException error) {
            return SourceResolution.failure("authed musicu unreachable: " + error.getClass().getSimpleName());
        }
    }

    /** 测试用：极少数自测需要保留匿名通道时可以显式打开。 */
    public boolean allowsAnonymous() { return allowAnonymous; }

    /** 测试用：模拟一次"匿名通道又给了空结果"。 */
    static void noteMusicuMissForTest() {
        noteMusicuMiss();
    }

    /** 测试用：把熔断复位。 */
    public static void resetMusicuBreakerForTest() {
        musicuMisses = 0;
        musicuBlockedUntil = 0L;
    }

    private static void noteMusicuMiss() {
        musicuMisses++;
        if (musicuMisses >= MUSICU_MISS_LIMIT) musicuBlockedUntil = System.currentTimeMillis() + MUSICU_BLOCK_MS;
    }

    private static void noteMusicuHit() {
        musicuMisses = 0;
        musicuBlockedUntil = 0L;
    }

    /** 浏览器扩展桥在原生侧永远不可用：它没有 HTTP 地址，也没有 window。 */
    static boolean isUsableBackendBase(String base) {
        if (base == null) return false;
        String value = base.trim();
        if (value.isEmpty()) return false;
        String lower = value.toLowerCase(Locale.US);
        if (lower.startsWith("extension") || lower.startsWith("folia-extension")) return false;
        return lower.startsWith("http://") || lower.startsWith("https://");
    }

    @Override
    public String id() {
        return "qq";
    }

    @Override
    public boolean supports(String providerId) {
        return "qq".equals(providerId);
    }

    // ---------------------------------------------------------------- pure helpers (JVM-testable)

    /** 音质档位 → musicu 的 filename 前缀。 */
    static String filePrefix(String quality) {
        if ("standard".equals(quality)) return "M500";
        if ("lossless".equals(quality) || "hires".equals(quality)) return "F000";
        return "M800";
    }

    /** 从偏好音质开始的降级链，例如 high → [M800, M500]。 */
    static String[] qualityChain(String quality) {
        int start = "standard".equals(quality) ? 0 : "high".equals(quality) ? 1 : 2;
        String[] chain = new String[start == 0 ? 1 : start == 1 ? 2 : 3];
        if (start == 0) {
            chain[0] = QUALITY_CHAIN[0];
        } else if (start == 1) {
            chain[0] = QUALITY_CHAIN[1];
            chain[1] = QUALITY_CHAIN[0];
        } else {
            chain[0] = QUALITY_CHAIN[2];
            chain[1] = QUALITY_CHAIN[1];
            chain[2] = QUALITY_CHAIN[0];
        }
        return chain;
    }

    /** 拼 musicu 的 `CgiGetVkey` 请求体。纯函数。 */
    public static String buildMusicuBody(String songmid, String filePrefix, String guid) {
        try {
            String filename = filePrefix + songmid + (filePrefix.startsWith("F") ? ".flac" : ".mp3");
            org.json.JSONObject param = new org.json.JSONObject()
                .put("guid", guid)
                .put("loginflag", 0)
                .put("platform", "20")
                .put("uin", "0")
                .put("songmid", new org.json.JSONArray().put(songmid))
                .put("songtype", new org.json.JSONArray().put(0))
                .put("filename", new org.json.JSONArray().put(filename));
            org.json.JSONObject req = new org.json.JSONObject()
                .put("module", "vkey.GetVkeyServer")
                .put("method", "CgiGetVkey")
                .put("param", param);
            org.json.JSONObject comm = new org.json.JSONObject()
                .put("ct", 11).put("cv", "1003006").put("v", "1003006")
                .put("tmeAppID", "qqmusiclight")
                .put("nettype", "NETWORK_WIFI")
                .put("udid", "0").put("uid", "0");
            return new org.json.JSONObject().put("comm", comm).put("req_0", req).toString();
        } catch (Exception error) {
            return "";
        }
    }

    /**
     * 从 musicu 响应里取出播放地址。
     *
     * 结构上同时认 `req_0` 与 `request` 两种键（后端与直连包装不同），并优先用响应里给的
     * `sip`，没有才回落到 {@link #DEFAULT_SIP}。
     */
    public static String parseMusicu(String body) {
        if (body == null || body.isEmpty()) return "";
        try {
            org.json.JSONObject root = new org.json.JSONObject(body);
            org.json.JSONObject node = root.optJSONObject("req_0");
            if (node == null) node = root.optJSONObject("request");
            if (node == null) return "";
            if (node.optInt("code") != 0 && node.has("code")) {
                // 业务拒绝（没有版权/需要登录）与网络失败必须分开，但两者都不是"有地址"。
                return "";
            }
            org.json.JSONObject data = node.optJSONObject("data");
            if (data == null) return "";
            org.json.JSONArray infos = data.optJSONArray("midurlinfo");
            if (infos == null || infos.length() == 0) return "";
            org.json.JSONObject info = infos.optJSONObject(0);
            if (info == null) return "";
            String purl = info.optString("purl", "");
            if (purl.isEmpty()) return "";
            String sip = "";
            org.json.JSONArray sips = data.optJSONArray("sip");
            if (sips != null && sips.length() > 0) {
                String first = sips.optString(0, "");
                if (!first.isEmpty()) sip = first.endsWith("/") ? first : first + "/";
            }
            if (sip.isEmpty()) sip = DEFAULT_SIP;
            return sip + purl;
        } catch (Exception error) {
            return "";
        }
    }

    /** 自建后端通道的请求地址，纯函数。 */
    public String buildBackendUrl(String songmid, String mediaMid, String apiQuality, long timestamp) {
        if (!isUsableBackendBase(backendBase)) return "";
        StringBuilder text = new StringBuilder(backendBase);
        while (text.length() > 0 && text.charAt(text.length() - 1) == '/') text.setLength(text.length() - 1);
        text.append("/getMusicPlay/").append(encode(songmid));
        text.append("?quality=").append(encode(apiQuality));
        if (mediaMid != null && !mediaMid.isEmpty()) text.append("&mediaId=").append(encode(mediaMid));
        if (!backendCookie.isEmpty() && !cookieAsHeader) text.append("&cookie=").append(encode(backendCookie));
        text.append("&timestamp=").append(timestamp);
        return text.toString();
    }

    /** 与 JS `toSafePlaybackUrl` 同规则：只认 http/https。 */
    public static boolean isPlayable(String url) {
        if (url == null || url.isEmpty()) return false;
        String lower = url.toLowerCase(Locale.US);
        return lower.startsWith("https://") || lower.startsWith("http://");
    }

    static String tokenFromCookie(String cookie) {
        if (cookie == null) return "";
        for (String entry : cookie.split(";")) {
            int separator = entry.indexOf('=');
            if (separator <= 0) continue;
            if (entry.substring(0, separator).trim().equals("qqmusic_session")) return entry.substring(separator + 1).trim();
        }
        return "";
    }

    static String mediaMidFrom(NativePlaylist.Track track) {
        if (track.providerData == null || track.providerData.isEmpty()) return "";
        try {
            return new org.json.JSONObject(track.providerData).optString("mediaMid", "");
        } catch (Exception error) {
            return "";
        }
    }

    // ---------------------------------------------------------------- resolve

    @Override
    public SourceResolution resolve(NativePlaylist.Track track, String quality) {
        if (!supports(track.providerId)) {
            return SourceResolution.unsupported("not a QQ track");
        }
        String songmid = track.mediaId;
        if (songmid == null || songmid.isEmpty()) {
            return SourceResolution.failure("QQ track carries no songmid");
        }
        String mediaMid = mediaMidFrom(track);

        if (isUsableBackendBase(backendBase)) {
            String[] chain = "standard".equals(quality) ? new String[] { BACKEND_CHAIN[0] } : BACKEND_CHAIN;
            for (String apiQuality : chain) {
                SourceResolution resolved = viaBackend(songmid, mediaMid, apiQuality);
                if (resolved.ok()) return resolved;
            }
        }
        // 登录态 web 形态：与前台 handleQQSongUrl 成功链路同构。有 uin + 播放票据才走；
        // 取不到会如实说"登录可能过期"，绝不回落到注定空的匿名通道假装成功。
        if (hasLoginContext()) {
            return viaAuthedMusicu(songmid, mediaMid);
        }
        // 匿名直连通道默认关闭：实测 purl 恒空 / result=104003，开了只能制造"解析过了"的假象。
        if (!allowAnonymous) {
            return SourceResolution.failure("anonymous musicu disabled: proven to return no url (result=104003)");
        }
        // 熔断打开时整条通道直接跳过：明知道取不到还打，只会把流量和电量烧在重试上。
        if (!musicuOpen()) {
            return SourceResolution.failure("musicu circuit open (anonymous vkey keeps returning no url)");
        }
        String lastReason = "musicu returned no playable url";
        for (String prefix : qualityChain(quality)) {
            try {
                String url = requestMusicu(songmid, prefix);
                if (isPlayable(url)) {
                    noteMusicuHit();
                    return SourceResolution.ok(url, resolvedQuality(prefix), System.currentTimeMillis());
                }
            } catch (IOException error) {
                lastReason = "musicu unreachable: " + error.getClass().getSimpleName();
            } catch (RuntimeException error) {
                lastReason = "musicu failed: " + error.getClass().getSimpleName();
            }
        }
        // 空结果说明匿名通道对这首歌（乃至这个时段）就是给不出地址：累计几次就熔断。
        if ("musicu returned no playable url".equals(lastReason)) noteMusicuMiss();
        return SourceResolution.failure(lastReason);
    }

    private SourceResolution viaBackend(String songmid, String mediaMid, String apiQuality) {
        String url = buildBackendUrl(songmid, mediaMid, apiQuality, System.currentTimeMillis());
        if (url.isEmpty()) return SourceResolution.failure("no usable QQ backend");
        try {
            Request.Builder request = new Request.Builder().url(url).get();
            if (!backendCookie.isEmpty() && cookieAsHeader) request.header("X-QQ-Session", tokenFromCookie(backendCookie));
            try (Response response = CLIENT.newCall(request.build()).execute()) {
                int status = response.code();
                if (status == 401) return SourceResolution.failure("QQ backend rejected the session (401)");
                if (status == 404) return SourceResolution.failure("QQ backend has no getMusicPlay route (404)");
                if (status < 200 || status >= 300) return SourceResolution.failure("QQ backend HTTP " + status);
                String body = response.body() == null ? "" : response.body().string();
                String playable = parseBackendUrl(body, songmid);
                return isPlayable(playable)
                    ? SourceResolution.ok(playable, resolvedQuality(apiQuality), System.currentTimeMillis())
                    : SourceResolution.failure("QQ backend returned no url at " + apiQuality);
            }
        } catch (IOException error) {
            return SourceResolution.failure("QQ backend unreachable: " + error.getClass().getSimpleName());
        }
    }

    String requestMusicu(String songmid, String filePrefix) throws IOException {
        String guid = randomGuid();
        String payload = buildMusicuBody(songmid, filePrefix, guid);
        Request request = new Request.Builder()
            .url(MUSICU_URL)
            .addHeader("Content-Type", "application/json")
            .addHeader("Cookie", MUSICU_COOKIE)
            .addHeader("User-Agent", MUSICU_USER_AGENT)
            .post(RequestBody.create(payload, MediaType.get("application/json; charset=utf-8")))
            .build();
        try (Response response = CLIENT.newCall(request).execute()) {
            int status = response.code();
            if (status < 200 || status >= 300) throw new IOException("musicu HTTP " + status);
            String body = response.body() == null ? "" : response.body().string();
            return parseMusicu(body);
        }
    }

    /** 从自建后端响应里取地址，纯函数。 */
    public static String parseBackendUrl(String body, String songmid) {
        if (body == null || body.isEmpty()) return "";
        try {
            org.json.JSONObject data = new org.json.JSONObject(body).optJSONObject("data");
            if (data == null) return "";
            org.json.JSONObject playUrl = data.optJSONObject("playUrl");
            if (playUrl == null) return "";
            org.json.JSONObject direct = playUrl.optJSONObject(songmid);
            String url = direct == null ? "" : direct.optString("url", "");
            if (!url.isEmpty()) return url;
            java.util.Iterator<String> keys = playUrl.keys();
            while (keys.hasNext()) {
                org.json.JSONObject entry = playUrl.optJSONObject(keys.next());
                if (entry == null) continue;
                String candidate = entry.optString("url", "");
                if (!candidate.isEmpty()) return candidate;
            }
            return "";
        } catch (Exception error) {
            return "";
        }
    }

    static String resolvedQuality(String code) {
        if ("M500".equals(code) || "128".equals(code)) return "standard";
        if ("F000".equals(code) || "flac".equals(code)) return "lossless";
        return "high";
    }

    static String randomGuid() {
        StringBuilder text = new StringBuilder();
        Random random = new Random();
        for (int i = 0; i < 18; i++) text.append(random.nextInt(10));
        return text.toString();
    }

    private static String encode(String value) {
        try {
            return java.net.URLEncoder.encode(value == null ? "" : value, "UTF-8");
        } catch (Exception error) {
            return value == null ? "" : value;
        }
    }

    /** 诊断用：只说通道是否可用，绝不输出地址与凭据。 */
    public String describe() {
        return "qq{backend=" + isUsableBackendBase(backendBase) + ",musicu=true}";
    }
}
