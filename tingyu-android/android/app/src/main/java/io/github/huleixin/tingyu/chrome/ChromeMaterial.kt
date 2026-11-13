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
import androidx.compose.ui.composed
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
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
// 液态玻璃材质层（1.3.188 二次专项）。
//
// ── 为什么上一版看起来仍然是「高斯模糊面板」──────────────────────────────────
// 折射着色器（Shaders.kt: RoundedRectRefractionShaderString）的位移量是：
//     d(depth) = amount * circleMap(1 - depth / refractionHeight)
//     circleMap(x) = 1 - sqrt(1 - x²)
// 这是圆的边缘法线分布，物理上正确：位移在**最外缘**取到 amount，往内迅速衰减。
// 关键量化（54dp 底栏，2.75x）：
//     · 首次专项 band=12dp / amount=16.2dp / blur=4dp → 位移 >1 倍模糊半径的环 ≈4.1dp
//     · 二次专项 band=20dp / amount=20dp / blur=8dp   → 同样的环 ≈4.0dp，而模糊翻倍
// 也就是：**模糊从 4dp 提到 8dp 之后，本来只有 4dp 宽的折射环被试彻底糊掉了**。
// 这不是调色问题，是「可见折射环宽度 / 模糊半径」小于 1 的几何问题。
//
// 本版：band 拉到 24dp（≈半个底栏高）、位移 24dp、模糊压到 5dp →
// visibleRim 9.3dp、rimToBlur 1.86。ChromeGlassOpticsTest 用同一套公式锁住这条不变量。
//
// 另外三件事：
//   1. lens 的位移是**向内**采样（refractionAmount 取负），所以 padding 不影响折射，
//      只决定模糊在离屏层边缘有没有余量。首次专项注释写的「采到形状外」是错的。
//   2. 反光拆三层：Highlight（轮廓/镜面）/ 顶部环境反射渐变 / 跟手镜面热点。
//   3. API<33 没有 AGSL，Highlight 会退化成均匀白描边 → 这两档降低 alpha。

/** 一组玻璃光学参数。三组预设见 [ChromeGlassPresets]。 */
@Immutable
data class ChromeGlassSpec(
    val key: String,
    /** 背景模糊半径。必须明显小于 [lensHeight]，否则边缘折射会被糊掉。 */
    val blur: Dp,
    /** 折射带高度（距边缘多深开始弯折），决定"镜片有多厚"。 */
    val lensHeight: Dp,
    /** 折射位移量（最外缘处的背景位移）。 */
    val lensAmount: Dp,
    /** 凸起式折射（库的 depthEffect）。圆角矩形上收益极小，band≥半高时还有除零风险。 */
    val depthEffect: Boolean,
    /** 浅色表面底色，alpha 已包含在内。 */
    val lightSurface: Color,
    /** 深色表面底色，alpha 已包含在内。 */
    val darkSurface: Color,
    /** 光学高光厚度。库把 strokeWidth 取 ceil(width*2)，所以实际可见内缘≈width×2。 */
    val highlightWidth: Dp,
    val highlightAlpha: Float,
    /** 内阴影：给边缘做厚度（玻璃下缘的暗部）。 */
    val innerShadowRadius: Dp,
    val innerShadowAlpha: Float,
    /** 环境反射：玻璃上表面反射天光，顶部最亮、快速衰减（不是白边）。 */
    val ambientAlpha: Float,
    /** 镜面热点：跟手按压处的柔和反光。 */
    val specularAlpha: Float,
    /** API < 31 没有 RenderEffect/AGSL，只能降级成中性半透明底。 */
    val fallbackLightAlpha: Float,
    val fallbackDarkAlpha: Float,
) {
    /** 按内容密度调表面不透明度：同一个材质规范，允许底栏/迷你条各自微调。 */
    fun surface(light: Boolean, fill: Float = 1f): Color {
        val base = if (light) lightSurface else darkSurface
        return base.copy(alpha = (base.alpha * fill).coerceIn(0f, 1f))
    }

    /**
     * 位移场：距边缘 depth(dp) 处的背景位移量(dp)。纯数学，供参数选型与单测使用，
     * 与 Shaders.kt 的 `circleMap` 完全同构。
     */
    fun displacementAt(depth: Float): Float {
        if (lensHeight.value <= 0f || lensAmount.value <= 0f) return 0f
        if (depth <= 0f) return lensAmount.value
        if (depth >= lensHeight.value) return 0f
        val u = 1f - depth / lensHeight.value
        return lensAmount.value * (1f - kotlin.math.sqrt(1f - u * u))
    }

    /**
     * 「可见折射环」宽度（dp）：位移量不小于一倍模糊半径的深度范围。
     * 判断"折射会不会被模糊吃掉"的核心指标 —— 它必须大于 [blur]。
     */
    val visibleRim: Float
        get() {
            if (lensAmount.value <= 0f || lensHeight.value <= 0f) return 0f
            val ratio = (1f - blur.value / lensAmount.value).coerceIn(0f, 1f)
            val u = kotlin.math.sqrt((1f - ratio * ratio).coerceAtLeast(0f))
            return lensHeight.value * (1f - u)
        }

    /** 折射环宽度 / 模糊半径。小于 1 时肉眼基本只能看到模糊。 */
    val rimToBlur: Float get() = if (blur.value <= 0f) Float.POSITIVE_INFINITY else visibleRim / blur.value
}

