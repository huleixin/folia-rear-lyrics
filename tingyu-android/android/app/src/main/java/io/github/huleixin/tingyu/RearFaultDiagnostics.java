package io.github.huleixin.tingyu;

import android.app.KeyguardManager;
import android.content.Context;
import android.os.Handler;
import android.os.SystemClock;
import android.view.Display;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

// android/app/src/main/java/io/github/huleixin/tingyu/RearFaultDiagnostics.java
/**
 * 「背屏故障诊断」的取证记录器。
 *
 * <p>为什么需要它：LSP 与 Shizuku 两条链路的失败在用户侧表现完全一样（背屏不亮），但成因
 * 至少有五种，且只有真机能区分：
 * <ol>
 *   <li>物理面板 OFF（STATE_OFF，电源策略压灭）；</li>
 *   <li>面板进入 DOZE / DOZE_SUSPEND（系统「背屏息屏」开启后的 AOD 状态）；</li>
 *   <li>窗口被 AOD/背屏桌面覆盖（面板亮着，但显示的不是我们）；</li>
 *   <li>窗口被销毁（Activity finish / 任务移除）；</li>
 *   <li>租约失效或从未建立（模块没加载、hook 没命中、lease 过期）。</li>
 * </ol>
 * 只靠一句「背屏不亮」无法区分它们，而分别对应完全不同的修法。所以这里记录的是
 * **状态快照**，不是结论。
 *
 * <p>三个硬要求，直接决定实现形态：
 * <ul>
 *   <li>不依赖主 Activity：写入方是前台服务进程里的 {@link RearLyricsCoordinator}；</li>
 *   <li>覆盖锁屏前后：锁屏跳变时按 {@link #LOCK_OFFSETS_MS} 采样（0 / 5 / 60 秒），解锁再采一次；</li>
 *   <li>可导出：主副本在 SharedPreferences（进程死了也在），同时镜像到
 *       {@code Android/data/<pkg>/files/rear-fault/}，{@code adb pull} 即可取走，不需要打开界面。</li>
 * </ul>
 *
 * <p>记录里不含歌词正文、不含曲名，只保留状态与计数。会话 token 只写哈希前缀。
 */
final class RearFaultDiagnostics {

    /** 锁屏后的采样时点：0 秒（锁屏瞬间）、5 秒（接管通常在这之后发生）、60 秒（租约到期边界）。 */
    static final long[] LOCK_OFFSETS_MS = { 0L, 5_000L, 60_000L };
    /** 上限：约 3 个锁屏周期 × 3 个时点 + 手动采样，够用且不会无限增长。 */
    static final int MAX_ENTRIES = 96;
    /** 镜像目录里保留的最近文件数。 */
    private static final int MAX_MIRROR_FILES = 4;

    private static final String PREFS = "rear_fault";
    private static final String KEY_ENTRIES = "entries";
    private static final String DIR = "rear-fault";

    private static volatile Boolean lastLocked;
    /** 详细状态由协调器提供（它才拿得到后端、租约、Hook 计数）；为空时只记通用字段。 */
    private static volatile java.util.function.Supplier<String> detailSupplier;
    private static final List<Runnable> pending = new ArrayList<>();

    private RearFaultDiagnostics() {}

    static void bind(java.util.function.Supplier<String> supplier) { detailSupplier = supplier; }

    private static String detail() {
        java.util.function.Supplier<String> supplier = detailSupplier;
        try { return supplier == null ? null : supplier.get(); }
        catch (Throwable ignored) { return null; }
    }

    /**
     * 锁屏状态跳变：安排本轮的采样。
     *
     * <p>只在 true/false 真的变化时触发；同一状态重复调用不会重复排期（{@link #checkWindow}
     * 每两秒跑一次，不能每次都排三条）。
     */
    static void onLockChanged(Context context, Handler handler, boolean locked) {
        Boolean previous = lastLocked;
        if (previous != null && previous == locked) return;
        lastLocked = locked;
        for (Runnable runnable : pending) handler.removeCallbacks(runnable);
        pending.clear();
        long[] offsets = locked ? LOCK_OFFSETS_MS : new long[] { 0L };
        for (long offset : offsets) {
            final boolean expectLocked = locked;
            final String trigger = (locked ? "lock+" : "unlock+") + (offset / 1000) + "s";
            Runnable task = () -> {
                // 排期期间状态又变过：这一条属于上一轮，丢弃。
                if (lastLocked == null || lastLocked != expectLocked) return;
                capture(context, trigger, detail());
            };
            pending.add(task);
            handler.postDelayed(task, offset);
        }
    }

    /** 手动采样（「背屏故障诊断」按钮）：立即写一条。 */
    static void captureNow(Context context, String trigger, String detail) {
        capture(context, trigger == null || trigger.isEmpty() ? "manual" : trigger,
            detail == null ? detail() : detail);
    }

    /**
     * 写一条快照。
     *
     * @param detail 调用方（协调器）提供的详细状态串；null 时由本类尽力采集通用字段
     */
    static void capture(Context context, String trigger, String detail) {
        if (context == null) return;
        try {
            Context app = context.getApplicationContext();
            JSONObject entry = snapshot(app, trigger, detail);
            append(app, entry.toString());
            mirror(app, entry.toString());
        } catch (Throwable ignored) {
            // 取证永远不能影响播放或窗口状态。
        }
    }

