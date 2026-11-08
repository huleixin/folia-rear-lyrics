package io.github.huleixin.tingyu.chrome

import android.os.Build
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.kyant.backdrop.drawBackdrop
import com.kyant.backdrop.effects.blur
import com.kyant.backdrop.backdrops.layerBackdrop
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import io.github.huleixin.tingyu.BuildConfig
import kotlin.math.roundToInt

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/TopScrollScrim.kt
//
// TingYu Top Scroll Scrim —— 全局顶部滚动渐隐系统（设计系统正式组成）。
//
// 解决的问题：所有 Compose 页面的固定顶栏与滚动区是 Column 上下堆叠，内容在滚动视口
// 顶边被硬裁切（资料库歌单标题被切半、搜索结果行被切半）。
//
// 视觉契约：
//  · 静止（未滚动）：遮罩完全不绘制 —— 顶部干净、清晰、通透，无长期雾层；
//  · 上滚：内容经过视口顶边时被一片与页面背景逐像素同色的盖片缓落消隐，无硬裁切线；
//  · 下滚：完全跟随滚动位置即时恢复，无动画等待、无残影；
//  · 盖片与模糊段只画不接事件：不拦截滑动、不影响横向轮播、无点击穿透。
//
// 分层（诚实区分三种视觉手段，见 docs/ui-system/TOP_SCROLL_SCRIM.md）：
//  · Tier1 内容透明度渐隐（始终启用）：与页面背景逐像素同色的盖片缓落，
//    一次 drawRect，无离屏、无位图拷贝；
//  · Tier2 内容本身模糊（SDK≥31 且 BuildConfig.TOP_SCRIM_BLUR）：列表 layerBackdrop
//    捕获 + band 内三段 RenderEffect 模糊（顶部 10dp → 向下 6/3dp 递减），
//    捕获层含与页面对齐的真实局部背景，滚动停止即不再捕获；
//  · 背景玻璃模糊：属于底栏 Liquid Glass（chromeGlass），本组件不触碰。
//
// 性能契约：激活度在 draw/layer 阶段读 LazyListState —— 滚动全程零重组；
// 不对整列表施加模糊、不给每个 item 建模糊层、每帧不截屏不拷贝位图。
//
// 双端参数：CSS --ty-scrim-* / TS TY_SCRIM / 本 object 三端数值一致，
// 由 test/unit/ui/designTokenParity.test.ts 门禁锁定。
internal object TyScrollScrim {
    /** 渐隐过渡带高度（dp）。规范初始参考 36–48dp。 */
    const val BandDp = 44

    /** 滚动激活行程（dp）：滚过该距离后遮罩完全生效；静止时为 0（完全干净）。 */
    const val RampDp = 32

    /** band 内盖片 alpha 的缓落采样点（Emphasized ease-out 分布，端点零斜率）。 */
    val StopPositions = listOf(0f, 0.22f, 0.45f, 0.72f, 1f)
    val StopAlphas = listOf(1f, 0.66f, 0.34f, 0.10f, 0f)

    /** Tier2 局部模糊：段数与每段模糊半径（dp，顶部最强、向下递减）。轻量克制。 */
    const val BlurSegments = 3
    val BlurSegmentRadiiDp = listOf(10f, 6f, 3f)

    /** Tier2 能力门控：与 chromeGlass 同级（SDK≥31 才有 RenderEffect 捕获/模糊）。 */
    val blurCapable: Boolean
        get() = Build.VERSION.SDK_INT >= 31 && BuildConfig.TOP_SCRIM_BLUR

    /** smoothstep：与 playlistAmbientVisibility 同族（端点零斜率，避免可见折点）。 */
    fun ease(t: Float): Float {
        val x = t.coerceIn(0f, 1f)
        return x * x * (3 - 2 * x)
    }
}

/**
 * 滚动激活度：0 = 静止（顶部完全干净），1 = 内容已深入过渡带（完全消隐）。
 * 必须在 draw/layer 阶段调用 —— 读 LazyListState 只触发重绘，不触发重组。
 */
internal fun scrimActivation(state: LazyListState, rampPx: Float): Float {
    val px = if (state.firstVisibleItemIndex > 0) Float.MAX_VALUE else state.firstVisibleItemScrollOffset.toFloat()
    return TyScrollScrim.ease(px / rampPx)
}

