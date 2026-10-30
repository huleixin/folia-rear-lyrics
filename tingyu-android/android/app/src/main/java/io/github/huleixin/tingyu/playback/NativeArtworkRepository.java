package io.github.huleixin.tingyu.playback;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.LruCache;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import java.util.Comparator;
import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/NativeArtworkRepository.java
/**
 * 原生封面仓库：内存 LRU + 磁盘缓存 + 受控下载。
 *
 * <p>不做「按歌名搜索封面」：队列项本来就带真实封面地址（`artwork`），搜索只会引入错图。
 * 这里负责的是**把已知地址可靠地变成 Bitmap**，并且分清五种不同的失败：
 * 地址缺失 / 下载失败 / 超大 / 解码失败 / 缓存未命中 —— 它们对用户的含义完全不同，
 * 混成一个「封面加载失败」就无法在真机报告里判断到底是哪一环。
 *
 * <p>约束：
 * <ul>
 *   <li>单张上限 6 MB，超了放弃（封面 URL 指向整张原图的情况很常见）；</li>
 *   <li>解码按目标边长 768 二次采样，落盘存的是**已降采样**的 JPEG，磁盘不会被子图撑爆；</li>
 *   <li>磁盘最多 60 张，按修改时间淘汰；内存 LRU 12 MB；</li>
 *   <li>只接受非空 Bitmap：0×0 的「解码成功」发布出去就是一块空白，比占位图更糟。</li>
 * </ul>
 */
public final class NativeArtworkRepository {

    private static final String USER_AGENT = "Tingyu/1.3.50 (+https://github.com/huleixin/tingyu)";
    private static final int MAX_BYTES = 6 * 1024 * 1024;
    private static final int TARGET_EDGE_PX = 768;
    private static final int MAX_CACHE_FILES = 60;
    private static final int MEMORY_BYTES = 12 * 1024 * 1024;

    public enum Status {
        CACHE_HIT,
        FETCHED,
        /** 队列项没有封面地址。 */
        MISSING_URI,
        /** HTTP 非 2xx。 */
        HTTP_ERROR,
        /** 超时 / 断网。 */
        NETWORK,
        /** 响应体超过上限。 */
        TOO_LARGE,
        /** 有字节但解码不出位图（损坏、非图片、空图）。 */
        DECODE_FAILED
    }

    public static final class Result {
        public final Status status;
        public final Bitmap bitmap;
        public final int httpStatus;
        public final int bytes;
        public final int width;
        public final int height;

        Result(Status status, Bitmap bitmap, int httpStatus, int bytes, int width, int height) {
            this.status = status;
            this.bitmap = bitmap;
            this.httpStatus = httpStatus;
            this.bytes = bytes;
            this.width = width;
            this.height = height;
        }
    }

    private static volatile NativeArtworkRepository instance;

    public static NativeArtworkRepository get(Context context) {
        NativeArtworkRepository cached = instance;
        if (cached != null) return cached;
        synchronized (NativeArtworkRepository.class) {
            if (instance == null) instance = new NativeArtworkRepository(context);
            return instance;
        }
    }

    private final File dir;
    private final OkHttpClient client;
    private final LruCache<String, Bitmap> memory = new LruCache<String, Bitmap>(MEMORY_BYTES) {
        @Override protected int sizeOf(String key, Bitmap value) {
            return value == null ? 0 : value.getByteCount();
        }
    };

    private NativeArtworkRepository(Context context) {
        dir = new File(context.getApplicationContext().getCacheDir(), "native-artwork");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        client = new OkHttpClient.Builder()
                .connectTimeout(8, TimeUnit.SECONDS)
                .readTimeout(12, TimeUnit.SECONDS)
                .callTimeout(16, TimeUnit.SECONDS)
                .retryOnConnectionFailure(true)
                .build();
    }

    /** 只查本地缓存（内存 → 磁盘），不联网。 */
    public Result readCache(String songKey) {
        if (songKey == null || songKey.isEmpty()) return null;
        Bitmap cached = memory.get(songKey);
        if (cached != null && !cached.isRecycled()) {
            return new Result(Status.CACHE_HIT, cached, 0, 0, cached.getWidth(), cached.getHeight());
        }
        File file = fileFor(songKey);
        if (!file.isFile()) return null;
        Bitmap decoded = decode(Files.readAll(file));
        if (decoded == null) {
            //noinspection ResultOfMethodCallIgnored
            file.delete();
            return null;
        }
        memory.put(songKey, decoded);
        return new Result(Status.CACHE_HIT, decoded, 0, (int) file.length(), decoded.getWidth(), decoded.getHeight());
    }