    /** 采集一次状态。字段名面向前线判读，刻意保持短。 */
    private static JSONObject snapshot(Context context, String trigger, String detail) throws Exception {
        JSONObject entry = new JSONObject();
        long now = SystemClock.elapsedRealtime();
        entry.put("t", System.currentTimeMillis());
        entry.put("up", now);
        entry.put("trigger", trigger);

        KeyguardManager keyguard = (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
        entry.put("locked", keyguard != null && keyguard.isKeyguardLocked());

        int mainState = RearLyricsLauncher.displayState(context, 0);
        entry.put("main", stateName(mainState));
        int rearId = RearLyricsCoordinator.findRearDisplayId(context);
        int rearState = rearId < 0 ? Display.STATE_UNKNOWN : RearLyricsLauncher.displayState(context, rearId);
        entry.put("rearId", rearId);
        entry.put("rear", stateName(rearState));

        // 窗口三重身份：存在 / 附着到目标屏 / 真的可见。三者分开才能区分「被覆盖」与「被销毁」。
        RearLyricsActivity.WindowState window = RearLyricsActivity.windowState();
        entry.put("window", window == null ? JSONObject.NULL : window.toString());
        entry.put("attached", rearId >= 0 && RearLyricsActivity.attachedWindowOnDisplay(rearId) != null);
        entry.put("showing", rearId >= 0 && RearLyricsActivity.isShowingOnDisplay(rearId));
        String session = RearLyricsActivity.currentSession();
        entry.put("session", session.isEmpty() ? "-" : Integer.toHexString(session.hashCode()));
        entry.put("cameraYield", RearLyricsActivity.isYieldingToCamera());

        entry.put("wake", RearLyricsLauncher.lastWake());
        entry.put("trace", tail(RearLyricsTrace.read(context), 4));
        if (detail != null && !detail.isEmpty()) entry.put("detail", detail);
        return entry;
    }

    /** 面板状态的可读名：DOZE 与 OFF 必须分开，否则「AOD 接管」会被误记成「面板熄灭」。 */
    static String stateName(int state) {
        switch (state) {
            case Display.STATE_OFF: return "off";
            case Display.STATE_ON: return "on";
            case Display.STATE_DOZE: return "doze";
            case Display.STATE_DOZE_SUSPEND: return "doze-suspend";
            case Display.STATE_VR: return "vr";
            case Display.STATE_UNKNOWN: return "unknown";
            default: return "state-" + state;
        }
    }

    private static String tail(String text, int lines) {
        if (text == null || text.isEmpty()) return "";
        String[] all = text.split("\n");
        StringBuilder builder = new StringBuilder();
        for (int index = Math.max(0, all.length - lines); index < all.length; index++) {
            if (builder.length() > 0) builder.append(" | ");
            builder.append(all[index]);
        }
        return builder.toString();
    }

    private static synchronized void append(Context context, String line) {
        try {
            android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS, 0);
            String history = prefs.getString(KEY_ENTRIES, "");
            String combined = history.isEmpty() ? line : history + "\n" + line;
            String[] all = combined.split("\n");
            if (all.length > MAX_ENTRIES) {
                StringBuilder bounded = new StringBuilder();
                for (int index = all.length - MAX_ENTRIES; index < all.length; index++) {
                    if (bounded.length() > 0) bounded.append('\n');
                    bounded.append(all[index]);
                }
                combined = bounded.toString();
            }
            prefs.edit().putString(KEY_ENTRIES, combined).apply();
        } catch (Throwable ignored) { /* ignore */ }
    }

    /**
     * 镜像到应用外部目录：{@code Android/data/<pkg>/files/rear-fault/}。
     *
     * <p>这是「不打开界面也能取走」的那条路：{@code adb pull} 即可，不需要 root，
     * 也不需要先启动主 Activity。
     */
    private static void mirror(Context context, String line) {
        try {
            File base = context.getExternalFilesDir(DIR);
            if (base == null) return;
            if (!base.exists() && !base.mkdirs()) return;
            File latest = new File(base, "rear-fault-latest.txt");
            // 镜像文件是「不打开界面也能取走」的那份，必须自己封顶：超过 256 KB 就从空开始，
            // 否则一次长期挂机播放会把它写成无限增长的日志。
            if (latest.length() > 256 * 1024 && !latest.delete()) return;
            try (FileOutputStream output = new FileOutputStream(latest, true)) {
                output.write((line + "\n").getBytes(StandardCharsets.UTF_8));
            }
            File[] files = base.listFiles((dir, name) -> name.startsWith("rear-fault-") && name.endsWith(".txt"));
            if (files != null && files.length > MAX_MIRROR_FILES) {
                java.util.Arrays.sort(files, (a, b) -> Long.compare(a.lastModified(), b.lastModified()));
                for (int index = 0; index < files.length - MAX_MIRROR_FILES; index++) {
                    File stale = files[index];
                    if (!stale.getName().equals("rear-fault-latest.txt")) stale.delete();
                }
            }
        } catch (Throwable ignored) { /* ignore */ }
    }

    /** 导出用的全文（每行一个 JSON）。 */
    static String read(Context context) {
        try {
            return context.getSharedPreferences(PREFS, 0).getString(KEY_ENTRIES, "");
        } catch (Throwable error) {
            return "";
        }
    }

    static void clear(Context context) {
        try {
            context.getSharedPreferences(PREFS, 0).edit().remove(KEY_ENTRIES).apply();
        } catch (Throwable ignored) { /* ignore */ }
    }

    /** 记录条数，诊断面板用来显示「有没有数据」。 */
    static int count(Context context) {
        String text = read(context);
        return text.isEmpty() ? 0 : text.split("\n").length;
    }
}
