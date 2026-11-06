package io.github.huleixin.tingyu.diagnostics;

import android.app.ActivityManager;
import android.app.ApplicationExitInfo;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

// android/app/src/main/java/io/github/huleixin/tingyu/diagnostics/StartupGuard.java
/**
 * 启动阶段记账 + 连续失败保护。
 *
 * <p>为什么单独一个类：启动崩溃的诊断必须能在「Application 还没跑完、WebView 还没起来」
 * 的时候工作，因此这里只依赖 SharedPreferences（一次小文件读 + 每次阶段变化一次 apply），
 * 不碰 Media3、不碰 Compose、不碰任何业务单例。
 *
 * <p>写入策略：阶段只在变化时写，且全部 apply()（异步）。整个启动最多 6 次写入，
 * 不参与冷启动关键路径的耗时统计。
 *
 * <p>安全模式判定分两步：
 * 1）{@link #begin} 只看「上一次有没有走完 + 是不是用户退出」得到连续计数（零 binder 调用）；
 * 2）{@link #shouldEnterSafeMode} 仅在计数达到阈值时才去读 ApplicationExitInfo 复核，
 *    把「用户主动退出 / 系统低内存回收」退回去。慢调用只发生在要进安全模式的罕见路径上。
 */
public final class StartupGuard {
    private static final String PREFS = "tingyu_startup_guard";
    private static final String KEY_STAGE = "stage";
    private static final String KEY_STAGE_AT = "stage_at";
    private static final String KEY_STAGES = "stages";
    private static final String KEY_COMPLETED = "completed";
    private static final String KEY_USER_EXIT = "user_exit";
    private static final String KEY_CONSECUTIVE = "consecutive";
    private static final String KEY_SAFE_MODE = "safe_mode";
    private static final String KEY_SAFE_REASON = "safe_reason";
    private static final String KEY_SAFE_AT = "safe_at";
    private static final String KEY_LAST_EXIT_KIND = "last_exit_kind";
    private static final String KEY_LAST_EXIT_DETAIL = "last_exit_detail";
    private static final String KEY_ENTRY = "entry_activity";
    private static final String KEY_SKIP_OPTIONAL = "skip_optional";
    private static final int MAX_STAGES = 24;

    /** 实际存在的启动阶段（按源码，不虚构 Media3 阶段：它在首次播放时才创建）。 */
    public static final String STAGE_APP_ATTACH = "app-attach";
    public static final String STAGE_PROVIDER_INIT = "provider-init";
    public static final String STAGE_APP_CREATE = "app-create";
    public static final String STAGE_ACTIVITY_CREATE = "activity-create";
    public static final String STAGE_WEBVIEW_INIT = "webview-init";
    public static final String STAGE_NATIVE_SHELL = "native-shell";
    public static final String STAGE_JS_READY = "js-ready";
    public static final String STAGE_COMPLETE = "startup-complete";

    private static volatile SharedPreferences prefs;
    private static volatile boolean begun;
    private static volatile boolean completed;
    private static volatile String currentStage = "";
    private static volatile long processStartedAt;
    private static volatile boolean skipOptional;
    /** begin() 时读到的上一会话快照：确认是「主界面启动」后才用来算连续失败。 */
    private static volatile boolean previousCompleted = true;
    private static volatile boolean previousUserExit;
    private static volatile String previousEntry = "";
    private static volatile boolean mainLaunchConfirmed;
    private static final List<JSONObject> STAGES = new ArrayList<>();

    private StartupGuard() {}

    /** 每个进程一次。可从 Application.attachBaseContext 或最早的 ContentProvider 调。 */
    public static synchronized void begin(Context context) {
        if (context == null || begun) return;
        Context app = context.getApplicationContext();
        SharedPreferences store = (app == null ? context : app)
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs = store;
        processStartedAt = System.currentTimeMillis();
        begun = true;

        // 先把上一会话的结论读进内存，再覆盖成本会话的状态：
        // 只有确认「这次是主界面启动」之后才会把失败计数 +1（见 confirmMainLaunch）。
        previousCompleted = store.getBoolean(KEY_COMPLETED, true);
        previousUserExit = store.getBoolean(KEY_USER_EXIT, false);
        previousEntry = store.getString(KEY_ENTRY, "");
        skipOptional = store.getBoolean(KEY_SKIP_OPTIONAL, false);

        // 本次会话重新开始记账：completed=false 是「没走完」的唯一标志。
        // 注意 consecutive 不在这里改：背屏 Activity 单独拉起进程时不应该影响主界面的计数。
        store.edit()
            .putBoolean(KEY_COMPLETED, false)
            .putBoolean(KEY_USER_EXIT, false)
            .remove(KEY_ENTRY)
            .remove(KEY_STAGES)
            .remove(KEY_STAGE)
            .apply();
        completed = false;
        STAGES.clear();
    }

