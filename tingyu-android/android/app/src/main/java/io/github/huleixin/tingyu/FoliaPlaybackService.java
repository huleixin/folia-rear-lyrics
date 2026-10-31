package io.github.huleixin.tingyu;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.content.Context;
import android.content.Intent;
import android.net.wifi.WifiManager;
import android.media.MediaMetadata;
import android.media.AudioAttributes;
import android.media.session.MediaController;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;

import androidx.annotation.Nullable;

import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.util.Collections;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import android.util.LruCache;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

import org.json.JSONObject;

import io.github.huleixin.tingyu.coloros.ColorOsLyricBridge;

public class FoliaPlaybackService extends Service {
    private static final String CHANNEL_ID = "folia_playback";
    private static final int NOTIFICATION_ID = 31009;
    public static final String ACTION_REFRESH_METADATA = "io.github.huleixin.tingyu.action.REFRESH_METADATA";
    private MediaSession mediaSession;
    private final ExecutorService artworkExecutor = Executors.newSingleThreadExecutor();
    private final OkHttpClient artworkClient = new OkHttpClient.Builder()
        .callTimeout(15, TimeUnit.SECONDS).build();
    // Notification thumbnails must not retain every full-resolution cover for the whole session.
    private final LruCache<String, Bitmap> artworkCache = new LruCache<String, Bitmap>(4 * 1024 * 1024) {
        @Override protected int sizeOf(String key, Bitmap value) { return value.getAllocationByteCount(); }
    };
    private final Set<String> pendingArtworkUrls = Collections.newSetFromMap(new ConcurrentHashMap<>());
    private boolean publishedPlayback = false;
    private String artworkAttemptUrl = "";
    private long artworkAttemptAt = 0L;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private volatile String currentArtworkUrl = "";
    private volatile String appliedArtworkUrl = "";
    private volatile Bitmap appliedArtworkBitmap = null;
    private volatile String lastRequestedCoverUrl = "";
    private volatile String cachedTitle = "";
    private volatile String cachedArtist = "";
    private volatile String cachedAlbum = "";
    private volatile String cachedCoverUrl = "";
    private volatile String cachedSongKey = "";
    private volatile long cachedDurationMs = 0L;
    /**
     * 这个时长是从哪来的：`media3`（播放器真实解析值，最可信）/ `playlist`（歌单给的值，
     * 换歌瞬间的期望值）/ `none`（谁都不知道）。诊断里必须能和 positionMs 一起看，
     * 否则「卡片 00:00」到底是发布错了还是播放器还没解析出来，就无法区分。
     */
    private volatile String cachedDurationSource = "none";
    private volatile long cachedPositionMs = 0L;
    private volatile long cachedPositionUpdatedAt = 0L;
    private volatile boolean cachedPlaying = false;
    private long lastSystemSeekAt;
    private static volatile boolean running = false;
    private static volatile FoliaPlaybackService activeService;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private static volatile String powerDiagnostic = "inactive";
    private static final long SERVICE_HEARTBEAT_INTERVAL_MS = 10_000L;
    /**
     * `service-start` 的重复记录间隔。前台服务每次收到播放状态推送都会走一遍 `onStartCommand`，
     * 崩溃历史只留 20 条，不节流的话这些重复记录会把真正的退出原因挤掉。
     */
    private static final long SERVICE_START_RECORD_INTERVAL_MS = 5_000L;
    private volatile boolean lastPlaying = false;
    /** Last (track, lyric state) pair written to metadata; only used to dedupe diagnostics. */
    private volatile String lastLyricState = "";
    /** {@link #ensureLyricPublished()} 每首歌只自检一次的去重标记。 */
    private String lyricSelfHealDoneFor = "";
    private volatile String lastLyricSessionState = "";
    /** Own-session controller, used only to read back what the session really exposes. */
    private volatile MediaController selfController;
    private volatile long lastServiceStartRecordAt = 0L;
    private volatile boolean lastServiceStartPlaying = false;
    private volatile String lastServiceStartSongKey = "";
    private final Runnable serviceHeartbeatRunnable = new Runnable() {
        @Override
        public void run() {
            recordServiceHeartbeat();
            // 锁屏连播期间的第三个采样时点：卡片上看到的一切，10s 落一次。
            noteSessionSample("tick");
            mainHandler.postDelayed(this, SERVICE_HEARTBEAT_INTERVAL_MS);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;
        createNotificationChannel();
        mediaSession = new MediaSession(this, "FoliaPlayback");
        mediaSession.setPlaybackToLocal(new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
        mediaSession.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
        mediaSession.setSessionActivity(PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        mediaSession.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { emit("play"); }
            @Override public void onPause() { emit("pause"); }
            @Override public void onSkipToNext() { emit("next"); }
            @Override public void onSkipToPrevious() { emit("previous"); }
            @Override public void onStop() { emit("stop"); }
            @Override public void onSeekTo(long positionMs) {
                cachedPositionMs = Math.max(0L, cachedDurationMs > 0 ? Math.min(positionMs, cachedDurationMs) : positionMs);
                cachedPositionUpdatedAt = SystemClock.elapsedRealtime();
                lastSystemSeekAt = System.currentTimeMillis();
                FoliaNativePlugin.emitMediaSeek(cachedPositionMs);
                mediaSession.setPlaybackState(buildPlaybackState(cachedPlaying, cachedPositionMs, cachedSongKey));
            }
        });
        mediaSession.setActive(true);
        PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Folia:Playback");
            wakeLock.setReferenceCounted(false);
        }
        WifiManager wifiManager = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
        // Android 10+ low-latency locks are for interactive networking: they cost power and
        // are inactive with the screen off. Buffered music needs no gaming Wi-Fi mode.
        if (wifiManager != null && Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            wifiLock = wifiManager.createWifiLock(WifiManager.WIFI_MODE_FULL, "Folia:Playback");
            wifiLock.setReferenceCounted(false);
        }
        recordServiceLifecycle("service-create", "Foreground playback service created");
        // 洛雪音源运行时归播放进程所有：它拿的是 applicationContext，
        // MainActivity 重建、插件实例重建都与它无关。
        io.github.huleixin.tingyu.lx.LxRuntimeHost.INSTANCE.attach(this);
        io.github.huleixin.tingyu.playback.PlaybackDiagnostics.initialize(this);
        io.github.huleixin.tingyu.playback.PlaybackDiagnostics.note("service-create",
            new com.getcapacitor.JSObject().put("pid", android.os.Process.myPid()));
        activeService = this;
        mainHandler.post(serviceHeartbeatRunnable);
    }

    /** ColorOS lyric bridge uses this to decide whether a metadata refresh intent is worth sending. */
    public static boolean isRunning() {
        return running;
    }

