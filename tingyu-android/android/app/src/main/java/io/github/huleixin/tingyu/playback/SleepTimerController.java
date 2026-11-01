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
    private Consumer<JSObject> observer;
    private String reason="idle";
    private long sample;
    private SleepTimerController(Context context){
        this.context=context;
        prefs=context.getSharedPreferences("sleep-timer",0);
        state.generation=prefs.getLong("generation",0);
        // A new process has no old playback session. Retire it, never rearm or wake audio.
        if(prefs.getBoolean("active",false)){state.cancel();reason="interrupted-process";persist();}
    }
    public void observe(Consumer<JSObject> observer){this.observer=observer;}
    public void unobserve(Consumer<JSObject> observer){if(this.observer==observer)this.observer=null;}
    public void attach(ExoPlayer player,Runnable pause){this.player=player;this.pause=pause;applyBarrier();}
    public void detach(){cancel("session-ended");player=null;pause=null;}
    public JSObject start(String mode,long duration){
        if(player==null||player.getCurrentMediaItem()==null)throw new IllegalStateException("请先选择歌曲并使用系统原生播放引擎");
        state.start(SleepTimerState.Mode.valueOf(mode),duration,SystemClock.elapsedRealtime());
        reason="started";cancelAlarm();handler.removeCallbacksAndMessages(null);applyBarrier();persist();publish();schedule();return snapshot();
    }
    public JSObject cancel(String reason){state.cancel();this.reason=reason;cancelAlarm();handler.removeCallbacksAndMessages(null);applyBarrier();persist();publish();return snapshot();}
    public JSObject snapshot(){return new JSObject().put("sample",++sample).put("generation",state.generation).put("active",state.active)
        .put("mode",state.mode.name()).put("waiting",state.waiting).put("durationMs",state.duration)
        .put("remainingMs",state.remaining(SystemClock.elapsedRealtime())).put("reason",reason);}
    public void check(){
        if(!state.active)return;
        boolean wasWaiting=state.waiting;
        boolean expire=state.tick(SystemClock.elapsedRealtime(),player!=null&&player.getPlayWhenReady());
        if(expire){finish();return;}
        if(wasWaiting!=state.waiting){cancelAlarm();applyBarrier();persist();publish();}
    }
    /** Called on Media3 END_OF_MEDIA_ITEM, before supervision can take the boundary. */
    public void boundary(){if(state.boundary())finish();}
    public boolean waiting(){check();return state.active&&state.waiting;}
    private void finish(){
        reason="completed";cancelAlarm();handler.removeCallbacksAndMessages(null);
        // Keep the barrier during pause publication. Remove it only after the owner is paused.
        if(pause!=null)pause.run();applyBarrier();persist();publish();
    }
    private void applyBarrier(){if(player!=null)player.setPauseAtEndOfMediaItems(state.active&&state.waiting);}
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
    private void persist(){prefs.edit().putLong("generation",state.generation).putBoolean("active",state.active)
        .putString("mode",state.mode.name()).putBoolean("waiting",state.waiting).putLong("deadlineElapsed",state.deadline)
        .putLong("deadlineWall",System.currentTimeMillis()+state.remaining(SystemClock.elapsedRealtime())).putLong("duration",state.duration).apply();}
    private void publish(){PlaybackDiagnostics.note("sleep-timer",new JSObject().put("generation",state.generation).put("state",reason).put("mode",state.mode.name()));if(observer!=null)observer.accept(snapshot());}
}
