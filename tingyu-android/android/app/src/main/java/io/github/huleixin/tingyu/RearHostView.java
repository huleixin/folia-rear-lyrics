package io.github.huleixin.tingyu;

import android.app.Activity;
import android.database.ContentObserver;
import android.graphics.Canvas;
import android.graphics.Color;
import android.hardware.display.DisplayManager;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.Display;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.FrameLayout;

// android/app/src/main/java/io/github/huleixin/tingyu/RearHostView.java
/**
 * 背屏中心 launcher 窗口里的听屿宿主视图。
 *
 * <p>与它取代的 {@code RearHostedCard} 的根本区别：这里不再寻找、也不再接管任何 MAML
 * 音乐卡片。宿主是背屏中心 Activity 窗口里<b>新增的一个子 View</b>，原生视图树一个都不
 * 隐藏、MAML root 一次都不暂停 —— 释放时只需要把自己摘掉，原生界面本来就在下面。
 *
 * <p>复用现有歌词舞台的全部资源链：同一个 {@code https://rear.folia.local/rear-lyrics.html}、
 * 同一个 {@link RearHostWebClient} 资源桥、同一个 {@link RearLyricsViewportMetrics} 视口
 * 计算、同一组 {@code folia-rear-power} / {@code folia-rear-resync} 事件。视觉与动效不改。
 *
 * <p>触摸模型：{@link RearInteractionFrame} 只在识别到上滑时拦截，普通点击照常交给
 * WebView（歌词页的 reveal/控制条依赖点击）。上滑不合成任何系统导航，只释放本次显示会话
 * 并移除本视图，露出的仍是背屏中心原生界面。
 */
final class RearHostView {
    interface Events {
        boolean current(String session);
        void report(String session, String event, int display, String reason);
    }

    /** 一个窗口里只允许一个听屿宿主；重复注入会命中这个 tag 并被拒绝。 */
    static final String TAG = "tingyu.rear.centre.host";
    private static final String URL = "https://rear.folia.local/rear-lyrics.html";

    private final Activity activity;
    private final String session;
    private final Events events;
    private final Handler main = new Handler(Looper.getMainLooper());
    private RearInteractionFrame stage;
    private WebView renderer;
    private RearHostWebClient client;
    private ContentObserver updates;
    private DisplayManager displays;
    private boolean ready, readyReported, shown, renderPaused, resumed = true, suspended, closed;
    private String failure = "not attached";

    private final DisplayManager.DisplayListener displayListener = new DisplayManager.DisplayListener() {
        @Override public void onDisplayAdded(int id) {}
        @Override public void onDisplayRemoved(int id) { if (id == displayId()) reconcile(); }
        @Override public void onDisplayChanged(int id) { if (id == displayId()) reconcile(); }
    };

    RearHostView(Activity activity, String session, Events events) {
        this.activity = activity;
        this.session = session;
        this.events = events;
    }

    String session() { return session; }
    Activity activity() { return activity; }
    String failure() { return failure; }
    boolean closed() { return closed; }