    /** 阻塞调用，必须在后台线程执行。 */
    public Result load(String songKey, String url) {
        if (url == null || url.trim().isEmpty()) {
            return new Result(Status.MISSING_URI, null, 0, 0, 0, 0);
        }
        Result cached = readCache(songKey);
        if (cached != null) return cached;

        Request request;
        try {
            request = new Request.Builder()
                    .url(url.trim())
                    .header("User-Agent", USER_AGENT)
                    .header("Accept", "image/*")
                    .build();
        } catch (IllegalArgumentException error) {
            return new Result(Status.MISSING_URI, null, 0, 0, 0, 0);
        }
        try (Response response = client.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                return new Result(Status.HTTP_ERROR, null, response.code(), 0, 0, 0);
            }
            ResponseBody body = response.body();
            if (body == null) return new Result(Status.HTTP_ERROR, null, response.code(), 0, 0, 0);
            byte[] bytes = readLimited(body, MAX_BYTES);
            if (bytes == null) return new Result(Status.TOO_LARGE, null, response.code(), MAX_BYTES, 0, 0);
            Bitmap bitmap = decode(bytes);
            if (bitmap == null) {
                return new Result(Status.DECODE_FAILED, null, response.code(), bytes.length, 0, 0);
            }
            memory.put(songKey, bitmap);
            writeDisk(songKey, bitmap);
            prune();
            return new Result(Status.FETCHED, bitmap, response.code(), bytes.length,
                    bitmap.getWidth(), bitmap.getHeight());
        } catch (IOException error) {
            return new Result(Status.NETWORK, null, -1, 0, 0, 0);
        }
    }

    /** 供服务直接取内存里的那一张（换歌瞬间避免重复解码）。 */
    public Bitmap peek(String songKey) {
        Bitmap cached = memory.get(songKey);
        return cached != null && !cached.isRecycled() ? cached : null;
    }

    private Bitmap decode(byte[] bytes) {
        if (bytes == null || bytes.length == 0) return null;
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null;
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight);
        options.inPreferredConfig = Bitmap.Config.ARGB_8888;
        Bitmap bitmap;
        try {
            bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
        } catch (OutOfMemoryError error) {
            return null;
        }
        if (bitmap == null || bitmap.getWidth() <= 0 || bitmap.getHeight() <= 0) return null;
        return bitmap;
    }

    static int sampleSize(int width, int height) {
        int sample = 1;
        int longest = Math.max(width, height);
        while (longest / sample > TARGET_EDGE_PX && sample < 16) sample *= 2;
        return sample;
    }

    private static byte[] readLimited(ResponseBody body, int limit) throws IOException {
        InputStream stream = body.byteStream();
        ByteArrayOutputStream out = new ByteArrayOutputStream(64 * 1024);
        byte[] buffer = new byte[16 * 1024];
        int total = 0;
        int read;
        while ((read = stream.read(buffer)) != -1) {
            total += read;
            if (total > limit) return null;
            out.write(buffer, 0, read);
        }
        return out.toByteArray();
    }

    private void writeDisk(String songKey, Bitmap bitmap) {
        File target = fileFor(songKey);
        File temp = new File(target.getParentFile(), target.getName() + ".tmp");
        try (FileOutputStream stream = new FileOutputStream(temp)) {
            // 落盘存降采样后的 JPEG：解码后的原始 PNG/JPEG 往往有几 MB，而锁屏/通知只需要 768px。
            bitmap.compress(Bitmap.CompressFormat.JPEG, 88, stream);
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

    private File fileFor(String songKey) {
        return new File(dir, NativeLyricsRepository.sha1(songKey) + ".img");
    }

    /** 只是为了避免在多个文件里重复写 Files.readAllBytes 的 try/catch。 */
    private static final class Files {
        static byte[] readAll(File file) {
            try {
                return java.nio.file.Files.readAllBytes(file.toPath());
            } catch (Exception error) {
                return null;
            }
        }
    }
}
