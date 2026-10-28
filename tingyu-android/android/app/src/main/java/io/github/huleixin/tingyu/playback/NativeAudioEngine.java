package io.github.huleixin.tingyu.playback;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import androidx.media3.common.*;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.okhttp.OkHttpDataSource;
import androidx.media3.exoplayer.*;
import androidx.media3.exoplayer.audio.*;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import okhttp3.OkHttpClient;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/NativeAudioEngine.java
/** Process/service-owned Media3 player; Activity focus and WebView drawing do not own playback. */
public final class NativeAudioEngine {
    private static NativeAudioEngine instance;
    public static NativeAudioEngine get(Context context){if(instance==null)instance=new NativeAudioEngine(context.getApplicationContext());return instance;}
    public static boolean isActive(){return instance!=null&&!instance.sourceId.isEmpty();}
    public static boolean mediaAction(String action){
        if(!isActive())return false;
        if(!java.util.Arrays.asList("play","pause","stop").contains(action))return false;
        NativeAudioEngine engine=instance;
        if(Looper.myLooper()==Looper.getMainLooper())engine.transport(action,true);else engine.main.post(()->engine.transport(action,true));return true;
    }
    public static void releaseIfPresent(){if(instance!=null){instance.release();instance=null;}}
    private final Handler main=new Handler(Looper.getMainLooper());
    private final ExoPlayer player;
    private final PlaybackSpectrumProcessor spectrum;
    private Consumer<JSObject> listener;
    private volatile String sourceId="";
    private long sequence,fadeGeneration;
    private float volume=1;
    private boolean fade=true;
    private boolean desiredPaused=true;
    private PlaybackException failure;
    private final Runnable heartbeat=new Runnable(){public void run(){if(!sourceId.isEmpty()){emit("clock",false);if(needsClock())main.postDelayed(this,1000);}}};
    private NativeAudioEngine(Context context){
        spectrum=new PlaybackSpectrumProcessor(this::emitSpectrum);
        DefaultRenderersFactory renderers=new DefaultRenderersFactory(context){
            @Override protected AudioSink buildAudioSink(Context context,boolean floating,boolean params){
                return new DefaultAudioSink.Builder(context).setEnableFloatOutput(false).setAudioProcessors(new AudioProcessor[]{spectrum}).build();
            }
        };
        OkHttpClient http=new OkHttpClient.Builder().connectTimeout(15,TimeUnit.SECONDS).readTimeout(30,TimeUnit.SECONDS).build();
        player=new ExoPlayer.Builder(context,renderers)
            .setMediaSourceFactory(new DefaultMediaSourceFactory(new DefaultDataSource.Factory(context,new OkHttpDataSource.Factory(http))))
            .setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),true)
            .setHandleAudioBecomingNoisy(true).setWakeMode(C.WAKE_MODE_LOCAL).build();
        player.addListener(new Player.Listener(){
            @Override public void onEvents(Player p,Player.Events events){if(!events.containsAny(Player.EVENT_PLAYBACK_STATE_CHANGED,Player.EVENT_IS_PLAYING_CHANGED,Player.EVENT_PLAY_WHEN_READY_CHANGED,Player.EVENT_PLAYER_ERROR,Player.EVENT_TIMELINE_CHANGED,Player.EVENT_POSITION_DISCONTINUITY))return;emit("state",false);main.removeCallbacks(heartbeat);if(needsClock())main.postDelayed(heartbeat,1000);}
            @Override public void onPlayerError(PlaybackException error){failure=error;emit("error",false);}
            @Override public void onPositionDiscontinuity(Player.PositionInfo old,Player.PositionInfo next,int reason){if(reason==Player.DISCONTINUITY_REASON_SEEK)emit("seeked",false);}
        });
    }
    public void listen(Consumer<JSObject> listener){this.listener=listener;}
    public void unlisten(Consumer<JSObject> listener){if(this.listener==listener)this.listener=null;}
    public JSObject command(JSObject value){
        String action=value.optString("action"),id=value.optString("id");long seq=value.optLong("sequence");
        if(action.equals("prepare")){
            if(id.isEmpty())throw new IllegalArgumentException("Missing source identity");
            String url=value.optString("uri");Uri uri=Uri.parse(url);
            if(!java.util.Arrays.asList("http","https","content","file").contains(uri.getScheme()))throw new IllegalArgumentException("Unsupported native audio URI");
            sourceId="";sequence=seq;failure=null;desiredPaused=true;cancelFade();player.pause();
            configure(value);player.setMediaItem(MediaItem.fromUri(uri),Math.max(0,value.optLong("position")));sourceId=id;player.prepare();emit("load",false);
        }else{
            if(!sourceId.equals(id)||seq<sequence)return new JSObject().put("accepted",false);
            sequence=seq;
            switch(action){
                case "play":case "pause":case "stop":transport(action,false);break;
                case "detach":cancelFade();player.stop();player.clearMediaItems();sourceId="";main.removeCallbacks(heartbeat);break;
                case "seek":player.seekTo(Math.max(0,value.optLong("position")));break;
                case "volume":volume=(float)Math.max(0,Math.min(1,value.optDouble("volume",1)));cancelFade();player.setVolume(volume);break;
                case "configure":configure(value);break;
                default:throw new IllegalArgumentException("Unknown native playback command");
            }
        }
        return new JSObject().put("accepted",true);
    }
    private void configure(JSObject value){
        fade=value.optBoolean("fade",fade);spectrum.enabled=value.optBoolean("analysis",spectrum.enabled);
        if(value.has("volume")){volume=(float)Math.max(0,Math.min(1,value.optDouble("volume",volume)));player.setVolume(volume);}
        player.setRepeatMode(value.optBoolean("loop",false)?Player.REPEAT_MODE_ONE:Player.REPEAT_MODE_OFF);
        player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon().setAudioOffloadPreferences(
            new TrackSelectionParameters.AudioOffloadPreferences.Builder().setAudioOffloadMode(spectrum.enabled?0:1).build()).build());
    }
    private boolean needsClock(){return player.getPlayWhenReady()&&player.getPlaybackState()!=Player.STATE_ENDED&&player.getPlayerError()==null;}
    private void cancelFade(){fadeGeneration++;}
    private void transport(String action,boolean external){
        cancelFade();
        desiredPaused=!action.equals("play");
        if(action.equals("stop")){player.pause();player.seekTo(0);emit("state",external);main.removeCallbacks(heartbeat);return;}
        if(action.equals("play")){if(player.getPlaybackState()==Player.STATE_IDLE&&player.getCurrentMediaItem()!=null){failure=null;player.prepare();}
            boolean fadeIn=fade&&!player.isPlaying();player.setVolume(fadeIn?0:volume);player.play();emit("state",external);
            if(fadeIn){long generation=fadeGeneration,start=SystemClock.elapsedRealtime();main.post(new Runnable(){public void run(){
                if(generation!=fadeGeneration)return;float progress=Math.min(1,(SystemClock.elapsedRealtime()-start)/200f);player.setVolume(volume*progress);
                if(progress<1)main.postDelayed(this,16);
            }});}return;}
        if(!fade||!player.isPlaying()){player.pause();player.setVolume(volume);emit("state",external);return;}
        long generation=fadeGeneration,start=SystemClock.elapsedRealtime();float startVolume=player.getVolume();
        main.post(new Runnable(){public void run(){if(generation!=fadeGeneration)return;
            float progress=Math.min(1,(SystemClock.elapsedRealtime()-start)/200f);player.setVolume(startVolume*(1-progress));
            if(progress<1)main.postDelayed(this,16);else{player.pause();player.setVolume(volume);emit("state",external);}
        }});
    }
    public JSObject snapshot(String type,boolean external){
        JSObject value=new JSObject();value.put("id",sourceId);value.put("sequence",sequence);value.put("type",type);value.put("external",external);
        value.put("position",Math.max(0,player.getCurrentPosition())/1000.0);value.put("duration",Math.max(0,player.getDuration())/1000.0);
        value.put("buffered",Math.max(0,player.getBufferedPosition())/1000.0);value.put("playing",player.isPlaying());value.put("paused",desiredPaused||!player.getPlayWhenReady());
        value.put("status",player.getPlaybackState());
        if(failure!=null){value.put("errorCode",failure.errorCode);value.put("message",failure.getErrorCodeName());}
        return value;
    }
    private void emit(String type,boolean external){if(listener!=null&&!sourceId.isEmpty())listener.accept(snapshot(type,external));}
    private void emitSpectrum(int[] bins){String token=sourceId;main.post(()->{
        if(!spectrum.enabled||sourceId.isEmpty()||!sourceId.equals(token)||listener==null)return;
        JSObject value=snapshot("spectrum",false);JSArray array=new JSArray();for(int bin:bins)array.put(bin);
        value.put("spectrum",array);listener.accept(value);
    });}
    private void release(){cancelFade();main.removeCallbacksAndMessages(null);player.release();sourceId="";listener=null;}
}
