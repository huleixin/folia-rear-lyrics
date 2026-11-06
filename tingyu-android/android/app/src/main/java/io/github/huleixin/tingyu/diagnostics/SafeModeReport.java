package io.github.huleixin.tingyu.diagnostics;

import android.app.Activity;
import android.content.Context;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

// android/app/src/main/java/io/github/huleixin/tingyu/diagnostics/SafeModeReport.java
/**
 * 安全模式下的诊断包生成。
 *
 * <p>此时 React / WebView / Media3 都没有起来，前端那份 metadata/performance 拼装代码用不了，
 * 所以这里用同一套字段、同一套 ZIP 写出（{@link DiagnosticPackage}），保证安全模式导出的包
 * 与正常入口导出的包可以被同一套提示词解析。
 *
 * <p>不新增第二套日志：事件来自 {@link DiagnosticLog}，错误来自 CrashDiagnostics，
 * 启动阶段来自 {@link StartupGuard}。
 */
public final class SafeModeReport {
    private SafeModeReport() {}

    public static JSONObject buildMetadata(Context context) throws Exception {
        JSONObject metadata = new JSONObject();
        metadata.put("schema", "tingyu-diagnostic/1");
        metadata.put("generatedAt", isoNow());
        JSONObject app = new JSONObject();
        app.put("versionName", io.github.huleixin.tingyu.BuildConfig.VERSION_NAME);
        app.put("versionCode", io.github.huleixin.tingyu.BuildConfig.VERSION_CODE);
        app.put("buildType", io.github.huleixin.tingyu.BuildConfig.DEBUG ? "debug" : "release");
        app.put("buildId", io.github.huleixin.tingyu.BuildConfig.BUILD_ID);
        app.put("packageName", "io.github.huleixin.tingyu");
        app.put("runtime", "native-safe-mode");
        metadata.put("app", app);

        JSONObject device = new JSONObject();
        device.put("manufacturer", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER);
        device.put("model", Build.MODEL == null ? "" : Build.MODEL);
        device.put("androidRelease", Build.VERSION.RELEASE == null ? "" : Build.VERSION.RELEASE);
        device.put("sdk", Build.VERSION.SDK_INT);
        device.put("process", StartupGuard.summary(context).optString("process", "main"));
        metadata.put("device", device);

        JSONObject session = new JSONObject();
        session.put("id", DiagnosticLog.sessionId());
        session.put("startedAt", DiagnosticLog.sessionStartedAt());
        session.put("processEpoch", DiagnosticLog.epoch());
        session.put("eventCount", DiagnosticLog.ring().size());
        metadata.put("session", session);

        metadata.put("startup", StartupGuard.summary(context));
        metadata.put("retention", new JSONObject()
            .put("eventsInMemory", DiagnosticLog.ring().capacity())
            .put("policy", "本次 + 上一次会话；导出包最多保留 20 个 / 20MB"));
        JSONArray included = new JSONArray()
            .put("版本与设备型号").put("启动阶段").put("结构化事件").put("崩溃堆栈");
        JSONArray excluded = new JSONArray()
            .put("密码").put("Cookie").put("Token").put("账号与昵称")
            .put("私人文件内容").put("完整歌词").put("音频内容").put("原始请求参数");
        metadata.put("privacy", new JSONObject().put("included", included).put("excluded", excluded));
        return metadata;
    }

    /** 崩溃轨迹 + 退出原因 + 启动阶段，合成一份人可读的 errors.txt。 */
    public static String buildErrorsText(Context context) {
        StringBuilder out = new StringBuilder();
        out.append("听屿 异常记录（安全模式）\n");
        out.append("说明：包含启动阶段、系统退出原因、原生/JS 未捕获异常。\n");
        out.append("生成时间：").append(isoNow()).append("\n\n");
        try {
            JSONObject summary = StartupGuard.summary(context);
            out.append("-- 启动状态 --\n");
            out.append("最后阶段：").append(summary.optString("stage", "-")).append('\n');
            out.append("连续失败：").append(summary.optInt("consecutiveFailures", 0)).append('\n');
            out.append("安全模式原因：").append(summary.optString("safeReason", "-")).append('\n');
            out.append("系统退出信息：").append(summary.optString("lastExitDetail", "-")).append("\n");
            JSONArray stages = summary.optJSONArray("stages");
            if (stages != null) {
                out.append("阶段时间线：\n");
                for (int index = 0; index < stages.length(); index += 1) {
                    JSONObject stage = stages.optJSONObject(index);
                    if (stage == null) continue;
                    out.append("  +").append(stage.optLong("sinceStartMs", 0)).append("ms  ")
                        .append(stage.optString("stage", "-")).append('\n');
                }
            }
            out.append('\n');
        } catch (Exception ignored) {
        }

        out.append("-- 崩溃记录 --\n");
        try {
            JSONArray history = new JSONArray(
                io.github.huleixin.tingyu.CrashDiagnostics.read(context));
            if (history.length() == 0) {
                out.append("(没有捕获到未捕获异常；可能是原生崩溃、ANR 或被系统终止)\n");
            }
            for (int index = 0; index < history.length(); index += 1) {
                JSONObject entry = history.optJSONObject(index);
                if (entry == null) continue;
                out.append('[').append(index + 1).append("] ")
                    .append(entry.optString("at", "-")).append("  source=")
                    .append(entry.optString("source", "-")).append("  thread=")
                    .append(entry.optString("thread", "-")).append("  type=")
                    .append(entry.optString("type", "-")).append('\n');
                out.append("    ").append(entry.optString("message", "")).append('\n');
                String stack = entry.optString("stack", "");
                if (!stack.isEmpty()) {
                    String[] lines = stack.split("\n");
                    for (int line = 0; line < Math.min(40, lines.length); line += 1) {
                        out.append("    ").append(lines[line]).append('\n');
                    }
                }
            }
        } catch (Exception ignored) {
            out.append("(读取崩溃记录失败)\n");
        }
        return out.toString();
    }

    public static String buildPerformanceJson(Context context) {
        try {
            JSONObject payload = new JSONObject();
            payload.put("generatedAt", isoNow());
            payload.put("source", "safe-mode");
            payload.put("startup", StartupGuard.summary(context));
            payload.put("note", "安全模式下没有 WebView 帧数据；startup.stages 是本次/上次启动的阶段时间线。");
            return payload.toString(2);
        } catch (Exception error) {
            return "{}";
        }
    }

    public static String buildFeedbackText(String reason) {
        return "听屿 问题反馈（安全模式）\n"
            + "时间：" + isoNow() + "\n"
            + "类别：startup-crash\n"
            + "附带诊断日志：是\n"
            + "说明：用户未能正常进入应用，由安全恢复页面生成。\n"
            + "触发原因：" + (reason == null || reason.isEmpty() ? "-" : reason) + "\n";
    }

    /** 写包并拉起系统分享；返回 zip 文件名。 */
    public static String exportAndShare(Activity activity, String title) throws Exception {
        Context context = activity.getApplicationContext();
        JSONObject metadata = buildMetadata(context);
        String errors = buildErrorsText(context);
        JSONObject written = DiagnosticPackage.write(
            context,
            metadata,
            DiagnosticLog.snapshotJsonl(),
            errors,
            buildPerformanceJson(context),
            buildFeedbackText(StartupGuard.summary(context).optString("safeReason", "")),
            errors,
            null
        );
        File file = new File(written.getString("path"));
        DiagnosticPackage.share(activity, file, title);
        return written.getString("name");
    }

    private static String isoNow() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.US);
        format.setTimeZone(TimeZone.getDefault());
        return format.format(new Date());
    }
}
