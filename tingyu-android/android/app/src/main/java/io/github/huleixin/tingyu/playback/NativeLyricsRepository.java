package io.github.huleixin.tingyu.playback;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

import okhttp3.HttpUrl;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/NativeLyricsRepository.java
/**
 * 原生歌词仓库：磁盘缓存 + LRCLIB 兜底取词。
 *
 * <p>为什么是 LRCLIB 而不是各音源私有接口：
 * <ul>
 *   <li>QQ 的歌词是 QRC（加密 + 解混淆），整条解密/翻译链在 JS 里，搬到原生等于重写一套音源协议；</li>
 *   <li>洛雪脚本只有 `musicUrl` 是约定接口，歌词接口是脚本私有实现，没有可移植的契约；</li>
 *   <li>LRCLIB 是公开 API（无需 key，有明确的 UA 与限流要求，CORS 开放），返回的 syncedLyrics 就是标准
 *       LRC，能直接进现有 ColorOS 时间轴。</li>
 * </ul>
 *
 * <p>遵守对方的实现要求：请求带标识性 User-Agent；429 时不重试、直接放弃本轮（并记录
 * `rate-limited`），绝不忽略 `Retry-After` 继续打；同一首歌只取一次，串行调用。
 *
 * <p>缓存分成三种结论，必须分开存：`ok`（有时间轴）、`none`（服务端明确没有这首歌的词，
 * 带 TTL，过期后允许再问）、以及**不落盘**的失败（超时/断网/429）—— 一次断网不等于这首歌没词。
 */
public final class NativeLyricsRepository {

    private static final String TAG = "NativeLyricsRepository";
    /** LRCLIB 文档要求客户端自报身份；不写就会被按「generic client」限流。 */
    private static final String USER_AGENT = "Tingyu/1.3.50 (+https://github.com/huleixin/tingyu)";
    private static final String HOST = "https://lrclib.net";
    private static final long NEGATIVE_TTL_MS = 3L * 24L * 60L * 60L * 1000L;
    private static final int MAX_CACHE_FILES = 240;

    public enum Status {
        /** 磁盘缓存命中（有时间轴）。 */
        CACHE_HIT,
        /** 本次联网取到并落盘。 */
        FETCHED,
        /** 服务端明确表示没有这首歌的同步歌词；允许写负缓存。 */
        NOT_FOUND,
        /** 429 / 限流：本轮放弃，不写负缓存。 */
        RATE_LIMITED,
        /** 超时、断网、5xx：可重试的失败，不写负缓存。 */
        NETWORK,
        /** 连身份都不够（没有歌名），没法问。 */
        NO_IDENTITY
    }

    public static final class Result {
        public final Status status;
        public final String json;
        public final boolean hasTranslation;
        public final String source;
        public final int httpStatus;
        public final String attempt;
        public final int candidateCount;
        public final int score;
        public final int durationDeltaMs;

        Result(Status status, String json, boolean hasTranslation, String source, int httpStatus,
               String attempt, int candidateCount, int score, int durationDeltaMs) {
            this.status = status;
            this.json = json;
            this.hasTranslation = hasTranslation;
            this.source = source;
            this.httpStatus = httpStatus;
            this.attempt = attempt;
            this.candidateCount = candidateCount;
            this.score = score;
            this.durationDeltaMs = durationDeltaMs;
        }

        public boolean hasTimeline() {
            return json != null && !json.isEmpty();
        }
    }

    private static volatile NativeLyricsRepository instance;

    public static NativeLyricsRepository get(Context context) {
        NativeLyricsRepository cached = instance;
        if (cached != null) return cached;
        synchronized (NativeLyricsRepository.class) {
            if (instance == null) instance = new NativeLyricsRepository(context);
            return instance;
        }
    }

    private final File dir;
    private final OkHttpClient client;

    private NativeLyricsRepository(Context context) {
        File base = context.getApplicationContext().getFilesDir();
        dir = new File(base, "native-lyrics");
        // 目录创建失败不该影响播放：缓存不可用时退化成「每次都联网」。
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        client = new OkHttpClient.Builder()
                .connectTimeout(8, TimeUnit.SECONDS)
                .readTimeout(10, TimeUnit.SECONDS)
                .callTimeout(14, TimeUnit.SECONDS)
                .retryOnConnectionFailure(true)
                .build();
    }

