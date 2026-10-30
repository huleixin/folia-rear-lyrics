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
public final class NativeAudioEngine implements BackgroundContinuation.Host {
    /** Consecutive broken items the engine may skip through before it reports the error. */
    private static final int MAX_ERROR_SKIPS=3;
    /**
     * How many times an unreconcilable window may be re-asked inside one track. A stale anchor
     * means the UI store is looking at an older item than Media3, which one window rebuilt from
     * the engine's own position usually fixes; the cap keeps a permanently confused resolver from
     * becoming a request loop. The counter resets on every transition.
     */
    private static final int MAX_STALE_NUDGES=5;
    private static NativeAudioEngine instance;
    public static NativeAudioEngine get(Context context){if(instance==null)instance=new NativeAudioEngine(context.getApplicationContext());return instance;}
    public static boolean isActive(){return instance!=null&&!instance.sourceId.isEmpty();}
    /** True while the engine holds a source and the user has not paused it; lets the service survive a sticky restart with playback intact. */
    public static boolean isPlaybackActive(){return instance!=null&&!instance.sourceId.isEmpty()&&!instance.desiredPaused;}
    /**
     * The window drained but the logical playlist still has tracks: the session is held open
     * instead of reporting a finished playlist. Used by the MediaSession layer to publish
     * BUFFERING rather than PAUSED for the gap.
     */
    public static boolean isWaitingForNext(){return instance!=null&&instance.supervision.waiting();}
    /** The item Media3 is really on, for callers that must not trust the UI's idea of it. */
    public static String currentKey(){
        NativeAudioEngine engine=instance;
        if(engine==null||engine.sourceId.isEmpty())return "";
        MediaItem item=engine.player.getCurrentMediaItem();
        return item==null?engine.songKey:item.mediaId;
    }
    /** The item Media3 is really on, so a rebuilt service can restore metadata without JS. */
    public static JSObject currentTrackTag(){
        NativeAudioEngine engine=instance;
        if(engine==null||engine.sourceId.isEmpty())return null;
        Player player=engine.player;
        MediaItem item=player.getCurrentMediaItem();
        JSObject value=item!=null&&item.localConfiguration!=null&&item.localConfiguration.tag instanceof JSObject
            ?copy((JSObject)item.localConfiguration.tag):new JSObject();
        value.put("songKey",item==null?engine.songKey:item.mediaId);
        value.put("position",Math.max(0,player.getCurrentPosition()));
        value.put("playing",player.isPlaying());
        return value;
    }

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
    private final QueueSupervision supervision=new QueueSupervision();
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
    private int errorSkips;
    private long retryGeneration;
    private long queueGeneration=-1;
    private int queueAccepted,queueRejected,queueStale,staleNudges;
    /** Last verdict the engine actually honoured; diagnostics only. */
    private String lastVerdict="none";
    private long lastQueueAppliedAt;
    /**
     * Forensics for "the WebView stopped answering".
     *
     * Every command that crosses the bridge is proof the renderer ran at that instant, so the
     * age of the newest one is the only number that separates "JS is dead" from "JS answered
     * and the answer was wrong". It is sampled next to every queue ask so one report answers
     * the question without a second reproduction.
     */
    private long lastJsCommandAt=0L;
    private int jsCommands=0;
    private long jsSilentAtAsk=-1L;
    private final Runnable superviseTick=new Runnable(){public void run(){superviseQueue("tick");}};

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
                songKey=item.mediaId;endedHandoff=false;staleNudges=0;
                if(reason==Player.MEDIA_ITEM_TRANSITION_REASON_AUTO)applyOutputPolicy(true);
                io.github.huleixin.tingyu.FoliaPlaybackService.publishQueuedTrack(context,queued,player.getPlayWhenReady());
                // A background auto-advance into a track whose timeline was never primed leaves
                // the island empty. Ask the WebView for it now (it answers whenever it does run);
                // the player itself keeps going either way.
                if("pending".equals(io.github.huleixin.tingyu.coloros.ColorOsLyricBridge.stateOf(songKey))){
                    // The island goes blank at exactly this boundary when nothing is primed. It was
                    // never recorded before, so "lyrics vanished" had no native trace at all.
                    PlaybackDiagnostics.note("lyric-request",new JSObject()
                        .put("song",PlaybackDiagnostics.anonKey(songKey))
                        .put("state","pending").put("index",player.getCurrentMediaItemIndex())
                        .put("jsSilentMs",lastJsCommandAt==0L?-1L:SystemClock.elapsedRealtime()-lastJsCommandAt));
                    emit("lyric-request",false);
                }
                PlaybackDiagnostics.note("queue-transition",new JSObject().put("reason",reason)
                    .put("song",PlaybackDiagnostics.anonKey(songKey)).put("index",player.getCurrentMediaItemIndex())
                    .put("items",player.getMediaItemCount()).put("remaining",Math.max(0,player.getMediaItemCount()-player.getCurrentMediaItemIndex()-1)));
                emit("queue-transition",true);
                // Low-water check on the boundary: asking here gives JS the whole next track's
                // duration to answer, instead of only the seconds after the queue has drained.
                superviseQueue("transition");
            }
            @Override public void onIsPlayingChanged(boolean isPlaying){
                // Only real audible playback proves the current item is healthy; a skip that
                // immediately fails again keeps its budget.
                if(isPlaying)errorSkips=0;
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
                boolean drained=p.getPlaybackState()==Player.STATE_ENDED&&p.getNextMediaItemIndex()<0;
                if(drained&&!desiredPaused&&!sourceId.isEmpty())
                    // The playlist drained with no queued successor. Whether this is a real end or
                    // a late refill decides the whole long-session question, so the flag is part
                    // of the same record.
                    PlaybackDiagnostics.note("queue-exhausted",new JSObject()
                        .put("song",PlaybackDiagnostics.anonKey(songKey)).put("positionMs",Math.max(0,p.getCurrentPosition()))
                        .put("index",p.getCurrentMediaItemIndex()).put("items",p.getMediaItemCount())
                        .put("playWhenReady",p.getPlayWhenReady()).put("suppression",p.getPlaybackSuppressionReason())
                        .put("continues",supervision.continues()));
                // Decide before the state is published: a drained window with playlist left is a
                // gap to bridge, not a finished session, and the session layer reports it as such.
                if(drained||p.getPlaybackState()==Player.STATE_READY)superviseQueue(drained?"drained":"events");
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
                // A dead/expired URL for one queued item must not end the session: the next
                // resolved items are already in the native playlist, and in the background the
                // WebView may never run its own failure handling. Skip natively, bounded, so a
                // playlist of broken sources still surfaces an error instead of spinning.
                if(!desiredPaused&&errorSkips<MAX_ERROR_SKIPS&&player.getNextMediaItemIndex()>=0){
                    errorSkips++;
                    PlaybackDiagnostics.note("queue-skip-error",new JSObject().put("code",error.errorCode)
                        .put("song",PlaybackDiagnostics.anonKey(songKey)).put("skips",errorSkips)
                        .put("index",player.getCurrentMediaItemIndex()).put("items",player.getMediaItemCount())
                        .put("remaining",Math.max(0,player.getMediaItemCount()-player.getCurrentMediaItemIndex()-1)));
                    failure=null;networkRetries=0;
                    player.seekToNextMediaItem();player.prepare();player.play();
                    return;
                }
                failure=error;emit("error",false);
            }
            @Override public void onPositionDiscontinuity(Player.PositionInfo old,Player.PositionInfo next,int reason){if(reason==Player.DISCONTINUITY_REASON_SEEK)emit("seeked",false);}
        });
        PlaybackTestDiagnostics.note("engine-create-ready",new JSObject());
    }
    public void listen(Consumer<JSObject> listener){this.listener=listener;PlaybackLifecycle.noteBridge(true);}
    public void unlisten(Consumer<JSObject> listener){if(this.listener==listener){this.listener=null;PlaybackLifecycle.noteBridge(false);}}
    public JSObject command(JSObject value){
        String action=value.optString("action"),id=value.optString("id");long seq=value.optLong("sequence");
        lastJsCommandAt=SystemClock.elapsedRealtime();jsCommands++;PlaybackLifecycle.noteJsCommand();
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
        BackgroundContinuation.get().cancel();
            // A new source starts a new continuation story; the window command that follows
            // re-declares it. The generation is never invented here - JS owns that counter.
            supervision.continuation(false,supervision.generation());supervision.satisfied();errorSkips=0;
            main.removeCallbacks(superviseTick);
            configure(value);player.setMediaItem(new MediaItem.Builder().setUri(uri).setMediaId(songKey).setTag(copy(value)).build(),Math.max(0,value.optLong("position")));sourceId=id;player.prepare();
            io.github.huleixin.tingyu.FoliaPlaybackService.publishQueuedTrack(context,value,false);emit("load",false);
        }else{
            // A queue update is not transport. It arrives exactly when identity has just churned
            // (the engine auto-advanced while JS was asleep), so gating it on `id`/`sequence`
            // would reject the one message that keeps playback alive. Staleness is guarded by
            // the anchor rule inside applyQueue instead.
            if("queue".equals(action))return applyQueue(value);
            if(!sourceId.equals(id)||seq<sequence)return new JSObject().put("accepted",false);
            sequence=seq;
            switch(action){
                case "play":case "pause":case "stop":transport(action,false);if("play".equals(action))noteLiveness("play");break;
                case "detach":cancelFade();PlaybackDiagnostics.note("engine-detach",new JSObject().put("song",PlaybackDiagnostics.anonKey(songKey))
                        .put("positionMs",Math.max(0,player.getCurrentPosition())));player.stop();player.clearMediaItems();sourceId="";main.removeCallbacks(heartbeat);supervision.continuation(false,supervision.generation());supervision.satisfied();main.removeCallbacks(superviseTick);break;
                case "seek":player.seekTo(Math.max(0,value.optLong("position")));break;
                case "volume":volume=(float)Math.max(0,Math.min(1,value.optDouble("volume",1)));cancelFade();player.setVolume(volume);break;
                case "configure":configure(value);break;
                case "snapshot":{
                    // Sent by the element whenever the page becomes visible again: the one reliable
                    // "the renderer is alive" signal a backgrounded session produces.
                    noteLiveness("snapshot");
                    return new JSObject().put("accepted",true).put("state",snapshot("snapshot",true));
                }
                default:throw new IllegalArgumentException("Unknown native playback command");
            }
        }
        return new JSObject().put("accepted",true);
    }
    /**
     * Only resolved playable URIs enter this playlist; Media3 owns boundary timing.
     *
     * The payload is anchored: {@code songKey} names the track the window was computed for and
     * {@code continues} says whether the logical playlist has more after it. A window can arrive
     * when the player has already advanced past the anchor (the background WebView was late), so
     * the anchor is searched *inside* the offered window: everything up to and including it is
     * already history and is dropped instead of being replayed. A window that contains neither
     * the anchor nor the current item cannot be reconciled at all and is refused - the engine
     * then asks for a fresh window instead of corrupting the order.
     */
    /**
     * 采纳原生自己解析出来的下一首（阶段 B）。
     *
     * 走的是与 JS 窗口同一套校验，只是来源不同：代次、请求号、用户意图、队列去重，
     * 任一不过就丢弃 —— 迟到的解析结果绝不能盖掉已经播起来的队列。
     */
    void adoptContinuation(io.github.huleixin.tingyu.playback.NativePlaylist.Track track, String uri,
                           long requestId, long generation){
        if(track==null||uri==null||uri.isEmpty())return;
        if(desiredPaused||sourceId.isEmpty()){
            PlaybackDiagnostics.note("continuation-rejected",new JSObject()
                .put("song",PlaybackDiagnostics.anonKey(track.songKey)).put("reason","paused-or-detached"));
            return;
        }
        if(generation!=io.github.huleixin.tingyu.playback.NativePlaylist.get().generation()){
            PlaybackDiagnostics.note("continuation-rejected",new JSObject()
                .put("song",PlaybackDiagnostics.anonKey(track.songKey)).put("reason","generation")
                .put("generation",generation));
            return;
        }
        if(queueContainsInternal(track.songKey)){
            // JS 终究还是答了（或者这首歌本来就在窗口里）：原生这份作废，不能出现两遍。
            PlaybackDiagnostics.note("continuation-rejected",new JSObject()
                .put("song",PlaybackDiagnostics.anonKey(track.songKey)).put("reason","duplicate")
                .put("requestId",requestId));
            return;
        }
        Uri parsed=Uri.parse(uri);
        if(!java.util.Arrays.asList("http","https").contains(parsed.getScheme())){
            PlaybackDiagnostics.note("continuation-rejected",new JSObject()
                .put("song",PlaybackDiagnostics.anonKey(track.songKey)).put("reason","bad-uri"));
            return;
        }
        JSObject tag=new JSObject();
        tag.put("songKey",track.songKey);
        tag.put("title",track.title);
        tag.put("artist",track.artist);
        tag.put("album",track.album);
        tag.put("duration",track.durationMs);
        tag.put("artwork",track.artwork);
        tag.put("providerId",track.providerId);
        tag.put("mediaId",track.mediaId);
        tag.put("nativeContinuation",true);
        boolean wasEnded=player.getPlaybackState()==Player.STATE_ENDED;
        player.addMediaItem(new MediaItem.Builder().setUri(parsed).setMediaId(track.songKey).setTag(tag).build());
        int remaining=Math.max(0,player.getMediaItemCount()-player.getCurrentMediaItemIndex()-1);
        PlaybackDiagnostics.note("continuation-adopt",new JSObject()
            .put("song",PlaybackDiagnostics.anonKey(track.songKey)).put("requestId",requestId)
            .put("index",player.getCurrentMediaItemIndex()).put("items",player.getMediaItemCount())
            .put("remaining",remaining).put("wasEnded",wasEnded));
        if(wasEnded)resumeFromWindow();
        else if(remaining>QueueSupervision.LOW_WATER)supervision.satisfied();
    }

    // ---------------------------------------------------------------------------------
    // BackgroundContinuation.Host —— 原生续播需要的全部观测量，没有一项来自 WebView。
    // ---------------------------------------------------------------------------------
    @Override public String currentSongKey(){return currentKey();}
    @Override public boolean desiredPaused(){return desiredPaused;}
    @Override public int remaining(){
        return Math.max(0,player.getMediaItemCount()-player.getCurrentMediaItemIndex()-1);
    }
    @Override public boolean ended(){return player.getPlaybackState()==Player.STATE_ENDED;}
    @Override public long msSinceJsWindow(){
        if(lastQueueAppliedAt==0L)return -1L;
        return SystemClock.elapsedRealtime()-lastQueueAppliedAt;
    }
    @Override public boolean queueContains(String songKey){return queueContainsInternal(songKey);}
    @Override public void adopt(NativePlaylist.Track track,String uri,long requestId,long generation){
        adoptContinuation(track,uri,requestId,generation);
    }
    @Override public void rearmSupervision(){
        supervision.rearm(SystemClock.elapsedRealtime());
        main.removeCallbacks(superviseTick);
        main.postDelayed(superviseTick,1_500L);
    }
    @Override public void runOnMain(Runnable action){main.post(action);}

    /** 当前位置之后（含当前项）是否已经有这首歌。用于原生与 JS 两条通道的去重。 */
    private boolean queueContainsInternal(String songKey){
        if(songKey==null||songKey.isEmpty())return false;
        for(int i=player.getCurrentMediaItemIndex();i<player.getMediaItemCount();i++){
            MediaItem item=player.getMediaItemAt(i);
            if(item!=null&&songKey.equals(item.mediaId))return true;
        }
        return false;
    }

    private JSObject applyQueue(JSObject value){
        String anchor=value.optString("songKey");
        org.json.JSONArray entries=value.optJSONArray("tracks");
        // `verdict` is the three-valued answer; `continues` is the legacy boolean. A resolver
        // that could not decide (aborted, anchor not found, every candidate failed) must not be
        // able to declare the playlist finished - that single conversion is what turned one lost
        // window into a session that never asked for another.
        QueueSupervision.Continuation verdict=QueueSupervision.Continuation.parse(
            value.has("verdict")?value.optString("verdict"):null,value.optBoolean("continues",true));
        long generation=value.optLong("generation",-1L);
        java.util.ArrayList<MediaItem> items=new java.util.ArrayList<>();
        java.util.ArrayList<String> ids=new java.util.ArrayList<>();
        int rejected=0;
        if(entries!=null)for(int i=0;i<Math.min(1000,entries.length());i++){
            org.json.JSONObject raw=entries.optJSONObject(i);if(raw==null)break;
            Uri uri=Uri.parse(raw.optString("uri"));
            if(!java.util.Arrays.asList("http","https","content","file").contains(uri.getScheme())||raw.optString("songKey").isEmpty()){rejected++;continue;}
            JSObject tag=copy(raw);
            items.add(new MediaItem.Builder().setUri(uri).setMediaId(tag.optString("songKey")).setTag(tag).build());
            ids.add(tag.optString("songKey"));
        }
        java.util.ArrayList<String> nativeIds=new java.util.ArrayList<>();
        for(int i=0;i<player.getMediaItemCount();i++)nativeIds.add(player.getMediaItemAt(i).mediaId);
        QueueLedger.Plan plan=QueueLedger.reconcile(nativeIds,player.getCurrentMediaItemIndex(),anchor,ids);
        if(!plan.accepted){
            queueStale++;queueRejected++;
            PlaybackDiagnostics.note("queue-stale",new JSObject().put("anchor",PlaybackDiagnostics.anonKey(anchor))
                .put("song",PlaybackDiagnostics.anonKey(songKey)).put("offered",items.size())
                .put("verdict",verdict.name().toLowerCase(java.util.Locale.US)).put("nudges",staleNudges));
            // A window we cannot reconcile says nothing trustworthy about the playlist either, so
            // its verdict is deliberately dropped. The important part is that we keep asking: a
            // stale anchor means JS is alive but looking at an older item, which one more window
            // built from the engine's own position fixes. Going quiet here was the old behaviour
            // and it is exactly the state a drained session never came back from.
            if(staleNudges++<MAX_STALE_NUDGES)requestWindow("stale-anchor");
            supervision.rearm(SystemClock.elapsedRealtime());
            main.removeCallbacks(superviseTick);
            main.postDelayed(superviseTick,1_500L);
            return new JSObject().put("accepted",false).put("reason","stale-anchor");
        }
        if(generation>=0)supervision.continuation(verdict,generation);
        else supervision.continuation(verdict,supervision.generation());
        lastVerdict=verdict.name().toLowerCase(java.util.Locale.US);
        int start=plan.trim;
        if(start>0)items=new java.util.ArrayList<>(items.subList(start,items.size()));
        boolean wasEnded=player.getPlaybackState()==Player.STATE_ENDED;
        int next=player.getCurrentMediaItemIndex()+1;
        int removed=next<player.getMediaItemCount()?player.getMediaItemCount()-next:0;
        if(next<player.getMediaItemCount())player.removeMediaItems(next,player.getMediaItemCount());
        if(!items.isEmpty())player.addMediaItems(items);
        queueAccepted++;
        lastQueueAppliedAt=SystemClock.elapsedRealtime();
        staleNudges=0;
        int remaining=Math.max(0,player.getMediaItemCount()-player.getCurrentMediaItemIndex()-1);
        PlaybackDiagnostics.note("queue-replenish",new JSObject().put("accepted",items.size()).put("rejected",rejected)
            .put("trimmed",start).put("removed",removed).put("items",player.getMediaItemCount())
            .put("index",player.getCurrentMediaItemIndex()).put("remaining",remaining)
            .put("verdict",verdict.name().toLowerCase(java.util.Locale.US)).put("continues",supervision.continues())
            .put("generation",supervision.generation()).put("wasEnded",wasEnded));
        if(items.isEmpty()){
            // An answer that resolved nothing must not look like a successful refill: stay in the
            // waiting state and owe another attempt immediately.
            supervision.rearm(SystemClock.elapsedRealtime());
            main.removeCallbacks(superviseTick);
            main.postDelayed(superviseTick,1_500L);
            return new JSObject().put("accepted",true).put("remaining",remaining);
        }
        if(wasEnded)resumeFromWindow();
        else if(remaining>QueueSupervision.LOW_WATER)supervision.satisfied();
        return new JSObject().put("accepted",true).put("remaining",remaining);
    }
    /**
     * The gap is what a background session used to die in. Adding items to an ended Media3
     * playlist does not restart it by itself, so the player is moved onto the first new item
     * explicitly - but only while the user still wants sound.
     */
    private void resumeFromWindow(){
        if(desiredPaused||sourceId.isEmpty()){supervision.satisfied();return;}
        if(player.getMediaItemCount()<=player.getCurrentMediaItemIndex()+1){supervision.satisfied();return;}
        supervision.satisfied();
        PlaybackDiagnostics.note("queue-resume",new JSObject().put("song",PlaybackDiagnostics.anonKey(songKey))
            .put("index",player.getCurrentMediaItemIndex()).put("items",player.getMediaItemCount()));
        main.removeCallbacks(superviseTick);
        errorSkips=0;
        player.seekTo(player.getCurrentMediaItemIndex()+1,0L);
        player.prepare();
        player.play();
        releaseHandoff();
    }
    /**
     * Native half of the refill protocol. Runs on Media3's own callbacks, so it needs no WebView
     * timer to be on time: it emits one bounded event, then - if the window really drained -
     * keeps the session open and retries on a sparse schedule.
     */
    private void superviseQueue(String reason){
        if(sourceId.isEmpty())return;
        int remaining=Math.max(0,player.getMediaItemCount()-player.getCurrentMediaItemIndex()-1);
        boolean ended=player.getPlaybackState()==Player.STATE_ENDED;
        QueueSupervision.Action action=supervision.evaluate(songKey,remaining,ended,desiredPaused,SystemClock.elapsedRealtime());
        jsSilentAtAsk=lastJsCommandAt==0L?-1L:SystemClock.elapsedRealtime()-lastJsCommandAt;
        switch(action){
            case REQUEST:
                PlaybackDiagnostics.note("queue-request",new JSObject().put("reason",reason)
                    .put("song",PlaybackDiagnostics.anonKey(songKey)).put("remaining",remaining)
                    .put("index",player.getCurrentMediaItemIndex()).put("items",player.getMediaItemCount())
                    .put("jsSilentMs",jsSilentAtAsk));
                emit("queue-request",false);
                break;
            case WAIT:
                PlaybackDiagnostics.note("queue-wait",new JSObject().put("reason",reason)
                    .put("song",PlaybackDiagnostics.anonKey(songKey)).put("positionMs",Math.max(0,player.getCurrentPosition()))
                    .put("index",player.getCurrentMediaItemIndex()).put("items",player.getMediaItemCount())
                    .put("budget",QueueSupervision.retryBudget()).put("jsSilentMs",jsSilentAtAsk));
                // Bounded CPU window so a merely throttled (not dead) WebView gets its chance to
                // answer; nothing is held once the budget or the retry schedule runs out.
                if(handoffWake!=null)handoffWake.acquire(15_000L);
                io.github.huleixin.tingyu.FoliaPlaybackService.nativePlaybackChanged(true);
                emit("queue-wait",false);
                break;
            case RETRY:
                emit("queue-request",false);
                break;
            default:
                break;
        }
        // 阶段 B：JS 沉默够久时，下一首由原生自己取地址。它跑在 Media3 回调里，
        // 不依赖 Capacitor 监听器、React Hook 或 WebView 定时器是否还活着。
        BackgroundContinuation.get().consider(this,reason);
        long delay=supervision.retryDelay(SystemClock.elapsedRealtime());
        main.removeCallbacks(superviseTick);
        if(delay>=0)main.postDelayed(superviseTick,delay);
        else if(supervision.waiting())PlaybackDiagnostics.note("queue-wait-exhausted",new JSObject()
            .put("song",PlaybackDiagnostics.anonKey(songKey)).put("retries",supervision.retries())
            .put("index",player.getCurrentMediaItemIndex()).put("items",player.getMediaItemCount()));
    }
    /**
     * Any command from the WebView proves the renderer is running again. A drained session whose
     * retry budget had already run out is restarted from here instead of waiting for the user to
     * reopen the app - which was, until now, the only thing that ever restarted it.
     */
    private void noteLiveness(String reason){
        if(supervision.liveness(SystemClock.elapsedRealtime())){
            PlaybackDiagnostics.note("queue-rearm",new JSObject().put("reason",reason)
                .put("song",PlaybackDiagnostics.anonKey(songKey))
                .put("index",player.getCurrentMediaItemIndex()).put("items",player.getMediaItemCount())
                .put("rearms",supervision.livenessRearms()));
            superviseQueue("liveness");
        }
    }
    /** Explicit "please rebuild the window from my current item" nudge. */
    private void requestWindow(String reason){
        if(sourceId.isEmpty())return;
        PlaybackDiagnostics.note("queue-request",new JSObject().put("reason",reason)
            .put("song",PlaybackDiagnostics.anonKey(songKey)));
        emit("queue-request",false);
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
        if(desiredPaused){
            retryGeneration++;main.removeCallbacks(superviseTick);supervision.satisfied();
            // 用户主动暂停/停止：作废在飞的原生解析，迟到的结果不许再往队列里塞。
            BackgroundContinuation.get().cancel();
        }
        if(action.equals("stop")){player.pause();player.seekTo(0);emit("state",external);main.removeCallbacks(heartbeat);return;}
        if(action.equals("play")){if(player.getPlaybackState()==Player.STATE_IDLE&&player.getCurrentMediaItem()!=null){failure=null;networkRetries=0;player.prepare();}
            boolean fadeIn=fade&&!player.isPlaying();player.setVolume(fadeIn?0:volume);player.play();emit("state",external);
            // Pressing play on a drained window is an explicit "I still want music": re-arm the
            // refill schedule instead of leaving the session parked.
            if(player.getPlaybackState()==Player.STATE_ENDED){supervision.satisfied();main.postDelayed(()->superviseQueue("user-play"),200);}
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
            putQueueSupervision(value);
        }
        if(type.startsWith("queue-"))putQueueSupervision(value);
        return value;
    }
    private void putQueueSupervision(JSObject value){
        value.put("queueItems",player.getMediaItemCount()).put("queueIndex",player.getCurrentMediaItemIndex())
            .put("queueRemaining",Math.max(0,player.getMediaItemCount()-player.getCurrentMediaItemIndex()-1))
            .put("queueContinues",supervision.continues()).put("queueWaiting",supervision.waiting())
            .put("queueGeneration",supervision.generation()).put("queueRetries",supervision.retries())
            .put("queueAccepted",queueAccepted).put("queueRejected",queueRejected).put("queueStale",queueStale)
            .put("lastQueueAppliedAtMs",lastQueueAppliedAt).put("errorSkips",errorSkips);
        // The joint post-mortem fields: was the session drained while the logical playlist still
        // had music ("stopped" rather than "finished"), and did an answer admit it could not tell?
        value.put("queueVerdict",lastVerdict)
            .put("queueUnknownAnswers",supervision.unknownAnswers())
            .put("queueLivenessRearms",supervision.livenessRearms())
            .put("queueHeldOpen",player.getPlaybackState()==Player.STATE_ENDED
                && supervision.waiting()&&supervision.continues())
            .put("queueBudget",QueueSupervision.retryBudget())
            // "Did JS ever run?" in one number. -1 = no command has ever crossed the bridge.
            .put("jsSilentMs",lastJsCommandAt==0L?-1L:SystemClock.elapsedRealtime()-lastJsCommandAt)
            .put("jsCommands",jsCommands)
            .put("bridgeAttached",listener!=null)
            .put("jsSilentAtLastAskMs",jsSilentAtAsk);
        // 阶段 A/B：原生现在自己知道下一首是谁，也能自己取地址 —— 这两个字段说明它做得怎么样。
        value.put("ledgerSize",io.github.huleixin.tingyu.playback.NativePlaylist.get().size())
            .put("ledgerKnowsCurrent",io.github.huleixin.tingyu.playback.NativePlaylist.get().canDecide(songKey))
            .put("ledgerMode",io.github.huleixin.tingyu.playback.NativePlaylist.get().mode().name().toLowerCase(java.util.Locale.US));
        try{
            org.json.JSONObject continuation=BackgroundContinuation.get().snapshot();
            java.util.Iterator<String> keys=continuation.keys();
            while(keys.hasNext()){String key=keys.next();value.put("continuation"+Character.toUpperCase(key.charAt(0))+key.substring(1),continuation.opt(key));}
        }catch(Exception ignored){}
        // 解析器只暴露"能不能"，绝不暴露地址与凭据。
        value.put("resolvers",io.github.huleixin.tingyu.resolver.ResolverRegistry.get().describe());
    }
    private void emit(String type,boolean external){
        // The system session must follow Media3 even with no plugin listener or a sleeping WebView.
        // Deduplicated native events only; clock/spectrum frames never rebuild the notification.
        if(!sourceId.isEmpty()&&!type.equals("clock")&&!type.equals("spectrum")&&!type.equals("diagnostics")
            &&!type.equals("queue-request"))
            io.github.huleixin.tingyu.FoliaPlaybackService.nativePlaybackChanged(type.equals("seeked"));
        // An ask with no listener is a positive observation, not an absence of one: it means the
        // engine wanted to reach JS and the bridge was gone. Recorded for the two asks that keep
        // a session alive; "state" frames are far too frequent to note here.
        if(listener==null&&("queue-request".equals(type)||"lyric-request".equals(type)||"error".equals(type))){
            PlaybackLifecycle.noteDroppedAsk(type);
            if("queue-request".equals(type))
                PlaybackDiagnostics.note("ask-dropped",new JSObject().put("type",type)
                    .put("song",PlaybackDiagnostics.anonKey(songKey))
                    .put("items",player.getMediaItemCount())
                    .put("remaining",Math.max(0,player.getMediaItemCount()-player.getCurrentMediaItemIndex()-1))
                    .put("jsSilentMs",PlaybackLifecycle.jsSilentMs()));
        }
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
            .put("positionMs",Math.max(0,player.getCurrentPosition())));releaseHandoff();cancelFade();main.removeCallbacksAndMessages(null);sourceId="";listener=null;PlaybackLifecycle.noteBridge(false);player.release();spectrum.close();}
}
