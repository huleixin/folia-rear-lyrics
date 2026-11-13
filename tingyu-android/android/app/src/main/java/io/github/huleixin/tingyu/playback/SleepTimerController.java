package io.github.huleixin.tingyu.playback;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import com.getcapacitor.JSObject;
import java.util.function.Consumer;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/SleepTimerController.java
/** Single process owner. Never constructs a player or starts a playback service. All calls on main. */
public final class SleepTimerController {
    private static SleepTimerController instance;
    public static SleepTimerController get(Context context){
        if(instance==null)instance=new SleepTimerController(context.getApplicationContext());return instance;
    }
    private final SleepTimerState state=new SleepTimerState();
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final android.content.SharedPreferences prefs;
    private final Context context;
    private ExoPlayer player;
    private Runnable pause;
    private final SleepTimerOutput output=new SleepTimerOutput();
    private SleepTimerOutput.Port nativeOutput;
    private CompatibleSleepOutput compatible;
    private boolean pausePending;
    private long pauseTicket;
    private int pauseAttempts;
    private final java.util.Set<Consumer<JSObject>> observers=new java.util.LinkedHashSet<>();
    private String reason="idle";
    private long sample;
    private SleepTimerController(Context context){
        this.context=context;
        prefs=context.getSharedPreferences("sleep-timer",0);
        state.generation=prefs.getLong("generation",0);
        // A new process has no old playback session. Retire it, never rearm or wake audio.
        if(prefs.getBoolean("active",false)){state.cancel();reason="interrupted-process";persist();}
    }
    public void observe(Consumer<JSObject> observer){observers.add(observer);}
    public void unobserve(Consumer<JSObject> observer){observers.remove(observer);}
    public void attach(ExoPlayer player,Runnable pause){
        if(compatible!=null)throw new IllegalStateException("Compatible output still owns audio");
        this.player=player;this.pause=pause;
        nativeOutput=new SleepTimerOutput.Port(){
            public boolean ready(){return player.getCurrentMediaItem()!=null;}
            public boolean playing(){return player.getPlayWhenReady();}
            public void barrier(boolean enabled){player.setPauseAtEndOfMediaItems(enabled);}
            public void pause(long ticket,Consumer<Boolean> done){pause.run();done.accept(!player.getPlayWhenReady());}
        };
        output.attach(nativeOutput);pauseAttempts=0;applyBarrier();if(pausePending)requestPause();
    }
    /** Handoff is not a cancelled timer; no deadline/generation is changed here. */
    public void nativeDetached(){if(nativeOutput!=null)output.detach(nativeOutput);nativeOutput=null;player=null;pause=null;}
    public void detach(){nativeDetached();if(compatible==null)cancel("session-ended");}
    /** Bridge destruction retires its output lease, not the process-owned sleep deadline. */
    public void compatibilityDestroyed(android.webkit.WebView web){
        if(compatible==null||!compatible.owns(web))return;
        io.github.huleixin.tingyu.RearNativeTrack.releaseCompatible(compatible.lease);output.detach(compatible);compatible=null;
        if(state.active||pausePending){reason="output-disconnected";persist();publish();}
    }
    public JSObject compatibility(android.webkit.WebView web,JSObject message){
        String lease=message.optString("lease"),action=message.optString("action");
        if(lease.isEmpty()||lease.length()>80)throw new IllegalArgumentException("Invalid output lease");
        if("claim".equals(action)){
            if(NativeAudioEngine.isActive())throw new IllegalStateException("Native output not detached");
            if(compatible!=null&&!compatible.lease.equals(lease))throw new IllegalStateException("Compatible output already owned");
            if(compatible==null){compatible=new CompatibleSleepOutput(lease,web);output.attach(compatible);pauseAttempts=0;}
        }
        if(compatible==null||!compatible.lease.equals(lease))return new JSObject().put("accepted",false);
        if("pause-check".equals(action)||"pause-ack".equals(action)){
            boolean valid=pausePending&&message.optLong("ticket",-1)==pauseTicket&&pauseTicket==state.generation;
            if(valid&&"pause-ack".equals(action))compatible.acknowledge(pauseTicket,message.optBoolean("paused"));
            return new JSObject().put("accepted",valid);
        }
        if("release".equals(action)){
            if(!message.optBoolean("paused"))throw new IllegalStateException("Compatible output not paused");
            io.github.huleixin.tingyu.RearNativeTrack.releaseCompatible(lease);compatible.barrier(false);output.detach(compatible);compatible=null;return new JSObject().put("accepted",true);
        }
        long revision=message.optLong("revision");
        if(revision<compatible.revision)return new JSObject().put("accepted",false);
        compatible.revision=revision;compatible.songKey=message.optString("songKey");compatible.playing=message.optBoolean("playing");
        io.github.huleixin.tingyu.RearNativeTrack.compatible(lease,compatible.songKey,message.optString("playbackAttempt"));
        io.github.huleixin.tingyu.RearNativeTrack.onCompatibleClock(lease,compatible.songKey,message.optString("playbackAttempt"),message);
        if("resume".equals(action))pauseAttempts=0;
        check();applyBarrier();
        boolean blocked=pausePending;
        if("boundary".equals(action)&&state.active&&state.waiting){blocked=true;boundary();}
        if(pausePending&&!"boundary".equals(action))requestPause();
        return snapshot().put("accepted",true).put("blocked",blocked);
    }
    public JSObject start(String mode,long duration){
        if(!output.ready())throw new IllegalStateException("请先选择歌曲并等待播放通道就绪");
        state.start(SleepTimerState.Mode.valueOf(mode),duration,SystemClock.elapsedRealtime());
        output.invalidate();pausePending=false;
        reason="started";cancelAlarm();handler.removeCallbacksAndMessages(null);applyBarrier();persist();publish();schedule();return snapshot();
    }
    public JSObject cancel(String reason){state.cancel();output.invalidate();pausePending=false;this.reason=reason;cancelAlarm();handler.removeCallbacksAndMessages(null);applyBarrier();persist();publish();return snapshot();}
    public JSObject snapshot(){return new JSObject().put("sample",++sample).put("generation",state.generation).put("active",state.active||pausePending)
        .put("mode",state.mode.name()).put("waiting",state.waiting).put("durationMs",state.duration)
        .put("remainingMs",state.remaining(SystemClock.elapsedRealtime())).put("reason",reason).put("pausePending",pausePending)
        .put("output",compatible!=null?"compatible":nativeOutput!=null?"media3":"none");}
    public void check(){
        if(!state.active)return;
        boolean wasWaiting=state.waiting;
        boolean expire=state.tick(SystemClock.elapsedRealtime(),output.playing());
        if(expire){finish();return;}
        if(wasWaiting!=state.waiting){cancelAlarm();applyBarrier();persist();publish();}
    }
    /** Called on Media3 END_OF_MEDIA_ITEM, before supervision can take the boundary. */
    public void boundary(){if(state.boundary())finish();}
    public boolean waiting(){check();return state.active&&state.waiting;}
    private void finish(){
        reason="pause-pending";pausePending=true;pauseAttempts=0;pauseTicket=state.generation;cancelAlarm();handler.removeCallbacksAndMessages(null);
        persist();publish();requestPause();
    }
    private void requestPause(){
        if(!pausePending||pauseAttempts>=3)return;
        pauseAttempts++;
        final long ticket=pauseTicket;
        output.pause(ticket,confirmed->{
            if(!pausePending||ticket!=pauseTicket||ticket!=state.generation)return;
            if(confirmed){pausePending=false;reason="completed";applyBarrier();persist();publish();}
            else{reason="pause-unconfirmed";persist();publish();}
        });
        handler.postDelayed(()->{if(pausePending&&ticket==pauseTicket&&ticket==state.generation&&!"pause-unconfirmed".equals(reason)){reason="pause-unconfirmed";persist();publish();}},2000);
    }
    private void applyBarrier(){output.barrier((state.active&&state.waiting)||pausePending);}
    private void schedule(){
        if(!state.active||state.waiting)return;
        long ticket=state.generation;
        android.app.AlarmManager alarm=(android.app.AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
        if(alarm!=null)alarm.setAndAllowWhileIdle(android.app.AlarmManager.ELAPSED_REALTIME_WAKEUP,state.deadline,alarmIntent(ticket));
        handler.postDelayed(()->{if(ticket!=state.generation)return;check();schedule();},Math.max(1,state.remaining(SystemClock.elapsedRealtime())));
    }
    public void alarm(long generation){if(generation==state.generation)check();}
    private android.app.PendingIntent alarmIntent(long generation){
        android.content.Intent intent=new android.content.Intent(context,SleepTimerReceiver.class).putExtra("generation",generation);
        return android.app.PendingIntent.getBroadcast(context,27072,intent,android.app.PendingIntent.FLAG_UPDATE_CURRENT|android.app.PendingIntent.FLAG_IMMUTABLE);
    }
    private void cancelAlarm(){android.app.AlarmManager alarm=(android.app.AlarmManager)context.getSystemService(Context.ALARM_SERVICE);if(alarm!=null)alarm.cancel(alarmIntent(-1));}
    private void persist(){prefs.edit().putLong("generation",state.generation).putBoolean("active",state.active||pausePending)
        .putString("mode",state.mode.name()).putBoolean("waiting",state.waiting).putLong("deadlineElapsed",state.deadline)
        .putLong("deadlineWall",System.currentTimeMillis()+state.remaining(SystemClock.elapsedRealtime())).putLong("duration",state.duration).apply();}
    private void publish(){
        PlaybackDiagnostics.note("sleep-timer",new JSObject().put("generation",state.generation).put("state",reason).put("mode",state.mode.name())
            .put("output",compatible!=null?"compatible":nativeOutput!=null?"media3":"none").put("pausePending",pausePending).put("attempts",pauseAttempts));
        JSObject value=snapshot();
        for(Consumer<JSObject> observer:new java.util.ArrayList<>(observers)){
            try {observer.accept(value);}
            catch(RuntimeException failure){PlaybackDiagnostics.note("sleep-observer-error",new JSObject().put("type",failure.getClass().getSimpleName()));}
        }
    }
}
