package io.github.huleixin.tingyu.playback;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.os.PowerManager;
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
    /** True while the engine holds a source and the user has not paused it; lets the service survive a sticky restart with playback intact. */
    public static boolean isPlaybackActive(){return instance!=null&&!instance.sourceId.isEmpty()&&!instance.desiredPaused;}
    public static boolean mediaSeek(long positionMs){
        if(!isActive())return false;
        NativeAudioEngine engine=instance;
        Runnable seek=()->{engine.player.seekTo(Math.max(0,positionMs));engine.emit("seeked",true);};
        if(Looper.myLooper()==Looper.getMainLooper())seek.run();else engine.main.post(seek);
        return true;
    }
    /** The system notification reads the decoder clock, even when the visual clock is asleep. */
    public static long[] mediaClock(String songKey){
        NativeAudioEngine engine=instance;
        if(!isActive()||Looper.myLooper()!=Looper.getMainLooper()||!engine.songKey.equals(songKey))return null;
        return new long[]{Math.max(0,engine.player.getCurrentPosition()),engine.player.isPlaying()?1:0};
    }
    public static boolean mediaAction(String action){
        if(!isActive())return false;
        if(action.equals("next")&&Looper.myLooper()==Looper.getMainLooper()&&instance.player.hasNextMediaItem()){
            instance.player.seekToNextMediaItem();return true;
        }
        if(!java.util.Arrays.asList("play","pause","stop","toggle").contains(action))return false;
        NativeAudioEngine engine=instance;
        Runnable transport=()->{
            if(instance!=engine||engine.sourceId.isEmpty())return;
            engine.transport(NativeTransportIntent.resolve(action,engine.desiredPaused,engine.player.getPlayWhenReady()),true);
        };
        if(Looper.myLooper()==Looper.getMainLooper())transport.run();else engine.main.post(transport);return true;
    }
    public static void releaseIfPresent(){if(instance!=null){instance.release();instance=null;}}
    private final Handler main=new Handler(Looper.getMainLooper());
    private final ExoPlayer player;
    private final Context context;
    private final PlaybackSpectrumProcessor spectrum;
    private final NativeAudioOutputPolicy outputPolicy=new NativeAudioOutputPolicy();
    private boolean interactive=true;
    private Consumer<JSObject> listener;
    private volatile String sourceId="";
    private String songKey="";
    private final PowerManager.WakeLock handoffWake;
    private boolean endedHandoff;
    private long sequence,fadeGeneration;
    private float volume=1;
    private boolean fade=true;
    private boolean desiredPaused=true;
    private PlaybackException failure;
    private int networkRetries;
    private long retryGeneration;
    private final Runnable heartbeat=new Runnable(){public void run(){if(!sourceId.isEmpty()){emit("clock",false);if(needsClock())main.postDelayed(this,1000);}}};
    private NativeAudioEngine(Context context){
        this.context=context;
        PlaybackTestDiagnostics.note("engine-create-start",new JSObject());
        PlaybackDiagnostics.initialize(context);
        android.media.AudioManager audioManager=(android.media.AudioManager)context.getSystemService(Context.AUDIO_SERVICE);
        if(audioManager!=null)audioManager.registerAudioDeviceCallback(new android.media.AudioDeviceCallback(){
            private JSObject describe(android.media.AudioDeviceInfo[] devices){
                JSObject value=new JSObject();
                for(int i=0;i<Math.min(8,devices.length);i++)value.put("type"+i,devices[i].getType());
                return value;
            }
            @Override public void onAudioDevicesAdded(android.media.AudioDeviceInfo[] added){
                PlaybackDiagnostics.note("audio-devices-added",describe(added));
            }
            @Override public void onAudioDevicesRemoved(android.media.AudioDeviceInfo[] removed){
                PlaybackDiagnostics.note("audio-devices-removed",describe(removed));
            }
        },null);
        PowerManager power=(PowerManager)context.getSystemService(Context.POWER_SERVICE);
        handoffWake=power==null?null:power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"Tingyu:TrackHandoff");
        if(handoffWake!=null)handoffWake.setReferenceCounted(false);
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
            @Override public void onMediaItemTransition(MediaItem item,int reason){
                if(sourceId.isEmpty()||item==null||item.localConfiguration==null||!(item.localConfiguration.tag instanceof JSObject))return;
                JSObject queued=(JSObject)item.localConfiguration.tag;
                songKey=item.mediaId;endedHandoff=false;
                if(reason==Player.MEDIA_ITEM_TRANSITION_REASON_AUTO)applyOutputPolicy(true);
                io.github.huleixin.tingyu.FoliaPlaybackService.publishQueuedTrack(context,queued,player.getPlayWhenReady());
                PlaybackDiagnostics.note("queue-transition",new JSObject().put("reason",reason)
                    .put("song",PlaybackDiagnostics.anonKey(songKey)).put("index",player.getCurrentMediaItemIndex())
                    .put("items",player.getMediaItemCount()).put("remaining",Math.max(0,player.getMediaItemCount()-player.getCurrentMediaItemIndex()-1)));
                emit("queue-transition",true);
            }
            @Override public void onPlayWhenReadyChanged(boolean playWhenReady,int reason){
                // The reason field distinguishes user pause from focus loss / noisy output /
                // remote commands; this is the difference between "user stopped it" and
                // "the system stopped it" in a post-mortem.
                PlaybackDiagnostics.note("play-when-ready",new JSObject().put("playWhenReady",playWhenReady)
                    .put("reason",reason).put("suppression",player.getPlaybackSuppressionReason())
                    .put("song",PlaybackDiagnostics.anonKey(songKey)));
            }
            @Override public void onPlaybackSuppressionReasonChanged(int reason){
                PlaybackDiagnostics.note("suppression",new JSObject().put("reason",reason)
                    .put("playing",player.isPlaying()).put("song",PlaybackDiagnostics.anonKey(songKey)));
            }
            @Override public void onEvents(Player p,Player.Events events){
                if(!events.containsAny(Player.EVENT_PLAYBACK_STATE_CHANGED,Player.EVENT_IS_PLAYING_CHANGED,Player.EVENT_PLAY_WHEN_READY_CHANGED,Player.EVENT_PLAYER_ERROR,Player.EVENT_TIMELINE_CHANGED,Player.EVENT_POSITION_DISCONTINUITY))return;
                // Media3 releases its normal wake lock at EOF. Protect only the bounded async
                // queue/source handoff; hidden WebView animations remain stopped.
                if(p.getPlaybackState()==Player.STATE_ENDED&&!desiredPaused&&!sourceId.isEmpty()&&!endedHandoff){
                    endedHandoff=true;if(handoffWake!=null)handoffWake.acquire(20_000L);
                }
                if(p.isPlaying()||p.getPlayerError()!=null)releaseHandoff();
                if(p.getPlaybackState()==Player.STATE_ENDED&&p.getNextMediaItemIndex()<0&&!desiredPaused&&!sourceId.isEmpty())
                    // The playlist drained with no queued successor: the single most important
                    // long-session stop signature. Records where it stopped so a later report
                    // shows whether JS replenishment was late or never came.
                    PlaybackDiagnostics.note("queue-exhausted",new JSObject()
                        .put("song",PlaybackDiagnostics.anonKey(songKey)).put("positionMs",Math.max(0,p.getCurrentPosition()))
                        .put("index",p.getCurrentMediaItemIndex()).put("items",p.getMediaItemCount())
                        .put("playWhenReady",p.getPlayWhenReady()).put("suppression",p.getPlaybackSuppressionReason()));
                if(!p.getPlayWhenReady()||p.getPlaybackState()==Player.STATE_ENDED)applyOutputPolicy(true);
                emit("state",false);main.removeCallbacks(heartbeat);if(needsClock())main.postDelayed(heartbeat,1000);
            }
            @Override public void onPlayerError(PlaybackException error){
                PlaybackTestDiagnostics.error("player-error",error);
                PlaybackDiagnostics.note("player-error",new JSObject().put("code",error.errorCode)
                    .put("name",error.getErrorCodeName()).put("song",PlaybackDiagnostics.anonKey(songKey))
                    .put("positionMs",Math.max(0,player.getCurrentPosition()))
                    .put("index",player.getCurrentMediaItemIndex()).put("items",player.getMediaItemCount())
                    .put("remaining",Math.max(0,player.getMediaItemCount()-player.getCurrentMediaItemIndex()-1))
                    .put("retries",networkRetries));
                if(!desiredPaused&&NativeRetryPolicy.canRetry(error.errorCode,networkRetries)){
                    int attempt=++networkRetries;String token=sourceId;long generation=++retryGeneration;
                    PlaybackTestDiagnostics.note("network-retry",new JSObject().put("attempt",attempt).put("code",error.errorCode));
                    main.postDelayed(()->{if(generation!=retryGeneration||!sourceId.equals(token)||desiredPaused)return;
                        failure=null;player.prepare();player.play();},attempt*400L);
                    return;
                }
                failure=error;emit("error",false);
            }
            @Override public void onPositionDiscontinuity(Player.PositionInfo old,Player.PositionInfo next,int reason){if(reason==Player.DISCONTINUITY_REASON_SEEK)emit("seeked",false);}
        });
        PlaybackTestDiagnostics.note("engine-create-ready",new JSObject());
    }
    public void listen(Consumer<JSObject> listener){this.listener=listener;}
    public void unlisten(Consumer<JSObject> listener){if(this.listener==listener)this.listener=null;}
    public JSObject command(JSObject value){
        String action=value.optString("action"),id=value.optString("id");long seq=value.optLong("sequence");
        if(action.equals("prepare")){
            if(id.isEmpty())throw new IllegalArgumentException("Missing source identity");
            String url=value.optString("uri");Uri uri=Uri.parse(url);
            if(!java.util.Arrays.asList("http","https","content","file").contains(uri.getScheme()))throw new IllegalArgumentException("Unsupported native audio URI");
            MediaItem active=player.getCurrentMediaItem();
            if(value.optBoolean("adopt")){
                sourceId=id;sequence=seq;
                if(active!=null&&active.localConfiguration!=null&&active.mediaId.equals(value.optString("songKey"))&&active.localConfiguration.uri.equals(uri)){
                    emit("load",false);return new JSObject().put("accepted",true);
                }
                // JS can wake after more than one native transition. Do not rewind to
                // its stale intermediate item; reconcile the current native item again.
                return new JSObject().put("accepted",true).put("state",snapshot("queue-transition",true));
            }
            PlaybackTestDiagnostics.note("prepare",new JSObject().put("scheme",uri.getScheme()).put("host",uri.getHost()));
            sourceId="";songKey=value.optString("songKey");endedHandoff=false;sequence=seq;failure=null;networkRetries=0;retryGeneration++;desiredPaused=true;cancelFade();player.pause();
            configure(value);player.setMediaItem(new MediaItem.Builder().setUri(uri).setMediaId(songKey).setTag(copy(value)).build(),Math.max(0,value.optLong("position")));sourceId=id;player.prepare();
            io.github.huleixin.tingyu.FoliaPlaybackService.publishQueuedTrack(context,value,false);emit("load",false);
        }else{
            if(!sourceId.equals(id)||seq<sequence)return new JSObject().put("accepted",false);
            sequence=seq;
            switch(action){
                case "play":case "pause":case "stop":transport(action,false);break;
                case "detach":cancelFade();PlaybackDiagnostics.note("engine-detach",new JSObject().put("song",PlaybackDiagnostics.anonKey(songKey))
                        .put("positionMs",Math.max(0,player.getCurrentPosition())));player.stop();player.clearMediaItems();sourceId="";main.removeCallbacks(heartbeat);break;
                case "seek":player.seekTo(Math.max(0,value.optLong("position")));break;
                case "volume":volume=(float)Math.max(0,Math.min(1,value.optDouble("volume",1)));cancelFade();player.setVolume(volume);break;
                case "configure":configure(value);break;
                case "queue":
                    if(!songKey.equals(value.optString("songKey")))return new JSObject().put("accepted",false);
                    replaceQueuedTracks(value.optJSONArray("tracks"));break;
                case "snapshot":return new JSObject().put("accepted",true).put("state",snapshot("snapshot",true));
                default:throw new IllegalArgumentException("Unknown native playback command");
            }
        }
        return new JSObject().put("accepted",true);
    }
    /** Only resolved playable URIs enter this playlist; Media3 owns boundary timing. */
    private void replaceQueuedTracks(org.json.JSONArray entries){
        java.util.ArrayList<MediaItem> items=new java.util.ArrayList<>();
        if(entries!=null)for(int i=0;i<Math.min(1000,entries.length());i++){
            org.json.JSONObject raw=entries.optJSONObject(i);if(raw==null)break;
            Uri uri=Uri.parse(raw.optString("uri"));
            if(!java.util.Arrays.asList("http","https","content","file").contains(uri.getScheme())||raw.optString("songKey").isEmpty())break;
            JSObject tag=copy(raw);
            items.add(new MediaItem.Builder().setUri(uri).setMediaId(tag.optString("songKey")).setTag(tag).build());
        }
        int next=player.getCurrentMediaItemIndex()+1;
        int removed=next<player.getMediaItemCount()?player.getMediaItemCount()-next:0;
        if(next<player.getMediaItemCount())player.removeMediaItems(next,player.getMediaItemCount());
        if(!items.isEmpty())player.addMediaItems(items);
        PlaybackDiagnostics.note("queue-replenish",new JSObject().put("accepted",items.size()).put("rejected",entries==null?0:Math.max(0,entries.length()-items.size()))
            .put("removed",removed).put("items",player.getMediaItemCount()).put("index",player.getCurrentMediaItemIndex())
            .put("remaining",Math.max(0,player.getMediaItemCount()-player.getCurrentMediaItemIndex()-1)));
    }
    private void configure(JSObject value){
        fade=value.optBoolean("fade",fade);spectrum.enabled=value.optBoolean("analysis",spectrum.enabled);
        if(value.has("volume")){volume=(float)Math.max(0,Math.min(1,value.optDouble("volume",volume)));player.setVolume(volume);}
        player.setRepeatMode(value.optBoolean("loop",false)?Player.REPEAT_MODE_ONE:Player.REPEAT_MODE_OFF);
        interactive=value.optBoolean("interactive",interactive);
        outputPolicy.request(interactive,spectrum.enabled);
        applyOutputPolicy(!player.getPlayWhenReady()||player.getPlaybackState()==Player.STATE_IDLE||player.getPlaybackState()==Player.STATE_ENDED);
    }
    private void applyOutputPolicy(boolean safeBoundary){
        int mode=outputPolicy.change(safeBoundary);if(mode<0)return;
        PlaybackTestDiagnostics.note("output-policy",new JSObject().put("offloadPreference",mode).put("safeBoundary",safeBoundary).put("interactive",interactive).put("analysis",spectrum.enabled));
        PlaybackDiagnostics.note("output-policy",new JSObject().put("offloadPreference",mode).put("safeBoundary",safeBoundary));
        player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon().setAudioOffloadPreferences(
            new TrackSelectionParameters.AudioOffloadPreferences.Builder().setAudioOffloadMode(mode).build()).build());
    }
    private boolean needsClock(){return player.getPlayWhenReady()&&player.getPlaybackState()!=Player.STATE_ENDED&&player.getPlayerError()==null;}
    private void cancelFade(){fadeGeneration++;}
    private void releaseHandoff(){if(handoffWake!=null&&handoffWake.isHeld())handoffWake.release();}
    private void transport(String action,boolean external){
        cancelFade();
        desiredPaused=!action.equals("play");
        if(desiredPaused)releaseHandoff();
        if(desiredPaused)retryGeneration++;
        if(action.equals("stop")){player.pause();player.seekTo(0);emit("state",external);main.removeCallbacks(heartbeat);return;}
        if(action.equals("play")){if(player.getPlaybackState()==Player.STATE_IDLE&&player.getCurrentMediaItem()!=null){failure=null;networkRetries=0;player.prepare();}
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
        value.put("songKey",songKey);
        MediaItem item=player.getCurrentMediaItem();
        if(!type.equals("diagnostics")&&item!=null&&item.localConfiguration!=null&&item.localConfiguration.tag instanceof JSObject)value.put("uri",item.localConfiguration.uri.toString());
        // JS receives this asynchronously. Anchor interpolation to sampling, not delivery,
        // so delayed heartbeats cannot rewind lyric/word animations at a boundary.
        value.put("capturedAtMs",System.currentTimeMillis());
        value.put("position",Math.max(0,player.getCurrentPosition())/1000.0);value.put("duration",Math.max(0,player.getDuration())/1000.0);
        value.put("buffered",Math.max(0,player.getBufferedPosition())/1000.0);value.put("playing",player.isPlaying());value.put("paused",desiredPaused||!player.getPlayWhenReady());
        value.put("status",player.getPlaybackState());
        if(failure!=null){value.put("errorCode",failure.errorCode);value.put("message",failure.getErrorCodeName());}
        if(type.equals("diagnostics")){
            value.put("nativeQueueItems",player.getMediaItemCount()).put("nativeQueueIndex",player.getCurrentMediaItemIndex())
                .put("analysis",spectrum.enabled).put("offloadPreference",outputPolicy.applied()).put("interactive",interactive).put("handoffWakeHeld",handoffWake!=null&&handoffWake.isHeld());
            value.put("volume",player.getVolume()).put("playWhenReady",player.getPlayWhenReady()).put("suppressionReason",player.getPlaybackSuppressionReason()).put("audioSessionId",player.getAudioSessionId());
            androidx.media3.common.Format format=player.getAudioFormat();
            if(format!=null)value.put("mime",format.sampleMimeType).put("sampleRate",format.sampleRate).put("channels",format.channelCount).put("pcmEncoding",format.pcmEncoding);
        }
        return value;
    }
    private void emit(String type,boolean external){
        // The system session must follow Media3 even with no plugin listener or a sleeping WebView.
        // Deduplicated native events only; clock/spectrum frames never rebuild the notification.
        if(!sourceId.isEmpty()&&!type.equals("clock")&&!type.equals("spectrum")&&!type.equals("diagnostics"))
            io.github.huleixin.tingyu.FoliaPlaybackService.nativePlaybackChanged(type.equals("seeked"));
        if(listener==null&&!io.github.huleixin.tingyu.BuildConfig.PLAYBACK_ENGINE_TEST)return;
        JSObject value=snapshot(type,external);
        if(!type.equals("clock")&&io.github.huleixin.tingyu.BuildConfig.PLAYBACK_ENGINE_TEST){JSObject safe=copy(value);safe.remove("uri");PlaybackTestDiagnostics.note(type,safe);}
        if(listener!=null&&!sourceId.isEmpty())listener.accept(value);
    }
    private static JSObject copy(org.json.JSONObject value){JSObject result=new JSObject();java.util.Iterator<String> keys=value.keys();while(keys.hasNext()){String key=keys.next();result.put(key,value.opt(key));}return result;}
    private void emitSpectrum(int[] bins){String token=sourceId;main.post(()->{
        if(!spectrum.enabled||sourceId.isEmpty()||!sourceId.equals(token)||listener==null)return;
        JSObject value=snapshot("spectrum",false);JSArray array=new JSArray();for(int bin:bins)array.put(bin);
        value.put("spectrum",array);listener.accept(value);
    });}
    private void release(){PlaybackDiagnostics.note("engine-release",new JSObject().put("song",PlaybackDiagnostics.anonKey(songKey))
            .put("positionMs",Math.max(0,player.getCurrentPosition())));releaseHandoff();cancelFade();main.removeCallbacksAndMessages(null);sourceId="";listener=null;player.release();spectrum.close();}
}
