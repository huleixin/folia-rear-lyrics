package io.github.huleixin.tingyu;

import android.graphics.Point;
import android.graphics.Rect;
import android.net.Uri;
import android.view.Display;
import android.webkit.WebView;
import android.widget.FrameLayout;
import org.json.JSONObject;

/** UI-thread measurement, immutable read-only snapshots for the WebView's background asset loader. */
final class RearLyricsViewportMetrics {
    private static volatile String nativeSnapshot = "{}", browserSnapshot = "";
    static void reset() { nativeSnapshot = "{}"; browserSnapshot = ""; }
    static String snapshot() { return nativeSnapshot; }
    static String diagnostics() { return "Native viewport: " + nativeSnapshot + "\nBrowser viewport: " + browserSnapshot; }

    static void fit(FrameLayout root, WebView renderer) {
        Display display = root.getDisplay();
        if (display == null || root.getWidth() <= 0 || root.getHeight() <= 0) return;
        Point size = new Point(); display.getRealSize(size);
        int[] location = new int[2]; root.getLocationOnScreen(location);
        int[] bounds = RearLyricsViewportGeometry.fit(root.getWidth(), root.getHeight(), location[0], location[1], size.x, size.y);
        FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) renderer.getLayoutParams();
        if (params.width != bounds[2] || params.height != bounds[3] || params.leftMargin != bounds[0] || params.topMargin != bounds[1]) {
            params.width = bounds[2]; params.height = bounds[3]; params.leftMargin = bounds[0]; params.topMargin = bounds[1];
            renderer.setLayoutParams(params);
        }
    }
    static void capture(WebView renderer) {
        Display display = renderer.getDisplay();
        if (display == null || renderer.getWidth() <= 0 || renderer.getHeight() <= 0) return;
        Point size = new Point(); display.getRealSize(size);
        int[] location = new int[2]; renderer.getLocationOnScreen(location);
        Rect visible = new Rect();
        if (!renderer.getLocalVisibleRect(visible)) return;
        if (!visible.intersect(-location[0], -location[1], size.x - location[0], size.y - location[1])) return;
        try {
            JSONObject value = new JSONObject();
            value.put("width", renderer.getWidth()); value.put("height", renderer.getHeight());
            value.put("visibleLeft", visible.left); value.put("visibleTop", visible.top);
            value.put("visibleWidth", visible.width()); value.put("visibleHeight", visible.height());
            value.put("displayWidth", size.x); value.put("displayHeight", size.y);
            value.put("density", renderer.getResources().getDisplayMetrics().density);
            nativeSnapshot = value.toString();
        } catch (Exception ignored) { }
    }
    static void reportBrowser(Uri uri) {
        StringBuilder report = new StringBuilder();
        for (String key : new String[] { "layoutWidth", "layoutHeight", "visualWidth", "visualHeight", "dpr", "left", "top", "width", "height" }) {
            try {
                double value = Double.parseDouble(uri.getQueryParameter(key));
                if (Double.isFinite(value) && value >= 0 && value <= 100000) report.append(key).append('=').append(value).append(' ');
            } catch (Exception ignored) { }
        }
        browserSnapshot = report.toString();
    }
}
