package io.github.huleixin.tingyu;

import android.content.ComponentCallbacks2;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.SystemClock;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

import java.io.File;

public class MainActivity extends BridgeActivity {
    private long lastWebViewRecoveryAt = 0L;
    /**
     * How many renderer rebuilds we run back to back before giving up.
     *
     * The old policy was "recreate once, then finish()": a second renderer death inside 15 seconds
     * closed the activity, and that is exactly what a user reports as 闪退 (the app vanishes).
     * A renderer death is the system reclaiming a sandboxed process — surfacing it in the same
     * activity is the normal, recoverable path for Chromium on Android, so rebuild a few times
     * before treating the page as unloadable. The crash trail records every death either way.
     */
    private static final int MAX_BACK_TO_BACK_RENDERER_RECOVERIES = 3;
    private static final long RENDERER_RECOVERY_WINDOW_MS = 60_000L;
    private static final String WEBVIEW_UPDATE_PREFS = "folia_webview_update";
    private static final String WEBVIEW_UPDATE_KEY = "last_cleared_update_time";
    private int rendererRecoveries = 0;
    /** DEBUG 故障注入：webview-init 需要在 super.onCreate 之后抛，先记在字段里。 */
    private String pendingStartupFault;
    private long lastUserLeaveRecordAt = 0L;
    private long lastTrimMemoryRecordAt = 0L;
    private int lastTrimMemoryLevel = Integer.MIN_VALUE;
    private io.github.huleixin.tingyu.chrome.ComposeChromeHost nativeShell;
    public io.github.huleixin.tingyu.chrome.ComposeChromeHost getNativeShell() { return nativeShell; }

