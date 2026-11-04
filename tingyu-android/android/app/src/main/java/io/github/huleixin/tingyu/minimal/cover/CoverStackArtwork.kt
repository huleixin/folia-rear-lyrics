package io.github.huleixin.tingyu.minimal.cover

import android.content.Context
import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import io.github.huleixin.tingyu.playback.NativeArtworkRepository
import java.util.concurrent.Executors

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/cover/CoverStackArtwork.kt
//
// 堆叠里四张封面的位图缓存。
//
// 不复用 `MinimalPlayerRuntime.artwork`：那一份只描述**当前正在播的那一首**，它是交叉淡化的
// 判据（settled），不能塞进"下一首""上一首"。这里也不新建下载链路 —— 全部走
// {@link NativeArtworkRepository}（内存 LRU + 磁盘缓存 + 受控下载），所以同一张图在列表、
// 锁屏、封面堆叠之间只下载一次、只解码一次。
//
// 线程模型：解码在单线程后台，结果回主线程写进快照状态；合成层读它决定画什么。
// 一张图最多在飞一次（inflight 去重），避免快速连切时同一张图排十次队。

class CoverStackArtwork(context: Context) {

    private val appContext = context.applicationContext
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "minimal-cover-artwork").apply { isDaemon = true }
    }

    /** songKey → 已解码的位图。读它会让对应的那一层重组一次（图到了才画）。 */
    private val loaded = mutableStateMapOf<String, ImageBitmap>()

    /** 正在飞的 songKey。主线程独占。 */
    private val inflight = HashSet<String>()
    private var shutdown = false

    fun of(songKey: String): ImageBitmap? = if (songKey.isEmpty()) null else loaded[songKey]

    /**
     * 当前曲的封面 runtime 已经解码过了，直接塞进来，避免起播那一帧空一下。
     */
    fun seed(songKey: String, bitmap: Bitmap?) {
        if (songKey.isEmpty() || bitmap == null || bitmap.isRecycled) return
        if (loaded[songKey] != null) return
        loaded[songKey] = bitmap.asImageBitmap()
        inflight.remove(songKey)
    }

    /**
     * 预取：只要有地址、还没到位、也不在飞，就排一次。
     *
     * 用 background 优先级（`urgent = false`）：当前曲的封面永远排在后面几首之前，
     * 网络紧张时先保证屏上那张。
     */
    fun prime(entries: List<CoverEntry?>) {
        for (entry in entries) {
            if (entry == null) continue
            val key = entry.songKey
            if (key.isEmpty() || entry.artwork.isBlank()) continue
            if (loaded.containsKey(key) || inflight.contains(key)) continue
            inflight.add(key)
            val url = entry.artwork
            io.execute {
                val bitmap = try {
                    load(key, url)
                } catch (_: Throwable) {
                    null
                }
                main.post {
                    inflight.remove(key)
                    if (bitmap != null && !bitmap.isRecycled && !loaded.containsKey(key)) {
                        loaded[key] = bitmap.asImageBitmap()
                    }
                }
            }
        }
    }

    /**
     * 地址 → 位图。和 {@code MinimalPlayerRuntime.loadArtworkBitmap} 同一套判定：
     * 网络地址走封面仓库（内存 LRU + 磁盘 + 受控下载），本地曲库的 content:// / file://
     * 直接解码。blob: 是 WebView 内部的临时地址，原生读不到，退回占位图。
     */
    private fun load(songKey: String, url: String): Bitmap? {
        if (url.isBlank()) return null
        val lower = url.lowercase(java.util.Locale.US)
        if (lower.startsWith("http://") || lower.startsWith("https://")) {
            return NativeArtworkRepository.get(appContext).load(songKey, url, false)?.bitmap
        }
        if (lower.startsWith("content://") || lower.startsWith("file://")) {
            return try {
                appContext.contentResolver.openInputStream(android.net.Uri.parse(url))?.use { stream ->
                    android.graphics.BitmapFactory.decodeStream(stream)
                }
            } catch (_: Throwable) {
                null
            }
        }
        return null
    }

    fun release() {
        if (shutdown) return
        shutdown = true
        io.shutdownNow()
    }
}
