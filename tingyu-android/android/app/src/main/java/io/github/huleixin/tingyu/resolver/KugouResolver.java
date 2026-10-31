package io.github.huleixin.tingyu.resolver;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.net.URLEncoder;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import io.github.huleixin.tingyu.playback.NativePlaylist;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

// android/app/src/main/java/io/github/huleixin/tingyu/resolver/KugouResolver.java
/**
 * 酷狗音乐的原生解析器 —— 从 {@code src/nativeBridge/api/kugou.js} 逐字段移植。
 *
 * <p><b>缺口同网易云</b>：取址链跑在 WebView（handleKGSongUrl），冻结后后台续播只能
 * FALLBACK_TO_JS。本类移植其五条取链策略中的三条（够匿名+登录双场景，且每条都是
 * 前台验证过的真实请求）：
 * <ol>
 *   <li><b>v5（登录）</b>：{@code GET gateway.kugou.com/v5/url}（x-router: trackercdn.kugou.com），
 *       参数带 key={@code md5(hash+盐+appid+mid+userid)} 与 Android 签名
 *       {@code md5(盐+排序参数串+盐)}（kugou.js:834-840,1637-1643,1656-1736）；</li>
 *   <li><b>playInfo（匿名）</b>：{@code GET m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=…}
 *       （kugou.js:2664-2674）；</li>
 *   <li><b>getdata（匿名）</b>：{@code GET wwwapi.kugou.com/yy/index.php?r=play/getdata&…}
 *       （kugou.js:2899-2947）；</li>
 *   <li><b>tracker（匿名）</b>：{@code GET trackercdn.kugou.com/i/v2/?cmd=26&key=…&vipType=0}
 *       （kugou.js:2676-2742）；status=2 = 会员校验不过 → 如实报 VIP_REQUIRED。</li>
 * </ol>
 *
 * <p><b>身份</b>：providerId={@code kugou}，mediaId=32 位 FileHash；album_id/album_audio_id
 * 从 providerData 取（nativePlaylistSync 已随队列同步）。
 * <b>登录态</b>：JS 把 {@code getKGCookie()} 的 Cookie 经 ResolverCredentials('kugou','cookie')
 * 同步进内存；匿名时三条兜底链仍可取免费曲目。
 * <b>音质</b>：128/320/flac 与前台 qualityValue 同映射（kugouProvider.ts:757-768），有界降级。
 * <b>限制</b>（如实声明，不假装支持）：VIP 曲目匿名链回 status=2；登录态缺 vip_token 时
 * 会员曲同样可能被拒 —— 与前台「先 login_by_token 换 vip_token」不同，这里不做登录续期，
 * 只如实失败让续播跳过/等待前台恢复。
 */
public final class KugouResolver implements SourceResolver {

    static final String ANDROID_SIGN_SALT = "LnT6xpN3khm36zse0QzvmgTZ3waWdRSA";
    static final String TRACKER_SECRET = "185672dd44712f60bb1736df5a377e82";
    static final String ANDROID_UA = "Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi";
    static final String APPID = "3116";
    static final String TRACKER_APPID = "1005";
    static final int CLIENTVER = 11430;

    private static final String[] TRACKER_HOSTS = {
        "https://trackercdn.kugou.com", "https://trackercdnbj.kugou.com",
    };

    private static final OkHttpClient CLIENT = new OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(12, TimeUnit.SECONDS)
        .build();

    /** 进程级设备身份（kugou.js:222-239 buildKGLiteDeviceIdentity 的镜像；进程内固定）。 */
    private static final String GUID = randomHex(32).toUpperCase(java.util.Locale.US);
    private static final String MID = decimalOfMd5(GUID);
    private static final String DEV = randomHex(10);

    private final String cookie;

    public KugouResolver(String cookie) {
        this.cookie = cookie == null ? "" : cookie.trim();
    }

    public static KugouResolver fromCredentials() {
        return new KugouResolver(ResolverCredentials.value("kugou", "cookie"));
    }

    /** 匿名链（playInfo/getdata/tracker）不依赖登录态，恒可尝试。 */
    public boolean canAttempt() {
        return true;
    }

    @Override public String id() {
        return "kugou";
    }

    @Override public boolean supports(String providerId) {
        return "kugou".equals(providerId);
    }

    // ---------------------------------------------------------------- Cookie 字段

