package io.github.huleixin.tingyu.playback;

import android.os.Handler;
import androidx.media3.common.MediaItem;
import androidx.media3.common.Player;
import com.getcapacitor.JSObject;
import java.util.ArrayList;
import org.json.JSONObject;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/NativeMixController.java
/** Native decoder lookahead and overlap; JS supplies plans, never the audible fade clock. */
final class NativeMixController {
    interface Host {
        NativeAudioDeck active();
        NativeAudioDeck create();
        void promote(NativeAudioDeck incoming);
        boolean allowed();
        float volume();
        void configure(NativeAudioDeck deck,MediaItem item);
    }
    private final Handler handler;private final Host host;
    private NativeAudioDeck warm,tail;
    private String warmedKey="",failedKey="",state="off",reason="disabled";
    private boolean enabled,closed,queued;
    private double seconds=5;
    private String mode="automix";
    private NativeMixPlan blend;
    private long incomingStart,blendLength;
    private int completed;
    private final Runnable tick=()->{queued=false;try{update();}catch(RuntimeException error){state="error";reason=error.getClass().getSimpleName();cancel();}schedule();};
    NativeMixController(Handler handler,Host host){this.handler=handler;this.host=host;}
    void configure(JSONObject value){
        if(value==null)return;
        boolean next=value.optBoolean("enabled");
        double length=value.optDouble("seconds",5);
        String nextMode=value.optString("mode","automix");
        if(next!=enabled||length!=seconds||!nextMode.equals(mode)){cancel();enabled=next;seconds=Double.isFinite(length)?length:5;mode=nextMode;}
        if(enabled){state=tail==null?"waiting":"overlap";reason="waiting-next-track";wake();}
        else{state="off";reason="disabled";}
    }
    boolean enabled(){return enabled;}
    boolean overlapping(){return tail!=null;}
    void wake(){if(enabled&&!closed&&!queued){queued=true;handler.post(tick);}}
    private void schedule(){if(enabled&&!closed&&host.active().player.getPlayWhenReady()&&!queued){queued=true;handler.postDelayed(tick,tail==null?100:16);}}
    private void discardWarm(){if(warm!=null){warm.close();warm=null;}warmedKey="";}
    /** Manual seek/skip/pause/detach terminates every secondary output before transport proceeds. */
    void cancel(){
        handler.removeCallbacks(tick);queued=false;discardWarm();
        NativeAudioDeck current=host.active(),retiring=tail;tail=null;
        // A failed promotion can leave the outgoing decoder as the current owner. Never release it.
        if(retiring!=null&&retiring!=current)retiring.close();
        blend=null;current.player.setVolume(host.volume());current.player.setPlaybackSpeed(1);
    }
    void close(){closed=true;cancel();}
    private static JSONObject tag(MediaItem item){return item!=null&&item.localConfiguration!=null&&item.localConfiguration.tag instanceof JSONObject?(JSONObject)item.localConfiguration.tag:null;}
    private void update(){
        if(!enabled||closed)return;
        NativeAudioDeck active=host.active();
        if(!host.allowed()||!active.player.getPlayWhenReady()||active.player.getPlaybackSuppressionReason()!=Player.PLAYBACK_SUPPRESSION_REASON_NONE){
            if(tail!=null||warm!=null)cancel();state="waiting";reason="transport-or-timer";return;
        }
        if(tail!=null){
            if(active.player.getPlayerError()!=null){cancel();state="error";reason="incoming-decoder";return;}
            // Buffering stalls must not fade the only audible track away on a wall-clock timer.
            if(!active.player.isPlaying())return;
            double progress=(active.player.getCurrentPosition()-incomingStart)/(double)Math.max(1,blendLength);
            active.player.setVolume(host.volume()*NativeMixPlan.incoming(progress));
            tail.player.setVolume(host.volume()*NativeMixPlan.outgoing(progress));
            if(progress>=1||tail.player.getPlaybackState()==Player.STATE_ENDED){
                tail.close();tail=null;blend=null;active.player.setVolume(host.volume());completed++;state="completed";reason="equal-power-overlap";
                PlaybackDiagnostics.note("native-mix-completed",diagnostics());
            }
            return;
        }
        int next=active.player.getNextMediaItemIndex();
        if(active.player.getRepeatMode()==Player.REPEAT_MODE_ONE||next<0){discardWarm();state="waiting";reason=next<0?"no-resolved-next":"repeat-one";return;}
        MediaItem from=active.player.getCurrentMediaItem(),to=active.player.getMediaItemAt(next);
        JSONObject metadata=tag(to);long nextDuration=metadata==null?0:metadata.optLong("duration");
        long duration=active.player.getDuration(),position=active.player.getCurrentPosition();
        // Metadata may omit duration; decode ahead to learn it instead of disabling every blend.
        if(warm!=null&&warm.player.getDuration()>0)nextDuration=warm.player.getDuration();
        if(nextDuration<=0)nextDuration=duration;
        NativeMixPlan plan=NativeMixPlan.resolve(from.mediaId,to.mediaId,duration,nextDuration,seconds,metadata==null?null:metadata.optJSONObject("transition"));
        if(plan==null){discardWarm();state="waiting";reason="unknown-duration-or-cut-plan";return;}
        String key=from.mediaId+"\n"+to.mediaId+"\n"+to.localConfiguration.uri;
        if(!key.equals(warmedKey))discardWarm();
        if(plan.start-position>15000)return;
        if(key.equals(failedKey)){state="error";reason="preload-failed";return;}
        if(warm==null){
            warm=host.create();warmedKey=key;warm.pcm();warm.player.setVolume(0);
            ArrayList<MediaItem> items=new ArrayList<>();for(int i=next;i<active.player.getMediaItemCount();i++)items.add(active.player.getMediaItemAt(i));
            host.configure(warm,to);warm.player.setMediaItems(items,0,plan.entry);warm.player.prepare();state="preloading";reason=plan.source;
            PlaybackDiagnostics.note("native-mix-preload",new JSObject().put("plan",plan.source).put("overlapMs",plan.length));
            return;
        }
        if(warm.player.getPlayerError()!=null){failedKey=key;discardWarm();state="error";reason="preload-failed";return;}
        if(position<plan.start)return;
        if(warm.player.getPlaybackState()!=Player.STATE_READY){state="preloading";reason="next-not-ready";return;}
        // Refresh the remaining playlist at promotion so a queue edit during buffering is kept.
        if(warm.player.getMediaItemCount()>1)warm.player.removeMediaItems(1,warm.player.getMediaItemCount());
        for(int i=next+1;i<active.player.getMediaItemCount();i++)warm.player.addMediaItem(active.player.getMediaItemAt(i));
        blendLength=Math.min(plan.length,Math.max(0,duration-position));
        if(blendLength<800){state="waiting";reason="late-preload";return;}
        blend=plan;incomingStart=warm.player.getCurrentPosition();
        tail=active;NativeAudioDeck incoming=warm;warm=null;warmedKey="";
        // Exactly one deck owns focus, noisy-device handling, queue, lyrics and the sleep timer.
        tail.spectrum.enabled=false;tail.player.setPauseAtEndOfMediaItems(true);
        tail.player.setPlaybackSpeed(plan.stretch);
        try{host.promote(incoming);}catch(RuntimeException error){
            if(host.active()!=incoming){incoming.close();host.active().focus(true);}
            throw error;
        }
        state="overlap";reason=plan.source;
        PlaybackDiagnostics.note("native-mix-start",new JSObject().put("overlapMs",blendLength).put("incomingReady",incoming.player.getPlaybackState()));
    }
    JSObject diagnostics(){return new JSObject().put("mixEnabled",enabled).put("mixState",state).put("mixReason",reason)
        .put("mixOverlap",tail!=null).put("mixCompleted",completed).put("mixIncomingPlaying",host.active().player.isPlaying())
        .put("mixTailPlaying",tail!=null&&tail.player.isPlaying()).put("mixIncomingVolume",host.active().player.getVolume())
        .put("mixTailVolume",tail==null?0:tail.player.getVolume());}
}
