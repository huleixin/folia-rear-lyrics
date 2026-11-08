package io.github.huleixin.tingyu.chrome

import android.os.Build
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.kyant.backdrop.backdrops.layerBackdrop
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import com.kyant.backdrop.drawBackdrop
import com.kyant.backdrop.effects.blur
import com.kyant.backdrop.effects.vibrancy
import io.github.huleixin.tingyu.BuildConfig

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/TopGlassBar.kt
//
// TingYu 沉浸式毛玻璃顶栏 —— 固定顶栏本身成为半透明高斯玻璃（设计系统正式组成）。
//
// 与上一轮被真机否决的 Top Scroll Scrim 的本质区别：
//  · 上一轮把「透明度盖片 + 三段不同半径的模糊」叠在列表上方 —— 半径阶梯与两层
//    各自的底边形成了两条横向模糊带和水平分界线；结构就是错的，已彻底删除。
//  · 本轮玻璃是**顶栏的材质**：列表全幅滚动、真正进入顶栏后方；顶栏用单一连续的
//    玻璃表面（drawBackdrop 采样捕获层 + vibrancy + 高斯模糊 + 页面同色半透明 tint），
//    经 saveLayer + DstIn 蒙版让玻璃强度在底部 32dp 按 smoothstep 平滑衰减到 0 ——
//    无分段、无横带、无描边、无分隔线。
//
// 图层契约（每页统一，逐层从底到顶）：
//   ① 页面背景（NativePageView 渐变）
//   ② TyTopGlassContentLayer：全幅滚动内容（捕获层内含与页面逐像素对齐的底色，
//      集合详情另含封面氛围层副本 —— 玻璃采到的必须是真实局部背景）
//   ③ TyTopGlassSurface：固定顶栏的毛玻璃背景（不接事件、无描边）
//   ④ 顶栏内容（标题/副标题/音源选择/搜索框/分类标签/返回与操作按钮）—— 始终清晰
//
// 性能契约：
//   · 复用底栏 Liquid Glass 的同一 GPU 管线（kyant0 backdrop：layerBackdrop 捕获 +
//     RenderEffect 模糊），无每帧截屏、无位图拷贝、无整列表模糊、无逐 item 模糊；
//   · 玻璃是静态材质（不是滚动驱动的过渡）——Reduced Motion 下保持不变；
//   · SDK<31 或 TINGYU_TOP_GLASS_BLUR=false 时降级为**同一形状的半透明底色层**
//     （无模糊、同样底部衰减），绝不退回横向模糊带。
//
// 双端参数：CSS --ty-glass-top-* / TS TY_GLASS_TOP / 本 object 三端一致，
// 由 test/unit/ui/designTokenParity.test.ts 门禁锁定。
internal object TyTopGlass {
    /** 顶栏玻璃的高斯模糊半径（dp）。与底栏玻璃（4dp+lens）同一品牌语言、更柔一档。 */
    const val BlurDp = 10

    /** 底部强度衰减距离（dp）。规范参考 24–40，取中值。 */
    const val TailDp = 32

    /** 玻璃底色 alpha：深海绿半透明（颜色取页面顶部背景色，深浅色自动跟随）。 */
    const val TintAlphaDark = 0.46f
    const val TintAlphaLight = 0.55f

    /** 底部衰减采样：位置（tail 内）与强度（1=全玻璃，0=全透明）。端点零斜率。 */
    val DecayPositions = listOf(0f, 0.22f, 0.45f, 0.72f, 1f)
    val DecayAlphas = listOf(1f, 0.66f, 0.34f, 0.10f, 0f)

    /** RenderEffect 捕获/模糊能力门控：与 chromeGlass 同级（SDK≥31）。 */
    val glassCapable: Boolean
        get() = Build.VERSION.SDK_INT >= 31 && BuildConfig.TOP_GLASS_BLUR

    /** smoothstep：与 playlistAmbientVisibility 同族（端点零斜率，避免可见折点）。 */
    fun ease(t: Float): Float {
        val x = t.coerceIn(0f, 1f)
        return x * x * (3 - 2 * x)
    }
}

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
 * 顶栏玻璃状态：顶栏内容底边（页面相对 css-dp）由头部内容节点测量回填；
 * 首帧测量回填前使用页面给出的估计值，避免内容顶到状态栏。
 */
internal class TyTopGlassState(val backdrop: com.kyant.backdrop.backdrops.LayerBackdrop?, estimateHeaderBottomDp: Float) {
    var headerBottomWindowPx by mutableFloatStateOf(Float.NaN)
    var originTopPx by mutableFloatStateOf(Float.NaN)
    var pxPerDp by mutableFloatStateOf(0f)
    var headerBottomEstimateDp by mutableFloatStateOf(estimateHeaderBottomDp)

    /** 顶栏内容底边（页面相对 css-dp）。页面内的 dp 与窗口 px 经 pxPerDp（cssScale）换算。 */
    val headerBottomDp: Float
        get() = when {
            headerBottomWindowPx.isNaN() || originTopPx.isNaN() || pxPerDp <= 0f -> headerBottomEstimateDp
            else -> ((headerBottomWindowPx - originTopPx) / pxPerDp).coerceAtLeast(0f)
        }

    /** 头部内容节点回填（窗口物理 px）。 */
    fun reportHeader(windowY: Float, height: Int) {
        headerBottomWindowPx = windowY + height
    }

