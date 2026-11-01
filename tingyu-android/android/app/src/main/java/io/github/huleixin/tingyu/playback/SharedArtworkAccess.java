package io.github.huleixin.tingyu.playback;

import android.content.Context;
import android.net.Uri;
import android.webkit.WebResourceResponse;
import java.io.File;
import java.io.FileInputStream;
import java.io.ByteArrayInputStream;
import java.util.HashMap;
import java.util.Map;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/SharedArtworkAccess.java
/** Public CDN images only. No path argument, cookies, file access or arbitrary network proxy. */
public final class SharedArtworkAccess {
    public static boolean imageRequestUrl(String url) {
        try {
            java.net.URI uri = java.net.URI.create(url);
            return ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) && uri.getHost()!=null;
        }catch(RuntimeException invalid){return false;}
    }
    public static WebResourceResponse intercept(Context context, String url) {
        if (!imageRequestUrl(url)) return null;
        NativeArtworkRepository repository=NativeArtworkRepository.get(context);
        File cached=repository.cachedFile(url);
        // Unknown hosts are served only when a typed image reader has already cached that URL.
        // Never turn arbitrary WebView GETs (login, QR, API) into image downloads.
        if (!ResourceCachePolicy.sharedArtworkUrl(url) && cached==null) return null;
        try {
            File f = cached!=null?cached:repository.ensureFile(url);
            Map<String,String> headers = new HashMap<>();
            headers.put("Access-Control-Allow-Origin", "*");
            headers.put("Cache-Control", "public,max-age=86400");
            return new WebResourceResponse("image/jpeg", null, 200, "OK", headers, new FileInputStream(f));
        } catch (Exception error) {
            return new WebResourceResponse("image/jpeg", null, 503, "Unavailable",
                java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
        }
    }
    public static Uri contentUri(Context context, String url) {
        return new Uri.Builder().scheme("content").authority(context.getPackageName()+".artwork")
            .appendPath("cover").appendQueryParameter("url", url).build();
    }
}
