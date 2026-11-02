package io.github.huleixin.tingyu;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Parcel;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// android/app/src/main/java/io/github/huleixin/tingyu/RearHostBridge.java
/**
 * 应用侧的显示租约；与独立窗口（RearLyricsActivity）互斥，绝不共享同一块背屏。
 *
 * <p>1.3.96：宿主不再是「系统音乐卡片」，所以这里只负责把「听屿要显示」这一件事交给背屏
 * 中心进程，并等待宿主视图的首帧。首个 ready 之前失败/超时都会释放租约并回退独立窗口。
 */
final class RearHostBridge {
    interface Completion { void done(boolean ok,int display,String detail); }
    private static final Handler MAIN=new Handler(Looper.getMainLooper());
    private static final ExecutorService IO=Executors.newSingleThreadExecutor();
    private static volatile IBinder service;
    private static volatile String session="",detail="宿主未连接；需在 LSPosed 启用小米背屏中心作用域";
    private static volatile boolean active,suspended,releasing;
    private static volatile int display=-1;
    private static int generation;
    private static Completion pending;
    private static Runnable timeout;
    private static long lastProbe;
    static boolean connected(){return service!=null && service.isBinderAlive();}
    static boolean hasSession(){return !session.isEmpty();}
    static boolean active(){return active && !suspended && !releasing;}
    static boolean renderSuspended(){return hasSession() && !active && pending==null && !releasing;}
    static boolean pending(){return hasSession() && !active && pending!=null;}
    static String session(){return session;}
    static int display(){return display;}
    static String detail(){return detail;}
    static boolean matches(String value){return RearHostPolicy.validSession(value) && value.equals(session);}
    static void cancelConnecting(){if(!hasSession())generation++;}
    static synchronized void connect(Context context,IBinder binder,int protocol,String profile)throws Exception{
        if(protocol!=RearHostContract.VERSION || binder==null || !RearHostContract.DESCRIPTOR.equals(binder.getInterfaceDescriptor()))throw new SecurityException("Host protocol mismatch");
        if(service==binder)return;
        binder.linkToDeath(()->MAIN.post(()->{
            if(service!=binder)return;
            service=null;detail="背屏中心连接断开；旧宿主视图随进程释放";
            String old=session;clear();
            RearLyricsCoordinator.get(context).hostDisconnected(old);
        }),0);
        service=binder;detail=profile;
    }
    /**
     * @param rear 目标背屏显示 id；宿主需要它来把 launcher 请求到正确的显示上。
     */
    static void show(Context context,int rear,Completion callback){
        if(hasSession()){callback.done(false,display,"上一宿主会话仍在释放，禁止并行显示");return;}
        final int token=++generation;
        context.sendBroadcast(new Intent(RearHostContract.REQUEST).setPackage(RearHostContract.TARGET));
        MAIN.postDelayed(()->{
            if(!RearHostPolicy.mayStart(token,generation,RearLyricsCoordinator.get(context).canPresent())){
                if(token==generation)callback.done(false,-1,"显示意图已取消或暂不可用");
                return;
            }
            if(!connected()){callback.done(false,-1,detail);return;}
            session=UUID.randomUUID().toString();active=false;suspended=false;releasing=false;pending=callback;display=rear;lastProbe=0;
            final String expected=session;
            transact(RearHostContract.SHOW,expected,false,rear,(ok,id,message)->{
                if(token!=generation || !matches(expected))return;
                detail=message;
                if(!ok)failStart(context,expected,message);
            });
            timeout=()->{if(token==generation && matches(expected) && pending!=null)failStart(context,expected,"宿主首帧未确认，释放后回退独立窗口");};
            MAIN.postDelayed(timeout,4500);
        },connected()?0:900);
    }
    private static void failStart(Context context,String expected,String message){
        if(!matches(expected))return;
        Completion callback=pending;pending=null;
        release((ok,id,why)->{detail=message+(ok?"":"；释放未确认，禁止并行回退");if(callback!=null)callback.done(false,-1,detail);});
    }
    static void report(Context context,String expected,String event,int id,String reason){
        MAIN.post(()->{
            if(!matches(expected) || releasing)return;
            RearLyricsTrace.record(context,"host/"+event,"session="+expected+", display="+id+", "+reason);
            if("ready".equals(event)){
                if(!RearLyricsCoordinator.get(context).canPresent())return;
                active=true;display=id;detail="背屏中心宿主已接管歌词舞台";
                if(timeout!=null)MAIN.removeCallbacks(timeout);
                Completion callback=pending;pending=null;
                RearLyricsCoordinator.get(context).hostReady();
                if(callback!=null)callback.done(true,id,detail);
            }else if("created".equals(event)){
                // 宿主视图已经建好，首帧还在渲染：给一次有界的延长，而不是让 4.5s 的握手窗口
                // 在「视图已存在」的情况下误判失败。
                if(id>0)display=id;
                detail=reason;
                if(pending!=null){
                    if(timeout!=null)MAIN.removeCallbacks(timeout);
                    timeout=()->{if(matches(expected)&&pending!=null)failStart(context,expected,"宿主首帧未确认，释放后回退独立窗口");};
                    MAIN.postDelayed(timeout,4500);
                }
            }else if("launch".equals(event)){
                if(id>0)display=id;
                detail=reason;
            }else if("released".equals(event)){
                detail=reason;
            }else if("user-exit".equals(event)){
                active=false;RearLyricsCoordinator.get(context).dismissDisplaySession(expected);
            }else if("failed".equals(event)){
                active=false;
                if(pending!=null)failStart(context,expected,reason);
                else release((ok,d,message)->{if(ok)RearLyricsCoordinator.get(context).hostDisconnected(expected);});
            }else if("paused".equals(event)){active=false;detail="宿主暂不可见："+reason;}
            RearLyricsCoordinator.get(context).windowChanged();
        });
    }
    static void suspend(boolean value){
        if(!hasSession() || releasing || suspended==value)return;
        suspended=value;if(value)active=false;final String expected=session;
        transact(RearHostContract.SUSPEND,expected,value,display,(ok,id,why)->{if(matches(expected)&&!ok)detail=why;});
    }
    static void pulse(Context context,long now){
        if(!hasSession()||releasing||now-lastProbe<10000)return;lastProbe=now;
        final String expected=session;
        transact(RearHostContract.PROBE,expected,false,display,(ok,id,why)->{if(matches(expected)&&!ok)release((released,d,reason)->{if(released)RearLyricsCoordinator.get(context).hostDisconnected(expected);});});
    }
    static void release(Completion callback){
        if(!hasSession()){callback.done(true,-1,"No host lease");return;}
        final String expected=session;releasing=true;active=false;
        if(timeout!=null)MAIN.removeCallbacks(timeout);
        transact(RearHostContract.HIDE,expected,false,display,(ok,id,message)->{
            if(!matches(expected)){callback.done(false,-1,"Host lease changed");return;}
            if(ok)clear();else detail=message;
            callback.done(ok,id,message);
        });
    }
    private static void clear(){
        generation++;session="";active=false;suspended=false;releasing=false;display=-1;
        if(timeout!=null)MAIN.removeCallbacks(timeout);
        Completion callback=pending;pending=null;if(callback!=null)callback.done(false,-1,"宿主会话已结束");
    }
    private static void transact(int code,String expected,boolean value,int rear,Completion callback){
        final IBinder binder=service;
        IO.execute(()->{
            boolean ok=false;String message="Host disconnected";int id=-1;
            Parcel data=Parcel.obtain(),reply=Parcel.obtain();
            try{
                if(binder==null||!binder.isBinderAlive())throw new IllegalStateException("Host disconnected");
                data.writeInterfaceToken(RearHostContract.DESCRIPTOR);data.writeString(expected);data.writeInt(value?1:0);data.writeInt(rear);
                if(!binder.transact(code,data,reply,0))throw new IllegalStateException("Host operation unsupported");
                reply.readException();ok=reply.readInt()==0;id=reply.readInt();message=reply.readString();
            }catch(Exception error){message=error.getClass().getSimpleName()+": "+error.getMessage();}
            finally{data.recycle();reply.recycle();}
            final boolean accepted=ok;final int displayId=id;final String text=message;
            MAIN.post(()->callback.done(accepted,displayId,text));
        });
    }
}