    String cookieValue(String name) {
        return QqResolver.cookieValue(cookie, name);
    }

    String userId() {
        String value = cookieValue("userid");
        if (value.isEmpty()) value = cookieValue("KugooID");
        return value;
    }

    String token() {
        String value = cookieValue("token");
        if (value.isEmpty()) value = cookieValue("t");
        return value;
    }

    String dfid() {
        String value = cookieValue("dfid");
        return value.isEmpty() ? randomLower(24) : value;
    }

    // ---------------------------------------------------------------- 签名（kugou.js:834-840,1637-1643 镜像，纯函数）

    /** Android 网关签名：参数按 key 字典序 → "k=v" 直接拼接 → 前后各包一次盐 → MD5。 */
    public static String signatureAndroidParams(Map<String, String> params) {
        java.util.TreeMap<String, String> sorted = new java.util.TreeMap<>(params);
        StringBuilder flat = new StringBuilder();
        for (Map.Entry<String, String> entry : sorted.entrySet()) {
            flat.append(entry.getKey()).append('=').append(entry.getValue());
        }
        return md5(ANDROID_SIGN_SALT + flat + ANDROID_SIGN_SALT);
    }

    /** tracker key：md5(hash+盐+appid+mid+userid)，与 kugou.js:1637-1643 同构（hash 归一小写）。 */
    public static String trackerKey(String hash, String mid, String userId, String appid) {
        String h = (hash == null ? "" : hash.trim()).toLowerCase(java.util.Locale.US);
        String uid = (userId == null ? "0" : userId).replaceAll("\\D", "");
        if (uid.isEmpty()) uid = "0";
        return md5(h + TRACKER_SECRET + appid + mid + uid);
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
        String alphabet = "0123456789ABCDEF";
        java.util.Random random = new java.util.Random();
        StringBuilder out = new StringBuilder(length);
        for (int i = 0; i < length; i++) out.append(alphabet.charAt(random.nextInt(alphabet.length())));
        return out.toString();
    }

    private static String randomLower(int length) {
        String alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
        java.util.Random random = new java.util.Random();
        StringBuilder out = new StringBuilder(length);
        for (int i = 0; i < length; i++) out.append(alphabet.charAt(random.nextInt(alphabet.length())));
        return out.toString();
    }

    private static String decimalOfMd5(String text) {
        try {
            return new java.math.BigInteger(1, MessageDigest.getInstance("MD5")
                .digest(text.getBytes(StandardCharsets.UTF_8))).toString(10);
        } catch (Exception error) {
            return "0";
        }
    }

    // ---------------------------------------------------------------- 音质（kugouProvider.ts:757-768 的映射 + 有界降级）

    /** quality 偏好 → 网关 quality 参数（standard→128, high→320, lossless/hires→flac）。 */
    static String[] qualityChain(String quality) {
        String value = quality == null ? "" : quality.trim().toLowerCase(java.util.Locale.US);
        if ("hires".equals(value) || "hi-res".equals(value) || "lossless".equals(value) || "flac".equals(value)) {
            return new String[] { "flac", "320", "128" };
        }
        if ("high".equals(value) || "exhigh".equals(value) || "320k".equals(value)) {
            return new String[] { "320", "128" };
        }
        return new String[] { "128" };
    }

    // ---------------------------------------------------------------- 响应解析（kugou.js:1853-1880 镜像，纯函数）

    /** parseKGPlayUrl：url/backupUrl/backup_url/data.url/… 里第一个 http(s) 项。 */
    static String parsePlayUrl(String body) {
        if (body == null || body.isEmpty()) return "";
        try {
            org.json.JSONObject root = new org.json.JSONObject(body);
            String[] directKeys = { "url", "backupUrl", "backup_url" };
            for (String key : directKeys) {
                String hit = firstHttpUrl(root.opt(key));
                if (!hit.isEmpty()) return hit;
            }
            org.json.JSONObject data = root.optJSONObject("data");
            if (data != null) {
                String[] dataKeys = { "url", "backupUrl", "backup_url", "play_url", "play_backup_url", "playUrl" };
                for (String key : dataKeys) {
                    String hit = firstHttpUrl(data.opt(key));
                    if (!hit.isEmpty()) return hit;
                }
            }
        } catch (Exception ignored) { }
        return "";
    }