    /**
     * 主界面确认启动：此时才把「上一会话没走完」计入连续失败。
     *
     * <p>为什么不放在 begin()：背屏歌词 Activity 也会拉起同一个进程，但它不加载 React，
     * 天然不会走到 startup-complete。如果把它也算作「启动失败」，背屏用得多的用户会被误判。
     */
    public static synchronized void confirmMainLaunch() {
        if (mainLaunchConfirmed) return;
        mainLaunchConfirmed = true;
        SharedPreferences store = prefs;
        if (store == null) return;
        int previous = store.getInt(KEY_CONSECUTIVE, 0);
        boolean nonMainEntry = "rear".equals(previousEntry) || "service".equals(previousEntry);
        StartupFailurePolicy.Decision decision = StartupFailurePolicy.decide(
            previousCompleted || nonMainEntry, previousUserExit, previous);
        store.edit().putInt(KEY_CONSECUTIVE, decision.consecutive).apply();
    }

    /**
     * 进程被谁拉起：main / rear / service。只记第一次。
     *
     * <p>这三者的区别决定「上一会话没走完」要不要计入启动失败：主界面才算，
     * 背屏 Activity 与后台播放服务都不加载 React，天然到不了 startup-complete。
     */
    public static synchronized void noteEntry(String kind) {
        SharedPreferences store = prefs;
        if (store == null) return;
        try {
            if (store.contains(KEY_ENTRY)) return;
            store.edit().putString(KEY_ENTRY, kind == null || kind.isEmpty() ? "unknown" : kind).apply();
        } catch (Exception ignored) {
        }
    }

    /** 记录一个启动阶段。同名阶段重复调用是空操作。 */
    public static synchronized void stage(String name) {
        if (name == null || name.isEmpty() || name.equals(currentStage)) return;
        currentStage = name;
        long now = System.currentTimeMillis();
        long sinceStart = Math.max(0, now - processStartedAt);
        try {
            JSONObject entry = new JSONObject();
            entry.put("stage", name);
            entry.put("at", now);
            entry.put("sinceStartMs", sinceStart);
            STAGES.add(entry);
            if (STAGES.size() > MAX_STAGES) STAGES.remove(0);
            SharedPreferences store = prefs;
            if (store != null) {
                JSONArray array = new JSONArray();
                for (JSONObject item : STAGES) array.put(item);
                store.edit()
                    .putString(KEY_STAGE, name)
                    .putLong(KEY_STAGE_AT, now)
                    .putString(KEY_STAGES, array.toString())
                    .apply();
            }
        } catch (Exception ignored) {
            // 阶段记账失败不能影响启动。
        }
        try {
            JSONObject fields = new JSONObject();
            fields.put("stage", name);
            fields.put("sinceMs", sinceStart);
            DiagnosticLog.event("lifecycle", "info", "startup-stage", fields);
        } catch (Exception ignored) {
        }
    }

    /** 启动真正可用（React 首帧提交后由前端回报）。 */
    public static synchronized void complete() {
        if (completed) return;
        completed = true;
        stage(STAGE_COMPLETE);
        try {
            SharedPreferences store = prefs;
            if (store != null) {
                store.edit()
                    .putBoolean(KEY_COMPLETED, true)
                    .putInt(KEY_CONSECUTIVE, 0)
                    .putBoolean(KEY_SAFE_MODE, false)
                    .putBoolean(KEY_SKIP_OPTIONAL, false)
                    .apply();
            }
        } catch (Exception ignored) {
        }
    }

    public static boolean isCompleted() {
        return completed;
    }

