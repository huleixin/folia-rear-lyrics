package io.github.huleixin.tingyu;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Context;
import android.content.ComponentName;
import android.content.Intent;
import android.content.ServiceConnection;
import android.database.Cursor;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.content.pm.PackageManager;
import android.hardware.display.DisplayManager;
import android.view.Display;
import android.graphics.Point;
import android.os.PowerManager;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.provider.MediaStore;
import android.webkit.CookieManager;
import android.webkit.WebView;
import android.view.WindowManager;
import android.net.Uri;
import android.util.Base64;
import android.webkit.MimeTypeMap;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.PermissionState;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Method;
import java.net.URL;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.io.RandomAccessFile;

import okhttp3.Headers;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;
import rikka.shizuku.Shizuku;

@CapacitorPlugin(
    name = "FoliaNative",
    permissions = {
        @Permission(
            alias = "audio",
            strings = { Manifest.permission.READ_MEDIA_AUDIO }
        ),
        @Permission(
            alias = "audioLegacy",
            strings = { Manifest.permission.READ_EXTERNAL_STORAGE }
        ),
        @Permission(
            alias = "notifications",
            strings = { Manifest.permission.POST_NOTIFICATIONS }
        )
    }
)
public class FoliaNativePlugin extends Plugin {
    private static volatile FoliaNativePlugin instance;
    private static final NativeHttpDispatcher HTTP_WORK=new NativeHttpDispatcher(2,64);
    private static final java.util.concurrent.atomic.AtomicLong HTTP_IDS=new java.util.concurrent.atomic.AtomicLong();
    private static final class HttpJob {
        volatile boolean cancelled;
        volatile okhttp3.Call network;
    }
    private final java.util.concurrent.ConcurrentHashMap<String,HttpJob> httpJobs=new java.util.concurrent.ConcurrentHashMap<>();
    @PluginMethod public void cancelHttpRequest(PluginCall call) {
        HttpJob job=httpJobs.get(call.getString("requestId", ""));
        if(job!=null){job.cancelled=true;okhttp3.Call network=job.network;if(network!=null)network.cancel();}
        call.resolve();
    }
    private static volatile String playbackArtworkCover = "";
    private static volatile String playbackArtworkStatus = "none";
    private static volatile String playbackArtworkDetail = "";
    private static volatile long playbackArtworkAt = 0;
    private static volatile boolean playbackArtworkApplied = false;
    private final OkHttpClient client = new OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .writeTimeout(45, TimeUnit.SECONDS)
        .build();
    private LocalAudioServer localAudioServer;
    private boolean isAudioPickerOpen = false;
    private boolean isSourcePickerOpen = false;
    private boolean isSettingsFilePickerOpen = false;
    private final Map<String, File> pendingSettingsFiles = new ConcurrentHashMap<>();
    private static final int SHIZUKU_REQUEST_CODE = 0xF017;

    @Override
    public void load() {
        instance = this;
        RearLyricsCoordinator.get(getContext());
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        super.handleOnDestroy();
    }

    static void emitMediaAction(String action) {
        if(io.github.huleixin.tingyu.playback.NativeAudioEngine.mediaAction(action))return;
        FoliaNativePlugin plugin = instance;
        if (plugin == null) return;
        JSObject payload = new JSObject();
        payload.put("action", action);
        plugin.getActivity().runOnUiThread(() -> plugin.notifyListeners("mediaAction", payload));
    }

    static void emitMediaSeek(long positionMs) {
        if (io.github.huleixin.tingyu.playback.NativeAudioEngine.mediaSeek(positionMs)) return;
        FoliaNativePlugin plugin = instance;
        if (plugin == null) return;
        JSObject payload = new JSObject().put("action", "seek").put("position", positionMs);
        plugin.getActivity().runOnUiThread(() -> plugin.notifyListeners("mediaAction", payload));
    }

    static void emitMainWindowInsets(JSObject payload) {
        FoliaNativePlugin plugin = instance;
        if (plugin != null) plugin.notifyListeners("mainWindowInsetsChanged", payload, true);
    }

    private static JSObject stageOrientationPayload(StageOrientation.State state) {
        JSObject payload = new JSObject().put("session", state.session).put("active", state.active)
            .put("landscape", state.landscape).put("pending", state.pending)
            .put("revision", state.revision).put("reason", state.reason);
        if (state.error != null) payload.put("error", state.error);
        return payload;
    }

    static void emitStageOrientation(StageOrientation.State state) {
        FoliaNativePlugin plugin = instance;
        if (plugin != null) plugin.notifyListeners("stageOrientationChanged", stageOrientationPayload(state));
    }

    @PluginMethod
    public void getStageOrientation(PluginCall call) {
        Activity activity = getActivity();
        if (!(activity instanceof MainActivity)) { call.reject("Main activity is unavailable"); return; }
        activity.runOnUiThread(() -> call.resolve(stageOrientationPayload(((MainActivity) activity).getStageOrientation().state())));
    }

    @PluginMethod
    public void setStageOrientation(PluginCall call) {
        Activity activity = getActivity();
        if (!(activity instanceof MainActivity)) { call.reject("Main activity is unavailable"); return; }
        activity.runOnUiThread(() -> {
            try {
                StageOrientation orientation = ((MainActivity) activity).getStageOrientation();
                String session = call.getString("session", "");
                if (Boolean.TRUE.equals(call.getBoolean("reset", false))) orientation.reset("reset", true);
                else if (Boolean.FALSE.equals(call.getBoolean("active"))) orientation.deactivate(session);
                else {
                    if (activity.isFinishing() || activity.isDestroyed()) throw new IllegalStateException("Main activity is unavailable");
                    if (activity.getWindowManager().getDefaultDisplay().getDisplayId() != android.view.Display.DEFAULT_DISPLAY)
                        throw new IllegalStateException("Stage rotation is available only on the main display");
                    if (Boolean.TRUE.equals(call.getBoolean("active"))) orientation.activate(session);
                    Boolean landscape = call.getBoolean("landscape");
                    if (landscape != null) orientation.setLandscape(session, landscape, call.getData().optLong("revision", -1));
                }
                call.resolve(stageOrientationPayload(orientation.state()));
            } catch (RuntimeException error) { call.reject(error.getMessage(), error); }
        });
    }

    @PluginMethod
    public void getMainWindowInsets(PluginCall call) {
        call.resolve(MainSystemBars.getInsets());
    }