    /** 只查本地（不联网）。命中返回可发布的 payload，否则 null。 */
    public Result readCache(String songKey) {
        JSONObject record = readRecord(songKey);
        if (record == null) return null;
        String status = record.optString("status");
        if ("ok".equals(status)) {
            String json = record.optString("json", "");
            if (json.isEmpty()) return null;
            return new Result(Status.CACHE_HIT, json, record.optBoolean("hasTranslation", false),
                    record.optString("source", "cache"), 0, "cache", 0,
                    record.optInt("score", 0), record.optInt("durationDeltaMs", -1));
        }
        if ("none".equals(status)) {
            long age = System.currentTimeMillis() - record.optLong("at", 0L);
            if (age >= 0 && age < NEGATIVE_TTL_MS) {
                return new Result(Status.NOT_FOUND, null, false, "cache", 0, "cache", 0, 0, -1);
            }
        }
        return null;
    }

    /** 阻塞调用，必须在后台线程执行。 */
    public Result load(SongInfo info, int generation) {
        return load(info, generation, null, null);
    }

    /**
     * 带预算与失效判定的取词（阻塞，后台线程）。
     *
     * <p>四条网络链串行时，一首歌最坏要 4×14s；而调度器一次要准备「当前曲 + 后两首」。
     * 不加约束时队列会一路落后于播放位置，几首之后**每首歌在播放期间都拿不到词**，
     * 只有用户打开 App 让前台链路一次性补齐 —— 这正是「播放几首后歌词消失」的供给端成因。
     *
     * <p>所以每跨过一条链之前都要过两道闸：{@code stillWanted}（队列已经走过去了就别再问）
     * 与 {@code budget}（超时就放弃）。放弃返回 {@link Status#NETWORK}，
     * 属于「这次没取到」，**绝不**写负缓存 —— 下一次换歌/重试还能再问。
     *
     * @param budget      可为 null（老调用方：无预算限制）
     * @param stillWanted 可为 null（无失效判定）
     */
    public Result load(SongInfo info, int generation, LyricFetchBudget budget,
                       java.util.function.BooleanSupplier stillWanted) {
        if (info == null || info.songKey.isEmpty()) return new Result(Status.NO_IDENTITY, null, false, "", 0, "none", 0, 0, -1);
        Result cached = readCache(info.songKey);
        if (cached != null) return cached;
        if (info.title == null || info.title.trim().isEmpty()) {
            return new Result(Status.NO_IDENTITY, null, false, "", 0, "none", 0, 0, -1);
        }

        // 1) 精准取：LRCLIB 的 /api/get 只在时长匹配（±2s）时才返回，正好就是我们要的防错词行为。
        Attempt attempt = requestGet(info);
        if (attempt.result.status == Status.RATE_LIMITED) return attempt.result;
        if (attempt.result.hasTimeline()) return persist(info, attempt.result);

        // 2) 搜索兜底：/api/get 404 不代表库里没有，可能只是时长或专辑名对不上。
        if (!mayContinue(budget, stillWanted, "search")) return aborted("search", attempt.result);
        Attempt search = requestSearch(info);
        if (search.result.status == Status.RATE_LIMITED) return search.result;
        if (search.result.hasTimeline()) return persist(info, search.result);

        // 3) 国内可达性兜底：LRCLIB 在部分网络下不可达或没有中文曲库，酷狗的公开歌词接口
        //    在同样的曲目上通常能命中。只用**歌名 + 时长（±2s）**判定，宁可判无也不拿错版本。
        if (!mayContinue(budget, stillWanted, "kugou")) return aborted("kugou", search.result);
        Attempt kugou = requestKugou(info);
        if (kugou.result.hasTimeline()) return persist(info, kugou.result);
        if (kugou.result.status == Status.RATE_LIMITED) return kugou.result;

        if (search.result.status == Status.NOT_FOUND && kugou.result.status == Status.NOT_FOUND) {
            // 两个来源都明确说没有 = 这首歌确实没有同步歌词。只有这种结论才允许写负缓存。
            Result negative = new Result(Status.NOT_FOUND, null, false, "all-sources", 404,
                    "search", search.result.candidateCount, 0, -1);
            writeRecord(info.songKey, "none", null, false, "all-sources", 0, -1);
            return negative;
        }
        // 网络失败/超时：不要写负缓存，下一次换歌或重试还能再问。
        return search.result.status == Status.NOT_FOUND ? kugou.result : search.result;
    }

