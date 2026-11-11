package io.github.huleixin.tingyu.chrome

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.window.Popup
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/LiquidPopup.kt
/** Keep the focusable native window alive until its exit completes; reopening reverses it. */
@Composable internal fun LiquidPopup(
    visible: Boolean,
    onDismissRequest: () -> Unit,
    offset: IntOffset = IntOffset.Zero,
    position: PopupPositionProvider? = null,
    content: @Composable () -> Unit,
) {
    val visibility = remember { MutableTransitionState(false) }
    visibility.targetState = visible
    val reduced = LocalLiquidReduced.current
    if (visibility.currentState || visibility.targetState || !visibility.isIdle) {
        val placement = position ?: remember(offset) { object : PopupPositionProvider {
            override fun calculatePosition(anchorBounds: IntRect, windowSize: IntSize,
                layoutDirection: LayoutDirection, popupContentSize: IntSize): IntOffset = IntOffset(
                    if(layoutDirection == LayoutDirection.Ltr) anchorBounds.left + offset.x
                    else anchorBounds.right - popupContentSize.width - offset.x,
                    anchorBounds.top + offset.y)
        } }
        Popup(popupPositionProvider = placement, onDismissRequest = onDismissRequest,
            properties = PopupProperties(focusable = true, dismissOnBackPress = true, dismissOnClickOutside = true)) {
            AnimatedVisibility(visibleState = visibility,
                enter = if (reduced) EnterTransition.None else fadeIn(tween(140)) +
                    scaleIn(spring(dampingRatio = TingYuMotion.PanelDamping, stiffness = TingYuMotion.PanelStiffness), initialScale = .92f, transformOrigin = TransformOrigin(.5f, 0f)),
                exit = if (reduced) ExitTransition.None else fadeOut(tween(TingYuMotion.PopupExitMs)) +
                    scaleOut(tween(TingYuMotion.PopupExitMs), targetScale = .96f, transformOrigin = TransformOrigin(.5f, 0f))) {
                content()
            }
        }
    }
}

/** Preserve menu spacing and semantics while sharing entry/exit and reduced-motion policy. */
@Composable internal fun LiquidDropdown(expanded: Boolean, onDismissRequest: () -> Unit,
    content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    val margin = with(LocalDensity.current) { 8.dp.roundToPx() }
    val position = remember(margin) { LiquidMenuPosition(margin) }
    LiquidPopup(expanded, onDismissRequest, position = position) {
        val palette = LocalInterfacePalette.current
        androidx.compose.material3.Surface(
            shape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp),
            color = palette.menuSurface, contentColor = palette.menuInk, shadowElevation = 6.dp,
        ) {
            Column(Modifier.width(IntrinsicSize.Max).heightIn(max = 480.dp)
                .verticalScroll(rememberScrollState()).padding(vertical = 8.dp), content = content)
        }
    }
}

/** Keep anchored menus below the trigger when space permits; otherwise open above, within the window. */
internal class LiquidMenuPosition(private val margin: Int): PopupPositionProvider {
    override fun calculatePosition(anchorBounds: IntRect, windowSize: IntSize,
        layoutDirection: LayoutDirection, popupContentSize: IntSize): IntOffset {
        val preferredX = if(layoutDirection == LayoutDirection.Ltr) anchorBounds.left else anchorBounds.right - popupContentSize.width
        val maxX = (windowSize.width - popupContentSize.width - margin).coerceAtLeast(margin)
        val maxY = (windowSize.height - popupContentSize.height - margin).coerceAtLeast(margin)
        val below = anchorBounds.bottom + margin / 2
        val above = anchorBounds.top - popupContentSize.height - margin / 2
        val y = if(below <= maxY) below else if(above >= margin) above else maxY
        return IntOffset(preferredX.coerceIn(margin, maxX), y.coerceIn(margin, maxY))
    }
}
