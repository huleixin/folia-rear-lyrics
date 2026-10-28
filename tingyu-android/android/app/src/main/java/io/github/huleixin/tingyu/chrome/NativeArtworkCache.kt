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
            .diskCache { DiskCache.Builder().directory(app.cacheDir.resolve("native-artwork"))
                .maxSizeBytes(64L * 1024 * 1024).build() }
            .respectCacheHeaders(false).crossfade(false).build())
    }
}
