package io.github.huleixin.tingyu.minimal.ui

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import io.github.huleixin.tingyu.minimal.MinimalArtwork
import kotlin.math.PI
import kotlin.math.sin

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/MinimalArtworkView.kt
//
// 封面：唱片层叠 + 背后的光 + 交叉淡化 + 呼吸浮动。
//
// 第 17 轮（视觉升级，参考效果图）：
//   · 封面后面加一块**半透明描边装饰板**：比封面大一圈、轻转 4°、右上偏移，
//     只留一道细边 —— 效果图里"安静的高级感"主要就是它给的；
//   · 呼吸感：浮动（±2.5dp / 19s）之上加极轻的缩放（±0.6%）与阴影起伏，
//     三个量共用同一个 19 秒相位，读起来是页面在呼吸而不是图片在动。
//
// 层叠不是阴影也不是发光 —— 是**后面多印了一张**：向上右各偏 3/1px、逆转 5°、缩小 1%，
// 只留一道 1px 的边。这台页面上"纸的厚度"就来自这一层。

private const val FLOAT_PERIOD_NS = 19_000_000_000L
private const val FLOAT_AMPLITUDE_DP = 2.5f

@Composable
fun MinimalArtworkView(
    artwork: MinimalArtwork,
    bloom: Color,
    ink: MinimalInk,
    floating: Boolean,
    still: Boolean,
    modifier: Modifier = Modifier,
) {
    var phase by remember { mutableFloatStateOf(0f) }
    val animate = floating && !still
    LaunchedEffect(animate) {
        if (!animate) return@LaunchedEffect
        var last = 0L
        while (true) {
            withFrameNanos { now ->
                if (last == 0L) last = now
                // 60ms 更新一次就够：19 秒走 5px，一帧的位移约 0.004px。
                if (now - last >= 60_000_000L) {
                    last = now
                    phase = (now % FLOAT_PERIOD_NS).toFloat() / FLOAT_PERIOD_NS
                }
            }
        }
    }

    BoxWithConstraints(modifier) {
        val side = minOf(maxWidth, maxHeight)
        val corner = (side.value * 0.07f).coerceIn(18f, 30f).dp

        // 1. 封面自己的光：框外 -18% 的一大团柔光。没有 blur 滤镜 —— 渐变本身就是柔的。
        Box(
            Modifier.matchParentSize().drawBehind {
                val inset = size.minDimension * 0.18f
                drawRect(
                    Brush.radialGradient(
                        colors = listOf(bloom.copy(alpha = 0.25f), Color.Transparent),
                        center = center,
                        radius = size.minDimension * 0.68f,
                    ),
                    topLeft = Offset(-inset, -inset),
                    size = Size(size.width + inset * 2, size.height + inset * 2),
                )
            }
        )

        // 2a. 后面那一张（层叠）：实底，只露 1px 边。
        Box(
            Modifier.matchParentSize()
                .graphicsLayer {
                    rotationZ = -5f
                    translationX = -3.dp.toPx()
                    translationY = 1.dp.toPx()
                    scaleX = 0.99f
                    scaleY = 0.99f
                }
                .background(
                    Brush.linearGradient(
                        listOf(ink.inkAlpha(10), bloom.copy(alpha = 0.16f)),
                        start = Offset(0f, 0f),
                        end = Offset(1f, 1f),
                    ),
                    RoundedCornerShape(corner),
                )
                .border(1.dp, ink.inkAlpha(12), RoundedCornerShape(corner))
        )

        // 2b. 描边装饰板（第 17 轮）：比封面大一圈、顺转 4°、右上偏移，只有一道细边。
        //     它在封面后面，不参与任何呼吸位移：装饰是静的，动的只有封面。
        Box(
            Modifier
                .size(side * 1.07f)
                .align(Alignment.TopStart)
                .graphicsLayer {
                    rotationZ = 4f
                    translationX = 7.dp.toPx()
                    translationY = -5.dp.toPx()
                }
                .border(1.dp, ink.inkAlpha(30), RoundedCornerShape(corner * 1.06f))
        )

        // 3. 封面本体：交叉淡化 + 呼吸（浮动/极轻缩放/阴影起伏同相位）。
        //    新图没解码好之前 runtime 不会发布新封面，所以这里不会闪白。
        Box(
            Modifier.matchParentSize()
                .graphicsLayer {
                    val wave = sin(2f * PI.toFloat() * phase)
                    translationY = FLOAT_AMPLITUDE_DP.dp.toPx() * wave
                    val breathe = if (animate) 1f + 0.006f * wave else 1f
                    scaleX = breathe
                    scaleY = breathe
                    shape = RoundedCornerShape(corner)
                    clip = false
                    // 阴影跟着呼吸起伏（±4px），静止时落在中间值 —— 小到只能被"感觉到"。
                    shadowElevation = if (animate) 22f + 8f * wave else 22f
                }
                .clip(RoundedCornerShape(corner))
                .background(ink.ink.copy(alpha = 0.05f))
        ) {
            Crossfade(
                targetState = artwork,
                animationSpec = tween(420),
                label = "minimal-artwork",
            ) { shown ->
                val bitmap = shown.bitmap
                if (bitmap != null && !bitmap.isRecycled) {
                    Image(
                        bitmap = bitmap.asImageBitmap(),
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    Box(
                        Modifier.fillMaxSize().background(
                            Brush.linearGradient(
                                listOf(ink.ink.copy(alpha = 0.08f), Color.Transparent),
                                start = Offset(0f, 0f),
                                end = Offset(0f, 600f),
                            )
                        ),
                        contentAlignment = Alignment.Center,
                    ) { MusicGlyph(ink.muted.copy(alpha = 0.55f)) }
                }
            }
        }
    }
}

/** 占位音符：两笔树干加两个符头，和旧页面 `Music2` 图标的视觉重量一致。 */
@Composable
private fun MusicGlyph(color: Color) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val u = size.minDimension / 40f
            val cx = size.width / 2f
            val cy = size.height / 2f
            val stroke = 1.6f * u
            drawLine(color, Offset(cx - 5 * u, cy + 8 * u), Offset(cx - 5 * u, cy - 9 * u), stroke)
            drawLine(color, Offset(cx + 6 * u, cy + 5 * u), Offset(cx + 6 * u, cy - 11 * u), stroke)
            drawLine(color, Offset(cx - 5 * u, cy - 9 * u), Offset(cx + 6 * u, cy - 11 * u), stroke)
            drawCircle(color, 5 * u, Offset(cx - 9.6f * u, cy + 8 * u))
            drawCircle(color, 5 * u, Offset(cx + 1.4f * u, cy + 5 * u))
        }
    }
}
