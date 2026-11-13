package io.github.huleixin.tingyu.playback;

import android.content.Context;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/UnifiedLyricsStore.java
/**
 * 统一歌词仓库：三端（前台歌词舞台 / 背屏渲染器 / 灵动岛）共用的唯一持久歌词数据源。
 *
 * <p>背景：修复前有三条互相独立的数据链——前台舞台走 IndexedDB+平台取词（QQ/网易等，
 * 带逐字/翻译），后台 {@link SongInfoLoader} 走 LRCLIB/酷狗逐行 LRC。两条链各自向
 * {@code ColorOsLyricBridge.timelines} 写入，且「前台恢复时无条件覆盖」导致打开主界面
 * 就换歌词版本（甚至简繁互跳）。现在所有写者先把版本落进这里，读者也从这里拿：
 * <ul>
 *   <li><b>写</b>：前台每次 publish（舞台确认版 / 用户手动选定版）落库；
 *       原生后台取到时间轴也落库（层级更低，由 {@link UnifiedLyricPolicy} 裁决）；</li>
 *   <li><b>读</b>：{@link SongInfoLoader} 取词前先查这里——舞台确认过的版本就是
 *       后台播放用的版本，打开主界面不再切换；</li>
 *   <li><b>持久</b>：整首 lyricInfo JSON 落盘（filesDir/unified-lyrics），
 *       MainActivity 与 WebView 不在时照常可读；</li>
 *   <li><b>有界</b>：内存 LRU 上限 {@value #MAX_RECORDS} 首，磁盘按 32 MiB 管理，用户选定记录不淘汰；</li>
 *   <li><b>失败保护</b>：仓库只存「拿到了时间轴」或「确认无词」两种结论；
 *       网络失败/限流永远不会在这里留下会顶掉有效歌词的东西。</li>
 * </ul>
 *
 * <p>记录字段：来源（sourceId）、版本哈希（lyricsHash，sha1 前 16 位）、确认层级
 * （confirmedBy + userChoice）、简繁规则（variantRule）、递增 revision（revision）。
 * 诊断日志只打这些元数据，不打歌词正文。
 */
public final class UnifiedLyricsStore {

    static final int MAX_RECORDS = 64;

    public static final class Record {
        public final String songKey;
        /** "ok"（有时间轴）/ "none"（确认无词）。 */
        public final String status;
        /** 完整 lyricInfo JSON；status=none 时为 null。 */
        public final String json;
        public final boolean hasTranslation;
        public final boolean hasWordByWord;
        /** 来源标识：stage / native-lrclib / native-kugou / stage-override … */
        public final String sourceId;
        /** 歌词版本哈希（sha1(json) 前 16 位）。 */
        public final String lyricsHash;
        /** 谁确认的：stage（前台舞台）/ native（后台取词）。 */
        public final String confirmedBy;
        /** 用户在软件内手动选定（歌词匹配/导入）——最高层级。 */
        public final boolean userChoice;
        /** 写入这条记录时生效的简繁规则。 */
        public final String variantRule;
        /** 同一首歌内递增，供诊断判断版本更新方向。 */
        public final int revision;
        public final long at;
        /**
         * 这份 json 是否确认是<b>原始时间轴</b>（用户偏移尚未烘焙，交付时应用一次）。
         * 1.3.67 之前落盘的记录可能已经烘焙过偏移且没有记录用量 —— 标 false，
         * 交付点跳过烘焙（旧偏移定格但绝不叠加）；该版本被正常发布/取词刷新后自动回正。
         */
        public final boolean offsetKnown;
        /** Optional lossless UI model, attached only to this exact authoritative payload hash. */
        public volatile String renderModel;

        Record(String songKey, String status, String json, boolean hasTranslation,
               boolean hasWordByWord, String sourceId, String lyricsHash, String confirmedBy,
               boolean userChoice, String variantRule, int revision, long at) {
            this(songKey, status, json, hasTranslation, hasWordByWord, sourceId, lyricsHash,
                    confirmedBy, userChoice, variantRule, revision, at, true);
        }

        Record(String songKey, String status, String json, boolean hasTranslation,
               boolean hasWordByWord, String sourceId, String lyricsHash, String confirmedBy,
               boolean userChoice, String variantRule, int revision, long at, boolean offsetKnown) {
            this.songKey = songKey;
            this.status = status;
            this.json = json;
            this.hasTranslation = hasTranslation;
            this.hasWordByWord = hasWordByWord;
            this.sourceId = sourceId;
            this.lyricsHash = lyricsHash;
            this.confirmedBy = confirmedBy;
            this.userChoice = userChoice;
            this.variantRule = variantRule;
            this.revision = revision;
            this.at = at;
            this.offsetKnown = offsetKnown;
        }

