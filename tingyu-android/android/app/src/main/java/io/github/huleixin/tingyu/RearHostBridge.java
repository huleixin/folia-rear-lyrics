package io.github.huleixin.tingyu;

import android.app.Activity;
import android.content.BroadcastReceiver;
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
 * <p>当前 LSP 只把内容交给已经验证的系统音乐卡片，并等待宿主视图的合格首帧。
 * 相机优先级归系统卡片生命周期决定；失败释放租约，不回退独立 Activity。
 */
final class RearHostBridge {
    interface Completion { void done(boolean ok,int display,String detail); }
    private static final Handler MAIN=new Handler(Looper.getMainLooper());
    private static final ExecutorService IO=Executors.newSingleThreadExecutor();
    private static volatile IBinder service;
    /** 是否真的收到过背屏中心的 register；用来区分「从没连上」和「连过又断了」。 */
    private static volatile boolean handshakeSeen;
    private static volatile int servicePriority=-1;
    private static volatile String hostStage="",hostError="",hostBuild="",hostProcess="";
    /** 有序广播探针的原始回答；空表示背屏中心进程里没有任何模块应答。 */
    private static volatile String pingData="";
    private static volatile boolean pingAnswered;
    private static int pingGeneration;
    private static volatile String session="",detail=disconnectedReason();
    private static volatile boolean active,releasing;
    private static volatile String renderMode="HIDDEN";
    private static volatile int display=-1;
    private static int generation;
    private static Completion pending;
    private static Runnable timeout;
    private static long lastProbe;
    private static RearHostProgress progress=new RearHostProgress();
    private static final RearHostFrameWait frameWait=new RearHostFrameWait();
    static boolean connected(){return service!=null && service.isBinderAlive();}
    static boolean hasSession(){return !session.isEmpty();}
    static boolean active(){return active && !releasing;}
    static boolean renderSuspended(){return hasSession() && !active && pending==null && !releasing;}
    static boolean pending(){return hasSession() && !active && pending!=null;}
    static String session(){return session;}
    static int display(){return display;}
    static String detail(){return detail;}
    static boolean handshakeSeen(){return handshakeSeen;}
    static String hostStage(){return hostStage;}
    static String hostError(){return hostError;}
    static String hostBuild(){return hostBuild;}
    static String hostProcess(){return hostProcess;}
    static String pingData(){return pingData;}
    static String hostStatus(){
        return "handshakeSeen="+handshakeSeen()+", priority="+servicePriority
            +", process="+hostProcess()+", stage="+hostStage()
            +", build="+hostBuild()+", error="+hostError()
            +", progress={"+progress.describe()+"}, ping="+(pingData.isEmpty()?"<none>":pingData);
    }
    static boolean matches(String value){return RearHostPolicy.validSession(value) && value.equals(session);}
    static void cancelConnecting(){if(!hasSession())generation++;}

    /**
     * 没有可用 Binder 时的原因必须来自证据：收到过 register → 是断线；从没收到 → 是模块/
     * 进程/Provider 链路问题，并带上构建标识，避免「旧包/新包」混淆。
     */
    static String disconnectedReason(){
        String build=BuildConfig.BUILD_ID;
        if(handshakeSeen) return "背屏中心宿主连接已断开（build "+build+"），等待重新 register";
        if(!pingData.isEmpty()) return "背屏中心模块已加载（"+pingData+"），但 register 未到达（build "+build+"）";
        return "无 ping 应答：模块未在背屏中心进程运行（build "+build+"）；覆盖安装后需重启背屏中心或手机";
    }