    /** 在 launcher 窗口上创建宿主；失败时返回 false 并在 {@link #failure()} 留下确切原因。 */
    boolean attach() {
        if (closed) { failure = "host already closed"; return false; }
        if (activity.isFinishing()) { failure = "launcher finishing"; return false; }
        if (activity.isDestroyed()) { failure = "launcher destroyed"; return false; }
        View decor = activity.getWindow().getDecorView();
        Display display = decor.getDisplay();
        if (display == null || display.getDisplayId() <= 0) {
            failure = "launcher window is not on a rear display";
            return false;
        }
        if (!(decor instanceof ViewGroup)) { failure = "launcher decor is not a ViewGroup"; return false; }
        ViewGroup group = (ViewGroup) decor;
        if (group.findViewWithTag(TAG) != null) { failure = "another Tingyu host view already exists in this window"; return false; }
        try {
            stage = new RearInteractionFrame(activity, new RearInteractionFrame.Actions() {
                @Override public boolean canInteract() { return ready && shown && !closed && !suspended; }
                @Override public void exit() { userExit(); }
            });
            stage.setTag(TAG);
            stage.setAlpha(0f);
            stage.setBackgroundColor(Color.TRANSPARENT);
            stage.setClickable(true);
            stage.setFocusable(false);
            stage.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);

            renderer = new WebView(activity) {
                @Override protected void onDraw(Canvas canvas) {
                    super.onDraw(canvas);
                    if (!closed && ready && shown && !readyReported && isShown() && getWidth() > 0 && getHeight() > 0) {
                        readyReported = true;
                        if (stage != null) stage.setAlpha(1f);
                        events.report(session,"drawn",displayId(),"visible WebView onDraw boundary; not hardware presentation proof");
                        events.report(session, "ready", displayId(), "rear-centre host first frame on display " + displayId());
                    }
                }
            };
            renderer.getSettings().setJavaScriptEnabled(true);
            renderer.getSettings().setDomStorageEnabled(true);
            renderer.getSettings().setAllowFileAccess(false);
            renderer.getSettings().setAllowContentAccess(false);
            renderer.getSettings().setMediaPlaybackRequiresUserGesture(true);
            renderer.getSettings().setTextZoom(100);
            renderer.getSettings().setUseWideViewPort(true);
            renderer.getSettings().setLoadWithOverviewMode(false);
            renderer.setBackgroundColor(Color.TRANSPARENT);
            renderer.setHorizontalScrollBarEnabled(false);
            renderer.setVerticalScrollBarEnabled(false);
            renderer.setOnLongClickListener(view -> true);
            renderer.setLongClickable(false);
            // 首帧之前不接受任何触摸：alpha=0 时视图仍然参与命中测试，不能让点击穿透到舞台。
            renderer.setOnTouchListener((view, event) -> !ready || closed);

            client = new RearHostWebClient(activity.getApplicationContext(), session, new RearHostWebClient.Events() {
                @Override public void ready() {
                    if (closed || !events.current(session)) return;
                    ready = true;
                    events.report(session,"page-ready",displayId(),"rear document ready; shown="+shown);
                    // An alpha-zero parent may be culled before the child ever reaches onDraw.
                    if(shown && stage!=null)stage.setAlpha(1f);
                    main.post(()->{if(!closed&&renderer!=null){reconcile();renderer.postInvalidateOnAnimation();}});
                }
                @Override public void failed(String reason) {
                    if (main.getLooper() == Looper.myLooper()) fail(reason);
                    else main.post(() -> fail(reason));
                }
            });
            renderer.setWebViewClient(client);
            stage.addView(renderer, new FrameLayout.LayoutParams(-1, -1));
            group.addView(stage, new FrameLayout.LayoutParams(-1, -1));
            stage.addOnLayoutChangeListener((view, l, t, r, b, ol, ot, or, ob) -> {
                if (renderer != null) {
                    RearLyricsViewportMetrics.fit(stage, renderer);
                    RearLyricsViewportMetrics.capture(renderer);
                }
            });
            stage.addOnAttachStateChangeListener(new View.OnAttachStateChangeListener() {
                @Override public void onViewAttachedToWindow(View view) {}
                @Override public void onViewDetachedFromWindow(View view) {
                    if (closed) return;
                    int id = displayId();
                    close();
                    events.report(session, "paused", id, "host view detached from the launcher window");
                }
            });

            displays = (DisplayManager) activity.getSystemService(Activity.DISPLAY_SERVICE);
            if (displays != null) displays.registerDisplayListener(displayListener, main);
            updates = new ContentObserver(main) {
                @Override public void onChange(boolean self) { if (client != null) client.invalidate(); }
            };
            activity.getContentResolver().registerContentObserver(
                Uri.parse("content://" + RearHostContract.AUTHORITY + "/state"), false, updates);

            renderer.loadUrl(URL);
            reconcile();
            failure = "attached";
            return true;
        } catch (Throwable error) {
            failure = "host view unsupported: " + error.getClass().getSimpleName();
            close();
            return false;
        }
    }

    void resumed(boolean value) { if (!closed) { resumed = value; reconcile(); } }

    void suspended(boolean value) { if (!closed) { suspended = value; reconcile(); } }

    /** 应用侧 PROBE / 心跳：重新核对一次可见性，不重建任何东西。 */
    void refresh() { if (!closed) reconcile(); }

    /** 当前 launcher 窗口的显示 id；窗口不在背屏时返回 -1。 */
    int displayId() {
        View decor = activity.getWindow().getDecorView();
        Display display = decor.getDisplay();
        return display == null ? -1 : display.getDisplayId();
    }

    private int panelState() {
        View decor = activity.getWindow().getDecorView();
        Display display = decor.getDisplay();
        return display == null ? Display.STATE_UNKNOWN : display.getState();
    }

    private void reconcile() {
        if (closed || stage == null) return;
        if (Looper.myLooper() != main.getLooper()) { main.post(this::reconcile); return; }
        boolean visible = RearHostPolicy.render(events.current(session), suspended, resumed,
            stage.isAttachedToWindow(), displayId(), panelState());
        if (visible) show();
        else hide(hiddenReason());
    }

    private String hiddenReason() {
        if (!events.current(session)) return "lease-lost";
        if (suspended) return "camera";
        int state = panelState();
        if (state != Display.STATE_ON) return state == Display.STATE_DOZE || state == Display.STATE_DOZE_SUSPEND ? "aod" : "display-off";
        if (!resumed) return "launcher-paused";
        if (!stage.isAttachedToWindow()) return "detached";
        return "host-hidden";
    }

    private void show() {
        if (closed || stage == null) return;
        if (stage.getVisibility() != View.VISIBLE) stage.setVisibility(View.VISIBLE);
        if (renderPaused) {
            renderPaused = false;
            if (renderer != null) {
                renderer.onResume();
                dispatch("folia-rear-power", "{\"sleeping\":false}");
            }
        }
        if (shown) {if(ready&&!readyReported&&renderer!=null)renderer.postInvalidateOnAnimation();return;}
        shown = true;
        if (ready) {
            stage.setAlpha(1f);
            dispatch("folia-rear-resync", "{\"reason\":\"host-visible\"}");
            if (renderer != null) renderer.invalidate();
            // 首帧事件对应用侧同时是「宿主正在显示」。相机/AOD 让位后重新可见时必须再报一次，
            // 否则 hostActive 会永久停在 false。
            readyReported=false;
            if(renderer!=null)renderer.postInvalidateOnAnimation();
        }
    }

    private void hide(String reason) {
        if (closed || stage == null) return;
        boolean was = shown;
        shown = false;
        if (stage.getVisibility() != View.INVISIBLE) stage.setVisibility(View.INVISIBLE);
        pauseRenderer();
        if (was) events.report(session, "paused", displayId(), reason);
    }

    private void pauseRenderer() {
        if (renderPaused || renderer == null) return;
        renderPaused = true;
        dispatch("folia-rear-power", "{\"sleeping\":true}");
        renderer.onPause();
    }

    private void dispatch(String event, String detail) {
        if (renderer == null || !ready) return;
        renderer.evaluateJavascript("window.dispatchEvent(new CustomEvent('" + event + "',{detail:" + detail + "}))", null);
    }

    /** 上滑：先移除视图再上报，原生界面立刻可见；不合成任何系统导航。 */
    private void userExit() {
        if (closed) return;
        long now = android.os.SystemClock.uptimeMillis();
        if (!RearHostPolicy.userExit(shown, suspended, renderPaused, now, now)) return;
        int id = displayId();
        close();
        events.report(session, "user-exit", id, "upward swipe on the rear-centre host; native launcher untouched");
    }

    private void fail(String reason) {
        if (closed) return;
        int id = displayId();
        close();
        events.report(session, "failed", id, reason);
    }

    /** 释放：摘掉自己、销毁 WebView、注销监听。原生视图树从未被修改，因此没有「恢复」步骤。 */
    void close() {
        if (Looper.myLooper() != main.getLooper()) { main.post(this::close); return; }
        if (closed) return;
        closed = true;
        if (displays != null) { try { displays.unregisterDisplayListener(displayListener); } catch (Throwable ignored) {} displays = null; }
        if (updates != null) { try { activity.getContentResolver().unregisterContentObserver(updates); } catch (Throwable ignored) {} updates = null; }
        client = null;
        WebView old = renderer;
        renderer = null;
        if (old != null) {
            try { old.stopLoading(); } catch (Throwable ignored) {}
            try { old.setWebViewClient(new android.webkit.WebViewClient()); } catch (Throwable ignored) {}
            if (stage != null) { try { stage.removeView(old); } catch (Throwable ignored) {} }
            try { old.destroy(); } catch (Throwable ignored) {}
        }
        FrameLayout frame = stage;
        stage = null;
        if (frame != null) {
            ViewGroup parent = frame.getParent() instanceof ViewGroup ? (ViewGroup) frame.getParent() : null;
            if (parent != null) { try { parent.removeView(frame); } catch (Throwable ignored) {} }
            try { frame.removeAllViews(); } catch (Throwable ignored) {}
        }
        ready = false; readyReported = false; shown = false;
    }
}
