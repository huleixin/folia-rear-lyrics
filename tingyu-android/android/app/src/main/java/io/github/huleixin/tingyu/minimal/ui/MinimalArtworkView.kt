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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import io.github.huleixin.tingyu.minimal.MinimalArtwork
import io.github.huleixin.tingyu.minimal.cover.CoverCard
import io.github.huleixin.tingyu.minimal.cover.CoverStackArtwork
import io.github.huleixin.tingyu.minimal.cover.CoverStackState
import io.github.huleixin.tingyu.minimal.cover.StackPhase
import io.github.huleixin.tingyu.minimal.cover.dimAt
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/MinimalArtworkView.kt
//
// 封面：三层相册堆叠 + 背后的光 + 多层独立呼吸 + 二维跟手拖拽。
//
// 层叠姿态来自已验收的 Demo（`src/dev/coverStack/`），一块几何都没重新设计：
//   当前 x0 y0 0° 100% / 下一首 -13dp -5dp -4° 98.5% / 下下首 +11dp -7dp +4° 96%，
//   后两层压暗 15% / 28%，第四张藏在第二张后面待补入。
//   只有 rotateZ，没有透视、没有绕 X/Y 轴翻转 —— 拖动时封面是被"移动"，不是被"翻动"。
//
// 呼吸（保留原有的独立周期）：缩放 10s、浮动 13s、装饰板 17s、柔光 23s。
// **手势与切歌动画期间呼吸冻结**（不是归零）：冻结在当前相位，所以不会和拖动叠加出抖动，
// 也不会在手指按下的那一刻"跳"一下 —— 拖动位移是相对的，父层停住不动，1:1 跟手就仍然成立。
//
// 逐帧只写 graphicsLayer 的 translate/rotate/scale/alpha：不重排版、不重新解码、不进重组。

/** 呼吸更新节流：最慢层（23s 柔光）一帧位移 ~0.01px，60ms 一拍足够顺滑。 */
private const val BREATH_STEP_NS = 60_000_000L

/** 残影副本数量。三份够读出方向，又不会把 GPU 填满。 */
private const val GHOST_COUNT = 3

// 前后关系全部由 zIndex 决定，不再靠"画在循环里还是循环外"决定层次。
/** 静止三层的基准 z：第 0 层最高，往后依次递减。 */
private const val BASE_Z = 10f
/** 残影副本的 z：压在普通层之上、移动层之下。 */
private const val GHOST_Z = 30f
/** 正在被抽走 / 放入的那一张：永远在最上面。 */
private const val MOVING_Z = 40f