    /**
     * 有序广播探针：不经过 ContentProvider、不依赖 Binder，只回答「模块有没有跑在这个进程」。
     * 结果写入 trace 与 {@link #disconnectedReason()}，用来把「没装作用域」和「装了但注册失败」
     * 分开。
     */
    static void probeModule(Context context){
        final int token=++pingGeneration;
        pingData="";
        pingAnswered=false;
        MAIN.postDelayed(() -> {
            if (token != pingGeneration || pingAnswered) return;
            RearLyricsTrace.record(context,"host/ping-timeout","no ordered-broadcast result within 1500ms, build="+BuildConfig.BUILD_ID);
        }, 1_500);
        try{
            context.sendOrderedBroadcast(new Intent(RearHostContract.PING)
                    .setPackage(RearHostContract.TARGET)
                    .addFlags(Intent.FLAG_RECEIVER_FOREGROUND),null,
                new BroadcastReceiver(){
                    @Override public void onReceive(Context c,Intent intent){
                        if(token!=pingGeneration)return;
                        pingAnswered=true;
                        pingData=getResultData()==null?"":getResultData();
                        RearLyricsTrace.record(context,"host/ping","result="+getResultCode()
                            +", data="+(pingData.isEmpty()?"<none>":pingData)+", build="+BuildConfig.BUILD_ID);
                    }
                },MAIN,Activity.RESULT_CANCELED,null,null);
        }catch(Throwable error){
            RearLyricsTrace.record(context,"host/ping-failed",error.getClass().getSimpleName()+": "+error.getMessage());
        }
    }

