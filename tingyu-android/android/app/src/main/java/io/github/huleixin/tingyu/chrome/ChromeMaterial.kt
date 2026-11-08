package io.github.huleixin.tingyu.chrome

import android.os.Build
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import androidx.core.graphics.toColorInt
import com.kyant.backdrop.Backdrop
import com.kyant.backdrop.backdrops.LayerBackdrop
import com.kyant.backdrop.drawBackdrop
import com.kyant.backdrop.effects.blur
import com.kyant.backdrop.effects.lens
import com.kyant.backdrop.effects.vibrancy
import com.kyant.backdrop.highlight.Highlight
import com.kyant.backdrop.highlight.HighlightStyle
import com.kyant.backdrop.shadow.InnerShadow
import com.kyant.backdrop.shadow.Shadow
import io.github.huleixin.tingyu.minimal.ui.PlaybackModeIcon
import io.github.huleixin.tingyu.minimal.ui.PlayerControlIcon

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/ChromeMaterial.kt
//
// 液态玻璃材质层（1.3.189 玻璃专项）。
//
// 参数与结构逐项对齐 Kyant0/AndroidLiquidGlass tag `1.0.6` 的
// `catalog/src/main/java/com/kyant/backdrop/catalog/components/LiquidBottomTabs.kt`：
//   · 底色：浅色 #FAFAFA @40%，深色 #121212 @40%（中性灰，不是品牌绿）
//   · 效果：vibrancy() → blur(8.dp) → lens(24.dp, 24.dp)
//   · 边缘：Highlight.Default（0.5dp、白色 50%、BlendMode.Plus）而不是 stroke
//   · 选中项：采样「底栏自身玻璃」的第二级 backdrop，静止时不再二次模糊
//
// 听屿旧实现的三处根因（详见审计报告）：
//   1. onDrawSurface 用的是 #F1F4ED / #303B36 —— 本身带绿，再叠 52%~64% 就成了绿磨砂；
//   2. 外层又画了 0.8dp #315D43 硬描边，与库默认高光叠成双重边缘；
//   3. padding 被 lens 扣成 0，镜头只能采形状内部的像素，边缘无法弯折页面内容。

/** 一组玻璃光学参数。三组预设见 [ChromeGlassPresets]。 */
@Immutable
data class ChromeGlassSpec(
    val key: String,
    /** 背景模糊半径。 */
    val blur: Dp,
    /** 折射带高度（距边缘多深开始弯折）。 */
    val lensHeight: Dp,
    /** 折射位移量。 */
    val lensAmount: Dp,
    /** 凸起式折射（库的 depthEffect），官方底栏未启用。 */
    val depthEffect: Boolean,
    /** 浅色表面底色，alpha 已包含在内。 */
    val lightSurface: Color,
    /** 深色表面底色，alpha 已包含在内。 */
    val darkSurface: Color,
    /** 光学高光厚度。库把 strokeWidth 取 ceil(width*2)，所以实际可见内缘≈width×2。 */
    val highlightWidth: Dp,
    val highlightAlpha: Float,
    /** 内阴影：给边缘做出厚度（玻璃下缘的暗部）。 */
    val innerShadowRadius: Dp,
    val innerShadowAlpha: Float,
    /** API < 31 没有 RenderEffect/AGSL，只能降级成中性半透明底。 */
    val fallbackLightAlpha: Float,
    val fallbackDarkAlpha: Float,
) {
    /** 按内容密度调表面不透明度：同一个材质规范，允许底栏/迷你条各自微调。 */
    fun surface(light: Boolean, fill: Float = 1f): Color {
        val base = if (light) lightSurface else darkSurface
        return base.copy(alpha = (base.alpha * fill).coerceIn(0f, 1f))
    }
}

internal object ChromeGlassPresets {
    private fun gray(argb: Long, alpha: Float): Color = Color(argb).copy(alpha = alpha)

    /** 底栏表面不透明度系数（基准）。 */
    const val NavFill = 1f
    /** 迷你播放器内容更密（歌名/歌手/播放键），表面略厚一档。 */
    const val MiniFill = 1.12f

    /**
     * A 组 · 官方示例原值。来自 1.0.6 的 LiquidBottomTabs，对应 64dp 底栏。
     * 用于与参考实现做同参数对照。
     */
    val Official = ChromeGlassSpec(
        key = "official",
        blur = 8.dp, lensHeight = 24.dp, lensAmount = 24.dp, depthEffect = false,
        lightSurface = gray(0xFFFAFAFA, .40f), darkSurface = gray(0xFF121212, .40f),
        highlightWidth = .5.dp, highlightAlpha = 1f,
        innerShadowRadius = 8.dp, innerShadowAlpha = .35f,
        fallbackLightAlpha = .86f, fallbackDarkAlpha = .90f,
    )