    @Override public boolean dispatchTouchEvent(android.view.MotionEvent event) {
        boolean trace=io.github.huleixin.tingyu.chrome.NavigationTiming.enabled()&&event.getActionMasked()==android.view.MotionEvent.ACTION_DOWN;
        long started=trace?android.os.SystemClock.uptimeMillis():0;
        if(trace)io.github.huleixin.tingyu.chrome.NavigationTiming.beginTouch(started-event.getEventTime());
        try{return super.dispatchTouchEvent(event);}
        finally{if(trace)io.github.huleixin.tingyu.chrome.NavigationTiming.markGesture("touch-dispatch-return",android.os.SystemClock.uptimeMillis()-started);}
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 主界面启动确认：到这一步才把「上一会话没走完」计入连续失败（背屏 Activity 不算）。
        io.github.huleixin.tingyu.diagnostics.StartupGuard.noteEntry("main");
        io.github.huleixin.tingyu.diagnostics.StartupGuard.confirmMainLaunch();
        // 安全模式必须在 super.onCreate 之前判定：super 会创建 Capacitor bridge 与 WebView，
        // 而这两者正是启动崩溃最常见的现场。判定为真时直接换到零依赖的原生恢复页。
        if (!getIntent().getBooleanExtra(SafeModeActivity.EXTRA_FROM_SAFE_MODE, false)
            && io.github.huleixin.tingyu.diagnostics.StartupGuard.shouldEnterSafeMode(this)) {
            try {
                startActivity(new Intent(this, SafeModeActivity.class));
                finish();
                return;
            } catch (Throwable cannotOpenSafeMode) {
                // 打不开恢复页时宁可继续正常启动，也不要留一个空白 Activity 给用户。
                CrashDiagnostics.recordText(
                    getApplicationContext(), "startup-guard", "main", "safe-mode-open-failed",
                    String.valueOf(cannotOpenSafeMode), "SafeModeActivity start failed");
            }
        }
        // 诊断安装在这里是第三道保险（前两道在 Application.attachBaseContext 与 BootstrapProvider），
        // 幂等，重复调用只多一次判断。
        io.github.huleixin.tingyu.diagnostics.DiagnosticBootstrap.install(
            getApplicationContext(), io.github.huleixin.tingyu.diagnostics.StartupGuard.STAGE_ACTIVITY_CREATE);
        // DEBUG 构建的故障注入：只在带 faultStage extra 时生效，release 里整段被 R8 当作死代码前也安全。
        injectStartupFaultIfRequested(getIntent());
        io.github.huleixin.tingyu.chrome.NavigationTiming.initialize(this);
        CrashDiagnostics.install(getApplicationContext());
        // The playback trail must exist before anything else can fail, and must be reloaded from
        // disk on every process start so a trail recorded before a kill is still exportable.
        io.github.huleixin.tingyu.playback.PlaybackDiagnostics.initialize(getApplicationContext());
        io.github.huleixin.tingyu.playback.PlaybackLifecycle.noteActivity("create", true);
        clearWebViewCachesAfterAppUpdate();
        boolean skipOptional = io.github.huleixin.tingyu.diagnostics.StartupGuard.skipOptional();
        registerPlugin(FoliaNativePlugin.class);
        registerPlugin(io.github.huleixin.tingyu.playback.TingyuPlaybackPlugin.class);
        // 安全模式「跳过非必要模块」：原生 Compose 页面不是启动必需品，少装一份就少一个崩溃面。
        if (BuildConfig.COMPOSE_CHROME && !skipOptional) registerPlugin(io.github.huleixin.tingyu.chrome.TingyuChromePlugin.class);
        if (BuildConfig.GLASS_LAB) {
            registerPlugin(io.github.huleixin.tingyu.glass.TingyuGlassPlugin.class);
        }
        registerPlugin(io.github.huleixin.tingyu.coloros.FoliaColorOsLyricsPlugin.class);
        // 窗口底色必须等于原生首页首帧的渐变首色（LaunchSurface）。原先深色用 #09090B，
        // 与页面真实的深绿底（#102D25 起）不同色，冷启动/重建时「窗口已起、内容未绘」
        // 的那 0.3~0.5s 就是录屏 68723 里那块纯黑色圆角窗口。
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(
            io.github.huleixin.tingyu.chrome.LaunchSurface.INSTANCE.color(
                io.github.huleixin.tingyu.chrome.InterfaceAppearance.light(this))));
        // decor 背景会在 PhoneFitCutout/MainSystemBars 里被设成透明（避免舞台淡出透出色带），
        // 透明 + 不透明窗口 = 合成器清成黑色。首帧之前由 BootSurfaceTint 用页面底色顶着，
        // Compose 第一帧画出来后 settle() 交还透明（录屏 68736）。
        io.github.huleixin.tingyu.chrome.BootSurfaceTint.arm();
        // 启动路径诊断：restored=true 表示 Activity 重建（进程内），配合 host-attach 与
        // activity-resume 计数即可区分冷启动 / 暖恢复 / renderer 死亡后的 recreate。
        android.util.Log.i("TingyuEntry", "activity-create restored=" + (savedInstanceState != null));
        super.onCreate(savedInstanceState);
        io.github.huleixin.tingyu.chrome.NavigationTiming.mark("activity-create-capacitor-ready");
        if (BuildConfig.DEBUG && (BuildConfig.GLASS_LAB || BuildConfig.COMPOSE_CHROME)) WebView.setWebContentsDebuggingEnabled(true);
        CrashDiagnostics.recordText(
            getApplicationContext(),
            "activity-lifecycle",
            "main",
            "create",
            "restoredState=" + (savedInstanceState != null),
            "onCreate"
        );
        io.github.huleixin.tingyu.diagnostics.DiagnosticLog.install(getApplicationContext());
        try {
            org.json.JSONObject createFields = new org.json.JSONObject();
            createFields.put("restored", savedInstanceState != null);
            createFields.put("sdk", android.os.Build.VERSION.SDK_INT);
            io.github.huleixin.tingyu.diagnostics.DiagnosticLog.event(
                "lifecycle", "info", "activity-create", createFields);
        } catch (Exception ignored) {
            // 诊断不能影响启动。
        }
        installWebViewRendererGuard();
        getBridge().setWebViewClient(new com.getcapacitor.BridgeWebViewClient(getBridge()) {
            @Override public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view, android.webkit.WebResourceRequest request) {
                android.webkit.WebResourceResponse shared = "GET".equals(request.getMethod())
                    ? io.github.huleixin.tingyu.playback.SharedArtworkAccess.intercept(getApplicationContext(), request.getUrl().toString()) : null;
                return shared != null ? shared : super.shouldInterceptRequest(view, request);
            }
        });
        try {
            android.webkit.ServiceWorkerController.getInstance().setServiceWorkerClient(new android.webkit.ServiceWorkerClient() {
                @Override public android.webkit.WebResourceResponse shouldInterceptRequest(android.webkit.WebResourceRequest request) {
                    android.webkit.WebResourceResponse shared = "GET".equals(request.getMethod())
                        ? io.github.huleixin.tingyu.playback.SharedArtworkAccess.intercept(getApplicationContext(), request.getUrl().toString()) : null;
                    return shared != null ? shared : getBridge().getLocalServer().shouldInterceptRequest(request);
                }
            });
        } catch (Throwable unavailable) { /* Keep Capacitor's existing client on unsupported vendor WebViews. */ }
        WebView webView = getBridge().getWebView();
        io.github.huleixin.tingyu.chrome.NavigationTiming.mark("webview-available");
        io.github.huleixin.tingyu.diagnostics.DiagnosticBootstrap.stage(
            io.github.huleixin.tingyu.diagnostics.StartupGuard.STAGE_WEBVIEW_INIT);
        // 注入点放在 WebView 已经创建之后：复现的是「WebView 初始化阶段」而不是参数检查。
        if ("webview-init".equals(pendingStartupFault)) {
            throw new IllegalStateException("Injected startup fault at webview-init (debug build)");
        }
        if (BuildConfig.COMPOSE_CHROME && !skipOptional) {
            // Attach packaged Compose UI before the Activity can present its first application frame.
            nativeShell = new io.github.huleixin.tingyu.chrome.ComposeChromeHost(webView, (id,session,action,value) -> {});
            nativeShell.bootstrap();
            io.github.huleixin.tingyu.chrome.NavigationTiming.mark("cached-shell-attached");
            io.github.huleixin.tingyu.diagnostics.DiagnosticBootstrap.stage(
                io.github.huleixin.tingyu.diagnostics.StartupGuard.STAGE_NATIVE_SHELL);
        }
        WebSettings settings = webView.getSettings();
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        /**
         * 挂在通知栏播放的后台会话，续播仍然需要 WebView 活着：下一首的播放地址只能由 JS 解析。
         *
         * 默认策略是「不可见时把 renderer 降为 waived」，锁屏十几分钟后这个 renderer 就是最先
         * 被回收的对象 —— 之后队列补不上（歌停在某首唱完）、歌词也补不上（灵动岛变空）。
         * 这里只把「不可见时降级」关掉：不申请唤醒锁、不阻止页面被冻结、也不改变前台行为，
         * 只是让系统在回收时把我们当成仍在工作的应用，而不是一个闲置页面。
         */
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            try {
                webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
            } catch (Throwable ignored) {
                // Vendor WebViews have refused this before; playback must not depend on it.
            }
        }
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                // Let the WebView close its own settings/effects layer first. When nothing is open the
                // JS handler now moves the task to the background so playback keeps running; this
                // Also preserve playback if Back arrives before the JS listener is ready.
                boolean pageBack = nativeShell != null && nativeShell.requiresWebBack();
                if (FoliaNativePlugin.emitBackPressed(pageBack)) return;
                if (pageBack) return; // A not-yet-bound stage must never background the task.
                CrashDiagnostics.recordText(
                    getApplicationContext(),
                    "activity-lifecycle",
                    "main",
                    "back-background",
                    "Back listener unavailable; moving task to background",
                    "OnBackPressedCallback"
                );
                moveTaskToBack(true);
            }
        });
        PhoneLayoutOrientation.apply(this);
        PhoneFitCutout.apply(this);
        restoreAdaptiveLayout(webView);
        // 启动时窗口焦点和系统栏状态还会变一次，只应用一遍会被后面的 inset 恢复覆盖。
        webView.postDelayed(() -> restoreAdaptiveLayout(webView), 500);
        webView.postDelayed(() -> restoreAdaptiveLayout(webView), 1500);
        webView.postDelayed(() -> PhoneFitCutout.apply(this), 500);
        webView.postDelayed(() -> PhoneFitCutout.apply(this), 1500);
    }

    /**
     * The PWA service worker caches index.html and every hashed asset. After an APK update the
     * cached index.html can reference chunks that no longer exist in the new package, and that
     * first launch has to run the old JS before the new bundle can repair anything. Clear only
     * the HTTP / service-worker response caches once per install. Hashed script code and GPU
     * shader caches validate their own contents; deleting them forced needless JS/shader
     * recompilation immediately after every upgrade. Cookies, localStorage and IndexedDB stay.
     */
    private void clearWebViewCachesAfterAppUpdate() {
        long updateTime;
        try {
            updateTime = getPackageManager().getPackageInfo(getPackageName(), 0).lastUpdateTime;
        } catch (Exception error) {
            CrashDiagnostics.recordText(
                getApplicationContext(),
                "webview-cache-cleanup",
                "main",
                "package-info-error",
                error.getClass().getSimpleName() + ": " + error.getMessage(),
                "Could not read lastUpdateTime"
            );
            return;
        }

        SharedPreferences preferences = getSharedPreferences(WEBVIEW_UPDATE_PREFS, MODE_PRIVATE);
        if (preferences.getLong(WEBVIEW_UPDATE_KEY, -1L) == updateTime) return;
        preferences.edit().putLong(WEBVIEW_UPDATE_KEY, updateTime).apply();

        File webViewRoot = new File(getDataDir(), "app_webview/Default");
        String[] cachePaths = {
            "HTTP Cache",
            "Service Worker",
            "Cache",
        };
        for (String path : cachePaths) deleteQuietly(new File(webViewRoot, path));
    }

    private static void deleteQuietly(File file) {
        if (file == null || !file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) deleteQuietly(child);
        }
        // Failure is non-fatal: the JS-side recovery still handles a stale chunk reference.
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }

    /**
     * DEBUG 构建的启动故障注入。release 里第一行就返回，方法体不会被执行。
     *
     * <pre>
     * adb shell am force-stop io.github.huleixin.tingyu
     * adb shell am start -n io.github.huleixin.tingyu/.MainActivity --es faultStage activity-create
     * adb shell am start -n io.github.huleixin.tingyu/.MainActivity --es faultStage webview-init
     * adb shell am start -n io.github.huleixin.tingyu/.MainActivity --es faultStage anr
     * adb shell am start -n io.github.huleixin.tingyu/.MainActivity --es faultStage safe-mode
     * </pre>
     */
    private void injectStartupFaultIfRequested(Intent intent) {
        if (!BuildConfig.DEBUG || intent == null) return;
        String fault = intent.getStringExtra("faultStage");
        if (fault == null || fault.isEmpty()) return;
        pendingStartupFault = fault;
        if ("activity-create".equals(fault)) {
            throw new IllegalStateException("Injected startup fault at activity-create (debug build)");
        }
        if ("anr".equals(fault)) {
            // 主线程睡 9 秒：复现「启动阶段 ANR」，系统会在 5 秒后开始记 ANR。
            try {
                Thread.sleep(9_000L);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
        }
        if ("safe-mode".equals(fault)) {
            io.github.huleixin.tingyu.diagnostics.StartupGuard.forceSafeMode("debug-fault-injection");
        }
    }

    /**
     * A dead WebView renderer kills the Android process when the client returns false, so we take
     * the callback, record why it ended, and rebuild the activity. Repeated deaths still end the
     * app, but only after several rebuilds inside a minute: closing on the second one turned a
     * recoverable renderer kill into the app disappearing mid-use.
     */
    private void installWebViewRendererGuard() {
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                boolean didCrash = detail != null && detail.didCrash();
                int priority = detail == null ? -1 : detail.rendererPriorityAtExit();
                // The playback trail, not only the crash trail: a renderer death is the one event
                // that silences the WebView half of both reported bugs at the same instant.
                io.github.huleixin.tingyu.playback.PlaybackDiagnostics.initialize(getApplicationContext());
                io.github.huleixin.tingyu.playback.PlaybackLifecycle.noteRendererGone(didCrash);
                io.github.huleixin.tingyu.playback.PlaybackDiagnostics.note("renderer-gone",
                    new com.getcapacitor.JSObject().put("didCrash", didCrash).put("priorityAtExit", priority)
                        .put("jsSilentMs", io.github.huleixin.tingyu.playback.PlaybackLifecycle.jsSilentMs()));
                CrashDiagnostics.recordText(
                    getApplicationContext(),
                    "webview-renderer-gone",
                    "renderer",
                    didCrash ? "renderer-crash" : "renderer-killed",
                    "didCrash=" + didCrash + " priorityAtExit=" + priority,
                    "Capacitor WebView renderer process ended"
                );
                try {
                    org.json.JSONObject gone = new org.json.JSONObject();
                    gone.put("didCrash", didCrash);
                    gone.put("priority", priority);
                    io.github.huleixin.tingyu.diagnostics.DiagnosticLog.event(
                        "webview", "error", "renderer-gone", gone);
                } catch (Exception ignored) {
                    // 同上：这是最后一条证据，失败也不能再抛。
                }

                long now = SystemClock.elapsedRealtime();
                runOnUiThread(() -> {
                    if (isFinishing() || isDestroyed()) return;
                    // A quiet minute means the previous rebuild held: start counting again.
                    if (now - lastWebViewRecoveryAt > RENDERER_RECOVERY_WINDOW_MS) rendererRecoveries = 0;
                    lastWebViewRecoveryAt = now;
                    rendererRecoveries += 1;
                    if (rendererRecoveries > MAX_BACK_TO_BACK_RENDERER_RECOVERIES) {
                        // Still dying after several rebuilds: better to stop than to loop forever.
                        // The crash trail above already says what the renderer reported.
                        CrashDiagnostics.recordText(
                            getApplicationContext(),
                            "webview-renderer-gone",
                            "renderer",
                            "renderer-give-up",
                            "rendererRecoveries=" + rendererRecoveries
                                + " windowMs=" + RENDERER_RECOVERY_WINDOW_MS,
                            "finish after repeated renderer deaths"
                        );
                        try {
                            org.json.JSONObject giveUp = new org.json.JSONObject();
                            giveUp.put("recoveries", rendererRecoveries);
                            io.github.huleixin.tingyu.diagnostics.DiagnosticLog.event(
                                "webview", "fatal", "renderer-give-up", giveUp);
                        } catch (Exception ignored) {
                        }
                        finish();
                        return;
                    }
                    if (view != null) view.destroy();
                    CrashDiagnostics.recordText(
                        getApplicationContext(),
                        "webview-renderer-guard",
                        "main",
                        "recreate",
                        "attempt=" + rendererRecoveries + " didCrash=" + didCrash,
                        "rebuilding activity after renderer death"
                    );
                    recreate();
                });
                return true;
            }
        });
    }

    private void updateStageActivity(boolean visible) {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().evaluateJavascript("window.__tingyuMainVisible=" + visible
            + ";window.dispatchEvent(new Event('tingyu-main-stage-activity'))", null);
    }

    @Override
    public void onResume() {
        super.onResume();
        io.github.huleixin.tingyu.playback.PlaybackLifecycle.noteActivity("resume", true);
        if (nativeShell != null) nativeShell.resume();
        updateStageActivity(true);
        if (getBridge() != null) {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                webView.postDelayed(() -> restoreAdaptiveLayout(webView), 100);
            }
        }
        PhoneFitCutout.apply(this);
    }

    @Override
    protected void onUserLeaveHint() {
        long now = SystemClock.elapsedRealtime();
        if (now - lastUserLeaveRecordAt < 3000L) {
            super.onUserLeaveHint();
            return;
        }
        lastUserLeaveRecordAt = now;
        // Wall-clock anchor for "when the screen went away"; every later trail entry is read
        // relative to this moment.
        io.github.huleixin.tingyu.playback.PlaybackDiagnostics.note("user-leave", new com.getcapacitor.JSObject()
            .put("jsSilentMs", io.github.huleixin.tingyu.playback.PlaybackLifecycle.jsSilentMs()));
        CrashDiagnostics.recordText(
            getApplicationContext(),
            "activity-lifecycle",
            "main",
            "user-leave",
            "User left the app (Home, Recents, or app switch)",
            "onUserLeaveHint"
        );
        super.onUserLeaveHint();
    }

    @Override
    public void onStop() {
        // 用户主动退出（不是被系统杀）：下一次启动不算「启动失败」。
        if (isFinishing()) {
            io.github.huleixin.tingyu.diagnostics.StartupGuard.noteUserExit();
        }
        io.github.huleixin.tingyu.playback.PlaybackDiagnostics.initialize(getApplicationContext());
        io.github.huleixin.tingyu.playback.PlaybackLifecycle.noteActivity("stop", false);
        io.github.huleixin.tingyu.playback.PlaybackDiagnostics.note("activity-stop", new com.getcapacitor.JSObject()
            .put("finishing", isFinishing()).put("changingConfigurations", isChangingConfigurations()));
        if (nativeShell != null) nativeShell.suspend();
        updateStageActivity(false);
        CrashDiagnostics.recordText(
            getApplicationContext(),
            "activity-lifecycle",
            "main",
            "stop",
            "isFinishing=" + isFinishing() + " changingConfigurations=" + isChangingConfigurations(),
            "onStop"
        );
        super.onStop();
    }

    @Override
    public void onDestroy() {
        io.github.huleixin.tingyu.chrome.NavigationTiming.destroy();
        // The Activity owns the Capacitor bridge, and the bridge is the only path JS has into the
        // engine. Its destruction is therefore a playback event, not only a lifecycle one.
        io.github.huleixin.tingyu.playback.PlaybackDiagnostics.initialize(getApplicationContext());
        io.github.huleixin.tingyu.playback.PlaybackLifecycle.noteActivity("destroy", false);
        io.github.huleixin.tingyu.playback.PlaybackDiagnostics.note("activity-destroy", new com.getcapacitor.JSObject()
            .put("finishing", isFinishing()).put("changingConfigurations", isChangingConfigurations())
            .put("jsSilentMs", io.github.huleixin.tingyu.playback.PlaybackLifecycle.jsSilentMs()));
        CrashDiagnostics.recordText(
            getApplicationContext(),
            "activity-lifecycle",
            "main",
            "destroy",
            "isFinishing=" + isFinishing() + " changingConfigurations=" + isChangingConfigurations(),
            "onDestroy"
        );
        super.onDestroy();
        if (nativeShell != null) { nativeShell.destroy(); nativeShell = null; }
    }

    @Override
    public void onTrimMemory(int level) {
        long now = SystemClock.elapsedRealtime();
        if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW
            && (level != lastTrimMemoryLevel || now - lastTrimMemoryRecordAt >= 10000L)) {
            lastTrimMemoryLevel = level;
            lastTrimMemoryRecordAt = now;
            // Memory pressure is the usual reason the OS destroys the Activity or the renderer
            // while audio is still playing; it belongs on the same timeline as the stop.
            io.github.huleixin.tingyu.playback.PlaybackDiagnostics.note("memory-pressure",
                new com.getcapacitor.JSObject().put("level", level)
                    .put("jsSilentMs", io.github.huleixin.tingyu.playback.PlaybackLifecycle.jsSilentMs()));
            CrashDiagnostics.recordText(
                getApplicationContext(),
                "memory-pressure",
                "main",
                "trim-memory",
                "level=" + level,
                "onTrimMemory"
            );
        }
        super.onTrimMemory(level);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if(nativeShell!=null)nativeShell.windowFocusChanged(hasFocus);
        if (hasFocus && getBridge() != null) {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                // A floating system dialog did not change the window layout policy. Reinstalling
                // edge-to-edge here produces transient inset/RenderNode poses behind its dim layer.
                webView.post(webView::invalidate);
            }
        }
    }

    // 恢复主屏系统栏与安全区；分辨率适配开关不再强制隐藏状态栏和导航栏。
    private void restoreAdaptiveLayout(WebView webView) {
        // 自适应布局的 inset 操作可能重置 cutout 模式，这里统一补一次挖孔适配。
        PhoneFitCutout.apply(this);
        if (!AdaptiveLayout.isEnabled(this)) return;
        if (!AdaptiveLayout.apply(this, webView, true)) {
            AdaptiveLayout.setEnabled(this, false);
        }
    }
}