internal object ChromeGlassPresets {
    private fun gray(argb: Long, alpha: Float): Color = Color(argb).copy(alpha = alpha)

    /** 底栏表面不透明度系数（基准）。 */
    const val NavFill = 1f
    /** 迷你播放器内容更密（歌名/歌手/播放键），表面略厚一档。 */
    const val MiniFill = 1.12f

    /**
     * A 组 · 官方示例原值。来自 1.0.6 的 LiquidBottomTabs，对应 64dp 底栏。
     * 保留作参数对照基线，不作为默认（rimToBlur 只有 0.76，折射会被模糊吃掉）。
     */
    val Official = ChromeGlassSpec(
        key = "official",
        blur = 8.dp, lensHeight = 24.dp, lensAmount = 24.dp, depthEffect = false,
        lightSurface = gray(0xFFFAFAFA, .40f), darkSurface = gray(0xFF121212, .40f),
        highlightWidth = .5.dp, highlightAlpha = 1f,
        innerShadowRadius = 8.dp, innerShadowAlpha = .35f,
        ambientAlpha = .06f, specularAlpha = .10f,
        fallbackLightAlpha = .86f, fallbackDarkAlpha = .90f,
    )

    /**
     * B 组 · 默认（液态）。band 24dp ≈ 半个底栏高、位移 24dp、模糊 5dp：
     * visibleRim 9.3dp、rimToBlur 1.86 —— 边缘能看见背景被弯折，中心留 3dp 通透区。
     */
    val Liquid = ChromeGlassSpec(
        key = "liquid",
        blur = 5.dp, lensHeight = 24.dp, lensAmount = 24.dp, depthEffect = false,
        lightSurface = gray(0xFFFAFAFA, .40f), darkSurface = gray(0xFF121212, .40f),
        highlightWidth = .7.dp, highlightAlpha = 1f,
        innerShadowRadius = 9.dp, innerShadowAlpha = .40f,
        ambientAlpha = .075f, specularAlpha = .11f,
        fallbackLightAlpha = .86f, fallbackDarkAlpha = .90f,
    )

    /**
     * C 组 · 保守。低端机或"折射别太夸张"的场合：band 16dp、位移 14dp、模糊 6dp。
     */
    val Crisp = ChromeGlassSpec(
        key = "crisp",
        blur = 6.dp, lensHeight = 16.dp, lensAmount = 14.dp, depthEffect = false,
        lightSurface = gray(0xFFF7F7F7, .46f), darkSurface = gray(0xFF141414, .46f),
        highlightWidth = .6.dp, highlightAlpha = .9f,
        innerShadowRadius = 6.dp, innerShadowAlpha = .30f,
        ambientAlpha = .06f, specularAlpha = .09f,
        fallbackLightAlpha = .88f, fallbackDarkAlpha = .92f,
    )