    /**
     * B 组 · 默认。听屿底栏外框 54dp（官方 64dp），按 54/64 把折射带与位移等比缩到 20dp，
     * 模糊半径属于物理柔化量、不随尺寸缩放，保持 8dp。光学比例与官方一致。
     */
    val Proportional = ChromeGlassSpec(
        key = "proportional",
        blur = 8.dp, lensHeight = 20.dp, lensAmount = 20.dp, depthEffect = false,
        lightSurface = gray(0xFFFAFAFA, .40f), darkSurface = gray(0xFF121212, .40f),
        highlightWidth = .6.dp, highlightAlpha = 1f,
        innerShadowRadius = 8.dp, innerShadowAlpha = .35f,
        fallbackLightAlpha = .86f, fallbackDarkAlpha = .90f,
    )

    /**
     * C 组 · 可读性/性能优先。模糊与折射都收一档、表面更厚，供低端机或内容极花的背景对比。
     */
    val Crisp = ChromeGlassSpec(
        key = "crisp",
        blur = 6.dp, lensHeight = 16.dp, lensAmount = 13.dp, depthEffect = false,
        lightSurface = gray(0xFFF7F7F7, .46f), darkSurface = gray(0xFF141414, .46f),
        highlightWidth = .6.dp, highlightAlpha = .9f,
        innerShadowRadius = 6.dp, innerShadowAlpha = .30f,
        fallbackLightAlpha = .88f, fallbackDarkAlpha = .92f,
    )

    val all: List<ChromeGlassSpec> = listOf(Official, Proportional, Crisp)
    val Default: ChromeGlassSpec = Proportional

    fun byKey(key: String?): ChromeGlassSpec = all.firstOrNull { it.key == key } ?: Default

    /** 当前构建的生效预设：`TINGYU_GLASS_PRESET=official|crisp`，缺省 proportional。 */
    fun active(): ChromeGlassSpec = byKey(io.github.huleixin.tingyu.BuildConfig.GLASS_PRESET)
}

/** 库默认投影（24dp / 黑色 10% / 下移 4dp）。显式传，才能给「记录层」整个关掉。 */
private val ShadowDefault: () -> Shadow = { Shadow.Default }

/**
 * 液态玻璃表面。
 *
 * @param surfaceFill 表面不透明度系数，只影响底色 alpha，不影响折射/高光。
 * @param lensScale   折射强度系数（选中项按压时放大，静止时应为 1）。
 * @param decorations 是否绘制光学高光/投影/内阴影。给子级录采样源时必须关掉：
 *                    那一层 alpha=0，画高光只是白烧两个图层。
 * @param exportedBackdrop 需要把这块玻璃再导出给子级采样时传入（暂未使用，优先走记录层）。
 */
@Composable
fun Modifier.chromeGlass(
    backdrop: Backdrop,
    light: Boolean,
    radius: Dp = 28.dp,
    spec: ChromeGlassSpec = ChromeGlassPresets.active(),
    surfaceFill: Float = 1f,
    lensScale: Float = 1f,
    decorations: Boolean = true,
    exportedBackdrop: LayerBackdrop? = null,
): Modifier {
    val shape = RoundedCornerShape(radius)
    // API 31 以下没有 RenderEffect / AGSL：这里明确降级为中性半透明底，不假装是玻璃。
    if (Build.VERSION.SDK_INT < 31) return legacyChromeGlass(light, shape, spec, surfaceFill)
    val density = LocalDensity.current
    val blurPx = with(density) { spec.blur.toPx() }
    val lensHeightPx = with(density) { (spec.lensHeight * lensScale).toPx() }
    val lensAmountPx = with(density) { (spec.lensAmount * lensScale).toPx() }
    val surface = spec.surface(light, surfaceFill)
    // 内阴影只做「下缘暗部」：光从上方来，玻璃越厚下缘越沉。上缘留给光学高光。
    val innerColor = if (light) Color.Black.copy(alpha = .16f) else Color.Black.copy(alpha = .55f)
    return drawBackdrop(
        backdrop = backdrop,
        shape = { shape },
        effects = {
            vibrancy()
            blur(blurPx)
            if (Build.VERSION.SDK_INT >= 33 && lensHeightPx > 0f && lensAmountPx > 0f) {
                // 关键修复：lens 内部会执行 padding = (padding - refractionHeight)。
                // 旧实现 blur(4) 之后 padding=4，被 lens(12) 一扣就是 0 —— 记录层与形状等大，
                // 镜头只能 eval 形状内部的像素，边缘永远弯折不出下面的页面内容。
                // 这里先把 padding 抬到「折射带 + 模糊半径」，扣完仍保留一个模糊半径的余量，
                // 镜头才真的能采到形状之外的背景（真折射而不是拉伸自身边缘）。
                padding = lensHeightPx + blurPx
                lens(lensHeightPx, lensAmountPx, depthEffect = spec.depthEffect)
            } else {
                padding = blurPx
            }
        },
        highlight = if (decorations) {
            {
                Highlight(
                    width = spec.highlightWidth,
                    blurRadius = spec.highlightWidth / 2f,
                    alpha = spec.highlightAlpha,
                    style = HighlightStyle.Default,
                )
            }
        } else null,
        shadow = if (decorations) ShadowDefault else null,
        innerShadow = if (decorations) {
            {
                InnerShadow(
                    radius = spec.innerShadowRadius,
                    offset = DpOffset(0.dp, -2.dp),
                    color = innerColor,
                    alpha = spec.innerShadowAlpha,
                )
            }
        } else null,
        exportedBackdrop = exportedBackdrop,
        onDrawSurface = { drawRect(surface) },
    )
}

