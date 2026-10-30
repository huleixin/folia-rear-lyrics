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
        // Media3 的 Player 只能在它自己的应用线程（主线程）上读。后台线程（原生取词/取图）也会问
        // 「现在还是这首吗」，直接访问 player 会抛 IllegalStateException —— 那条线程上的任务会
        // 静默消失，表现成「原生取词从来没跑过」。非主线程一律读缓存下来的身份。
        if(Looper.myLooper()!=Looper.getMainLooper())return engine.songKey==null?"":engine.songKey;
        try{
            MediaItem item=engine.player.getCurrentMediaItem();
            return item==null?engine.songKey:item.mediaId;
        }catch(Throwable error){
            return engine.songKey==null?"":engine.songKey;
        }
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

    /**
     * Media3 对**当前这首歌**真实有效的时长；未知（TIME_UNSET / ≤0）或不是当前曲时返回 -1。
     *
     * 系统卡片的「总时长」和进度条的上界都由它说话，tag 里的 durationMs 只是先验
     * （换歌瞬间 Media3 还没解析出时长，只能用歌单给的值）。两者优先级反了，卡片就会
     * 显示一个和播放器无关的数字，或者像 1.3.50 那样显示 00:00。
     */
    public static long durationMsFor(String songKey){
        NativeAudioEngine engine=instance;
        if(engine==null||engine.sourceId.isEmpty()||songKey==null||!songKey.equals(engine.songKey))return -1L;
        long duration=engine.player.getDuration();
        return duration>0L?duration:-1L;
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
    /** 连续跳过的坏歌数量：中间只要有一首真的播出声就清零，达到上限就停下来说清楚。 */
    private int consecutiveSkips;
    /** 整场会话累计跳过了多少首。 */
    private int skipCount;
    /** 429 / 鉴权失效之类的全局故障：同类请求暂停到这个时刻，期间不逐首判失效。 */
    private long globalSuspendUntil;
    /** 队列里没有下一首时先让原生解析一首，成功后由这个标记补上跳转。 */
    private boolean skipPending;
    private String lastSkipReason="",lastSkipTarget="";
    private long retryGeneration;
    private long queueGeneration=-1;
    private int queueAccepted,queueRejected,queueStale,staleNudges;
    /**
     * 最近一次窗口同步对队列做了什么。
     *
     * 真机 1.3.50 的停播里，唯一能看出"下一首被删了"的线索是 `accepted=0 removed=1`
     * 这两个数字，而删掉的是哪一首、它是不是已经接管好的，报告里完全没有 ——
     * 于是只能靠猜。这几位把「谁被删、谁被保留、保留的是不是已接管项」固定下来。
     */
    private volatile int lastQueueRemoved,lastQueuePreserved,lastQueueAdded;
    private volatile String lastQueueDroppedAdopted="",lastQueueAddedFirst="";
    private volatile long lastQueueDiffAtMs;
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
    // ---- 后台补词的有界重问 ----
    // 只在这首歌仍然是当前曲、且原生缓存里仍然没有它的时间轴时才再问一次；换歌/暂停即取消。
    // 两次（3s / 12s）足够覆盖「监听器正在重挂」和「联网取词慢」两种情况，也不构成重试风暴。
    private static final long[] LYRIC_RETRY_MS=LyricRetryPolicy.RETRY_DELAYS_MS;
    private int lyricRetryAttempt=0;
    private String lyricRetrySongKey="";
    private final Runnable lyricRetryTick=new Runnable(){public void run(){
        if(!LyricRetryPolicy.shouldAsk(lyricRetrySongKey,songKey,
            io.github.huleixin.tingyu.coloros.ColorOsLyricBridge.stateOf(songKey),lyricRetryAttempt))return;
        PlaybackDiagnostics.note("lyric-request",new JSObject()
            .put("song",PlaybackDiagnostics.anonKey(songKey)).put("state","pending")
            .put("retry",lyricRetryAttempt+1)
            .put("jsSilentMs",lastJsCommandAt==0L?-1L:SystemClock.elapsedRealtime()-lastJsCommandAt));
        emit("lyric-request",false);
        lyricRetryAttempt++;
        long next=LyricRetryPolicy.delayFor(lyricRetryAttempt);
        if(next>0L)main.postDelayed(this,next);
    }};
    private void scheduleLyricRetry(String key){
        main.removeCallbacks(lyricRetryTick);
        lyricRetrySongKey=key==null?"":key;
        lyricRetryAttempt=0;
        if(!lyricRetrySongKey.isEmpty())main.postDelayed(lyricRetryTick,LYRIC_RETRY_MS[0]);
    }

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
                // 歌词按**真实的 MediaItem id** 取，且先钉住当前曲、再保护下一首：换歌这一刻
                // 缓存里的「下一首」若被预置淘汰掉，灵动岛就会空到下一次换歌。
                int aheadIndex=player.getNextMediaItemIndex();
                String aheadKey=aheadIndex<0||aheadIndex>=player.getMediaItemCount()?null:player.getMediaItemAt(aheadIndex).mediaId;
                io.github.huleixin.tingyu.coloros.ColorOsLyricBridge.protectAhead(aheadKey);
                // 四层证据的第一层：这首歌在原生缓存里到底有没有、有多少条、上次写入多久之前。
                // 没有这一行，「灵动岛空着」分不清是没取到、没构建、没发布，还是发布了没人消费。
                PlaybackDiagnostics.note("lyric-lookup",new JSObject()
                    .put("song",PlaybackDiagnostics.anonKey(songKey))
                    .put("mediaItemId",PlaybackDiagnostics.anonKey(songKey))
                    .put("state",io.github.huleixin.tingyu.coloros.ColorOsLyricBridge.stateOf(songKey))
                    .put("cached",io.github.huleixin.tingyu.coloros.ColorOsLyricBridge.cachedCount())
                    .put("lastPublishAgeMs",io.github.huleixin.tingyu.coloros.ColorOsLyricBridge.lastPublishAgeMs())
                    .put("takeover",((JSObject)item.localConfiguration.tag).optBoolean("nativeContinuation",false))
                    .put("index",player.getCurrentMediaItemIndex()).put("ahead",aheadKey==null?"":PlaybackDiagnostics.anonKey(aheadKey)));
                io.github.huleixin.tingyu.FoliaPlaybackService.publishQueuedTrack(context,queued,player.getPlayWhenReady());
                // 背屏的「当前歌曲」权威来源与上面同源：真实的 MediaItem id + 队列 tag。
                // 换曲即递增 epoch，背屏据此丢弃上一首的时间轴，不再外推旧歌。
                io.github.huleixin.tingyu.RearNativeTrack.onTrack(songKey,queued);
                io.github.huleixin.tingyu.RearNativeTrack.onDuration(durationMsFor(songKey));
                io.github.huleixin.tingyu.RearNativeTrack.onPlayback(player.getPlayWhenReady()&&player.isPlaying(),
                    Math.max(0L,player.getCurrentPosition()));
                // The first link of the rear lyric chain, written to the same trace as the rear
                // renderer's own report: without it there is no way to tell whether a stuck line
                // was Media3 not switching, a lyric not arriving, or the renderer not applying it.
                io.github.huleixin.tingyu.RearLyricsTrace.record(context,"media3-track",
                    "song="+PlaybackDiagnostics.anonKey(io.github.huleixin.tingyu.RearNativeTrack.songKey())
                    +", epoch="+io.github.huleixin.tingyu.RearNativeTrack.epoch()
                    +", title="+queued.optString("title","")
                    +", index="+player.getCurrentMediaItemIndex()
                    +", playing="+(player.getPlayWhenReady()&&player.isPlaying()));
                // 原生自己在后台把歌词和封面补齐：身份取真实的当前 MediaItem，顺序取 Media3 的真实队列
                // （随机播放也已经是洗好的顺序）。这一步不依赖 Activity、不依赖 WebView。
                scheduleSongInfo(item);
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
                    // 一次询问可能落空（监听器正好在重挂、或 JS 正在重载），也可能这首歌的
                    // 词本来就要联网取几十秒。有界地再问一两次，换歌即取消 —— 不重试的话，
                    // 第一次没答上就等于整首没词，只能等用户打开 App。
                    scheduleLyricRetry(songKey);
                }else{
                    main.removeCallbacks(lyricRetryTick);
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
                // 真的播出声 = 这首歌没问题：连续跳过的计数在这里清零，
                // 否则一份开头坏几首的歌单会在后面被误判成"全是坏歌"。
                if(isPlaying)consecutiveSkips=0;
                // Backscreen clock authority: the WebView that used to feed it is frozen in the
                // background, so playing state and position must also be readable natively.
                io.github.huleixin.tingyu.RearNativeTrack.onPlayback(isPlaying,player.getCurrentPosition());
            }
            @Override public void onPlayWhenReadyChanged(boolean playWhenReady,int reason){
                // The reason field distinguishes user pause from focus loss / noisy output /
                // remote commands; this is the difference between "user stopped it" and
                // "the system stopped it" in a post-mortem.
                PlaybackDiagnostics.note("play-when-ready",new JSObject().put("playWhenReady",playWhenReady)
                    .put("reason",reason).put("suppression",player.getPlaybackSuppressionReason())
                    .put("song",PlaybackDiagnostics.anonKey(songKey)));
                io.github.huleixin.tingyu.RearNativeTrack.onPlayback(playWhenReady&&player.isPlaying(),
                    player.getCurrentPosition());
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
                // 原生接管的那一首是否**真的播起来了**：解析成功 ≠ 播放成功。
                // 这里记的是 Media3 自己的事实：进入 READY、以及播到结尾（位置等于时长）。
                noteNativeContinuationProgress(p,drained);
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
                // playlist of broken sources still surfaces an error instead of spinning-
                // 规则集中在 PlaybackSkipPolicy（纯逻辑、已单测）：用户主动暂停不算故障、
                // 429 与鉴权失效全局暂停、单曲循环不替用户跳、连续跳过有上限。
                if(handleUnplayableError(error))return;
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
            String wantKey=value.optString("songKey");
            String haveKey=active!=null&&active.localConfiguration!=null?active.mediaId:"";
            String haveUri=active!=null&&active.localConfiguration!=null?active.localConfiguration.uri.toString():"";
            PrepareGuard.Action guard=PrepareGuard.decide(haveKey,haveUri,wantKey,url);
            PlaybackDiagnostics.note("prepare-guard",new JSObject()
                .put("action",guard.name().toLowerCase(java.util.Locale.US))
                .put("song",PlaybackDiagnostics.anonKey(wantKey))
                .put("itemsBefore",player.getMediaItemCount())
                .put("index",player.getCurrentMediaItemIndex()));
            if(guard==PrepareGuard.Action.KEEP_WINDOW){
                // 同曲同址的重复 prepare：Media3 的 setMediaItem 会清空整个播放列表，
                // 这里绝不能跟着走。窗口、位置、continuation-adopt 的下一首全部保留，
                // 只把这次 JS 会话重新挂回引擎。
                sourceId=id;sequence=seq;failure=null;errorSkips=0;desiredPaused=false;
                emit("load",false);
                PlaybackDiagnostics.note("prepare-kept-window",new JSObject()
                    .put("items",player.getMediaItemCount())
                    .put("remaining",Math.max(0,player.getMediaItemCount()-player.getCurrentMediaItemIndex()-1)));
                return new JSObject().put("accepted",true);
            }
            if(guard==PrepareGuard.Action.REPLACE_CURRENT){
                // 同一首歌、地址刷新了：只换当前项的地址，队列其余部分与已入队的下一首保留。
                configure(value);
                MediaItem refreshed=new MediaItem.Builder().setUri(uri).setMediaId(wantKey).setTag(copy(value)).build();
                sourceId=id;sequence=seq;failure=null;networkRetries=0;errorSkips=0;desiredPaused=false;
                player.replaceMediaItem(Math.max(0,player.getCurrentMediaItemIndex()),refreshed);
                player.prepare();player.play();
                scheduleSongInfo(player.getCurrentMediaItem());emit("load",false);
                PlaybackDiagnostics.note("prepare-replaced-current",new JSObject()
                    .put("items",player.getMediaItemCount())
                    .put("remaining",Math.max(0,player.getMediaItemCount()-player.getCurrentMediaItemIndex()-1)));
                return new JSObject().put("accepted",true);
            }
            sourceId="";songKey=wantKey;endedHandoff=false;sequence=seq;failure=null;networkRetries=0;retryGeneration++;desiredPaused=true;cancelFade();player.pause();
        BackgroundContinuation.get().cancel();
            // A new source starts a new continuation story; the window command that follows
            // re-declares it. The generation is never invented here - JS owns that counter.
            supervision.continuation(false,supervision.generation());supervision.satisfied();errorSkips=0;
            main.removeCallbacks(superviseTick);
            configure(value);player.setMediaItem(new MediaItem.Builder().setUri(uri).setMediaId(songKey).setTag(copy(value)).build(),Math.max(0,value.optLong("position")));sourceId=id;player.prepare();
            io.github.huleixin.tingyu.FoliaPlaybackService.publishQueuedTrack(context,value,false);
            scheduleSongInfo(player.getCurrentMediaItem());emit("load",false);
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
        // 只在「这首歌真的被移出逻辑歌单」时作废。代次相等不是条件：一次普通同步就会
        // 让代次 +1，但它并不改变这首歌的地址；拿代次卡这里，等于把已经准备好的下一首
        // 在用户看不见的地方丢掉（真机 1.3.50：adopt → playlist-sync → 同一首重新解析）。
        if(!io.github.huleixin.tingyu.playback.NativePlaylist.get().contains(track.songKey)){
            PlaybackDiagnostics.note("continuation-rejected",new JSObject()
                .put("song",PlaybackDiagnostics.anonKey(track.songKey)).put("reason","dropped-from-playlist")
                .put("generation",generation)
                .put("generationNow",io.github.huleixin.tingyu.playback.NativePlaylist.get().generation()));
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
        // 两个字段名都写：队列窗口用 `coverUrl`，逻辑歌单用 `artwork`，而读的人在服务与
        // 歌曲信息调度器两边。只写一个，另一侧就会把封面当成空值 —— 这正是"原生自动切歌
        // 后封面消失"的形态。
        tag.put("artwork",track.artwork);
        tag.put("coverUrl",track.artwork);
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
        // 上一首不可播放、当时队列里又没有下一首：现在补上了，把那次欠着的跳转做完。
        if(skipPending)completePendingSkip(track.songKey);
    }

    // ---------------------------------------------------------------------------------
    // 不可播放歌曲：重试 / 跳过 / 停止 / 全局暂停
    //
    // 规则本体在 PlaybackSkipPolicy（纯逻辑、可单测）。这里只负责把 Media3 的事实喂进去，
    // 并把结果翻译成播放器动作，绝不在两处各自实现一半规则。
    // ---------------------------------------------------------------------------------

    /** 429/鉴权失效之类的全局故障暂停时长。 */
    private static final long GLOBAL_SUSPEND_MS=60_000L;

    private boolean canResolveNatively(NativePlaylist.Track track){
        return track!=null&&io.github.huleixin.tingyu.resolver.ResolverRegistry.get().canResolveNatively(track);
    }

    /** 返回 true 表示这次失败已经被接管（重试/跳过/全局暂停），调用方不要再当致命错误上报。 */
    private boolean handleUnplayableError(PlaybackException error){
        // 用户主动暂停/停止：这条规则不存在。缓冲中的抖动也不会走到这里（那不是 error）。
        if(desiredPaused||sourceId.isEmpty())return false;
        if(SystemClock.elapsedRealtime()<globalSuspendUntil){
            PlaybackDiagnostics.note("player-error-suspended",new JSObject()
                .put("code",error.errorCode).put("song",PlaybackDiagnostics.anonKey(songKey))
                .put("resumeInMs",globalSuspendUntil-SystemClock.elapsedRealtime()));
            return true;
        }
        NativePlaylist list=NativePlaylist.get();
        NativePlaylist.Step step=list.canDecide(songKey)?list.advance(songKey):null;
        boolean hasNext=player.getNextMediaItemIndex()>=0;
        boolean materializable=step!=null&&step.hasTrack()&&canResolveNatively(step.track);
        boolean hasCandidates=list.remainingAfter(songKey)>0;
        PlaybackSkipPolicy.Facts facts=new PlaybackSkipPolicy.Facts(error.errorCode,networkRetries,
            consecutiveSkips,list.mode(),desiredPaused,sourceId.isEmpty(),hasNext,materializable,hasCandidates);
        PlaybackSkipPolicy.Decision decision=PlaybackSkipPolicy.decide(facts);
        lastSkipReason=decision.reason;
        PlaybackDiagnostics.note("skip-decision",new JSObject()
            .put("code",error.errorCode).put("song",PlaybackDiagnostics.anonKey(songKey))
            .put("action",decision.action.name().toLowerCase(java.util.Locale.US))
            .put("reason",decision.reason)
            .put("retries",networkRetries).put("consecutiveSkips",consecutiveSkips)
            .put("skipCount",skipCount)
            .put("hasNext",hasNext).put("canMaterializeNext",materializable)
            .put("candidates",hasCandidates)
            .put("mode",list.mode().name().toLowerCase(java.util.Locale.US))
            .put("target",step!=null&&step.hasTrack()?PlaybackDiagnostics.anonKey(step.track.songKey):""));
        switch(decision.action){
            case STOP:
                return false;
            case SUSPEND:
                // 整个音源都受影响：不把任何一首判成坏歌，也不再发同类请求。
                globalSuspendUntil=SystemClock.elapsedRealtime()+GLOBAL_SUSPEND_MS;
                failure=error;emit("error",false);return true;
            case RETRY_SAME: {
                int attempt=++networkRetries;String token=sourceId;long generation=++retryGeneration;
                String target=songKey;
                main.postDelayed(()->{
                    if(generation!=retryGeneration||!sourceId.equals(token)||desiredPaused)return;
                    PlaybackDiagnostics.note("skip-retry",new JSObject()
                        .put("attempt",attempt).put("song",PlaybackDiagnostics.anonKey(target))
                        .put("reason",decision.reason));
                    failure=null;player.prepare();player.play();
                },Math.max(400L,attempt*800L));
                return true;
            }
            case MATERIALIZE_THEN_SKIP:
                // 队列里还没有下一首：先按用户选的音源解析一首加进来，补上了再跳。
                skipPending=true;
                BackgroundContinuation.get().consider(this,"skip-unplayable");
                return true;
            case SKIP_NEXT:
            default:
                executeSkip(decision.reason);
                return true;
        }
    }

    /** 跳过这一首：计数、留痕、然后真的往前一首。 */
    private void executeSkip(String reason){
        if(desiredPaused||player.getNextMediaItemIndex()<0)return;
        consecutiveSkips++;skipCount++;errorSkips++;
        failure=null;networkRetries=0;retryGeneration++;
        noteSkip(reason,PlaybackDiagnostics.anonKey(songKey));
        player.seekToNextMediaItem();player.prepare();player.play();
    }

    /** 原生补上下一首之后，把欠着的跳步做完。 */
    private void completePendingSkip(String adopted){
        skipPending=false;
        if(desiredPaused||player.getNextMediaItemIndex()<0)return;
        consecutiveSkips++;skipCount++;errorSkips++;
        failure=null;networkRetries=0;retryGeneration++;
        noteSkip(lastSkipReason,PlaybackDiagnostics.anonKey(songKey));
        PlaybackDiagnostics.note("skip-decision",new JSObject()
            .put("action","skip-after-native-enqueue")
            .put("reason",lastSkipReason).put("adopted",PlaybackDiagnostics.anonKey(adopted))
            .put("skipCount",skipCount));
        player.seekToNextMediaItem();player.prepare();player.play();
    }

    // ---- 诊断：路由三元组与解析能力，全部只读，不含任何凭据或 URL ----

    /** 当前曲目在逻辑歌单里的 providerId。 */
    private String songProvider(){
        NativePlaylist.Track track=NativePlaylist.get().trackFor(songKey);
        return track==null?"":track.providerId;
    }

    /** 当前曲目上用户选的播放音源（`lx:tx` / `qq-original`）。 */
    private String selectedSourceId(){
        NativePlaylist.Track track=NativePlaylist.get().trackFor(songKey);
        return track==null?"":track.sourceId;
    }

    /** 下一首实际会由哪个解析器接。 */
    private String actualResolverId(){
        NativePlaylist list=NativePlaylist.get();
        NativePlaylist.Step step=list.canDecide(songKey)?list.advance(songKey):null;
        if(step==null||!step.hasTrack())return "none";
        io.github.huleixin.tingyu.resolver.SourceResolver chosen=
            io.github.huleixin.tingyu.resolver.ResolverRegistry.get().forTrack(step.track);
        return chosen==null?"none":chosen.id();
    }

    /** 下一首原生能不能自己取到地址。 */
    private boolean nativeReady(){
        NativePlaylist list=NativePlaylist.get();
        NativePlaylist.Step step=list.canDecide(songKey)?list.advance(songKey):null;
        if(step==null||!step.hasTrack())return false;
        return canResolveNatively(step.track);
    }

    /** 是否正因为队列空而等待原生解析（区分"等原生"与"真的没歌了"）。 */
    private boolean awaitingNativeResolution(){
        return skipPending||(player.getMediaItemCount()-player.getCurrentMediaItemIndex()-1<=QueueSupervision.LOW_WATER
            &&!desiredPaused&&BackgroundContinuation.get().isResolving());
    }

    private void noteSkip(String reason,String target){
        lastSkipTarget=target;
        PlaybackDiagnostics.note("queue-skip-error",new JSObject()
            .put("reason",reason).put("song",target)
            .put("skipCount",skipCount).put("consecutiveSkips",consecutiveSkips)
            .put("index",player.getCurrentMediaItemIndex()).put("items",player.getMediaItemCount())
            .put("remaining",Math.max(0,player.getMediaItemCount()-player.getCurrentMediaItemIndex()-1)));
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
    @Override public void rearmSupervision(long delayMs){
        supervision.rearm(SystemClock.elapsedRealtime());
        main.removeCallbacks(superviseTick);
        // 失败后退避再试：1.5 秒只是下限（换歌成功的正常路径），真正的失败重试由
        // BackgroundContinuation 的有界预算给出间隔，避免真机那样 187 次连打。
        main.postDelayed(superviseTick,Math.max(1_500L,delayMs));
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

    /**
     * 这一项是不是原生自己取到地址放进来的（而不是 JS 窗口给的）。
     *
     * 区别只在「谁保证它有地址」：JS 窗口项由 JS 负责，窗口换代就该整体替换；
     * 原生接管项是已经解析完成的，一次解析不出东西的窗口不能把它带走。
     */
    private static boolean isAdoptedContinuation(MediaItem item){
        if(item==null||item.localConfiguration==null)return false;
        Object tag=item.localConfiguration.tag;
        return tag instanceof JSObject&&((JSObject)tag).optBoolean("nativeContinuation",false);
    }

    /** 当前曲之后是否已经有一首原生接管好的（=后台续播的把握）。诊断用。 */
    private boolean hasAdoptedAhead(){
        for(int i=player.getCurrentMediaItemIndex()+1;i<player.getMediaItemCount();i++){
            if(isAdoptedContinuation(player.getMediaItemAt(i)))return true;
        }
        return false;
    }

    /** 服务重建后补一次：把当前曲重新交给歌曲信息调度器（不换代次）。 */
    public static void scheduleSongInfoForCurrent(){
        try{
            NativeAudioEngine engine=instance;
            if(engine==null||engine.sourceId.isEmpty()||engine.player==null)return;
            if(Looper.myLooper()!=Looper.getMainLooper()){engine.main.post(NativeAudioEngine::scheduleSongInfoForCurrent);return;}
            engine.scheduleSongInfo(engine.player.getCurrentMediaItem());
        }catch(Throwable ignored){
            // 补一次信息失败不是播放错误：服务已经恢复了，别让它再塌一次。
        }
    }

    /**
     * 把「当前曲 + 后面两首」交给原生的歌曲信息调度器。
     *
     * <p>身份只认 Media3 当前的 MediaItem，顺序只认 Media3 的真实队列 —— 随机播放时队列本身
     * 已经是洗好的顺序，所以这里不需要（也不应该）再问 JS「下一首是谁」。
     */
    private void scheduleSongInfo(MediaItem item){
        // 「顺带把歌词/封面准备好」是增值动作，不是播放的前置条件。它跑在播放装载与换歌的
        // 主线程上，任何异常都不能传导到播放本身（之前正是这里能把进程带走）。
        try{
            if(item==null||item.localConfiguration==null||!(item.localConfiguration.tag instanceof JSObject))return;
            SongInfoLoader loader=SongInfoLoader.attach(context);
            int generation=loader.generation();
            SongInfo current=SongInfo.fromTag((JSObject)item.localConfiguration.tag,generation);
            if(current==null)return;
            current=withPlaylistArtwork(current);
            java.util.ArrayList<SongInfo> upcoming=new java.util.ArrayList<>(2);
            for(int i=player.getCurrentMediaItemIndex()+1;i<player.getMediaItemCount()&&upcoming.size()<2;i++){
                MediaItem next=player.getMediaItemAt(i);
                if(next==null||next.localConfiguration==null||!(next.localConfiguration.tag instanceof JSObject))continue;
                SongInfo info=SongInfo.fromTag((JSObject)next.localConfiguration.tag,generation);
                if(info!=null)upcoming.add(withPlaylistArtwork(info));
            }
            loader.onTrackChanged(current,upcoming);
        }catch(Throwable error){
            try{
                io.github.huleixin.tingyu.CrashDiagnostics.record(context,"engine-songinfo","main",error);
                PlaybackDiagnostics.note("songinfo-failure",new JSObject()
                    .put("source","engine-schedule").put("error",error.getClass().getSimpleName()));
            }catch(Throwable ignored){}
        }
    }

    /**
     * tag 里没有封面地址时，回到**当前**的逻辑歌单按 songKey 再查一次。
     *
     * <p>队列里的 MediaItem 带的是它入队那一刻的 tag。旧版本同步交上来的 `artwork` 恒为空，
     * 即使之后 JS 用正确字段重新同步，队列里那一项的 tag 也不会变 —— 切到它时封面仍然缺。
     * 逻辑歌单是按 songKey 索引的最新副本，用它补齐即可；查不到就保持空，不乱猜图。
     */
    private SongInfo withPlaylistArtwork(SongInfo info){
        if(info==null||!info.artworkUrl.isEmpty())return info;
        String artwork=io.github.huleixin.tingyu.playback.NativePlaylist.get().artworkFor(info.songKey);
        if(artwork==null||artwork.isEmpty())return info;
        PlaybackDiagnostics.note("artwork-uri",new JSObject()
            .put("song",PlaybackDiagnostics.anonKey(info.songKey))
            .put("state","from-playlist"));
        return info.withArtwork(artwork);
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
            // 队列窗口的 tag 只有 `coverUrl`。原生其余读封面的人（服务、歌曲信息调度器）
            // 两个名字都认，但把这份 tag 再读出来的人可能只认 `artwork` —— 这里补齐，
            // 让一个 MediaItem 无论从哪条路径进来，封面字段都是完整的。
            if(tag.optString("artwork","").isEmpty()&&!tag.optString("coverUrl","").isEmpty()){
                tag.put("artwork",tag.optString("coverUrl"));
            }
            if(tag.optString("coverUrl","").isEmpty()&&!tag.optString("artwork","").isEmpty()){
                tag.put("coverUrl",tag.optString("artwork"));
            }
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
        int before=player.getMediaItemCount();
        int removed=0,preserved=0;
        String droppedFirst="",droppedAdopted="",addedFirst=items.isEmpty()?"":items.get(0).mediaId;
        // 空窗口的意思是「这一轮一首都没解析出来」，不是「当前曲后面应该清空」。
        //
        // 老代码无条件 `removeMediaItems(next, count)` 再 `addMediaItems(items)`：只要 JS 那次
        // 窗口一首都没解析出来（备用域名挂了、网络被掐、候选全跳过），就会把原生已经接管、
        // 已经握着可播放地址的下一首一起删掉。真机 1.3.50 的
        // `queue-replenish accepted=0 removed=1` → 剩余 1 首变 0 首 → 播完当前曲 queue-exhausted
        // 就是这一行，与 QueueLedger 里「空窗口是合法答案，不是拒绝」的约定相反。
        if(!items.isEmpty()){
            java.util.HashSet<String> offered=new java.util.HashSet<>();
            for(MediaItem item:items)offered.add(item.mediaId);
            java.util.ArrayList<String> afterIds=new java.util.ArrayList<>();
            java.util.ArrayList<Boolean> afterAdopted=new java.util.ArrayList<>();
            for(int i=next;i<player.getMediaItemCount();i++){
                MediaItem existing=player.getMediaItemAt(i);
                afterIds.add(existing==null?"":existing.mediaId);
                afterAdopted.add(isAdoptedContinuation(existing));
                if(existing!=null&&droppedFirst.isEmpty())droppedFirst=existing.mediaId;
            }
            QueuePrune.Plan prune=QueuePrune.plan(afterIds,afterAdopted,offered);
            if(prune.replace&&next<player.getMediaItemCount()){
                java.util.ArrayList<MediaItem> keep=new java.util.ArrayList<>();
                for(int index:prune.keepIndices){
                    MediaItem existing=player.getMediaItemAt(next+index);
                    if(existing!=null){
                        keep.add(existing);
                        if(droppedAdopted.isEmpty())droppedAdopted=existing.mediaId;
                    }
                }
                removed=player.getMediaItemCount()-next;
                player.removeMediaItems(next,player.getMediaItemCount());
                player.addMediaItems(items);
                if(!keep.isEmpty()){player.addMediaItems(keep);preserved=keep.size();}
            }
        }
        queueAccepted++;
        lastQueueAppliedAt=SystemClock.elapsedRealtime();
        staleNudges=0;
        int remaining=Math.max(0,player.getMediaItemCount()-player.getCurrentMediaItemIndex()-1);
        PlaybackDiagnostics.note("queue-replenish",new JSObject().put("accepted",items.size()).put("rejected",rejected)
            .put("trimmed",start).put("removed",removed).put("preserved",preserved).put("items",player.getMediaItemCount())
            .put("index",player.getCurrentMediaItemIndex()).put("remaining",remaining)
            .put("verdict",verdict.name().toLowerCase(java.util.Locale.US)).put("continues",supervision.continues())
            .put("generation",supervision.generation()).put("wasEnded",wasEnded)
            // 空窗口时 removed 必然为 0（没动队列），这一位让报告能直接读出"是空窗口，不是删了"
            .put("emptyWindow",items.isEmpty()));
        PlaybackDiagnostics.note("queue-diff",new JSObject()
            .put("before",before).put("after",player.getMediaItemCount())
            .put("removed",removed).put("preserved",preserved).put("added",items.size())
            .put("droppedFirst",PlaybackDiagnostics.anonKey(droppedFirst))
            .put("droppedAdopted",PlaybackDiagnostics.anonKey(droppedAdopted))
            .put("addedFirst",PlaybackDiagnostics.anonKey(addedFirst))
            .put("generation",supervision.generation()).put("source","js-window"));
        lastQueueRemoved=removed;lastQueuePreserved=preserved;lastQueueAdded=items.size();
        lastQueueDroppedAdopted=droppedAdopted;lastQueueAddedFirst=addedFirst;
        lastQueueDiffAtMs=SystemClock.elapsedRealtime();
        if(items.isEmpty()){
            // 这一轮一首都没解析出来。如果后面还有已备好的（JS 早先给的窗口项或原生接管的），
            // 就不算危机：按正常低水位节奏等下一个窗口，不要 1.5 秒一次地催。
            if(remaining>QueueSupervision.LOW_WATER){
                supervision.satisfied();
                return new JSObject().put("accepted",true).put("remaining",remaining).put("emptyWindow",true);
            }
            // An answer that resolved nothing must not look like a successful refill: stay in the
            // waiting state and owe another attempt immediately.
            supervision.rearm(SystemClock.elapsedRealtime());
            main.removeCallbacks(superviseTick);
            main.postDelayed(superviseTick,1_500L);
            return new JSObject().put("accepted",true).put("remaining",remaining).put("emptyWindow",true);
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
    /**
     * 原生接管链路的"真播放"证据。
     *
     * 解析拿到地址只是第一步；这一段回答的是后面三步：Media3 真的接纳了这个 MediaItem、
     * 它真的进入了 STATE_READY、播放位置真的在推进（播完时位置等于时长）。
     */
    private void noteNativeContinuationProgress(Player p,boolean drained){
        if(sourceId.isEmpty())return;
        MediaItem item=p.getCurrentMediaItem();
        if(item==null||item.localConfiguration==null||!(item.localConfiguration.tag instanceof JSObject))return;
        JSObject tag=(JSObject)item.localConfiguration.tag;
        if(!tag.optBoolean("nativeContinuation"))return;
        String key=item.mediaId==null?songKey:item.mediaId;
        long position=Math.max(0,p.getCurrentPosition());
        long duration=p.getDuration();
        if(p.getPlaybackState()==Player.STATE_READY){
            PlaybackDiagnostics.note("continuation-ready",new JSObject()
                .put("song",PlaybackDiagnostics.anonKey(key)).put("positionMs",position)
                .put("durationMs",duration>0?duration:0));
        }else if(drained){
            PlaybackDiagnostics.note("continuation-completed",new JSObject()
                .put("song",PlaybackDiagnostics.anonKey(key)).put("positionMs",position)
                .put("durationMs",duration>0?duration:0));
        }
    }

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
        if(action.equals("stop")){player.pause();player.seekTo(0);emit("state",external);main.removeCallbacks(heartbeat);
            // 用户主动停止：洛雪脚本引擎没有理由继续占着内存，脚本本身留着（下次播放再起）。
            io.github.huleixin.tingyu.lx.LxRuntimeHost.INSTANCE.release();return;}
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
            .put("lastQueueAppliedAtMs",lastQueueAppliedAt).put("errorSkips",errorSkips)
            // ---- 失败自动跳过 ----
            .put("skipCount",skipCount).put("consecutiveSkips",consecutiveSkips)
            .put("lastSkipReason",lastSkipReason)
            .put("lastSkipTarget",PlaybackDiagnostics.anonKey(lastSkipTarget))
            .put("skipPending",skipPending)
            .put("globalSuspendInMs",Math.max(0L,globalSuspendUntil-SystemClock.elapsedRealtime()))
            // ---- 音源路由：provider / 用户选的音源 / 实际解析器 三者分开 ----
            .put("selectedPlaybackSource",selectedSourceId())
            .put("songProvider",songProvider())
            .put("actualResolver",actualResolverId())
            .put("nativeReady",nativeReady())
            .put("candidateCount",NativePlaylist.get().size())
            .put("materializedMediaItemCount",player.getMediaItemCount())
            .put("awaitingNativeResolution",awaitingNativeResolution());
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
        // 队列保活：上一次窗口同步删了几首、保住了几首已接管项、加进来的是哪一首。
        // 停播复盘时这几项直接回答"已经准备好的下一首有没有被同步带走"。
        value.put("queueLastRemoved",lastQueueRemoved)
            .put("queueLastPreserved",lastQueuePreserved)
            .put("queueLastAdded",lastQueueAdded)
            .put("queueLastDroppedAdopted",lastQueueDroppedAdopted)
            .put("queueLastAddedFirst",lastQueueAddedFirst)
            .put("queueLastDiffAgeMs",lastQueueDiffAtMs==0L?-1L:SystemClock.elapsedRealtime()-lastQueueDiffAtMs)
            .put("queueNextAdopted",hasAdoptedAhead());
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
        // 音源兼容性：当前这首歌"原本从哪来 / 原生用哪个解析器 / 洛雪引擎跑到哪一步"。
        // 这一段是判定"本轮到底有没有覆盖用户故障链路"的唯一依据。
        try{
            io.github.huleixin.tingyu.playback.NativePlaylist.Track current=
                io.github.huleixin.tingyu.playback.NativePlaylist.get().trackFor(songKey);
            if(current!=null){
                String provider=current.providerId==null?"":current.providerId;
                // 注意：必须是 forTrack（看这首歌的链路），不是 forProvider（只看身份）——
                // 真机 1.3.48 就是在这一行上把 lxSource=tx 的歌判给了 resolver=qq。
                io.github.huleixin.tingyu.resolver.SourceResolver chosen=
                    io.github.huleixin.tingyu.resolver.ResolverRegistry.get().forTrack(current);
                value.put("songSourceType",provider)
                    .put("songLxSource",String.valueOf(io.github.huleixin.tingyu.lx.LxPlatform.INSTANCE.sourceFor(provider)))
                    .put("songResolver",chosen==null?"none":chosen.id())
                    .put("songResolvable",io.github.huleixin.tingyu.resolver.ResolverRegistry.get().canResolveNatively(current));
            }
        }catch(Exception ignored){}
        try{
            org.json.JSONObject lx=io.github.huleixin.tingyu.lx.LxRuntimeHost.INSTANCE.snapshot();
            java.util.Iterator<String> keys=lx.keys();
            while(keys.hasNext()){String key=keys.next();value.put("lx"+Character.toUpperCase(key.charAt(0))+key.substring(1),lx.opt(key));}
        }catch(Exception ignored){}
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
            .put("positionMs",Math.max(0,player.getCurrentPosition())));releaseHandoff();cancelFade();main.removeCallbacksAndMessages(null);sourceId="";listener=null;PlaybackLifecycle.noteBridge(false);player.release();spectrum.close();
            io.github.huleixin.tingyu.lx.LxRuntimeHost.INSTANCE.release();}
}
