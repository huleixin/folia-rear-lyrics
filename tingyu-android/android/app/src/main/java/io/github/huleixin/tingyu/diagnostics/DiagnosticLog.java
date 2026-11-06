package io.github.huleixin.tingyu.diagnostics;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.HashMap;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

// android/app/src/main/java/io/github/huleixin/tingyu/diagnostics/DiagnosticLog.java
/**
 * 统一诊断事件流（原生侧）。
 *
 * <p>与 {@link io.github.huleixin.tingyu.CrashDiagnostics} 的分工：那个类负责「崩溃当下」的
 * 最后证据（未捕获异常栈、ApplicationExitInfo），这个类负责「崩溃之前发生了什么」的连续事件流。
 * 两者都保留，导出时合并成 {@code errors.txt} + {@code events.jsonl}。
 *
 * <p>写入模型：内存环形 + 单线程有界队列。主线程只做一次 JSON 组装和一次入队，
 * 绝不碰磁盘；队列满时丢弃最旧的一条 —— 诊断系统自己不能变成卡顿源。
 * 级别为 {@code error}/{@code fatal} 的事件绕过队列同步落盘（频率天然很低），
 * 保证「日志写完就崩」这种情形下最后一条也在。
 *
 * <p>隐私：只接受标量字段，敏感键直接丢弃，字符串截断 240 字符。调用方不应传入
 * 歌名、歌词正文、URL、token、cookie 或任何用户输入。
 */
public final class DiagnosticLog {
    private static final String PREFS = "tingyu_diagnostic_log";
    private static final String KEY_EPOCH = "epoch";
    private static final String DIR_NAME = "diagnostics";

    /** 单会话文件上限。超过就重开一个新文件，旧内容交给环形与上一会话文件兜底。 */
    private static final long MAX_FILE_BYTES = 512L * 1024L;
    private static final int MAX_SESSIONS_ON_DISK = 3;
    private static final long MAX_TOTAL_BYTES = 2L * 1024L * 1024L;
    private static final int THROTTLE_MS = 1_000;

    private static volatile Context appContext;
    private static volatile boolean installed;
    // 会话 ID 在类加载时就定下来：播放轨迹等模块可能在 install() 之前就写入事件，
    // 那时也应该有归属，而不是一串 s="" 的孤儿记录。
    private static volatile String sessionId = newSessionId();
    private static volatile long sessionStartedAt = System.currentTimeMillis();
    private static volatile int epoch;
    private static final DiagnosticRing RING = new DiagnosticRing(DiagnosticRing.DEFAULT_CAPACITY);
    private static final HashMap<String, Long> LAST_AT = new HashMap<>();
    private static final Object WRITE_LOCK = new Object();

    private static BufferedWriter writer;
    private static File writerFile;
    private static long writerBytes;
    private static int writerPending;
    private static long writerLastFlushAt;
    /** 单会话内文件到顶后的分卷序号：events-<sid>.jsonl → events-<sid>-1.jsonl → … */
    private static int writerIndex;

    private static final ExecutorService WRITER = new ThreadPoolExecutor(
        1, 1, 0L, TimeUnit.MILLISECONDS,
        new ArrayBlockingQueue<>(512),
        task -> {
            Thread thread = new Thread(task, "tingyu-diagnostic-log");
            thread.setDaemon(true);
            return thread;
        },
        new ThreadPoolExecutor.DiscardOldestPolicy()
    );

    private DiagnosticLog() {}

    // ---------------------------------------------------------------- 生命周期

    public static void install(Context context) {
        if (context == null) return;
        Context app = context.getApplicationContext();
        appContext = app == null ? context : app;
        if (installed) return;
        installed = true;
        sessionStartedAt = System.currentTimeMillis();
        if (sessionId == null || sessionId.isEmpty()) sessionId = newSessionId();
        try {
            SharedPreferences preferences = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            epoch = preferences.getInt(KEY_EPOCH, 0) + 1;
            preferences.edit().putInt(KEY_EPOCH, epoch).apply();
        } catch (Exception ignored) {
            epoch = 1;
        }
        // 清理放到写线程：安装发生在 MainActivity.onCreate 里，启动路径不能碰磁盘目录。
        WRITER.execute(DiagnosticLog::pruneOldSessions);
        // 正常退出时把缓冲刷完；进程被 kill 时不会执行，所以 error/fatal 走同步写。
        try {
            Runtime.getRuntime().addShutdownHook(new Thread(DiagnosticLog::closeWriter, "tingyu-diagnostic-flush"));
        } catch (Exception ignored) {
            // 已经关机的进程里注册 hook 会抛，忽略。
        }
        event("lifecycle", "info", "session-start", null);
    }

    public static String sessionId() {
        return sessionId;
    }