    /** 预算与失效两道闸；两条都通过才允许继续走下一条链。 */
    private static boolean mayContinue(LyricFetchBudget budget,
                                       java.util.function.BooleanSupplier stillWanted,
                                       String stage) {
        if (stillWanted != null) {
            boolean wanted;
            try {
                wanted = stillWanted.getAsBoolean();
            } catch (Throwable error) {
                wanted = false;
            }
            if (!wanted) return false;
        }
        if (budget != null && budget.expired(android.os.SystemClock.elapsedRealtime())) return false;
        return true;
    }

    /** 中途放弃：结论是「这次没取到」（可重试），不是「没有词」。 */
    private static Result aborted(String stage, Result fallback) {
        Result base = fallback == null ? null : fallback;
        int http = base == null ? -1 : base.httpStatus;
        int candidates = base == null ? 0 : base.candidateCount;
        return new Result(Status.NETWORK, null, false, "aborted", http, stage + "-aborted",
                candidates, 0, -1);
    }

    /**
     * 删掉某一首的**负**记录（「服务端明确无词」）。
     *
     * <p>只有负记录该删：它记录的是「当时那两个公开源没这首歌」，而舞台/统一仓库之后
     * 可能已经确认了完整时间轴。留着它，日后重播会被判成无词，背屏也会拿到 0 行。
     * 正记录（status=ok）保留 —— 那是真的时间轴。
     */
    public boolean forgetNegative(String songKey) {
        if (songKey == null || songKey.isEmpty()) return false;
        JSONObject record = readRecord(songKey);
        if (record == null) return false;
        if ("ok".equals(record.optString("status"))) return false;
        File file = fileFor(songKey);
        //noinspection ResultOfMethodCallIgnored
        return file.delete();
    }

    // ---- LRCLIB ----

    private static final class Attempt {
        final Result result;

        Attempt(Result result) {
            this.result = result;
        }
    }

    private Attempt requestGet(SongInfo info) {
        HttpUrl.Builder url = base("api/get")
                .addQueryParameter("track_name", info.title)
                .addQueryParameter("artist_name", info.artist == null ? "" : info.artist);
        if (info.album != null && !info.album.isEmpty()) url.addQueryParameter("album_name", info.album);
        long seconds = Math.round(info.durationMs / 1000.0d);
        if (seconds > 0 && seconds <= 3600) url.addQueryParameter("duration", String.valueOf(seconds));

        try (Response response = execute(url.build())) {
            int code = response.code();
            String body = body(response);
            if (code == 429) return new Attempt(networkStatus(Status.RATE_LIMITED, code, "get"));
            if (code == 404) {
                return new Attempt(new Result(Status.NOT_FOUND, null, false, "lrclib", 404, "get", 0, 0, -1));
            }
            if (!response.isSuccessful() || body == null) {
                return new Attempt(networkStatus(Status.NETWORK, code, "get"));
            }
            JSONObject record = new JSONObject(body);
            List<LyricMatch.Candidate> candidates = new ArrayList<>(1);
            candidates.add(toCandidate(record));
            return new Attempt(scoreAndBuild(info, candidates, code, "get"));
        } catch (Exception error) {
            return new Attempt(networkStatus(Status.NETWORK, -1, "get"));
        }
    }

