package io.github.huleixin.tingyu;

import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Canvas;
import android.graphics.Color;
import android.hardware.display.DisplayManager;
import android.os.Build;
import android.os.Bundle;
import android.view.Display;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import java.util.UUID;

/** Dedicated native viewport hosting Folia's original visualizer, independent of the main activity. */
public final class RearLyricsActivity extends Activity {
    static final String EXTRA_SESSION = "folia_rear_session";
    private static volatile String requestedSession = "";
    private static volatile int requestedDisplay = -1;
    private static volatile RearLyricsActivity shownActivity;
    private static volatile WindowState lastWindowState;
    private String session = "";
    private boolean visible, drewFrame, contentReady, opaque, backRegistered, rendererQueued;
    private int rendererRecoveries;
    private FrameLayout root;
    private WebView renderer;
    private DisplayManager displayManager;
    private final OnBackInvokedCallback backCallback = this::revealProgress;
    private final DisplayManager.DisplayListener displayListener = new DisplayManager.DisplayListener() {
        @Override public void onDisplayAdded(int id) { onDisplayChanged(id); }
        @Override public void onDisplayRemoved(int id) { onDisplayChanged(id); }
        @Override public void onDisplayChanged(int id) { updateViewport(); reportWindow(); }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        session = getIntent().getStringExtra(EXTRA_SESSION);
        if (!isCurrentSession(session)) { finish(); return; }
        shownActivity = this;
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 27) setShowWhenLocked(true);
        if (Build.VERSION.SDK_INT >= 30) {
            WindowManager.LayoutParams attributes = getWindow().getAttributes();
            attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
            getWindow().setAttributes(attributes);
        }
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        root = new FrameLayout(this);
        setContentView(root);
        root.addOnLayoutChangeListener((view, l, t, r, b, ol, ot, or, ob) -> updateViewport());
        // The shell may stage this transparent Activity on the main display while locked.
        // Create Chromium only after the window actually reaches the rear display.
        displayManager = (DisplayManager) getSystemService(DISPLAY_SERVICE);
        if (displayManager != null) displayManager.registerDisplayListener(displayListener, new android.os.Handler(getMainLooper()));
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
            backRegistered = true;
        }
        updateViewport(); reportWindow(); record("create", "task=" + getTaskId() + ", display=" + currentDisplayId());
    }

    private void installRenderer() {
        if (renderer != null) { root.removeView(renderer); renderer.destroy(); }
        contentReady = false; drewFrame = false;
        renderer = new WebView(this) {
            @Override protected void onDraw(Canvas canvas) {
                super.onDraw(canvas);
                if (!drewFrame && contentReady && getWidth() > 0 && getHeight() > 0) { drewFrame = true; reportWindow(); }
            }
        };
        final WebView installedRenderer = renderer;
        record("renderer-created", "display=" + currentDisplayId() + ", density=" + getResources().getDisplayMetrics().density);
        WebSettings settings = renderer.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        // Honor the device-width meta viewport, never overview-zoom the layout after moving displays.
        settings.setUseWideViewPort(true); settings.setLoadWithOverviewMode(false); settings.setTextZoom(100);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        renderer.setBackgroundColor(Color.BLACK);
        renderer.setHorizontalScrollBarEnabled(false); renderer.setVerticalScrollBarEnabled(false);
        renderer.setOnLongClickListener(view -> true); renderer.setLongClickable(false);
        if (Build.VERSION.SDK_INT >= 26) renderer.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        renderer.setWebViewClient(new RearLyricsWebClient(getApplicationContext(), new RearLyricsWebClient.Events() {
            @Override public void ready() {
                if (renderer != installedRenderer) return;
                contentReady = true; renderer.invalidate(); reportWindow();
                record("renderer-ready", "Folia original visualizer mounted");
            }
            @Override public void error(String message) { record("web-error", message); }
            @Override public void rendererGone() {
                if (renderer == installedRenderer && !isFinishing() && rendererRecoveries++ < 2) { installRenderer(); updateViewport(); }
            }
        }));
        renderer.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage message) {
                if (message.messageLevel() == ConsoleMessage.MessageLevel.ERROR) record("web-console", message.message());
                return true;
            }
        });
        root.addView(renderer, new FrameLayout.LayoutParams(-1, -1));
        renderer.addOnLayoutChangeListener((view, l, t, r, b, ol, ot, or, ob) -> reportWindow());
        renderer.loadUrl("https://rear.folia.local/rear-lyrics.html");
    }

    /** Wallpaper fills the rear display; the web surface supplies a separate camera-safe lyric viewport. */
    private void updateViewport() {
        if (root == null) return;
        boolean onRear = currentDisplayId() == requestedDisplay;
        if (!onRear) { if (renderer != null) renderer.setVisibility(View.INVISIBLE); return; }
        if (renderer == null) {
            if (root.getWidth() <= 0 || root.getHeight() <= 0) return;
            if (!rendererQueued) {
                rendererQueued = true;
                root.post(() -> {
                    rendererQueued = false;
                    if (isFinishing() || !isCurrentSession(session) || currentDisplayId() != requestedDisplay) return;
                    if (renderer == null) installRenderer();
                    updateViewport();
                });
            }
            return;
        }
        renderer.setVisibility(View.VISIBLE);
        if (onRear && !opaque) {
            if (Build.VERSION.SDK_INT >= 30) setTranslucent(false);
            root.setBackgroundColor(Color.BLACK); opaque = true;
        }
        if (onRear) { RearLyricsViewportMetrics.fit(root, renderer); renderer.invalidate(); reportWindow(); }
    }
    private void revealProgress() {
        if (renderer != null && currentDisplayId() == requestedDisplay) {
            renderer.evaluateJavascript("window.dispatchEvent(new Event('folia-rear-reveal'))", null);
            record("back-consumed", "Revealed progress; rear lyrics stay open");
        }
    }
    static void setPowerSleeping(boolean sleeping) {
        RearLyricsActivity activity = shownActivity;
        if (activity == null) return;
        activity.runOnUiThread(() -> {
            if (sleeping) activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            if (activity.renderer != null) {
                activity.renderer.evaluateJavascript("window.dispatchEvent(new CustomEvent('folia-rear-power',{detail:{sleeping:" + sleeping + "}}))", null);
                if (sleeping) activity.renderer.onPause();
                else { activity.renderer.onResume(); activity.renderer.invalidate(); }
            }
        });
    }
    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if (currentDisplayId() == requestedDisplay && event.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            if (event.getAction() == KeyEvent.ACTION_UP) revealProgress();
            return true;
        }
        return super.dispatchKeyEvent(event);
    }
    @Override public void onBackPressed() {
        if (currentDisplayId() == requestedDisplay) revealProgress(); else super.onBackPressed();
    }
    @Override protected void onStart() {
        super.onStart(); visible = true; drewFrame = false;
        if (renderer != null && !RearLyricsCoordinator.get(this).isSleeping()) renderer.onResume();
        updateViewport(); reportWindow(); record("start", "display=" + currentDisplayId());
    }
    @Override protected void onStop() {
        visible = false; reportWindow();
        record("stop", "display=" + currentDisplayId());
        // Main-screen locking may briefly stop the rear Activity too. The keeper restores only
        // its rear task; do not freeze its independent clock during that transition.
        if (renderer != null && !RearLyricsCoordinator.get(this).wanted()) renderer.onPause();
        RearLyricsCoordinator.get(this).windowChanged();
        super.onStop();
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String nextSession = intent.getStringExtra(EXTRA_SESSION);
        if (!isCurrentSession(nextSession)) return;
        setIntent(intent); session = nextSession; drewFrame = false;
        updateViewport(); reportWindow(); record("new-intent", "display=" + currentDisplayId());
    }
    @Override public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration); drewFrame = false;
        record("configuration", "display=" + currentDisplayId() + ", densityDpi=" + configuration.densityDpi);
        if (root != null) root.post(() -> { updateViewport(); reportWindow(); });
    }
    @Override protected void onDestroy() {
        if (displayManager != null) displayManager.unregisterDisplayListener(displayListener);
        if (Build.VERSION.SDK_INT >= 33 && backRegistered) getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        record("destroy", "finishing=" + isFinishing() + ", changingConfiguration=" + isChangingConfigurations());
        if (renderer != null) { root.removeView(renderer); renderer.destroy(); renderer = null; }
        if (shownActivity == this) { shownActivity = null; lastWindowState = null; }
        RearLyricsCoordinator.get(this).windowChanged();
        super.onDestroy();
    }
    private void record(String event, String message) {
        getSharedPreferences("rear_lyrics", MODE_PRIVATE).edit().putString("last_window_event", event + ": " + message).apply();
        RearLyricsTrace.record(this, event, message);
    }
    static String prepareLaunch(int displayId) {
        RearLyricsViewportMetrics.reset();
        requestedSession = UUID.randomUUID().toString(); requestedDisplay = displayId; return requestedSession;
    }
    static boolean isEnabled() { return !requestedSession.isEmpty(); }
    static String currentSession() { return requestedSession; }
    static boolean isCurrentSession(String session) { return session != null && !session.isEmpty() && session.equals(requestedSession); }
    static WindowState windowState(String session) {
        WindowState state = lastWindowState;
        return state != null && state.session.equals(session) && isCurrentSession(session) ? state : null;
    }
    static WindowState windowState() { return windowState(requestedSession); }
    static boolean isShowingOnDisplay(int id) {
        WindowState state = windowState();
        return state != null && state.displayId == id && state.visible && state.drawn && state.width > 0 && state.height > 0;
    }
    static WindowState attachedWindowOnDisplay(int id) {
        RearLyricsActivity activity = shownActivity;
        WindowState state = windowState();
        return activity != null && !activity.isFinishing() && state != null && state.displayId == id ? state : null;
    }
    static void finishIfShown() {
        requestedSession = ""; requestedDisplay = -1;
        RearLyricsActivity activity = shownActivity;
        if (activity != null) activity.runOnUiThread(activity::finish);
    }
    private int currentDisplayId() {
        Display display = getWindow().getDecorView().getDisplay();
        if (display == null) display = getWindowManager().getDefaultDisplay();
        return display == null ? -1 : display.getDisplayId();
    }
    private void reportWindow() {
        if (shownActivity != this || !isCurrentSession(session)) return;
        if (renderer != null && currentDisplayId() == requestedDisplay) RearLyricsViewportMetrics.capture(renderer);
        lastWindowState = new WindowState(session, currentDisplayId(), getTaskId(), visible, drewFrame,
            renderer == null ? 0 : renderer.getWidth(), renderer == null ? 0 : renderer.getHeight());
    }
    static final class WindowState {
        final String session;
        final int displayId, taskId, width, height;
        final boolean visible, drawn;
        WindowState(String session, int displayId, int taskId, boolean visible, boolean drawn, int width, int height) {
            this.session = session; this.displayId = displayId; this.taskId = taskId;
            this.visible = visible; this.drawn = drawn; this.width = width; this.height = height;
        }
        @Override public String toString() {
            return "display=" + displayId + ", task=" + taskId + ", visible=" + visible + ", rendered=" + drawn + ", safe viewport=" + width + "x" + height;
        }
    }
}
