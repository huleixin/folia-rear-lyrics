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
 * 真实 MAML music_control 容器里的听屿舞台。构造时必须提供已验证的原生卡片实例，
 * 不允许挂到 launcher DecorView。页面准备后才暂停该实例的原绘制，退出时对称恢复。
 *
 * <p>复用现有歌词舞台的全部资源链：同一个 {@code https://rear.folia.local/rear-lyrics.html}、
 * 同一个 {@link RearHostWebClient} 资源桥、同一个 {@link RearLyricsViewportMetrics} 视口
 * 计算、同一组 {@code folia-rear-power} / {@code folia-rear-resync} 事件。视觉与动效不改。
 *
 * <p>短点击送到 WebView；拖动不送到网页，不禁止父容器拦截。系统导航只暂停/恢复
 * 内容，不根据滑动方向推断永久退出。释放由显式停止、身份失效或真实容器销毁负责。
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
    private final RearNativeCardOwner card;
    private final String session;
    private final Events events;
    private final Handler main = new Handler(Looper.getMainLooper());
    private FrameLayout stage;
    private android.widget.TextView aodLabel;
    private RearCardAod aodRenderer;
    private boolean followAod=true;
    private RearCardRenderPolicy.Mode mode=RearCardRenderPolicy.Mode.HIDDEN;
    private WebView renderer;
    private RearHostWebClient client;
    private ContentObserver updates;
    private DisplayManager displays;
    private boolean ready, readyReported, shown, renderPaused, resumed = true, suspended, aod, closed;
    private String failure = "not attached";
    private final java.util.Set<String> bootEvents=new java.util.HashSet<>();
    private void boot(String event,String detail){
        if(closed||bootEvents.size()>=48||!bootEvents.add(event))return;
        events.report(session,"web-stage",displayId(),event+":"+detail);
    }
    private void viewState(){if(renderer!=null&&stage!=null)boot("view-state","shown="+shown+", attached="+renderer.isAttachedToWindow()+", visible="+renderer.isShown()+", alpha="+stage.getAlpha()+", size="+renderer.getWidth()+"x"+renderer.getHeight());}

    private final DisplayManager.DisplayListener displayListener = new DisplayManager.DisplayListener() {
        @Override public void onDisplayAdded(int id) {}
        @Override public void onDisplayRemoved(int id) { if (id == displayId()) reconcile(); }
        @Override public void onDisplayChanged(int id) { if (id == displayId()) reconcile(); }
    };

    RearHostView(Activity activity,String session,Events events,RearNativeCardOwner card){
        this.card=java.util.Objects.requireNonNull(card,"Native MAML music card required");
        this.activity = activity;
        this.session = session;
        this.events = events;
    }

    String session() { return session; }
    Activity activity() { return activity; }
    String failure() { return failure; }
    boolean closed() { return closed; }

    /** 在已选中听屿会话的 MAML 卡片内创建舞台，保留失败阶段。 */
    boolean attach() {
        if (closed) { failure = "host already closed"; return false; }
        if (activity.isFinishing()) { failure = "launcher finishing"; return false; }
        if (activity.isDestroyed()) { failure = "launcher destroyed"; return false; }
        View decor = card.container;
        Display display = decor.getDisplay();
        if (display == null || display.getDisplayId() <= 0) {
            failure = "launcher window is not on a rear display";
            return false;
        }
        if (!(decor instanceof ViewGroup)) { failure = "launcher decor is not a ViewGroup"; return false; }
        ViewGroup group = (ViewGroup) decor;
        if (group.findViewWithTag(TAG) != null) { failure = "another Tingyu host view already exists in this window"; return false; }
        try {
            stage=new FrameLayout(activity){
                @Override public void onVisibilityAggregated(boolean visible){super.onVisibilityAggregated(visible);main.post(()->{if(!closed)reconcile();});}
                private android.view.MotionEvent down;private boolean moved;
                @Override protected void onDetachedFromWindow(){if(down!=null){down.recycle();down=null;}super.onDetachedFromWindow();}
                @Override public void requestDisallowInterceptTouchEvent(boolean value){super.requestDisallowInterceptTouchEvent(false);}
                @Override public boolean dispatchTouchEvent(android.view.MotionEvent e){
                    if(mode!=RearCardRenderPolicy.Mode.NORMAL||!ready||!shown||closed)return false;
                    if(e.getActionMasked()==0){if(down!=null)down.recycle();down=android.view.MotionEvent.obtain(e);moved=false;}
                    else if(e.getActionMasked()==2&&down!=null){float dx=e.getX()-down.getX(),dy=e.getY()-down.getY();int slop=android.view.ViewConfiguration.get(activity).getScaledTouchSlop();if(dx*dx+dy*dy>slop*slop)moved=true;}
                    else if(e.getActionMasked()==1&&down!=null){if(!moved&&renderer!=null){renderer.dispatchTouchEvent(down);renderer.dispatchTouchEvent(e);}down.recycle();down=null;}
                    if(e.getPointerCount()>1||e.getActionMasked()==3){moved=true;if(down!=null){down.recycle();down=null;}}
                    return true;
                }
            };
            if(card!=null)card.watch(()->{if(!closed){
                if(!card.ownMedia()){
                    int id=displayId();close();
                    events.report(session,"paused",id,"selected session changed; native card restored, waiting for own music business");
                }else reconcile();
            }});
            stage.setTag(TAG);
            stage.setAlpha(1f);
            stage.setBackgroundColor(Color.TRANSPARENT);
            stage.setClickable(true);
            stage.setFocusable(false);
            stage.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);

            renderer = new WebView(activity) {
                @Override protected void onDraw(Canvas canvas) {
                    super.onDraw(canvas);
                    boot("first-draw","ready="+ready+", shown="+shown);
                    if (!closed && ready && shown && card.owned()&&card.ownMedia()&&card.binding.current() && !readyReported && isShown() && getWidth() > 0 && getHeight() > 0) {
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
            // 配置到达前不接受舞台点击；不采用 alpha=0 等待绘制的循环依赖。
            renderer.setOnTouchListener((view, event) -> !ready || closed);

            client = new RearHostWebClient(activity.getApplicationContext(), session, new RearHostWebClient.Events() {
                @Override public void diagnostic(String event,String detail){main.post(()->boot(event,detail));}
                @Override public void ready() {
                    if (closed || !events.current(session)) return;
                    ready = true;
                    followAod=client.followAod();
                    events.report(session,"page-ready",displayId(),"rear document ready; shown="+shown);
                    // An alpha-zero parent may be culled before the child ever reaches onDraw.
                    try{if(shown && stage!=null){if(card!=null)card.acquire(stage);stage.setAlpha(1f);}}catch(Throwable error){fail("Native card acquire failed: "+error.getClass().getSimpleName());return;}
                    main.post(()->{if(!closed&&renderer!=null){reconcile();renderer.postInvalidateOnAnimation();}});
                }
                @Override public void failed(String reason) {
                    if (main.getLooper() == Looper.myLooper()) fail(reason);
                    else main.post(() -> fail(reason));
                }
            });
            aodLabel=new android.widget.TextView(activity);
            aodLabel.setTextColor(0xff999999);aodLabel.setBackgroundColor(Color.BLACK);
            aodLabel.setGravity(android.view.Gravity.CENTER);aodLabel.setTextSize(18);
            aodLabel.setPadding(40,24,24,24);aodLabel.setVisibility(View.GONE);
            aodRenderer=new RearCardAod(client,aodLabel);
            renderer.setWebViewClient(client);
            renderer.setWebChromeClient(new android.webkit.WebChromeClient(){
                @Override public boolean onConsoleMessage(android.webkit.ConsoleMessage message){
                    if(message.messageLevel()==android.webkit.ConsoleMessage.MessageLevel.ERROR)
                        boot("web-error","console line="+message.lineNumber()+"; see boot stage, content omitted for privacy");
                    return true;
                }
            });
            boot("webview-created","javascript="+renderer.getSettings().getJavaScriptEnabled());
            stage.addView(renderer, new FrameLayout.LayoutParams(-1, -1));
            stage.addView(aodLabel,new FrameLayout.LayoutParams(-1,-1));
            group.addView(stage, new FrameLayout.LayoutParams(-1, -1));
            stage.addOnLayoutChangeListener((view, l, t, r, b, ol, ot, or, ob) -> {
                if (renderer != null) {
                    RearLyricsViewportMetrics.fit(stage, renderer);
                    RearLyricsViewportMetrics.capture(renderer);
                    FrameLayout.LayoutParams fit=(FrameLayout.LayoutParams)renderer.getLayoutParams();
                    FrameLayout.LayoutParams aodFit=new FrameLayout.LayoutParams(fit.width,fit.height);
                    aodFit.leftMargin=fit.leftMargin;aodFit.topMargin=fit.topMargin;aodLabel.setLayoutParams(aodFit);
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
                @Override public void onChange(boolean self) { if (client != null) client.invalidate(); if(aodRenderer!=null){followAod=client.followAod();reconcile();aodRenderer.refresh();} }
            };
            activity.getContentResolver().registerContentObserver(
                Uri.parse("content://" + RearHostContract.AUTHORITY + "/state"), false, updates);

            boot("load-url","rear-lyrics.html");
            renderer.loadUrl(URL);
            main.postDelayed(()->{if(!closed)viewState();},1200);
            reconcile();
            failure = "attached";
            return true;
        } catch (Throwable error) {
            failure = "host view unsupported: " + error.getClass().getSimpleName();
            close();
            return false;
        }
    }

    void resumed(boolean value) { if (!closed) {
        resumed = value; reconcile();
    } }

    void aod(boolean value){if(!closed){aod=value;reconcile();}}

    void suspended(boolean value) { if (!closed) { suspended = value; reconcile(); } }

    /** 应用侧 PROBE / 心跳：重新核对一次可见性，不重建任何东西。 */
    void refresh() { if (!closed) reconcile(); }

    /** 当前 launcher 窗口的显示 id；窗口不在背屏时返回 -1。 */
    int displayId() {
        View decor = card.container;
        Display display = decor.getDisplay();
        return display == null ? -1 : display.getDisplayId();
    }

    private int panelState() {
        View decor = card.container;
        Display display = decor.getDisplay();
        return display == null ? Display.STATE_UNKNOWN : display.getState();
    }

    private void reconcile() {
        if (closed || stage == null) return;
        if (Looper.myLooper() != main.getLooper()) { main.post(this::reconcile); return; }
        if(!card.binding.associated()){
            int id=displayId();close();
            events.report(session,"paused",id,"system recycled business holder; native content restored");
            return;
        }
        RearCardRenderPolicy.Mode next=RearCardRenderPolicy.mode(events.current(session),card.ownMedia(),
            card.binding.current()&&card.container.isShown()&&stage.isAttachedToWindow(),suspended,followAod,aod,panelState());
        if(next!=mode){
            mode=next;
            events.report(session,"render-mode",displayId(),"implementation=NATIVE_CARD, mode="+mode+", power="+panelState()+", aodCommand="+aod+", own="+card.ownMedia());
            if(aodRenderer!=null)aodRenderer.active(mode==RearCardRenderPolicy.Mode.AOD);
        }
        if(mode==RearCardRenderPolicy.Mode.AOD){
            pauseRenderer();renderer.setVisibility(View.INVISIBLE);
            if(ready){try{card.acquire(stage);}catch(Throwable error){fail("AOD ownership failed");return;}}
            stage.setVisibility(View.VISIBLE);aodLabel.setVisibility(View.VISIBLE);
            shown=false;readyReported=false;
        }else{
            aodLabel.setVisibility(View.GONE);renderer.setVisibility(View.VISIBLE);
            if(mode==RearCardRenderPolicy.Mode.NORMAL&&resumed)show();else hide(hiddenReason());
        }
    }

    private String hiddenReason() {
        if (!events.current(session)) return "lease-lost";
        if (suspended) return "camera";
        if (aod) return "aod-command";
        int state = panelState();
        if (state != Display.STATE_ON) return state == Display.STATE_DOZE || state == Display.STATE_DOZE_SUSPEND ? "aod" : "display-off";
        if (!resumed) return "launcher-paused";
        if (!stage.isAttachedToWindow()) return "detached";
        if (!card.binding.current()) return "system-card-navigation";
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
        events.report(session,"rendering",displayId(),"own SmartAssistant music card visible; awaiting real stage draw");
        if (ready) {
            if(card!=null)try{card.acquire(stage);}catch(Throwable error){fail("Native reacquire failed: "+error.getClass().getSimpleName());return;}
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
        // Preserve the last frame while the system animates its card offscreen.
        boolean retain=RearHostPolicy.retainCardOnNavigation(events.current(session),card.ownMedia()&&card.binding.associated(),
            stage.isAttachedToWindow(),suspended,aod||panelState()!=Display.STATE_ON);
        if(!retain)card.restore();
        boolean was = shown;
        shown = false;
        if (!retain && stage.getVisibility() != View.INVISIBLE) stage.setVisibility(View.INVISIBLE);
        pauseRenderer();
        if (was) events.report(session, "paused", displayId(), reason+"; nativeNavigationRetained="+retain+"; display session unchanged");
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

    private void fail(String reason) {
        if (closed) return;
        int id = displayId();
        close();
        events.report(session, "failed", id, reason);
    }

    /** 先恢复原生卡片，再销毁舞台、注销监听。恢复结果由 Controller 再次核验。 */
    void close() {
        if (Looper.myLooper() != main.getLooper()) { main.post(this::close); return; }
        if (closed) return;
        closed = true;
        if(aodRenderer!=null)aodRenderer.close();
        if(card!=null){card.restore();try{card.unwatch();}catch(Throwable error){boot("web-error","media callback cleanup "+error.getClass().getSimpleName());}}
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