    public static long sessionStartedAt() {
        return sessionStartedAt;
    }

    public static int epoch() {
        return epoch;
    }

    public static DiagnosticRing ring() {
        return RING;
    }

    // ---------------------------------------------------------------- 记录

    /** 默认级别 info。 */
    public static void event(String module, String name) {
        event(module, "info", name, null, null);
    }

    public static void event(String module, String level, String name, JSONObject fields) {
        event(module, level, name, null, fields);
    }

    /**
     * 记录一条事件。任何异常都被吞掉：诊断系统不允许成为第二个故障源。
     *
     * @param module lifecycle|nav|ui|playback|audio|source|lyrics|rear|island|lsp|shizuku|webview|js|perf|feedback|storage
     * @param level  debug|info|warn|error|fatal
     * @param name   kebab-case 事件名
     * @param ref    关联 ID（手势、匿名歌曲 key、请求序号），可为 null
     * @param fields 标量字段，可为 null
     */
    public static void event(String module, String level, String name, String ref, JSONObject fields) {
        try {
            if (module == null || name == null) return;
            String safeLevel = normalizeLevel(level);
            if (isThrottled(module, name, safeLevel)) return;
            JSONObject entry = new JSONObject();
            entry.put("t", System.currentTimeMillis());
            entry.put("s", sessionId);
            entry.put("m", DiagnosticFields.limit(module, 24));
            entry.put("l", safeLevel);
            entry.put("e", DiagnosticFields.limit(name, 60));
            if (ref != null && !ref.isEmpty()) entry.put("r", DiagnosticFields.limit(ref, 48));
            JSONObject safeFields = DiagnosticFields.sanitize(fields);
            if (safeFields != null && safeFields.length() > 0) entry.put("f", safeFields);
            String line = entry.toString();
            RING.add(line);
            if ("error".equals(safeLevel) || "fatal".equals(safeLevel)) {
                writeNow(line);
            } else {
                WRITER.execute(() -> writeLine(line));
            }
        } catch (Exception ignored) {
            // 诊断不能变成第二个故障。
        }
    }

    /** 前端批量上报：每行一条已经成型的 JSON，非法行直接丢弃。 */
    public static void ingest(String jsonl) {
        if (jsonl == null || jsonl.isEmpty()) return;
        for (String raw : jsonl.split("\n")) {
            String line = raw == null ? "" : raw.trim();
            if (line.isEmpty() || line.charAt(0) != '{') continue;
            try {
                JSONObject parsed = new JSONObject(line);
                if (!parsed.has("t") || !parsed.has("e")) continue;
                if (!parsed.has("s")) parsed.put("s", sessionId);
                if (!parsed.has("m")) parsed.put("m", "js");
                if (!parsed.has("l")) parsed.put("l", "info");
                String normalized = parsed.toString();
                RING.add(normalized);
                WRITER.execute(() -> writeLine(normalized));
            } catch (Exception ignored) {
                // 单行坏了不影响其它行。
            }
        }
    }

    // ---------------------------------------------------------------- 读取

    /** 当前内存环（最旧在前，换行分隔）。 */
    public static String snapshotJsonl() {
        return RING.jsonl();
    }

    /** 上一个会话仍在磁盘上的事件（崩溃前的现场），最多 maxChars 字符。 */
    public static String previousSessionJsonl(int maxChars) {
        File dir = directory();
        if (dir == null) return "";
        File[] files = dir.listFiles((fileDir, fileName) -> fileName.startsWith("events-")
            && fileName.endsWith(".jsonl"));
        if (files == null || files.length == 0) return "";
        File newest = null;
        String currentPrefix = "events-" + sessionId;
        for (File file : files) {
            // 当前会话的所有分卷都要排除：它们已经在内存环 / snapshotJsonl 里。
            if (sessionId != null && !sessionId.isEmpty() && file.getName().startsWith(currentPrefix)) continue;
            if (newest == null || file.lastModified() > newest.lastModified()) newest = file;
        }
        if (newest == null) return "";
        return readTail(newest, maxChars);
    }

    public static long sessionFileBytes() {
        File dir = directory();
        if (dir == null) return 0L;
        long total = 0L;
        File[] files = dir.listFiles();
        if (files == null) return 0L;
        for (File file : files) {
            if (file.isFile()) total += file.length();
        }
        return total;
    }

    public static void clearAll() {
        RING.clear();
        synchronized (WRITE_LOCK) {
            closeWriter();
        }
        File dir = directory();
        File[] files = dir == null ? null : dir.listFiles();
        if (files != null) {
            for (File file : files) {
                if (file.isFile()) {
                    //noinspection ResultOfMethodCallIgnored
                    file.delete();
                }
            }
        }
        event("storage", "info", "cleared", null);
    }

