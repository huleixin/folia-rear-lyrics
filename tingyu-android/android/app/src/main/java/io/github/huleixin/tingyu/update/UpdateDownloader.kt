package io.github.huleixin.tingyu.update

import android.content.Context
import android.os.StatFs
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit
import kotlin.coroutines.coroutineContext

// android/app/src/main/java/io/github/huleixin/tingyu/update/UpdateDownloader.kt
// 原生 APK 下载器：应用专属目录存储、空间预检、HTTP Range 断点续传、真实速率采样与主备节点自动故障切换。

class UpdateDownloader(
    private val context: Context,
    private val httpClient: OkHttpClient = defaultDownloadHttpClient(),
) {
    fun updatesDirectory(): File = File(context.filesDir, "updates").apply { mkdirs() }

    fun targetApkFile(manifest: UpdateManifest): File =
        File(updatesDirectory(), "tingyu-${manifest.latestVersionCode}-${manifest.sha256.take(12)}.apk")

    fun partApkFile(manifest: UpdateManifest): File =
        File(updatesDirectory(), "tingyu-${manifest.latestVersionCode}-${manifest.sha256.take(12)}.apk.part")

    fun cleanObsoleteFiles(keepVersionCode: Long = -1L, keepShaPrefix: String = "") {
        val dir = updatesDirectory()
        val keepPrefix = if (keepVersionCode > 0 && keepShaPrefix.isNotEmpty()) {
            "tingyu-$keepVersionCode-$keepShaPrefix"
        } else ""
        dir.listFiles()?.forEach { file ->
            if (keepPrefix.isEmpty() || !file.name.startsWith(keepPrefix)) {
                runCatching { file.delete() }
            }
        }
    }

    sealed class DownloadResult {
        data class Success(val apkFile: File, val node: DownloadMirror) : DownloadResult()
        data class Failed(val errorCode: String, val errorMessage: String) : DownloadResult()
    }

    suspend fun downloadApk(
        manifest: UpdateManifest,
        preferredMirrorId: String = "",
        onProgress: (DownloadSnapshot) -> Unit,
    ): DownloadResult = withContext(Dispatchers.IO) {
        val finalFile = targetApkFile(manifest)
        val partFile = partApkFile(manifest)

        if (finalFile.exists() && finalFile.length() == manifest.apkSizeBytes) {
            val sha = ApkVerifier.computeFileSha256(finalFile)
            if (sha.equals(manifest.sha256, ignoreCase = true)) {
                val mirror = manifest.downloadUrls.firstOrNull { it.id == preferredMirrorId }
                    ?: manifest.downloadUrls.first()
                return@withContext DownloadResult.Success(finalFile, mirror)
            } else {
                runCatching { finalFile.delete() }
            }
        }

        // 检查可用存储空间（预留至少 32 MiB 安全余量）
        val existingBytes = if (partFile.exists()) partFile.length() else 0L
        val neededBytes = (manifest.apkSizeBytes - existingBytes).coerceAtLeast(0L) + 32L * 1024L * 1024L
        val availableBytes = runCatching { StatFs(updatesDirectory().absolutePath).availableBytes }.getOrDefault(Long.MAX_VALUE)
        if (availableBytes < neededBytes) {
            return@withContext DownloadResult.Failed(
                "insufficient_storage",
                "手机剩余存储空间不足（至少需要 ${(neededBytes / (1024 * 1024))} MB 可用空间）。",
            )
        }

        val orderedMirrors = buildOrderedMirrors(manifest.downloadUrls, preferredMirrorId)
        if (orderedMirrors.isEmpty()) {
            return@withContext DownloadResult.Failed("no_mirrors", "当前更新配置未提供有效下载地址。")
        }

        var lastCode = "download_failed"
        var lastMsg = "下载失败，请检查网络连接或切换备用节点重试。"

        for (mirror in orderedMirrors) {
            coroutineContext.ensureActive()
            val attempt = downloadFromSingleMirror(manifest, mirror, partFile, finalFile, onProgress)
            if (attempt is DownloadResult.Success) {
                return@withContext attempt
            } else if (attempt is DownloadResult.Failed) {
                lastCode = attempt.errorCode
                lastMsg = attempt.errorMessage
            }
        }

        DownloadResult.Failed(lastCode, lastMsg)
    }

    private suspend fun downloadFromSingleMirror(
        manifest: UpdateManifest,
        mirror: DownloadMirror,
        partFile: File,
        finalFile: File,
        onProgress: (DownloadSnapshot) -> Unit,
    ): DownloadResult {
        var resumeFrom = if (partFile.exists()) partFile.length() else 0L
        if (manifest.apkSizeBytes > 0L && resumeFrom > manifest.apkSizeBytes) {
            runCatching { partFile.delete() }
            resumeFrom = 0L
        }

        val reqBuilder = Request.Builder()
            .url(mirror.url)
            .header("User-Agent", "Tingyu-Android-Updater/1.0")
            .get()
        if (resumeFrom > 0L) {
            reqBuilder.header("Range", "bytes=$resumeFrom-")
        }

        return try {
            httpClient.newCall(reqBuilder.build()).execute().use { response ->
                if (response.code == 416) {
                    // Range 越界：重置分片文件
                    runCatching { partFile.delete() }
                    return DownloadResult.Failed("range_not_satisfiable", "断点续传范围失效，请重试。")
                }
                if (!response.isSuccessful && response.code != 206) {
                    return DownloadResult.Failed(
                        "http_${response.code}",
                        "${mirror.label} 响应异常（HTTP ${response.code}）。",
                    )
                }

                val isPartial = response.code == 206 && resumeFrom > 0L
                val startOffset = if (isPartial) resumeFrom else 0L
                val body = response.body ?: return DownloadResult.Failed("empty_body", "${mirror.label} 返回空内容。")
                val contentLength = body.contentLength()
                val totalBytes = when {
                    contentLength > 0L -> startOffset + contentLength
                    manifest.apkSizeBytes > 0L -> manifest.apkSizeBytes
                    else -> -1L
                }

                onProgress(
                    DownloadSnapshot(
                        phase = DownloadPhase.DOWNLOADING,
                        downloadedBytes = startOffset,
                        totalBytes = totalBytes,
                        speedBytesPerSec = 0L,
                        activeNodeId = mirror.id,
                        activeNodeLabel = mirror.label,
                    )
                )

                var downloaded = startOffset
                var windowStartMs = System.currentTimeMillis()
                var windowBytes = 0L
                var smoothedSpeed = 0L
                val buffer = ByteArray(32 * 1024)

                body.byteStream().use { input ->
                    FileOutputStream(partFile, isPartial).use { output ->
                        while (true) {
                            coroutineContext.ensureActive()
                            val read = input.read(buffer)
                            if (read < 0) break
                            if (read == 0) continue
                            output.write(buffer, 0, read)
                            downloaded += read
                            windowBytes += read

                            if (manifest.apkSizeBytes > 0L && downloaded > manifest.apkSizeBytes + 1024L * 1024L) {
                                output.close()
                                runCatching { partFile.delete() }
                                return DownloadResult.Failed("size_overflow", "下载数据超出预期安装包大小，已中止。")
                            }

                            val now = System.currentTimeMillis()
                            val elapsed = now - windowStartMs
                            if (elapsed >= 250L) {
                                val instantSpeed = (windowBytes * 1000L) / elapsed.coerceAtLeast(1L)
                                smoothedSpeed = if (smoothedSpeed == 0L) instantSpeed else (smoothedSpeed * 6 + instantSpeed * 4) / 10
                                windowStartMs = now
                                windowBytes = 0L
                                onProgress(
                                    DownloadSnapshot(
                                        phase = DownloadPhase.DOWNLOADING,
                                        downloadedBytes = downloaded,
                                        totalBytes = totalBytes,
                                        speedBytesPerSec = smoothedSpeed,
                                        activeNodeId = mirror.id,
                                        activeNodeLabel = mirror.label,
                                    )
                                )
                            }
                        }
                        output.flush()
                    }
                }

                if (manifest.apkSizeBytes > 0L && partFile.length() != manifest.apkSizeBytes) {
                    return DownloadResult.Failed(
                        "incomplete_stream",
                        "${mirror.label} 下载未完整结束（已收 ${partFile.length()} / ${manifest.apkSizeBytes} 字节），可点击继续下载。",
                    )
                }

                if (finalFile.exists()) runCatching { finalFile.delete() }
                if (!partFile.renameTo(finalFile)) {
                    partFile.copyTo(finalFile, overwrite = true)
                    runCatching { partFile.delete() }
                }
                DownloadResult.Success(finalFile, mirror)
            }
        } catch (ce: CancellationException) {
            throw ce
        } catch (e: Exception) {
            DownloadResult.Failed(
                "network_io_error",
                "${mirror.label} 网络连接中断（${e.javaClass.simpleName}），已保留已下载进度。",
            )
        }
    }

    private fun buildOrderedMirrors(
        mirrors: List<DownloadMirror>,
        preferredId: String,
    ): List<DownloadMirror> {
        if (preferredId.isBlank()) return mirrors.sortedBy { it.priority }
        val preferred = mirrors.filter { it.id == preferredId }
        val rest = mirrors.filter { it.id != preferredId }.sortedBy { it.priority }
        return preferred + rest
    }

    companion object {
        fun defaultDownloadHttpClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(12, TimeUnit.SECONDS)
            .readTimeout(25, TimeUnit.SECONDS)
            .followRedirects(true)
            .followSslRedirects(true)
            .retryOnConnectionFailure(true)
            .build()
    }
}
