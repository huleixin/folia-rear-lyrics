// android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/MinimalAmbience.kt
package io.github.huleixin.tingyu.minimal.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.withTransform
import io.github.huleixin.tingyu.minimal.Rgb
import io.github.huleixin.tingyu.minimal.argb
import io.github.huleixin.tingyu.minimal.hslToRgb
import io.github.huleixin.tingyu.minimal.rgbToHsl
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

// 封面取色的氛围背景：`minimalAmbience.css` 的五层纯渐变。
//
// 结构上只有两个绘制块：
//   1. 静止层（洗色 / 压暗 / 暗角）—— 不读动画状态，画一次就完了；
//   2. 漂移层（三片光斑）—— 一张全屏 Canvas，位移写进渐变圆心，**不动图层**。
//
// 上一版把每片光斑放在各自的 graphicsLayer 里平移：图层自己的矩形边界一移动就切进屏幕，
// 左边那道竖线、底部那块"漂浮的矩形"就是这三层边界。这里没有图层边界可切 —— 画布恒等于视口。

/** 光斑几何：CSS `ellipse rx% ry% at cx% cy%`（含 `inset:-20%`）换算到视口的比例。 */
private data class Blob(
    val centerX: Float,
    val centerY: Float,
    val radiusX: Float,
    val radiusY: Float,
    val colorIndex: Int,
    val periodSec: Float,
    val phaseOffset: Float,
)

private val BLOBS = listOf(
    Blob(0.248f, 0.192f, 0.868f, 0.728f, 1, 20f, 0f),
    Blob(0.822f, 0.472f, 0.910f, 0.756f, 2, 24f, 0.33f),
    Blob(0.416f, 0.892f, 0.980f, 0.756f, 3, 28f, 0.66f),
)

@Composable
fun MinimalAmbience(
    colors: List<Color>,
    light: Boolean,
    paused: Boolean,
    still: Boolean,
    modifier: Modifier = Modifier,
) {
    var from by remember { mutableStateOf(colors) }
    var to by remember { mutableStateOf(colors) }
    val fade = remember { Animatable(1f) }
    // 换歌时 760ms 从旧配色过渡到新配色（CSS 的 transition），不重建任何图层。
    LaunchedEffect(colors) {
        if (to == colors) return@LaunchedEffect
        from = lerpPalette(from, to, fade.value)
        to = colors
        fade.snapTo(0f)
        fade.animateTo(1f, tween(760, easing = LinearEasing))
    }

    // 漂移相位：一圈 20 秒，位移以像素计极小，6fps 更新相位就够。
    val phase = remember { mutableFloatStateOf(0f) }
    val animate = !still && !paused
    LaunchedEffect(animate) {
        if (!animate) return@LaunchedEffect
        var last = 0L
        while (true) {
            withFrameNanos { now ->
                if (last == 0L) last = now
                if (now - last >= 160_000_000L) {
                    last = now
                    phase.floatValue = (phase.floatValue + 0.16f) % 1000f
                }
            }
        }
    }

    val shade = if (light) Color(0xFF0C201A) else Color.Black
    val shadeAlpha = if (light) 0.3f else 1f
    val blobAlpha = if (light) 0.26f else 0.52f

    Box(modifier.fillMaxSize()) {
        // 1. 洗色：155° 线性渐变 fieldPrimary → base(58%) → fieldSecondary。
        Box(
            Modifier.fillMaxSize().drawBehind {
                val c = lerpPalette(from, to, fade.value)
                drawRect(
                    Brush.linearGradient(
                        colors = listOf(c[1], c[0], c[2]),
                        start = Offset(0f, 0f),
                        end = Offset(size.width * 0.47f, size.height),
                    )
                )
            }
        )
        // 2. 三片光斑：一张画布，位移进圆心。
        Canvas(Modifier.fillMaxSize()) {
            val c = lerpPalette(from, to, fade.value)
            val t = if (animate) phase.floatValue else 0f
            BLOBS.forEach { blob ->
                val theta = 2f * PI.toFloat() * (t / (blob.periodSec * 10f) + blob.phaseOffset)
                drawBlob(
                    palette = c,
                    blob = blob,
                    drift = Offset(
                        x = size.width * 0.13f * sin(theta),
                        y = size.height * 0.10f * cos(theta),
                    ),
                    alpha = blobAlpha,
                )
            }
        }
        // 3. 压暗 + 暗角：整屏，不参与任何变换。
        Box(
            Modifier.fillMaxSize().drawBehind {
                drawRect(
                    Brush.verticalGradient(
                        0f to shade.copy(alpha = 0.18f * shadeAlpha),
                        0.35f to Color.Transparent,
                        1f to shade.copy(alpha = 0.30f * shadeAlpha),
                    )
                )
                drawRect(
                    Brush.radialGradient(
                        colors = listOf(Color.Transparent, shade.copy(alpha = 0.30f * shadeAlpha)),
                        center = Offset(size.width * 0.5f, size.height * 0.42f),
                        radius = size.maxDimension * 0.78f,
                    )
                )
            }
        )
    }
}

/** 一片椭圆光斑。`scale(1, ry/rx)` 把圆压成椭圆，比自定义 shader 便宜，也还是纯渐变。 */
private fun DrawScope.drawBlob(
    palette: List<Color>,
    blob: Blob,
    drift: Offset,
    alpha: Float,
) {
    val color = auroraGlow(palette[blob.colorIndex]).copy(alpha = alpha)
    val center = Offset(size.width * blob.centerX, size.height * blob.centerY) + drift
    val rx = size.width * blob.radiusX
    val ry = size.height * blob.radiusY
    val brush = Brush.radialGradient(
        colorStops = arrayOf(0f to color, 0.76f to Color.Transparent),
        center = center,
        radius = rx,
    )
    withTransform({ scale(1f, ry / rx, pivot = center) }) {
        drawCircle(brush = brush, radius = rx, center = center)
    }
}

/**
 * `minimalAuroraGlow`：把封面派生色提亮到 `l = .62`、饱和度夹在 `.42..72` 再画光斑。
 *
 * 少了这一步，深色主题下光斑用的是 field 原色（l ≈ .2），叠在同样是 .1 的底色上等于没画。
 */
private fun auroraGlow(color: Color): Color {
    val channels = rgbToHsl(
        Rgb(
            (color.red * 255f).roundToInt().coerceIn(0, 255),
            (color.green * 255f).roundToInt().coerceIn(0, 255),
            (color.blue * 255f).roundToInt().coerceIn(0, 255),
        )
    )
    val glow = channels.copy(
        s = (channels.s * 1.2f).coerceIn(0.42f, 0.72f),
        l = 0.62f,
    )
    return Color(argb(hslToRgb(glow)))
}
