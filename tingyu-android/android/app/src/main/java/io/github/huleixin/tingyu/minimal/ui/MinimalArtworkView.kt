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
import kotlin.math.cos

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/MinimalArtworkView.kt
//
// 封面：唱片层叠 + 背后的光 + 交叉淡化 + 多层独立呼吸。
//
// 第 18 轮重做呼吸：旧版缩放/浮动/阴影共用同一个 19s 正弦 —— 三个量锁死在一个
// 相位里，读起来仍然是"图片在放大缩小"。现在每一层有自己的周期与相位：
//   · 封面缩放 1.000~1.012，周期 10s；
//   · 封面垂直浮动 ±3dp，周期 13s（与缩放相位错开 1.1rad）；
//   · 阴影跟随浮动轻微起伏（错 0.35π，封面升高时影子略收）；
//   · 背后描边装饰板：±1.5dp 独立视差 + ±0.3° 角度摆动，周期 17s —— 与封面
//     不同步，板像悬浮在更远的一层；
//   · 周围柔光：23s 的更慢周期轻微明暗（不改封面图像亮度，只动背景光）。
//
// 时钟是**累计秒**：暂停/切页冻结相位，恢复从原相位继续（旧实现用绝对时间取模，
// 恢复瞬间会跳相位）。所有动效都写在 graphicsLayer/drawBehind 块里 —— 纯合成层
// 属性与绘制失效，零重组零重排版；60ms 节流足够（最慢层一帧位移 ~0.01px）。
// 层叠"纸的厚度"那一道 1px 边保持不变。

/** 呼吸更新节流：最慢层（23s 柔光）一帧位移 ~0.01px，60ms 一拍足够顺滑。 */
private const val BREATH_STEP_NS = 60_000_000L

@Composable
fun MinimalArtworkView(
    artwork: MinimalArtwork,
    bloom: Color,
    ink: MinimalInk,
    floating: Boolean,
    still: Boolean,
    modifier: Modifier = Modifier,
) {
    var breath by remember { mutableFloatStateOf(0f) }
    val animate = floating && !still
    LaunchedEffect(animate) {
        if (!animate) return@LaunchedEffect
        var last = 0L
        while (true) {
            withFrameNanos { now ->
                if (last == 0L) {
                    last = now
                    return@withFrameNanos
                }
                val elapsed = now - last
                if (elapsed >= BREATH_STEP_NS) {
                    breath += elapsed / 1_000_000_000f
                    last = now
                }
            }
        }
    }

    BoxWithConstraints(modifier) {
        val side = minOf(maxWidth, maxHeight)
        val corner = (side.value * 0.07f).coerceIn(18f, 30f).dp
        val twoPi = 2f * PI.toFloat()

        // 1. 封面自己的光：框外 -18% 的一大团柔光，23s 缓慢明暗（不动封面亮度）。
        Box(
            Modifier.matchParentSize().drawBehind {
                val glowWave = sin(twoPi * breath / 23f + 0.5f)
                val inset = size.minDimension * 0.18f
                drawRect(
                    Brush.radialGradient(
                        colors = listOf(bloom.copy(alpha = 0.25f + 0.05f * glowWave), Color.Transparent),
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

        // 2b. 描边装饰板（第 17 轮引入，第 18 轮加独立微动）：比封面大一圈、基础
        //     顺转 4°、右上偏移，只有一道细边。17s 周期的独立视差（±1.5dp）与
        //     角度摆动（±0.3°）—— 和封面 10s/13s 的呼吸不同步，像更远的一层纸。
        Box(
            Modifier
                .size(side * 1.07f)
                .align(Alignment.TopStart)
                .graphicsLayer {
                    val plate = twoPi * breath / 17f + 2.0f
                    rotationZ = 4f + 0.3f * sin(plate)
                    translationX = (7f + 1.5f * sin(plate + 0.7f)).dp.toPx()
                    translationY = (-5f + 1.5f * cos(plate)).dp.toPx()
                }
                .border(1.dp, ink.inkAlpha(30), RoundedCornerShape(corner * 1.06f))
        )

        // 3. 封面本体：交叉淡化 + 双频呼吸。缩放（10s）与浮动（13s）各走各的相位，
        //    叠加后不再有"同一个正弦"的机械感；阴影跟浮动错 0.35π 轻微起伏。
        //    暂停时不回弹到中性值：所有量都只由 breath 驱动，breath 冻结即整体冻结
        //    在当前姿态（旧实现暂停把缩放拍回 1f，会看到一下snap）。
        //    新图没解码好之前 runtime 不会发布新封面，所以这里不会闪白。
        Box(
            Modifier.matchParentSize()
                .graphicsLayer {
                    val scaleWave = sin(twoPi * breath / 10f)
                    val floatWave = sin(twoPi * breath / 13f + 1.1f)
                    translationY = 3.dp.toPx() * floatWave
                    val breathe = 1.006f + 0.006f * scaleWave
                    scaleX = breathe
                    scaleY = breathe
                    shape = RoundedCornerShape(corner)
                    clip = false
                    // 阴影跟浮动：封面升高影子略收（错 0.35π，不同步到锁死）。
                    shadowElevation = 22f + 6f * sin(twoPi * breath / 13f + 1.1f + 0.35f * PI.toFloat())
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