    @PluginMethod
    public void setMainSystemBarsVisible(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Main activity is unavailable");
            return;
        }
        boolean visible = call.getBoolean("visible", true);
        activity.runOnUiThread(() -> {
            MainSystemBars.setVisible(activity, visible);
            call.resolve();
        });
    }

    /** True when the WebView handled Back; otherwise the activity backgrounds without killing playback. */
    private final MainBackPolicy mainBackPolicy = new MainBackPolicy();
    private static final java.util.concurrent.atomic.AtomicLong backEventSerial = new java.util.concurrent.atomic.AtomicLong();

    @PluginMethod public void setBackHandlerState(PluginCall call) {
        mainBackPolicy.update(call.getBoolean("handledInWeb", true), call.getData().optLong("revision", 0));
        call.resolve();
    }

    static boolean emitBackPressed() {
        return emitBackPressed(false);
    }
    static boolean emitBackPressed(boolean forceWeb) {
        FoliaNativePlugin plugin = instance;
        if (!forceWeb && plugin != null && !plugin.mainBackPolicy.needsWebHandler()) return false;
        if (plugin == null || !plugin.hasListeners("backButton")) {
            if (plugin != null) {
                CrashDiagnostics.recordText(
                    plugin.getContext(),
                    "back-press",
                    "main",
                    "native-fallback",
                    "No JS backButton listener; activity will move to background",
                    "FoliaNativePlugin.emitBackPressed"
                );
            }
            return false;
        }
        Activity activity = plugin.getActivity();
        if (activity == null) return false;
        CrashDiagnostics.recordText(
            plugin.getContext(),
            "back-press",
            "main",
            "native-emit",
            "Forwarding Back to the WebView listener",
            "FoliaNativePlugin.emitBackPressed"
        );
        JSObject payload = new JSObject();
        payload.put("eventId", backEventSerial.incrementAndGet());
        activity.runOnUiThread(() -> plugin.notifyListeners("backButton", payload));
        return true;
    }

    static void notePlaybackArtwork(String coverUrl, String status, String detail) {
        playbackArtworkCover = describePlaybackArtworkUrl(coverUrl);
        playbackArtworkStatus = status == null || status.isEmpty() ? "unknown" : status;
        playbackArtworkDetail = detail == null ? "" : detail;
        playbackArtworkAt = System.currentTimeMillis();
    }

    static void notePlaybackArtworkApplied(boolean applied) {
        playbackArtworkApplied = applied;
    }

    private static String describePlaybackArtworkUrl(String value) {
        if (value == null || value.isEmpty()) return "";
        // 本地曲库封面是内联的 data:image/...;base64，只记类型与长度，绝不把整串写进诊断，
        // 也别再被 new URL() 判成 "invalid" —— 现场报告要能看出系统卡片走的是内联位图通道。
        if (value.startsWith("data:image/") && value.contains(";base64,")) {
            int comma = value.indexOf(',');
            return value.substring(0, comma) + ";base64," + (value.length() - comma - 1) + "chars";
        }
        try {
            URL url = new URL(value);
            return url.getProtocol() + "://" + url.getHost() + url.getPath();
        } catch (Exception ignored) {
            return "invalid";
        }
    }

    @PluginMethod
    public void cookiesGetAll(PluginCall call) {
        String url = call.getString("url", "");
        String domain = call.getString("domain", "");
        if (url == null || url.isEmpty()) {
            if (domain == null || domain.isEmpty()) {
                url = "https://localhost/";
            } else {
                url = domain.startsWith("http") ? domain : "https://" + domain;
            }
        }

        JSArray cookies = new JSArray();
        for (JSObject cookie : parseCookieHeader(CookieManager.getInstance().getCookie(url), domain)) {
            cookies.put(cookie);
        }
        JSObject result = new JSObject();
        result.put("cookies", cookies);
        call.resolve(result);
    }

    @PluginMethod
    public void cookiesGet(PluginCall call) {
        String url = call.getString("url", "https://localhost/");
        String name = call.getString("name", "");
        if (name == null || name.isEmpty()) {
            call.reject("Missing cookie name");
            return;
        }
        for (JSObject cookie : parseCookieHeader(CookieManager.getInstance().getCookie(url), "")) {
            if (name.equals(cookie.optString("name"))) {
                JSObject result = new JSObject();
                result.put("cookie", cookie);
                call.resolve(result);
                return;
            }
        }
        JSObject result = new JSObject();
        result.put("cookie", null);
        call.resolve(result);
    }

    @PluginMethod
    public void cookiesSet(PluginCall call) {
        String url = call.getString("url", "");
        String name = call.getString("name", "");
        String value = call.getString("value", "");
        if (url == null || url.isEmpty() || name == null || name.isEmpty()) {
            call.reject("Cookie url and name are required");
            return;
        }

        StringBuilder cookie = new StringBuilder();
        cookie.append(name).append('=').append(value == null ? "" : value);
        String domain = call.getString("domain", "");
        String path = call.getString("path", "/");
        if (domain != null && !domain.isEmpty()) cookie.append("; domain=").append(domain);
        if (path != null && !path.isEmpty()) cookie.append("; path=").append(path);
        if (Boolean.TRUE.equals(call.getBoolean("secure", false))) cookie.append("; Secure");
        Double expirationDate = call.getDouble("expirationDate");
        if (expirationDate != null) {
            cookie.append("; Max-Age=").append((int) Math.max(0, expirationDate - System.currentTimeMillis() / 1000.0));
        }

        CookieManager.getInstance().setCookie(url, cookie.toString());
        CookieManager.getInstance().flush();
        JSObject result = new JSObject();
        result.put("ok", true);
        call.resolve(result);
    }

    @PluginMethod
    public void cookiesRemove(PluginCall call) {
        String url = call.getString("url", "");
        String name = call.getString("name", "");
        if (url == null || url.isEmpty() || name == null || name.isEmpty()) {
            call.reject("Cookie url and name are required");
            return;
        }
        CookieManager.getInstance().setCookie(url, name + "=; Max-Age=0; path=/");
        CookieManager.getInstance().flush();
        JSObject result = new JSObject();
        result.put("ok", true);
        call.resolve(result);
    }

    /**
     * 批量删除 cookie：entries 是 [{url, name}, ...]。
     *
     * 逐条删除每条都要过一次桥并在原生侧 flush 一次，登录通道切换要清几十条，
     * 累加起来会超过调用方的截止时间，结果只清掉一半。这里在原生侧一次做完。
     */
    @PluginMethod
    public void cookiesRemoveBatch(PluginCall call) {
        JSArray entries = call.getArray("entries");
        if (entries == null || entries.length() == 0) {
            JSObject empty = new JSObject();
            empty.put("ok", true);
            empty.put("removed", 0);
            call.resolve(empty);
            return;
        }
        CookieManager manager = CookieManager.getInstance();
        int removed = 0;
        for (int index = 0; index < entries.length(); index++) {
            JSONObject entry = entries.optJSONObject(index);
            if (entry == null) continue;
            String url = entry.optString("url", "");
            String name = entry.optString("name", "");
            if (url == null || url.isEmpty() || name == null || name.isEmpty()) continue;
            manager.setCookie(url, name + "=; Max-Age=0; path=/");
            removed++;
        }
        if (removed > 0) manager.flush();
        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("removed", removed);
        call.resolve(result);
    }

    @PluginMethod
    public void httpRequest(PluginCall call) {
        final long id=HTTP_IDS.incrementAndGet(),submitted=android.os.SystemClock.elapsedRealtime();
        final String requestId=call.getString("requestId", "native-"+id);
        final HttpJob job=new HttpJob();
        httpJobs.put(requestId,job);
        io.github.huleixin.tingyu.chrome.NavigationTiming.mark("native-http-queued:"+id);
        try { HTTP_WORK.execute(()->{
            final long started=android.os.SystemClock.elapsedRealtime();
            io.github.huleixin.tingyu.chrome.NavigationTiming.mark("native-http-start:"+id,started-submitted);
            try {
                long remaining=call.getInt("timeoutMs",45000)-(started-submitted);
                if(job.cancelled||remaining<=0){call.reject("网络请求已取消或排队超时");return;}
                performHttpRequest(call,job,remaining);
            }
            catch(RuntimeException error){call.reject("原生网络请求失败",error);}
            finally{httpJobs.remove(requestId,job);io.github.huleixin.tingyu.chrome.NavigationTiming.mark("native-http-end:"+id,android.os.SystemClock.elapsedRealtime()-started);}
        }); } catch(java.util.concurrent.RejectedExecutionException busy){
            io.github.huleixin.tingyu.chrome.NavigationTiming.mark("native-http-rejected:"+id);
            call.reject("网络请求队列繁忙，请稍后重试");
        }
    }

    private void performHttpRequest(PluginCall call,HttpJob job,long remainingMs) {
        String url = call.getString("url", "");
        String method = call.getString("method", "GET");
        String bodyText = call.getString("bodyText", "");
        String bodyBase64 = call.getString("bodyBase64", "");
        String redirect = call.getString("redirect", "follow");
        if (url == null || url.isEmpty()) {
            call.reject("Missing request url");
            return;
        }

        if ("GET".equalsIgnoreCase(method) && (bodyText == null || bodyText.isEmpty())
            && (bodyBase64 == null || bodyBase64.isEmpty())
            && (io.github.huleixin.tingyu.playback.ResourceCachePolicy.sharedArtworkUrl(url)
                || (io.github.huleixin.tingyu.playback.SharedArtworkAccess.imageRequestUrl(url)
                    && call.getObject("headers")!=null && "1".equals(call.getObject("headers").optString("X-Tingyu-Artwork"))))) {
            try {
                File file = io.github.huleixin.tingyu.playback.NativeArtworkRepository.get(getContext()).ensureFile(url);
                java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
                try (java.io.FileInputStream in = new java.io.FileInputStream(file)) {
                    byte[] buffer = new byte[8192]; int count;
                    while ((count = in.read(buffer)) != -1) bytes.write(buffer, 0, count);
                }
                call.resolve(new JSObject().put("status", 200).put("headers", new JSObject().put("content-type", "image/jpeg"))
                    .put("bodyBase64", Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP)));
            } catch (Exception error) { call.reject("Shared artwork unavailable"); }
            return;
        }
        try {
            Request.Builder builder = new Request.Builder().url(url);
            JSObject headers = call.getObject("headers");
            if (headers != null) {
                Iterator<String> headerNames = headers.keys();
                while (headerNames.hasNext()) {
                    String headerName = headerNames.next();
                    Object headerValue = headers.opt(headerName);
                    if (headerValue != null) {
                        builder.header(headerName, String.valueOf(headerValue));
                    }
                }
            }
            // OkHttp has no cookie jar here, so carry the WebView cookie store
            // ourselves unless the caller injected an explicit Cookie header.
            if (headers == null || headers.optString("cookie") == null) {
                String storedCookies = CookieManager.getInstance().getCookie(url);
                if (storedCookies != null && !storedCookies.isEmpty()) {
                    builder.header("Cookie", storedCookies);
                }
            }

            RequestBody body = null;
            if (bodyBase64 != null && !bodyBase64.isEmpty()) {
                body = RequestBody.create(MediaType.parse("application/octet-stream"), Base64.decode(bodyBase64, Base64.DEFAULT));
            } else if (bodyText != null && !bodyText.isEmpty()) {
                MediaType mediaType = MediaType.parse(headers == null ? null : headers.optString("content-type", null));
                body = RequestBody.create(mediaType, bodyText);
            }
            String requestMethod = method == null ? "GET" : method;
            if (body != null && "GET".equalsIgnoreCase(requestMethod)) {
                // Bodian's playback endpoints use GET with a JSON body. OkHttp's public
                // method() rejects that combination, so set the validated request body
                // through its own setter after selecting GET.
                builder.method("GET", null);
                try {
                    Method setBody = Request.Builder.class.getMethod("setBody$okhttp", RequestBody.class);
                    setBody.invoke(builder, body);
                } catch (ReflectiveOperationException error) {
                    call.reject("GET request body is unsupported by this runtime", error);
                    return;
                }
            } else {
                // OkHttp 的 method() 对 POST / PUT / PATCH 要求非 null 的 body，而调用方经常只带
                // 参数、正文是空的（酷狗的 everyday_recommend 就把参数全放在 query 里）。补一个
                // 0 长度 body，否则会直接抛 "method POST must have a request body"。
                RequestBody effectiveBody = body;
                if (effectiveBody == null && requiresRequestBody(requestMethod)) {
                    effectiveBody = RequestBody.create(null, new byte[0]);
                }
                builder.method(requestMethod, effectiveBody);
            }

            OkHttpClient requestClient = client;
            if ("manual".equals(redirect)) {
                requestClient = client.newBuilder()
                    .followRedirects(false)
                    .followSslRedirects(false)
                    .build();
            }
            // AI 请求可能远超默认的 45s 读超时，调用方可以按需放宽。
            Integer timeoutMs = call.getInt("timeoutMs");
            if (timeoutMs != null && timeoutMs > 0) {
                requestClient = requestClient.newBuilder()
                    .readTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                    .writeTimeout(timeoutMs, TimeUnit.MILLISECONDS)
                    .build();
            }

            requestClient=requestClient.newBuilder().callTimeout(Math.max(1,remainingMs),TimeUnit.MILLISECONDS).build();
            String requestUrl = url;
            okhttp3.Call network=requestClient.newCall(builder.build());
            job.network=network;
            if(job.cancelled){network.cancel();call.reject("网络请求已取消");return;}
            try (Response response = network.execute()) {
                // Preserve repeated headers (Set-Cookie) by handing JS an array
                // instead of an object, which would collapse duplicates.
                JSArray responseHeaders = new JSArray();
                for (String name : response.headers().names()) {
                    for (String value : response.headers().values(name)) {
                        JSObject headerEntry = new JSObject();
                        headerEntry.put("name", name);
                        headerEntry.put("value", value);
                        responseHeaders.put(headerEntry);
                    }
                }
                storeResponseCookies(requestUrl, response);
                ResponseBody responseBody = response.body();
                byte[] bytes = responseBody == null ? new byte[0] : responseBody.bytes();
                JSObject result = new JSObject();
                result.put("status", response.code());
                result.put("headers", responseHeaders);
                result.put("bodyBase64", Base64.encodeToString(bytes, Base64.NO_WRAP));
                call.resolve(result);
            }
        } catch (IOException | IllegalArgumentException error) {
            call.reject(error.getMessage(), error);
        }
    }

    private void storeResponseCookies(String requestUrl, Response response) {
        List<String> setCookies = response.headers().values("Set-Cookie");
        if (setCookies.isEmpty()) return;
        CookieManager manager = CookieManager.getInstance();
        boolean changed = false;
        for (String rawCookie : setCookies) {
            String cookie = normalizeCookieForUrl(requestUrl, rawCookie);
            if (cookie == null || cookie.isEmpty()) continue;
            manager.setCookie(requestUrl, cookie);
            changed = true;
        }
        if (changed) manager.flush();
    }

    // CookieManager ignores a Set-Cookie that has no Path/Domain even though
    // every real response carries them, but some providers omit Path entirely.
    private static String normalizeCookieForUrl(String requestUrl, String rawCookie) {
        if (rawCookie == null || rawCookie.isEmpty()) return null;
        boolean hasPath = false;
        for (String attribute : rawCookie.split(";")) {
            if (attribute.trim().toLowerCase().startsWith("path=")) {
                hasPath = true;
                break;
            }
        }
        if (hasPath) return rawCookie;
        return rawCookie + "; Path=/";
    }

    @PluginMethod
    public void scanLocalAudio(PluginCall call) {
        String alias = audioPermissionAlias();
        if (getPermissionState(alias) != PermissionState.GRANTED) {
            requestPermissionForAlias(alias, call, "audioPermissionCallback");
            return;
        }
        resolveLocalAudioScan(call);
    }

    /**
     * Android 13 起读音频用 READ_MEDIA_AUDIO，之前的版本用 READ_EXTERNAL_STORAGE。
     *
     * 这两个权限不能放在同一个别名里：被申请的那一个拿到授权后，另一个在系统看来仍是
     * 拒绝，而 Capacitor 对同一别名取「全部授权才算授权」，结果永远停在 PROMPT，
     * 扫描会被误判成「权限被拒」。所以按系统版本分开取别名。
     */
    private String audioPermissionAlias() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "audio" : "audioLegacy";
    }

    @PluginMethod
    public void pickAudioFiles(PluginCall call) {
        if (isAudioPickerOpen) {
            call.reject("Audio picker is already open");
            return;
        }
        // 用 Capacitor 自己的活动回调机制（@ActivityCallback + startActivityForResult），
        // 而不是在 load() 里直接 registerForActivityResult：后者依赖活动生命周期时序，
        // 在部分设备上会拿不到可用的启动器，表现就是「点了导入毫无反应」。
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType("audio/*")
            .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        isAudioPickerOpen = true;
        startActivityForResult(call, intent, "handlePickedAudio");
    }

    /** Compose actions do not carry browser user activation; open SAF directly. */
    @PluginMethod
    public void pickLxSourceFile(PluginCall call) {
        if (isSourcePickerOpen) { call.reject("文件选择器已打开"); return; }
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
            .setType("*/*").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        isSourcePickerOpen = true;
        try { startActivityForResult(call, intent, "handlePickedLxSource"); }
        catch (Exception error) { isSourcePickerOpen = false; call.reject("无法打开系统文件选择器", error); }
    }

    @ActivityCallback
    private void handlePickedLxSource(PluginCall call, ActivityResult result) {
        isSourcePickerOpen = false;
        if (call == null) return;
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            call.resolve(new JSObject().put("cancelled", true)); return;
        }
        new Thread(() -> {
            try {
                String name = queryDisplayName(getContext().getContentResolver(), uri);
                if (name == null || !name.toLowerCase(Locale.ROOT).endsWith(".js")) throw new IOException("请选择 .js 音源文件");
                try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
                    call.resolve(new JSObject().put("name", name).put("text", NativeTextDocument.read(input)));
                }
            } catch (Exception error) { call.reject(error.getMessage(), error); }
        }, "tingyu-source-import").start();
    }

    /** Native settings render React controls on Compose; route their file inputs through SAF. */
    @PluginMethod
    public void pickSettingsFiles(PluginCall call) {
        if (isSettingsFilePickerOpen) { call.reject("文件选择器已打开"); return; }
        String accept = call.getString("accept", "*/*");
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
            .setType("*/*").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        String[] mimeTypes = acceptedMimeTypes(accept);
        if (mimeTypes.length > 0) intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes);
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, Boolean.TRUE.equals(call.getBoolean("multiple", false)));
        isSettingsFilePickerOpen = true;
        try { startActivityForResult(call, intent, "handlePickedSettingsFiles"); }
        catch (Exception error) { isSettingsFilePickerOpen = false; call.reject("无法打开系统文件选择器", error); }
    }

    private static String[] acceptedMimeTypes(String accept) {
        if (accept == null || accept.trim().isEmpty() || accept.contains("*/*")) return new String[0];
        java.util.LinkedHashSet<String> types = new java.util.LinkedHashSet<>();
        for (String raw : accept.split(",")) {
            String value = raw.trim().toLowerCase(Locale.ROOT);
            if (value.isEmpty()) continue;
            if (value.startsWith(".") && value.length() > 1) {
                String extension = value.substring(1);
                String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
                if (mime == null) {
                    if (extension.equals("woff")) mime = "font/woff";
                    else if (extension.equals("woff2")) mime = "font/woff2";
                    else if (extension.equals("ttf")) mime = "font/ttf";
                    else if (extension.equals("otf")) mime = "font/otf";
                    else if (extension.equals("svg")) mime = "image/svg+xml";
                }
                if (mime != null) types.add(mime);
            } else if (value.contains("/")) types.add(value);
        }
        return types.toArray(new String[0]);
    }

    @ActivityCallback
    private void handlePickedSettingsFiles(PluginCall call, ActivityResult result) {
        isSettingsFilePickerOpen = false;
        if (call == null) return;
        Intent data = result.getData();
        ArrayList<Uri> uris = new ArrayList<>();
        if (result.getResultCode() == Activity.RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                for (int index = 0; index < data.getClipData().getItemCount(); index++) {
                    Uri uri = data.getClipData().getItemAt(index).getUri(); if (uri != null) uris.add(uri);
                }
            }
            if (uris.isEmpty() && data.getData() != null) uris.add(data.getData());
        }
        if (uris.isEmpty()) { call.resolve(new JSObject().put("cancelled", true).put("files", new JSArray())); return; }
        new Thread(() -> {
            ArrayList<String> created = new ArrayList<>();
            try {
                File directory = new File(getContext().getCacheDir(), "settings-picker");
                if (!directory.exists() && !directory.mkdirs()) throw new IOException("无法准备文件缓存目录");
                File[] oldFiles = directory.listFiles();
                if (oldFiles != null) for (File old : oldFiles) if (System.currentTimeMillis() - old.lastModified() > TimeUnit.DAYS.toMillis(1)) old.delete();
                JSArray files = new JSArray();
                ContentResolver resolver = getContext().getContentResolver();
                for (Uri uri : uris) {
                    String token = UUID.randomUUID().toString();
                    File target = new File(directory, token + ".picked");
                    try (InputStream input = resolver.openInputStream(uri); OutputStream output = new FileOutputStream(target)) {
                        if (input == null) throw new IOException("无法读取所选文件");
                        byte[] buffer = new byte[64 * 1024];
                        for (int count; (count = input.read(buffer)) != -1;) output.write(buffer, 0, count);
                    }
                    String name = queryDisplayName(resolver, uri);
                    if (name == null || name.trim().isEmpty()) name = "selected-file";
                    String mime = resolver.getType(uri);
                    if (mime == null) mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(
                        MimeTypeMap.getFileExtensionFromUrl(name).toLowerCase(Locale.ROOT));
                    if (mime == null) mime = "application/octet-stream";
                    try {
                        android.graphics.BitmapFactory.Options opts = new android.graphics.BitmapFactory.Options();
                        opts.inJustDecodeBounds = true;
                        android.graphics.BitmapFactory.decodeFile(target.getAbsolutePath(), opts);
                        if (opts.outWidth > 0 && opts.outHeight > 0) {
                            if (opts.outMimeType != null && !opts.outMimeType.isEmpty()) mime = opts.outMimeType;
                            boolean isHeic = "image/heic".equalsIgnoreCase(mime) || "image/heif".equalsIgnoreCase(mime);
                            boolean lacksExt = !name.matches("(?i).*\\.(png|jpg|jpeg|webp|gif|svg)$");
                            if (isHeic || lacksExt || "application/octet-stream".equals(mime)) {
                                android.graphics.Bitmap bmp = android.graphics.BitmapFactory.decodeFile(target.getAbsolutePath());
                                if (bmp != null) {
                                    File transTarget = new File(directory, token + ".jpg");
                                    try (OutputStream out = new FileOutputStream(transTarget)) {
                                        bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 92, out);
                                    }
                                    bmp.recycle();
                                    if (transTarget.exists() && transTarget.length() > 0) {
                                        target.delete();
                                        target = transTarget;
                                        mime = "image/jpeg";
                                        name = name.replaceAll("(?i)\\.[^.]+$", "") + ".jpg";
                                        if (name.isEmpty() || name.equals(".jpg")) name = "image.jpg";
                                    }
                                }
                            }
                        }
                    } catch (Throwable ignored) {}
                    pendingSettingsFiles.put(token, target); created.add(token);
                    files.put(new JSObject().put("id", token).put("name", name).put("mimeType", mime).put("size", target.length()));
                }
                call.resolve(new JSObject().put("cancelled", false).put("files", files));
            } catch (Exception error) {
                for (String token : created) { File file = pendingSettingsFiles.remove(token); if (file != null) file.delete(); }
                call.reject(error.getMessage() == null ? "读取所选文件失败" : error.getMessage(), error);
            }
        }, "tingyu-settings-file-picker").start();
    }

    /** Bounded chunk reads avoid allocating a second full base64 copy for large user files. */
    @PluginMethod
    public void readSettingsFileChunk(PluginCall call) {
        String token = call.getString("id", "");
        File file = pendingSettingsFiles.get(token);
        // JSON parses small JS integers (including the first chunk offset 0) as Integer.
        // Capacitor getLong only accepts Long and otherwise silently returns the default.
        Object rawOffset = call.getData().opt("offset");
        long offset = rawOffset instanceof Integer || rawOffset instanceof Long
            ? ((Number) rawOffset).longValue() : -1L;
        int requested = call.getInt("length", 0);
        if (file == null || !file.isFile() || offset < 0 || requested <= 0 || requested > 512 * 1024) {
            call.reject("文件读取请求无效"); return;
        }
        try (RandomAccessFile input = new RandomAccessFile(file, "r")) {
            if (offset > input.length()) { call.reject("文件读取位置无效"); return; }
            int count = (int)Math.min(requested, input.length() - offset);
            byte[] bytes = new byte[count]; input.seek(offset); input.readFully(bytes);
            call.resolve(new JSObject().put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP)).put("length", count));
        } catch (Exception error) { call.reject("读取所选文件失败", error); }
    }

    @PluginMethod
    public void releaseSettingsFiles(PluginCall call) {
        org.json.JSONArray ids = call.getData().optJSONArray("ids");
        if (ids != null) for (int index = 0; index < ids.length(); index++) {
            String token = ids.optString(index, ""); File file = pendingSettingsFiles.remove(token); if (file != null) file.delete();
        }
        call.resolve();
    }

    /** 选择整个文件夹；原生侧递归扫描其中的音频，用户可以一次导入整张专辑/目录。 */
    @PluginMethod
    public void pickAudioFolder(PluginCall call) {
        if (isAudioPickerOpen) {
            call.reject("Audio picker is already open");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        isAudioPickerOpen = true;
        startActivityForResult(call, intent, "handlePickedAudioFolder");
    }

    @PluginMethod
    public void preparePlaybackTestTone(PluginCall call){
        if(!BuildConfig.PLAYBACK_ENGINE_TEST){call.reject("Not a playback test build");return;}
        try{if(localAudioServer==null)localAudioServer=LocalAudioServer.shared(getContext());call.resolve(PlaybackTestTone.prepare(localAudioServer));}
        catch(Exception error){io.github.huleixin.tingyu.playback.PlaybackTestDiagnostics.error("test-tone-error",error);call.reject("生成测试音频失败",error);}
    }

    /** 供 WebView 重建导入音频的流地址（端口每次启动都可能不同）。 */
    @PluginMethod
    public void localAudioServerPort(PluginCall call) {
        try {
            if (localAudioServer == null) localAudioServer = LocalAudioServer.shared(getContext());
            int port = localAudioServer.start();
            JSObject result = new JSObject();
            result.put("port", port);
            call.resolve(result);
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    /** 自适应屏幕分辨率开关：关闭＝跟随系统原生布局，打开＝沉浸式全屏铺满。 */
    /** Wraps an issued Kuwo/Bodian audio URL behind the local Range-capable stream server. */
    @PluginMethod
    public void registerRemoteAudio(PluginCall call) {
        String url = call.getString("url", "");
        if (url == null || url.isEmpty()) {
            call.reject("Missing remote audio url");
            return;
        }
        try {
            if (localAudioServer == null) localAudioServer = LocalAudioServer.shared(getContext());
            String localUrl = Boolean.TRUE.equals(call.getBoolean("lxSource", false))
                ? localAudioServer.registerLxAudio(url) : localAudioServer.registerRemoteAudio(url);
            JSObject result = new JSObject();
            result.put("url", localUrl);
            call.resolve(result);
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    @PluginMethod
    public void getPlaybackDiagnostics(PluginCall call) {
        JSObject result = new JSObject();
        result.put("cover", playbackArtworkCover);
        result.put("status", playbackArtworkStatus);
        result.put("detail", playbackArtworkDetail);
        result.put("at", playbackArtworkAt);
        result.put("applied", playbackArtworkApplied);
        result.put("power", FoliaPlaybackService.getPowerDiagnostic());
        call.resolve(result);
    }

    @PluginMethod
    public void exitApp(PluginCall call) {
        Activity activity = getActivity();
        call.resolve();
        if (activity != null) {
            CrashDiagnostics.recordText(
                getContext(),
                "app-exit",
                "main",
                "js-exit-app",
                "JS back handler requested exit",
                "FoliaNativePlugin.exitApp"
            );
            activity.runOnUiThread(activity::finish);
        }
    }

    /**
     * 「返回键退到后台」：把任务移出前台，而不是结束 Activity。
     *
     * 结束 Activity 会连带收掉 WebView 与前台播放服务，用户看到的就是「退出应用就自动暂停播放」；
     * 而这个前台服务本来就是为了后台播放准备的（onTaskRemoved 只记诊断、不自停）。真正的退出
     * 交给系统（从最近任务划掉）或应用内的退出入口，它的 exitApp 仍然保留。
     */
    @PluginMethod
    public void moveTaskToBack(PluginCall call) {
        Activity activity = getActivity();
        call.resolve();
        if (activity != null) {
            CrashDiagnostics.recordText(
                getContext(),
                "activity-lifecycle",
                "main",
                "back-to-background",
                "JS back handler moved the task to the background",
                "FoliaNativePlugin.moveTaskToBack"
            );
            activity.runOnUiThread(() -> activity.moveTaskToBack(true));
        }
    }

    /**
     * 「导出诊断数据」：把报告写进缓存目录的 txt，再用 FileProvider 拉起系统分享面板。
     *
     * 报告正文由 WebView 侧生成后原样传入，这里只负责落盘和分享。文件名做白名单清洗，
     * 避免调用方传来的名字带路径分隔符或被 `..` 穿越到缓存目录之外。
     */
    @PluginMethod
    public void shareTextFile(PluginCall call) {
        String rawName = call.getString("filename", "folia-diagnostics.txt");
        String content = call.getString("content", "");
        String title = call.getString("title", "听屿 diagnostics");
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity is not available");
            return;
        }
        try {
            File directory = new File(getContext().getCacheDir(), "diagnostics");
            if (!directory.exists() && !directory.mkdirs()) {
                call.reject("Could not create diagnostics directory");
                return;
            }
            File target = new File(directory, sanitizeDiagnosticFileName(rawName));
            try (FileOutputStream output = new FileOutputStream(target)) {
                output.write(content.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            }
            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                target
            );
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_SUBJECT, title);
            send.setClipData(ClipData.newUri(getContext().getContentResolver(), target.getName(), uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, title);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(chooser);
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not share diagnostics: " + error.getMessage(), error);
        }
    }

    /** 「删除诊断」：清掉之前导出到缓存目录的诊断 txt，返回实际删除的文件数。 */
    @PluginMethod
    public void deleteDiagnosticFiles(PluginCall call) {
        int deleted = 0;
        File directory = new File(getContext().getCacheDir(), "diagnostics");
        File[] files = directory.listFiles();
        if (files != null) {
            for (File file : files) {
                if (file.isFile() && file.delete()) deleted++;
            }
        }
        JSObject result = new JSObject();
        result.put("deleted", deleted);
        call.resolve(result);
    }

    /** 只保留文件名，挡掉路径分隔符和 `..`，并保证以 .txt 结尾。 */
    private static String sanitizeDiagnosticFileName(String rawName) {
        String name = rawName == null ? "" : rawName.trim();
        name = name.replace('/', '_').replace('\\', '_');
        if (name.isEmpty() || name.contains("..")) name = "folia-diagnostics.txt";
        if (!name.toLowerCase(Locale.ROOT).endsWith(".txt")) name = name + ".txt";
        return name;
    }

    // ------------------------------------------------------------------ 统一诊断事件流

    /**
     * 前端批量上报事件（JSONL）。每行一条已经成型的 JSON，非法行由原生侧丢弃。
     * 高频调用是设计内的：前端按 1.5 秒 / 20 条一批推，原生只入队不落盘。
     */
    @PluginMethod
    public void diagnosticEvent(PluginCall call) {
        io.github.huleixin.tingyu.diagnostics.DiagnosticLog.install(getContext());
        io.github.huleixin.tingyu.diagnostics.DiagnosticLog.ingest(call.getString("lines", ""));
        call.resolve();
    }

    /**
     * 前端回报启动阶段（js-ready / startup-complete）。
     *
     * <p>为什么不让前端直接写 prefs：阶段必须和原生那条时间线在同一个文件、同一个会话里，
     * 否则崩溃后无法判断「WebView 起来了但 React 没起来」。
     */
    @PluginMethod
    public void startupStage(PluginCall call) {
        io.github.huleixin.tingyu.diagnostics.DiagnosticLog.install(getContext());
        String stage = call.getString("stage", "");
        if (stage == null || stage.isEmpty()) {
            call.reject("stage is required");
            return;
        }
        if (io.github.huleixin.tingyu.diagnostics.StartupGuard.STAGE_COMPLETE.equals(stage)) {
            io.github.huleixin.tingyu.diagnostics.StartupGuard.complete();
        } else {
            io.github.huleixin.tingyu.diagnostics.StartupGuard.stage(stage);
        }
        call.resolve();
    }

    /** 会话信息：前端拿 sessionId 对齐事件归属，预览页拿计数判断「有没有内容可导」。 */
    @PluginMethod
    public void diagnosticSession(PluginCall call) {
        io.github.huleixin.tingyu.diagnostics.DiagnosticLog.install(getContext());
        JSObject result = new JSObject();
        result.put("sessionId", io.github.huleixin.tingyu.diagnostics.DiagnosticLog.sessionId());
        result.put("startedAt", io.github.huleixin.tingyu.diagnostics.DiagnosticLog.sessionStartedAt());
        result.put("epoch", io.github.huleixin.tingyu.diagnostics.DiagnosticLog.epoch());
        result.put("events", io.github.huleixin.tingyu.diagnostics.DiagnosticLog.ring().size());
        result.put("bytes", io.github.huleixin.tingyu.diagnostics.DiagnosticLog.sessionFileBytes());
        result.put("zipBytes", io.github.huleixin.tingyu.diagnostics.DiagnosticPackage.totalBytes(getContext()));
        // 环境信息放在同一个调用里：前端只需要一次桥往返就能拼 metadata.json。
        result.put("buildId", BuildConfig.BUILD_ID);
        result.put("versionCode", BuildConfig.VERSION_CODE);
        result.put("manufacturer", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER);
        result.put("model", Build.MODEL == null ? "" : Build.MODEL);
        result.put("release", Build.VERSION.RELEASE == null ? "" : Build.VERSION.RELEASE);
        result.put("sdk", Build.VERSION.SDK_INT);
        try {
            android.content.pm.PackageInfo webViewPackage = android.webkit.WebView.getCurrentWebViewPackage();
            result.put("webview", webViewPackage == null ? ""
                : webViewPackage.packageName + "/" + webViewPackage.versionName);
        } catch (Exception ignored) {
            result.put("webview", "");
        }
        call.resolve(result);
    }

    /** Read the bounded previous/current event trail off the UI thread, only on feedback preview. */
    @PluginMethod
    public void cloudDiagnosticSnapshot(PluginCall call) {
        io.github.huleixin.tingyu.feedback.CloudDiagnosticSnapshot.read(getContext(),call);
    }

    /**
     * 生成诊断包并打开系统分享。所有内容由 WebView 侧组装后传入，这里只负责写 ZIP 与分享。
     *
     * <p>参数：metadata(object|string) / events / errors / performance / feedback / report /
     * screenshots(string[]，dataURL 或裸 base64) / title。
     */
    @PluginMethod
    public void exportDiagnosticPackage(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity is not available");
            return;
        }
        io.github.huleixin.tingyu.diagnostics.DiagnosticLog.install(getContext());
        try {
            org.json.JSONObject metadata = call.getObject("metadata");
            org.json.JSONArray screenshots = call.getArray("screenshots");
            String title = call.getString("title", "听屿 诊断包");
            // events 默认由原生拼：上一个会话（崩溃前）+ 本次会话内存环。前端已经通过
            // diagnosticEvent 把事件同步过来了，所以这里不需要前端再传一遍，避免重复。
            String events = call.getString("events", "");
            if (events == null || events.trim().isEmpty()) {
                String previous = io.github.huleixin.tingyu.diagnostics.DiagnosticLog
                    .previousSessionJsonl(200_000);
                String current = io.github.huleixin.tingyu.diagnostics.DiagnosticLog.snapshotJsonl();
                events = previous.isEmpty() ? current : (previous + "\n" + current);
            }
            org.json.JSONObject written = io.github.huleixin.tingyu.diagnostics.DiagnosticPackage.write(
                getContext(),
                metadata,
                events,
                call.getString("errors", ""),
                call.getString("performance", "{}"),
                call.getString("feedback", ""),
                call.getString("report", ""),
                screenshots
            );
            File file = new File(written.getString("path"));
            io.github.huleixin.tingyu.diagnostics.DiagnosticPackage.share(activity, file, title);
            call.resolve(new JSObject(written.toString()));
        } catch (Exception error) {
            call.reject("Could not write diagnostic package: " + error.getMessage(), error);
        }
    }

    /** 清空事件流与已导出的诊断包（「删除诊断」的完整版）。 */
    @PluginMethod
    public void clearDiagnosticData(PluginCall call) {
        io.github.huleixin.tingyu.diagnostics.DiagnosticLog.install(getContext());
        io.github.huleixin.tingyu.diagnostics.DiagnosticLog.clearAll();
        int deleted = io.github.huleixin.tingyu.diagnostics.DiagnosticPackage.deleteAll(getContext());
        JSObject result = new JSObject();
        result.put("deleted", deleted);
        call.resolve(result);
    }

    /** 记录一条原生侧事件（原生模块发现异常时调用，前端也能借此标注用户操作）。 */
    @PluginMethod
    public void recordDiagnosticEvent(PluginCall call) {
        io.github.huleixin.tingyu.diagnostics.DiagnosticLog.install(getContext());
        io.github.huleixin.tingyu.diagnostics.DiagnosticLog.event(
            call.getString("module", "ui"),
            call.getString("level", "info"),
            call.getString("event", "annotation"),
            call.getString("ref", null),
            call.getObject("fields")
        );
        call.resolve();
    }

    @PluginMethod
    public void getPhoneFitLayout(PluginCall call) {
        JSObject result = new JSObject();
        result.put("enabled", PhoneLayoutOrientation.isEnabled(getContext()));
        result.put("orientation", PhoneLayoutOrientation.getOrientation(getContext()));
        call.resolve(result);
    }

    /**
     * 屏幕常亮：直接操作窗口标志。
     *
     * 网页的 Screen Wake Lock 在页面隐藏时会被浏览器释放，而且要重新申请；窗口标志是系统级的，
     * 切页、锁屏前都有效，所以安卓这边以它为准（JS 侧在拿不到插件时才退回 Wake Lock）。
     */
    @PluginMethod
    public void setKeepScreenOn(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        Activity activity = getActivity();
        if (activity != null) {
            // 统一交给 NativeKeepScreenOn 裁决：全局开关与「极简歌词页常亮」共用同一个
            // FLAG_KEEP_SCREEN_ON，两处各写各的会互相抹掉（详见该类的注释）。
            NativeKeepScreenOn.INSTANCE.attach(activity);
            NativeKeepScreenOn.INSTANCE.setGlobal(enabled);
        }
        JSObject result = new JSObject();
        result.put("enabled", enabled);
        call.resolve(result);
    }

    @PluginMethod
    public void setPhoneFitLayout(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        String orientation = call.getString("orientation", PhoneLayoutOrientation.getOrientation(getContext()));
        PhoneLayoutOrientation.update(getContext(), enabled, orientation);
        Activity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(() -> {
                PhoneLayoutOrientation.apply(activity);
                // 挖孔适配跟手机适配开关无关，这里只是顺手在开关变化时再铺一次。
                PhoneFitCutout.apply(activity);
                WebView webView = getBridge() == null ? null : getBridge().getWebView();
                if (webView != null && AdaptiveLayout.isEnabled(getContext())) {
                    AdaptiveLayout.apply(activity, webView, true);
                }
            });
        }
        JSObject result = new JSObject();
        result.put("enabled", enabled);
        result.put("orientation", PhoneLayoutOrientation.getOrientation(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void setAdaptiveLayout(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        try {
            AdaptiveLayout.setEnabled(getContext(), enabled);
            Activity activity = getActivity();
            if (activity != null) {
                WebView webView = getBridge() == null ? null : getBridge().getWebView();
                // 系统栏显隐必须在主线程上做。
                activity.runOnUiThread(() -> AdaptiveLayout.apply(activity, webView, enabled));
            }
            JSObject result = new JSObject();
            result.put("enabled", enabled);
            call.resolve(result);
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    @PluginMethod
    public void getAdaptiveLayout(PluginCall call) {
        JSObject result = new JSObject();
        result.put("enabled", AdaptiveLayout.isEnabled(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void getDisplayCutout(PluginCall call) {
        try {
            call.resolve(JSObject.fromJSONObject(PhoneFitCutout.describe(getActivity())));
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    @PluginMethod
    public void getRearLyricsRuntimeState(PluginCall call) {
        // Hot-path polling must not assemble diagnostic traces or inspect Shizuku permissions.
        RearLyricsCoordinator coordinator = RearLyricsCoordinator.get(getContext());
        JSObject result = new JSObject();
        result.put("enabled", coordinator.isEnabled());
        result.put("starting", coordinator.isStarting());
        result.put("sleeping", coordinator.isSleeping());
        result.put("returnedToSystem", coordinator.returnedToSystem());
        result.put("userDismissed",coordinator.userDismissed());result.put("rendererFailed",coordinator.rendererFailed());
        result.put("hostConnected",RearHostBridge.connected());result.put("hostActive",RearHostBridge.active());result.put("hostDetail",RearHostBridge.detail());
        call.resolve(result);
    }

    /** 立即采一条「背屏故障诊断」快照；返回当前累积的全部条目。 */
    @PluginMethod
    public void captureRearFaultDiagnostics(PluginCall call) {
        RearFaultDiagnostics.captureNow(getContext(), "manual", null);
        JSObject result = new JSObject();
        result.put("count", RearFaultDiagnostics.count(getContext()));
        result.put("text", RearFaultDiagnostics.read(getContext()));
        result.put("lastWake", RearLyricsLauncher.lastWake());
        // A/B 路由：真机用同一份诊断对比「只置顶」与「1.3.39 迁移」哪条有效。
        result.put("lockedRoute", RearLaunchRoute.readMode(getContext()).value);
        result.put("lastLaunchRoute", RearLyricsLauncher.routeLabel());
        call.resolve(result);
    }

    /** 只清空故障诊断记录，不影响播放、背屏开关与任何用户数据。 */
    @PluginMethod
    public void clearRearFaultDiagnostics(PluginCall call) {
        RearFaultDiagnostics.clear(getContext());
        JSObject result = new JSObject();
        result.put("count", RearFaultDiagnostics.count(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void selectSongVisualizerMode(PluginCall call){
        try{
            String song=call.getString("songKey", ""), current=call.getString("current", "classic");
            JSONObject policy=call.getObject("policy");
            JSONObject nativeTrack=RearNativeTrack.snapshot();
            if("media3".equals(nativeTrack.optString("engine"))&&!nativeTrack.optString("songKey").isEmpty()&&!song.equals(nativeTrack.optString("songKey"))){call.reject("Song changed before style selection");return;}
            JSObject result=new JSObject();result.put("mode",RearRandomVisualizer.select(policy,song,current));call.resolve(result);
        }catch(Exception error){call.reject("Style selection unavailable",error);}
    }

    @PluginMethod
    public void setRearCardAod(PluginCall call){
        getContext().getSharedPreferences("rear-card",0).edit().putBoolean("aod",Boolean.TRUE.equals(call.getBoolean("enabled",true))).apply();
        RearHostUpdates.changed();call.resolve();
    }

    @PluginMethod
    public void setRearCardKeepAwake(PluginCall call){
        boolean enabled=Boolean.TRUE.equals(call.getBoolean("enabled",false));
        if(enabled&&(!LspRearBridge.selected(getContext())||LspRearBridge.get()==null)){
            LspRearBridge.request(getContext());
            if(!LspRearBridge.selected(getContext())){
                call.reject("请在设置中选择 LSP 模式");return;
            }
        }
        getContext().getSharedPreferences("rear-card",0).edit().putBoolean("keep-awake",enabled).apply();
        if(!enabled)RearCardKeepAwake.release();
        else RearLyricsCoordinator.get(getContext()).windowChanged();
        RearHostUpdates.changed();call.resolve();
    }

    @PluginMethod
    public void getRearLyricsStatus(PluginCall call) {
        JSObject result = new JSObject();
        if (LspRearBridge.selected(getContext())) LspRearBridge.request(getContext());
        result.put("backendMode", LspRearBridge.selected(getContext()) ? "lsp" : "shizuku");
        result.put("nativeCardKeepAwake",RearCardKeepAwake.requested(getContext()));
        result.put("nativeCardKeepAwakeAvailable",LspRearBridge.get()!=null);
        result.put("nativeCardKeepAwakeActive",RearCardKeepAwake.active());
        result.put("nativeCardKeepAwakeDetail",RearCardKeepAwake.detail());
        result.put("nativeCardAod",getContext().getSharedPreferences("rear-card",0).getBoolean("aod",true));
        result.put("displayImplementation",LspRearBridge.selected(getContext())?"NATIVE_CARD":"SHIZUKU_WINDOW");
        result.put("controlEngine", RearPlanA.engine(getContext()));
        result.put("lspConnected", LspRearBridge.get() != null || RearHostBridge.connected());
        result.put("lspDetail", RearHostBridge.detail()+"；"+LspRearBridge.detail());
        result.put("shizukuAvailable", Shizuku.pingBinder());
        result.put("authorized", Shizuku.pingBinder() && Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED);
        RearLyricsCoordinator coordinator = RearLyricsCoordinator.get(getContext());
        // A camera can power the panel off, which removes it from DisplayManager; the last known
        // id keeps the settings page usable and lets recovery wake it again.
        int rear = RearHostBridge.display()>0?RearHostBridge.display():RearLyricsCoordinator.rearDisplayForShell(getContext());
        result.put("rearDisplayId", rear);
        result.put("yieldingToCamera", RearLyricsActivity.isYieldingToCamera());
        // 「背屏故障诊断」：锁屏前后 0/5/60 秒的状态快照（JSON lines），以及最近一次背屏唤醒
        // 的完整结果（含执行后的真实面板状态）。两者都随「导出诊断数据」一起带走。
        result.put("faultLog", RearFaultDiagnostics.read(getContext()));
        result.put("faultCount", RearFaultDiagnostics.count(getContext()));
        result.put("lastWake", RearLyricsLauncher.lastWake());
        boolean active = rear >= 0 && (RearHostBridge.active() || RearLyricsActivity.isShowingOnDisplay(rear))
            && RearLyricsLauncher.displayState(getContext(), rear) == Display.STATE_ON;
        boolean starting = coordinator.isStarting();
        result.put("active", active);
        result.put("starting", starting);
        result.put("enabled", coordinator.isEnabled());
        result.put("returnedToSystem", coordinator.returnedToSystem());
        result.put("userDismissed",coordinator.userDismissed());result.put("rendererFailed",coordinator.rendererFailed());
        result.put("hostConnected",RearHostBridge.connected());result.put("hostActive",RearHostBridge.active());result.put("hostDetail",RearHostBridge.detail());
        // 宿主握手证据：没有这几项时，「hostConnected=false」只能靠猜。
        result.put("build", BuildConfig.BUILD_ID);
        result.put("handshakeSeen", RearHostBridge.handshakeSeen());
        result.put("hostStage", RearHostBridge.hostStage());
        result.put("hostProcess", RearHostBridge.hostProcess());
        result.put("hostBuild", RearHostBridge.hostBuild());
        result.put("hostPing", RearHostBridge.pingData());
        result.put("displayMode",RearHostBridge.hasSession()?"system-card":"independent");
        result.put("pauseReturnSeconds", RearPlaybackHandoff.PAUSE_DELAY_MS / 1000);
        result.put("coverSleepEnabled", coordinator.coverSleepEnabled());
        result.put("sleeping", coordinator.isSleeping());
        result.put("sleepUnsupported", coordinator.sleepUnsupported());
        result.put("sensorAvailable", coordinator.sensorAvailable());
        result.put("cameraSuspended", coordinator.cameraSuspended());
        result.put("sleepDiagnostics", coordinator.sleepDiagnostics());
        String message = RearLyricsLauncher.message(getContext());
        if (!active && !starting && coordinator.isEnabled() && (message.isEmpty() || message.startsWith("已确认背屏")))
            message = "背屏歌词已启用，播放音乐时自动显示；锁屏后按需恢复";
        if (coordinator.userDismissed())message="已退出本次背屏显示；开关已保留，可点击重新显示";
        if (coordinator.rendererFailed())message="背屏渲染恢复失败，已让回系统；可点击重新显示";
        if (coordinator.isEnabled() && coordinator.cameraSuspended()) message = "等待相机空闲／状态稳定，随后自动恢复背屏歌词";
        result.put("message", message);
        RearLyricsActivity.WindowState window = RearLyricsActivity.windowState();
        result.put("diagnostics", RearLyricsLauncher.diagnostics(getContext()) + "\nCurrent window: " + window
            + "\nCurrent rear power: " + RearLyricsLauncher.displayState(getContext(), rear)
            + "\nKeeper: " + coordinator.diagnostics()
            + "\n" + RearLyricsViewportMetrics.diagnostics()
            + "\nLock history:\n" + RearLyricsTrace.read(getContext())
            + "\nWindow event: " + getContext().getSharedPreferences("rear_lyrics", Context.MODE_PRIVATE).getString("last_window_event", ""));
        result.put("build", ShellUserService.VERSION);
        call.resolve(result);
    }

    @PluginMethod
    public void setRearCoverSleep(PluginCall call) {
        RearLyricsCoordinator.get(getContext()).setCoverSleep(Boolean.TRUE.equals(call.getBoolean("enabled")));
        call.resolve();
    }

    @PluginMethod
    public void setRearLyricsBackend(PluginCall call) {
        String mode = call.getString("mode");
        if (!"lsp".equals(mode) && !"shizuku".equals(mode)) { call.reject("未知背屏模式"); return; }
        RearLyricsCoordinator coordinator = RearLyricsCoordinator.get(getContext());
        if (!coordinator.canChangeBackend()) { call.reject("请先关闭背屏歌词，等待背屏电源恢复后再切换模式"); return; }
        getContext().getSharedPreferences("rear_lyrics", 0).edit().putString("backend", mode).apply();
        coordinator.backendChanged();
        if ("lsp".equals(mode)) LspRearBridge.request(getContext());
        call.resolve();
    }

    @PluginMethod
    public void setRearControlEngine(PluginCall call) {
        // One-tap rollback: both engines stay compiled in, only the command channel moves.
        String engine = call.getString("engine");
        if (!RearPlanA.ENGINE_PLAN_A.equals(engine) && !RearPlanA.ENGINE_LEGACY.equals(engine)) {
            call.reject("未知背屏控制引擎"); return;
        }
        RearLyricsCoordinator coordinator = RearLyricsCoordinator.get(getContext());
        if (!coordinator.canChangeBackend()) { call.reject("请先关闭背屏歌词，等待背屏电源恢复后再切换"); return; }
        RearPlanA.setEngine(getContext(), engine);
        coordinator.engineChanged();
        JSObject result = new JSObject();
        result.put("engine", RearPlanA.engine(getContext()));
        call.resolve(result);
    }

    /**
     * A/B：锁屏后的启动路线。
     *
     * <ul>
     *   <li>{@code auto}：看得见就复用，看不见就走 1.3.39 的迁移（默认）；</li>
     *   <li>{@code reuse}：只让已有任务回前台，永不迁移 —— 用来证明「A 单独确实不行」；</li>
     *   <li>{@code migrate}：无条件迁移 —— 用来单独验证迁移在当前固件是否还成立。</li>
     * </ul>
     * 只影响 Shizuku 后端；LSP 的路线判定一行都没改。
     */
    @PluginMethod
    public void setRearLockedRoute(PluginCall call) {
        String mode = call.getString("mode");
        RearLaunchRoute.Mode parsed = RearLaunchRoute.Mode.of(mode);
        if (mode == null || !parsed.value.equals(mode)) { call.reject("未知锁屏启动路线"); return; }
        RearLaunchRoute.writeMode(getContext(), parsed);
        JSObject result = new JSObject();
        result.put("lockedRoute", parsed.value);
        call.resolve(result);
    }

    @PluginMethod
    public void startRearLyrics(PluginCall call) {
        boolean lsp = LspRearBridge.selected(getContext());
        if (lsp) LspRearBridge.request(getContext());
        if (!lsp && !Shizuku.pingBinder()) {
            call.reject("请先启动 Shizuku，再回到听屿 重试");
            return;
        }
        if (!lsp && Shizuku.checkSelfPermission() != PackageManager.PERMISSION_GRANTED) {
            Shizuku.requestPermission(SHIZUKU_REQUEST_CODE);
            call.reject("已向 Shizuku 请求 听屿授权；授权后请再点一次");
            return;
        }
        int displayId = RearLyricsCoordinator.rearDisplayForShell(getContext());
        if (displayId < 0) {
            call.reject("未检测到小米背屏，请先在系统设置中开启背屏");
            return;
        }
        RearLyricsCoordinator.get(getContext()).enable(new RearLyricsLauncher.Callback() {
            @Override public void success(int rear, String message) {
                JSObject result = new JSObject(); result.put("verified", true);
                result.put("rearDisplayId", rear); result.put("message", message); call.resolve(result);
            }
            @Override public void failure(String message, Exception error) { call.reject(message, error); }
        });
    }

    @PluginMethod
    public void returnFromRearLyrics(PluginCall call) {
        RearLyricsCoordinator.get(getContext()).disable();
        call.resolve();
    }

    @PluginMethod
    public void publishRearLyricsSnapshot(PluginCall call) {
        RearLyricsState.update(call.getData());
        JSONObject clock = call.getData().optJSONObject("clock");
        if (clock != null) RearLyricsCoordinator.get(getContext()).playback("PLAYING".equals(clock.optString("playerState")));
        call.resolve();
    }

    @ActivityCallback
    private void handlePickedAudio(PluginCall call, ActivityResult activityResult) {
        isAudioPickerOpen = false;
        if (call == null) return;

        // -1 = RESULT_OK，0 = RESULT_CANCELED。区分「用户取消」和「选完了却没数据」，
        // 否则两种情况的返回值一模一样，只能靠猜。
        int resultCode = activityResult == null ? Activity.RESULT_CANCELED : activityResult.getResultCode();
        List<Uri> uris = new ArrayList<>();
        Intent data = activityResult == null ? null : activityResult.getData();
        if (data != null) {
            ClipData clipData = data.getClipData();
            if (clipData != null) {
                for (int index = 0; index < clipData.getItemCount(); index += 1) {
                    Uri uri = clipData.getItemAt(index).getUri();
                    if (uri != null) uris.add(uri);
                }
            } else if (data.getData() != null) {
                uris.add(data.getData());
            }
        }

        completePickedAudioImport(call, uris, resultCode);
    }

    @ActivityCallback
    private void handlePickedAudioFolder(PluginCall call, ActivityResult activityResult) {
        isAudioPickerOpen = false;
        if (call == null) return;
        int resultCode = activityResult == null ? Activity.RESULT_CANCELED : activityResult.getResultCode();
        List<Uri> uris = new ArrayList<>();
        Intent data = activityResult == null ? null : activityResult.getData();
        Uri treeUri = data == null ? null : data.getData();
        if (treeUri != null) {
            try {
                getContext().getContentResolver().takePersistableUriPermission(
                    treeUri,
                    data.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION
                );
            } catch (Exception ignored) {
                // Some providers do not offer persistable grants; the current grant is still usable.
            }
            new Thread(() -> {
                java.util.Map<String, String> folders = new java.util.HashMap<>();
                java.util.Map<String, Uri> lyrics = new java.util.HashMap<>();
                String rootId = DocumentsContract.getTreeDocumentId(treeUri);
                String rootName = queryDisplayName(getContext().getContentResolver(), DocumentsContract.buildDocumentUriUsingTree(treeUri, rootId));
                String rootPath = "导入文件夹/" + (rootName == null ? "文件夹" : rootName) + " [" + Integer.toHexString(treeUri.toString().hashCode()) + "]";
                collectAudioDocuments(treeUri, rootId, uris, folders, lyrics, rootPath);
                completePickedAudioImport(call, uris, resultCode, folders, lyrics);
            }, "tingyu-folder-scan").start();
            return;
        }
        completePickedAudioImport(call, uris, resultCode);
    }

    private void collectAudioDocuments(Uri treeUri, String parentDocumentId, List<Uri> output, java.util.Map<String, String> folders, java.util.Map<String, Uri> lyrics, String folderPath) {
        Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocumentId);
        String[] projection = new String[]{
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE
        };
        try (Cursor cursor = getContext().getContentResolver().query(childrenUri, projection, null, null, null)) {
            if (cursor == null) return;
            while (cursor.moveToNext()) {
                String documentId = cursor.getString(0);
                String displayName = cursor.getString(1);
                String mimeType = cursor.getString(2);
                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mimeType)) {
                    collectAudioDocuments(treeUri, documentId, output, folders, lyrics, folderPath + "/" + displayName);
                    continue;
                }
                if (isAudioDocument(displayName, mimeType)) {
                    Uri audioUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId);
                    output.add(audioUri);
                    folders.put(audioUri.toString(), folderPath);
                } else if (isLyricDocument(displayName)) {
                    // 外挂歌词先记下来：音频复制完之后按「同目录 + 同主名」配上去，
                    // 否则用户选了整个文件夹，歌进来了、歌词全丢了。
                    Uri lyricUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId);
                    lyrics.put(lyricKey(folderPath, displayName), lyricUri);
                }
            }
        } catch (Exception ignored) {
            // A provider can deny one subtree without invalidating the rest of the selection.
        }
    }

    private static boolean isLyricDocument(String displayName) {
        String lower = displayName == null ? "" : displayName.toLowerCase(Locale.ROOT);
        return lower.endsWith(".lrc");
    }

    private static String lyricKey(String folderPath, String fileName) {
        int dot = fileName == null ? -1 : fileName.lastIndexOf('.');
        String base = dot > 0 ? fileName.substring(0, dot) : fileName;
        return folderPath + "\u0000" + base;
    }

    private static boolean isAudioDocument(String displayName, String mimeType) {
        if (mimeType != null && mimeType.startsWith("audio/")) return true;
        String lower = displayName == null ? "" : displayName.toLowerCase(Locale.ROOT);
        return lower.endsWith(".mp3") || lower.endsWith(".flac") || lower.endsWith(".wav")
            || lower.endsWith(".m4a") || lower.endsWith(".aac") || lower.endsWith(".ogg")
            || lower.endsWith(".opus") || lower.endsWith(".ape") || lower.endsWith(".wma");
    }

    private void completePickedAudioImport(PluginCall call, List<Uri> uris, int resultCode) {
        completePickedAudioImport(call, uris, resultCode, java.util.Collections.emptyMap());
    }

    private void completePickedAudioImport(PluginCall call, List<Uri> uris, int resultCode, java.util.Map<String, String> folders) {
        completePickedAudioImport(call, uris, resultCode, folders, java.util.Collections.emptyMap());
    }

    private void completePickedAudioImport(PluginCall call, List<Uri> uris, int resultCode, java.util.Map<String, String> folders, java.util.Map<String, Uri> lyrics) {
        if (uris.isEmpty()) {
            JSObject result = new JSObject();
            result.put("tracks", new JSArray());
            result.put("cancelled", resultCode != Activity.RESULT_OK);
            result.put("picked", 0);
            result.put("resultCode", resultCode);
            if (resultCode == Activity.RESULT_OK) {
                result.put("error", "Picker returned RESULT_OK without a readable document uri");
            }
            call.resolve(result);
            return;
        }

        final Activity activity = getActivity();
        new Thread(() -> {
          try {
            if (localAudioServer == null) localAudioServer = LocalAudioServer.shared(getContext());
            int port = localAudioServer.start();
            File directory = localAudioServer.importedAudioDirectory();
            ContentResolver resolver = getContext().getContentResolver();
            JSArray tracks = new JSArray();
            JSArray failures = new JSArray();
            int copied = 0;

            for (Uri uri : uris) {
                try {
                    String displayName = queryDisplayName(resolver, uri);
                    long fileSize = queryFileSize(resolver, uri);
                    if (displayName == null || displayName.isEmpty()) displayName = "track-" + System.currentTimeMillis();
                    String safeName = "imported-" + stableFileId(displayName, fileSize, uri.toString());
                    File target = new File(directory, safeName);
                    if (!target.isFile() || target.length() != fileSize) {
                        try (InputStream source = resolver.openInputStream(uri);
                             OutputStream sink = new FileOutputStream(target)) {
                            if (source == null) continue;
                            byte[] buffer = new byte[128 * 1024];
                            int read;
                            while ((read = source.read(buffer)) != -1) {
                                sink.write(buffer, 0, read);
                            }
                        }
                    }

                    JSObject track = new JSObject();
                    track.put("id", safeName);
                    track.put("fileName", displayName);
                    String folderPath = folders.get(uri.toString());
                    track.put("folderPath", folderPath);
                    track.put("fileSize", target.length());
                    track.put("mimeType", LocalAudioServer.guessMimeType(safeName));
                    track.put("url", "http://127.0.0.1:" + port + "/audio/" + safeName);
                    // 同一个文件夹里同主名的 .lrc 一起收进来，存成 "<副本名>.lrc"，
                    // 播放时由 readLocalLyricSidecar 直接读得到，不依赖任何存储权限。
                    Uri lyricUri = folderPath == null ? null : lyrics.get(lyricKey(folderPath, displayName));
                    if (lyricUri != null) {
                        try (InputStream source = resolver.openInputStream(lyricUri);
                             OutputStream sink = new FileOutputStream(new File(directory, safeName + ".lrc"))) {
                            if (source != null) {
                                byte[] buffer = new byte[16 * 1024];
                                int read;
                                while ((read = source.read(buffer)) != -1) sink.write(buffer, 0, read);
                                track.put("hasSidecarLyric", true);
                            }
                        } catch (Exception ignored) {
                            // 歌词读不出来不影响音频本身。
                        }
                    }
                    tracks.put(track);
                    copied += 1;
                } catch (Exception error) {
                    // 单个文件读不了不该让整批失败，但必须把原因带回去，
                    // 否则界面只会「什么都没发生」。
                    JSObject failure = new JSObject();
                    failure.put("uri", String.valueOf(uri));
                    failure.put("message", error.getMessage() == null ? error.toString() : error.getMessage());
                    failures.put(failure);
                }
            }

            JSObject result = new JSObject();
            result.put("tracks", tracks);
            result.put("port", port);
            result.put("picked", uris.size());
            result.put("copied", copied);
            result.put("failures", failures);
            result.put("resultCode", resultCode);
            if (activity != null) activity.runOnUiThread(() -> call.resolve(result));
            else call.resolve(result);
          } catch (Exception error) {
            String message = error.getMessage() == null ? error.toString() : error.getMessage();
            if (activity != null) activity.runOnUiThread(() -> call.reject(message, error));
            else call.reject(message, error);
          }
        }, "folia-audio-import").start();
    }

    private static String stableFileId(String displayName, long fileSize, String sourceUri) {
        String candidate = displayName.replaceAll("[^A-Za-z0-9._-]", "_");
        if (candidate.length() > 60) {
            candidate = candidate.substring(candidate.length() - 60);
        }
        int dot = candidate.lastIndexOf('.');
        String base = dot > 0 ? candidate.substring(0, dot) : candidate;
        String extension = dot > 0 ? candidate.substring(dot) : "";
        String stamp = Integer.toHexString((sourceUri + ':' + displayName + ':' + fileSize).hashCode());
        String name = base + "-" + stamp + extension;
        return name;
    }

    private static String queryDisplayName(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) return cursor.getString(0);
        } catch (Exception ignored) {
        }
        String last = uri.getLastPathSegment();
        return last == null ? null : last.substring(last.lastIndexOf('/') + 1);
    }

    private static long queryFileSize(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[]{OpenableColumns.SIZE}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) return cursor.getLong(0);
        } catch (Exception ignored) {
        }
        return -1;
    }

    @PluginMethod
    public void updatePlaybackState(PluginCall call) {
        // Media-session notifications are exempt from POST_NOTIFICATIONS. Never delay metadata
        // behind a permission dialog, especially when background bridge calls cannot show one.
        applyPlaybackState(call);
    }

    private void applyPlaybackState(PluginCall call) {
        Intent intent = new Intent(getContext(), FoliaPlaybackService.class);
        intent.putExtra("title", call.getString("title", ""));
        intent.putExtra("artist", call.getString("artist", ""));
        intent.putExtra("album", call.getString("album", ""));
        intent.putExtra("coverUrl", call.getString("coverUrl", ""));
        intent.putExtra("songKey", call.getString("songKey", ""));
        intent.putExtra("playing", Boolean.TRUE.equals(call.getBoolean("playing", false)));
        Double position = call.getDouble("position");
        Double duration = call.getDouble("duration");
        intent.putExtra("position", position == null ? 0L : position.longValue());
        intent.putExtra("capturedAtMs", call.getData().optLong("capturedAtMs", System.currentTimeMillis()));
        intent.putExtra("duration", duration == null ? 0L : duration.longValue());
        ContextCompat.startForegroundService(getContext(), intent);
        call.resolve();
    }

    @PluginMethod
    public void clearPlaybackState(PluginCall call) {
        getContext().stopService(new Intent(getContext(), FoliaPlaybackService.class));
        call.resolve();
    }

    @PermissionCallback
    private void audioPermissionCallback(PluginCall call) {
        if (getPermissionState(audioPermissionAlias()) == PermissionState.GRANTED) {
            resolveLocalAudioScan(call);
        } else {
            call.reject("Audio permission denied");
        }
    }

    /**
     * 比 20 秒短的音频一律不当成音乐。
     *
     * 系统媒体库的 IS_MUSIC 标记并不可靠：铃声、通知音、录音、语音备忘常常带着它一起进来，
     * 用户扫描完看到曲库里混进一百条「录音 001」是很糟的体验。旧播放器用的是 30 秒，
     * 这里取 20 秒 —— 足够挡掉绝大多数提示音，又不会误伤真正的短曲（interlude、skit）。
     */
    private static final long MIN_MUSIC_DURATION_MS = 20_000L;

    /** 兜底扫描最多走这么多层目录，避免在异常目录结构上转不出来。 */
    private static final int FALLBACK_SCAN_MAX_DEPTH = 8;
    /** 兜底扫描最多收这么多首，防止把整个存储读一遍。 */
    private static final int FALLBACK_SCAN_MAX_FILES = 20_000;

    private void resolveLocalAudioScan(PluginCall call) {
        try {
            if (localAudioServer == null) {
                localAudioServer = LocalAudioServer.shared(getContext());
            }
            final int port = localAudioServer.start();
            final JSArray tracks = new JSArray();
            new Thread(() -> {
                try {
                    int mediaCount = collectMediaStoreTracks(tracks, port);
                    boolean allFiles = LocalAudioAccess.hasAllFilesAccess();
                    if (mediaCount == 0 && allFiles) {
                        // 媒体库一首都没有（有的 ROM 收录不全、或者刚恢复出厂），
                        // 已授权「所有文件访问」时直接按目录走文件系统兜底。
                        collectFileSystemTracks(tracks, port);
                    }
                    JSObject result = new JSObject();
                    result.put("tracks", tracks);
                    // 媒体库为空且没开「所有文件访问」：界面据此带用户去开一次，再重扫。
                    // 以前这个标记从来没人写过，JS 里整条兜底链路是死的。
                    result.put("needsAllFilesAccess", tracks.length() == 0 && !allFiles);
                    result.put("allFilesAccess", allFiles);
                    Activity activity = getActivity();
                    if (activity != null) activity.runOnUiThread(() -> call.resolve(result));
                    else call.resolve(result);
                } catch (Exception error) {
                    String message = error.getMessage() == null ? error.toString() : error.getMessage();
                    Activity activity = getActivity();
                    if (activity != null) activity.runOnUiThread(() -> call.reject(message, error));
                    else call.reject(message, error);
                }
            }, "tingyu-media-scan").start();
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    /** 读系统媒体库，返回收录到的条数（过滤后）。 */
    private int collectMediaStoreTracks(JSArray tracks, int port) {
        List<String> projection = new ArrayList<>();
        projection.add(MediaStore.Audio.Media._ID);
        projection.add(MediaStore.Audio.Media.DISPLAY_NAME);
        projection.add(MediaStore.Audio.Media.TITLE);
        projection.add(MediaStore.Audio.Media.ARTIST);
        projection.add(MediaStore.Audio.Media.ALBUM);
        projection.add(MediaStore.Audio.Media.DURATION);
        projection.add(MediaStore.Audio.Media.SIZE);
        projection.add(MediaStore.Audio.Media.MIME_TYPE);
        projection.add(MediaStore.Audio.Media.TRACK);
        projection.add(MediaStore.Audio.Media.DATE_MODIFIED);
        // 27 列里的 RELATIVE_PATH 从 29 才开始有，低版本退到 DATA。
        projection.add(Build.VERSION.SDK_INT >= 29 ? MediaStore.MediaColumns.RELATIVE_PATH : MediaStore.Audio.Media.DATA);
        projection.add(Build.VERSION.SDK_INT >= 29 ? MediaStore.MediaColumns.VOLUME_NAME : MediaStore.Audio.Media.DATA);
        if (Build.VERSION.SDK_INT >= 30) projection.add(MediaStore.Audio.Media.DISC_NUMBER);

        int count = 0;
        try (Cursor cursor = getContext().getContentResolver().query(
            MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
            projection.toArray(new String[0]),
            MediaStore.Audio.Media.IS_MUSIC + " != 0",
            null,
            MediaStore.Audio.Media.TITLE + " COLLATE NOCASE ASC"
        )) {
            if (cursor == null) return 0;
            // 全部用 getColumnIndex：某台设备的 ROM 少一列时只是那一个字段为空，
            // 不会像 getColumnIndexOrThrow 那样让整次扫描直接抛异常、一首歌都进不来。
            int idColumn = cursor.getColumnIndex(MediaStore.Audio.Media._ID);
            int nameColumn = cursor.getColumnIndex(MediaStore.Audio.Media.DISPLAY_NAME);
            int titleColumn = cursor.getColumnIndex(MediaStore.Audio.Media.TITLE);
            int artistColumn = cursor.getColumnIndex(MediaStore.Audio.Media.ARTIST);
            int albumColumn = cursor.getColumnIndex(MediaStore.Audio.Media.ALBUM);
            int durationColumn = cursor.getColumnIndex(MediaStore.Audio.Media.DURATION);
            int sizeColumn = cursor.getColumnIndex(MediaStore.Audio.Media.SIZE);
            int mimeColumn = cursor.getColumnIndex(MediaStore.Audio.Media.MIME_TYPE);
            int trackColumn = cursor.getColumnIndex(MediaStore.Audio.Media.TRACK);
            int modifiedColumn = cursor.getColumnIndex(MediaStore.Audio.Media.DATE_MODIFIED);
            int locationColumn = cursor.getColumnIndex(Build.VERSION.SDK_INT >= 29
                ? MediaStore.MediaColumns.RELATIVE_PATH : MediaStore.Audio.Media.DATA);
            int volumeColumn = cursor.getColumnIndex(Build.VERSION.SDK_INT >= 29
                ? MediaStore.MediaColumns.VOLUME_NAME : MediaStore.Audio.Media.DATA);
            int discColumn = Build.VERSION.SDK_INT >= 30 ? cursor.getColumnIndex(MediaStore.Audio.Media.DISC_NUMBER) : -1;
            if (idColumn < 0) return 0;

            while (cursor.moveToNext()) {
                try {
                    long duration = durationColumn < 0 ? 0 : cursor.getLong(durationColumn);
                    if (duration > 0 && duration < MIN_MUSIC_DURATION_MS) continue;
                    String location = locationColumn < 0 ? null : cursor.getString(locationColumn);
                    if (isToneDirectory(location)) continue;
                    long id = cursor.getLong(idColumn);
                    JSObject track = new JSObject();
                    track.put("id", String.valueOf(id));
                    track.put("source", "media");
                    String volume = volumeColumn < 0 || cursor.isNull(volumeColumn) ? "" : cursor.getString(volumeColumn);
                    track.put("folderPath", NativeAudioFolders.mediaFolder(location, volume, Build.VERSION.SDK_INT >= 29));
                    track.put("location", location);
                    track.put("fileName", nameColumn < 0 ? null : cursor.getString(nameColumn));
                    track.put("title", titleColumn < 0 ? null : cursor.getString(titleColumn));
                    track.put("artist", artistColumn < 0 ? null : cursor.getString(artistColumn));
                    track.put("album", albumColumn < 0 ? null : cursor.getString(albumColumn));
                    track.put("duration", duration);
                    track.put("fileSize", sizeColumn < 0 ? 0 : cursor.getLong(sizeColumn));
                    track.put("mimeType", mimeColumn < 0 ? null : cursor.getString(mimeColumn));
                    if (trackColumn >= 0 && !cursor.isNull(trackColumn)) {
                        // MediaStore 的 TRACK 把碟号塞在高位（disc * 1000 + track）。
                        int packed = cursor.getInt(trackColumn);
                        if (packed > 0) {
                            track.put("trackNumber", packed % 1000);
                            if (packed / 1000 > 0) track.put("discNumber", packed / 1000);
                        }
                    }
                    if (discColumn >= 0 && !cursor.isNull(discColumn)) track.put("discNumber", cursor.getInt(discColumn));
                    if (modifiedColumn >= 0 && !cursor.isNull(modifiedColumn)) {
                        track.put("dateModified", cursor.getLong(modifiedColumn) * 1000L);
                    }
                    track.put("url", "http://127.0.0.1:" + port + "/audio/" + id);
                    tracks.put(track);
                    count += 1;
                } catch (Exception ignored) {
                    // 单行读失败（坏文件、列类型异常）不该让整次扫描白跑。
                }
            }
        } catch (Exception ignored) {
            // 媒体库查询失败（权限刚被回收）时退回文件系统兜底，见调用方。
        }
        return count;
    }

    /** 铃声 / 通知音 / 闹钟目录里的一律不当音乐。 */
    private static boolean isToneDirectory(String location) {
        if (location == null) return false;
        String lower = location.replace('\\', '/').toLowerCase(Locale.ROOT);
        return lower.contains("/ringtones/") || lower.contains("/notifications/")
            || lower.contains("/alarms/") || lower.contains("/ui/");
    }

    /**
     * 文件系统兜底扫描：媒体库不认识的文件按目录直接找出来。
     *
     * 只在「媒体库一首都没有 + 已授予所有文件访问」时走，所以不需要为它再申请任何权限。
     * 产出 `file-<编码后绝对路径>` 这种 ref，交给 LocalAudioServer 的 file- 路由流式播放。
     */
    private void collectFileSystemTracks(JSArray tracks, int port) {
        File root = Environment.getExternalStorageDirectory();
        if (root == null || !root.isDirectory()) return;
        String[] standardDirs = {"Music", "Download", "Documents", "Podcasts", "Audiobooks", "Recorder", "netease", "kgmusic", "qqmusic"};
        List<File> queue = new ArrayList<>();
        for (String name : standardDirs) {
            File dir = new File(root, name);
            if (dir.isDirectory()) queue.add(dir);
        }
        int[] budget = {FALLBACK_SCAN_MAX_FILES};
        for (File dir : queue) collectAudioFiles(dir, 0, tracks, port, budget);
    }

    private void collectAudioFiles(File dir, int depth, JSArray tracks, int port, int[] budget) {
        if (dir == null || depth > FALLBACK_SCAN_MAX_DEPTH || budget[0] <= 0) return;
        File[] children;
        try {
            children = dir.listFiles();
        } catch (Exception error) {
            return;
        }
        if (children == null) return;
        for (File child : children) {
            if (budget[0] <= 0) return;
            String name = child.getName();
            if (name.startsWith(".")) continue;
            if (child.isDirectory()) {
                collectAudioFiles(child, depth + 1, tracks, port, budget);
                continue;
            }
            if (!LocalAudioServer.isAudioFileName(name)) continue;
            long size = child.length();
            if (size <= 0) continue;
            try {
                String path = child.getAbsolutePath();
                JSObject track = new JSObject();
                track.put("id", LocalAudioAccess.FILE_PREFIX + LocalAudioAccess.encodePath(path));
                track.put("source", "file");
                track.put("fileName", name);
                track.put("folderPath", dir.getAbsolutePath());
                track.put("location", dir.getAbsolutePath());
                track.put("fileSize", size);
                track.put("mimeType", LocalAudioServer.guessMimeType(name));
                track.put("dateModified", child.lastModified());
                track.put("url", "http://127.0.0.1:" + port + "/audio/" + track.getString("id"));
                tracks.put(track);
                budget[0] -= 1;
            } catch (Exception ignored) {
                // 单个文件读不了就跳过，不影响其余结果。
            }
        }
    }

    /**
     * 带用户去系统设置开「所有文件访问」，回来后把结果告诉 JS。
     *
     * 这是受限权限（特例权限），弹窗要不来，只能跳设置页让用户手动打开；
     * 没有它，媒体库漏收的文件就扫不出来，同名 .lrc 外挂歌词也读不到。
     * 用户直接返回没开时 resolve `{granted:false}`，不当成错误。
     */
    @PluginMethod
    public void requestAllFilesAccess(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            call.resolve(new JSObject().put("granted", true));
            return;
        }
        if (LocalAudioAccess.hasAllFilesAccess()) {
            call.resolve(new JSObject().put("granted", true));
            return;
        }
        try {
            Intent intent = new Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            startActivityForResult(call, intent, "handleAllFilesAccessResult");
        } catch (Exception error) {
            try {
                // 少数 ROM 没有带包名的那条，只能落到全局列表页。
                Intent fallback = new Intent(android.provider.Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                startActivityForResult(call, fallback, "handleAllFilesAccessResult");
            } catch (Exception ignored) {
                call.resolve(new JSObject().put("granted", false));
            }
        }
    }

    @ActivityCallback
    private void handleAllFilesAccessResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        // 从设置页回来不代表用户真的打开了开关，以系统状态为准。
        call.resolve(new JSObject().put("granted", LocalAudioAccess.hasAllFilesAccess()));
    }

    /** 音频还在不在、多大、什么类型。用来判断「文件被删了 / 权限被回收了」。 */
    @PluginMethod
    public void localAudioInfo(PluginCall call) {
        final String ref = call.getString("ref", "");
        new Thread(() -> {
            long length = LocalAudioAccess.length(getContext(), ref);
            JSObject result = new JSObject();
            result.put("exists", length > 0);
            result.put("length", Math.max(0, length));
            result.put("mimeType", LocalAudioAccess.mimeType(ref, call.getString("fileName")));
            result.put("allFilesAccess", LocalAudioAccess.hasAllFilesAccess());
            Activity activity = getActivity();
            if (activity != null) activity.runOnUiThread(() -> call.resolve(result));
            else call.resolve(result);
        }, "tingyu-audio-info").start();
    }

    /**
     * 只读音频前面（或中间）的一段字节，给 JS 侧的标签解析器用。
     *
     * 为什么需要它：安卓扫描进来的歌以前从不解析内嵌标签（封面、内嵌歌词、曲序全空），
     * 而唯一的取字节办法是 `fetch(整首).blob()` —— 一首 200MB 的 FLAC 为了抽 300KB 封面
     * 要先把 200MB 驻留进 WebView 内存。
     *
     * 标签（ID3v2 / FLAC 元数据块 / MP4 moov）基本都在文件头部，所以按需读前几 MB 就够；
     * JS 侧按 512KB → 4MB 逐级放大，只有真读不出才整首取。
     */
    @PluginMethod
    public void readLocalAudioBytes(PluginCall call) {
        final String ref = call.getString("ref", "");
        final long offset = Math.max(0, optLong(call, "offset", 0));
        // 单次上限 8MB：base64 过桥后约 11MB 字符串，再大就有 OOM 风险，收益也很低。
        final int length = (int) Math.min(Math.max(1, optLong(call, "length", 512 * 1024)), 8 * 1024 * 1024);
        new Thread(() -> {
            try (InputStream stream = LocalAudioAccess.open(getContext(), ref)) {
                skipExactly(stream, offset);
                byte[] buffer = new byte[length];
                int read = 0;
                while (read < length) {
                    int step = stream.read(buffer, read, length - read);
                    if (step <= 0) break;
                    read += step;
                }
                JSObject result = new JSObject();
                if (read <= 0) {
                    result.put("bytes", "");
                    result.put("read", 0);
                    result.put("total", Math.max(0, LocalAudioAccess.length(getContext(), ref)));
                } else {
                    result.put("bytes", Base64.encodeToString(
                        read == length ? buffer : java.util.Arrays.copyOf(buffer, read),
                        Base64.NO_WRAP
                    ));
                    result.put("read", read);
                    result.put("total", Math.max(0, LocalAudioAccess.length(getContext(), ref)));
                }
                Activity activity = getActivity();
                if (activity != null) activity.runOnUiThread(() -> call.resolve(result));
                else call.resolve(result);
            } catch (Exception error) {
                String message = error.getMessage() == null ? error.toString() : error.getMessage();
                Activity activity = getActivity();
                if (activity != null) activity.runOnUiThread(() -> call.reject(message, error));
                else call.reject(message, error);
            }
        }, "tingyu-audio-read").start();
    }

    private static long optLong(PluginCall call, String key, long fallback) {
        Long value = call.getLong(key);
        return value == null ? fallback : value;
    }

    /** InputStream.skip 会短跳，必须循环跳到位置，否则标签解析会从错误偏移开始读。 */
    private static void skipExactly(InputStream stream, long bytes) throws IOException {
        long remaining = bytes;
        while (remaining > 0) {
            long skipped = stream.skip(remaining);
            if (skipped <= 0) {
                if (stream.read() == -1) return;
                skipped = 1;
            }
            remaining -= skipped;
        }
    }

    /**
     * 用系统解码器抽内嵌封面。
     *
     * JS 侧的 music-metadata 已经能从 ID3v2 / FLAC / MP4 标签里取封面，这里只是兜底：
     * moov 落在文件尾部的 m4a、或者标签块超出我们读取窗口的文件，用 MediaMetadataRetriever
     * 一次拿全，省掉整首取回。
     */
    @PluginMethod
    public void readEmbeddedCover(PluginCall call) {
        final String ref = call.getString("ref", "");
        new Thread(() -> {
            android.media.MediaMetadataRetriever retriever = new android.media.MediaMetadataRetriever();
            try {
                if (LocalAudioAccess.isMediaStoreId(ref)) {
                    retriever.setDataSource(getContext(), Uri.withAppendedPath(
                        MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, ref));
                } else {
                    String path = LocalAudioAccess.absolutePath(getContext(), ref);
                    if (path == null) throw new IOException("audio path unavailable: " + ref);
                    retriever.setDataSource(path);
                }
                byte[] picture = retriever.getEmbeddedPicture();
                JSObject result = new JSObject();
                result.put("hasCover", picture != null && picture.length > 0);
                result.put("bytes", picture == null ? "" : Base64.encodeToString(picture, Base64.NO_WRAP));
                String duration = retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION);
                if (duration != null) result.put("duration", Long.parseLong(duration));
                Activity activity = getActivity();
                if (activity != null) activity.runOnUiThread(() -> call.resolve(result));
                else call.resolve(result);
            } catch (Exception error) {
                JSObject result = new JSObject();
                result.put("hasCover", false);
                result.put("bytes", "");
                result.put("error", error.getMessage() == null ? error.toString() : error.getMessage());
                Activity activity = getActivity();
                if (activity != null) activity.runOnUiThread(() -> call.resolve(result));
                else call.resolve(result);
            } finally {
                try { retriever.release(); } catch (Exception ignored) { }
            }
        }, "tingyu-audio-cover").start();
    }

    /**
     * 读与音频同名的外挂歌词（.lrc / .tlrc）。
     *
     * 优先级：导入时一起复制进来的副本（`<ref>.lrc`）> 磁盘上的同名兄弟文件。
     * 兄弟文件需要「所有文件访问」，没开时静默返回 null —— 界面按「没有外挂歌词」走，
     * 不弹任何提示，因为内嵌歌词与在线匹配都还在。
     */
    @PluginMethod
    public void readLocalLyricSidecar(PluginCall call) {
        final String ref = call.getString("ref", "");
        new Thread(() -> {
            JSObject result = new JSObject();
            try {
                File imported = LocalAudioAccess.importedFile(getContext(), ref);
                if (imported != null) {
                    File sidecar = new File(imported.getParentFile(), ref + ".lrc");
                    if (sidecar.isFile()) {
                        result.put("content", readTextFile(sidecar));
                        result.put("fileName", sidecar.getName());
                        result.put("origin", "imported");
                        resolveOnUi(call, result);
                        return;
                    }
                }
                if (!LocalAudioAccess.hasAllFilesAccess()) {
                    resolveOnUi(call, result);
                    return;
                }
                String path = LocalAudioAccess.absolutePath(getContext(), ref);
                if (path == null) {
                    resolveOnUi(call, result);
                    return;
                }
                File audio = new File(path);
                String base = audio.getName();
                int dot = base.lastIndexOf('.');
                if (dot > 0) base = base.substring(0, dot);
                File dir = audio.getParentFile();
                if (dir == null) {
                    resolveOnUi(call, result);
                    return;
                }
                for (String suffix : new String[]{".lrc", ".LRC", ".tlrc"}) {
                    File candidate = new File(dir, base + suffix);
                    if (!candidate.isFile()) continue;
                    result.put("content", readTextFile(candidate));
                    result.put("fileName", candidate.getName());
                    result.put("origin", suffix.equalsIgnoreCase(".tlrc") ? "translation" : "sidecar");
                    break;
                }
            } catch (Exception error) {
                result.put("error", error.getMessage() == null ? error.toString() : error.getMessage());
            }
            resolveOnUi(call, result);
        }, "tingyu-audio-lyric").start();
    }

    private void resolveOnUi(PluginCall call, JSObject result) {
        Activity activity = getActivity();
        if (activity != null) activity.runOnUiThread(() -> call.resolve(result));
        else call.resolve(result);
    }

    /** 歌词文件都不大（超过 2MB 的几乎不存在），按 UTF-8 读，编码修复交给 JS 侧。 */
    private static String readTextFile(File file) throws IOException {
        try (InputStream stream = new java.io.FileInputStream(file)) {
            java.io.ByteArrayOutputStream sink = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[64 * 1024];
            int read;
            int total = 0;
            while ((read = stream.read(buffer)) != -1) {
                total += read;
                if (total > 4 * 1024 * 1024) break;
                sink.write(buffer, 0, read);
            }
            return sink.toString("UTF-8");
        }
    }

    /**
     * 把一首歌复制一份进 App 私有目录，返回新的 `imported-` ref。
     *
     * 只在该首歌真的播不出来时调（原文件被搬走、媒体库没刷新、某个 ROM 不给读），
     * 复制之后播放只认 App 自己的副本，和 MediaStore 与权限彻底脱钩 —— 用户不需要
     * 重新导入整个文件夹。
     */
    @PluginMethod
    public void copyLocalAudio(PluginCall call) {
        final String ref = call.getString("ref", "");
        final String fileName = call.getString("fileName", "");
        new Thread(() -> {
            JSObject result = new JSObject();
            try {
                if (localAudioServer == null) localAudioServer = LocalAudioServer.shared(getContext());
                File directory = localAudioServer.importedAudioDirectory();
                long knownSize = optLong(call, "fileSize", 0);
                String displayName = fileName == null || fileName.isEmpty() ? ref : fileName;
                String safeName = "imported-" + stableFileId(displayName, knownSize, ref);
                File target = new File(directory, safeName);
                if (!target.isFile() || target.length() <= 0) {
                    try (InputStream source = LocalAudioAccess.open(getContext(), ref);
                         OutputStream sink = new FileOutputStream(target)) {
                        byte[] buffer = new byte[128 * 1024];
                        int read;
                        while ((read = source.read(buffer)) != -1) {
                            sink.write(buffer, 0, read);
                        }
                    }
                }
                if (target.length() <= 0) {
                    result.put("copied", false);
                    result.put("error", "copied file is empty");
                } else {
                    // 同目录如果有 .lrc，一并复制，避免「复制后歌词反而丢了」。
                    copyLyricSidecar(ref, target);
                    result.put("copied", true);
                    result.put("ref", safeName);
                    result.put("fileSize", target.length());
                }
            } catch (Exception error) {
                result.put("copied", false);
                result.put("error", error.getMessage() == null ? error.toString() : error.getMessage());
            }
            resolveOnUi(call, result);
        }, "tingyu-audio-copy").start();
    }

    private void copyLyricSidecar(String ref, File audioTarget) {
        try {
            String path = LocalAudioAccess.absolutePath(getContext(), ref);
            if (path == null) return;
            File audio = new File(path);
            String base = audio.getName();
            int dot = base.lastIndexOf('.');
            if (dot > 0) base = base.substring(0, dot);
            File dir = audio.getParentFile();
            if (dir == null) return;
            for (String suffix : new String[]{".lrc", ".LRC"}) {
                File candidate = new File(dir, base + suffix);
                if (!candidate.isFile()) continue;
                File sidecar = new File(audioTarget.getParentFile(), audioTarget.getName() + ".lrc");
                try (InputStream source = new java.io.FileInputStream(candidate);
                     OutputStream sink = new FileOutputStream(sidecar)) {
                    byte[] buffer = new byte[16 * 1024];
                    int read;
                    while ((read = source.read(buffer)) != -1) sink.write(buffer, 0, read);
                }
                return;
            }
        } catch (Exception ignored) {
            // 歌词复制失败不影响音频可用性。
        }
    }

    /**
     * 删除「导入文件夹」时复制进私有目录的音频副本。
     *
     * 只删 App 自己的副本，绝不碰用户的原文件；扫描设备音乐库（MediaStore）得到的歌不在
     * 这里删除，它们只是引用，用户的原文件必须保留。
     */
    /** Returns the bounded native crash trail for the settings diagnostics report. */
    @PluginMethod
    public void getCrashDiagnostics(PluginCall call) {
        CrashDiagnostics.collectHistoricalExits(getContext());
        JSObject result = new JSObject();
        result.put("history", CrashDiagnostics.read(getContext()));
        result.put("heartbeat", CrashDiagnostics.readHeartbeat(getContext()));
        result.put("previousHeartbeat", CrashDiagnostics.readPreviousHeartbeat(getContext()));
        result.put("serviceHeartbeat", CrashDiagnostics.readServiceHeartbeat(getContext()));
        result.put("previousServiceHeartbeat", CrashDiagnostics.readPreviousServiceHeartbeat(getContext()));
        call.resolve(result);
    }

    /** Small 10-second breadcrumb: what was on screen and playing before an abrupt process death. */
    @PluginMethod
    public void recordPlaybackHeartbeat(PluginCall call) {
        try {
            JSObject payload = new JSObject();
            payload.put("at", System.currentTimeMillis());
            payload.put("visualizer", call.getString("visualizer", "unknown"));
            payload.put("background", call.getString("background", "unknown"));
            payload.put("playing", call.getBoolean("playing", false));
            payload.put("visibility", call.getString("visibility", "unknown"));
            Activity activity = getActivity();
            payload.put(
                "foreground",
                activity != null && !activity.isFinishing() && activity.hasWindowFocus()
            );
            PowerManager powerManager = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            payload.put("screenOn", powerManager != null && powerManager.isInteractive());
            CrashDiagnostics.recordHeartbeat(getContext(), payload.toString());
            call.resolve();
        } catch (Exception error) {
            call.reject("Failed to record playback heartbeat", error);
        }
    }

    /** Clears only the crash trail; normal app data and sessions are untouched. */
    @PluginMethod
    public void clearCrashDiagnostics(PluginCall call) {
        CrashDiagnostics.clear(getContext());
        call.resolve();
    }

    /** Stores a WebView error next to native crashes so the next diagnostic copy includes it. */
    @PluginMethod
    public void recordRuntimeDiagnostic(PluginCall call) {
        CrashDiagnostics.recordText(
            getContext(),
            call.getString("source", "webview"),
            call.getString("thread", "webview"),
            call.getString("type", "error"),
            call.getString("message", ""),
            call.getString("stack", "")
        );
        call.resolve();
    }

    @PluginMethod
    public void deleteImportedAudio(PluginCall call) {
        JSArray refs = call.getArray("refs", new JSArray());
        JSArray deleted = new JSArray();
        JSArray failed = new JSArray();
        try {
            if (localAudioServer == null) localAudioServer = LocalAudioServer.shared(getContext());
            File directory = localAudioServer.importedAudioDirectory();
            for (int index = 0; index < refs.length(); index += 1) {
                String ref = refs.getString(index);
                File target = resolveImportedFile(directory, ref);
                if (target == null) {
                    failed.put(ref);
                    continue;
                }
                // 已经不在了也算成功，重复删除不该被当成错误。
                if (!target.exists() || target.delete()) {
                    // 一起复制进来的外挂歌词副本也删掉，否则会一直占着空间没人引用。
                    File sidecar = new File(directory, ref + ".lrc");
                    if (sidecar.isFile()) sidecar.delete();
                    deleted.put(ref);
                } else {
                    failed.put(ref);
                }
            }
            JSObject result = new JSObject();
            result.put("deleted", deleted);
            result.put("failed", failed);
            call.resolve(result);
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    /** 只接受 App 自己写出的 imported-* 文件名，挡掉任何路径穿越。 */
    private static File resolveImportedFile(File directory, String ref) {
        if (ref == null || !ref.startsWith("imported-")) return null;
        if (ref.contains("/") || ref.contains("\\") || ref.contains("..")) return null;
        return new File(directory, ref);
    }

    /** 与 OkHttp 的 HttpMethod.requiresRequestBody 同一份判定：这几个方法必须有请求体。 */
    private static boolean requiresRequestBody(String method) {
        if (method == null) return false;
        return "POST".equalsIgnoreCase(method)
            || "PUT".equalsIgnoreCase(method)
            || "PATCH".equalsIgnoreCase(method)
            || "PROPPATCH".equalsIgnoreCase(method)
            || "REPORT".equalsIgnoreCase(method);
    }

    private List<JSObject> parseCookieHeader(String header, String domain) {
        List<JSObject> cookies = new ArrayList<>();
        if (header == null || header.isEmpty()) return cookies;
        String[] pairs = header.split(";");
        for (String pair : pairs) {
            int separator = pair.indexOf('=');
            if (separator <= 0) continue;
            String name = pair.substring(0, separator).trim();
            String value = pair.substring(separator + 1).trim();
            if (name.isEmpty()) continue;
            JSObject cookie = new JSObject();
            cookie.put("name", name);
            cookie.put("value", value);
            cookie.put("domain", domain == null ? "" : domain);
            cookie.put("path", "/");
            cookie.put("secure", true);
            cookie.put("httpOnly", false);
            cookies.add(cookie);
        }
        return cookies;
    }
}
