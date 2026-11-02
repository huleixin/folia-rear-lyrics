package io.github.huleixin.tingyu;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Binder;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Parcel;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;
import java.lang.ref.WeakReference;
import java.lang.reflect.Method;
import java.util.WeakHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

// android/app/src/main/java/io/github/huleixin/tingyu/RearHostHooks.java
// Runs only in the explicitly selected subscreencenter process. Never in system_server/SystemUI.
public final class RearHostHooks {
    private static Controller controller;
    private static boolean installed;
    private static volatile boolean capabilityReady;
    public static synchronized void install(ClassLoader loader){
        if(installed)return;installed=true;
        try{
            Class<?> maml=XposedHelpers.findClass("com.miui.maml.component.MamlView",loader);
            Class<?> root=XposedHelpers.findClass("com.miui.maml.ScreenElementRoot",loader);
            Class<?> music=XposedHelpers.findClass("com.miui.maml.elements.MusicControlScreenElement",loader);
            XposedHelpers.findAndHookMethod(android.app.Application.class,"attach",Context.class,new XC_MethodHook(){
                @Override protected void afterHookedMethod(MethodHookParam p){if(controller==null)controller=new Controller((Context)p.args[0]);}
            });
            for(String method:new String[]{"initMamlview","onAttachedToWindow","onResume"})XposedBridge.hookAllMethods(maml,method,new XC_MethodHook(){
                @Override protected void afterHookedMethod(MethodHookParam p){
                    if(p.hasThrowable()||!(p.thisObject instanceof FrameLayout))return;
                    if(controller!=null)controller.candidate((FrameLayout)p.thisObject);
                    RearHostedCard card=cardFor(p.thisObject);if(card!=null)card.hostPaused(false);
                }
            });
            if(XposedBridge.hookAllMethods(maml,"onPause",new XC_MethodHook(){@Override protected void afterHookedMethod(MethodHookParam p){RearHostedCard c=cardFor(p.thisObject);if(c!=null)c.hostPaused(true);}}).isEmpty())throw new IllegalStateException("Missing host pause hook");
            if(XposedBridge.hookAllMethods(maml,"onDetachedFromWindow",new XC_MethodHook(){@Override protected void afterHookedMethod(MethodHookParam p){if(controller!=null)controller.detached(p.thisObject);}}).isEmpty())throw new IllegalStateException("Missing host detach hook");
            XposedBridge.hookAllMethods(maml,"sendCommand",new XC_MethodHook(){@Override protected void afterHookedMethod(MethodHookParam p){
                RearHostedCard c=cardFor(p.thisObject);if(c==null||p.args.length==0)return;
                if("enterAod".equals(p.args[0]))c.aod(true);else if("exitAod".equals(p.args[0]))c.aod(false);
            }});
            XC_MethodHook rootGuard=new XC_MethodHook(){@Override protected void beforeHookedMethod(MethodHookParam p){
                RearHostedCard c=cardFor(p.thisObject);if(c==null||!c.owned()||p.thisObject!=c.root())return;
                // Returning false applies only to this owned MAML scene; outer native navigation remains untouched.
                Class<?> type=((Method)p.method).getReturnType();p.setResult(defaultResult(type));
            }};
            for(String method:new String[]{"tick","doTick","update","updateIfNeeded","onHover"})XposedBridge.hookAllMethods(root,method,rootGuard);
            // A partial installation remains passive: never hide the native card without its touch/render gates.
            for(String required:new String[]{"onTouch","doRender","attachToVsync","selfResume","requestUpdate"})
                if(XposedBridge.hookAllMethods(root,required,rootGuard).isEmpty())throw new IllegalStateException("Missing root hook: "+required);
            XposedBridge.hookAllMethods(maml,"doRender",new XC_MethodHook(){@Override protected void beforeHookedMethod(MethodHookParam p){RearHostedCard c=cardFor(p.thisObject);if(c!=null&&c.owned())p.setResult(null);}});
            for(String method:new String[]{"startProgressUpdate","handleArtwork","handleLyric","handleProgress"})XposedBridge.hookAllMethods(music,method,new XC_MethodHook(){@Override protected void beforeHookedMethod(MethodHookParam p){
                RearHostedCard c=cardFor(p.thisObject);if(c==null||!c.owned())return;
                if(!c.ownMedia()){c.mediaChanged();return;}
                c.cancelVisualCallbacks();p.setResult(defaultResult(((Method)p.method).getReturnType()));
            }});
            Class<?> inner=XposedHelpers.findClassIfExists("com.miui.maml.component.MamlView$InnerView",loader);
            if(inner!=null)XposedBridge.hookAllMethods(inner,"onDraw",new XC_MethodHook(){@Override protected void beforeHookedMethod(MethodHookParam p){
                if(!(p.thisObject instanceof View))return;RearHostedCard c=current();
                if(c!=null&&c.owned()&&((View)p.thisObject).getParent()==c.host())p.setResult(null);
            }});
            // Observation only. No result replacement, synthetic navigation or global gesture interception.
            XposedHelpers.findAndHookMethod(ViewGroup.class,"dispatchTouchEvent",MotionEvent.class,new XC_MethodHook(){@Override protected void beforeHookedMethod(MethodHookParam p){RearHostedCard c=current();if(c!=null&&p.thisObject==c.host())c.observeTouch((MotionEvent)p.args[0]);}});
            XposedHelpers.findAndHookMethod(Activity.class,"dispatchTouchEvent",MotionEvent.class,new XC_MethodHook(){@Override protected void beforeHookedMethod(MethodHookParam p){
                RearHostedCard c=current();if(c==null||!c.owned()||c.host()==null)return;
                Activity activity=(Activity)p.thisObject;
                if(activity.getWindow().getDecorView().getDisplay()==null||activity.getWindow().getDecorView().getDisplay().getDisplayId()<=0)return;
                Context context=c.host().getContext();while(context instanceof ContextWrapper && context!=activity){Context next=((ContextWrapper)context).getBaseContext();if(next==context)break;context=next;}
                if(context==activity)c.observeTouch((MotionEvent)p.args[0]);
            }});
            capabilityReady=true;
        }catch(Throwable error){capabilityReady=false;XposedBridge.log("Tingyu rear host unsupported: "+error.getClass().getSimpleName());}
    }
    private static Object defaultResult(Class<?> type){if(type==boolean.class)return false;if(type==long.class)return Long.MAX_VALUE;if(type==int.class)return 0;return null;}
    private static RearHostedCard current(){return controller==null?null:controller.card;}
    private static RearHostedCard cardFor(Object object){RearHostedCard c=current();return c!=null&&(object==c.host()||object==c.root()||object==c.music())?c:null;}

