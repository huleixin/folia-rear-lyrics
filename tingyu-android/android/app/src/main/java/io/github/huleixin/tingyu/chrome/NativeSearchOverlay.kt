package io.github.huleixin.tingyu.chrome

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.width
import kotlin.math.roundToInt

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeSearchOverlay.kt
//
// 页面级搜索框的**固定层**（68591 / 68593）。
//
// 背景：
//  · 资料库的搜索框原来是页面里的一块普通 Row —— 键盘弹出时它不动，被顶上去的是底栏；
//  · 歌单的搜索框是 LazyColumn 的一个 item —— 会跟着歌曲滚动，点放大镜时"凭空出现在
//    列表中间"。
//
// 这里把它从滚动容器里拿出来，作为页面根 Box 之上的一层：展开时从 `origin`
// （原输入框 / 放大镜按钮的矩形）插值到「状态栏下方」的固定位置；收起时原路返回。
// 用 graphicsLayer 的缩放+平移做矩形插值，不触发重新测量 —— 不会"先跳位再动画"，
// 也不会让列表重排抖动。
//
// 调用方职责：把本层放在页面根 Box 的最后（在列表之上），自己决定列表的顶部避让量。

internal val NativeSearchBarHeight: Dp = 46.dp

/** 把页面坐标换算成"相对页面根"的矩形：锚点用 positionInWindow，页面根也用同一个基准。 */
internal fun anchorInPage(anchor: androidx.compose.ui.layout.LayoutCoordinates, pageOrigin: Offset): Rect {
    val p = anchor.positionInWindow() - pageOrigin
    return Rect(p, Size(anchor.size.width.toFloat(), anchor.size.height.toFloat()))
}

@Composable
internal fun NativeSearchOverlay(
    visible: Boolean,
    section: NativePageSection?,
    action: PageAction,
    /** 页面安全区（状态栏高度 dp），bar 最终停在它下面 6dp */
    safeTop: Float,
    /** 展开起点（页面坐标，px）。null 时退化为"上方 24dp 处上浮"。 */
    origin: Rect?,
    inset: Dp = 14.dp,
    /** 收起动画结束后的收尾（此时才允许撤销 JS 侧的搜索状态 / 恢复原布局）。 */
    onClosed: () -> Unit = {},
    /** 条右侧的"取消"：先清焦点收键盘，再由调用方让 visible=false 播放收起动画。 */
    onRequestClose: () -> Unit = {},
    dismissLabel: String = "取消",
) {
    if (section == null) return
    val density = LocalDensity.current
    val barPx = with(density) { NativeSearchBarHeight.toPx() }
    val insetPx = with(density) { inset.toPx() }
    val targetTop = with(density) { safeTop.dp.toPx() } + with(density) { 6.dp.toPx() }

    // 目标宽度由布局量出来（fillMaxWidth - inset*2），用于换算起始缩放比。
    var targetWidth by remember { mutableFloatStateOf(1f) }

    val progress by animateFloatAsState(
        targetValue = if (visible) 1f else 0f,
        animationSpec = tween(280, easing = CubicBezierEasing(0.2f, 0.8f, 0.2f, 1f)),
        label = "native-search-morph",
    )

    var closedReported by remember { mutableStateOf(false) }
    var everVisible by remember { mutableStateOf(false) }
    LaunchedEffect(visible, progress) {
        if (visible) { everVisible = true; closedReported = false }
        // 只有"真正展开过"才在收起完成后回调：否则首次组合就会误触发调用方的收尾动作
        // （例如歌单页会以为用户关掉了搜索，把 JS 侧的筛选状态一并撤销）。
        else if (everVisible && !closedReported && progress < 0.02f) { closedReported = true; onClosed() }
    }

    val focus = remember { FocusRequester() }
    val focusManager = androidx.compose.ui.platform.LocalFocusManager.current
    LaunchedEffect(visible) {
        if (visible) { withFrameNanos { }; runCatching { focus.requestFocus() } }
        else focusManager.clearFocus()   // 先收键盘，再播收起动画（需求二·5）
    }

    val p = progress.coerceIn(0f, 1f)
    val startLeft = origin?.left ?: insetPx
    val startTop = origin?.top ?: (targetTop - with(density) { 24.dp.toPx() })
    val startWidth = (origin?.width ?: (targetWidth * 0.92f)).coerceAtLeast(1f)
    val startHeight = (origin?.height ?: barPx).coerceAtLeast(1f)

    Box(Modifier.fillMaxWidth().height(NativeSearchBarHeight)
        .offset { IntOffset(0, targetTop.roundToInt()) }
        .padding(horizontal = inset)) {
        Box(Modifier.fillMaxSize()
            .onGloballyPositioned { targetWidth = it.size.width.toFloat().coerceAtLeast(1f) }
            .graphicsLayer {
                transformOrigin = TransformOrigin(0f, 0f)
                val w = lerp(startWidth, targetWidth, p).coerceAtLeast(1f)
                val h = lerp(startHeight, barPx, p).coerceAtLeast(1f)
                scaleX = w / targetWidth
                scaleY = h / barPx
                // 起始时左上角落在 origin，结束时落在 inset（自身布局原点）。
                translationX = lerp(startLeft, insetPx, p) - insetPx
                translationY = lerp(startTop, targetTop, p) - targetTop
                // 文字在小尺寸阶段压缩会很难看：后半段才显出来。
                alpha = ((p - 0.35f) / 0.65f).coerceIn(0f, 1f)
            }) {
            androidx.compose.foundation.layout.Row(Modifier.fillMaxSize(), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) { SearchBarSurface(section, action, focus, autoFocus = visible) }
                androidx.compose.foundation.layout.Spacer(Modifier.width(10.dp))
                androidx.compose.material3.Text(
                    dismissLabel,
                    color = PageMuted,
                    fontSize = 13.sp,
                    modifier = Modifier.clickable { onRequestClose() }.padding(horizontal = 4.dp, vertical = 8.dp),
                )
            }
        }
    }
}

private fun lerp(from: Float, to: Float, t: Float) = from + (to - from) * t

@Composable
private fun SearchBarSurface(section: NativePageSection, action: PageAction, focus: FocusRequester, autoFocus: Boolean) {
    Box(Modifier.fillMaxSize()
        .background(interfaceColor(Color(0x1AFFFFFF), LightInterfaceColors.Subtle), RoundedCornerShape(999.dp))
        .border(1.dp, interfaceColor(Color(0x3391DBBD), LightInterfaceColors.Focus), RoundedCornerShape(999.dp))) {
        NativePageInput(
            section = section,
            action = action,
            search = true,
            focusRequester = focus,
            // 只有真正展开时才自动聚焦：这个层在页面一进来就存在（section 一直在模型里），
            // 无条件 autoFocus 会让"进入资料库"直接弹出输入法（68602）。
            autoFocus = autoFocus,
            bare = true,
        )
    }
}

/** 供页面在根布局上采集坐标基准。 */
internal fun Modifier.pageOrigin(onChange: (Offset) -> Unit): Modifier =
    onGloballyPositioned { onChange(it.positionInWindow()) }

/** 锚点尺寸（放大镜按钮等）用：直接取相对页面的矩形。 */
internal fun Modifier.pageAnchor(pageOrigin: Offset, onChange: (Rect) -> Unit): Modifier =
    onGloballyPositioned { onChange(anchorInPage(it, pageOrigin)) }
