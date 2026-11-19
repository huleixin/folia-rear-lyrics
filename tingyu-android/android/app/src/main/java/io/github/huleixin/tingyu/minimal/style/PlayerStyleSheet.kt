package io.github.huleixin.tingyu.minimal.style

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.unit.dp
import io.github.huleixin.tingyu.chrome.*
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

// Local style-system sheet: the whole header follows the finger; scrolling content keeps its gesture.
@Composable
internal fun PlayerStyleSheet(theme: TyPanelTheme, title: String, subtitle: String,
    onClose: () -> Unit, content: @Composable ColumnScope.() -> Unit,
) {
    BackHandler { onClose() }
    val themeDensity = androidx.compose.ui.platform.LocalDensity.current.density
    val reduced = LocalLiquidReduced.current
    var offset by remember { mutableFloatStateOf(0f) }
    val bounce = remember { Animatable(0f) }
    val scope = rememberCoroutineScope()
    var settling by remember { mutableStateOf<Job?>(null) }
    val velocity = remember { VelocityTracker() }
    val latestClose by rememberUpdatedState(onClose)
    fun release(canceled: Boolean) {
        if (!canceled && (offset > 90 * themeDensity || (offset > 0 && velocity.calculateVelocity().y > 1200f))) {
            // Overlay exit retains the drag offset so its first frame cannot jump back.
            latestClose()
        } else settling = scope.launch {
            bounce.snapTo(offset)
            if (reduced) { offset = 0f; bounce.snapTo(0f) }
            else bounce.animateTo(0f, spring(dampingRatio = 1f, stiffness = 420f)) { offset = value }
        }
    }
    BoxWithConstraints(Modifier.fillMaxSize().imePadding()) {
        val window = LocalPadWindow.current
        val tabletPanel = window.tablet || maxWidth >= 600.dp
        val sheetShape = if (tabletPanel) RoundedCornerShape(24.dp) else RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp)
        val sheetModifier = if (tabletPanel) {
            Modifier
                .padding(horizontal = 24.dp, vertical = 20.dp)
                .widthIn(max = 680.dp)
                .fillMaxWidth()
                .heightIn(max = minOf(maxHeight * 0.88f, 760.dp))
                .align(Alignment.Center)
        } else {
            Modifier
                .fillMaxWidth()
                .heightIn(max = maxHeight * .94f)
                .align(Alignment.BottomCenter)
        }
        Column(
            sheetModifier
                .liquidPanel("sheet")
                .graphicsLayer { translationY = offset }
                .clip(sheetShape)
                .background(theme.surface)
        ) {
            Column(Modifier.fillMaxWidth().pointerInput(title, reduced, tabletPanel) {
                if (tabletPanel) return@pointerInput
                detectVerticalDragGestures(
                    onDragStart = { settling?.cancel(); velocity.resetTracking() },
                    onDragCancel = { release(true) }, onDragEnd = { release(false) },
                    onVerticalDrag = { change, dy ->
                        change.consume(); velocity.addPosition(change.uptimeMillis, change.position)
                        offset = (offset + dy).coerceAtLeast(0f)
                    })
            }) {
                if (!tabletPanel) {
                    Box(Modifier.fillMaxWidth().height(20.dp), contentAlignment = Alignment.Center) {
                        Box(Modifier.size(36.dp, 4.dp).clip(RoundedCornerShape(2.dp)).background(theme.muted.copy(alpha = .4f)))
                    }
                } else {
                    Spacer(Modifier.height(10.dp))
                }
                TyPanelHeader(theme, title, subtitle, onClose)
            }
            Column(Modifier.fillMaxWidth().weight(1f, fill = false).verticalScroll(rememberScrollState())
                .padding(horizontal = 22.dp), content = content)
            Spacer(Modifier.height(if (tabletPanel) 20.dp else 24.dp))
        }
    }
}