    /** 用户主动离开（划掉最近任务 / 正常返回退出）：下一次启动不计入失败。 */
    public static void noteUserExit() {
        try {
            SharedPreferences store = prefs;
            if (store != null) store.edit().putBoolean(KEY_USER_EXIT, true).apply();
        } catch (Exception ignored) {
        }
    }

    /**
     * 是否进入安全模式。只有连续失败达到阈值才会做 ApplicationExitInfo 复核，
     * 因此常态启动零额外开销。
     */
    public static boolean shouldEnterSafeMode(Context context) {
        SharedPreferences store = prefs;
        if (store == null) return false;
        int consecutive = store.getInt(KEY_CONSECUTIVE, 0);
        if (consecutive < StartupFailurePolicy.THRESHOLD) return false;
        if (store.getBoolean(KEY_SAFE_MODE, false)) return true;

        ExitSnapshot exit = readLastExit(context);
        StartupFailurePolicy.Decision decision = StartupFailurePolicy.recheck(
            new StartupFailurePolicy.Decision(consecutive, true), exit.kind);
        if (!decision.safeMode) {
            // 复核发现是用户退出或系统回收：把计数退回去，正常启动。
            store.edit().putInt(KEY_CONSECUTIVE, 0).apply();
            return false;
        }
        // 复核结论写进 prefs：安全模式页面直接读，不再重复查 binder。
        try {
            store.edit()
                .putBoolean(KEY_SAFE_MODE, true)
                .putString(KEY_SAFE_REASON,
                    "consecutive=" + decision.consecutive + " stage=" + store.getString(KEY_STAGE, "-")
                        + " exit=" + exit.label)
                .putLong(KEY_SAFE_AT, System.currentTimeMillis())
                .putInt(KEY_LAST_EXIT_KIND, exit.kind)
                .putString(KEY_LAST_EXIT_DETAIL, exit.detail)
                .apply();
        } catch (Exception ignored) {
        }
        return true;
    }

    /** 调试/手动强制进入安全模式（不伪造连续失败计数，只置位）。 */
    public static void forceSafeMode(String reason) {
        try {
            SharedPreferences store = prefs;
            if (store == null) return;
            store.edit()
                .putBoolean(KEY_SAFE_MODE, true)
                .putString(KEY_SAFE_REASON, reason == null ? "manual" : reason)
                .putLong(KEY_SAFE_AT, System.currentTimeMillis())
                .apply();
        } catch (Exception ignored) {
        }
    }

    public static boolean inSafeMode(Context context) {
        SharedPreferences store = prefs;
        return store != null && store.getBoolean(KEY_SAFE_MODE, false);
    }

    /** 「恢复正常启动」：清掉计数与安全模式标记，不做任何数据清理。 */
    public static synchronized void exitSafeMode() {
        try {
            SharedPreferences store = prefs;
            if (store != null) {
                store.edit()
                    .putBoolean(KEY_SAFE_MODE, false)
                    .putInt(KEY_CONSECUTIVE, 0)
                    .putBoolean(KEY_COMPLETED, true)
                    .putBoolean(KEY_USER_EXIT, false)
                    .remove(KEY_SAFE_REASON)
                    .apply();
            }
            completed = true;
        } catch (Exception ignored) {
        }
    }

    /** 安全模式里「跳过非必要模块」：置位后 MainActivity 少装原生 UI / 少注册插件。 */
    public static void setSkipOptional(boolean value) {
        skipOptional = value;
        try {
            SharedPreferences store = prefs;
            if (store != null) store.edit().putBoolean(KEY_SKIP_OPTIONAL, value).apply();
        } catch (Exception ignored) {
        }
    }

    public static boolean skipOptional() {
        return skipOptional;
    }