    private Attempt requestSearch(SongInfo info) {
        HttpUrl.Builder url = base("api/search");
        String title = info.title;
        String artist = info.artist == null ? "" : info.artist;
        if (!artist.isEmpty()) {
            url.addQueryParameter("track_name", title).addQueryParameter("artist_name", artist);
        } else {
            url.addQueryParameter("q", title);
        }
        try (Response response = execute(url.build())) {
            int code = response.code();
            String body = body(response);
            if (code == 429) return new Attempt(networkStatus(Status.RATE_LIMITED, code, "search"));
            if (!response.isSuccessful() || body == null) {
                return new Attempt(networkStatus(Status.NETWORK, code, "search"));
            }
            JSONArray array = new JSONArray(body);
            List<LyricMatch.Candidate> candidates = new ArrayList<>(array.length());
            for (int i = 0; i < array.length(); i++) {
                JSONObject record = array.optJSONObject(i);
                if (record != null) candidates.add(toCandidate(record));
            }
            return new Attempt(scoreAndBuild(info, candidates, code, "search"));
        } catch (Exception error) {
            return new Attempt(networkStatus(Status.NETWORK, -1, "search"));
        }
    }

    /**
     * 酷狗公开歌词接口（搜索 → 下载 base64 的 LRC）。
     *
     * <p>作为 LRCLIB 的**可达性兜底**：国内网络下 LRCLIB 可能连不上或没有中文曲库。
     * 只用于「精确匹配」——关键词只给歌名（带上歌手名反而会返回空列表，这是该接口的实际行为），
     * 判定则要求歌名一致 + 时长差 ≤ 2 秒；两者缺一就不采用。
     */
    private Attempt requestKugou(SongInfo info) {
        HttpUrl.Builder search = base("https://krcs.kugou.com/search")
                .addQueryParameter("ver", "1")
                .addQueryParameter("man", "yes")
                .addQueryParameter("client", "mobi")
                .addQueryParameter("keyword", info.title);
        if (info.durationMs > 0L) {
            search.addQueryParameter("duration", String.valueOf(info.durationMs));
        }
        long chosenId = 0L;
        String accessKey = "";
        try (Response response = execute(search.build())) {
            int code = response.code();
            String body = body(response);
            if (code == 429) return new Attempt(networkStatus(Status.RATE_LIMITED, code, "kugou-search"));
            if (!response.isSuccessful() || body == null) {
                return new Attempt(networkStatus(Status.NETWORK, code, "kugou-search"));
            }
            JSONObject root = new JSONObject(body);
            JSONArray candidates = root.optJSONArray("candidates");
            if (candidates == null || candidates.length() == 0) {
                return new Attempt(new Result(Status.NOT_FOUND, null, false, "kugou", code,
                        "kugou-search", 0, 0, -1));
            }
            List<LyricMatch.Candidate> mapped = new ArrayList<>(candidates.length());
            for (int i = 0; i < candidates.length(); i++) {
                JSONObject item = candidates.optJSONObject(i);
                if (item == null) continue;
                mapped.add(new LyricMatch.Candidate(item.optLong("id", 0L),
                        item.optString("song", ""), item.optString("singer", ""), "",
                        item.optLong("duration", 0L), false, null, null));
            }
            // 歌手名在这个接口里经常是错的（有时直接填歌名），所以只用歌名 + 时长判定；
            // 时长缺失时分数不足以通过门槛，等于拒绝。
            LyricMatch.Score best = LyricMatch.pick(mapped, info.title, "", "", info.durationMs);
            if (best == null) {
                return new Attempt(new Result(Status.NOT_FOUND, null, false, "kugou", code,
                        "kugou-search", mapped.size(), 0, -1));
            }
            chosenId = best.candidate.id;
            accessKey = findAccessKey(candidates, chosenId);
            if (chosenId == 0L || accessKey.isEmpty()) {
                return new Attempt(new Result(Status.NOT_FOUND, null, false, "kugou", code,
                        "kugou-search", mapped.size(), best.score, best.durationDeltaMs));
            }
            return downloadKugou(info, chosenId, accessKey, best, mapped.size(), code);
        } catch (Exception error) {
            return new Attempt(networkStatus(Status.NETWORK, -1, "kugou-search"));
        }
    }

