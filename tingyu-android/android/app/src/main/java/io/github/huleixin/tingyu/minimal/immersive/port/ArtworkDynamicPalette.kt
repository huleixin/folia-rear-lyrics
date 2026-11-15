package io.github.huleixin.tingyu.minimal.immersive.port

import android.graphics.Bitmap
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.toArgb

// SPDX-License-Identifier: GPL-3.0-only
// Adapted from lladlam/MeloX-Android 0.7.3, c04f36b9af540806b3bb185b347572e9ca12d87d.
// Tingyu modifications: existing playback/lyrics/artwork adapters; no provider or service migration.


internal data class ArtworkDynamicPalette(
    val cells: List<Color>,
    val average: Color,
    /**
     * 封面**未做饱和增强**的面积平均亮度（0=纯黑 1=纯白），★ 2026-10-26。
     *
     * 用途：播放页封面光晕的自适应压暗（`coverDimFactor`）需要一个"这张封面有多亮"
     * 的标量。原先由 `MeloXIOSNowPlayingSharedHost.averageLuma()` 从 **Coil 的
     * HARDWARE 位图**上采样 —— 而 HARDWARE 位图的像素在 GPU 里，`copy(ARGB_8888)`
     * 会触发 `RenderProxy#copyHWBitmapInto readback`：**一次同步 GPU→CPU 回读**，
     * 实测 12.69ms，同时 RenderThread 侧 `copyImageInto` 再抢 10.85ms 同一块 GPU
     * （与像素量无关，384×384 也要 ~12ms，是 GPU 往返的固定代价）。
     *
     * 而本 palette 本来就用 `BitmapFactory` 解过同一张封面（软件位图，ARGB_8888，
     * 缩到 ≤160px），`makePalette` 里也已经算过面积平均色 —— 亮度在这里是**白送**的，
     * 复用它与 `averageLuma()` 在 1216px 上采样**数学等价**（都是面积平均）。
     */
    val luma: Float,
) {
    /** Equal-area sampling of both covers, retaining the existing 3x3 mesh. */
    fun combinedWith(other: ArtworkDynamicPalette): ArtworkDynamicPalette {
        // A missing/failed cover should not tint the real cover with fallback colors.
        if (this === Fallback) return other
        if (other === Fallback || this == other) return this
        return ArtworkDynamicPalette(
            cells = List(9) { index ->
                lerp(cells.getOrElse(index) { average }, other.cells.getOrElse(index) { other.average }, .5f)
            },
            average = lerp(average, other.average, .5f),
            // ★ 合并后补齐：luma 是本地 2026-10-26 新增字段（Rec.709 亮度），
            //   combinedWith 也要插值，否则构造不完整。
            luma = (luma + other.luma) / 2f,
        )
    }

    companion object {
        val Fallback = ArtworkDynamicPalette(
            cells = listOf(
                Color(0xFF101E3D), Color(0xFF2E1A57), Color(0xFF0F3B4D),
                Color(0xFF38143D), Color(0xFF24476B), Color(0xFF4D1F4D),
                Color(0xFF0D2E42), Color(0xFF291A4D), Color(0xFF121C33),
            ),
            average = Color(0xFF171D32),
            // 与 `average` 同源：0.2126·R + 0.7152·G + 0.0722·B（Rec.709，与 averageLuma 同式）。
            luma = 0.2126f * 0x17 / 255f + 0.7152f * 0x1D / 255f + 0.0722f * 0x32 / 255f,
        )
    }
}


internal object ArtworkDynamicPaletteProvider {
    private const val GRID = 3
    fun makePalette(bitmap: Bitmap): ArtworkDynamicPalette {
        val width = bitmap.width
        val height = bitmap.height
        val cellWidth = width / GRID
        val cellHeight = height / GRID
        val rawCells = buildList(GRID * GRID) {
            for (row in 0 until GRID) {
                for (column in 0 until GRID) {
                    val left = column * cellWidth
                    val top = row * cellHeight
                    val right = if (column == GRID - 1) width else (column + 1) * cellWidth
                    val bottom = if (row == GRID - 1) height else (row + 1) * cellHeight
                    add(averageColor(bitmap, left, top, right, bottom))
                }
            }
        }
        val cells = rawCells.map { it.boostSaturation(1.2f) }
        // ★ 2026-10-26：整图平均色**只算一次**，average 与 luma 同源（luma 取未 boost 的那份
        //   —— boostSaturation 走 HSL 只抬饱和度、L 不变，所以两者亮度本就相同；这里仍显式
        //   用 raw 值，避免将来有人改 boost 的实现时把亮度一起带偏）。
        val rawAverage = averageColor(bitmap, 0, 0, width, height)
        return ArtworkDynamicPalette(
            cells = cells,
            average = rawAverage.boostSaturation(1.1f),
            luma = (0.2126f * rawAverage.red + 0.7152f * rawAverage.green + 0.0722f * rawAverage.blue)
                .coerceIn(0f, 1f),
        )
    }

    private fun Color.boostSaturation(multiplier: Float): Color {
        val hsl = FloatArray(3)
        androidx.core.graphics.ColorUtils.colorToHSL(this.toArgb(), hsl)
        if (hsl[1] < 0.08f) return this
        hsl[1] = (hsl[1] * multiplier).coerceIn(0f, 1f)
        return Color(androidx.core.graphics.ColorUtils.HSLToColor(hsl))
    }

    private fun averageColor(
        bitmap: Bitmap,
        left: Int,
        top: Int,
        right: Int,
        bottom: Int,
    ): Color {
        var red = 0L
        var green = 0L
        var blue = 0L
        var count = 0L

        // Sample every second pixel. A 160x160 input is already tiny and this
        // keeps palette extraction cheap enough to perform on every song swap.
        var y = top
        while (y < bottom) {
            var x = left
            while (x < right) {
                val pixel = bitmap.getPixel(x, y)
                red += (pixel shr 16) and 0xFF
                green += (pixel shr 8) and 0xFF
                blue += pixel and 0xFF
                count += 1
                x += 2
            }
            y += 2
        }

        if (count == 0L) return Color(0xFF5B4B45)
        return Color(
            red = (red.toFloat() / count / 255f).coerceIn(0f, 1f),
            green = (green.toFloat() / count / 255f).coerceIn(0f, 1f),
            blue = (blue.toFloat() / count / 255f).coerceIn(0f, 1f),
            alpha = 1f,
        )
    }

}
