package io.github.huleixin.tingyu;

import android.content.Context;
import android.net.Uri;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

/** Serves the packaged renderer and a same-origin read-only state endpoint; no privileged JS interface. */
final class RearLyricsWebClient extends WebViewClient {
    interface Events { void ready(); void error(String message); void rendererGone(); }
    private final Context context;
    private final Events events;
    private long lastControl;
    RearLyricsWebClient(Context context, Events events) { this.context = context; this.events = events; }

    @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        android.webkit.WebResourceResponse artwork = "GET".equals(request.getMethod())
            ? io.github.huleixin.tingyu.playback.SharedArtworkAccess.intercept(context, request.getUrl().toString()) : null;
        if (artwork != null) return artwork;
        Uri uri = request.getUrl();
        if (!"https".equals(uri.getScheme()) || !"rear.folia.local".equals(uri.getHost())) return null;
        String path = uri.getPath();
        if ("/__folia_rear/control".equals(path)) {
            if (!"POST".equals(request.getMethod())) return missing();
            String action = uri.getQueryParameter("action");
            if (!"previous".equals(action) && !"play".equals(action) && !"pause".equals(action) && !"next".equals(action)) return missing();
            synchronized (this) {
                long now = android.os.SystemClock.elapsedRealtime();
                if (now - lastControl < 250) return text("application/json", "{}");
                lastControl = now;
            }
            FoliaNativePlugin.emitMediaAction(action);
            return text("application/json", "{}");
        }
        // The main Capacitor document owns a service worker. Never let its cache handle this surface's state.
        if ("/registerSW.js".equals(path)) return text("application/javascript", "/* Rear surface uses packaged assets without a service worker. */");
        if ("/__folia_rear/state".equals(path)) {
            int revision = -1;
            try { revision = Integer.parseInt(uri.getQueryParameter("revision")); } catch (Exception ignored) { }
            // 端到端账本：这次轮询本身就是「背屏渲染端活着」的证据（页面冻结时轮询停）。
            // 归因靠它区分「显示端生命周期暂停」与「页面活着却不推进」—— 后者才是故障。
            io.github.huleixin.tingyu.playback.LyricSyncLedger.get()
                .rearHeartbeat(android.os.SystemClock.elapsedRealtime());
            return text("application/json", RearLyricsState.snapshot(revision));
        }
        // The current song's lyrics straight from the native cache. The foreground WebView used
        // to be the only source, which is why the rear kept the previous song once that WebView
        // was frozen; this endpoint answers even when nothing else in the app is running.
        if ("/__folia_rear/lyrics".equals(path)) {
            return text("application/json", RearNativeLyricLines.json(context,
                uri.getQueryParameter("key"), uri.getQueryParameter("epoch")));
        }
        // The rear renderer reporting what it actually drew. Same file as the native events, so a
        // stuck lyric can be read as one timeline instead of two stories that disagree.
        if ("/__folia_rear/trace".equals(path)) { recordTrace(context,uri);return text("application/json","{}"); }
        if ("/__folia_rear/ready".equals(path)) { view.post(events::ready); return text("application/json", "{}"); }
        if ("/__folia_rear/viewport".equals(path)) return text("application/json", RearLyricsViewportMetrics.snapshot());
        if ("/__folia_rear/viewport-report".equals(path)) {
            RearLyricsViewportMetrics.reportBrowser(uri); return text("application/json", "{}");
        }
        if (path == null || path.contains("..") || path.contains("\\")) return missing();
        try {
            String assetPath = "/".equals(path) ? "/rear-lyrics.html" : path;
            InputStream stream = context.getAssets().open("public" + assetPath);
            return response(mime(assetPath), stream);
        } catch (Exception error) { return missing(); }
    }
    @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        // A tap on the lyrics must never navigate the dedicated window away from its renderer.
        return request.isForMainFrame();
    }
    @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        if (request.isForMainFrame()) events.error("WebView: " + error.getDescription());
    }
    @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
        events.error("Rear renderer ended; crashed=" + detail.didCrash());
        view.post(events::rendererGone);
        return true;
    }
    static void recordTrace(Context context,Uri uri) {
            String event = uri.getQueryParameter("event");
            if (event != null) {
                String detail = uri.getQueryParameter("detail");
                RearLyricsTrace.record(context, "rear/" + event, detail == null ? "" : detail);
                // 端到端同步账本：渲染端自己上报「这一版真的画出来了」。
                // 没有这一条，背屏停更只能归因到「没交付」，无法区分是交付断了还是渲染停了。
                if("clock".equals(event))io.github.huleixin.tingyu.playback.LyricSyncLedger.get().clockSource(detail!=null&&detail.contains("source=native")?"media3":"webview");
                if ("lyric-applied".equals(event) || "render".equals(event)) {
                    // 心跳上报带 pos=…，可推出渲染推进到哪一行；解析不出就是 -1。
                    long appliedPos = -1L;
                    String detailValue = uri.getQueryParameter("detail");
                    if (detailValue != null) {
                        java.util.regex.Matcher matcher = java.util.regex.Pattern
                            .compile("pos=(-?\\d+)").matcher(detailValue);
                        if (matcher.find()) {
                            try { appliedPos = Long.parseLong(matcher.group(1)); } catch (Exception ignored) { }
                        }
                    }
                    io.github.huleixin.tingyu.playback.LyricSyncLedger.get()
                        .rearAppliedAt(uri.getQueryParameter("song"),
                            uri.getQueryParameter("epoch"), appliedPos, android.os.SystemClock.elapsedRealtime());
                }
                // 背屏自己的电源状态（息屏/唤醒）：归因时区分「挂起（正常）」与「失联」。
                if ("surface-power".equals(event)) {
                    String detailValue = uri.getQueryParameter("detail");
                    io.github.huleixin.tingyu.playback.LyricSyncLedger.get()
                        .rearSleeping(detailValue != null && detailValue.contains("sleeping=true"),
                            android.os.SystemClock.elapsedRealtime());
                }
            }
    }
    private static WebResourceResponse response(String mime, InputStream stream) {
        return new WebResourceResponse(mime, "UTF-8", 200, "OK", Collections.singletonMap("Cache-Control", "no-store"), stream);
    }
    private static WebResourceResponse text(String mime, String value) {
        return response(mime, new ByteArrayInputStream(value.getBytes(StandardCharsets.UTF_8)));
    }
    private static WebResourceResponse missing() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }
    private static String mime(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js") || path.endsWith(".mjs")) return "application/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".wasm")) return "application/wasm";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".woff2")) return "font/woff2";
        if (path.endsWith(".woff")) return "font/woff";
        if (path.endsWith(".ttf")) return "font/ttf";
        String guessed = java.net.URLConnection.guessContentTypeFromName(path);
        return guessed == null ? "application/octet-stream" : guessed;
    }
}