    private Attempt downloadKugou(SongInfo info, long id, String accessKey,
                                  LyricMatch.Score best, int candidateCount, int searchCode) {
        HttpUrl url = base("https://krcs.kugou.com/download")
                .addQueryParameter("ver", "1")
                .addQueryParameter("client", "mobi")
                .addQueryParameter("id", String.valueOf(id))
                .addQueryParameter("accesskey", accessKey)
                .addQueryParameter("fmt", "lrc")
                .addQueryParameter("charset", "utf8")
                .build();
        try (Response response = execute(url)) {
            int code = response.code();
            String body = body(response);
            if (!response.isSuccessful() || body == null) {
                return new Attempt(networkStatus(Status.NETWORK, code, "kugou-download"));
            }
            JSONObject root = new JSONObject(body);
            String encoded = root.optString("content", "");
            if (encoded.isEmpty()) {
                return new Attempt(new Result(Status.NOT_FOUND, null, false, "kugou", code,
                        "kugou-download", candidateCount, best.score, best.durationDeltaMs));
            }
            String lrc = new String(android.util.Base64.decode(encoded, android.util.Base64.DEFAULT),
                    StandardCharsets.UTF_8);
            List<LrcParser.Line> lines = LrcParser.parse(lrc);
            LyricInfoPayload.Result payload = LyricInfoPayload.build(
                    info.title, info.artist, info.album, info.songId(), info.durationMs, lines,
                    info.generation, "native-kugou");
            if (payload == null) {
                return new Attempt(new Result(Status.NOT_FOUND, null, false, "kugou-unparsable", code,
                        "kugou-download", candidateCount, best.score, best.durationDeltaMs));
            }
            return new Attempt(new Result(Status.FETCHED, payload.json, payload.hasTranslation,
                    "kugou", searchCode, "kugou", candidateCount, best.score, best.durationDeltaMs));
        } catch (Exception error) {
            return new Attempt(networkStatus(Status.NETWORK, -1, "kugou-download"));
        }
    }

    private static String findAccessKey(JSONArray candidates, long id) {
        for (int i = 0; i < candidates.length(); i++) {
            JSONObject item = candidates.optJSONObject(i);
            if (item != null && item.optLong("id", 0L) == id) return item.optString("accesskey", "");
        }
        return "";
    }

    private Result scoreAndBuild(SongInfo info, List<LyricMatch.Candidate> candidates, int code, String attempt) {        LyricMatch.Score best = LyricMatch.pick(candidates, info.title, info.artist, info.album, info.durationMs);
        if (best == null) {
            return new Result(Status.NOT_FOUND, null, false, "lrclib", code, attempt, candidates.size(), 0, -1);
        }
        if (best.candidate.instrumental) {
            // 纯音乐：明确「没有词」，不要拿空时间轴冒充等待。
            return new Result(Status.NOT_FOUND, null, false, "lrclib-instrumental", code, attempt,
                    candidates.size(), best.score, best.durationDeltaMs);
        }
        String synced = best.candidate.syncedLyrics;
        if (synced == null || synced.trim().isEmpty()) {
            // 只有 plainLyrics 时无法构建时间轴：按「没有同步歌词」处理，不伪造逐行时间。
            return new Result(Status.NOT_FOUND, null, false, "lrclib-plain-only", code, attempt,
                    candidates.size(), best.score, best.durationDeltaMs);
        }
        List<LrcParser.Line> lines = LrcParser.parse(synced);
        LyricInfoPayload.Result payload = LyricInfoPayload.build(
                info.title, info.artist, info.album, info.songId(), info.durationMs, lines,
                info.generation, "native-lrclib");
        if (payload == null) {
            return new Result(Status.NOT_FOUND, null, false, "lrclib-unparsable", code, attempt,
                    candidates.size(), best.score, best.durationDeltaMs);
        }
        return new Result(Status.FETCHED, payload.json, payload.hasTranslation, "lrclib", code, attempt,
                candidates.size(), best.score, best.durationDeltaMs);
    }

    private static LyricMatch.Candidate toCandidate(JSONObject record) {
        long durationSeconds = record.optLong("duration", 0L);
        return new LyricMatch.Candidate(
                record.optLong("id", 0L),
                record.optString("trackName", record.optString("name", "")),
                record.optString("artistName", ""),
                record.optString("albumName", ""),
                durationSeconds > 0 ? durationSeconds * 1000L : 0L,
                record.optBoolean("instrumental", false),
                record.optString("syncedLyrics", null),
                record.optString("plainLyrics", null));
    }

    private static Result networkStatus(Status status, int code, String attempt) {
        return new Result(status, null, false, "lrclib", code, attempt, 0, 0, -1);
    }

