package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.ClipOp
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.chrisbanes.haze.HazeDefaults
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.HazeTint
import dev.chrisbanes.haze.hazeEffect
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState
import io.github.huleixin.tingyu.BuildConfig

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/TopGlassBar.kt
//
// TingYu 沉浸式毛玻璃顶栏 —— 固定顶栏自身的半透明高斯玻璃（设计系统正式组成）。
//
// 渲染内核 = 成熟开源库 Haze（dev.chrisbanes.haze:haze:1.6.10，Apache-2.0）：
//  · 选版依据：1.6.10 依赖 org.jetbrains.compose.ui:ui 1.8.0 / kotlin-stdlib 2.1.0，
//    均低于本项目 Compose 1.10.3 / Kotlin 2.3.10 —— Gradle 取高版本后**不需要也不允许**
//    升级 Compose/Kotlin/AGP；2.x 要求 Kotlin 2.4 + Compose 1.12（会强制升级，弃用）。
//  · 采样关系：TyTopGlassContentLayer 挂 hazeSource（真实滚动内容 + 与页面同笔刷的底色），
//    TyTopGlassSurface 挂 hazeEffect（backgroundColor + blurRadius + tints + mask）。
//  · 顶栏底部过渡：mask = 主体全强度、底部 TailDp 内按端点零斜率 smoothstep 衰减到 0 的
//    垂直渐变 —— 单面蒙版，无分段、无横带、无水平分界线。
//  · 能力降级：Haze 自带模糊可用性判定（SDK<31 自动关闭模糊），此时保留同形状的
//    半透明底色玻璃（无模糊、无横带）；BuildConfig.TOP_GLASS_BLUR=false 可强制关闭模糊
//    （blurEnabled=false，使用同色 fallbackTint）用于性能回滚。
//
// 历史：第一轮自制 Top Scroll Scrim（内容侧盖片 + 多段模糊）在真机产生两条横向模糊带
// 与水平分界线；第二轮自研 backdrop 管线仍属重复造轮子 —— 本轮全部废弃，改用 Haze 单一
// 管线；契约测试断言本文件不得再出现自研捕获/绘制代码。
//
// 图层契约（每页统一，从底到顶）：
//   ① 页面背景（NativePageView 渐变）
//   ② TyTopGlassContentLayer：全幅滚动内容（Haze source；内含与页面同笔刷的底色，
//      集合详情另含封面氛围层副本 —— 模糊采到的必须是真实局部背景）
//   ③ TyTopGlassSurface：固定顶栏玻璃（Haze effect，只画不接指针事件）
//   ④ 顶栏内容（标题/副标题/音源选择/搜索框/分类标签/返回与操作按钮）—— 始终清晰
//
// 双端参数：CSS --ty-glass-top-* / TS TY_GLASS_TOP / 本 object 三端一致，
// 由 test/unit/ui/designTokenParity.test.ts 门禁锁定。
internal object TyTopGlass {
    /** 顶栏玻璃的高斯模糊半径（dp）：柔化滚入顶栏的封面与文字。 */
    const val BlurDp = 14

    /** 底部强度衰减距离（dp）。规范参考 24–32。 */
    const val TailDp = 32

    /** 采样内容之上的 Haze tint alpha（不是 backgroundColor 的 alpha）。 */
    const val TintAlphaDark = 0.55f
    const val TintAlphaLight = 0.68f

    /** 浅色顶栏前景：覆盖深色封面时仍可读；仅供玻璃上方的清晰层使用。 */

    /** 32dp 内每 1dp 一段；缓存单张蒙版的曲线采样，不增加模糊/采样层。 */
    const val DecaySteps = 32

    /** 1 - smoothstep 的等距采样；两端缓起缓收，避免主体到尾带的斜率突变。 */
    val DecayPositions = listOf(
        0f, 0.03125f, 0.0625f, 0.09375f, 0.125f, 0.15625f, 0.1875f, 0.21875f,
        0.25f, 0.28125f, 0.3125f, 0.34375f, 0.375f, 0.40625f, 0.4375f, 0.46875f,
        0.5f, 0.53125f, 0.5625f, 0.59375f, 0.625f, 0.65625f, 0.6875f, 0.71875f,
        0.75f, 0.78125f, 0.8125f, 0.84375f, 0.875f, 0.90625f, 0.9375f, 0.96875f,
        1f,
    )
    val DecayAlphas = listOf(
        1f, 0.997131f, 0.98877f, 0.975281f, 0.957031f, 0.934387f, 0.907715f, 0.87738f,
        0.84375f, 0.80719f, 0.768066f, 0.726746f, 0.683594f, 0.638977f, 0.593262f, 0.546814f,
        0.5f, 0.453186f, 0.406738f, 0.361023f, 0.316406f, 0.273254f, 0.231934f, 0.19281f,
        0.15625f, 0.12262f, 0.092285f, 0.065613f, 0.042969f, 0.024719f, 0.01123f, 0.002869f,
        0f,
    )