@Composable
fun MinimalArtworkView(
    artwork: MinimalArtwork,
    bloom: Color,
    ink: MinimalInk,
    floating: Boolean,
    still: Boolean,
    stack: CoverStackState,
    covers: CoverStackArtwork,
    gesture: Modifier = Modifier,
    modifier: Modifier = Modifier,
) {
    var breath by remember { mutableFloatStateOf(0f) }
    // 手势 / 切歌动画期间冻结呼吸：不更新相位，姿态停在当前值
    val animate = floating && !still && stack.phase == StackPhase.IDLE
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

    // 当前曲的封面 runtime 已经解码过了：先塞进堆叠的缓存，起播那一帧就不会空
    LaunchedEffect(artwork.songKey, artwork.bitmap) {
        covers.seed(artwork.songKey, artwork.bitmap)
    }

    val cards = stack.cards
    BoxWithConstraints(modifier) {
        val side = minOf(maxWidth, maxHeight)
        val corner = (side.value * 0.07f).coerceIn(18f, 30f).dp
        val density = LocalDensity.current
        val sidePx = with(density) { side.toPx() }
        LaunchedEffect(sidePx, density.density) { stack.setSize(sidePx, density.density) }
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

        // 2. 堆叠本体：整摞一起呼吸（缩放 10s、浮动 13s），像一叠真实叠在一起的纸。
        Box(Modifier.fillMaxSize().then(gesture)) {
            Box(
                Modifier.fillMaxSize().graphicsLayer {
                    val scaleWave = sin(twoPi * breath / 10f)
                    val floatWave = sin(twoPi * breath / 13f + 1.1f)
                    translationY = 3.dp.toPx() * floatWave
                    val breathe = 1.006f + 0.006f * scaleWave
                    scaleX = breathe
                    scaleY = breathe
                }
            ) {
                // 2a. 装饰板（原有的一层"更远的纸"）：比封面略小的大圆角细边，17s 独立微动。
                Box(
                    Modifier
                        .matchParentSize()
                        .graphicsLayer {
                            val plate = twoPi * breath / 17f + 2.0f
                            rotationZ = 4f + 0.3f * sin(plate)
                            translationX = (7f + 1.5f * sin(plate + 0.7f)).dp.toPx()
                            translationY = (-5f + 1.5f * cos(plate)).dp.toPx()
                        }
                        .border(1.dp, Color.White.copy(alpha = 0.14f), RoundedCornerShape(corner))
                )

                // 2b. 所有封面走同一个循环，每张用 `key(card.key)` 固定身份，前后关系交给 zIndex。
                //
                // 这里曾经把"被拖动的那张"单独画在循环之外（循环跳过它、末尾再补一层 z=40）。
                // Composable 是按位置复用的，于是取消拖动、卡片表从
                // [当前(移动中), 下一首, 下下首, 第四张] 缩回 [当前, 下一首, 下下首] 的那一帧，
                // 第 0 个位置换成了另一首歌 —— CoverImage 里的 Crossfade 把它当成"同一张封面换了图"，
                // 于是把**下一首**淡入到最前面、再花 220ms 淡回当前曲，也就是用户看到的那一闪。
                // 统一到一个带稳定 key 的循环后，位置变化不再改变组合身份：
                // 同一张封面永远落在同一个节点上，bitmap 没变就绝不会走 Crossfade。
                cards.forEachIndexed { index, card ->
                    // 正在移动的那张永远在最上面；其余按列表顺序，越靠前 z 越高。
                    val z = if (card.moving) MOVING_Z else BASE_Z + (cards.size - index)
                    key(card.key) {
                        // 阴影层在本卡图片层之下、被它遮挡的那张之上：
                        // 接触阴影与环境阴影都落在下一张卡上，遮挡关系才读得出来。
                        ShadowLayer(
                            card = card,
                            stack = stack,
                            corner = corner,
                            z = z - 0.5f,
                        )
                        CoverLayer(
                            card = card,
                            stack = stack,
                            covers = covers,
                            corner = corner,
                            ink = ink,
                            z = z,
                        )
                    }
                }
                // 残影：只属于正在移动的那一张，三份同图偏移副本沿速度反方向铺开（没有 blur 滤镜）。
                // 它不是"一层封面"（没有自己的身份和层位），所以不放进上面的循环：
                // 循环里一个 key 对应一张真实封面，残影作为覆盖层单独挂在最上面。
                cards.firstOrNull { it.moving }?.let { card ->
                    repeat(GHOST_COUNT) { ghost ->
                        key("ghost-$ghost") {
                            GhostLayer(
                                card = card,
                                ghost = ghost,
                                stack = stack,
                                covers = covers,
                                corner = corner,
                                z = GHOST_Z + ghost,
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * 层位 → 阴影强度系数。主卡最重，向后逐层减轻，三档厚度感一目了然：
 * 主卡 1.0 / 第二张 0.65 / 第三张 0.40 / 藏在后面的第四张 0.28。
 * 按**小数层位**分段线性插值：第二张升起接替主卡时，阴影跟着连续过渡，不会跳变。
 */
internal fun shadowStrengthAt(slot: Float): Float = when {
    slot <= 0f -> 1f
    slot < 1f -> 1f - 0.35f * slot
    slot < 2f -> 0.65f - 0.25f * (slot - 1f)
    else -> 0.40f - 0.12f * (slot - 2f).coerceAtMost(1f)
}

/** 诊断对照开关：true = 关闭自绘阴影（用于同一首歌的"修改前"对照截图），交付版必须为 false。 */
private const val SHADOWS_DISABLED = false

/**
 * 独立的阴影图层：只画阴影、不画图、**不裁剪**。
 *
 * 为什么不再用 `graphicsLayer.shadowElevation`：RenderNode 的海拔阴影是"贴边光晕"式——
 * 扩散很窄，而堆叠里后两张几乎全被主卡遮住、只露几条边，阴影恰好落在被遮住的区域，
 * 露出的边缘上只剩极窄一圈，读不出纵深感。拆成独立图层后可以精确画两种有分工的阴影：
 *
 *   · 接触阴影（3 层实心圆角矩形，紧贴边缘外扩 2/5/9px，颜色深、范围小）——
 *     卡片图片盖住中心后只露出贴边一圈，让前后两张在遮挡边缘明显分离；
 *   · 环境阴影（7 层由外向内渐深的实心圆角矩形，向外扩 8~38px、向下偏移 2~18px）——
 *     大范围、浅颜色、向下偏移，构成"轻轻悬浮"的纵深。
 *
 * 与卡片图片层读同一份 `frameFor`（同帧、同变换），拖动/回弹时逐帧同步，不可能分离。
 * 全部是实心 drawRoundRect，没有 blur 滤镜、没有 RenderNode 阴影，帧成本可忽略。
 */
@Composable
private fun ShadowLayer(
    card: CoverCard,
    stack: CoverStackState,
    corner: androidx.compose.ui.unit.Dp,
    z: Float,
) {
    val shape = remember(corner) { RoundedCornerShape(corner) }
    Box(
        Modifier
            .fillMaxSize()
            .zIndex(z)
            .graphicsLayer {
                val frame = stack.frameFor(card)
                translationX = frame[0]
                translationY = frame[1]
                scaleX = frame[2]
                scaleY = frame[2]
                rotationZ = frame[3]
                this.shape = shape
                // 不裁剪：阴影必须延伸到卡片边界之外
            }
            .drawBehind {
                if (SHADOWS_DISABLED) return@drawBehind
                val strength = shadowStrengthAt(stack.slotFor(card).coerceIn(0f, 3f))
                val radius = corner.toPx()
                // ---- 环境阴影：由外向内逐层加深（先画最外最淡，后画较内较深）----
                val ambientRings = 7
                for (i in ambientRings - 1 downTo 0) {
                    val t = (i + 1f) / ambientRings
                    val spread = 8f + 30f * t
                    val drop = 2f + 16f * t
                    val alpha = (0.014f + 0.05f * (1f - t)) * strength
                    drawRoundRect(
                        color = Color.Black.copy(alpha = alpha),
                        topLeft = Offset(-spread, -spread + drop),
                        size = Size(size.width + spread * 2f, size.height + spread * 2f),
                        cornerRadius = CornerRadius(radius + spread),
                    )
                }
                // ---- 接触阴影：紧贴遮挡边缘的小范围深色 ----
                drawRoundRect(
                    color = Color.Black.copy(alpha = 0.07f * strength),
                    topLeft = Offset(-9f, -9f),
                    size = Size(size.width + 18f, size.height + 18f),
                    cornerRadius = CornerRadius(radius + 9f),
                )
                drawRoundRect(
                    color = Color.Black.copy(alpha = 0.14f * strength),
                    topLeft = Offset(-5f, -5f),
                    size = Size(size.width + 10f, size.height + 10f),
                    cornerRadius = CornerRadius(radius + 5f),
                )
                drawRoundRect(
                    color = Color.Black.copy(alpha = 0.22f * strength),
                    topLeft = Offset(-2f, -2f),
                    size = Size(size.width + 4f, size.height + 4f),
                    cornerRadius = CornerRadius(radius + 2f),
                )
            }
    )
}

/** 一层封面：图片 + 压暗 + 纸边。所有逐帧量都在 graphicsLayer 里读，不触发重组。 */
@Composable
private fun CoverLayer(
    card: CoverCard,
    stack: CoverStackState,
    covers: CoverStackArtwork,
    corner: androidx.compose.ui.unit.Dp,
    ink: MinimalInk,
    z: Float,
) {
    val shape = remember(corner) { RoundedCornerShape(corner) }
    Box(
        Modifier
            .fillMaxSize()
            .zIndex(z)
            .graphicsLayer {
                val frame = stack.frameFor(card)
                translationX = frame[0]
                translationY = frame[1]
                scaleX = frame[2]
                scaleY = frame[2]
                rotationZ = frame[3]
                this.shape = shape
                // 只裁剪封面图片本身；阴影由独立的 ShadowLayer 承担，
                // 不再使用 RenderNode 的 shadowElevation（原因见 ShadowLayer 注释）。
                clip = true
            }
            // 后两层极轻微的透明度落差（主卡 1.0 → 第四张 0.91），悬浮感更真；
            // 跟层位连续变化，补位动画时一起回到 1，不会突变。
            .graphicsLayer { alpha = 1f - 0.03f * stack.slotFor(card).coerceIn(0f, 3f) }
            .background(ink.ink.copy(alpha = 0.05f))
    ) {
        CoverImage(card, covers)
        // 后层压暗：跟着层位连续变化，第二张升起时一起退掉，不会在动画末尾突然变亮
        Box(
            Modifier
                .fillMaxSize()
                .graphicsLayer { alpha = dimAt(stack.slotFor(card)) }
                .background(Color.Black)
        )
        // 主卡边缘高光：顶部一道随层位淡入淡出的窄渐变（光从上方来），
        // 只在接近最前时可见 —— 第二张升起接替时高光自然落到它身上。
        Box(
            Modifier
                .matchParentSize()
                .graphicsLayer {
                    alpha = (1f - stack.slotFor(card).coerceIn(0f, 1f)) * 0.55f
                }
                .drawBehind {
                    drawRect(
                        Brush.verticalGradient(
                            colors = listOf(Color.White.copy(alpha = 0.30f), Color.Transparent),
                            startY = 0f,
                            endY = size.minDimension * 0.20f,
                        )
                    )
                }
        )
        Box(Modifier.matchParentSize().border(1.dp, Color.White.copy(alpha = 0.12f), shape))
    }
}

/** 残影副本：只画图，不加阴影、不加压暗，alpha 由速度决定。 */
@Composable
private fun GhostLayer(
    card: CoverCard,
    ghost: Int,
    stack: CoverStackState,
    covers: CoverStackArtwork,
    corner: androidx.compose.ui.unit.Dp,
    z: Float,
) {
    val shape = remember(corner) { RoundedCornerShape(corner) }
    Box(
        Modifier
            .fillMaxSize()
            .zIndex(z)
            .graphicsLayer {
                val frame = stack.frameFor(card)
                val offset = stack.ghostAt(ghost, GHOST_COUNT)
                translationX = frame[0] + offset[0]
                translationY = frame[1] + offset[1]
                scaleX = frame[2]
                scaleY = frame[2]
                rotationZ = frame[3]
                alpha = offset[2]
                this.shape = shape
                clip = true
            }
    ) {
        CoverImage(card, covers)
    }
}

/** 封面图：位图到了才画，没到就是占位（新图淡入，不会先白一下再补图）。 */
@Composable
private fun CoverImage(card: CoverCard, covers: CoverStackArtwork) {
    val bitmap = covers.of(card.songKey)
    Crossfade(
        targetState = bitmap,
        animationSpec = tween(220),
        label = "minimal-cover-${card.key}",
    ) { shown ->
        if (shown != null) {
            Image(
                bitmap = shown,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            PlaceholderSurface()
        }
    }
}

/** 没有封面时的占位：一道斜向渐变 + 音符，和旧页面同一套视觉重量。 */
@Composable
private fun PlaceholderSurface() {
    Box(
        Modifier
            .fillMaxSize()
            .background(
                Brush.linearGradient(
                    listOf(Color(0xFF2A3330), Color(0xFF161C1A)),
                    start = Offset(0f, 0f),
                    end = Offset(600f, 600f),
                )
            ),
        contentAlignment = Alignment.Center,
    ) {
        MusicGlyph(Color(0x66FFFFFF), Modifier.size(46.dp))
    }
}

/** 占位音符：两笔树干加两个符头。 */
@Composable
internal fun MusicGlyph(color: Color, modifier: Modifier = Modifier) {
    Box(modifier, contentAlignment = Alignment.Center) {
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