    private HttpUrl.Builder base(String path) {
        HttpUrl parsed = HttpUrl.parse(path.startsWith("http") ? path : HOST + "/" + path);
        // 解析失败只可能是常量写错；返回一个必定失败但合法的 URL，比在请求线程上抛 NPE 好。
        if (parsed == null) parsed = HttpUrl.parse(HOST + "/api/search");
        return parsed.newBuilder();
    }

    private Response execute(HttpUrl url) throws IOException {
        Request request = new Request.Builder()
                .url(url)
                .header("User-Agent", USER_AGENT)
                .header("Accept", "application/json")
                .build();
        return client.newCall(request).execute();
    }

    private static String body(Response response) throws IOException {
        ResponseBody body = response.body();
        if (body == null) return null;
        // 响应体很小（单条或 20 条以内），一次性读完不会造成内存问题。
        return body.string();
    }

    // ---- 磁盘缓存 ----

    private Result persist(SongInfo info, Result result) {
        writeRecord(info.songKey, "ok", result.json, result.hasTranslation, result.source,
                result.score, result.durationDeltaMs);
        prune();
        return result;
    }

    /**
     * 整文件读入。用 {@code FileInputStream} 而不是 {@code java.nio.file.Files}：
     * 后者在 Android 上是 API 26 才有的类，本项目 minSdk 24，在老机器上第一次读缓存
     * 就会 {@code NoClassDefFoundError} 闪退。
     */
    private static byte[] readAllBytes(File file) throws IOException {
        try (java.io.FileInputStream stream = new java.io.FileInputStream(file)) {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream((int) Math.max(64, file.length()));
            byte[] buffer = new byte[8192];
            int read;
            while ((read = stream.read(buffer)) != -1) out.write(buffer, 0, read);
            return out.toByteArray();
        }
    }

    private JSONObject readRecord(String songKey) {
        File file = fileFor(songKey);
        if (!file.isFile()) return null;
        try {
            byte[] bytes = readAllBytes(file);
            JSONObject record = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
            // 身份校验：缓存文件名是 key 的哈希，内容里再核一次，避免哈希碰撞或文件被替换后串词。
            if (!songKey.equals(record.optString("songKey"))) return null;
            return record;
        } catch (Exception error) {
            return null;
        }
    }

    private void writeRecord(String songKey, String status, String json, boolean hasTranslation,
                             String source, int score, int durationDeltaMs) {
        JSONObject record = new JSONObject();
        try {
            record.put("v", 1);
            record.put("songKey", songKey);
            record.put("status", status);
            if (json != null) record.put("json", json);
            record.put("hasTranslation", hasTranslation);
            record.put("source", source);
            record.put("at", System.currentTimeMillis());
            record.put("score", score);
            record.put("durationDeltaMs", durationDeltaMs);
        } catch (Exception error) {
            return;
        }
        File target = fileFor(songKey);
        File temp = new File(target.getParentFile(), target.getName() + ".tmp");
        try (FileOutputStream stream = new FileOutputStream(temp)) {
            stream.write(record.toString().getBytes(StandardCharsets.UTF_8));
            stream.flush();
        } catch (Exception error) {
            //noinspection ResultOfMethodCallIgnored
            temp.delete();
            return;
        }
        if (!temp.renameTo(target)) {
            //noinspection ResultOfMethodCallIgnored
            temp.delete();
        }
    }

    private File fileFor(String songKey) {
        return new File(dir, sha1(songKey) + ".json");
    }

    /** 有界：超过条数按修改时间从旧到新删。歌词是整首时间轴，几十 KB 一首，240 条足够覆盖长连播。 */
    private void prune() {
        File[] files = dir.listFiles();
        if (files == null || files.length <= MAX_CACHE_FILES) return;
        Arrays.sort(files, Comparator.comparingLong(File::lastModified));
        int excess = files.length - MAX_CACHE_FILES;
        for (int i = 0; i < excess && i < files.length; i++) {
            //noinspection ResultOfMethodCallIgnored
            files[i].delete();
        }
    }

    static String sha1(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-1");
            byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) builder.append(String.format(Locale.US, "%02x", b));
            return builder.toString();
        } catch (Exception error) {
            return Integer.toHexString(value.hashCode());
        }
    }
}
