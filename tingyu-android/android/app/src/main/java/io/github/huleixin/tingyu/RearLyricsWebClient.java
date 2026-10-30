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
        if ("/__folia_rear/trace".equals(path)) {
            String event = uri.getQueryParameter("event");
            if (event != null) {
                String detail = uri.getQueryParameter("detail");
                RearLyricsTrace.record(context, "rear/" + event, detail == null ? "" : detail);
            }
            return text("application/json", "{}");
        }
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