    /** smoothstep：与 playlistAmbientVisibility 同族（端点零斜率，避免可见折点）。 */
    fun ease(t: Float): Float {
        val x = t.coerceIn(0f, 1f)
        return x * x * (3 - 2 * x)
    }
}

internal val LocalTopGlassForeground = staticCompositionLocalOf { false }

/** 只改变顶栏的语义前景色，不新增绘制层，不影响采样源或页面正文。 */
@Composable
internal fun TyTopGlassForeground(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalTopGlassForeground provides true, content = content)
}

@Composable
internal fun topGlassForegroundColor(default: Color, light: Color): Color =
    if (LocalTopGlassForeground.current && LocalInterfacePalette.current.light) light else default

/** 玻璃蒙版色标：主体（0..headerBottom）alpha=1，底部 tail 内按衰减采样落到 0。 */
internal fun topGlassMaskStops(headerBottomPx: Float, tailPx: Float): List<Pair<Float, Color>> {
    val total = (headerBottomPx + tailPx).coerceAtLeast(1f)
    val stops = mutableListOf(0f to Color.White)
    stops.add((headerBottomPx / total).coerceIn(0f, 1f) to Color.White)
    for (index in 1 until TyTopGlass.DecayPositions.size) {
        val position = ((headerBottomPx + TyTopGlass.DecayPositions[index] * tailPx) / total).coerceIn(0f, 1f)
        stops.add(position to Color.White.copy(alpha = TyTopGlass.DecayAlphas[index]))
    }
    return stops
}

/** Haze effect 的 mask：主体全强度、底部平滑淡出（单面蒙版，无分段）。 */
internal fun topGlassMaskBrush(headerBottomPx: Float, tailPx: Float): Brush =
    Brush.verticalGradient(*topGlassMaskStops(headerBottomPx, tailPx).toTypedArray())

/**
 * 顶栏玻璃状态：HazeState（采样生命周期由 Haze 管理）+ 顶栏内容底边测量。
 * 首帧测量回填前使用页面给出的估计值，避免内容顶到状态栏。
 */
internal class TyTopGlassState(val hazeState: HazeState, estimateHeaderBottomDp: Float) {
    var headerBottomWindowPx by mutableFloatStateOf(Float.NaN)
    var originLeftPx by mutableFloatStateOf(0f)
    var originTopPx by mutableFloatStateOf(Float.NaN)
    var pageHeightPx by mutableFloatStateOf(0f)
    var pxPerDp by mutableFloatStateOf(0f)
    var headerBottomEstimateDp by mutableFloatStateOf(estimateHeaderBottomDp)

    /** 顶栏内容底边（页面相对 css-dp）。页面内的 dp 与窗口 px 经 pxPerDp（cssScale）换算。
     *  上限保护：顶栏底边不得超过页面高度的 60% —— 头部节点若被误设 fillMaxSize，
     *  测到的会是整页高度，会把列表全部推出屏幕、玻璃撑成整页（1.3.185 真机回归）。 */
    val headerBottomDp: Float
        get() = when {
            headerBottomWindowPx.isNaN() || originTopPx.isNaN() || pxPerDp <= 0f -> headerBottomEstimateDp
            else -> {
                val measured = ((headerBottomWindowPx - originTopPx) / pxPerDp).coerceAtLeast(0f)
                val cap = if (pageHeightPx > 0f) pageHeightPx / pxPerDp * 0.6f else Float.MAX_VALUE
                if (measured > cap) headerBottomEstimateDp.coerceAtMost(cap) else measured
            }
        }

    /** 内容起点（css-dp）：玻璃底边 + 衰减带。
     *  静止时首个内容必须完全在玻璃之外（顶部无模糊）；滚动时才进入衰减带被柔化。 */
    val contentTop: Dp get() = (headerBottomDp + TyTopGlass.TailDp).dp

    /** 头部内容节点回填（窗口物理 px）。 */
    fun reportHeader(windowY: Float, height: Int) {
        headerBottomWindowPx = windowY + height
    }

    /** 内容层节点回填（= 页面顶部在窗口的 y，物理 px）。 */
    fun reportOrigin(windowY: Float, windowX: Float = 0f) {
        originLeftPx = windowX
        originTopPx = windowY
    }
}

