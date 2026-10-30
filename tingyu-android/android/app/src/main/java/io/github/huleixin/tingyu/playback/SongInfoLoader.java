package io.github.huleixin.tingyu.playback;

import android.content.Context;
import android.graphics.Bitmap;
import android.os.SystemClock;

import com.getcapacitor.JSObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import io.github.huleixin.tingyu.coloros.ColorOsLyricBridge;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/SongInfoLoader.java
/**
 * 后台歌曲信息调度器：当前曲 + 后面 2 首的歌词与封面，全部由原生服务自己取。
 *
 * <p>它替代的是「等 WebView 醒来补词」这条路径。之前那条路在真机上的实际行为是：
 * 第一首正常（前台已经把词/封面推进来了）→ Activity 停止 → Media3 自己切第二首 →
 * 原生只能留白 → 用户打开 App 才恢复。所以这里的执行者必须是播放服务所在进程，
 * 不唤醒 WebView、不建第二个播放器、不动 MediaSession 结构。
 *
 * <h3>三条硬约束</h3>
 * <ol>
 *   <li><b>身份</b>：一切都以 Media3 真实 MediaItem 的 songKey 为准，不读 UI 状态；</li>
 *   <li><b>代次</b>：每个异步结果写回前核对「代次未换代 + 仍是当前曲」，
 *       上一首迟到的结果不能覆盖下一首；</li>
 *   <li><b>有界</b>：串行取词、并发 2 张封面、单次超时、失败不自动高频重试
 *       （只在下一次换歌或队列同步时重来）。</li>
 * </ol>
 *
 * <p>歌词优先用**已在原生内存里的时间轴**（ColorOsLyricBridge ready），其次磁盘缓存，
 * 最后才联网。封面优先内存/磁盘，其次队列项自带的真实地址。
 */
public final class SongInfoLoader {

    /** 当前曲之后提前准备的曲目数（含当前曲共 3 首）。 */
    private static final int AHEAD_COUNT = 2;
    /** 同一首歌的失败结论在本进程内的冷却时间：避免每次心跳都重试同一张坏图。 */
    private static final long RETRY_COOLDOWN_MS = 90_000L;

    private static volatile SongInfoLoader instance;

    public static SongInfoLoader get() {
        return instance;
    }

    public static synchronized SongInfoLoader attach(Context context) {
        if (instance == null) instance = new SongInfoLoader(context);
        return instance;
    }

    private final Context context;
    private final NativeLyricsRepository lyrics;
    private final NativeArtworkRepository artwork;
    private final ExecutorService lyricsExecutor;
    private final ExecutorService artworkExecutor;
    /** 这一轮真正需要的 songKey（当前曲 + 后面两首），任务执行前会再核一次。 */
    private final Set<String> wanted = Collections.synchronizedSet(new LinkedHashSet<String>());
    private final Set<String> lyricsInFlight = ConcurrentHashMap.newKeySet();
    private final Set<String> artworkInFlight = ConcurrentHashMap.newKeySet();
    private final Map<String, Long> lyricsCooldown = new ConcurrentHashMap<>();
    private final Map<String, Long> artworkCooldown = new ConcurrentHashMap<>();
    /** 播放代次：只有真实换曲才递增，重发同一首（seek、队列同步）不递增。 */
    private final AtomicInteger generation = new AtomicInteger(1);
    private volatile String currentKey = "";
    private volatile long lastScheduledAtElapsed = 0L;

    private SongInfoLoader(Context context) {
        this.context = context.getApplicationContext();
        this.lyrics = NativeLyricsRepository.get(this.context);
        this.artwork = NativeArtworkRepository.get(this.context);
        this.lyricsExecutor = Executors.newSingleThreadExecutor(runnable -> {
            Thread thread = new Thread(runnable, "tingyu-lyrics");
            thread.setDaemon(true);
            return thread;
        });
        // 封面两条线程：换歌瞬间既要当前曲也要下一首，串行会让锁屏出现「先旧图再新图」。
        this.artworkExecutor = Executors.newFixedThreadPool(2, runnable -> {
            Thread thread = new Thread(runnable, "tingyu-artwork");
            thread.setDaemon(true);
            return thread;
        });
    }

    public int generation() {
        return generation.get();
    }