/** 页面渐变色板在 fraction 处的颜色（与 Brush.verticalGradient 的线性插值同口径）。 */
internal fun pageGradientColorAt(colors: List<Color>, fraction: Float): Color {
    if (colors.isEmpty()) return Color.Transparent
    if (colors.size == 1) return colors[0]
    val f = fraction.coerceIn(0f, 1f) * (colors.size - 1)
    val index = f.toInt().coerceAtMost(colors.size - 2)
    val t = f - index
    val a = colors[index]
    val b = colors[index + 1]
    return Color(
        a.red + (b.red - a.red) * t,
        a.green + (b.green - a.green) * t,
        a.blue + (b.blue - a.blue) * t,
        a.alpha + (b.alpha - a.alpha) * t,
    )
}

/**
 * 渐隐盖片的融合策略：盖片必须长得跟滚动内容背后的真实背景一模一样，内容才算
 * 「融入背景」而不是「盖上一层」。颜色一律来自页面自己的背景来源，深浅色自动跟随。
 */
internal sealed interface TopScrimFusion {
    /** 融合色板：与页面背景同一来源（NativePage.surfaceColors()）。 */
    val colors: List<Color>

    /** 普通页面（推荐/资料库/歌手/搜索/设置/背屏控制）：背后只有页面渐变背景。 */
    data class Gradient(override val colors: List<Color>) : TopScrimFusion

    /** 集合详情（MediaDetail）：背后还有封面氛围层（NativePlaylistBackdrop），
     *  盖片 = 渐变 + 封面氛围层副本，与真实背景逐像素对齐。 */
    data class Ambient(override val colors: List<Color>, val image: String, val viewportHeight: Dp) : TopScrimFusion
}

/** band 内盖片的采样色标：颜色取页面渐变在 band 各高度处的真实值，alpha 取缓落曲线。 */
internal fun scrimOccluderStops(colors: List<Color>, bandTopPx: Float, pageHeightPx: Float, bandPx: Float): List<Pair<Float, Color>> =
    TyScrollScrim.StopPositions.mapIndexed { index, position ->
        val fraction = ((bandTopPx + position * bandPx) / pageHeightPx).coerceIn(0f, 1f)
        position to pageGradientColorAt(colors, fraction).copy(alpha = TyScrollScrim.StopAlphas[index])
    }

/** 页面根度量：NativePageView 提供。渐隐层用它把 band 的窗口位置映射回页面渐变取色位置。 */
internal class PageSurfaceMetrics {
    var originY by mutableFloatStateOf(0f)
    var heightPx by mutableFloatStateOf(0f)
}

internal val LocalPageSurface = staticCompositionLocalOf { PageSurfaceMetrics() }

/** 与页面渐变逐像素对齐的底色：brush 的 y 直接用页面绝对坐标（startY = -bandTop）。 */
private fun Modifier.pageAlignedBackground(colors: List<Color>, bandTopProvider: () -> Float, pageHeightProvider: () -> Float): Modifier =
    drawBehind {
        val top = bandTopProvider()
        val pageHeight = pageHeightProvider()
        if (!top.isNaN() && pageHeight > 0f) {
            drawRect(Brush.verticalGradient(colors, startY = -top, endY = pageHeight - top))
        }
    }

/**
 * 顶部滚动渐隐视口：把页面的 LazyColumn 包进来，即获得统一的顶边柔化消隐。
 *
 * 结构：Box{ 内容层（Tier2 时含对齐底色 + 捕获）；Tier2 模糊段；渐隐盖片 }。
 * 盖片/模糊段只画不接事件 —— 滑动、横向轮播、系统返回手势全部不受影响；
 * 盖片不改变列表滚动范围，也不产生内容跳动。
 */