    /**
     * A sticky restart inherits the engine but not the WebView's last push.
     *
     * Cached fields can still be empty (the service was recycled before any push landed in this
     * instance), and rebuilding metadata from empty fields would publish a nameless session -
     * for the lyric consumer that looks like "this track has no lyrics". The engine's current
     * media item is the authority here, so the identity, title and position are taken from it,
     * and the lyric timeline for that exact song key is attached by the usual metadata build.
     */
    private void restoreFromEngine() {
        com.getcapacitor.JSObject tag = io.github.huleixin.tingyu.playback.NativeAudioEngine.currentTrackTag();
        if (tag == null) return;
        String key = tag.optString("songKey");
        if (key.isEmpty()) return;
        cachedSongKey = key;
        if (tag.has("title")) cachedTitle = tag.optString("title");
        if (tag.has("artist")) cachedArtist = tag.optString("artist");
        if (tag.has("album")) cachedAlbum = tag.optString("album");
        if (tag.has("coverUrl")) cachedCoverUrl = tag.optString("coverUrl");
        // 队列项的封面字段名是 `artwork`（只有播放插件推当前曲时才叫 coverUrl）。少了这一条，
        // 服务被系统重建后卡片一定会退回占位图，而且原生自己也补不回来。
        if (cachedCoverUrl.isEmpty() && tag.has("artwork")) cachedCoverUrl = tag.optString("artwork");
        long duration = tag.optLong("duration", 0L);
        if (duration <= 0L) duration = tag.optLong("durationMs", 0L);
        if (duration > 0) cachedDurationMs = duration;
        cachedPositionMs = Math.max(0L, tag.optLong("position", 0L));
        cachedPositionUpdatedAt = SystemClock.elapsedRealtime();
        cachedPlaying = tag.optBoolean("playing", false);
        publishedPlayback = true;
        currentArtworkUrl = cachedCoverUrl.trim();
        io.github.huleixin.tingyu.playback.PlaybackDiagnostics.note("service-restore-engine",
            new com.getcapacitor.JSObject()
                .put("song", io.github.huleixin.tingyu.playback.PlaybackDiagnostics.anonKey(cachedSongKey))
                .put("positionMs", cachedPositionMs)
                .put("lyric", ColorOsLyricBridge.stateOf(cachedSongKey)));
        // 服务进程被重建后同样要补一次歌曲信息：歌词/封面都该由原生自己续上，而不是等 App 打开。
        io.github.huleixin.tingyu.playback.NativeAudioEngine.scheduleSongInfoForCurrent();
    }

    /** Media3 state changes reach the system without routing through JS or restarting this service. */
    public static void nativePlaybackChanged(boolean forcePosition) {
        FoliaPlaybackService service = activeService;
        if (service == null) return;
        if (Looper.myLooper() != Looper.getMainLooper()) {
            service.mainHandler.post(() -> nativePlaybackChanged(forcePosition)); return;
        }
        if (!service.publishedPlayback || !running) return;
        // Publish a pause before returning to the looper: Media3 can release its wake lock now.
        service.refreshNativePlayback(forcePosition);
    }

