package io.github.huleixin.tingyu;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.content.Intent;
import android.net.wifi.WifiManager;
import android.media.MediaMetadata;
import android.media.AudioAttributes;
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
    private volatile long lastServiceStartRecordAt = 0L;
    private volatile boolean lastServiceStartPlaying = false;
    private volatile String lastServiceStartSongKey = "";
    private final Runnable serviceHeartbeatRunnable = new Runnable() {
        @Override
        public void run() {
            recordServiceHeartbeat();
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
        long duration = tag.optLong("duration", 0L);
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
        PlaybackSessionClock state = PlaybackSessionClock.resolve(cachedPlaying, cachedPositionMs, nativeClock);
        long now = SystemClock.elapsedRealtime();
        long projected = PlaybackPositionClock.at(cachedPlaying, cachedPositionMs, cachedPositionUpdatedAt, now, cachedDurationMs);
        if (!state.shouldPublish(cachedPlaying, projected, forcePosition)) return;
        boolean changed = cachedPlaying != state.playing;
        cachedPlaying = state.playing; cachedPositionMs = state.position;
        cachedPositionUpdatedAt = now; lastPlaying = cachedPlaying;
        mediaSession.setPlaybackState(buildPlaybackState(cachedPlaying, cachedPositionMs, cachedSongKey));
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
        for(String key:new String[]{"title","artist","album","coverUrl","songKey"})intent.putExtra(key,track.optString(key));
        intent.putExtra("duration",track.optLong("duration")).putExtra("position",0L)
            .putExtra("capturedAtMs",System.currentTimeMillis()).putExtra("playing",playing);
        context.startService(intent);
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
        // A sleeping UI can still publish the preceding item after Media3 advanced.
        // Native prepare/transition publishes its own metadata, so stale UI cannot replace it.
        long[] nativeClock = io.github.huleixin.tingyu.playback.NativeAudioEngine.mediaClock(songKey);
        if(io.github.huleixin.tingyu.playback.NativeAudioEngine.isActive() && nativeClock==null)return START_STICKY;
        PlaybackSessionClock state = PlaybackSessionClock.resolve(intent.getBooleanExtra("playing", false),
            intent.getLongExtra("position", 0L), nativeClock);
        boolean playing = state.playing;
        long duration = intent.getLongExtra("duration", 0L);
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
        if(songChanged)lastSystemSeekAt=0L;
        if (progressOnly) {
            // Android extrapolates position from PlaybackState's timestamp. A clock refresh must
            // not restart foreground publication or rebuild artwork/queue/notification metadata.
            mediaSession.setPlaybackState(buildPlaybackState(cachedPlaying, cachedPositionMs, cachedSongKey));
            refreshArtwork();
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
        return START_STICKY;
    }

    private void refreshArtwork() {
        if (currentArtworkUrl.isEmpty() || currentArtworkUrl.equals(appliedArtworkUrl)) return;
        long now = SystemClock.elapsedRealtime();
        if (currentArtworkUrl.equals(artworkAttemptUrl) && now - artworkAttemptAt < 30_000L) return;
        artworkAttemptUrl = currentArtworkUrl;
        artworkAttemptAt = now;
        String requestedCover = currentArtworkUrl;
        loadArtwork(requestedCover, bitmap -> {
            if (!requestedCover.equals(currentArtworkUrl)) return;
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
        ColorOsLyricBridge.attach(metadata, songKey);
        noteLyricPublication(songKey);
        return metadata.build();
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
        String state = ColorOsLyricBridge.stateOf(songKey);
        String identity = state + "|" + io.github.huleixin.tingyu.playback.PlaybackDiagnostics.anonKey(songKey);
        if (identity.equals(lastLyricState)) return;
        lastLyricState = identity;
        io.github.huleixin.tingyu.playback.PlaybackDiagnostics.note("lyric-metadata", new com.getcapacitor.JSObject()
            .put("state", state)
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
