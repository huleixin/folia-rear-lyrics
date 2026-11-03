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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.drawBehind
import kotlinx.coroutines.delay
import kotlin.math.PI
import kotlin.math.cos
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
        AuroraBlob(from, to, progress, phase, light, animate, period = 20f, offset = 0f, colorIndex = 1,
            centerX = 0.32f, centerY = 0.28f, scaleX = 1.24f, scaleY = 1.04f, modifier = Modifier)
        AuroraBlob(from, to, progress, phase, light, animate, period = 24f, offset = 0.33f, colorIndex = 2,
            centerX = 0.73f, centerY = 0.48f, scaleX = 1.30f, scaleY = 1.08f, modifier = Modifier)
        AuroraBlob(from, to, progress, phase, light, animate, period = 28f, offset = 0.66f, colorIndex = 3,
            centerX = 0.44f, centerY = 0.78f, scaleX = 1.40f, scaleY = 1.08f, modifier = Modifier)
        // 3. 上下压暗（veil）
        Box(
            Modifier.fillMaxSize().drawBehind {
                val shade = (if (light) Color(0xFF0C201A) else Color.Black)
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
                val shade = (if (light) Color(0xFF0C201A) else Color.Black)
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
    scaleX: Float,
    scaleY: Float,
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
                val s = 1f + 0.04f * sin(theta * 0.5f)
                this.scaleX = scaleX * s
                this.scaleY = scaleY * s
                this.alpha = alpha
            }
            .drawBehind {
                val c = lerpPalette(from, to, progress.value)[colorIndex]
                drawRect(
                    Brush.radialGradient(
                        colors = listOf(c, Color.Transparent),
                        center = Offset(size.width * centerX, size.height * centerY),
                        radius = size.maxDimension * 0.66f,
                    )
                )
            }
    )
}