    /** 内容层节点回填（= 页面顶部在窗口的 y，物理 px）。 */
    fun reportOrigin(windowY: Float) {
        originTopPx = windowY
    }
}

@Composable
internal fun rememberTyTopGlassState(estimateHeaderBottomDp: Float): TyTopGlassState {
    val density = LocalDensity.current
    val backdrop = if (TyTopGlass.glassCapable) rememberLayerBackdrop() else null
    val state = remember(estimateHeaderBottomDp) { TyTopGlassState(backdrop, estimateHeaderBottomDp) }
    SideEffect { state.pxPerDp = density.density }
    return state
}

/**
 * ① 内容层：全幅滚动内容。能力具备时内部先画与页面逐像素对齐的底色
 *    （+ 集合详情的封面氛围层副本），再挂 layerBackdrop 捕获 —— 玻璃采到的
 *    raster 是「真实局部背景 + 内容」的不透明画面，而不是透明底噪。
 *    页面自身的原生背景/氛围层在本层覆盖范围内被等价替换（同笔刷同边界），
 *    因此内容层只在能力具备时才绘制这两层。
 */
@Composable
internal fun BoxScope.TyTopGlassContentLayer(
    state: TyTopGlassState,
    colors: List<Color>,
    ambientImage: String?,
    ambientViewportHeight: Dp?,
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(
        modifier
            .onGloballyPositioned { coords -> state.reportOrigin(coords.positionInWindow().y) }
            .then(if (state.backdrop != null) Modifier.layerBackdrop(state.backdrop) else Modifier)
    ) {
        if (state.backdrop != null) {
            // 与 NativePageView 背景同笔刷、同边界（内容层=页面根大小）→ 逐像素对齐。
            Box(Modifier.matchParentSize().drawBehind { drawRect(Brush.verticalGradient(colors)) })
            if (ambientImage != null && ambientViewportHeight != null) {
                // 封面氛围层副本：与页面层同参数同位置（页面级原件在能力具备时不再绘制）。
                Box(Modifier.fillMaxWidth()) { NativePlaylistBackdrop(ambientImage, ambientViewportHeight) }
            }
        }
        content()
    }
}

/**
 * ③ 顶栏玻璃面：单一连续表面。主体 = drawBackdrop(捕获){vibrancy+blur} + 页面顶部
 *    同色半透明 tint；整面经 saveLayer+DstIn 蒙版，在底部 TailDp 内平滑衰减到透明。
 *    只画不接指针事件 ——标题/按钮在它之上，滑动穿透到列表。
 */
@Composable
internal fun BoxScope.TyTopGlassSurface(
    state: TyTopGlassState,
    colors: List<Color>,
    modifier: Modifier = Modifier,
) {
    val density = LocalDensity.current
    val light = LocalInterfacePalette.current.light
    // 玻璃底色：页面顶部背景色（深海绿/浅色主题色）+ 半透明 → 与页面自然融合。
    val tint = colors.first().copy(alpha = if (light) TyTopGlass.TintAlphaLight else TyTopGlass.TintAlphaDark)
    val blurPx = with(density) { TyTopGlass.BlurDp.dp.toPx() }
    if (state.backdrop == null) {
        // 降级：无捕获时为同一形状的半透明底色层（无模糊，同样底部衰减，无横带）。
        Box(
            modifier.fillMaxWidth()
                .height((state.headerBottomDp + TyTopGlass.TailDp).dp)
                .drawBehind {
                    val bottomPx = state.headerBottomDp * state.pxPerDp
                    if (bottomPx <= 0f) return@drawBehind
                    val tailPx = TyTopGlass.TailDp * state.pxPerDp
                    drawRect(
                        Brush.verticalGradient(
                            *topGlassMaskStops(bottomPx, tailPx).map { (position, mask) ->
                                position to tint.copy(alpha = tint.alpha * mask.alpha)
                            }.toTypedArray()
                        )
                    )
                }
        )
        return
    }
    Box(
        modifier.fillMaxWidth()
            .height((state.headerBottomDp + TyTopGlass.TailDp).dp)
            // 蒙版必须包住玻璃绘制：drawWithContent 的 drawContent() 含下方 drawBackdrop 的产出，
            // saveLayer 只覆盖顶栏区域（band 级离屏，尺寸小），DstIn 让强度平滑衰减。
            .drawWithCache {
                onDrawWithContent {
                    val bottomPx = state.headerBottomDp * state.pxPerDp
                    if (bottomPx <= 0f) return@onDrawWithContent
                    val tailPx = TyTopGlass.TailDp * state.pxPerDp
                    val mask = Brush.verticalGradient(*topGlassMaskStops(bottomPx, tailPx).toTypedArray())
                    drawIntoCanvas { canvas ->
                        canvas.nativeCanvas.saveLayer(0f, 0f, size.width, size.height, android.graphics.Paint())
                        drawContent()
                        drawRect(mask, blendMode = BlendMode.DstIn)
                        canvas.nativeCanvas.restore()
                    }
                }
            }
            .drawBackdrop(
                backdrop = state.backdrop,
                shape = { RectangleShape },
                effects = { vibrancy(); blur(blurPx) },
                onDrawSurface = { drawRect(tint) },
            )
    )
}