    // ---------------------------------------------------------------- 写入实现

    private static void writeNow(String line) {
        // 崩溃路径：直接同步写，不走队列，确保最后一条落盘。
        synchronized (WRITE_LOCK) {
            try {
                BufferedWriter target = ensureWriter();
                if (target == null) return;
                target.write(line);
                target.write('\n');
                target.flush();
                writerPending = 0;
                writerLastFlushAt = System.currentTimeMillis();
            } catch (Exception ignored) {
                closeWriter();
            }
        }
    }

    private static void writeLine(String line) {
        synchronized (WRITE_LOCK) {
            try {
                BufferedWriter target = ensureWriter();
                if (target == null) return;
                target.write(line);
                target.write('\n');
                writerBytes += line.length() + 1;
                writerPending += 1;
                long now = System.currentTimeMillis();
                if (writerPending >= 64 || now - writerLastFlushAt >= 2_000) {
                    target.flush();
                    writerPending = 0;
                    writerLastFlushAt = now;
                }
                if (writerBytes >= MAX_FILE_BYTES) {
                    // 单会话文件到顶：换下一个分卷继续写，旧分卷交给上一会话/清理逻辑。
                    closeWriter();
                    writerIndex += 1;
                }
            } catch (Exception ignored) {
                closeWriter();
            }
        }
    }

    private static BufferedWriter ensureWriter() throws Exception {
        if (writer != null) return writer;
        File dir = directory();
        if (dir == null) return null;
        if (!dir.exists() && !dir.mkdirs()) return null;
        String base = "events-" + sessionId;
        String name = writerIndex == 0 ? base + ".jsonl" : base + "-" + writerIndex + ".jsonl";
        File target = new File(dir, name);
        writer = new BufferedWriter(new OutputStreamWriter(
            new FileOutputStream(target, true), StandardCharsets.UTF_8));
        writerFile = target;
        writerBytes = target.length();
        writerPending = 0;
        writerLastFlushAt = System.currentTimeMillis();
        return writer;
    }

    private static void closeWriter() {
        try {
            if (writer != null) writer.flush();
        } catch (Exception ignored) {
        }
        try {
            if (writer != null) writer.close();
        } catch (Exception ignored) {
        }
        writer = null;
        writerFile = null;
        writerPending = 0;
    }

    // ---------------------------------------------------------------- 工具

    private static File directory() {
        Context context = appContext;
        if (context == null) return null;
        File base = context.getFilesDir();
        if (base == null) return null;
        return new File(base, DIR_NAME);
    }

    /** 保留最近 {@link #MAX_SESSIONS_ON_DISK} 个会话；总量超限从最旧删起。 */
    private static void pruneOldSessions() {
        File dir = directory();
        if (dir == null) return;
        File[] files = dir.listFiles();
        if (files == null || files.length == 0) return;
        java.util.Arrays.sort(files, (left, right) -> Long.compare(right.lastModified(), left.lastModified()));
        long total = 0L;
        for (int index = 0; index < files.length; index += 1) {
            File file = files[index];
            if (!file.isFile()) continue;
            total += file.length();
            if (index >= MAX_SESSIONS_ON_DISK || total > MAX_TOTAL_BYTES) {
                //noinspection ResultOfMethodCallIgnored
                file.delete();
            }
        }
    }

    private static String newSessionId() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 8);
    }

    private static String normalizeLevel(String level) {
        if (level == null) return "info";
        switch (level) {
            case "debug":
            case "info":
            case "warn":
            case "error":
            case "fatal":
                return level;
            default:
                return "info";
        }
    }

    /** 同一 (module,event) 一秒一条；warn 及以上不节流。 */
    private static boolean isThrottled(String module, String name, String level) {
        if (!"debug".equals(level) && !"info".equals(level)) return false;
        String key = module + ':' + name;
        long now = System.currentTimeMillis();
        synchronized (LAST_AT) {
            Long last = LAST_AT.get(key);
            if (last != null && now - last < THROTTLE_MS) return true;
            if (LAST_AT.size() > 512) LAST_AT.clear();
            LAST_AT.put(key, now);
        }
        return false;
    }

    private static String readTail(File file, int maxChars) {
        if (file == null || !file.isFile() || maxChars <= 0) return "";
        try (BufferedReader reader = new BufferedReader(
            new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8))) {
            StringBuilder out = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                out.append(line).append('\n');
                if (out.length() > maxChars) out.delete(0, out.length() - maxChars);
            }
            return out.toString();
        } catch (Exception ignored) {
            return "";
        }
    }

    /** 供打包时写 metadata：本地时间 ISO，便于人读。 */
    public static String isoNow() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.US);
        format.setTimeZone(TimeZone.getDefault());
        return format.format(new java.util.Date());
    }
}
