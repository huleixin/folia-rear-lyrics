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
// 同一个 (songKey, 地址) 最多在飞一次；地址变化（本地封面 blob: → data:）才允许重排。

class CoverStackArtwork(context: Context) {

    private val appContext = context.applicationContext
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "minimal-cover-artwork").apply { isDaemon = true }
    }

    /** songKey → 已解码的位图。读它会让对应的那一层重组一次（图到了才画）。 */
    private val loaded = mutableStateMapOf<String, ImageBitmap>()

    /**
     * songKey → 正在解码的封面地址。主线程独占。
     *
     * 记地址而不只是「在飞」：本地封面第一次过桥时仍是 WebView 专用的 blob:/__folia_cover/，
     * 解析成 data: 后逻辑歌单会重推一次。同一个 songKey 换了地址必须允许重新解码，
     * 否则旧地址那次失败会把这一首永远钉在占位图上（后面的卡片一直是黑的）。
     */
    private val inflight = HashMap<String, String>()
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
            val url = entry.artwork
            if (key.isEmpty() || url.isBlank()) continue
            // 已有位图（含当前曲 seed 进来的那张）就不再解码。
            if (loaded.containsKey(key)) continue
            // 同一地址只排一次；地址变了就覆盖登记，旧任务的结果会在回主线程时被丢弃。
            if (inflight[key] == url) continue
            inflight[key] = url
            io.execute {
                val bitmap = try {
                    load(key, url)
                } catch (_: Throwable) {
                    null
                }
                main.post {
                    if (inflight[key] != url) return@post
                    // 失败时清掉登记：下一次 sync（封面解析完成后的重推）可以再试一次。
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
     * 在线地址与本地曲库的 data:image/...;base64 统一交给封面仓库（内存 LRU + 磁盘 +
     * 受控下载 + 内联 Base64 解码），content:// / file:// 直接解码。
     *
     * 本地封面由 WebView 侧统一从 blob:/__folia_cover/ 转成 data: 后过桥，堆叠卡片拿到
     * 的就是 data:；以前这里只放行 http(s)，data: 直接落到 return null，于是除顶层（被
     * seed 救过）外每一层都是深色占位图。复用仓库避免再维护第二份解码器。
     */
    private fun load(songKey: String, url: String): Bitmap? {
        if (url.isBlank()) return null
        val lower = url.lowercase(java.util.Locale.US)
        if (lower.startsWith("http://") || lower.startsWith("https://")
            || (lower.startsWith("data:image/") && ";base64," in lower)) {
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