    static synchronized void connect(Context context,IBinder binder,int protocol,String profile,
            int priority,String stage,String error,String build,String process)throws Exception{
        if(protocol!=RearHostContract.VERSION || binder==null || !RearHostContract.DESCRIPTOR.equals(binder.getInterfaceDescriptor()))throw new SecurityException("Host protocol mismatch");
        handshakeSeen=true;
        if(service==binder){
            servicePriority=priority;hostStage=stage;hostError=error;hostBuild=build;hostProcess=process;
            detail=profile;
            RearLyricsTrace.record(context,"host/register-refresh","priority="+priority+", "+profile);
            return;
        }
        if(!RearHostPolicy.acceptRegistration(servicePriority,service!=null&&service.isBinderAlive(),hasSession(),priority)){
            RearLyricsTrace.record(context,"host/register-ignored","priority="+priority+", current="+servicePriority
                +", session="+session+", process="+process+", stage="+stage);
            return;
        }
        binder.linkToDeath(()->MAIN.post(()->{
            if(service!=binder)return;
            service=null;servicePriority=-1;detail=disconnectedReason();
            String old=session;clear();
            RearLyricsCoordinator.get(context).hostDisconnected(old);
        }),0);
        service=binder;servicePriority=priority;hostStage=stage;hostError=error;hostBuild=build;hostProcess=process;
        detail=profile+(error==null||error.isEmpty()?"":"；"+error);
        RearLyricsTrace.record(context,"host/register","priority="+priority+", "+profile);
    }
    /**
     * @param rear 目标背屏显示 id；宿主需要它来把 launcher 请求到正确的显示上。
     */
    static void show(Context context,int rear,Completion callback){
        if(hasSession()){callback.done(false,display,"上一宿主会话仍在释放，禁止并行显示");return;}
        final int token=++generation;
        RearLyricsTrace.record(context,"host/connect-request","build="+BuildConfig.BUILD_ID
            +", display="+rear+", connected="+connected()+", handshakeSeen="+handshakeSeen+", "+hostStatus());
        probeModule(context);
        context.sendBroadcast(new Intent(RearHostContract.REQUEST)
            .setPackage(RearHostContract.TARGET)
            .addFlags(Intent.FLAG_RECEIVER_FOREGROUND));
        MAIN.postDelayed(()->{
            if(!RearHostPolicy.mayStart(token,generation,RearLyricsCoordinator.get(context).canPresent())){
                if(token==generation)callback.done(false,-1,"显示意图已取消或暂不可用");
                return;
            }
            if(!connected()){
                detail=disconnectedReason();
                RearLyricsTrace.record(context,"host/connect-miss","build="+BuildConfig.BUILD_ID
                    +", handshakeSeen="+handshakeSeen+", "+hostStatus());
                callback.done(false,-1,detail);
                return;
            }
            progress=new RearHostProgress();frameWait.stop();session=UUID.randomUUID().toString();active=false;releasing=false;pending=callback;display=rear;lastProbe=0;
            final String expected=session;
            transact(RearHostContract.SHOW,expected,false,rear,(ok,id,message)->{
                if(token!=generation || !matches(expected))return;
                detail=message;
                if(!ok)failStart(context,expected,message);
            });
            timeout=()->{if(token==generation && matches(expected) && pending!=null)failStart(context,expected,"宿主首帧未确认；最后阶段="+progress.describe()+"；释放后回退独立窗口");};
            MAIN.postDelayed(timeout,4500);
        },connected()?0:900);
    }
    private static void failStart(Context context,String expected,String message){
        if(!matches(expected))return;
        RearLyricsTrace.record(context,"host/start-failed",message+", "+progress.describe());
        Completion callback=pending;pending=null;
        release((ok,id,why)->{
            detail=message+(ok?"":"；释放未确认，禁止并行回退");
            if(callback!=null)callback.done(false,-1,detail);
            else if(ok)RearLyricsCoordinator.get(context).hostDisconnected(expected);
        });
    }
    private static void awaitVisibleFrame(Context context,String expected){
        if(!RearHostFrameWait.requiredForMode(renderMode))return;
        if(timeout!=null)MAIN.removeCallbacks(timeout);
        long delay=frameWait.start(android.os.SystemClock.uptimeMillis());
        timeout=()->{if(matches(expected)&&!active&&frameWait.expired(android.os.SystemClock.uptimeMillis()))failStart(context,expected,"可见系统卡片的歌词首帧未确认；"+progress.describe());};
        MAIN.postDelayed(timeout,delay);
    }
    static void report(Context context,String expected,String event,int id,String reason){
        MAIN.post(()->{
            if(!matches(expected) || releasing)return;
            if("web-stage".equals(event)){int split=reason.indexOf(":");progress.update(split<0?reason:reason.substring(0,split),split<0?"":reason.substring(split+1));}else progress.update(event,reason);
            RearLyricsTrace.record(context,"host/"+event,"leaseTag="+Integer.toHexString(expected.hashCode())+", display="+id+", "+reason);
            if("render-mode".equals(event)){
                renderMode=reason.contains("mode=AOD")?"AOD":reason.contains("mode=NORMAL")?"NORMAL":"HIDDEN";
                detail=reason;active=false;frameWait.stop();if(timeout!=null)MAIN.removeCallbacks(timeout);
            }else if("card-available".equals(event)){
                // An actual system business exists, possibly collapsed. Retain the lease and entry;
                // do not replace native navigation with an Activity or mark unseen content active.
                detail="已加入系统动态音乐卡片；"+reason;
                if(id>0)display=id;
                Completion callback=pending;pending=null;
                if(callback!=null&&timeout!=null)MAIN.removeCallbacks(timeout);
                RearLyricsCoordinator.get(context).hostReady();
                if(callback!=null)callback.done(true,display,detail);
            }else if("ready".equals(event)){
                if(!RearLyricsCoordinator.get(context).canPresent())return;
                active=true;display=id;detail="背屏中心宿主已接管歌词舞台";
                frameWait.stop();
                if(timeout!=null)MAIN.removeCallbacks(timeout);
                Completion callback=pending;pending=null;
                RearLyricsCoordinator.get(context).hostReady();
                if(callback!=null)callback.done(true,id,detail);
            }else if("created".equals(event)||"rendering".equals(event)||"card-selected".equals(event)){
                // The first selection starts one budget. Later creation/probes cannot extend it.
                if(id>0)display=id;
                detail=reason;
                if(!active)awaitVisibleFrame(context,expected);
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
            }else if(RearHostPolicy.invalidatesDrawnState(event,renderMode)){
                active=false;detail="宿主暂不可见："+reason;
                frameWait.stop();
                if(timeout!=null)MAIN.removeCallbacks(timeout);
            }
            RearLyricsCoordinator.get(context).windowChanged();
        });
    }
    static void pulse(Context context,long now){
        if(!hasSession()||releasing||now-lastProbe<10000)return;lastProbe=now;
        final String expected=session;
        transact(RearHostContract.PROBE,expected,false,display,(ok,id,why)->{if(matches(expected)&&!ok){RearLyricsTrace.record(context,"host/probe-failed","reason="+why+", "+progress.describe());detail="宿主探测失败："+why+"；"+progress.describe();release((released,d,reason)->{if(released)RearLyricsCoordinator.get(context).hostDisconnected(expected);});}});
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
        generation++;session="";active=false;releasing=false;display=-1;
        frameWait.stop();renderMode="HIDDEN";
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
