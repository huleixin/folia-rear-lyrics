package io.github.huleixin.tingyu.glass;

import android.os.Build;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.FrameLayout;
import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import eightbitlab.com.blurview.BlurTarget;
import eightbitlab.com.blurview.BlurView;

// android/app/src/main/java/io/github/huleixin/tingyu/glass/GlassNavController.java
// Native sibling above a hardware-recorded WebView. Never capture/read pixels back to the CPU.
final class GlassNavController {
    private final WebView web;
    private final XiaomiGlass xiaomi;
    private final java.util.function.IntConsumer navigate;
    private ViewGroup originalParent;
    private ViewGroup.LayoutParams originalParams;
    private int originalIndex;
    private BlurTarget target;
    private FrameLayout overlay, surface;
    private String mode = "", signature = "";
    private long updates;
    private boolean suspended;
    private String failure = "";
    GlassNavController(WebView web, java.util.function.IntConsumer navigate) { this.web = web; this.navigate = navigate; xiaomi = new XiaomiGlass(web.getContext()); }
    JSObject status() {
        JSObject result = new JSObject(); result.put("native", Build.VERSION.SDK_INT >= 31); result.put("xiaomi", xiaomi.available());
        result.put("detail", failure.isEmpty() ? xiaomi.detail : failure); result.put("active", mode); result.put("updates", updates); return result;
    }
    JSObject update(JSObject value) throws Exception {
        if (!value.optBoolean("enabled") || "web".equals(value.optString("mode"))) { hide(); return status(); }
        String nextMode = value.optString("mode");
        if (!("native".equals(nextMode) || "xiaomi".equals(nextMode))) throw new IllegalArgumentException("Unknown glass mode");
        if (Build.VERSION.SDK_INT < 31) throw new IllegalStateException("Native experiment needs Android 12+");
        if ("xiaomi".equals(nextMode) && !xiaomi.available()) throw new IllegalStateException(xiaomi.detail);
        float scale = web.getWidth() / (float) value.optDouble("viewportWidth", 1);
        if (!Float.isFinite(scale) || scale <= 0 || scale > 10) throw new IllegalArgumentException("Invalid viewport");
        if (!nextMode.equals(mode)) { hide(); attach(nextMode, scale); }
        int[] webAt = new int[2], hostAt = new int[2]; web.getLocationOnScreen(webAt); overlay.getLocationOnScreen(hostAt);
        int width = Math.max(1, Math.round((float)value.optDouble("width") * scale));
        int height = Math.max(1, Math.round((float)value.optDouble("height") * scale));
        ViewGroup.LayoutParams previous = surface.getLayoutParams();
        if (previous.width != width || previous.height != height) surface.setLayoutParams(new FrameLayout.LayoutParams(width,height));
        surface.setTranslationX(webAt[0] - hostAt[0] + (float)value.optDouble("left")*scale);
        surface.setTranslationY(webAt[1] - hostAt[1] + (float)value.optDouble("top")*scale);
        surface.setAlpha(Math.max(0,Math.min(1,(float)value.optDouble("alpha",1))));
        if (suspended) {
            if (surface instanceof BlurView) { ((BlurView) surface).setBlurEnabled(true); ((BlurView) surface).setBlurAutoUpdate(true); }
            else xiaomi.apply(surface, scale);
            suspended = false;
        }
        overlay.setVisibility(View.VISIBLE);
        surface.setVisibility(View.VISIBLE);
        JSArray labels = new JSArray(value.optJSONArray("labels").toString());
        String nextSignature = labels + ":" + value.optInt("selected",-1) + ":" + scale;
        if (!signature.equals(nextSignature)) {
            signature = nextSignature; GlassNavSurface.buttons(web.getContext(), surface, scale, labels, value.optInt("selected",-1), navigate);
        }
        updates++; return status();
    }
    private void attach(String nextMode, float scale) throws Exception {
        if (originalParent == null) {
            originalParent = (ViewGroup) web.getParent(); originalIndex = originalParent.indexOfChild(web); originalParams = web.getLayoutParams();
        }
        if ("native".equals(nextMode) && target == null) {
            target = new BlurTarget(web.getContext()); originalParent.removeView(web);
            target.addView(web,new FrameLayout.LayoutParams(-1,-1)); originalParent.addView(target,originalIndex,originalParams);
        }
        overlay = new FrameLayout(web.getContext()); originalParent.addView(overlay,new ViewGroup.LayoutParams(-1,-1));
        surface = "native".equals(nextMode) ? new BlurView(web.getContext()) : new FrameLayout(web.getContext());
        GlassNavSurface.decorate(surface,scale); overlay.addView(surface,new FrameLayout.LayoutParams(1,1));
        try {
            if (surface instanceof BlurView) ((BlurView)surface).setupWith(target,4f,false).setBlurRadius(10*scale);
            else xiaomi.apply(surface,scale);
            mode = nextMode;
        } catch (Exception error) { failure = error.toString(); hide(); throw error; }
    }
    void hide() {
        if (surface instanceof BlurView) { ((BlurView)surface).setBlurAutoUpdate(false); ((BlurView)surface).setBlurEnabled(false); }
        else if (surface != null) xiaomi.clear(surface);
        if (overlay != null && overlay.getParent() instanceof ViewGroup) ((ViewGroup)overlay.getParent()).removeView(overlay);
        overlay = null; surface = null; mode = ""; signature = ""; suspended = false;
    }
    // Pause sampling without moving the WebView during the Android launcher transition.
    void suspend() {
        if (surface instanceof BlurView) ((BlurView) surface).setBlurAutoUpdate(false);
        else if (surface != null) xiaomi.clear(surface);
        if (overlay != null) overlay.setVisibility(View.INVISIBLE);
        suspended = true;
    }
    void destroy() {
        hide();
        if (target != null && web.getParent() == target) {
            target.removeView(web); originalParent.removeView(target); originalParent.addView(web,Math.min(originalIndex,originalParent.getChildCount()),originalParams);
        }
        target = null; overlay = null; surface = null; mode = ""; signature = "";
    }
}