    private void refreshNativePlayback(boolean forcePosition) {
        if (activeService != this || !running || mediaSession == null) return;
        long[] nativeClock = io.github.huleixin.tingyu.playback.NativeAudioEngine.mediaClock(cachedSongKey);
        if (nativeClock == null) return; // A new track's metadata is published separately by Media3.
        // 换歌瞬间 Media3 还没解析出容器时长，卡片先用歌单给的先验值。READY 之后真实值到了，
        // 这里纠正**一次**并重建 metadata：不做的话，凡是歌单时长与容器时长不一致的曲目，
        // 总时长会一直是错的，只有用户重新打开 App（JS 重新推一遍）才会好 —— 正是要消掉的行为。
        long engineDuration = io.github.huleixin.tingyu.playback.NativeAudioEngine.durationMsFor(cachedSongKey);
        if (engineDuration > 0L && Math.abs(engineDuration - cachedDurationMs) > 1_000L) {
            long previous = cachedDurationMs;
            cachedDurationMs = engineDuration;
            cachedDurationSource = "media3";
            io.github.huleixin.tingyu.playback.PlaybackDiagnostics.note("duration-corrected",
                new com.getcapacitor.JSObject()
                    .put("song", io.github.huleixin.tingyu.playback.PlaybackDiagnostics.anonKey(cachedSongKey))
                    .put("fromMs", previous).put("toMs", engineDuration));
            publishMetadata(appliedArtworkBitmap);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification(cachedTitle, cachedArtist, cachedPlaying, appliedArtworkBitmap));
        }
        PlaybackSessionClock state = PlaybackSessionClock.resolve(cachedPlaying, cachedPositionMs, nativeClock);
        long now = SystemClock.elapsedRealtime();
        long projected = PlaybackPositionClock.at(cachedPlaying, cachedPositionMs, cachedPositionUpdatedAt, now, cachedDurationMs);
        if (!state.shouldPublish(cachedPlaying, projected, forcePosition)) return;
        boolean changed = cachedPlaying != state.playing;
        cachedPlaying = state.playing; cachedPositionMs = state.position;
        cachedPositionUpdatedAt = now; lastPlaying = cachedPlaying;
        mediaSession.setPlaybackState(buildPlaybackState(cachedPlaying, cachedPositionMs, cachedSongKey));
        ensureLyricPublished();
            if (changed) {
                io.github.huleixin.tingyu.playback.PlaybackDiagnostics.note("native-session-state",
                    new com.getcapacitor.JSObject().put("playing", cachedPlaying).put("positionMs", cachedPositionMs));
                NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification(cachedTitle, cachedArtist, cachedPlaying, appliedArtworkBitmap));
            updatePlaybackLocks(cachedPlaying);
            RearLyricsCoordinator.get(this).playback(cachedPlaying);
            recordServiceLifecycle("native-session-state", "playing=" + cachedPlaying + ", positionMs=" + cachedPositionMs);
        }
    }

    /** Publish the new item's lock-screen metadata without waiting for a WebView round trip. */
    public static void publishQueuedTrack(android.content.Context context, JSONObject track, boolean playing) {
        if(!running)return;
        Intent intent=new Intent(context,FoliaPlaybackService.class);
        for(String key:new String[]{"title","artist","album","songKey"})intent.putExtra(key,track.optString(key));
        // 封面字段有**两个**名字：JS 播放插件推当前曲时叫 coverUrl，原生队列项（以及续播接管项）
        // 的 tag 里叫 artwork。这里过去只读 coverUrl，于是每次原生自动切歌都把封面当成空值推给
        // 服务 —— 这就是「锁屏切第二首连封面也没了」的直接原因：不是没下载到，是地址在换歌那一刻就丢了。
        String cover=track.optString("coverUrl","");
        if(cover.isEmpty())cover=track.optString("artwork","");
        intent.putExtra("coverUrl",cover);
        // 同理 `duration` 与 `durationMs` 两种写法都要认（原生队列项只有后者）。
        long duration=track.optLong("duration",0L);
        if(duration<=0L)duration=track.optLong("durationMs",0L);
        intent.putExtra("duration",duration).putExtra("position",0L)
            .putExtra("capturedAtMs",System.currentTimeMillis()).putExtra("playing",playing);
        context.startService(intent);
    }

    /**
     * 原生取到的歌词要写进当前 metadata。
     *
     * <p>只在这一首**仍然是服务正在发布的那一首**时重建：迟到的结果既不能覆盖新歌，也不能
     * 在用户已经切走之后把卡片改回去。歌词本身早已按 songKey 存进 {@link ColorOsLyricBridge}，
     * 所以这里真正的动作是「让系统面板读一次」。
     */
    public static boolean applyNativeLyric(String songKey, String json) {
        FoliaPlaybackService service = activeService;
        if (service == null || !running || songKey == null) return false;
        service.mainHandler.post(() -> {
            try {
                if (activeService != service || !running) return;
                applyNativeLyric(songKey, json, 3);
            } catch (Throwable error) {
                // 后台歌词只是附加信息：重建 metadata 失败不能把正在放歌的进程带走。
                io.github.huleixin.tingyu.CrashDiagnostics.record(service, "lyrics-apply", "main", error);
            }
        });
        return true;
    }

    /**
     * @param retries 服务身份尚未跟上的补救机会。换歌瞬间歌词结果与 {@code onStartCommand}
     *                都排在主线程队列上，歌词可能先到 —— 直接丢弃会让这首歌在灵动岛上
     *                整首留白（真机 2026-10-31：第一首正常、第二/三首无词的主因）。
     *                与封面路径同款处理：若引擎当前曲就是它，短暂延后重认，仍要求到点时
     *                服务的当前曲确实是它。
     */
    private static void applyNativeLyric(String songKey, String json, int retries) {
        FoliaPlaybackService service = activeService;
        if (service == null || !running) return;
        boolean matched = songKey.equals(service.cachedSongKey);
        io.github.huleixin.tingyu.playback.PlaybackDiagnostics.note("lyrics-apply",
            new com.getcapacitor.JSObject()
                .put("song", io.github.huleixin.tingyu.playback.PlaybackDiagnostics.anonKey(songKey))
                .put("matched", matched)
                .put("retries", retries)
                .put("state", ColorOsLyricBridge.stateOf(songKey))
                .put("wrote", json == null ? "none" : "timeline"));
        if (!matched) {
            boolean engineIsSong = songKey.equals(
                io.github.huleixin.tingyu.playback.NativeAudioEngine.currentKey());
            if (retries > 0 && engineIsSong) {
                service.mainHandler.postDelayed(
                    () -> applyNativeLyric(songKey, json, retries - 1), 700L);
            }
            return;
        }
        service.publishMetadata(service.appliedArtworkBitmap);
        NotificationManager manager = service.getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID,
                service.buildNotification(service.cachedTitle, service.cachedArtist,
                    service.cachedPlaying, service.appliedArtworkBitmap));
        }
    }

    /**
     * 原生取到的封面要写进当前 metadata。
     *
     * <p>三道闸：仍在这一首、服务仍在跑、位图非空。任何一条不满足就什么都不做 ——
     * 把上一首的封面写进新歌，比不显示封面糟得多。
     */
    public static boolean applyNativeArtwork(String songKey, Bitmap bitmap) {
        return applyNativeArtwork(songKey, bitmap, 1);
    }

    /**
     * @param retries 还剩几次补救机会。仅用于「结果到得比服务的换歌发布还早」这一种时序：
     *                `startService` 投递的 `onStartCommand` 与本方法都排在主线程队列上，
     *                缓存命中的封面可能先到，此时 {@code cachedSongKey} 还停在上一首。
     *                直接丢弃会让这首永远没有封面（服务自己的下载路径可能同样失败），
     *                所以这里给它一次按引擎当前曲确认过的延后重试。
     */
    private static boolean applyNativeArtwork(String songKey, Bitmap bitmap, int retries) {
        FoliaPlaybackService service = activeService;
        if (service == null || !running || songKey == null || bitmap == null || bitmap.isRecycled()) return false;
        service.mainHandler.post(() -> {
            try {
                if (activeService != service || !running) return;
                boolean matched = songKey.equals(service.cachedSongKey);
                io.github.huleixin.tingyu.playback.PlaybackDiagnostics.note("artwork-apply",
                    new com.getcapacitor.JSObject()
                        .put("song", io.github.huleixin.tingyu.playback.PlaybackDiagnostics.anonKey(songKey))
                        .put("matched", matched)
                        .put("retries", retries)
                        .put("w", bitmap.getWidth()).put("h", bitmap.getHeight()));
                if (!matched) {
                    // 服务还没跟上，但引擎已经在放这一首：稍后再认一次，仍然要求服务那时
                    // 的当前曲就是它 —— 不能用「引擎说是」直接把封面写进别人的 metadata。
                    boolean engineIsSong = songKey.equals(
                        io.github.huleixin.tingyu.playback.NativeAudioEngine.currentKey());
                    if (retries > 0 && engineIsSong && !bitmap.isRecycled()) {
                        service.mainHandler.postDelayed(
                            () -> applyNativeArtwork(songKey, bitmap, retries - 1), 700L);
                    }
                    return;
                }
                // 记「这张图属于哪个地址」时用服务自己的封面字段：`currentArtworkUrl` 可能要等到
                // 下一次 onStartCommand。若在这里写进一个空串，紧接着的发布就会因为
                // 「URL 为空」把刚拿到的封面当成过期清掉。
                String url = service.cachedCoverUrl == null ? "" : service.cachedCoverUrl.trim();
                if (url.isEmpty()) url = service.currentArtworkUrl;
                service.appliedArtworkBitmap = bitmap;
                service.appliedArtworkUrl = url;
                if (!url.isEmpty()) service.lastRequestedCoverUrl = url;
                service.publishMetadata(bitmap);
                NotificationManager manager = service.getSystemService(NotificationManager.class);
                if (manager != null) {
                    manager.notify(NOTIFICATION_ID,
                        service.buildNotification(service.cachedTitle, service.cachedArtist,
                            service.cachedPlaying, bitmap));
                }
            } catch (Throwable error) {
                io.github.huleixin.tingyu.CrashDiagnostics.record(service, "artwork-apply", "main", error);
            }
        });
        return true;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        io.github.huleixin.tingyu.playback.PlaybackDiagnostics.initialize(this);
        if ("clear".equals(intent == null ? null : intent.getAction())) {
            recordServiceLifecycle("service-stop-command", "Stop command received");
            stopSelf();
            return START_NOT_STICKY;
        }
        if (intent == null) {
            // A null intent means the system restarted this START_STICKY service. If the
            // engine in this same process still owns an unpaused source (service-only
            // restart, e.g. after a crash of the service or an LMK trim), tearing the
            // service down would strand a playing engine without its foreground
            // notification and the system would kill playback shortly after. Re-publish
            // the notification from cached metadata and keep living. If nothing is
            // playing, the restart is stale bookkeeping and stopping remains correct.
            boolean keepAlive = io.github.huleixin.tingyu.playback.NativeAudioEngine.isPlaybackActive();
            io.github.huleixin.tingyu.playback.PlaybackDiagnostics.note("service-restart",
                new com.getcapacitor.JSObject().put("keepAlive", keepAlive));
            if (keepAlive) {
                try {
                    restoreFromEngine();
                    applyCachedMetadata();
                    startForeground(NOTIFICATION_ID, buildNotification(cachedTitle, cachedArtist, cachedPlaying, appliedArtworkBitmap));
                    updatePlaybackLocks(cachedPlaying);
                    recordServiceLifecycle("service-restart-keepalive", "Sticky restart with active playback; foreground publication restored");
                    return START_STICKY;
                } catch (Exception error) {
                    // A background-restricted restart may refuse startForeground; without the
                    // notification the system will stop us anyway, so fall through to the
                    // honest stop path instead of half-keeping playback alive.
                    io.github.huleixin.tingyu.playback.PlaybackDiagnostics.note("service-restart-denied",
                        new com.getcapacitor.JSObject().put("error", error.getClass().getSimpleName()));
                    recordServiceLifecycle("service-restart-denied", error.getClass().getSimpleName());
                }
            }
            recordServiceLifecycle("service-stop-command", "Restart with no active playback; stop command received");
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_REFRESH_METADATA.equals(intent.getAction())) {
            applyCachedMetadata();
            return START_STICKY;
        }

        String title = intent.getStringExtra("title");
        String artist = intent.getStringExtra("artist");
        String album = intent.getStringExtra("album");
        String cover = intent.getStringExtra("coverUrl");
        String songKey = intent.getStringExtra("songKey");
        title = title == null ? "" : title;
        artist = artist == null ? "" : artist;
        album = album == null ? "" : album;
        cover = cover == null ? "" : cover;
        songKey = songKey == null ? "" : songKey;
        // 空封面不能覆盖已经正确的封面：同一个 songKey 上，前台 JS 偶尔会推一条 coverUrl 为空的
        // 更新（预取未完成、封面字段缺失、或渲染进程重挂后状态回退）。那条更新只该改标题/进度，
        // 不该把原生已经拿到的封面擦掉 —— 擦掉之后系统卡片就只剩占位图，且不会再恢复。
        if (cover.isEmpty() && songKey.equals(cachedSongKey)
            && appliedArtworkBitmap != null && !appliedArtworkUrl.isEmpty()) {
            cover = appliedArtworkUrl;
            io.github.huleixin.tingyu.playback.PlaybackDiagnostics.note("artwork-kept",
                new com.getcapacitor.JSObject()
                    .put("song", io.github.huleixin.tingyu.playback.PlaybackDiagnostics.anonKey(songKey))
                    .put("reason", "empty-push")
                    .put("url", appliedArtworkUrl.isEmpty() ? "none" : "kept"));
        }
        // A sleeping UI can still publish the preceding item after Media3 advanced.
        // Native prepare/transition publishes its own metadata, so stale UI cannot replace it.
        long[] nativeClock = io.github.huleixin.tingyu.playback.NativeAudioEngine.mediaClock(songKey);
        if(io.github.huleixin.tingyu.playback.NativeAudioEngine.isActive() && nativeClock==null)return START_STICKY;
        PlaybackSessionClock state = PlaybackSessionClock.resolve(intent.getBooleanExtra("playing", false),
            intent.getLongExtra("position", 0L), nativeClock);
        boolean playing = state.playing;
        // 时长的权威是 Media3 自己：它已经解析出容器时长时，歌单里的数字只是先验。
        // 换歌那一瞬间 Media3 往往还是 TIME_UNSET（durationMsFor 返回 -1），此时才回退到
        // 歌单给的 durationMs —— 两条来源都记录在 durationSource 里，报告可判。
        long duration = intent.getLongExtra("duration", 0L);
        String durationSource = duration > 0L ? "playlist" : "none";
        long engineDuration = io.github.huleixin.tingyu.playback.NativeAudioEngine.durationMsFor(songKey);
        if (engineDuration > 0L) { duration = engineDuration; durationSource = "media3"; }
        if (duration != cachedDurationMs || !durationSource.equals(cachedDurationSource)) {
            io.github.huleixin.tingyu.playback.PlaybackDiagnostics.note("duration-source",
                new com.getcapacitor.JSObject()
                    .put("song", io.github.huleixin.tingyu.playback.PlaybackDiagnostics.anonKey(songKey))
                    .put("durationMs", duration).put("source", durationSource)
                    .put("playlistMs", intent.getLongExtra("duration", 0L))
                    .put("media3Ms", engineDuration));
        }
        boolean songChanged = !songKey.equals(cachedSongKey);
        boolean metadataChanged = !title.equals(cachedTitle) || !artist.equals(cachedArtist)
            || !album.equals(cachedAlbum) || !cover.equals(cachedCoverUrl) || !songKey.equals(cachedSongKey)
            || duration != cachedDurationMs;
        boolean progressOnly = publishedPlayback && !metadataChanged && playing == cachedPlaying;
        cachedTitle = title;
        cachedArtist = artist;
        cachedAlbum = album;
        cachedCoverUrl = cover;
        cachedSongKey = songKey;
        cachedPlaying = playing;
        // In-flight JS publications sampled before a system seek cannot undo that seek.
        if (nativeClock != null || songChanged || intent.getLongExtra("capturedAtMs", 0L) >= lastSystemSeekAt) {
            cachedPositionMs = state.position;
            cachedPositionUpdatedAt = SystemClock.elapsedRealtime();
        }
        cachedDurationMs = Math.max(0L, duration);
        cachedDurationSource = durationSource;
        if(songChanged)lastSystemSeekAt=0L;
        if (progressOnly) {
            // Android extrapolates position from PlaybackState's timestamp. A clock refresh must
            // not restart foreground publication or rebuild artwork/queue/notification metadata.
            mediaSession.setPlaybackState(buildPlaybackState(cachedPlaying, cachedPositionMs, cachedSongKey));
            refreshArtwork();
            noteSessionSample("publish");
            return START_STICKY;
        }
        publishedPlayback = true;
        lastPlaying = cachedPlaying;
        recordServiceStartIfNoteworthy();
        currentArtworkUrl = cachedCoverUrl.trim();
        Bitmap retainedArtwork = appliedArtworkBitmap;
        if (!currentArtworkUrl.equals(appliedArtworkUrl) || currentArtworkUrl.isEmpty()) {
            appliedArtworkUrl = "";
            appliedArtworkBitmap = null;
            retainedArtwork = null;
        }
        if (!currentArtworkUrl.equals(lastRequestedCoverUrl)) {
            lastRequestedCoverUrl = currentArtworkUrl;
            FoliaNativePlugin.notePlaybackArtwork(
                currentArtworkUrl,
                currentArtworkUrl.isEmpty() ? "none" : "queued",
                ""
            );
        }

        // The notification goes on right below via startForeground; building it twice here was
        // one of the two writes per start command (the other is the lifecycle record).
        applyCachedMetadata(false);
        FoliaNativePlugin.notePlaybackArtworkApplied(retainedArtwork != null);

        Notification notification = buildNotification(cachedTitle, cachedArtist, cachedPlaying, retainedArtwork);
        startForeground(NOTIFICATION_ID, notification);
        updatePlaybackLocks(cachedPlaying);
        RearLyricsCoordinator.get(this).playback(cachedPlaying);
        refreshArtwork();
        noteSessionSample(songChanged ? "transition" : "publish");
        return START_STICKY;
    }

    private void refreshArtwork() {
        refreshArtwork(1);
    }

    /**
     * @param retries 网络失败后的补救次数（一次，4 秒后）。
     *
     *                <p>换歌瞬间的封面请求经常正好撞上切网/弱信号：一次失败之后，30 秒冷却闸门
     *                会把同一张图挡住，而之后只有元数据再变才会重入这个方法 —— 于是一首两分钟
     *                的歌从头到尾都没有封面。补救是有界的：同一首歌最多多试一次，且必须仍然是
     *                这一首、这张地址。
     */
    private void refreshArtwork(int retries) {
        if (currentArtworkUrl.isEmpty() || currentArtworkUrl.equals(appliedArtworkUrl)) return;
        long now = SystemClock.elapsedRealtime();
        if (currentArtworkUrl.equals(artworkAttemptUrl) && now - artworkAttemptAt < 30_000L) return;
        artworkAttemptUrl = currentArtworkUrl;
        artworkAttemptAt = now;
        String requestedCover = currentArtworkUrl;
        loadArtwork(requestedCover, bitmap -> {
            if (!requestedCover.equals(currentArtworkUrl)) return;
            if (bitmap == null && retries > 0) {
                io.github.huleixin.tingyu.playback.PlaybackDiagnostics.note("artwork-retry",
                    new com.getcapacitor.JSObject()
                        .put("song", io.github.huleixin.tingyu.playback.PlaybackDiagnostics.anonKey(cachedSongKey))
                        .put("remaining", retries - 1));
                // 放开冷却闸门，让下一跳真的会再联网一次。
                artworkAttemptUrl = "";
                mainHandler.postDelayed(() -> refreshArtwork(retries - 1), 4_000L);
                return;
            }
            publishMetadata(bitmap);
            FoliaNativePlugin.notePlaybackArtworkApplied(bitmap != null);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.notify(NOTIFICATION_ID, buildNotification(cachedTitle, cachedArtist, cachedPlaying, bitmap));
            }
        });
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        CrashDiagnostics.recordText(
            getApplicationContext(),
            "activity-lifecycle",
            "service",
            "task-removed",
            "Task removed from recents",
            "FoliaPlaybackService.onTaskRemoved"
        );
        super.onTaskRemoved(rootIntent);
    }

    private MediaMetadata buildMetadata(
        String title,
        String artist,
        String album,
        long duration,
        Bitmap artwork,
        String coverUrl,
        String songKey
    ) {
        MediaMetadata.Builder metadata = new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_MEDIA_ID, songKey)
            .putString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE, title == null ? "听屿" : title)
            .putString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE, artist == null ? "" : artist)
            .putString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST, artist == null ? "" : artist)
            .putString(MediaMetadata.METADATA_KEY_TITLE, title == null ? "听屿" : title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, artist == null ? "" : artist)
            .putString(MediaMetadata.METADATA_KEY_ALBUM, album == null ? "" : album)
            .putLong(MediaMetadata.METADATA_KEY_DURATION, duration);
        if (artwork == null && coverUrl != null && !coverUrl.isEmpty()) {
            metadata.putString(MediaMetadata.METADATA_KEY_ART_URI, coverUrl);
            metadata.putString(MediaMetadata.METADATA_KEY_ALBUM_ART_URI, coverUrl);
        }
        if (artwork != null) {
            metadata.putBitmap(MediaMetadata.METADATA_KEY_ART, artwork);
            metadata.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, artwork);
        }
        // The track being published is the one the player is on: priming the next window must
        // not be able to evict its timeline, or the boundary publishes an empty lyric field.
        ColorOsLyricBridge.pin(songKey);
        ColorOsLyricBridge.attach(metadata, songKey);
        MediaMetadata built = metadata.build();
        // Read the payload back out of the object that is about to reach the session, instead of
        // trusting that "we asked for lyrics for this songKey". songKey equality says nothing
        // about whether a payload exists: pending writes no key at all, and a confirmed-no-lyric
        // track writes a stub that looks identical to a blank island from the outside.
        noteLyricPublication(songKey, built);
        return built;
    }

    /**
     * The lyric side of the session, recorded only when the (track, state) pair changes.
     *
     * "pending" is the state that used to be invisible: the system panel had already moved to
     * the next track while the WebView had not yet produced its timeline, so the bridge published
     * an explicit no-lyric payload and the island stayed empty even after lyrics arrived. Keeping
     * the transition in the trail is what makes the difference provable from a device report.
     */
    private void noteLyricPublication(String songKey) {
        noteLyricPublication(songKey, null);
    }

    /**
     * @param published the metadata just built, when the caller has it; its `lyricInfo` is read
     *                  back so the trail says what the session actually received.
     */
    private void noteLyricPublication(String songKey, MediaMetadata published) {
        String state = ColorOsLyricBridge.stateOf(songKey);
        String written = published == null ? null : published.getString(ColorOsLyricBridge.METADATA_KEY_LYRIC_INFO);
        // Independent of songKey: absent / empty stub / a real timeline are three different
        // answers to "does the island have something to show for this track".
        String kind = written == null ? "absent"
            : written.isEmpty() ? "empty"
            : written.contains("\"noLyric\":true") ? "stub" : "timeline";
        String identity = state + "|" + kind + "|"
            + io.github.huleixin.tingyu.playback.PlaybackDiagnostics.anonKey(songKey);
        if (identity.equals(lastLyricState)) return;
        lastLyricState = identity;
        io.github.huleixin.tingyu.playback.PlaybackDiagnostics.note("lyric-metadata", new com.getcapacitor.JSObject()
            .put("state", state)
            .put("written", kind)
            .put("len", written == null ? -1 : written.length())
            .put("song", io.github.huleixin.tingyu.playback.PlaybackDiagnostics.anonKey(songKey))
            .put("playing", cachedPlaying));
    }

    private void applyCachedMetadata() {
        applyCachedMetadata(true);
    }

    /** `notify=false`：紧接着就要 `startForeground` 的路径，不再重复构建一次通知。 */
    private void applyCachedMetadata(boolean notify) {
        if (mediaSession == null) return;
        Bitmap retained = appliedArtworkBitmap;
        publishMetadata(retained);
        mediaSession.setPlaybackState(buildPlaybackState(cachedPlaying, cachedPositionMs, cachedSongKey));
        if (notify) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null && running) {
                manager.notify(NOTIFICATION_ID, buildNotification(cachedTitle, cachedArtist, cachedPlaying, retained));
            }
        }
    }

    /** Keep AVRCP's current item, media ID and active queue item coherent; this is only the real current track. */
    private void publishMetadata(Bitmap artwork) {
        MediaMetadata metadata = buildMetadata(cachedTitle, cachedArtist, cachedAlbum, cachedDurationMs,
            artwork, cachedCoverUrl, cachedSongKey);
        mediaSession.setMetadata(metadata);
        mediaSession.setQueue(Collections.singletonList(new MediaSession.QueueItem(metadata.getDescription(), queueId(cachedSongKey))));
        noteLyricSessionState(cachedSongKey);
    }

    /**
     * Layer 2 of the lyric evidence: read {@code lyricInfo} back out of the MediaSession itself.
     *
     * Layer 1 ({@code lyric-metadata}) only proves what we built. This proves what the session
     * actually exposes to whoever reads it; the two can disagree when metadata is replaced,
     * dropped or shadowed between construction and publication. Layer 3 - whether the system UI
     * then renders it - is outside this process and cannot be observed without hooking the
     * consumer, so the report states the boundary instead of guessing.
     */
    private void noteLyricSessionState(String songKey) {
        if (mediaSession == null || songKey == null || songKey.isEmpty()) return;
        MediaMetadata published;
        try {
            published = readSessionMetadata();
        } catch (Throwable error) {
            published = null;
        }
        String written = published == null ? null : published.getString(ColorOsLyricBridge.METADATA_KEY_LYRIC_INFO);
        String sessionSong = published == null ? null : published.getString(MediaMetadata.METADATA_KEY_MEDIA_ID);
        String kind = written == null ? "absent"
            : written.isEmpty() ? "empty"
            : written.contains("\"noLyric\":true") ? "stub" : "timeline";
        String identity = kind
            + "|" + io.github.huleixin.tingyu.playback.PlaybackDiagnostics.anonKey(songKey)
            + "|" + (sessionSong == null ? "none"
                : io.github.huleixin.tingyu.playback.PlaybackDiagnostics.anonKey(sessionSong));
        if (identity.equals(lastLyricSessionState)) return;
        lastLyricSessionState = identity;
        io.github.huleixin.tingyu.playback.PlaybackDiagnostics.note("lyric-session", new com.getcapacitor.JSObject()
            .put("written", kind)
            .put("len", written == null ? -1 : written.length())
            .put("song", io.github.huleixin.tingyu.playback.PlaybackDiagnostics.anonKey(songKey))
            .put("sessionSong", sessionSong == null ? "none"
                : io.github.huleixin.tingyu.playback.PlaybackDiagnostics.anonKey(sessionSong))
            .put("songMatches", sessionSong != null && sessionSong.equals(songKey))
            .put("sessionActive", mediaSession.isActive())
            .put("playing", cachedPlaying));
    }

    /** Reads the session through a plain controller: the same path any consumer would use. */
    private MediaMetadata readSessionMetadata() {
        try {
            if (selfController == null) {
                MediaSession.Token token = mediaSession.getSessionToken();
                if (token == null) return null;
                selfController = new MediaController(this, token);
            }
            return selfController.getMetadata();
        } catch (Throwable error) {
            selfController = null;
            return null;
        }
    }

    private static long queueId(String songKey) {
        return Integer.toUnsignedLong(songKey.hashCode());
    }

    private PlaybackState buildPlaybackState(boolean playing, long position, String songKey) {
        position = PlaybackPositionClock.at(playing, position, cachedPositionUpdatedAt,
            SystemClock.elapsedRealtime(), cachedDurationMs);
        long[] nativeClock = io.github.huleixin.tingyu.playback.NativeAudioEngine.mediaClock(songKey);
        if (nativeClock != null) { position = nativeClock[0]; playing = nativeClock[1] == 1; }
        // A drained native window with playlist left is a gap being bridged, not a finished
        // session: report buffering so the system panel does not tear the session down while
        // the next resolved items are on their way.
        boolean bridging = !playing && io.github.huleixin.tingyu.playback.NativeAudioEngine.isWaitingForNext();
        int state = playing ? PlaybackState.STATE_PLAYING
            : bridging ? PlaybackState.STATE_BUFFERING : PlaybackState.STATE_PAUSED;
        PlaybackState.Builder builder = new PlaybackState.Builder()
            .setActiveQueueItemId(queueId(songKey))
            .setActions(
                PlaybackState.ACTION_PLAY
                    | PlaybackState.ACTION_PAUSE
                    | PlaybackState.ACTION_PLAY_PAUSE
                    | PlaybackState.ACTION_SKIP_TO_NEXT
                    | PlaybackState.ACTION_SKIP_TO_PREVIOUS
                    | PlaybackState.ACTION_SEEK_TO
            )
            .setState(state, position, playing ? 1f : 0f);
        if (ColorOsLyricBridge.isSupported() && ColorOsLyricBridge.hasTranslationFor(songKey)) {
            builder.addCustomAction(new PlaybackState.CustomAction.Builder(
                ColorOsLyricBridge.ACTION_TOGGLE_TRANSLATION,
                "翻译",
                translationActionIcon()
            ).build());
        }
        return builder.build();
    }

    private int translationActionIcon() {
        int icon = getApplicationInfo().icon;
        return icon != 0 ? icon : android.R.drawable.ic_menu_info_details;
    }

    private Notification buildNotification(
        String title,
        String artist,
        boolean playing,
        Bitmap artwork
    ) {
        Intent activityIntent = new Intent(this, MainActivity.class);
        PendingIntent contentIntent = PendingIntent.getActivity(
            this,
            0,
            activityIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        int playPauseIcon = playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play;
        PendingIntent playPauseIntent = PendingIntent.getBroadcast(
            this,
            1,
            new Intent(this, PlaybackActionReceiver.class).setAction("toggle"),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        PendingIntent previousIntent = PendingIntent.getBroadcast(
            this,
            2,
            new Intent(this, PlaybackActionReceiver.class).setAction("previous"),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        PendingIntent nextIntent = PendingIntent.getBroadcast(
            this,
            3,
            new Intent(this, PlaybackActionReceiver.class).setAction("next"),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Notification.Builder builder = new Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(title == null ? "听屿" : title)
            .setContentText(artist == null ? "" : artist)
            .setContentIntent(contentIntent)
            .setOnlyAlertOnce(true)
            .setOngoing(playing)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .addAction(android.R.drawable.ic_media_previous, "Previous", previousIntent)
            .addAction(playPauseIcon, playing ? "Pause" : "Play", playPauseIntent)
            .addAction(android.R.drawable.ic_media_next, "Next", nextIntent)
            .setStyle(new Notification.MediaStyle()
                .setMediaSession(mediaSession.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2));
        if (artwork != null) builder.setLargeIcon(artwork);
        return builder.build();
    }

    private void loadArtwork(String value, ArtworkCallback callback) {
        if (value == null || value.isEmpty()) return;
        if (value.equals(appliedArtworkUrl)) return;
        Bitmap cached = artworkCache.get(value);
        if (cached != null) {
            mainHandler.post(() -> {
                if (value.equals(currentArtworkUrl)) {
                    appliedArtworkUrl = value;
                    appliedArtworkBitmap = cached;
                    FoliaNativePlugin.notePlaybackArtwork(
                        value,
                        "loaded",
                        "cached " + cached.getWidth() + "x" + cached.getHeight()
                    );
                }
                callback.onLoaded(cached);
            });
            return;
        }
        if (!(value.startsWith("http://") || value.startsWith("https://"))) {
            FoliaNativePlugin.notePlaybackArtwork(value, "error", "unsupported-cover-url");
            return;
        }
        if (!pendingArtworkUrls.add(value)) return;
        artworkExecutor.execute(() -> {
            if (!value.equals(currentArtworkUrl)) { pendingArtworkUrls.remove(value); return; }
            Bitmap bitmap = null;
            String failure = "";
            try (Response response = artworkClient.newCall(new Request.Builder()
                .url(value)
                .header("User-Agent", "Mozilla/5.0 (Linux; Android 13; Mobile)")
                .build()).execute()) {
                ResponseBody body = response.body();
                if (response.isSuccessful() && body != null) {
                    try (InputStream input = body.byteStream()) {
                        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                        byte[] buffer = new byte[8192];
                        int read;
                        while ((read = input.read(buffer)) != -1) {
                            if (bytes.size() + read > 8 * 1024 * 1024) throw new java.io.IOException("Artwork exceeds thumbnail download limit");
                            bytes.write(buffer, 0, read);
                        }
                        byte[] encoded = bytes.toByteArray();
                        BitmapFactory.Options options = new BitmapFactory.Options();
                        options.inJustDecodeBounds = true;
                        BitmapFactory.decodeByteArray(encoded, 0, encoded.length, options);
                        options.inSampleSize = PlaybackArtworkSizing.sampleSize(options.outWidth, options.outHeight);
                        options.inJustDecodeBounds = false;
                        bitmap = BitmapFactory.decodeByteArray(encoded, 0, encoded.length, options);
                        if (bitmap != null) {
                            int[] size = PlaybackArtworkSizing.fit(bitmap.getWidth(), bitmap.getHeight());
                            if (size[0] != bitmap.getWidth() || size[1] != bitmap.getHeight()) {
                                Bitmap scaled = Bitmap.createScaledBitmap(bitmap, size[0], size[1], true);
                                if (scaled != bitmap) bitmap.recycle();
                                bitmap = scaled;
                            }
                        }
                    }
                    if (bitmap == null) failure = "decode-failed";
                } else {
                    failure = "http-" + response.code();
                }
            } catch (Exception error) {
                failure = error.getClass().getSimpleName();
            } finally {
                pendingArtworkUrls.remove(value);
            }
            if (bitmap != null) artworkCache.put(value, bitmap);
            Bitmap resolved = bitmap;
            if (resolved != null) {
                mainHandler.post(() -> {
                    if (value.equals(currentArtworkUrl)) {
                        appliedArtworkUrl = value;
                        appliedArtworkBitmap = resolved;
                        FoliaNativePlugin.notePlaybackArtwork(
                            value,
                            "loaded",
                            resolved.getWidth() + "x" + resolved.getHeight()
                        );
                    }
                    callback.onLoaded(resolved);
                });
            } else {
                FoliaNativePlugin.notePlaybackArtwork(value, "error", failure.isEmpty() ? "unknown" : failure);
            }
        });
    }

    private interface ArtworkCallback {
        void onLoaded(Bitmap bitmap);
    }

    /**
     * Keeps the remote-audio proxy alive in the background.
     *
     * Playback pulls the stream through LocalAudioServer, so CPU protection remains while
     * playing to avoid interruptions when the screen is off. Only pre-Android-10 devices need the legacy
     * normal Wi-Fi lock; modern Android manages buffered network audio without a low-latency lock.
     */
    private void updatePlaybackLocks(boolean playing) {
        playing=playing&&!io.github.huleixin.tingyu.playback.NativeAudioEngine.isActive(); // Media3 owns its wake policy.
        try {
            if (playing) {
                if (wakeLock != null && !wakeLock.isHeld()) wakeLock.acquire();
                if (wifiLock != null && !wifiLock.isHeld()) wifiLock.acquire();
            } else {
                if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
                if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
            }
            powerDiagnostic = "wake=" + (wakeLock != null && wakeLock.isHeld() ? "held" : "released")
                + " wifi=" + (wifiLock != null && wifiLock.isHeld() ? "held" : "released")
                + " error=none";
        } catch (Exception error) {
            powerDiagnostic = "wake=" + (wakeLock != null && wakeLock.isHeld() ? "held" : "released")
                + " wifi=" + (wifiLock != null && wifiLock.isHeld() ? "held" : "released")
                + " error=" + error.getClass().getSimpleName();
        }
    }

    static String getPowerDiagnostic() {
        return powerDiagnostic;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "听屿播放",
                NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private void emit(String action) {
        FoliaNativePlugin.emitMediaAction(action);
    }

    private void recordServiceLifecycle(String type, String message) {
        CrashDiagnostics.recordText(
            getApplicationContext(),
            "service-lifecycle",
            "service",
            type,
            message,
            "FoliaPlaybackService"
        );
    }

    /**
     * C1/C2 的统一采样点：一个时点的「会话到底在发布什么」。
     *
     * 三个调用时机对应三种提问：
     * <ul>
     *   <li>{@code transition} / {@code publish}：原生自动切歌、或 JS 推来一次新元数据；</li>
     *   <li>{@code tick}：锁屏持续播放期间（10s 一次，走 routine 泳道，只留最近 40 条）；</li>
     *   <li>返回前台后 JS 会强制推一次，于是又落一条 {@code publish}，与 tick 直接可比。</li>
     * </ul>
     *
     * 一行里同时有 position/duration/durationSource/state/speed 和歌词四层的前三层
     * （取到没有 = lyricState、缓存里几条 = lyricCached、多久之前写的 = lyricPublishAgeMs）。
     * 第四层「系统端真的显示了吗」在进程外，无法在这里观测，报告里只能写边界。
     */
    private void noteSessionSample(String trigger) {
        try {
            com.getcapacitor.JSObject tag = io.github.huleixin.tingyu.playback.NativeAudioEngine.currentTrackTag();
            boolean takeover = tag != null && tag.optBoolean("nativeContinuation", false);
            MediaController controller = mediaSession == null ? null : mediaSession.getController();
            PlaybackState published = controller == null ? null : controller.getPlaybackState();
            io.github.huleixin.tingyu.playback.PlaybackDiagnostics.note("session-sample",
                new com.getcapacitor.JSObject()
                    .put("trigger", trigger)
                    .put("song", io.github.huleixin.tingyu.playback.PlaybackDiagnostics.anonKey(cachedSongKey))
                    .put("positionMs", cachedPositionMs)
                    .put("durationMs", cachedDurationMs)
                    .put("durationSource", cachedDurationSource)
                    .put("playing", cachedPlaying)
                    .put("state", published == null ? -1 : published.getState())
                    .put("speed", published == null ? 0f : published.getPlaybackSpeed())
                    .put("lyricState", ColorOsLyricBridge.stateOf(cachedSongKey))
                    .put("lyricCached", ColorOsLyricBridge.cachedCount())
                    .put("lyricPublishAgeMs", ColorOsLyricBridge.lastPublishAgeMs())
                    // 第四层证据之外的会话侧读数：直接从已发布的 MediaMetadata 读回 lyricInfo。
                    // 「Bridge ready 但灵动岛不显示」时，这一位区分是会话侧丢了（len=-1）
                    // 还是会话侧完好、问题在系统消费端。
                    .put("sessionLyricLen", readSessionLyricLen())
                    // 灵动岛歌词「亮屏有、锁屏无」类问题需要这一位来分组归因。
                    .put("locked", ((android.app.KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE))
                        .isKeyguardLocked())
                    .put("takeover", takeover));
        } catch (Throwable ignored) {
            // 诊断永远不能影响播放。
        }
    }

    /** 会话侧 lyricInfo 读数：-2 = 读不到会话，-1 = metadata 里没有该字段，≥0 = 内容长度。 */
    private int readSessionLyricLen() {
        try {
            MediaController controller = mediaSession == null ? null : mediaSession.getController();
            MediaMetadata published = controller == null ? null : controller.getMetadata();
            if (published == null) return -2;
            String info = published.getString(ColorOsLyricBridge.METADATA_KEY_LYRIC_INFO);
            return info == null ? -1 : info.length();
        } catch (Throwable error) {
            return -2;
        }
    }

    /** 每首歌只跑一次的会话侧自检：Bridge 已 ready 而会话却没带上 lyricInfo 时补发一次。 */
    private void ensureLyricPublished() {
        if (mediaSession == null || cachedSongKey == null || cachedSongKey.isEmpty()) return;
        if (cachedSongKey.equals(lyricSelfHealDoneFor)) return;
        lyricSelfHealDoneFor = cachedSongKey;
        try {
            boolean bridgeReady = "ready".equals(ColorOsLyricBridge.stateOf(cachedSongKey));
            int sessionLen = readSessionLyricLen();
            if (bridgeReady && sessionLen < 0) {
                io.github.huleixin.tingyu.playback.PlaybackDiagnostics.note("lyric-self-heal",
                    new com.getcapacitor.JSObject()
                        .put("song", io.github.huleixin.tingyu.playback.PlaybackDiagnostics.anonKey(cachedSongKey))
                        .put("sessionLyricLen", sessionLen));
                publishMetadata(appliedArtworkBitmap);
            }
        } catch (Throwable ignored) {
            // 自愈失败不能影响播放状态发布。
        }
    }

    /**
     * 只在播放状态或曲目真的变了、或距上次记录已满 {@link #SERVICE_START_RECORD_INTERVAL_MS}
     * 时记一条 `service-start`。推送本身仍然每次都处理，只是不再每次都写诊断。
     */
    private void recordServiceStartIfNoteworthy() {
        long now = SystemClock.elapsedRealtime();
        boolean stateChanged = cachedPlaying != lastServiceStartPlaying
            || !cachedSongKey.equals(lastServiceStartSongKey);
        if (!stateChanged && now - lastServiceStartRecordAt < SERVICE_START_RECORD_INTERVAL_MS) {
            return;
        }
        lastServiceStartRecordAt = now;
        lastServiceStartPlaying = cachedPlaying;
        lastServiceStartSongKey = cachedSongKey;
        recordServiceLifecycle("service-start", "playing=" + cachedPlaying);
    }

    private void recordServiceHeartbeat() {
        try {
            JSONObject payload = new JSONObject();
            payload.put("at", System.currentTimeMillis());
            payload.put("playing", lastPlaying);
            payload.put("wakeLock", wakeLock != null && wakeLock.isHeld() ? "held" : "released");
            payload.put("wifiLock", wifiLock != null && wifiLock.isHeld() ? "held" : "released");
            payload.put("foreground", true);
            CrashDiagnostics.recordServiceHeartbeat(getApplicationContext(), payload.toString());
        } catch (Exception ignored) {
            // A missed heartbeat is harmless; the next one is 10 seconds away.
        }
    }

    @Override
    public void onDestroy() {
        // Recorded before the engine is released so the trail keeps the last song and
        // position; releaseIfPresent then writes its own engine-release entry.
        io.github.huleixin.tingyu.playback.PlaybackDiagnostics.note("service-destroy",
            new com.getcapacitor.JSObject()
                .put("lastSong", io.github.huleixin.tingyu.playback.PlaybackDiagnostics.anonKey(cachedSongKey))
                .put("positionMs", cachedPositionMs).put("playing", cachedPlaying));
        if (activeService == this) activeService = null;
        running = false;
        io.github.huleixin.tingyu.playback.NativeAudioEngine.releaseIfPresent();
        recordServiceLifecycle("service-destroy", "Foreground playback service destroyed");
        mainHandler.removeCallbacks(serviceHeartbeatRunnable);
        updatePlaybackLocks(false);
        RearLyricsCoordinator.get(this).stopped();
        currentArtworkUrl = "";
        artworkClient.dispatcher().cancelAll();
        artworkExecutor.shutdownNow();
        artworkCache.evictAll();
        // No callback was ever registered; the controller was only a read-back handle.
        selfController = null;
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
        }
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