@Composable
internal fun rememberTyTopGlassState(estimateHeaderBottomDp: Float): TyTopGlassState {
    val density = LocalDensity.current
    val hazeState = rememberHazeState()
    val state = remember(estimateHeaderBottomDp) { TyTopGlassState(hazeState, estimateHeaderBottomDp) }
    SideEffect {
        state.pxPerDp = density.density
        // 能力降级（Haze 官方判定）：没有 RenderEffect 模糊的版本关闭模糊，
        // 仅保留同形状的半透明底色玻璃 —— 无横带、无自研降级管线。
        hazeState.blurEnabled = HazeDefaults.blurEnabled()
    }
    return state
}

/**
 * ② 内容层（Haze source）：全幅滚动内容 + 与页面同笔刷的底色（+ 集合详情封面氛围层副本）。
 *    底色让模糊采样拿到的是「真实局部背景 + 内容」的不透明画面，玻璃才能与页面自然融合。
 */
@Composable
internal fun BoxScope.TyTopGlassContentLayer(
    state: TyTopGlassState,
    colors: List<Color>,
    ambientImage: String?,
    ambientViewportHeight: Dp?,
    modifier: Modifier = Modifier,
    backgroundCutout: (() -> Path?)? = null,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(
        modifier
            .onGloballyPositioned { coords ->
                state.reportOrigin(coords.positionInWindow().y, coords.positionInWindow().x)
                state.pageHeightPx = coords.size.height.toFloat()
            }
            .hazeSource(state.hazeState)
    ) {
        // 与 NativePageView 背景同笔刷、同边界（内容层=页面根大小）→ 逐像素对齐。
        Box(Modifier.matchParentSize().drawBehind {
            val hole = backgroundCutout?.invoke()
            if (hole == null) drawRect(Brush.verticalGradient(colors))
            else clipPath(hole, ClipOp.Difference) { drawRect(Brush.verticalGradient(colors)) }
        })
        if (ambientImage != null && ambientViewportHeight != null) {
            // 封面氛围层副本：与页面层同参数同位置（集合详情的页面级原件已移除，避免双绘）。
            Box(Modifier.fillMaxWidth()) { NativePlaylistBackdrop(ambientImage, ambientViewportHeight) }
        }
        content()
    }
}

/**
 * ③ 顶栏玻璃面（Haze effect）：blurRadius + 页面顶部同色半透明 tint + 底部衰减蒙版。
 *    尺寸完全由组件内部决定（测量顶栏底边 + tail）；只画不接指针事件 ——
 *    标题/按钮在它之上，滑动穿透到列表，无点击穿透、无滚动范围改动。
 */
@Composable
internal fun BoxScope.TyTopGlassSurface(
    state: TyTopGlassState,
    colors: List<Color>,
) {
    val light = LocalInterfacePalette.current.light
    val pxPerDp = LocalDensity.current.density
    val background = colors.first().copy(alpha = 1f)
    val tint = HazeTint(background.copy(alpha = if (light) TyTopGlass.TintAlphaLight else TyTopGlass.TintAlphaDark))
    Box(
        Modifier.fillMaxWidth()
            .height((state.headerBottomDp + TyTopGlass.TailDp).dp)
            .hazeEffect(state = state.hazeState) {
                // 禁用时走 Haze 原生 fallback；半径归零仍会采到清晰原文，不能当作降级。
                blurEnabled = state.hazeState.blurEnabled && BuildConfig.TOP_GLASS_BLUR
                blurRadius = TyTopGlass.BlurDp.dp
                // Haze 1.6.10：background 在采样内容后方；tints 在模糊后、mask 前合成。
                // Source 内有不透明页面底色，仅提高 background alpha 无法压低封面饱和度/残影。
                backgroundColor = background
                tints = listOf(tint)
                // 显式指定，避免 Haze 对 fallback tint 自动增浓；同一 mask 同时衰减蒙层。
                fallbackTint = tint
                noiseFactor = 0f
                // 底部过渡：主体全强度，tail 内按 smoothstep 采样衰减到 0（单面蒙版）。
                // 这里读快照状态 —— 顶栏高度测量变化会让 Haze 失效重建 effect（不重建 HazeState）。
                // 使用当前 Density，首帧 SideEffect 回填 pxPerDp 前也有完整蒙版。
                val bottomPx = state.headerBottomDp * pxPerDp
                mask = topGlassMaskBrush(bottomPx, TyTopGlass.TailDp * pxPerDp)
            }
    )
}
