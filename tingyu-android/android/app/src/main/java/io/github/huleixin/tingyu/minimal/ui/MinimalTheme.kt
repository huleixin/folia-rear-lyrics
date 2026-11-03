package io.github.huleixin.tingyu.minimal.ui

import android.content.Context
import android.provider.Settings
import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.huleixin.tingyu.minimal.MinimalPalette
import kotlin.math.max
import kotlin.math.min

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/MinimalTheme.kt
//
// 极简页的文字与线条颜色。数值直接来自 `minimalStage.css` 的 `[data-theme]` 两组变量 ——
// 换一套值就是换一套对比度，所以这里不做"看起来差不多"的调整。

@Immutable
data class MinimalInk(
    val ink: Color,
    val inkBright: Color,
    val muted: Color,
    val track: Color,
    val fill: Color,
    val line: Color,
    val shade: Color,
) {
    /** CSS 里 `color-mix(in srgb, var(--min-ink) N%, transparent)` 的等价写法。 */
    fun inkAlpha(percent: Int): Color = ink.copy(alpha = percent / 100f)
    fun brightAlpha(percent: Int): Color = inkBright.copy(alpha = percent / 100f)
    fun mutedAlpha(percent: Int): Color = muted.copy(alpha = muted.alpha * percent / 100f)
}

fun minimalInk(light: Boolean): MinimalInk = if (light) {
    MinimalInk(
        ink = Color(0xFF10231D),
        inkBright = Color(0xFF061310),
        muted = Color(0xFF10231D).copy(alpha = 0.58f),
        track = Color(0xFF10231D).copy(alpha = 0.18f),
        fill = Color(0xFF10231D).copy(alpha = 0.78f),
        line = Color(0xFF10231D).copy(alpha = 0.14f),
        shade = Color(0xFF0C201A),
    )
} else {
    MinimalInk(
        ink = Color(0xFFF3FAF6),
        inkBright = Color(0xFFFFFFFF),
        muted = Color(0xFFF0F8F4).copy(alpha = 0.44f),
        track = Color(0xFFFFFFFF).copy(alpha = 0.22f),
        fill = Color(0xFFF6FCF9).copy(alpha = 0.92f),
        line = Color(0xFFFFFFFF).copy(alpha = 0.13f),
        shade = Color(0xFF000000),
    )
}

/** `clamp(min, value, max)`，用于把 vh/vw 派生值收进设计区间。 */
fun clampDp(min: Float, value: Float, max: Float): Dp = min(max(value, min), max).dp
fun clampSp(min: Float, value: Float, max: Float): TextUnit = min(max(value, min), max).sp

/**
 * 系统是否关闭了动画（开发者选项 / 无障碍）。
 *
 * 与原实现的 `prefers-reduced-motion` 对齐：关闭时背景漂移、封面浮动、波形都静止，
 * 页面仍然完整可读，只是不再动。
 */
fun reducedMotion(context: Context): Boolean = try {
    Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
} catch (_: Throwable) {
    false
}

/** 主题色在动画开始/结束时需要插值，这里只暴露最小的一组。 */
internal fun paletteColors(palette: MinimalPalette): List<Color> = listOf(
    Color(palette.base),
    Color(palette.fieldPrimary),
    Color(palette.fieldSecondary),
    Color(palette.bloom),
    Color(palette.accent),
    Color(palette.lyricAccent),
)

internal fun lerpPalette(from: List<Color>, to: List<Color>, t: Float): List<Color> =
    from.mapIndexed { index, color -> lerp(color, to.getOrElse(index) { color }, t) }