    /** 最近一次启动停在哪、连续失败几次、上次退出原因。给安全模式页面与诊断包用。 */
    public static JSONObject summary(Context context) {
        JSONObject out = new JSONObject();
        SharedPreferences store = prefs;
        if (store == null && context != null) {
            Context app = context.getApplicationContext();
            store = (app == null ? context : app).getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        }
        if (store == null) return out;
        try {
            out.put("stage", store.getString(KEY_STAGE, "-"));
            out.put("stageAt", store.getLong(KEY_STAGE_AT, 0L));
            out.put("completedLastSession", store.getBoolean(KEY_COMPLETED, true));
            out.put("consecutiveFailures", store.getInt(KEY_CONSECUTIVE, 0));
            out.put("safeMode", store.getBoolean(KEY_SAFE_MODE, false));
            out.put("safeReason", store.getString(KEY_SAFE_REASON, ""));
            out.put("lastExitKind", store.getInt(KEY_LAST_EXIT_KIND, 0));
            out.put("lastExitDetail", store.getString(KEY_LAST_EXIT_DETAIL, ""));
            JSONArray stages = new JSONArray(store.getString(KEY_STAGES, "[]"));
            out.put("stages", stages);
            out.put("process", processName);
        } catch (Exception ignored) {
        }
        return out;
    }

    /** 直接给诊断包 performance.json 用的一份启动耗时数组。 */
    public static JSONArray stageSnapshot() {
        JSONArray array = new JSONArray();
        synchronized (StartupGuard.class) {
            for (JSONObject item : STAGES) array.put(item);
        }
        return array;
    }

    private static volatile String processName = "main";

    /** 由 Application 注入进程名，安全模式页面用它确认自己跑在主进程。 */
    public static void noteProcessName(String name) {
        if (name != null && !name.isEmpty()) processName = name;
    }

    // ---------------------------------------------------------------- 退出原因

    private static final class ExitSnapshot {
        final int kind;
        final String label;
        final String detail;

        ExitSnapshot(int kind, String label, String detail) {
            this.kind = kind;
            this.label = label;
            this.detail = detail;
        }
    }

    /**
     * 读系统保存的最近一次进程退出原因（API 30+）。低于 R 返回 unknown，
     * 由本地崩溃记录与阶段信息兜底。
     */
    private static ExitSnapshot readLastExit(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R || context == null) {
            return new ExitSnapshot(StartupFailurePolicy.EXIT_UNKNOWN, "unavailable", "");
        }
        try {
            ActivityManager manager =
                (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
            if (manager == null) {
                return new ExitSnapshot(StartupFailurePolicy.EXIT_UNKNOWN, "unavailable", "");
            }
            // 正确的 API 名是 getHistoricalProcessExitReasons(package, pid, max)；
            // 旧诊断代码里写的 getHistoricalProcessExitInfos 并不存在（反射失败被 catch 吞掉），
            // 所以「系统退出原因」这一段此前一直是空的。
            List<ApplicationExitInfo> infos =
                manager.getHistoricalProcessExitReasons(context.getPackageName(), 0, 16);
            if (infos == null || infos.isEmpty()) {
                return new ExitSnapshot(StartupFailurePolicy.EXIT_UNKNOWN, "none", "");
            }
            ApplicationExitInfo newest = null;
            for (ApplicationExitInfo info : infos) {
                if (info == null) continue;
                if (newest == null || info.getTimestamp() > newest.getTimestamp()) newest = info;
            }
            if (newest == null) {
                return new ExitSnapshot(StartupFailurePolicy.EXIT_UNKNOWN, "none", "");
            }
            int reason = newest.getReason();
            int kind = StartupFailurePolicy.classifyExitReason(reason);
            String detail = "reason=" + reason
                + " status=" + newest.getStatus()
                + " importance=" + newest.getImportance()
                + " process=" + (newest.getProcessName() == null ? "-" : newest.getProcessName())
                + " description=" + (newest.getDescription() == null ? "-" : newest.getDescription());
            return new ExitSnapshot(kind, labelFor(kind) + "(" + reason + ")", detail);
        } catch (Throwable unavailable) {
            return new ExitSnapshot(StartupFailurePolicy.EXIT_UNKNOWN, "unavailable", "");
        }
    }

    private static String labelFor(int kind) {
        switch (kind) {
            case StartupFailurePolicy.EXIT_CRASH: return "crash";
            case StartupFailurePolicy.EXIT_ANR: return "anr";
            case StartupFailurePolicy.EXIT_USER: return "user";
            case StartupFailurePolicy.EXIT_SYSTEM: return "system";
            case StartupFailurePolicy.EXIT_OTHER: return "other";
            default: return "unknown";
        }
    }
}