/** API < 31 的降级底：中性半透明 + 一道柔光内缘（不是玻璃，也不再用品牌绿）。 */
private fun Modifier.legacyChromeGlass(light: Boolean, shape: Shape, spec: ChromeGlassSpec, fill: Float): Modifier {
    val surface = if (light) Color(0xFFF7F8F8).copy(alpha = (spec.fallbackLightAlpha * fill).coerceIn(0f, 1f))
    else Color(0xFF0E1210).copy(alpha = (spec.fallbackDarkAlpha * fill).coerceIn(0f, 1f))
    return background(surface, shape)
        .border(.7.dp, Color.White.copy(alpha = if (light) .26f else .15f), shape)
}

fun Modifier.chromeInteraction(action: (String,Double)->Unit): Modifier = pointerInput(Unit) {
    awaitEachGesture {
        awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
        action("interactionStart",0.0)
        try { do { val event = awaitPointerEvent(PointerEventPass.Initial) } while(event.changes.any { it.pressed }) }
        finally { action("interactionEnd",0.0) }
    }
}
fun chromeColor(value: String, fallback: Color = Color.White): Color = try { Color(value.toColorInt()) } catch (_: Exception) { fallback }

@Composable fun ChromeButton(label: String, modifier: Modifier = Modifier, enabled: Boolean = true, size: Dp = 44.dp, reduced: Boolean = false,
    onClick: () -> Unit, content: @Composable () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if(pressed && !reduced) 0.92f else 1f,label="press")
    Box(modifier.size(size).graphicsLayer { scaleX=scale;scaleY=scale;alpha=if(enabled)1f else .35f }
        .semantics { contentDescription=label }.clickable(interactionSource=interaction,indication=null,enabled=enabled,role=Role.Button,onClick=onClick),
        contentAlignment=Alignment.Center) { content() }
}
/**
 * 舞台/迷你播放器的图标入口（第 20 轮）：播放控制与播放模式全部来自听屿
 * 图标包（minimal.ui 的 PlayerIcons，即 android_vector 的原始路径），歌词舞台
 * 与极简播放器不再各画一套。"music" 等非播放控制的占位图形保留原兜底。
 */
@Composable fun ChromeGlyph(name: String, color: Color, modifier: Modifier = Modifier.size(24.dp)) {
    when(name) {
        "play","pause","next","previous","queue" -> PlayerControlIcon(
            when(name) { "next" -> "skipForward"; "previous" -> "skipBack"; else -> name },
            color, modifier,
        )
        "order","off","all","one","shuffle","repeat" -> PlaybackModeIcon(
            when(name) { "repeat" -> "all"; "off" -> "order"; else -> name },
            color, modifier,
        )
        else -> LegacyGlyph(name, color, modifier)
    }
}

/** 非播放控制的占位图形（迷你播放器封面缺省等），不属于播放图标包。 */
@Composable private fun LegacyGlyph(name: String, color: Color, modifier: Modifier = Modifier) {
    Canvas(modifier.size(24.dp)) {
        val u=size.minDimension/24f
        val line = { x:Float,y:Float,xx:Float,yy:Float -> drawLine(color,Offset(x*u,y*u),Offset(xx*u,yy*u),2*u,StrokeCap.Round) }
        when(name) {
            else -> { drawCircle(color,7*u,Offset(12*u,12*u),style=Stroke(2*u));line(12f,5f,12f,15f) }
        }
    }
}
