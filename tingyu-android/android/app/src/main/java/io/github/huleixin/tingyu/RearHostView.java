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

    private final android.content.Context context;
    private final RearNativeCardOwner card;
    private final String session;
    private final Events events;
    private final Handler main = new Handler(Looper.getMainLooper());
    private FrameLayout stage;
    private final RearAodPreference preference=new RearAodPreference();
    private final RearCardRenderPolicy.Transition transition=new RearCardRenderPolicy.Transition();
    private final RearCardRenderPolicy.FrameEvidence frameEvidence=new RearCardRenderPolicy.FrameEvidence();
    private final RearAodEvidenceGate evidenceGate=new RearAodEvidenceGate();
    private String trigger="created",decisionReason="initial";
    private long modeEpoch,lastSentEpoch=-1,lastReportedEpoch=-1,drawEpoch=-1,requestedFrameEpoch=-1,resumeEpoch=-1,drawCount;
    private boolean iframeApplied,visualStateReady;
    private final Runnable transitionTimeout=()->reconcile("transition-deadline");
    private final Runnable drawTimeout=this::checkDrawTimeout;
    private RearCardRenderPolicy.Mode mode=RearCardRenderPolicy.Mode.HIDDEN;
    private WebView renderer;
    private RearHostWebClient client;
    private ContentObserver updates;
    private DisplayManager displays;
    private boolean ready, readyReported, shown, renderPaused, resumed = true, aod, closed;
    private long loadStartedAt;
    private final Runnable preparationTimeout=this::freezePreparation;
    private void freezePreparation(){if(!closed&&!ready&&!shown){pauseRenderer();events.report(session,"prepared-idle",displayId(),"hidden stage preparation budget reached; paused until system selects this own card, no ownership acquired");}}
    private String failure = "not attached";
    private final java.util.Set<String> bootEvents=new java.util.HashSet<>();
    private void boot(String event,String detail){
        if(closed||bootEvents.size()>=48||!bootEvents.add(event))return;
        events.report(session,"web-stage",displayId(),event+":"+detail);
    }
    private void viewState(){if(renderer!=null&&stage!=null)boot("view-state","shown="+shown+", attached="+renderer.isAttachedToWindow()+", visible="+renderer.isShown()+", alpha="+stage.getAlpha()+", size="+renderer.getWidth()+"x"+renderer.getHeight());}

    private final DisplayManager.DisplayListener displayListener = new DisplayManager.DisplayListener() {
        @Override public void onDisplayAdded(int id) {}
        @Override public void onDisplayRemoved(int id) { if (id == displayId()) reconcile("display-state"); }
        @Override public void onDisplayChanged(int id) { if (id == displayId()) reconcile("display-state"); }
    };

    RearHostView(String session,Events events,RearNativeCardOwner card){
        this.card=java.util.Objects.requireNonNull(card,"Native MAML music card required");
        this.context = card.container.getContext();
        this.session = session;
        this.events = events;
    }

    String session() { return session; }
    Activity activity() { return RearCardContext.activity(context); }
    String failure() { return failure; }
    boolean closed() { return closed; }

    /** 在已选中听屿会话的 MAML 卡片内创建舞台，保留失败阶段。 */
    boolean attach() {
        if (closed) { failure = "host already closed"; return false; }
        if (!RearCardContext.usable(context)) { failure = "card context missing or owning Activity destroyed"; return false; }
        if(!card.binding.associated()||!card.ownMedia()||!card.container.isAttachedToWindow()){failure="card identity or attachment changed";return false;}
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
            stage=new FrameLayout(context){
                @Override public void onVisibilityAggregated(boolean visible){super.onVisibilityAggregated(visible);main.post(()->{if(!closed)reconcile("visibility");});}
                private android.view.MotionEvent down;private boolean moved;
                @Override protected void onDetachedFromWindow(){if(down!=null){down.recycle();down=null;}super.onDetachedFromWindow();}
                @Override public void requestDisallowInterceptTouchEvent(boolean value){super.requestDisallowInterceptTouchEvent(false);}
                @Override public boolean dispatchTouchEvent(android.view.MotionEvent e){
                    if(mode!=RearCardRenderPolicy.Mode.NORMAL||!ready||!shown||closed)return false;
                    if(e.getActionMasked()==0){if(down!=null)down.recycle();down=android.view.MotionEvent.obtain(e);moved=false;}
                    else if(e.getActionMasked()==2&&down!=null){float dx=e.getX()-down.getX(),dy=e.getY()-down.getY();int slop=android.view.ViewConfiguration.get(context).getScaledTouchSlop();if(dx*dx+dy*dy>slop*slop)moved=true;}
                    else if(e.getActionMasked()==1&&down!=null){if(!moved&&renderer!=null){renderer.dispatchTouchEvent(down);renderer.dispatchTouchEvent(e);}down.recycle();down=null;}
                    if(e.getPointerCount()>1||e.getActionMasked()==3){moved=true;if(down!=null){down.recycle();down=null;}}
                    return true;
                }
            };
            if(card!=null)card.watch(()->{if(!closed){
                if(!card.ownMedia()){
                    int id=displayId();close();
                    events.report(session,"paused",id,"selected session changed; native card restored, waiting for own music business");
                }else reconcile("media-state");
            }});
            stage.setTag(TAG);
            stage.setAlpha(1f);
            stage.setBackgroundColor(Color.TRANSPARENT);
            stage.setClickable(true);
            stage.setFocusable(false);
            stage.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);

            renderer = new WebView(context) {
                @Override protected void onDraw(Canvas canvas) {
                    super.onDraw(canvas);
                    drawCount++;
                    if(closed||!ready||!shown||mode==RearCardRenderPolicy.Mode.HIDDEN)return;
                    RearSystemCardBinding.State binding=card.binding.snapshot();
                    if(drawEpoch!=modeEpoch){drawEpoch=modeEpoch;trace("native-draw","onDraw=true; presentation=unmeasured");}
                    boolean qualified=frameEvidence.recordDraw(modeEpoch);
                    if(qualified)main.removeCallbacks(drawTimeout);
                    if(!card.owned()&&qualified&&binding.current()&&card.ownMedia()&&card.sameRoot()&&card.container.isShown()&&stage.isAttachedToWindow()){
                        try{card.acquire(stage);trace("handoff-acquired","verified native draw; presentation=unmeasured");}
                        catch(Throwable error){fail("Native draw handoff failed: "+error.getClass().getSimpleName());return;}
                    }
                    if(!readyReported&&qualified&&card.owned()&&card.ownMedia()&&binding.current()&&isShown()&&getWidth()>0&&getHeight()>0){
                        readyReported=true;
                        events.report(session,"drawn",displayId(),"WebView onDraw after visual-state fence; mode="+mode+"; epoch="+modeEpoch+"; presentation=unmeasured");
                        events.report(session,"ready",displayId(),"verified own card stage draw; not physical presentation proof");
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

            client = new RearHostWebClient(RearHostContext.resolve(context), session, new RearHostWebClient.Events() {
                @Override public void diagnostic(String event,String detail){main.post(()->boot(event,detail));}
                @Override public void modeApplied(long sequence,String applied,boolean iframe,boolean hidden,boolean frameHidden){
                    main.post(()->{if(closed||sequence!=modeEpoch||!mode.name().equals(applied))return;
                        iframeApplied=iframe;trace("iframe-ack","iframeApplied="+iframe+", documentHidden="+hidden+", iframeHidden="+frameHidden+"; presentation=unmeasured");});
                }
                @Override public void ready() {
                    if (closed || !events.current(session)) return;
                    ready = true;
                    main.removeCallbacks(preparationTimeout);
                    readPreference();

                    events.report(session,"page-ready",displayId(),"rear document ready; shown="+shown+", preparationMs="+(android.os.SystemClock.uptimeMillis()-loadStartedAt));
                    // An alpha-zero parent may be culled before the child ever reaches onDraw.
                    if(shown&&stage!=null)stage.setAlpha(1f);
                    main.post(()->{if(!closed&&renderer!=null){reconcile("page-ready");renderer.postInvalidateOnAnimation();}});
                }
                @Override public void failed(String reason) {
                    if (main.getLooper() == Looper.myLooper()) fail(reason);
                    else main.post(() -> fail(reason));
                }
            });
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

            displays = (DisplayManager) context.getSystemService(android.content.Context.DISPLAY_SERVICE);
            if (displays != null) displays.registerDisplayListener(displayListener, main);
            updates = new ContentObserver(main) {
                @Override public void onChange(boolean self) { if (client != null) client.invalidate(); if(client!=null){readPreference();reconcile("preference-or-state");dispatch("folia-rear-refresh","{}");} }
            };
            context.getContentResolver().registerContentObserver(
                Uri.parse("content://" + RearHostContract.AUTHORITY + "/state"), false, updates);

            boot("load-url","rear-lyrics.html");
            loadStartedAt=android.os.SystemClock.uptimeMillis();
            renderer.loadUrl(URL);
            main.postDelayed(preparationTimeout,4500);
            if(!card.binding.current())events.report(session,"attaching",displayId(),"verified hidden own music card; no drawing ownership until ready and selected");
            main.postDelayed(()->{if(!closed)viewState();},1200);
            reconcile("attached");
            failure = "attached";
            return true;
        } catch (Throwable error) {
            failure = "host view unsupported: " + error.getClass().getSimpleName();
            close();
            return false;
        }
    }

    void resumed(boolean value) { if (!closed) {
        resumed = value; reconcile("native-lifecycle");
    } }

    void aod(boolean value){if(!closed){aod=value;reconcile("aod-command");}}

    /** 应用侧 PROBE / 心跳：重新核对一次可见性，不重建任何东西。 */
    void refresh() { if (!closed) reconcile("binding-or-probe"); }

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

    private void readPreference(){if(client!=null)preference.update(client.followAod());}
    private void checkDrawTimeout(){if(!closed&&shown&&ready&&!frameEvidence.drawn(modeEpoch))trace("draw-timeout","nativeDraw="+(drawEpoch==modeEpoch)+", renderTreeReady="+visualStateReady+"; presentation=unmeasured; first-frame handoff deferred");}

    private void reconcile(String why) {
        if(closed||stage==null)return;
        if(Looper.myLooper()!=main.getLooper()){main.post(()->reconcile(why));return;}
        trigger=why;
        RearSystemCardBinding.State binding=card.binding.snapshot();
        boolean own=card.ownMedia(),root=card.sameRoot();
        if(!binding.associated||!root||!own){
            trace("identity-invalid","associated="+binding.associated+", sameRoot="+root+", own="+own);
            int id=displayId();close();events.report(session,"paused",id,"native binding/root/media session invalid; waiting for verified rebind");return;
        }
        RearCardRenderPolicy.Decision decision=transition.resolve(events.current(session),own,binding.associated,
            binding.center,binding.active,stage.isAttachedToWindow()&&card.container.isAttachedToWindow(),
            card.container.isShown(),card.owned(),preference.enabled(),aod,panelState(),android.os.SystemClock.elapsedRealtime());
        main.removeCallbacks(transitionTimeout);
        if(decision.remainingMs>0)main.postDelayed(transitionTimeout,decision.remainingMs);
        boolean recovered="verified-aod-transition".equals(decisionReason)&&"current-card".equals(decision.reason);
        decisionReason=decision.reason;
        if(decision.mode!=mode||recovered){mode=decision.mode;modeEpoch++;readyReported=false;iframeApplied=false;visualStateReady=false;}
        // Functional mode events clear the app's active flag: emit exactly once per epoch,
        // separately from rate-limited diagnostic snapshots, and before any rendering/ready event.
        if(lastReportedEpoch!=modeEpoch){
            lastReportedEpoch=modeEpoch;
            events.report(session,"render-mode",displayId(),"mode="+mode+", seq="+modeEpoch+", power="+panelState()+", reason="+decision.reason);
        }
        if(mode==RearCardRenderPolicy.Mode.HIDDEN)hide(decisionReason);
        else if(decision.remainingMs>0){
            // Retain only the verified ownership/document. Never force pixels on an inactive card.
            shown=false;
            if(stage.getVisibility()!=View.INVISIBLE)stage.setVisibility(View.INVISIBLE);
        }else{renderer.setVisibility(View.VISIBLE);show();}
        sendMode();
        if(recovered)dispatch("folia-rear-resync","{\"reason\":\"aod-transition-restored\"}");
        trace("state",decision.reason);armDrawEvidence();
    }

    private void trace(String event,String detail){
        if(stage==null||renderer==null)return;
        RearSystemCardBinding.State b=card.binding.snapshot();
        String key=event+"|"+mode+"|"+panelState()+"|"+trigger+"|"+b.center+"|"+b.active+"|"+b.bound+"|"+card.container.isShown()+"|"+card.owned()+"|"+renderPaused+"|"+preference.status()+"|"+detail;
        if(!evidenceGate.allow(key,android.os.SystemClock.uptimeMillis()))return;
        events.report(session,"web-stage",displayId(),"aod/"+event+", trigger="+trigger+", reason="+decisionReason+", power="+panelState()
            +", mode="+mode+", seq="+modeEpoch+", aodCommand="+aod+", cameraPolicy=system-card, lease="+events.current(session)+", center="+b.center+", active="+b.active+", bound="+b.bound+", associated="+b.associated
            +", attached="+stage.isAttachedToWindow()+", shown="+card.container.isShown()+", webShown="+renderer.isShown()
            +", own="+card.ownMedia()+", sameRoot="+card.sameRoot()+", owned="+card.owned()+", webPauseRequested="+renderPaused+", webResumeEpoch="+resumeEpoch+", nativeResumed="+resumed
            +", preference="+preference.status()+", iframeApplied="+iframeApplied+", visualState="+visualStateReady+", draws="+drawCount
            +", elapsedMs="+android.os.SystemClock.elapsedRealtime()+", uptimeMs="+android.os.SystemClock.uptimeMillis()+", suppressed="+evidenceGate.takeSuppressed()+", "+detail);
    }

    private void sendMode(){
        if(!ready||renderer==null||lastSentEpoch==modeEpoch)return;
        long epoch=modeEpoch;lastSentEpoch=epoch;
        String detail="{\"mode\":\""+mode+"\",\"sequence\":"+epoch+"}";
        String script="(()=>{window.dispatchEvent(new CustomEvent('folia-rear-mode',{detail:"+detail+"}));"
            +"const a=window.__foliaRearModeReceipt,b=document.querySelector('iframe')?.contentWindow?.__foliaRearModeReceipt;"
            +"return JSON.stringify({outer:a?.sequence==="+epoch+",iframe:b?.sequence==="+epoch+"});})()";
        try{renderer.evaluateJavascript(script,value->{
            if(closed||epoch!=modeEpoch)return;
            try{Object raw=new org.json.JSONTokener(value).nextValue();org.json.JSONObject ack=new org.json.JSONObject(String.valueOf(raw));
                iframeApplied=ack.optBoolean("iframe");trace("mode-delivery","outerApplied="+ack.optBoolean("outer")+", iframeApplied="+iframeApplied+"; presentation=unmeasured");
            }catch(Exception error){trace("mode-delivery","evaluation-unavailable; presentation=unmeasured");}
        });}catch(Throwable error){lastSentEpoch=-1;trace("mode-delivery","evaluate-failed="+error.getClass().getSimpleName());}
    }

    /** One visual-state fence and timeout per visible mode epoch; neither proves physical presentation. */
    private void armDrawEvidence(){
        if(!ready||!shown||renderer==null||mode==RearCardRenderPolicy.Mode.HIDDEN||requestedFrameEpoch==modeEpoch)return;
        long epoch=modeEpoch;requestedFrameEpoch=epoch;
        frameEvidence.begin(epoch);
        main.removeCallbacks(drawTimeout);main.postDelayed(drawTimeout,2500);
        try{
        if(resumeEpoch!=epoch){renderer.onResume();resumeEpoch=epoch;}
        renderer.postVisualStateCallback(epoch,new WebView.VisualStateCallback(){
            @Override public void onComplete(long id){if(closed||id!=modeEpoch||!shown)return;
                visualStateReady=frameEvidence.visualReady(id);trace("visual-state","render-tree-ready; presentation=unmeasured");renderer.postInvalidateOnAnimation();}
        });
        }catch(Throwable error){trace("visual-state","unavailable="+error.getClass().getSimpleName()+"; presentation=unmeasured");}
        renderer.postInvalidateOnAnimation();
    }

    private void show() {
        if (closed || stage == null) return;
        if (stage.getVisibility() != View.VISIBLE) stage.setVisibility(View.VISIBLE);
        if (renderPaused) {
            renderPaused = false;
            if (renderer != null) {
                renderer.onResume();
                resumeEpoch=modeEpoch;
                dispatch("folia-rear-power", "{\"sleeping\":false}");
            }
        }
        if(ready&&card.owned()&&card.binding.current()&&card.container.isShown())try{card.acquire(stage);}catch(Throwable error){fail("Native visibility refresh failed: "+error.getClass().getSimpleName());return;}
        if (shown) {if(ready&&!readyReported&&renderer!=null)renderer.postInvalidateOnAnimation();return;}
        shown = true;
        events.report(session,"rendering",displayId(),"own SmartAssistant music card visible; awaiting real stage draw");
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
        // Keep valid ownership across power transitions, but never paint while OFF or AOD is disabled.
        int power=panelState();
        boolean systemAod=!preference.enabled()&&(aod||power==Display.STATE_DOZE||power==Display.STATE_DOZE_SUSPEND);
        boolean retain=RearHostPolicy.retainCardOwnership(events.current(session),card.ownMedia()&&card.binding.associated(),
            stage.isAttachedToWindow()&&card.sameRoot(),systemAod,card.binding.current()&&card.container.isShown(),power);
        boolean retainFrame=retain&&power==Display.STATE_ON&&!aod;
        if(!retain)card.restore();
        boolean was = shown;
        shown = false;
        if (!retainFrame && stage.getVisibility() != View.INVISIBLE) stage.setVisibility(View.INVISIBLE);
        // Hidden preparation is bounded, and only permitted while the physical panel is already ON.
        if(ready||power!=Display.STATE_ON||!events.current(session))pauseRenderer();
        if (was) events.report(session, "paused", displayId(), reason+"; ownershipRetained="+retain+", frozenFrame="+retainFrame+", power="+power+"; display session unchanged");
    }

    private void pauseRenderer() {
        main.removeCallbacks(drawTimeout);
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
        mode=RearCardRenderPolicy.Mode.HIDDEN;modeEpoch++;trace("closing","native restoration requested; presentation=unmeasured");
        closed = true;
        main.removeCallbacks(preparationTimeout);
        main.removeCallbacks(transitionTimeout);main.removeCallbacks(drawTimeout);
        if(card!=null){card.restore();try{card.unwatch();}catch(Throwable error){boot("web-error","media callback cleanup "+error.getClass().getSimpleName());}}
        if (displays != null) { try { displays.unregisterDisplayListener(displayListener); } catch (Throwable ignored) {} displays = null; }
        if (updates != null) { try { context.getContentResolver().unregisterContentObserver(updates); } catch (Throwable ignored) {} updates = null; }
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
