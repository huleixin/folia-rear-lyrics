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
 *   <li>磁盘按 192 MiB 预算淘汰，保护当前和近期封面；内存 LRU 12 MB；</li>
 *   <li>只接受非空 Bitmap：0×0 的「解码成功」发布出去就是一块空白，比占位图更糟。</li>
 * </ul>
 */
public final class NativeArtworkRepository {

    private static final String USER_AGENT = "Tingyu/1.3.50 (+https://github.com/huleixin/tingyu)";
    private static final int MAX_BYTES = 6 * 1024 * 1024;
    private static final int TARGET_EDGE_PX = 768;
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

    private volatile long retryNotBefore;
    public long retryNotBefore() { return retryNotBefore; }
    private final java.util.concurrent.atomic.AtomicInteger writesSincePrune = new java.util.concurrent.atomic.AtomicInteger();
    private final File dir;
    private final java.util.Map<String,String> aliases = java.util.Collections.synchronizedMap(new java.util.LinkedHashMap<String,String>(16,0.75f,true) {
        @Override protected boolean removeEldestEntry(java.util.Map.Entry<String,String> e) { return size()>256; }
    });
    private final java.util.Map<String, java.util.concurrent.FutureTask<File>> flights = new java.util.concurrent.ConcurrentHashMap<>();
    private final java.util.concurrent.Semaphore backgroundDownloads = new java.util.concurrent.Semaphore(1, true);
    private final java.util.concurrent.Semaphore downloads = new java.util.concurrent.Semaphore(2, true);
    private volatile java.util.Set<String> protectedNames = java.util.Collections.emptySet();
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
        Bitmap cached = memory.get(memoryKey(songKey));
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
        memory.put(memoryKey(songKey), decoded);
        return new Result(Status.CACHE_HIT, decoded, 0, (int) file.length(), decoded.getWidth(), decoded.getHeight());
    }

    /** 阻塞调用，必须在后台线程执行。 */
    public Result load(String songKey, String url) { return load(songKey, url, true); }
    public Result load(String songKey, String url, boolean urgent) {
        if (url == null || url.trim().isEmpty()) return new Result(Status.MISSING_URI, null, 0, 0, 0, 0);
        // 本地曲库封面：WebView 侧已把 blob:/__folia_cover/ 统一解析成 data:image/jpeg;base64。
        // 它没有可下载的 URL，OkHttp 分支永远失败 —— 直接解码字节，锁屏/通知才有图。
        // 不 bind：data: 很长，不该进 URL 别名与磁盘缓存键；换歌时由 SongInfoLoader 重新解码一次。
        if (url.startsWith("data:image/") && url.contains(";base64,")) {
            try {
                byte[] bytes = android.util.Base64.decode(
                        url.substring(url.indexOf(',') + 1), android.util.Base64.DEFAULT);
                Bitmap inline = decode(bytes);
                if (inline == null) return new Result(Status.DECODE_FAILED, null, 0, 0, 0, 0);
                return new Result(Status.FETCHED, inline, 200, bytes.length,
                        inline.getWidth(), inline.getHeight());
            } catch (Exception error) {
                return new Result(Status.DECODE_FAILED, null, 0, 0, 0, 0);
            }
        }
        bind(songKey, url);
        Result cached = readCache(songKey);
        if (cached != null) return cached;
        try {
            File file = ensureFile(url, urgent);
            Bitmap bitmap = memory.get(ResourceCachePolicy.artworkIdentity(url));
            if (bitmap == null) bitmap = decode(Files.readAll(file));
            if (bitmap == null) return new Result(Status.DECODE_FAILED, null, 0, 0, 0, 0);
            memory.put(ResourceCachePolicy.artworkIdentity(url), bitmap);
            return new Result(Status.FETCHED, bitmap, 200, (int)file.length(), bitmap.getWidth(), bitmap.getHeight());
        } catch (Exception error) {
            return new Result(Status.NETWORK, null, -1, 0, 0, 0);
        }
    }

    public void bind(String songKey, String url) {
        String previous = aliases.getOrDefault(songKey, "");
        if (!url.equals(previous)) {
            aliases.put(songKey, url);
        }
    }
    private String memoryKey(String songKey) {
        String url = aliases.getOrDefault(songKey, "");
        return url.isEmpty() ? songKey : ResourceCachePolicy.artworkIdentity(url);
    }
    public boolean matches(String songKey, String url) {
        return url.equals(aliases.getOrDefault(songKey, ""));
    }
    public File cachedFile(String url) {
        File f = new File(dir, NativeLyricsRepository.sha1(ResourceCachePolicy.artworkIdentity(url)) + ".img");
        return f.isFile() && f.length() > 0 ? f : null;
    }

    /** Single flight by resource identity; bulk callers never retain decoded bitmaps. */
    public File ensureFile(String url) throws Exception { return ensureFile(url, true); }
    public File ensureFile(String url, boolean urgent) throws Exception {
        if (url == null || url.isEmpty()) throw new IOException("missing-uri");
        File cached = cachedFile(url);
        if (cached != null) { cached.setLastModified(System.currentTimeMillis()); return cached; }
        String id = ResourceCachePolicy.artworkIdentity(url);
        java.util.concurrent.FutureTask<File> task = new java.util.concurrent.FutureTask<>(() -> {
            if (!urgent) backgroundDownloads.acquire();
            boolean acquired = false;
            try {
                downloads.acquire(); acquired = true;
                File again = cachedFile(url);
                if (again != null) return again;
                if (System.currentTimeMillis() < retryNotBefore) throw new IOException("rate-limited");
                Request request = new Request.Builder().url(ResourceCachePolicy.artworkDownloadUrl(url)).header("User-Agent", USER_AGENT).header("Accept", "image/*").build();
                try (Response response = client.newCall(request).execute()) {
                    if (response.code() == 429) retryNotBefore = ResourceCachePolicy.retryNotBefore(response.header("Retry-After"), System.currentTimeMillis());
                    if (!response.isSuccessful()) throw new IOException("http-" + response.code());
                    if (response.body() == null) throw new IOException("empty-body");
                    byte[] bytes = readLimited(response.body(), MAX_BYTES);
                    Bitmap bitmap = decode(bytes);
                    if (bitmap == null) throw new IOException("decode-or-size");
                    File target = new File(dir, NativeLyricsRepository.sha1(id) + ".img");
                    try { writeImage(target, bitmap); }
                    finally { if (urgent) memory.put(id, bitmap); else bitmap.recycle(); }
                    if (!target.isFile()) throw new IOException("disk-write");
                    if (writesSincePrune.incrementAndGet() % 8 == 0) prune();
                    if (!target.isFile()) throw new IOException("disk-budget");
                    return target;
                }
            } finally { if (acquired) downloads.release(); if (!urgent) backgroundDownloads.release(); }
        });
        java.util.concurrent.FutureTask<File> running = flights.putIfAbsent(id, task);
        if (running != null) return running.get();
        try { task.run(); return task.get(); } finally { flights.remove(id, task); }
    }

    public void protect(java.util.List<SongInfo> songs) {
        java.util.Set<String> next = new java.util.HashSet<>();
        for (SongInfo info : songs) if (!info.artworkUrl.isEmpty())
            next.add(NativeLyricsRepository.sha1(ResourceCachePolicy.artworkIdentity(info.artworkUrl)) + ".img");
        protectedNames = next;
    }
    public long diskBytes() { return ResourceDiskBudget.bytes(dir); }
    public void clearDownloadable() {
        memory.evictAll();
        File[] files = dir.listFiles();
        if (files != null) for (File f : files) if (!protectedNames.contains(f.getName()) && !f.getName().endsWith(".tmp")) f.delete();
    }

    /** 供服务直接取内存里的那一张（换歌瞬间避免重复解码）。 */
    public Bitmap peek(String songKey) {
        Bitmap cached = memory.get(memoryKey(songKey));
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
        while (longest / sample > TARGET_EDGE_PX && sample < 4096) sample *= 2;
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

    private void writeImage(File target, Bitmap bitmap) {
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
        ResourceDiskBudget.prune(dir, ResourceCachePolicy.ARTWORK_BYTES, f -> protectedNames.contains(f.getName()));
    }

    private File fileFor(String songKey) {
        String url = aliases.getOrDefault(songKey, "");
        return new File(dir, NativeLyricsRepository.sha1(url.isEmpty() ? songKey : ResourceCachePolicy.artworkIdentity(url)) + ".img");
    }

    /**
     * 只是为了避免在多个文件里重复写「整文件读入」的 try/catch。
     *
     * <p>用 {@code FileInputStream} 而不是 {@code java.nio.file.Files}：后者在 Android 上
     * 是 API 26 才有的，而本项目 minSdk 是 24 —— 在 24/25 的机器上，第一次读缓存就会以
     * {@code NoClassDefFoundError} 的形式直接闪退。
     */
    private static final class Files {
        static byte[] readAll(File file) {
            try (java.io.FileInputStream stream = new java.io.FileInputStream(file)) {
                ByteArrayOutputStream out = new ByteArrayOutputStream((int) Math.max(64, file.length()));
                byte[] buffer = new byte[8192];
                int read;
                while ((read = stream.read(buffer)) != -1) out.write(buffer, 0, read);
                return out.toByteArray();
            } catch (Exception error) {
                return null;
            }
        }
    }
}
