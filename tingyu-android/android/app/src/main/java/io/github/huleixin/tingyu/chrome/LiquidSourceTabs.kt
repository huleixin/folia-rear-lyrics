package io.github.huleixin.tingyu.chrome

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.snap
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onPlaced
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.roundToInt

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/LiquidSourceTabs.kt
// 分类栏：选中项自动滚进可视区，右缘常驻轻微渐隐提示还有更多（左缘仅滚动后出现）。
// 不改变分类名称、数据与横向滑动手势。
/** One indicator in content coordinates; scrolling never rewrites every chip's window bounds. */
@Composable internal fun NativeSourceTabs(section: NativePageSection, modifier: Modifier = Modifier,
    search: Boolean = false, underline: Boolean = false, action: PageAction) {
    val scroll = rememberScrollState()
    var viewport by remember { mutableIntStateOf(0) }
    val spans = remember(section.items.map { it.id }) { mutableStateMapOf<Int, Pair<Float, Float>>() }
    val selected = section.items.indexOfFirst { it.selected }
    val span = spans[selected]
    val reduced = LocalLiquidReduced.current
    val spec = if (reduced) snap<Float>() else spring(dampingRatio = 1f, stiffness = 520f)
    val left = animateFloatAsState(span?.first ?: 0f, spec, label = "source-selection-left")
    val width = animateFloatAsState(span?.second ?: 0f, spec, label = "source-selection-width")
    val pad = with(LocalDensity.current) { 6.dp.toPx() }
    LaunchedEffect(selected, span, viewport) {
        if (span == null || viewport <= 0) return@LaunchedEffect
        val start = span.first; val end = start + span.second
        val target = when {
            start < scroll.value + pad -> start - pad
            end > scroll.value + viewport - pad -> end - viewport + pad
            else -> return@LaunchedEffect
        }.roundToInt().coerceAtLeast(0)
        if (reduced) scroll.scrollTo(target) else scroll.animateScrollTo(target)
    }
    val palette = LocalInterfacePalette.current
    val selectedColor = palette.directorySelected
    val subtle = palette.subtle
    val border = palette.selectedBorder
    val fade = palette.directoryFade
    Box(modifier.fillMaxWidth().onSizeChanged { viewport = it.width }) {
        Box(Modifier.horizontalScroll(scroll).drawBehind {
            if (search) spans.values.forEach { (x, w) ->
                drawRoundRect(subtle, Offset(x, 0f), Size(w, size.height), CornerRadius(size.height / 2f))
            }
            if (selected >= 0 && width.value > 0f && underline) {
                drawRoundRect(palette.accent, Offset(left.value, size.height - 2.dp.toPx()), Size(width.value, 2.dp.toPx()))
            }
            if (selected >= 0 && width.value > 0f && !underline) {
                val at = Offset(left.value, 0f); val bounds = Size(width.value, size.height)
                drawRoundRect(selectedColor, at, bounds, CornerRadius(size.height / 2f))
                if (search) drawRoundRect(border, at, bounds, CornerRadius(size.height / 2f),
                    style = androidx.compose.ui.graphics.drawscope.Stroke(1.dp.toPx()))
            }
        }) {
            Row(horizontalArrangement = Arrangement.spacedBy(if (underline) 0.dp else if (search) 8.dp else 6.dp)) {
                section.items.forEachIndexed { index, item ->
                    Box(Modifier.height(if (underline) 46.dp else 36.dp).widthIn(min = if (underline) 64.dp else 0.dp).onPlaced { spans[index] = it.positionInParent().x to it.size.width.toFloat() }
                        .chromeClickable(enabled = !item.disabled, corner = 999.dp) { action(item.action, "", 0.0) }
                        .padding(horizontal = if (underline) 8.dp else if (search) 14.dp else 18.dp), contentAlignment = Alignment.Center) {
                        Text(item.title, color = if (item.selected) PageAccent else PageMuted, fontSize = (if (search) 13 else 14).sp, fontWeight = if (underline && item.selected) androidx.compose.ui.text.font.FontWeight.SemiBold else androidx.compose.ui.text.font.FontWeight.Normal)
                    }
                }
            }
        }
        Box(Modifier.height(if (underline) 46.dp else 36.dp).width(18.dp).align(Alignment.CenterStart)
            .graphicsLayer { alpha = if (scroll.value > 1) 1f else 0f }
            .background(Brush.horizontalGradient(listOf(fade, Color.Transparent))))
        Box(Modifier.height(if (underline) 46.dp else 36.dp).width(18.dp).align(Alignment.CenterEnd)
            .background(Brush.horizontalGradient(listOf(Color.Transparent, fade))))
    }
}