    val all: List<ChromeGlassSpec> = listOf(Official, Liquid, Crisp)
    val Default: ChromeGlassSpec = Liquid

    /** `proportional` 是首次专项用过的 key，保留别名，避免旧环境变量静默变成别的参数。 */
    fun byKey(key: String?): ChromeGlassSpec = when (key) {
        "proportional" -> Liquid
        else -> all.firstOrNull { it.key == key } ?: Default
    }

    /** 当前构建的生效预设：`TINGYU_GLASS_PRESET=official|liquid|crisp`，缺省 liquid。 */
    fun active(): ChromeGlassSpec = byKey(io.github.huleixin.tingyu.BuildConfig.GLASS_PRESET)
}

/** 库默认投影（24dp / 黑色 10% / 下移 4dp）。显式传，才能给「记录层」整个关掉。 */
private val ShadowDefault: () -> Shadow = { Shadow.Default }

/**
 * 液态玻璃表面。
 *
 * @param surfaceFill 表面不透明度系数，只影响底色 alpha，不影响折射/高光。
 * @param lensScale   折射强度系数（选中项按压时放大，静止时应为 1）。
 * @param decorations 是否绘制光学高光/投影/内阴影/环境反射。给子级录采样源时必须关掉。
 * @param pressPoint  归一化按压点（0..1），用于跟手镜面热点；null 表示没有按压。
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
    pressPoint: () -> Offset? = { null },
    exportedBackdrop: LayerBackdrop? = null,
    interfaceTheme: Boolean = true,
): Modifier {
    val palette = if (interfaceTheme && light == LocalInterfacePalette.current.light) LocalInterfacePalette.current else InterfacePalette(light, "classic")
    val material = remember(spec,palette.style) { spec.interfaceMaterial(palette.style) }
    val reflection = palette.glassReflection
    val shape = RoundedCornerShape(radius)
    // API 31 以下没有 RenderEffect / AGSL：这里明确降级为中性半透明底，不假装是玻璃。
    if (Build.VERSION.SDK_INT < 31) return legacyChromeGlass(light, shape, material, surfaceFill, palette.glassFallback, reflection)
    val density = LocalDensity.current
    val blurPx = with(density) { spec.blur.toPx() }
    val lensHeightPx = with(density) { (spec.lensHeight * lensScale).toPx() }
    val lensAmountPx = with(density) { (spec.lensAmount * lensScale).toPx() }
    // Animate the exact optical preset endpoint, including classic custom presets.
    val surface by androidx.compose.animation.animateColorAsState(material.surface(light, surfaceFill),
        androidx.compose.animation.core.tween(if (LocalLiquidReduced.current) 0 else TingYuMotion.ThemeMs), label = "glass-surface")
    // 内阴影只做「下缘暗部」：光从上方来，玻璃越厚下缘越沉。上缘留给高光与环境反射。
    val innerColor = palette.opticalShadow.copy(alpha = if(light) .16f else .55f)
    // API<33 的 Highlight 会退化成均匀白描边，压暗一档，避免"毛玻璃外面画白线"。
    val highlightAlpha = if (Build.VERSION.SDK_INT >= 33) spec.highlightAlpha else spec.highlightAlpha * .62f
    return drawBackdrop(
        backdrop = backdrop,
        shape = { shape },
        effects = {
            vibrancy()
            blur(blurPx)
            if (Build.VERSION.SDK_INT >= 33 && lensHeightPx > 0f && lensAmountPx > 0f) {
                // lens() 第一件事就是 padding -= refractionHeight，所以先把 padding 抬到
                // 「band + 模糊半径」，扣完仍留一个模糊半径的余量：目的是让模糊在离屏层
                // 边缘不触发 Clamp 拖影（折射是向内采样，不依赖这块余量）。
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
                    alpha = highlightAlpha,
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
        onDrawSurface = {
            drawRect(surface)
            if (decorations) {
                // ② 环境反射：上表面反射天光，顶部最亮、快速衰减，不做整片泛白。
                if (spec.ambientAlpha > 0f) {
                    drawRect(
                        brush = Brush.verticalGradient(
                            0f to reflection.copy(alpha = spec.ambientAlpha),
                            .34f to reflection.copy(alpha = spec.ambientAlpha * .30f),
                            1f to Color.Transparent,
                        ),
                        blendMode = BlendMode.Plus,
                    )
                }
                // ③ 镜面热点：跟手、柔和连续，只在按压时出现。
                val point = pressPoint()
                if (point != null && spec.specularAlpha > 0f) {
                    val center = Offset(point.x * size.width, point.y * size.height)
                    val r = size.height * 2.2f
                    drawCircle(
                        brush = Brush.radialGradient(
                            0f to reflection.copy(alpha = spec.specularAlpha),
                            .5f to reflection.copy(alpha = spec.specularAlpha * .32f),
                            1f to Color.Transparent,
                            center = center,
                            radius = r,
                        ),
                        radius = r,
                        center = center,
                        blendMode = BlendMode.Plus,
                    )
                }
            }
        },
    )
}

// Classic custom optical presets keep their exact surface/alpha. New styles replace hue only.
internal fun ChromeGlassSpec.interfaceMaterial(style:String):ChromeGlassSpec {
    if(InterfaceThemes.resolve(style)=="classic") return this
    return copy(lightSurface=InterfacePalette(true,style).glassSurface.copy(alpha=lightSurface.alpha),
        darkSurface=InterfacePalette(false,style).glassSurface.copy(alpha=darkSurface.alpha))
}

/** API < 31 的降级底：中性半透明 + 一道柔光内缘（不是玻璃，也不再用品牌绿）。 */
private fun Modifier.legacyChromeGlass(light: Boolean, shape: Shape, spec: ChromeGlassSpec, fill: Float, fallback: Color, reflection: Color): Modifier {
    val surface = if (light) fallback.copy(alpha = (spec.fallbackLightAlpha * fill).coerceIn(0f, 1f))
    else fallback.copy(alpha = (spec.fallbackDarkAlpha * fill).coerceIn(0f, 1f))
    return background(surface, shape)
        .border(.7.dp, reflection.copy(alpha = if (light) .26f else .15f), shape)
}

