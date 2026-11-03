package io.github.huleixin.tingyu.minimal.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.drawBehind
import io.github.huleixin.tingyu.minimal.Rgb
import io.github.huleixin.tingyu.minimal.argb
import io.github.huleixin.tingyu.minimal.hslToRgb
import io.github.huleixin.tingyu.minimal.rgbToHsl
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/MinimalAmbience.kt
//
// 封面取色的氛围背景：`minimalAmbience.css` 的五层纯渐变。
//
// 两个性能约定，和原实现一一对应：
//   · 每一层是**一张缓存好的渐变**，每帧只动 transform（`graphicsLayer`），不重画渐变；
//   · 没有 canvas / shader / blur / blend，全屏只有一个不透明底色 + 三个很淡的光斑。
//
// 漂移节奏（20/24/28 秒一个来回）与 CSS 的 10/12/14s alternate 等价；25fps 更新一次相位就够 ——
// 这个动画一秒钟只走半个像素，逐帧更新纯属浪费。

@Composable
fun MinimalAmbience(
    colors: List<Color>,
    light: Boolean,
    paused: Boolean,
    still: Boolean,
    modifier: Modifier = Modifier,
) {
    val progress = remember { Animatable(1f) }
    var from by remember { mutableStateOf(colors) }
    var to by remember { mutableStateOf(colors) }
    // 换歌时 760ms 从旧配色过渡到新配色；只在颜色真的变了的时候启动。
    LaunchedEffect(colors) {
        if (from == to && to == colors) return@LaunchedEffect
        from = lerpPalette(from, to, progress.value)
        to = colors
        progress.snapTo(0f)
        progress.animateTo(1f, tween(760, easing = LinearEasing))
    }

    val phase = remember { mutableFloatStateOf(0f) }
    val animate = !still && !paused
    LaunchedEffect(animate) {
        if (!animate) return@LaunchedEffect
        var last = 0L
        while (true) {
            withFrameNanos { now ->
                if (last == 0L) last = now
                // ~25fps：这个漂移的位移速度决定了更高的刷新率看不出来。
                if (now - last >= 40_000_000L) {
                    last = now
                    phase.floatValue = (phase.floatValue + 0.04f) % 1000f
                }
            }
        }
    }
    // 暂停时保留当前相位（CSS 的 animation-play-state: paused），不做额外处理。

    Box(modifier.fillMaxSize()) {
        // 1. 底色洗：155° 线性渐变 fieldPrimary → base(58%) → fieldSecondary
        Box(
            Modifier.fillMaxSize().drawBehind {
                val c = lerpPalette(from, to, progress.value)
                drawRect(
                    Brush.linearGradient(
                        colors = listOf(c[1], c[0], c[2]),
                        start = Offset(0f, 0f),
                        end = Offset(size.width * 0.47f, size.height),
                    )
                )
            }
        )
        // 2. 三片光斑（overscan -20%，位移永远露不出边）
        // 半径按 CSS 的 `ellipse 62% 52% at 32% 28%` 给，且是**椭圆**：整屏一个圆
        // 会把洗色全盖住，页面就退化成一块单色 —— 上一版偏紫就是这么来的。
        // 几何从 CSS 直接换算：光斑元素是 `inset: -20%`（1.4 屏），`ellipse rx% ry% at cx% cy%`
        // 的百分比是相对这个 1.4 屏的盒子；换算到视口就是下面的半径与圆心。
        // 之前用"整屏大小的圆"，三个光斑互相盖住，洗色被吃掉，整页退成一块单色。
        AuroraBlob(from, to, progress, phase, light, animate, period = 20f, offset = 0f, colorIndex = 1,
            centerX = 0.248f, centerY = 0.192f, radiusX = 0.868f, radiusY = 0.728f, modifier = Modifier)
        AuroraBlob(from, to, progress, phase, light, animate, period = 24f, offset = 0.33f, colorIndex = 2,
            centerX = 0.822f, centerY = 0.472f, radiusX = 0.910f, radiusY = 0.756f, modifier = Modifier)
        AuroraBlob(from, to, progress, phase, light, animate, period = 28f, offset = 0.66f, colorIndex = 3,
            centerX = 0.416f, centerY = 0.892f, radiusX = 0.980f, radiusY = 0.756f, modifier = Modifier)
        // 3. 上下压暗（veil）
        Box(
            Modifier.fillMaxSize().drawBehind {
                // `--min-shade`：深色是纯黑（0 0 0），浅色是 12 32 26 —— 照抄，不按封面调。
                val shade = if (light) Color(0xFF0C201A) else Color.Black
                drawRect(
                    Brush.verticalGradient(
                        0f to shade.copy(alpha = 0.18f * (if (light) 0.3f else 1f)),
                        0.35f to Color.Transparent,
                        1f to shade.copy(alpha = 0.30f * (if (light) 0.3f else 1f)),
                    )
                )
            }
        )
        // 4. 暗角（vignette）
        Box(
            Modifier.fillMaxSize().drawBehind {
                // `--min-shade`：深色是纯黑（0 0 0），浅色是 12 32 26 —— 照抄，不按封面调。
                val shade = if (light) Color(0xFF0C201A) else Color.Black
                val strength = if (light) 0.3f else 1f
                drawRect(
                    Brush.radialGradient(
                        colors = listOf(Color.Transparent, shade.copy(alpha = 0.30f * strength)),
                        center = Offset(size.width * 0.5f, size.height * 0.42f),
                        radius = size.maxDimension * 0.78f,
                    )
                )
            }
        )
    }
}

/**
 * `minimalAuroraGlow`：把封面派生色提亮到 `l = .62`、饱和度夹在 `.42..72` 再画光斑。
 *
 * 少了这一步，深色主题下光斑用的是 field 原色（l ≈ .2），叠在同样是 .1 的底色上等于没画 ——
 * 整页就成了一块平色。第一版截图之所以"灰"，一半原因在这里。
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

@Composable
private fun AuroraBlob(
    from: List<Color>,
    to: List<Color>,
    progress: Animatable<Float, *>,
    phase: androidx.compose.runtime.State<Float>,
    light: Boolean,
    animate: Boolean,
    period: Float,
    offset: Float,
    colorIndex: Int,
    centerX: Float,
    centerY: Float,
    radiusX: Float,
    radiusY: Float,
    modifier: Modifier,
) {
    val alpha = if (light) 0.26f else 0.52f
    Box(
        modifier
            .fillMaxSize()
            .graphicsLayer {
                // transform-only：渐变被缓存进这一层的 RenderNode，改位置不重画。
                val t = if (animate) phase.value else 0f
                val theta = 2f * PI.toFloat() * (t / period + offset)
                translationX = size.width * 0.13f * sin(theta)
                translationY = size.height * 0.10f * cos(theta)
                val breathe = 1f + 0.04f * sin(theta * 0.5f)
                this.scaleX = breathe
                this.scaleY = breathe
                this.alpha = alpha
            }
            .drawBehind {
                val c = auroraGlow(lerpPalette(from, to, progress.value)[colorIndex])
                val center = Offset(size.width * centerX, size.height * centerY)
                val rx = size.width * radiusX
                val ry = size.height * radiusY
                // 椭圆：把圆按 ry/rx 压一下再画。纯渐变 + 一次变换，仍然不碰 shader/blur。
                withTransform({ scale(1f, ry / rx, center) }) {
                    drawCircle(
                        brush = Brush.radialGradient(
                            colorStops = arrayOf(0f to c, 0.76f to Color.Transparent),
                            center = center,
                            radius = rx,
                        ),
                        radius = rx,
                        center = center,
                    )
                }
            }
    )
}
