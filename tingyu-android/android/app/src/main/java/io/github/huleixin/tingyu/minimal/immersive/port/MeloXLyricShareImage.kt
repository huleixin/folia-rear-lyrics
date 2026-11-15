package io.github.huleixin.tingyu.minimal.immersive.port

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.text.StaticLayout
import android.text.TextPaint
import androidx.core.content.FileProvider
import androidx.compose.ui.graphics.toArgb
import io.github.huleixin.tingyu.minimal.immersive.MeloXPlaybackUiState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

// SPDX-License-Identifier: GPL-3.0-only
// Adapted from MeloX 0.7.3 MeloXLyricShareImage.kt, c04f36b9af540806b3bb185b347572e9ca12d87d.
// Tingyu: reuse decoded artwork, system fonts, wrapped and paginated text, cache-only sharing.

/** Build bounded pages without truncating lyrics or recycling the shared runtime artwork. */
internal suspend fun shareLyricImage(context: Context, state: MeloXPlaybackUiState, lines: List<LyricLine>) {
    val uris = withContext(Dispatchers.IO) {
        require(lines.isNotEmpty()) { "请至少选择一行歌词" }
        val cover = state.artworkBitmap
        val palette = cover?.let(ArtworkDynamicPaletteProvider::makePalette) ?: ArtworkDynamicPalette.Fallback
        val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = android.graphics.Color.WHITE
            textSize = 40f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        fun layout(text: String): StaticLayout = StaticLayout.Builder.obtain(text, 0, text.length, paint, 924)
            .setIncludePad(false).setLineSpacing(8f, 1f).build()
        val blocks = lines.map { layout(it.text) }
        val pages = mutableListOf<MutableList<StaticLayout>>(mutableListOf())
        var used = 0
        for (block in blocks) {
            require(block.height <= 3500) { "单行歌词过长，请改用分享文本" }
            if (used + block.height + 30 > 3500 && pages.last().isNotEmpty()) {
                pages.add(mutableListOf())
                used = 0
            }
            pages.last().add(block)
            used += block.height + 30
        }
        val folder = File(context.cacheDir, "lyric_share").apply { mkdirs() }
        folder.listFiles()?.filter { it.isFile && System.currentTimeMillis() - it.lastModified() > 86_400_000 }
            ?.forEach { it.delete() }
        pages.mapIndexed { pageIndex, page ->
            val height = 450 + page.sumOf { it.height + 30 }
            val bitmap = Bitmap.createBitmap(1080, height, Bitmap.Config.ARGB_8888)
            try {
                val canvas = Canvas(bitmap)
                canvas.drawColor(palette.average.toArgb())
                val shade = Paint().apply { color = android.graphics.Color.argb(100, 0, 0, 0) }
                canvas.drawRect(0f, 0f, 1080f, height.toFloat(), shade)
                cover?.let { canvas.drawBitmap(it, null, RectF(78f, 65f, 278f, 265f), Paint(Paint.FILTER_BITMAP_FLAG)) }
                val header = TextPaint(paint).apply { textSize = 35f }
                canvas.drawText(state.title.take(30), 315f, 125f, header)
                header.textSize = 28f
                canvas.drawText(state.artist.take(36), 315f, 180f, header)
                canvas.drawText("听屿 · 把听见的喜欢，留在身边", 78f, 320f, header)
                var y = 380f
                page.forEach { block ->
                    canvas.save()
                    canvas.translate(78f, y)
                    block.draw(canvas)
                    canvas.restore()
                    y += block.height + 30
                }
                val file = File(folder, "tingyu-${System.currentTimeMillis()}-$pageIndex.png")
                file.outputStream().use { check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)) }
                FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            } finally { bitmap.recycle() }
        }
    }
    withContext(Dispatchers.Main.immediate) {
        val intent = Intent(if (uris.size == 1) Intent.ACTION_SEND else Intent.ACTION_SEND_MULTIPLE).apply {
            type = "image/png"
            if (uris.size == 1) putExtra(Intent.EXTRA_STREAM, uris[0])
            else putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList(uris))
            clipData = ClipData.newUri(context.contentResolver, "听屿歌词", uris[0]).apply {
                uris.drop(1).forEach { addItem(ClipData.Item(it)) }
            }
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "分享歌词图片").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
    }
}