    /**
     * 换歌入口。只有真正换了曲目才递增代次，然后重排「需要准备的那几首」。
     *
     * @param current   Media3 当前的 MediaItem
     * @param upcoming  之后 2 首（按播放顺序，随机播放时也已经是真实顺序）
     */
    public void onTrackChanged(SongInfo current, List<SongInfo> upcoming) {
        if (current == null) return;
        boolean changed = !current.songKey.equals(currentKey);
        if (changed) {
            currentKey = current.songKey;
            generation.incrementAndGet();
        }
        int gen = generation.get();
        List<SongInfo> targets = new ArrayList<>();
        targets.add(current.withGeneration(gen));
        if (upcoming != null) {
            for (int i = 0; i < Math.min(AHEAD_COUNT, upcoming.size()); i++) {
                SongInfo info = upcoming.get(i);
                if (info != null && !info.songKey.isEmpty()) targets.add(info.withGeneration(gen));
            }
        }
        synchronized (wanted) {
            wanted.clear();
            for (SongInfo info : targets) wanted.add(info.songKey);
        }
        lastScheduledAtElapsed = SystemClock.elapsedRealtime();
        boolean foreground = activityAlive();
        PlaybackDiagnostics.note("songinfo-schedule", new JSObject()
                .put("song", PlaybackDiagnostics.anonKey(current.songKey))
                .put("generation", gen)
                .put("targets", targets.size())
                .put("changed", changed)
                .put("foreground", foreground)
                .put("lyric", ColorOsLyricBridge.stateOf(current.songKey))
                .put("artwork", current.artworkUrl.isEmpty() ? "uri-missing" : "has-uri"));
        for (SongInfo info : targets) {
            submitLyrics(info);
            submitArtwork(info);
        }
    }

    /** 队列同步/服务重建时补一次：不换代次，只保证当前窗口的都已经被安排过。 */
    public void refresh(SongInfo current, List<SongInfo> upcoming) {
        if (current == null) return;
        int gen = generation.get();
        submitLyrics(current.withGeneration(gen));
        if (upcoming != null) {
            for (int i = 0; i < Math.min(AHEAD_COUNT, upcoming.size()); i++) {
                if (upcoming.get(i) != null) submitLyrics(upcoming.get(i).withGeneration(gen));
            }
        }
    }

    public boolean isCurrent(String songKey) {
        return songKey != null && songKey.equals(NativeAudioEngine.currentKey());
    }

    // ---- 歌词 ----

    private void submitLyrics(SongInfo info) {
        if (info == null || info.songKey.isEmpty()) return;
        // 已经有时间轴（前台 JS 推过 / 上一轮原生取到过）就不用再取：任务里会检查并发。
        if ("ready".equals(ColorOsLyricBridge.stateOf(info.songKey))) {
            PlaybackDiagnostics.note("lyrics-cache-hit", describe("bridge", info, true)
                    .put("state", "ready"));
            return;
        }
        Long until = lyricsCooldown.get(info.songKey);
        if (until != null && SystemClock.elapsedRealtime() < until) {
            PlaybackDiagnostics.note("lyrics-cache-hit", describe("cooldown", info, false)
                    .put("state", ColorOsLyricBridge.stateOf(info.songKey)));
            return;
        }
        if (!lyricsInFlight.add(info.songKey)) return;
        lyricsExecutor.execute(() -> {
            try {
                runLyrics(info);
            } finally {
                lyricsInFlight.remove(info.songKey);
            }
        });
    }

