package io.github.huleixin.tingyu.diagnostics;

import android.app.Activity;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

// android/app/src/main/java/io/github/huleixin/tingyu/diagnostics/DiagnosticPackage.java
/**
 * 诊断包（ZIP）生成与分享。
 *
 * <p>纯本地：没有任何上传代码。ZIP 用 {@code java.util.zip} 写，不引第三方库；截图以 base64
 * 从前端传来，这里解码后原样放进 {@code screenshots/}（前端已经压到长边 ≤1280 / JPEG 0.75）。
 *
 * <p>单个成员有大小上限，超限的成员会被替换成一行说明而不是让整包失败 —— 一份缺了报告的包
 * 也比「导出失败」有用。
 */
public final class DiagnosticPackage {
    private static final String DIR = "diagnostics";
    private static final int MAX_TEXT_BYTES = 4 * 1024 * 1024;
    private static final int MAX_TOTAL_SCREENSHOT_BYTES = 6 * 1024 * 1024;
    private static final int MAX_SCREENSHOTS = 3;
    private static final int MAX_PACKAGES = 20;
    private static final long MAX_PACKAGE_DIR_BYTES = 20L * 1024L * 1024L;

    private DiagnosticPackage() {}

    /**
     * 生成 ZIP。返回 {name, path, bytes, entries}。任何成员缺失都写成占位文本，不抛错。
     */
    public static JSONObject write(
        Context context,
        JSONObject metadata,
        String events,
        String errors,
        String performance,
        String feedback,
        String report,
        JSONArray screenshots
    ) throws Exception {
        File dir = new File(context.getCacheDir(), DIR);
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("cannot create diagnostics dir");
        String stamp = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date());
        File target = new File(dir, "tingyu-diagnostic-" + stamp + ".zip");

        JSONArray entries = new JSONArray();
        try (ZipOutputStream zip = new ZipOutputStream(
            new BufferedOutputStream(new FileOutputStream(target)))) {
            putText(zip, entries, "metadata.json", metadata == null ? "{}" : metadata.toString(2));
            putText(zip, entries, "events.jsonl", events);
            putText(zip, entries, "errors.txt", errors);
            putText(zip, entries, "performance.json", performance);
            putText(zip, entries, "feedback.txt", feedback);
            putText(zip, entries, "report.txt", report);
            putScreenshots(zip, entries, screenshots);
            putText(zip, entries, "README.txt", readme());
        }
        prune(dir);
        JSONObject result = new JSONObject();
        result.put("name", target.getName());
        result.put("path", target.getAbsolutePath());
        result.put("bytes", target.length());
        result.put("entries", entries);
        return result;
    }

    /** FileProvider + 系统分享面板。type 固定为 application/zip，QQ / 微信 / 邮件都能接。 */
    public static void share(Activity activity, File file, String title) throws Exception {
        if (activity == null || file == null || !file.isFile()) throw new Exception("package missing");
        Uri uri = FileProvider.getUriForFile(
            activity, activity.getPackageName() + ".fileprovider", file);
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("application/zip");
        send.putExtra(Intent.EXTRA_STREAM, uri);
        send.putExtra(Intent.EXTRA_SUBJECT, title);
        send.setClipData(ClipData.newUri(activity.getContentResolver(), file.getName(), uri));
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(send, title);
        chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        activity.startActivity(chooser);
    }

    public static int deleteAll(Context context) {
        File dir = new File(context.getCacheDir(), DIR);
        File[] files = dir.listFiles();
        if (files == null) return 0;
        int deleted = 0;
        for (File file : files) {
            if (file.isFile() && file.delete()) deleted += 1;
        }
        return deleted;
    }

    public static long totalBytes(Context context) {
        File dir = new File(context.getCacheDir(), DIR);
        File[] files = dir.listFiles();
        if (files == null) return 0L;
        long total = 0L;
        for (File file : files) {
            if (file.isFile()) total += file.length();
        }
        return total;
    }

    // ---------------------------------------------------------------- 内部

    private static void putText(ZipOutputStream zip, JSONArray entries, String name, String content)
        throws Exception {
        String body = content == null ? "" : content;
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_TEXT_BYTES) {
            bytes = ("(omitted: " + bytes.length + " bytes exceeds per-entry cap "
                + MAX_TEXT_BYTES + ")").getBytes(StandardCharsets.UTF_8);
        }
        zip.putNextEntry(new ZipEntry(name));
        zip.write(bytes);
        zip.closeEntry();
        entries.put(new JSONObject().put("name", name).put("bytes", bytes.length));
    }

    private static void putScreenshots(ZipOutputStream zip, JSONArray entries, JSONArray screenshots)
        throws Exception {
        if (screenshots == null || screenshots.length() == 0) return;
        int written = 0;
        int total = 0;
        for (int index = 0; index < screenshots.length() && written < MAX_SCREENSHOTS; index += 1) {
            String encoded = screenshots.optString(index, "");
            int comma = encoded.indexOf(',');
            if (comma >= 0 && encoded.startsWith("data:")) encoded = encoded.substring(comma + 1);
            if (encoded.isEmpty()) continue;
            byte[] bytes;
            try {
                bytes = Base64.decode(encoded, Base64.NO_WRAP);
            } catch (Exception invalid) {
                continue;
            }
            if (bytes.length == 0) continue;
            if (total + bytes.length > MAX_TOTAL_SCREENSHOT_BYTES) break;
            total += bytes.length;
            written += 1;
            String name = "screenshots/screenshot-" + written + ".jpg";
            zip.putNextEntry(new ZipEntry(name));
            zip.write(bytes);
            zip.closeEntry();
            entries.put(new JSONObject().put("name", name).put("bytes", bytes.length));
        }
    }

    /** 导出目录只留最近 20 个包、总计 20MB。 */
    private static void prune(File dir) {
        File[] files = dir.listFiles((fileDir, name) -> name.endsWith(".zip"));
        if (files == null) return;
        java.util.Arrays.sort(files, (left, right) -> Long.compare(right.lastModified(), left.lastModified()));
        long total = 0L;
        for (int index = 0; index < files.length; index += 1) {
            File file = files[index];
            total += file.length();
            if (index >= MAX_PACKAGES || total > MAX_PACKAGE_DIR_BYTES) {
                //noinspection ResultOfMethodCallIgnored
                file.delete();
            }
        }
    }

    private static String readme() {
        return "听屿 诊断包\n"
            + "===========\n\n"
            + "metadata.json     设备、系统、应用与源码版本\n"
            + "events.jsonl      结构化事件流（本次会话 + 崩溃前会话），每行一条 JSON\n"
            + "errors.txt        崩溃与异常退出记录（含堆栈）\n"
            + "performance.json  启动阶段、页面耗时、帧率与长任务摘要\n"
            + "feedback.txt      你填写的问题描述\n"
            + "report.txt        完整文本诊断报告\n"
            + "screenshots/      你附加的截图（最多 3 张）\n\n"
            + "隐私说明：不含密码、Cookie、Token、账号信息、私人文件内容、完整歌词或音频内容。\n"
            + "所有内容均在本机生成，只在你主动分享时才离开设备。\n";
    }
}