    private static String firstHttpUrl(Object value) {
        if (value instanceof org.json.JSONArray) {
            org.json.JSONArray list = (org.json.JSONArray) value;
            for (int i = 0; i < list.length(); i++) {
                String item = String.valueOf(list.opt(i));
                if (item.startsWith("http://") || item.startsWith("https://")) return item;
            }
            return "";
        }
        String text = value == null ? "" : String.valueOf(value);
        return text.startsWith("http://") || text.startsWith("https://") ? text : "";
    }

    /** playInfo 响应的 URL（kugou.js:1873-1880 pickPlayInfoUrl）。 */
    static String parsePlayInfoUrl(String body) {
        if (body == null || body.isEmpty()) return "";
        try {
            org.json.JSONObject root = new org.json.JSONObject(body);
            if (root.has("error") && root.optInt("error", 0) != 0) return "";
            String hit = firstHttpUrl(root.opt("url"));
            if (!hit.isEmpty()) return hit;
            return firstHttpUrl(root.opt("backup_url"));
        } catch (Exception error) {
            return "";
        }
    }

    /** tracker/getdata 响应里的会员校验状态（status=2 = 会员校验不过）。纯函数。 */
    static int trackerStatus(String body) {
        if (body == null || body.isEmpty()) return 0;
        try {
            return new org.json.JSONObject(body).optInt("status", 0);
        } catch (Exception error) {
            return 0;
        }
    }

    // ---------------------------------------------------------------- resolve

    @Override
    public SourceResolution resolve(NativePlaylist.Track track, String quality) {
        if (!supports(track.providerId)) {
            return SourceResolution.unsupported("not a kugou track");
        }
        String hash = track.mediaId == null ? "" : track.mediaId.trim().toLowerCase(java.util.Locale.US);
        if (hash.length() != 32 || !hash.matches("[0-9a-f]+")) {
            // 兜底：providerData 里的 hash 也可以（老同步包 mediaId 可能是 mixSongId）。
            hash = BodianResolver.jsonField(track.providerData, "hash").toLowerCase(java.util.Locale.US);
        }
        if (hash.length() != 32) {
            return SourceResolution.failure("kugou track carries no valid hash (MISSING_HASH)");
        }
        String albumId = BodianResolver.jsonField(track.providerData, "albumId");
        String albumAudioId = BodianResolver.jsonField(track.providerData, "albumAudioId");
        if (albumAudioId.isEmpty()) albumAudioId = BodianResolver.jsonField(track.providerData, "mixSongId");

        boolean loggedIn = !userId().isEmpty() && !"0".equals(userId()) && !token().isEmpty();
        String lastReason = "kugou returned no playable url";
        for (String level : qualityChain(quality)) {
            // 1) 登录 fast path：gateway v5（kugou.js:1656-1736）
            if (loggedIn) {
                Attempt v5 = viaGatewayV5(hash, albumId, albumAudioId, level);
                if (v5.ok()) return SourceResolution.ok(v5.url(), level, System.currentTimeMillis());
                lastReason = v5.error;
            }
            // 2) playInfo（匿名，kugou.js:2664-2674）
            Attempt info = viaPlayInfo(hash, albumAudioId);
            if (info.ok()) return SourceResolution.ok(info.url(), level, System.currentTimeMillis());
            if (!info.error.isEmpty()) lastReason = info.error;
            // 3) getdata（匿名，kugou.js:2899-2947）
            Attempt data = viaGetData(hash, albumId, albumAudioId);
            if (data.ok()) return SourceResolution.ok(data.url(), level, System.currentTimeMillis());
            if (!data.error.isEmpty()) lastReason = data.error;
            // 4) tracker（匿名 vipType=0，kugou.js:2676-2742）
            Attempt tracker = viaTracker(hash, albumId, albumAudioId);
            if (tracker.ok()) return SourceResolution.ok(tracker.url(), level, System.currentTimeMillis());
            if (trackerStatus(tracker.body) == 2) {
                return SourceResolution.failure("kugou VIP_REQUIRED (tracker status 2; entitlement not synced)");
            }
            if (!tracker.error.isEmpty()) lastReason = tracker.error;
        }
        return SourceResolution.failure(lastReason);
    }

