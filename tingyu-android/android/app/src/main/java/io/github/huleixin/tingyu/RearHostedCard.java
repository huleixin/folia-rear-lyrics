package io.github.huleixin.tingyu;

import android.content.Context;
import android.hardware.display.DisplayManager;
import android.media.session.MediaController;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.Display;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.FrameLayout;
import de.robv.android.xposed.XposedHelpers;
import java.lang.ref.WeakReference;
import java.util.IdentityHashMap;

// android/app/src/main/java/io/github/huleixin/tingyu/RearHostedCard.java
// Original Tingyu renderer inside one verified MAML music container, with symmetric fail-open.
final class RearHostedCard {
    interface Events { boolean current(String session); void report(String session,String event,int display,String reason); }
    private final WeakReference<FrameLayout> host;
    private final Object root,music;
    private final String session;
    private final Events events;
    private final Handler main=new Handler(Looper.getMainLooper());
    private final IdentityHashMap<View,Integer> nativeVisibility=new IdentityHashMap<>();
    private FrameLayout overlay;
    private WebView renderer;
    private boolean owned,closed,paused,aod,suspended,ready,reported,present;
    private Boolean renderPaused;
    private boolean restorationOk=true;
    private long gestureAt=-1,downAt;
    private float downX,downY;
    private boolean tracking,moved;
    private MotionEvent tapDown;
    private MediaController observed;
    private DisplayManager displays;
    private RearHostWebClient client;
    private android.database.ContentObserver updates;
    private boolean pauseWasOwned;
    private final Runnable checkExit=this::checkExit;
    private void checkExit(){
        FrameLayout view=host.get();int state=view==null||view.getDisplay()==null?0:view.getDisplay().getState();
        if(!closed && RearHostPolicy.userExit(pauseWasOwned,paused||view==null||!view.isShown(),aod||suspended||state!=Display.STATE_ON,gestureAt,SystemClock.uptimeMillis())){
            close();events.report(session,"user-exit",displayId(),"native host pause/visibility after upward touch; no synthetic navigation");
        }
    }
    private final Runnable reconcile=this::reconcile;
    private final DisplayManager.DisplayListener displayListener=new DisplayManager.DisplayListener(){
        public void onDisplayAdded(int id){}
        public void onDisplayRemoved(int id){queue();}
        public void onDisplayChanged(int id){FrameLayout view=host.get();if(view!=null&&view.getDisplay()!=null&&id==view.getDisplay().getDisplayId())queue();}
    };
    private final MediaController.Callback mediaListener=new MediaController.Callback(){
        @Override public void onSessionDestroyed(){queue();}
        @Override public void onPlaybackStateChanged(android.media.session.PlaybackState state){queue();}
    };
    RearHostedCard(FrameLayout view,Object root,Object music,String session,Events events){this.host=new WeakReference<>(view);this.root=root;this.music=music;this.session=session;this.events=events;}
    FrameLayout host(){return host.get();}
    Object root(){return root;}
    Object music(){return music;}
    boolean owned(){return owned&&!closed;}
    boolean closed(){return closed;}
    String session(){return session;}
    private MediaController media(){
        try{Object controller=XposedHelpers.getObjectField(music,"mMusicController");Object value=XposedHelpers.callMethod(controller,"getMediaController");return value instanceof MediaController?(MediaController)value:null;}
        catch(Throwable error){return null;}
    }
    boolean ownMedia(){MediaController value=media();return value!=null&&RearHostContract.APP.equals(value.getPackageName());}
    static boolean capable(Object root){
        for(String method:new String[]{"selfPause","detachFromVsync","attachToVsync","selfResume","requestUpdate"}){
            boolean found=false;
            for(Class<?> c=root.getClass();c!=null&&!found;c=c.getSuperclass())for(java.lang.reflect.Method m:c.getDeclaredMethods())if(method.equals(m.getName())&&m.getParameterCount()==0){found=true;break;}
            if(!found)return false;
        }
        return true;
    }
    boolean start(){
        FrameLayout view=host.get();
        if(view==null||!capable(root)||!ownMedia()||!view.isAttachedToWindow()||view.getDisplay()==null||view.getDisplay().getDisplayId()<=0||!view.isShown())return false;
        try{
            displays=(DisplayManager)view.getContext().getSystemService(Context.DISPLAY_SERVICE);
            if(displays!=null)displays.registerDisplayListener(displayListener,main);
            overlay=new FrameLayout(view.getContext()){
                @Override public void requestDisallowInterceptTouchEvent(boolean ignored){super.requestDisallowInterceptTouchEvent(false);}
                @Override public boolean dispatchTouchEvent(MotionEvent event){return touch(event);}
                @Override public void onVisibilityAggregated(boolean visible){super.onVisibilityAggregated(visible);queue();}
                @Override protected void onDetachedFromWindow(){super.onDetachedFromWindow();queue();}
            };
            overlay.setAlpha(0);view.addView(overlay,new FrameLayout.LayoutParams(-1,-1));
            renderer=new WebView(view.getContext()){
                @Override protected void onDraw(android.graphics.Canvas canvas){
                    super.onDraw(canvas);
                    if(owned&&!reported&&ready&&isShown()&&getWidth()>0&&getHeight()>0){reported=true;events.report(session,"ready",displayId(),"owned music container; application-frame draw boundary");}
                }
            };
            renderer.getSettings().setJavaScriptEnabled(true);renderer.getSettings().setDomStorageEnabled(true);
            renderer.getSettings().setAllowFileAccess(false);renderer.getSettings().setAllowContentAccess(false);
            renderer.getSettings().setMediaPlaybackRequiresUserGesture(true);renderer.getSettings().setTextZoom(100);
            renderer.getSettings().setUseWideViewPort(true);renderer.getSettings().setLoadWithOverviewMode(false);
            renderer.setBackgroundColor(android.graphics.Color.TRANSPARENT);
            renderer.setHorizontalScrollBarEnabled(false);renderer.setVerticalScrollBarEnabled(false);
            renderer.setOnLongClickListener(v->true);renderer.setLongClickable(false);
            client=new RearHostWebClient(view.getContext(),session,new RearHostWebClient.Events(){
                public void ready(){if(closed||!events.current(session))return;ready=true;reconcile();}
                public void failed(String reason){main.post(()->fail(reason));}
            });
            renderer.setWebViewClient(client);
            updates=new android.database.ContentObserver(main){@Override public void onChange(boolean self){if(client!=null)client.invalidate();}};
            view.getContext().getContentResolver().registerContentObserver(android.net.Uri.parse("content://"+RearHostContract.AUTHORITY+"/state"),false,updates);
            overlay.addView(renderer,new FrameLayout.LayoutParams(-1,-1));
            overlay.addOnLayoutChangeListener((v,l,t,r,b,ol,ot,or,ob)->{if(renderer!=null){RearLyricsViewportMetrics.fit(overlay,renderer);RearLyricsViewportMetrics.capture(renderer);}});
            bindMedia();renderer.loadUrl("https://rear.folia.local/rear-lyrics.html");
            return true;
        }catch(Throwable error){fail("WebView/host unsupported: "+error.getClass().getSimpleName());return false;}
    }
    private int displayId(){FrameLayout v=host.get();return v==null||v.getDisplay()==null?-1:v.getDisplay().getDisplayId();}
    private void bindMedia(){
        MediaController current=media();
        if(observed!=null&&current!=null&&observed.getSessionToken().equals(current.getSessionToken()))return;
        if(observed!=null)observed.unregisterCallback(mediaListener);
        observed=current;if(observed!=null)observed.registerCallback(mediaListener,main);
    }
    private void queue(){main.removeCallbacks(reconcile);if(!closed)main.post(reconcile);}
    void hostPaused(boolean value){
        if(closed)return;
        if(value && owned)pauseWasOwned=true;
        paused=value;main.removeCallbacks(checkExit);main.postDelayed(checkExit,100);queue();
    }
    void detached(){
        FrameLayout view=host.get();int power=view==null||view.getDisplay()==null?0:view.getDisplay().getState();
        boolean user=RearHostPolicy.userExit(owned||pauseWasOwned,true,aod||suspended||power!=Display.STATE_ON,gestureAt,SystemClock.uptimeMillis());
        close();events.report(session,user?"user-exit":"paused",displayId(),user?"native container detached after upward touch":"container detached without a user exit");
    }
    void aod(boolean value){aod=value;queue();}
    void suspended(boolean value){suspended=value;queue();}
    void probe(){queue();}
    void mediaChanged(){if(!closed)reconcile();}
    private void reconcile(){
        if(closed)return;
        FrameLayout view=host.get();
        boolean shown=view!=null&&view.isAttachedToWindow()&&view.isShown();
        if(!shown && owned){pauseWasOwned=true;main.removeCallbacks(checkExit);main.postDelayed(checkExit,100);}
        int power=view==null||view.getDisplay()==null?Display.STATE_UNKNOWN:view.getDisplay().getState();
        boolean show=RearHostPolicy.eligible(ownMedia()?RearHostContract.APP:"",events.current(session),suspended,shown,displayId())&&!paused&&!aod&&power==Display.STATE_ON;
        try{
            bindMedia();
            if(!show){
                boolean was=present;present=false;reported=false;setOwned(false);pauseRenderer(true);
                if(was)events.report(session,"paused",displayId(),suspended?"camera":aod?"aod":!ownMedia()?"other-media":"host-hidden-or-power");
                return;
            }
            pauseRenderer(false);
            if(ready){
                if(!present){present=true;renderer.evaluateJavascript("window.dispatchEvent(new CustomEvent('folia-rear-resync',{detail:{reason:'host-visible'}}))",null);}
                setOwned(true);overlay.setAlpha(1);overlay.setVisibility(View.VISIBLE);
                RearLyricsViewportMetrics.fit(overlay,renderer);RearLyricsViewportMetrics.capture(renderer);renderer.invalidate();
            }
        }catch(Throwable error){fail("Ownership error: "+error.getClass().getSimpleName());}
    }
    private void pauseRenderer(boolean sleep){
        if(renderer==null || Boolean.valueOf(sleep).equals(renderPaused))return;
        renderPaused=sleep;
        if(sleep){renderer.evaluateJavascript("window.dispatchEvent(new CustomEvent('folia-rear-power',{detail:{sleeping:true}}))",null);renderer.onPause();if(overlay!=null)overlay.setVisibility(View.INVISIBLE);}
        else{renderer.onResume();renderer.evaluateJavascript("window.dispatchEvent(new CustomEvent('folia-rear-power',{detail:{sleeping:false}}))",null);if(overlay!=null)overlay.setVisibility(View.VISIBLE);}
    }
    /** Called only by hooks for this exact root/music/inner view, never a global MAML switch. */
    void cancelVisualCallbacks(){
        try{Object value=XposedHelpers.callMethod(music,"handler");if(!(value instanceof Handler))return;
            for(String name:new String[]{"mProgressRunnable","mSetDefaultArtworkRunnable"}){
                Object r=XposedHelpers.getObjectField(music,name);if(r instanceof Runnable)((Handler)value).removeCallbacks((Runnable)r);
            }
        }catch(Throwable ignored){}
    }
    private void setOwned(boolean value){
        if(value==owned && (value||restorationOk))return;
        FrameLayout view=host.get();
        if(value){
            if(view==null||!ownMedia())throw new IllegalStateException("Host media changed");
            owned=true;restorationOk=false;
            XposedHelpers.callMethod(root,"selfPause");XposedHelpers.callMethod(root,"detachFromVsync");
            try{XposedHelpers.callMethod(root,"doneRender");}catch(Throwable ignored){}
            cancelVisualCallbacks();
            for(int i=0;i<view.getChildCount();i++){View child=view.getChildAt(i);if(child!=overlay){nativeVisibility.put(child,child.getVisibility());child.setVisibility(View.INVISIBLE);}}
        }else{
            owned=false;
            for(java.util.Map.Entry<View,Integer> entry:nativeVisibility.entrySet())if(view!=null&&entry.getKey().getParent()==view)entry.getKey().setVisibility(entry.getValue());
            nativeVisibility.clear();
            // A replaced/finished root must never be reactivated while restoring the old container.
            try{if(view==null || XposedHelpers.getObjectField(view,"mRoot")!=root){restorationOk=true;return;}}catch(Throwable error){return;}
            try{if(XposedHelpers.getBooleanField(root,"mFinished")){restorationOk=true;return;}}catch(Throwable ignored){}
            // Each restoration step is independent: one vendor method failure cannot skip the rest.
            boolean restored=callQuiet(root,"attachToVsync");
            int power=view==null||view.getDisplay()==null?Display.STATE_UNKNOWN:view.getDisplay().getState();
            if(view!=null&&view.isAttachedToWindow()&&RearDisplayPolicy.render(true,!paused,suspended,aod,power)){
                restored=callQuiet(root,"selfResume")&&restored;
                try{
                    MediaController controller=media();Object listener=XposedHelpers.getObjectField(music,"mMusicListener");
                    if(controller!=null&&listener!=null){
                        if(controller.getMetadata()!=null)callQuiet(listener,"onClientMetadataUpdate",controller.getMetadata());
                        if(controller.getPlaybackState()!=null)callQuiet(listener,"onClientPlaybackStateUpdate",controller.getPlaybackState().getState());
                    }
                }catch(Throwable ignored){}
                restored=callQuiet(root,"requestUpdate")&&restored;
            }
            restorationOk=restored;
            if(view!=null)view.invalidate();
        }
    }
    boolean restoreNative(){setOwned(false);return restorationOk;}
    private static boolean callQuiet(Object object,String method,Object... args){try{XposedHelpers.callMethod(object,method,args);return true;}catch(Throwable ignored){return false;}}
    /** Observe native navigation without consuming it or inventing a system navigation command. */
    void observeTouch(MotionEvent event){
        if(!owned)return;
        float density=host.get()==null?1:host.get().getResources().getDisplayMetrics().density;
        if(event.getActionMasked()==MotionEvent.ACTION_DOWN){downX=event.getRawX()/density;downY=event.getRawY()/density;downAt=event.getEventTime();tracking=true;}
        else if(tracking&&(event.getActionMasked()==MotionEvent.ACTION_MOVE||event.getActionMasked()==MotionEvent.ACTION_UP)){
            float up=downY-event.getRawY()/density,dx=Math.abs(event.getRawX()/density-downX);long time=event.getEventTime()-downAt;
            float slop=host.get()==null?10:android.view.ViewConfiguration.get(host.get().getContext()).getScaledTouchSlop()/density;
            if(up>=Math.max(8,slop)&&up>dx*1.5f&&time>0&&time<=1500)gestureAt=event.getEventTime();
        }
        if(event.getPointerCount()>1){tracking=false;gestureAt=-1;}
        if(event.getActionMasked()==MotionEvent.ACTION_UP||event.getActionMasked()==MotionEvent.ACTION_CANCEL)tracking=false;
    }
    private boolean touch(MotionEvent event){
        // The WebView never receives a drag or disallow-intercept request; its parent keeps native swipe navigation.
        if(closed||!owned)return false;
        int action=event.getActionMasked();
        if(action==MotionEvent.ACTION_DOWN){
            if(tapDown!=null)tapDown.recycle();tapDown=MotionEvent.obtain(event);moved=false;
        }else if(action==MotionEvent.ACTION_MOVE&&tapDown!=null){float dx=event.getX()-tapDown.getX(),dy=event.getY()-tapDown.getY();float slop=android.view.ViewConfiguration.get(overlay.getContext()).getScaledTouchSlop();if(dx*dx+dy*dy>slop*slop)moved=true;}
        else if(action==MotionEvent.ACTION_UP&&tapDown!=null){
            if(!moved&&event.getEventTime()-tapDown.getEventTime()<=500&&renderer!=null){renderer.dispatchTouchEvent(tapDown);renderer.dispatchTouchEvent(event);}
            tapDown.recycle();tapDown=null;
        }
        if(event.getPointerCount()>1||action==MotionEvent.ACTION_CANCEL){moved=true;if(tapDown!=null){tapDown.recycle();tapDown=null;}}
        return true;
    }
    void fail(String reason){if(closed)return;close();events.report(session,"failed",displayId(),reason);}
    // Cleanup steps are independent: a vendor exception must not leave a detached WebView or callbacks alive.
    void close(){
        if(closed)return;
        closed=true;main.removeCallbacks(reconcile);main.removeCallbacks(checkExit);
        safely(()->setOwned(false));
        FrameLayout contextView=host.get();
        if(updates!=null&&contextView!=null)safely(()->contextView.getContext().getContentResolver().unregisterContentObserver(updates));
        updates=null;client=null;
        if(displays!=null)safely(()->displays.unregisterDisplayListener(displayListener));
        displays=null;
        if(observed!=null)safely(()->observed.unregisterCallback(mediaListener));
        observed=null;
        if(tapDown!=null){tapDown.recycle();tapDown=null;}
        WebView old=renderer;renderer=null;
        if(old!=null){
            safely(old::stopLoading);
            safely(()->old.setWebViewClient(new android.webkit.WebViewClient()));
            if(overlay!=null)safely(()->overlay.removeView(old));
            safely(old::destroy);
        }
        FrameLayout view=host.get();if(view!=null&&overlay!=null)safely(()->view.removeView(overlay));
        overlay=null;
    }
    private static void safely(Runnable action){try{action.run();}catch(Throwable ignored){}}
}