    private void runLyrics(SongInfo info) {
        if (!isWanted(info.songKey)) {
            PlaybackDiagnostics.note("lyrics-failure", describe("not-wanted", info, false)
                    .put("reason", "dropped"));
            return;
        }
        long startedAt = SystemClock.elapsedRealtime();
        PlaybackDiagnostics.note("lyrics-request", describe("native", info, isCurrent(info.songKey))
                .put("title", info.title.isEmpty() ? "missing" : "present")
                .put("durationMs", info.durationMs)
                .put("foreground", activityAlive()));
        NativeLyricsRepository.Result result;
        try {
            result = lyrics.load(info, info.generation);
        } catch (Throwable error) {
            result = null;
        }
        long elapsed = SystemClock.elapsedRealtime() - startedAt;
        if (result == null) {
            PlaybackDiagnostics.note("lyrics-failure", describe("exception", info, isCurrent(info.songKey))
                    .put("reason", "exception").put("elapsedMs", elapsed));
            lyricsCooldown.put(info.songKey, SystemClock.elapsedRealtime() + RETRY_COOLDOWN_MS);
            return;
        }
        JSObject detail = describe(result.attempt, info, isCurrent(info.songKey))
                .put("status", result.status.name())
                .put("provider", result.source)
                .put("http", result.httpStatus)
                .put("candidates", result.candidateCount)
                .put("score", result.score)
                .put("durationDeltaMs", result.durationDeltaMs)
                .put("elapsedMs", elapsed)
                .put("foreground", activityAlive());

        if (result.status == NativeLyricsRepository.Status.CACHE_HIT) {
            PlaybackDiagnostics.note("lyrics-cache-hit", detail);
        } else if (result.status == NativeLyricsRepository.Status.FETCHED) {
            PlaybackDiagnostics.note("lyrics-fetch", detail);
        }

        if (result.hasTimeline()) {
            // 前台 WebView 若在这几秒里先答上了（它的词更全：可能带逐字/翻译），不要用我们这份
            // 逐行 LRC 盖掉它。原生只负责「没人答的时候也有词」。
            if ("ready".equals(ColorOsLyricBridge.stateOf(info.songKey))) {
                PlaybackDiagnostics.note("lyrics-published", describe("native", info, isCurrent(info.songKey))
                        .put("wrote", "skipped")
                        .put("matched", isCurrent(info.songKey))
                        .put("reason", "already-ready"));
                return;
            }
            boolean changed = ColorOsLyricBridge.setPending(result.json, result.hasTranslation, info.songKey);
            // 「存进按 key 索引的缓存」与「重建 metadata」是两件事：前者哪怕过期也该做（那首歌
            // 自己的词，之后播到它仍然用得上），后者只能是当前曲。判定集中在纯策略里，便于验证。
            SongInfoPublishPolicy.Decision decision = SongInfoPublishPolicy.forLyrics(
                    result.status.name(), true, isCurrent(info.songKey), info.generation == generation.get());
            PlaybackDiagnostics.note("lyrics-built", describe("native", info, isCurrent(info.songKey))
                    .put("chars", result.json.length())
                    .put("translation", result.hasTranslation)
                    .put("changed", changed)
                    .put("reason", decision.reason));
            publishLyrics(info, result.json, decision.refreshSession);
            return;
        }

        // 没时间轴：区分「服务端明确没有」与「这次没取到」。
        switch (result.status) {
            case NOT_FOUND:
                // 纯音乐/没有同步歌词：明确清空这一首，避免继续显示上一首的词。
                ColorOsLyricBridge.setPending(null, false, info.songKey);
                PlaybackDiagnostics.note("lyrics-failure", detail.put("reason", "none"));
                publishLyrics(info, null, SongInfoPublishPolicy
                        .forLyrics(result.status.name(), false, isCurrent(info.songKey),
                                info.generation == generation.get()).refreshSession);
                break;
            case RATE_LIMITED:
                // 遵守对方限流：本轮不打，等下一次换歌再说。
                lyricsCooldown.put(info.songKey, SystemClock.elapsedRealtime() + 5L * 60_000L);
                PlaybackDiagnostics.note("lyrics-failure", detail.put("reason", "rate-limited"));
                break;
            case NO_IDENTITY:
                lyricsCooldown.put(info.songKey, SystemClock.elapsedRealtime() + 10L * 60_000L);
                PlaybackDiagnostics.note("lyrics-failure", detail.put("reason", "no-identity"));
                break;
            default:
                lyricsCooldown.put(info.songKey, SystemClock.elapsedRealtime() + RETRY_COOLDOWN_MS);
                PlaybackDiagnostics.note("lyrics-failure", detail.put("reason", "network"));
                break;
        }
    }

    // ---- 封面 ----

    private void submitArtwork(SongInfo info) {
        if (info == null || info.songKey.isEmpty()) return;
        Bitmap ready = NativeArtworkRepository.get(context).peek(info.songKey);
        if (ready != null) {
            PlaybackDiagnostics.note("artwork-cache-hit", describe("memory", info, isCurrent(info.songKey))
                    .put("state", "ready"));
            // 提前下好的下一首，在它真的变成当前曲这一刻必须**发布**一次：
            // 只是「缓存里有」而不再发布，锁屏就会停在上一首的封面上。
            publishArtwork(info, ready);
            return;
        }
        if (info.artworkUrl.isEmpty()) {
            PlaybackDiagnostics.note("artwork-uri", describe("queue", info, isCurrent(info.songKey))
                    .put("state", "missing"));
            return;
        }
        Long until = artworkCooldown.get(info.songKey);
        if (until != null && SystemClock.elapsedRealtime() < until) return;
        if (!artworkInFlight.add(info.songKey)) return;
        artworkExecutor.execute(() -> {
            try {
                runArtwork(info);
            } finally {
                artworkInFlight.remove(info.songKey);
            }
        });
    }