    private Attempt viaGatewayV5(String hash, String albumId, String albumAudioId, String quality) {
        Map<String, String> params = v5Params(hash, albumId, albumAudioId, quality);
        StringBuilder qs = new StringBuilder();
        for (Map.Entry<String, String> entry : params.entrySet()) {
            if (qs.length() > 0) qs.append('&');
            try {
                qs.append(URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8.name()))
                    .append('=').append(URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8.name()));
            } catch (Exception error) {
                return Attempt.fail("kugou param encode failed");
            }
        }
        Request request = new Request.Builder()
            .url("https://gateway.kugou.com/v5/url?" + qs)
            .header("User-Agent", ANDROID_UA)
            .header("Referer", "https://www.kugou.com/")
            .header("Cookie", leanCookie())
            .header("dfid", dfid())
            .header("clienttime", params.get("clienttime"))
            .header("mid", MID)
            .header("kg-rc", "1")
            .header("kg-thash", "5d816a0")
            .header("kg-rec", "1")
            .header("kg-rf", "B9EDA08A64250DEFFBCADDEE00F8F25F")
            .header("x-router", "trackercdn.kugou.com")
            .header("Authorization", "KugooToken " + token())
            .build();
        return execute(request, "kugou v5");
    }

    private Map<String, String> v5Params(String hash, String albumId, String albumAudioId, String quality) {
        java.util.Map<String, String> params = new java.util.LinkedHashMap<>();
        params.put("album_id", albumId.isEmpty() ? "0" : albumId);
        params.put("area_code", "1");
        params.put("hash", hash);
        params.put("ssa_flag", "is_fromtrack");
        params.put("version", String.valueOf(CLIENTVER));
        params.put("page_id", "967177915");
        params.put("quality", quality);
        params.put("album_audio_id", albumAudioId.isEmpty() ? "0" : albumAudioId);
        params.put("behavior", "play");
        params.put("pid", "411");
        params.put("cmd", "26");
        params.put("pidversion", "3001");
        params.put("IsFreePart", "0");
        params.put("ppage_id", "356753938,823673182,967485191");
        params.put("cdnBackup", "1");
        params.put("module", "");
        params.put("clientver", String.valueOf(CLIENTVER));
        params.put("dfid", dfid());
        params.put("mid", MID);
        params.put("uuid", "-");
        params.put("appid", APPID);
        params.put("clienttime", String.valueOf(System.currentTimeMillis() / 1000L));
        params.put("token", token());
        params.put("userid", userId());
        params.put("key", trackerKey(hash, MID, userId(), APPID));
        params.put("signature", signatureAndroidParams(params));
        return params;
    }

    private Attempt viaPlayInfo(String hash, String albumAudioId) {
        StringBuilder url = new StringBuilder("https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=").append(hash);
        if (!albumAudioId.isEmpty()) url.append("&album_audio_id=").append(urlEncode(albumAudioId));
        Request request = new Request.Builder().url(url.toString())
            .header("User-Agent", "Mozilla/5.0 (Linux; Android 13; Mobile)")
            .header("Referer", "https://m.kugou.com/")
            .build();
        Attempt result = execute(request, "kugou playInfo");
        if (result.error.isEmpty()) {
            String hit = parsePlayInfoUrl(result.body);
            if (hit.isEmpty()) return Attempt.fail("");
            return new Attempt(hit, "", false);
        }
        return result;
    }

    private Attempt viaGetData(String hash, String albumId, String albumAudioId) {
        StringBuilder url = new StringBuilder("https://wwwapi.kugou.com/yy/index.php?r=play/getdata")
            .append("&hash=").append(hash)
            .append("&album_id=").append(albumId.isEmpty() ? "0" : urlEncode(albumId));
        if (!albumAudioId.isEmpty()) url.append("&album_audio_id=").append(urlEncode(albumAudioId));
        url.append("&mid=").append(urlEncode(MID))
            .append("&dfid=").append(urlEncode(dfid()))
            .append("&platid=4&from=mkugou");
        if (!token().isEmpty()) {
            url.append("&appid=").append(APPID)
                .append("&clientver=").append(CLIENTVER)
                .append("&userid=").append(urlEncode(userId()))
                .append("&token=").append(urlEncode(token()));
        }
        Request request = new Request.Builder().url(url.toString())
            .header("User-Agent", "Mozilla/5.0 (Linux; Android 13; Mobile)")
            .header("Referer", "https://www.kugou.com/")
            .build();
        return execute(request, "kugou getdata");
    }

    private Attempt viaTracker(String hash, String albumId, String albumAudioId) {
        Attempt last = Attempt.fail("");
        for (String host : TRACKER_HOSTS) {
            String key = trackerKey(hash, MID, userId(), TRACKER_APPID);
            StringBuilder url = new StringBuilder(host).append("/i/v2/?cmd=26")
                .append("&key=").append(key)
                .append("&hash=").append(hash)
                .append("&behavior=play")
                .append("&mid=").append(urlEncode(MID))
                .append("&dfid=").append(urlEncode(dfid()))
                .append("&appid=").append(TRACKER_APPID)
                .append("&userid=").append(urlEncode(userId().isEmpty() ? "0" : userId()))
                .append("&version=9108")
                .append("&vipType=0")
                .append("&token=").append(urlEncode(token()))
                .append("&album_id=").append(albumId.isEmpty() ? "0" : urlEncode(albumId))
                .append("&album_audio_id=").append(albumAudioId.isEmpty() ? "0" : urlEncode(albumAudioId))
                .append("&area_code=1&pid=2&pidversion=3001&with_res_tag=1");
            Request request = new Request.Builder().url(url.toString())
                .header("User-Agent", "Mozilla/5.0 (Linux; Android 13; Mobile)")
                .header("Referer", "https://www.kugou.com/")
                .build();
            Attempt result = execute(request, "kugou tracker");
            if (result.ok()) return result;
            if (trackerStatus(result.body) == 2) {
                return new Attempt(result.body, "", false);   // blocked：让 resolve 报 VIP_REQUIRED
            }
            last = result;
        }
        return last;
    }

    /** kugou.js:853-876 buildKGLeanCookie：瘦 Cookie，避免巨型 KuGoo 拖垮网关。 */
    private String leanCookie() {
        StringBuilder out = new StringBuilder();
        String uid = userId();
        String tok = token();
        String dfidValue = cookieValue("dfid");
        String vipToken = cookieValue("vip_token");
        if (!uid.isEmpty()) out.append("userid=").append(uid).append("; KugooID=").append(uid);
        if (!tok.isEmpty()) {
            if (out.length() > 0) out.append("; ");
            out.append("token=").append(tok).append("; t=").append(tok);
        }
        if (!dfidValue.isEmpty() && !"-".equals(dfidValue)) {
            if (out.length() > 0) out.append("; ");
            out.append("dfid=").append(dfidValue);
        }
        if (!vipToken.isEmpty()) {
            if (out.length() > 0) out.append("; ");
            out.append("vip_token=").append(vipToken);
        }
        return out.toString();
    }

    private Attempt execute(Request request, String channel) {
        try (Response response = CLIENT.newCall(request).execute()) {
            int status = response.code();
            if (status < 200 || status >= 300) {
                return Attempt.fail(channel + " HTTP " + status);
            }
            return new Attempt(response.body() == null ? "" : response.body().string(), "", false);
        } catch (IOException error) {
            return Attempt.fail(channel + " unreachable: " + error.getClass().getSimpleName());
        } catch (Exception error) {
            return Attempt.fail(channel + " failed: " + error.getClass().getSimpleName());
        }
    }

    /** 诊断用：只说登录态有没有。 */
    public String describe() {
        return "kugou{cookie=" + !cookie.isEmpty() + "}";
    }

    private static final class Attempt {
        final String body;
        final String error;

        Attempt(String bodyOrUrl, String error, boolean blockedUnused) {
            this.body = bodyOrUrl == null ? "" : bodyOrUrl;
            this.error = error == null ? "" : error;
        }

        static Attempt fail(String error) { return new Attempt("", error, false); }

        /** body 本身是地址（playInfo 路径）或 body 是含地址的 JSON（网关/getdata/tracker 路径）。 */
        String url() {
            if (body.isEmpty()) return "";
            if (body.startsWith("http://") || body.startsWith("https://")) return body;
            String hit = parsePlayUrl(body);
            return hit.isEmpty() ? parsePlayInfoUrl(body) : hit;
        }

        boolean ok() {
            return error.isEmpty() && !url().isEmpty();
        }
    }

    private static String urlEncode(String value) {
        try {
            return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8.name());
        } catch (Exception error) {
            return "";
        }
    }
}
