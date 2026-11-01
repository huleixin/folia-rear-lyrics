package io.github.huleixin.tingyu.playback;

import android.webkit.WebView;
import java.lang.ref.WeakReference;
import java.util.function.Consumer;
import org.json.JSONObject;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/CompatibleSleepOutput.java
/** Uses the owning renderer directly, not a JS timer or the shared Capacitor task queue. */
final class CompatibleSleepOutput implements SleepTimerOutput.Port {
    final String lease;
    private final WeakReference<WebView> web;
    String songKey="";
    boolean playing;
    long revision=-1;
    private long pendingTicket;
    private Consumer<Boolean> pending;
    CompatibleSleepOutput(String lease,WebView web){this.lease=lease;this.web=new WeakReference<>(web);}
    boolean owns(WebView value){return web.get()==value;}
    public boolean ready(){return !songKey.isEmpty()&&web.get()!=null;}
    public boolean playing(){return playing;}
    public void barrier(boolean enabled){send("barrier",0,enabled,null);}
    public void pause(long ticket,Consumer<Boolean> acknowledged){pendingTicket=ticket;pending=acknowledged;send("pause",ticket,true,ok->{if(!ok)acknowledge(ticket,false);});}
    void acknowledge(long ticket,boolean paused){if(ticket==pendingTicket&&pending!=null){Consumer<Boolean> done=pending;pending=null;done.accept(paused);}}
    private void send(String action,long ticket,boolean enabled,Consumer<Boolean> done){
        WebView target=web.get();if(target==null){if(done!=null)done.accept(false);return;}
        String script="window.__tingyuSleepOutput && window.__tingyuSleepOutput("+JSONObject.quote(lease)+","+JSONObject.quote(action)+","+ticket+","+enabled+")";
        try{target.evaluateJavascript(script,result->{if(done!=null)done.accept("true".equals(result));});}
        catch(RuntimeException error){if(done!=null)done.accept(false);}
    }
}
