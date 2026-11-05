package io.github.huleixin.tingyu;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;

/**
 * 本地音频 ref 的统一解析。
 *
 * 曲库里的歌只存一个 ref（不存路径也不存 URL），三种前缀分别对应三条来源：
 *   `imported-*`  通过系统文件管理器挑选 / 文件夹导入后复制进 App 私有目录的副本
 *   `file-*`      文件系统兜底扫描出来的用户原文件（需要「所有文件访问」）
 *   `<数字>`      MediaStore 里的音频 id（扫描设备音乐库得到的）
 *
 * 播放（LocalAudioServer）与元数据读取（插件）必须用同一套解析规则，否则会出现
 * 「能播但读不出封面」这类对不上的问题，所以集中在这里。
 */
final class LocalAudioAccess {
    static final String IMPORTED_PREFIX = "imported-";
    static final String FILE_PREFIX = "file-";

    private LocalAudioAccess() {}

    /** 复制进私有目录的音频；ref 不合法（含路径穿越）时返回 null。 */
    static File importedFile(Context context, String ref) {
        if (ref == null || !ref.startsWith(IMPORTED_PREFIX)) return null;
        if (ref.contains("/") || ref.contains("\\") || ref.contains("..")) return null;
        File dir = new File(context.getFilesDir(), "imported-audio");
        return new File(dir, ref);
    }

    /**
     * `file-<绝对路径>` 指向的用户原文件。
     *
     * 只放行外存根目录下的音频：这个解析结果直接给只监听 127.0.0.1 的本地服务用，
     * 设备上任何应用都能连上来，不能变成任读全盘的口子。
     */
    static File externalFile(String ref) {
        if (ref == null || !ref.startsWith(FILE_PREFIX)) return null;
        String path = decodePath(ref.substring(FILE_PREFIX.length()));
        if (path == null || path.isEmpty()) return null;
        File root = Environment.getExternalStorageDirectory();
        if (root == null || !path.startsWith(root.getPath() + File.separator)) return null;
        if (!LocalAudioServer.isAudioFileName(path)) return null;
        return new File(path);
    }

    /**
     * ref 对应的磁盘路径（用于找同名 .lrc 这类兄弟文件）。
     *
     * MediaStore 那一路在 Android 9 及以下读 DATA；10 及以上优先 DATA（部分 ROM 仍返回），
     * 拿不到再按 VOLUME_NAME + RELATIVE_PATH + DISPLAY_NAME 拼。拼出来的路径只有在
     * 已授予「所有文件访问」时才读得动，读不动就是 null，调用方按「没有外挂歌词」处理。
     */
    static String absolutePath(Context context, String ref) {
        if (ref == null || ref.isEmpty()) return null;
        File imported = importedFile(context, ref);
        if (imported != null) return imported.getAbsolutePath();
        File external = externalFile(ref);
        if (external != null) return external.getAbsolutePath();
        if (!isMediaStoreId(ref)) return null;
        return mediaStorePath(context, ref);
    }

    static boolean isMediaStoreId(String ref) {
        if (ref == null || ref.isEmpty() || ref.length() > 20) return false;
        for (int index = 0; index < ref.length(); index += 1) {
            if (!Character.isDigit(ref.charAt(index))) return false;
        }
        return true;
    }

    private static String mediaStorePath(Context context, String id) {
        Uri uri = Uri.withAppendedPath(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id);
        ContentResolver resolver = context.getContentResolver();
        try (Cursor cursor = resolver.query(uri, new String[]{
            MediaStore.Audio.Media.DATA,
            MediaStore.Audio.Media.DISPLAY_NAME,
            MediaStore.MediaColumns.RELATIVE_PATH,
            MediaStore.MediaColumns.VOLUME_NAME
        }, null, null, null)) {
            if (cursor == null || !cursor.moveToFirst()) return null;
            if (!cursor.isNull(0)) {
                String data = cursor.getString(0);
                if (data != null && !data.isEmpty()) return data;
            }
            if (cursor.isNull(1) || cursor.isNull(2)) return null;
            String displayName = cursor.getString(1);
            String relative = cursor.getString(2);
            String volume = cursor.isNull(3) ? null : cursor.getString(3);
            String storageRoot = volume == null || volume.isEmpty()
                ? Environment.getExternalStorageDirectory().getAbsolutePath()
                : "/storage/" + volume;
            if (relative == null) relative = "";
            return storageRoot + "/" + relative + displayName;
        } catch (Exception ignored) {
            return null;
        }
    }

    static InputStream open(Context context, String ref) throws IOException {
        if (ref == null || ref.isEmpty()) throw new IOException("empty ref");
        File imported = importedFile(context, ref);
        if (imported != null) {
            if (!imported.isFile()) throw new IOException("imported audio missing: " + ref);
            return new FileInputStream(imported);
        }
        File external = externalFile(ref);
        if (external != null) {
            if (!external.isFile()) throw new IOException("external audio missing: " + ref);
            return new FileInputStream(external);
        }
        if (!isMediaStoreId(ref)) throw new IOException("unsupported audio ref: " + ref);
        Uri uri = Uri.withAppendedPath(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, ref);
        InputStream stream = context.getContentResolver().openInputStream(uri);
        if (stream == null) throw new IOException("media store stream unavailable: " + ref);
        return stream;
    }

    /** 音频字节数；读不到返回 -1（文件被删除、权限被回收都会走到这里）。 */
    static long length(Context context, String ref) {
        if (ref == null || ref.isEmpty()) return -1;
        File imported = importedFile(context, ref);
        if (imported != null) return imported.isFile() ? imported.length() : -1;
        File external = externalFile(ref);
        if (external != null) return external.isFile() ? external.length() : -1;
        if (!isMediaStoreId(ref)) return -1;
        Uri uri = Uri.withAppendedPath(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, ref);
        try (Cursor cursor = context.getContentResolver().query(
            uri, new String[]{MediaStore.Audio.Media.SIZE}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) return cursor.getLong(0);
        } catch (Exception ignored) {
            // 文件被删除或授权被回收时 query 会抛，交给调用方按「读不到」处理。
        }
        return -1;
    }

    static String mimeType(String ref, String fileName) {
        String name = fileName;
        if (name == null || name.isEmpty()) {
            String path = absolutePathOrRefSuffix(ref);
            name = path == null ? "" : path;
        }
        return LocalAudioServer.guessMimeType(name);
    }

    private static String absolutePathOrRefSuffix(String ref) {
        if (ref == null || !ref.startsWith(FILE_PREFIX)) return ref;
        return decodePath(ref.substring(FILE_PREFIX.length()));
    }

    static String decodePath(String value) {
        if (value == null) return null;
        try {
            return java.net.URLDecoder.decode(value, "UTF-8");
        } catch (Exception error) {
            return value;
        }
    }

    static String encodePath(String value) {
        try {
            return java.net.URLEncoder.encode(value, "UTF-8").replace("+", "%20");
        } catch (Exception error) {
            return value;
        }
    }

    /** 已授予「所有文件访问」（Android 11+ 的受限权限，只能由用户在系统设置里打开）。 */
    static boolean hasAllFilesAccess() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return true;
        try {
            return Environment.isExternalStorageManager();
        } catch (Exception ignored) {
            return false;
        }
    }
}