        public boolean hasTimeline() {
            return "ok".equals(status) && json != null && !json.isEmpty();
        }
    }

    private static volatile UnifiedLyricsStore instance;

    public static UnifiedLyricsStore get(Context context) {
        UnifiedLyricsStore cached = instance;
        if (cached != null) return cached;
        synchronized (UnifiedLyricsStore.class) {
            if (instance == null) {
                instance = new UnifiedLyricsStore(new File(
                        context.getApplicationContext().getFilesDir(), "unified-lyrics"));
            }
            return instance;
        }
    }

    private int writesSincePrune;
    private final File dir;
    /** 进程内读者（Compose 极简播放页）的变更通知：只在**接受**了一次写入后触发。 */
    public interface Observer { void onLyricsRecordChanged(String songKey); }
    private final java.util.concurrent.CopyOnWriteArrayList<Observer> observers =
            new java.util.concurrent.CopyOnWriteArrayList<>();
    public void observe(Observer observer) {
        if (observer != null && !observers.contains(observer)) observers.add(observer);
    }
    public void unobserve(Observer observer) { observers.remove(observer); }
    private void notifyRecordChanged(String songKey) {
        for (Observer observer : observers) {
            try { observer.onLyricsRecordChanged(songKey); } catch (Throwable ignored) { /* 读者异常不影响仓库 */ }
        }
    }
    private volatile java.util.Set<String> protectedNames = java.util.Collections.emptySet();
    /** 写入串行化：单线程执行器保证同首歌的两次写不交叉。 */
    private final ExecutorService writer = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "unified-lyrics");
        thread.setDaemon(true);
        return thread;
    });
    /** 小内存缓存：读侧（取词线程/主线程诊断）不必每次碰盘。 */
    private final Map<String, Record> memory = new LinkedHashMap<>(8, 0.75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<String, Record> eldest) {
            return size() > MAX_RECORDS;
        }
    };

    /** 生产走 {@link #get(Context)}；测试直接给目录。 */
    UnifiedLyricsStore(File dir) {
        this.dir = dir;
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
    }

    /** 只查本地。无记录返回 null；status=none 的记录原样返回（调用方据此走原生取词链）。 */
    public synchronized Record get(String songKey) {
        if (songKey == null || songKey.isEmpty()) return null;
        Record cached = memory.get(songKey);
        if (cached != null && !obsoleteBackupNone(cached) && !("none".equals(cached.status) && System.currentTimeMillis() - cached.at > 3L*86400000L)) return cached;
        return readDisk(songKey);
    }

    /** Migration: preserve manual/platform no-lyrics decisions, discard old backup-only negatives. */
    private static boolean obsoleteBackupNone(Record record) {
        return "none".equals(record.status) && !record.userChoice && "native-none".equals(record.sourceId);
    }

    /**
     * 提交一个新版本，交给 {@link UnifiedLyricPolicy} 裁决。异步入盘，返回是否被接受。
     * 调用方可以在任何线程；拒绝时不产生任何副作用。
     */
    public synchronized boolean put(String songKey, String status, String json, boolean hasTranslation,
                       boolean hasWordByWord, String sourceId, String confirmedBy,
                       boolean userChoice, String variantRule) {
        if (songKey == null || songKey.isEmpty()) return false;
        Record old = get(songKey);
        String hash = json == null ? "" : shortHash(json);
        UnifiedLyricPolicy.Decision decision = UnifiedLyricPolicy.decide(
                old == null ? "ok" : old.status,
                old == null ? null : old.userChoice,
                old == null ? null : old.confirmedBy,
                old == null ? null : old.lyricsHash,
                status, userChoice, confirmedBy, hash);
        PlaybackDiagnostics.note("unified-lyrics", new com.getcapacitor.JSObject()
                .put("song", PlaybackDiagnostics.anonKey(songKey))
                .put("op", "put")
                .put("decision", decision.reason)
                .put("sourceId", sourceId == null ? "" : sourceId)
                .put("tier", UnifiedLyricPolicy.tierOf(userChoice, confirmedBy))
                .put("hash", hash));
        if (!decision.accept && !(old!=null&&!old.offsetKnown&&"identical-hash".equals(decision.reason))) return false;
        final Record next = new Record(songKey, status, json, hasTranslation, hasWordByWord,
                sourceId == null ? "" : sourceId, hash,
                ("platform-cache".equals(sourceId)&&!userChoice)?"platform":confirmedBy == null ? "native" : confirmedBy, userChoice,
                variantRule == null ? "off" : variantRule,
                (old == null ? 0 : old.revision) + 1, System.currentTimeMillis());
        synchronized (this) {
            memory.put(songKey, next);
        }
        final String key = songKey;
        writer.execute(() -> writeDisk(key, next));
        notifyRecordChanged(songKey);
        return true;
    }

    /**
     * 用户在软件内手动选定歌词（匹配/导入）后调用：把这首歌的现有记录升级为
     * userChoice 层级；没有记录时留空 —— 下一次舞台发布自会带完整内容落库。
     */
    public synchronized boolean markUserChoice(String songKey, String variantRule) {
        if (songKey == null || songKey.isEmpty()) return false;
        Record old = get(songKey);
        if (old == null) {
            PlaybackDiagnostics.note("unified-lyrics", new com.getcapacitor.JSObject()
                    .put("song", PlaybackDiagnostics.anonKey(songKey))
                    .put("op", "mark-user-choice")
                    .put("decision", "no-record"));
            return false;
        }
        if (old.userChoice) return false;
        Record next = new Record(old.songKey, old.status, old.json, old.hasTranslation,
                old.hasWordByWord, old.sourceId, old.lyricsHash, old.confirmedBy, true,
                variantRule == null ? old.variantRule : variantRule, old.revision + 1,
                System.currentTimeMillis(), old.offsetKnown);
        next.renderModel = old.renderModel;
        synchronized (this) {
            memory.put(songKey, next);
        }
        writer.execute(() -> writeDisk(songKey, next));
        notifyRecordChanged(songKey);
        return true;
    }

    /** 测试钩子：等待挂起的落盘任务完成。 */
    void flushForTest() {
        try {
            writer.submit(() -> { }).get();
        } catch (Exception ignored) {
            // 测试辅助：中断即放弃等待。
        }
    }

    private Record readDisk(String songKey) {
        File file = fileFor(songKey);
        if (!file.isFile()) return null;
        try {
            byte[] bytes = readAllBytes(file);
            JSONObject record = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
            if (!songKey.equals(record.optString("songKey"))) return null;
            // v:1（1.3.67 之前）的记录可能已经烘焙过偏移且没有记录用量：offsetKnown=false，
            // 交付点跳过烘焙 —— 宁可旧偏移定格，也绝不二次叠加。v:2 起仓库只存原始时间轴。
            int version = record.optInt("v", 1);
            Record parsed = new Record(
                    songKey,
                    record.optString("status", "ok"),
                    record.has("json") ? record.optString("json", "") : null,
                    record.optBoolean("hasTranslation", false),
                    record.optBoolean("hasWordByWord", false),
                    record.optString("sourceId", ""),
                    record.has("json")?shortHash(record.optString("json")):"",
                    ("platform-cache".equals(record.optString("sourceId"))&&!record.optBoolean("userChoice"))?"platform":record.optString("confirmedBy", "native"),
                    record.optBoolean("userChoice", false),
                    record.optString("variantRule", "off"),
                    record.optInt("revision", 0),
                    record.optLong("at", 0L),
                    version >= 2 && record.optBoolean("offsetKnown", false));
            if (obsoleteBackupNone(parsed) || "none".equals(parsed.status) && System.currentTimeMillis() - parsed.at > 3L*86400000L) return null;
            parsed.renderModel = record.optString("renderModel", null);
            synchronized (this) {
                memory.put(songKey, parsed);
            }
            return parsed;
        } catch (Exception error) {
            return null;
        }
    }

    private void writeDisk(String songKey, Record record) {
        JSONObject recordJson = new JSONObject();
        try {
            recordJson.put("v", 2);
            recordJson.put("songKey", songKey);
            recordJson.put("status", record.status);
            if (record.json != null) recordJson.put("json", record.json);
            recordJson.put("hasTranslation", record.hasTranslation);
            recordJson.put("hasWordByWord", record.hasWordByWord);
            recordJson.put("sourceId", record.sourceId);
            recordJson.put("lyricsHash", record.lyricsHash);
            recordJson.put("confirmedBy", record.confirmedBy);
            recordJson.put("userChoice", record.userChoice);
            recordJson.put("variantRule", record.variantRule);
            recordJson.put("revision", record.revision);
            recordJson.put("at", record.at);
            recordJson.put("offsetKnown", record.offsetKnown);
            if (record.renderModel != null) recordJson.put("renderModel", record.renderModel);
        } catch (Exception error) {
            return;
        }
        File target = fileFor(songKey);
        File temp = new File(target.getParentFile(), target.getName() + ".tmp");
        try (FileOutputStream stream = new FileOutputStream(temp)) {
            stream.write(recordJson.toString().getBytes(StandardCharsets.UTF_8));
            stream.flush();stream.getFD().sync();
        } catch (Exception error) {
            //noinspection ResultOfMethodCallIgnored
            temp.delete();
            return;
        }
        // File.renameTo 在 Windows 上有偶发失败（杀毒/索引器短暂持锁），统一走 Files.move：
        // 带 REPLACE_EXISTING 覆盖旧版本；偶发失败重试一次；再失败只丢缓存，不留垃圾。
        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                java.nio.file.Files.move(temp.toPath(), target.toPath(),
                        java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                if (++writesSincePrune % 8 == 0) ResourceDiskBudget.prune(dir, ResourceCachePolicy.LYRICS_BYTES,
                    f -> protectedNames.contains(f.getName()) || manualFile(f));
                return;
            } catch (java.nio.file.NoSuchFileException gone) {
                return;   // 进程被杀 / 目录被清：缓存缺一条不致命。
            } catch (Exception error) {
                if (attempt == 0) {
                    try { Thread.sleep(50L); } catch (InterruptedException ignored) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            }
        }
        //noinspection ResultOfMethodCallIgnored
        temp.delete();
    }

    public synchronized void attachRenderModel(String songKey, String payload, String model) {
        if (model == null || model.length() > 2_000_000) return;
        Record record = get(songKey);
        if (record == null || !record.offsetKnown || !record.hasTimeline() || !shortHash(record.json).equals(shortHash(payload))) return;
        record.renderModel = model;
        writer.execute(() -> writeDisk(songKey, record));
    }
    public void protect(java.util.List<SongInfo> songs) {
        java.util.Set<String> next = new java.util.HashSet<>();
        for (SongInfo song : songs) next.add(fileFor(song.songKey).getName());
        protectedNames = next;
    }
    public synchronized boolean hasDiskRecord(String key){return fileFor(key).isFile();}
    public int diskRecordCount() { String[] files=dir.list((d,n)->n.endsWith(".json")); return files==null?0:files.length; }
    public long diskBytes() { return ResourceDiskBudget.bytes(dir); }
    public void clearDownloadable() {
        writer.execute(() -> {
            synchronized (this) {
                memory.entrySet().removeIf(e -> !e.getValue().userChoice && !protectedNames.contains(fileFor(e.getKey()).getName()));
                File[] files = dir.listFiles((d, n) -> n.endsWith(".json"));
                if (files != null) for (File f : files) if (!protectedNames.contains(f.getName()) && !manualFile(f)) f.delete();
            }
        });
    }
    private boolean manualFile(File f) {
        try { return new JSONObject(new String(readAllBytes(f), StandardCharsets.UTF_8)).optBoolean("userChoice", false); }
        catch (Exception error) { return true; }
    }

    private File fileFor(String songKey) {
        return new File(dir, NativeLyricsRepository.sha1(songKey) + ".json");
    }

    static String shortHash(String json) {
        try{
            org.json.JSONObject raw=new org.json.JSONObject(json),stable=new org.json.JSONObject();
            java.util.List<String> keys=new java.util.ArrayList<>();raw.keys().forEachRemaining(keys::add);java.util.Collections.sort(keys);
            for(String key:keys)if(!key.equals("sessionGeneration")&&!key.equals("capturedAtMs"))stable.put(key,raw.get(key));
            return NativeLyricsRepository.sha1(stable.toString()).substring(0,16);
        }catch(Exception error){return NativeLyricsRepository.sha1(json).substring(0,16);}
    }

    private static byte[] readAllBytes(File file) throws java.io.IOException {
        try (java.io.FileInputStream stream = new java.io.FileInputStream(file)) {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream(
                    (int) Math.max(64, file.length()));
            byte[] buffer = new byte[8192];
            int read;
            while ((read = stream.read(buffer)) != -1) out.write(buffer, 0, read);
            return out.toByteArray();
        }
    }
}