    private void runArtwork(SongInfo info) {
        if (!isWanted(info.songKey)) return;
        long startedAt = SystemClock.elapsedRealtime();
        PlaybackDiagnostics.note("artwork-uri", describe("queue", info, isCurrent(info.songKey))
                .put("state", "has-uri"));
        NativeArtworkRepository.Result result = NativeArtworkRepository.get(context)
                .load(info.songKey, info.artworkUrl);
        long elapsed = SystemClock.elapsedRealtime() - startedAt;
        JSObject detail = describe("native", info, isCurrent(info.songKey))
                .put("status", result.status.name())
                .put("http", result.httpStatus)
                .put("bytes", result.bytes)
                .put("elapsedMs", elapsed)
                .put("foreground", activityAlive());

        if (result.status == NativeArtworkRepository.Status.CACHE_HIT) {
            PlaybackDiagnostics.note("artwork-cache-hit", detail);
        } else if (result.bitmap != null) {
            PlaybackDiagnostics.note("artwork-fetch", detail);
            PlaybackDiagnostics.note("artwork-decoded", detail
                    .put("width", result.width).put("height", result.height));
        } else {
            PlaybackDiagnostics.note("artwork-failure", detail);
            if (result.status != NativeArtworkRepository.Status.MISSING_URI) {
                artworkCooldown.put(info.songKey, SystemClock.elapsedRealtime() + RETRY_COOLDOWN_MS);
            }
            return;
        }
        publishArtwork(info, result.bitmap);
    }

    // ---- 发布 ----

    private void publishLyrics(SongInfo info, String json, boolean refreshSession) {
        // 歌词进的是 ColorOsLyricBridge 的按 songKey 索引的时间轴表：写入本身与当前曲无关
        // （下一首的词就该提前待在表里），真正需要「只能是当前曲」的是 metadata 重建。
        boolean applied = refreshSession
                && io.github.huleixin.tingyu.FoliaPlaybackService.applyNativeLyric(info.songKey, json);
        PlaybackDiagnostics.note("lyrics-published", describe("native", info, isCurrent(info.songKey))
                .put("wrote", json == null ? "none" : "timeline")
                .put("matched", isCurrent(info.songKey))
                .put("applied", applied));
    }

    private void publishArtwork(SongInfo info, Bitmap bitmap) {
        if (bitmap == null) return;
        SongInfoPublishPolicy.Decision decision = SongInfoPublishPolicy.forArtwork(
                true, isCurrent(info.songKey), info.generation == generation.get());
        if (!decision.refreshSession) {
            PlaybackDiagnostics.note("artwork-published", describe("native", info, false)
                    .put("matched", false).put("reason", decision.reason));
            return;
        }
        boolean applied = io.github.huleixin.tingyu.FoliaPlaybackService
                .applyNativeArtwork(info.songKey, bitmap);
        PlaybackDiagnostics.note("artwork-published", describe("native", info, true)
                .put("matched", true)
                .put("applied", applied)
                .put("reason", decision.reason)
                .put("foreground", activityAlive()));
    }

    // ---- 小工具 ----

    private boolean isWanted(String songKey) {
        synchronized (wanted) {
            if (wanted.contains(songKey)) return true;
        }
        // 队列前移后「下一首变成当前曲」的那一瞬间，wanted 可能还没刷新：只要它确实是当前曲就照做。
        return isCurrent(songKey);
    }

    private JSObject describe(String source, SongInfo info, boolean matched) {
        return new JSObject()
                .put("song", PlaybackDiagnostics.anonKey(info.songKey))
                .put("mediaItemId", PlaybackDiagnostics.anonKey(info.songKey))
                .put("source", source)
                .put("provider", info.providerId.isEmpty() ? "unknown" : info.providerId)
                .put("generation", info.generation)
                .put("currentGeneration", generation.get())
                .put("matched", matched)
                .put("activityStopped", !activityAlive());
    }

    private static boolean activityAlive() {
        try {
            return PlaybackLifecycle.snapshot().optBoolean("activityAlive", false);
        } catch (Throwable error) {
            return false;
        }
    }

    /** 诊断/测试用：最近一次调度距今多久。 */
    public long msSinceSchedule() {
        return lastScheduledAtElapsed == 0L ? -1L
                : SystemClock.elapsedRealtime() - lastScheduledAtElapsed;
    }
}
