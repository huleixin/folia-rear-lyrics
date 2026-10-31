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
 *   <li><b>有界</b>：LRU 上限 {@value #MAX_RECORDS} 首，淘汰时用户选定与舞台确认版
 *       比原生取词版更晚被淘汰；</li>
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

        Record(String songKey, String status, String json, boolean hasTranslation,
               boolean hasWordByWord, String sourceId, String lyricsHash, String confirmedBy,
               boolean userChoice, String variantRule, int revision, long at) {
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

    private final File dir;
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
        if (cached != null) return cached;
        return readDisk(songKey);
    }

    /**
     * 提交一个新版本，交给 {@link UnifiedLyricPolicy} 裁决。异步入盘，返回是否被接受。
     * 调用方可以在任何线程；拒绝时不产生任何副作用。
     */
    public boolean put(String songKey, String status, String json, boolean hasTranslation,
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
        if (!decision.accept) return false;
        final Record next = new Record(songKey, status, json, hasTranslation, hasWordByWord,
                sourceId == null ? "" : sourceId, hash,
                confirmedBy == null ? "native" : confirmedBy, userChoice,
                variantRule == null ? "off" : variantRule,
                (old == null ? 0 : old.revision) + 1, System.currentTimeMillis());
        synchronized (this) {
            memory.put(songKey, next);
        }
        final String key = songKey;
        writer.execute(() -> writeDisk(key, next));
        return true;
    }

    /**
     * 用户在软件内手动选定歌词（匹配/导入）后调用：把这首歌的现有记录升级为
     * userChoice 层级；没有记录时留空 —— 下一次舞台发布自会带完整内容落库。
     */
    public boolean markUserChoice(String songKey, String variantRule) {
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
                System.currentTimeMillis());
        synchronized (this) {
            memory.put(songKey, next);
        }
        writer.execute(() -> writeDisk(songKey, next));
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
            Record parsed = new Record(
                    songKey,
                    record.optString("status", "ok"),
                    record.has("json") ? record.optString("json", "") : null,
                    record.optBoolean("hasTranslation", false),
                    record.optBoolean("hasWordByWord", false),
                    record.optString("sourceId", ""),
                    record.optString("lyricsHash", ""),
                    record.optString("confirmedBy", "native"),
                    record.optBoolean("userChoice", false),
                    record.optString("variantRule", "off"),
                    record.optInt("revision", 0),
                    record.optLong("at", 0L));
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
            recordJson.put("v", 1);
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
        } catch (Exception error) {
            return;
        }
        File target = fileFor(songKey);
        File temp = new File(target.getParentFile(), target.getName() + ".tmp");
        try (FileOutputStream stream = new FileOutputStream(temp)) {
            stream.write(recordJson.toString().getBytes(StandardCharsets.UTF_8));
            stream.flush();
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

    private File fileFor(String songKey) {
        return new File(dir, NativeLyricsRepository.sha1(songKey) + ".json");
    }

    static String shortHash(String json) {
        return NativeLyricsRepository.sha1(json).substring(0, 16);
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
