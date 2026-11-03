package io.github.huleixin.tingyu;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

// android/app/src/main/java/io/github/huleixin/tingyu/RearHostUpdates.java
/**
 * Coalesced semantic events, not a second clock or a playback poll. Inert without a host lease.
 *
 * <p>进程内的读者（Compose 极简播放页）也挂在这里：它们要的是同一批「语义变了」的时刻，
 * 而不是自己起一个轮询。监听器只在主线程上被调用，且与宿主租约无关 —— 没有背屏会话时
 * 背屏那条 ContentProvider 通知照样不发，但进程内的读者仍然必须收到。
 */
public final class RearHostUpdates {
    /** 进程内的语义变更监听。实现必须是「排一次重算」，不能在这里做重活。 */
    public interface Listener { void onHostStateChanged(); }
    private static final java.util.concurrent.CopyOnWriteArrayList<Listener> listeners =
            new java.util.concurrent.CopyOnWriteArrayList<>();
    private static volatile Runnable signal;
    public static void observe(Listener listener){if(listener!=null&&!listeners.contains(listener))listeners.add(listener);}
    public static void unobserve(Listener listener){listeners.remove(listener);}
    static void bind(Context context){
        Context app=RearHostContext.resolve(context);Handler main=new Handler(Looper.getMainLooper());
        Runnable notify=()->{if(RearHostBridge.hasSession())app.getContentResolver().notifyChange(Uri.parse("content://"+RearHostContract.AUTHORITY+"/state"),null);};
        signal=()->{if(RearHostBridge.hasSession()){main.removeCallbacks(notify);main.postDelayed(notify,50);}};
    }
    static void changed(){
        for(Listener listener:listeners){try{listener.onHostStateChanged();}catch(Throwable ignored){/* 一个读者出错不能拖垮播放 */}}
        Runnable current=signal;if(current!=null)current.run();
    }
}