    private static final class Controller extends Binder implements RearHostedCard.Events {
        private final Context context;
        private final Handler main=new Handler(Looper.getMainLooper());
        private final ExecutorService io=Executors.newSingleThreadExecutor();
        private final WeakHashMap<FrameLayout,Boolean> candidates=new WeakHashMap<>();
        private final AtomicInteger commands=new AtomicInteger();
        private volatile String lease="",lastReleased="";
        private RearHostedCard card;
        private IBinder lifeline;
        private volatile int appUid=-1;
        private boolean camera;
        Controller(Context context){
            this.context=context.getApplicationContext();attachInterface(null,RearHostContract.DESCRIPTOR);
            BroadcastReceiver receiver=new BroadcastReceiver(){@Override public void onReceive(Context c,Intent i){if(RearHostContract.REQUEST.equals(i.getAction()))register();}};
            if(Build.VERSION.SDK_INT>=33)this.context.registerReceiver(receiver,new IntentFilter(RearHostContract.REQUEST),RearHostContract.APP+".permission.LSP_CONNECT",main,Context.RECEIVER_EXPORTED);
            else this.context.registerReceiver(receiver,new IntentFilter(RearHostContract.REQUEST),RearHostContract.APP+".permission.LSP_CONNECT",main);
        }
        private void register(){
            io.execute(()->{try{
                Bundle b=new Bundle();b.putBinder("service",this);b.putInt("protocol",RearHostContract.VERSION);
                b.putString("profile","小米背屏中心宿主已加载；等待可见的听屿音乐卡片");
                Bundle result=context.getContentResolver().call(Uri.parse("content://"+RearHostContract.AUTHORITY),"register",null,b);
                IBinder next=result==null?null:result.getBinder("lifeline");
                if(result!=null)appUid=result.getInt("appUid",-1);
                if(next!=null&&next!=lifeline){lifeline=next;next.linkToDeath(()->main.post(()->{if(lifeline==next){release();lifeline=null;}}),0);}
            }catch(Throwable error){XposedBridge.log("Tingyu host handshake: "+error.getClass().getSimpleName());}});
        }
        void candidate(FrameLayout view){
            if(view.getDisplay()==null||view.getDisplay().getDisplayId()<=0)return;
            candidates.put(view,Boolean.TRUE);
            if(!lease.isEmpty()&&(card==null||card.host()!=view))mount();
        }
        void detached(Object view){
            if(card!=null&&card.host()==view){RearHostedCard old=card;old.detached();if(card==old && old.restoreNative())card=null;}
            if(view instanceof FrameLayout)candidates.remove(view);
        }
        private boolean mount(){
            if(!capabilityReady||lease.isEmpty()||camera)return false;
            if(card!=null){if(card.closed()){if(!card.restoreNative())return false;card=null;}else{card.probe();return true;}}
            for(FrameLayout host:new java.util.ArrayList<>(candidates.keySet()))try{
                if(!host.isAttachedToWindow()||!host.isShown()||host.getDisplay()==null||host.getDisplay().getDisplayId()<=0)continue;
                Object root=XposedHelpers.getObjectField(host,"mRoot");if(root==null)continue;
                Object music=XposedHelpers.callMethod(root,"findElement","music_control");
                if(music==null||!music.getClass().getName().equals("com.miui.maml.elements.MusicControlScreenElement"))continue;
                RearHostedCard next=new RearHostedCard(host,root,music,lease,this);card=next;
                if(next.start())return true;
                next.close();card=null;
            }catch(Throwable error){if(card!=null)card.close();card=null;}
            return false;
        }
        private boolean release(){
            if(card!=null){card.close();if(!card.restoreNative())return false;card=null;}
            String old=lease;lease="";if(!old.isEmpty())lastReleased=old;camera=false;return true;
        }
        @Override protected boolean onTransact(int code,Parcel data,Parcel reply,int flags)throws android.os.RemoteException {
            if(code==INTERFACE_TRANSACTION){reply.writeString(RearHostContract.DESCRIPTOR);return true;}
            try{
                if(appUid<0 || Binder.getCallingUid()!=appUid)throw new SecurityException("Tingyu only");
                data.enforceInterface(RearHostContract.DESCRIPTOR);String requested=data.readString();boolean value=data.readInt()!=0;
                if(!RearHostPolicy.validSession(requested))throw new SecurityException("Invalid display session");
                int token=(code==RearHostContract.SHOW||code==RearHostContract.HIDE)?commands.incrementAndGet():commands.get();
                CountDownLatch done=new CountDownLatch(1);boolean[] ok={false};String[] reason={"Host command unavailable"};int[] display={-1};
                Runnable work=()->{try{
                    if(token!=commands.get())return;
                    if(code==RearHostContract.SHOW){
                        if(!lease.isEmpty()&&!lease.equals(requested)){reason[0]="Another host lease exists";return;}
                        lease=requested;camera=false;ok[0]=mount();reason[0]=ok[0]?"宿主渲染准备中，尚未确认首帧":"未找到兼容、可见且属于听屿的音乐卡片";
                        if(!ok[0])release();
                    }else if(code==RearHostContract.HIDE){
                        if(lease.equals(requested)){ok[0]=release();}else ok[0]=lastReleased.equals(requested);
                        reason[0]=ok[0]?"接管已解除，原生恢复动作已完成":"Host release/restoration not confirmed";
                    }else if(lease.equals(requested)){
                        if(code==RearHostContract.SUSPEND){camera=value;if(card!=null)card.suspended(value);if(!value)mount();ok[0]=true;}
                        else if(code==RearHostContract.PROBE){mount();ok[0]=true;}
                        reason[0]="Host state updated";
                    }
                    if(card!=null&&card.host()!=null&&card.host().getDisplay()!=null)display[0]=card.host().getDisplay().getDisplayId();
                }catch(Throwable error){release();reason[0]="Host operation failed: "+error.getClass().getSimpleName();}
                finally{done.countDown();}};
                if(Looper.myLooper()==Looper.getMainLooper())work.run();else main.post(work);
                if(!done.await(2500,TimeUnit.MILLISECONDS)){
                    boolean invalidated=commands.compareAndSet(token,token+1);
                    if(invalidated)main.post(()->{if(commands.get()==token+1 && lease.equals(requested))release();});
                    reason[0]="Host UI command timed out; release must be acknowledged";ok[0]=false;
                }
                reply.writeNoException();reply.writeInt(ok[0]?0:1);reply.writeInt(display[0]);reply.writeString(reason[0]);return true;
            }catch(Throwable error){reply.writeException(new SecurityException(error.getClass().getSimpleName()));return true;}
        }
        public boolean current(String session){return !lease.isEmpty()&&lease.equals(session)&&!camera;}
        public void report(String session,String event,int display,String reason){
            if(!lease.equals(session)&&!lastReleased.equals(session))return;
            if("user-exit".equals(event)||"failed".equals(event)){
                if(card==null || !card.session().equals(session) || card.restoreNative()){
                    if(!lease.isEmpty())lastReleased=lease;lease="";
                    if(card!=null&&card.session().equals(session)){card.close();card=null;}
                }
            }
            io.execute(()->{try{
                Bundle b=new Bundle();b.putString("session",session);b.putString("event",event);b.putInt("display",display);b.putString("reason",reason);
                context.getContentResolver().call(Uri.parse("content://"+RearHostContract.AUTHORITY),"report",null,b);
            }catch(Throwable ignored){}});
        }
    }
}