fun Modifier.chromeInteraction(action: (String,Double)->Unit): Modifier = composed {
    val currentAction = androidx.compose.runtime.rememberUpdatedState(action)
    pointerInput(Unit) {
    awaitEachGesture {
        awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
        currentAction.value("interactionStart",0.0)
        try { do { val event = awaitPointerEvent(PointerEventPass.Initial) } while(event.changes.any { it.pressed }) }
        finally { currentAction.value("interactionEnd",0.0) }
    }
}
}
fun chromeColor(value: String, fallback: Color = Color.White): Color = try { Color(value.toColorInt()) } catch (_: Exception) { fallback }

@Composable fun ChromeButton(label: String, modifier: Modifier = Modifier, enabled: Boolean = true, size: Dp = 44.dp, reduced: Boolean = false,
    onClick: () -> Unit, content: @Composable () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val origin=LocalMotionOrigin.current
    val bounds = remember { MotionOrigin() }
    val scale by animateFloatAsState(if(pressed && !reduced && !LocalLiquidReduced.current) 0.94f else 1f,animationSpec=androidx.compose.animation.core.spring(dampingRatio=.85f,stiffness=900f),label="press")
    Box(modifier.size(size).onGloballyPositioned{bounds.bounds=it.boundsInRoot()}.graphicsLayer { scaleX=scale;scaleY=scale;alpha=if(enabled)1f else .35f }
        .semantics { contentDescription=label }.clickable(interactionSource=interaction,indication=null,enabled=enabled,role=Role.Button,onClick={origin.record(bounds.bounds);onClick()}),
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
