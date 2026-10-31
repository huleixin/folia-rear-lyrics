package io.github.huleixin.tingyu.chrome

import android.content.Context
import coil.Coil
import coil.ImageLoader
import coil.disk.DiskCache
import coil.memory.MemoryCache

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeArtworkCache.kt
// Every native page and footer uses the same decoded images and persistent artwork bytes.
internal object NativeArtworkCache {
    private var installed = false
    fun install(context: Context) {
        if (installed) return
        installed = true
        val app = context.applicationContext
        Coil.setImageLoader(ImageLoader.Builder(app)
            .memoryCache { MemoryCache.Builder(app).maxSizePercent(.12).build() }
            // 不能与 NativeArtworkRepository 共用 "native-artwork"：Coil 的 journal/索引文件
            // 会被仓库按 mtime 的 prune 当成普通图片删掉，两套键（URL vs sha1(songKey)）互不
            // 命中，纯粹互相污染。2026-10-31 起分目录。
            .diskCache { DiskCache.Builder().directory(app.cacheDir.resolve("coil-artwork"))
                .maxSizeBytes(64L * 1024 * 1024).build() }
            .respectCacheHeaders(false).crossfade(false).build())
    }
}
