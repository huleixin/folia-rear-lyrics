package io.github.huleixin.tingyu;

import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;

// android/app/src/main/java/top/izuna/foliamajor/MainSystemBars.java
/** Main-phone policy only. RearLyricsActivity keeps its independent immersive display window. */
final class MainSystemBars {
    private MainSystemBars() {}
    private static Insets latestSafe = Insets.NONE;
    private static float density = 1f;
    private static volatile boolean systemBarsVisible = true;

    static JSObject getInsets() {
        JSObject result = new JSObject();
        result.put("top", latestSafe.top / density);
        result.put("bottom", latestSafe.bottom / density);
        result.put("left", latestSafe.left / density);
        result.put("right", latestSafe.right / density);
        return result;
    }

    static void setVisible(Activity activity, boolean visible) {
        if (!(activity instanceof MainActivity)) return;
        systemBarsVisible = visible;
        applyVisibility(activity);
    }

    private static void applyVisibility(Activity activity) {
        Window window = activity.getWindow();
        if (window == null) return;
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        if (systemBarsVisible) {
            controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_DEFAULT);
            controller.show(WindowInsetsCompat.Type.systemBars());
        } else {
            controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            controller.hide(WindowInsetsCompat.Type.systemBars());
        }
    }

    @SuppressWarnings("deprecation")
    static boolean apply(Activity activity) {
        if (!(activity instanceof MainActivity)) return false;
        Window window = activity.getWindow();
        View decor = window.getDecorView();
        // Android 15+ enforces edge-to-edge for targetSdk 35+, but older versions still need
        // the window to opt in. This also clears the legacy translucent-bar flags and keeps
        // the status / navigation bars transparent on every supported API.
        WindowCompat.enableEdgeToEdge(window);
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN
            | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
            | WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS
            | WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setNavigationBarContrastEnforced(false);
            window.setStatusBarContrastEnforced(false);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams attributes = window.getAttributes();
            attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(attributes);
        }
        decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        // Keep edge-to-edge system areas backed by the same full-bleed WebView surface.
        // A fixed native tint creates visible bands over page gradients and stage backdrops.
        decor.setBackgroundColor(Color.TRANSPARENT);
        // Capacitor's SystemBars automatic decor padding is disabled in capacitor.config.json.
        // Clear a previous layout pass before the single content listener reserves keyboard space.
        decor.setPadding(0, 0, 0, 0);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decor);
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);
        applyVisibility(activity);
        View content = activity.findViewById(android.R.id.content);
        if (content != null) {
            // Background is full bleed; JS reserves a safe inner content rectangle exactly once.
            ViewCompat.setOnApplyWindowInsetsListener(content, (view, insets) -> {
                int safeTypes = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
                // A transient system-bar reveal must not resize the lyric renderer.
                Insets safe = insets.getInsetsIgnoringVisibility(safeTypes);
                float nextDensity = view.getResources().getDisplayMetrics().density;
                if (!safe.equals(latestSafe) || density != nextDensity) {
                    latestSafe = safe;
                    density = nextDensity;
                    FoliaNativePlugin.emitMainWindowInsets(getInsets());
                }
                // Compose is below this listener and receives consumed (zero) insets.
                // Feed its startup geometry the same authoritative values as the WebView.
                io.github.huleixin.tingyu.chrome.ComposeChromeHost shell = ((MainActivity) activity).getNativeShell();
                if (shell != null) shell.setSafeInsets(safe.top / nextDensity, safe.bottom / nextDensity);
                int keyboard = insets.isVisible(WindowInsetsCompat.Type.ime()) ? insets.getInsets(WindowInsetsCompat.Type.ime()).bottom : 0;
                view.setPadding(0, 0, 0, keyboard);
                return new WindowInsetsCompat.Builder(insets).setInsets(safeTypes | WindowInsetsCompat.Type.ime(), Insets.NONE).build();
            });
            ViewCompat.requestApplyInsets(content);
        }
        return true;
    }
}