@Composable
internal fun TopScrollScrimViewport(
    state: LazyListState,
    fusion: TopScrimFusion,
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    val surface = LocalPageSurface.current
    val density = LocalDensity.current
    val bandPx = with(density) { TyScrollScrim.BandDp.dp.toPx() }
    val rampPx = with(density) { TyScrollScrim.RampDp.dp.toPx() }
    // band 顶边的页面相对 y（真实窗口 px）。首帧布局前为 NaN，此时遮罩必然未激活。
    var bandTopPx by remember { mutableFloatStateOf(Float.NaN) }
    // 激活是一次性布尔（阈值 2px 迟滞）：只有它的翻转会重组；滚动全程走 draw 阶段。
    val active by remember(state) {
        derivedStateOf { state.firstVisibleItemIndex > 0 || state.firstVisibleItemScrollOffset > 2 }
    }
    val blur = TyScrollScrim.blurCapable
    val listBackdrop = if (blur) rememberLayerBackdrop() else null

    Box(modifier.onGloballyPositioned { coords ->
        bandTopPx = coords.positionInWindow().y - surface.originY
    }) {
        // 内容层。Tier2 激活时挂「与页面对齐的底色（+ 封面氛围副本）+ 列表捕获」：
        // 捕获里必须是真实局部背景，模糊段采到的才是「背景 + 模糊内容」而非透明底噪。
        Box(
            Modifier.matchParentSize().then(
                if (blur && active && listBackdrop != null) Modifier.layerBackdrop(listBackdrop)
                else Modifier
            )
        ) {
            if (blur && active && listBackdrop != null) {
                Box(Modifier.matchParentSize().pageAlignedBackground(fusion.colors, { bandTopPx }, { surface.heightPx }))
                if (fusion is TopScrimFusion.Ambient) AmbientBackdropReplica(fusion, bandTopPx)
            }
            content()
        }
        // Tier2：band 内三段真实模糊（顶部最强、向下递减），alpha 跟随滚动激活度。
        if (blur && active && listBackdrop != null) {
            val segmentDp = TyScrollScrim.BandDp.dp / TyScrollScrim.BlurSegments
            val segmentPx = with(density) { segmentDp.toPx() }
            TyScrollScrim.BlurSegmentRadiiDp.forEachIndexed { index, radiusDp ->
                val radiusPx = with(density) { radiusDp.dp.toPx() }
                Box(
                    Modifier.fillMaxWidth()
                        .offset { IntOffset(0, (index * segmentPx).roundToInt()) }
                        .height(segmentDp + 0.5.dp)
                        .graphicsLayer { alpha = scrimActivation(state, rampPx) }
                        .drawBackdrop(
                            backdrop = listBackdrop,
                            shape = { RectangleShape },
                            effects = { blur(radiusPx) },
                        )
                )
            }
        }
        // 渐隐盖片（Tier1，始终启用）：静止时整个分支不绘制，顶部干净通透。
        when (fusion) {
            is TopScrimFusion.Gradient -> Box(
                Modifier.matchParentSize().drawBehind {
                    val top = bandTopPx
                    val activation = scrimActivation(state, rampPx)
                    if (activation <= 0f || top.isNaN() || surface.heightPx <= 0f) return@drawBehind
                    // 盖片与页面背景逐像素同色：band 顶边衔接固定栏下方的纯背景区，无缝。
                    drawRect(
                        Brush.verticalGradient(
                            *scrimOccluderStops(fusion.colors, top, surface.heightPx, bandPx).toTypedArray(),
                            startY = 0f, endY = bandPx,
                        ),
                        size = Size(size.width, bandPx),
                        alpha = activation,
                    )
                }
            )
            is TopScrimFusion.Ambient -> Box(
                Modifier.fillMaxWidth()
                    .height(TyScrollScrim.BandDp.dp)
                    .clipToBounds()
                    .drawWithCache {
                        val ramp = Brush.verticalGradient(
                            *TyScrollScrim.StopPositions.mapIndexed { index, position ->
                                position to Color.White.copy(alpha = TyScrollScrim.StopAlphas[index])
                            }.toTypedArray()
                        )
                        onDrawWithContent {
                            val activation = scrimActivation(state, rampPx)
                            if (activation <= 0f) return@onDrawWithContent
                            // band 级离屏 + DstIn 渐变蒙版：副本（渐变 + 封面氛围）按缓落曲线消隐。
                            drawIntoCanvas { canvas ->
                                canvas.nativeCanvas.saveLayer(0f, 0f, size.width, size.height, android.graphics.Paint())
                                drawContent()
                                drawRect(ramp, blendMode = BlendMode.DstIn, alpha = activation)
                                canvas.nativeCanvas.restore()
                            }
                        }
                    }
            ) {
                Box(Modifier.matchParentSize().pageAlignedBackground(fusion.colors, { bandTopPx }, { surface.heightPx }))
                AmbientBackdropReplica(fusion, bandTopPx)
            }
        }
    }
}

/** 封面氛围层副本：整体上移 bandTop 与页面层逐像素对齐（Coil 同 URL 命中缓存）。 */
@Composable
private fun AmbientBackdropReplica(fusion: TopScrimFusion.Ambient, bandTopPx: Float) {
    Box(Modifier.offset { IntOffset(0, if (bandTopPx.isNaN()) 0 else -bandTopPx.roundToInt()) }) {
        NativePlaylistBackdrop(fusion.image, fusion.viewportHeight)
    }
}
