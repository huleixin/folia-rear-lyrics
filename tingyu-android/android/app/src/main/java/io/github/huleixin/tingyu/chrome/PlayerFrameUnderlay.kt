package io.github.huleixin.tingyu.chrome

import androidx.compose.runtime.State
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import io.github.huleixin.tingyu.minimal.PlayerPanelState

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/PlayerFrameUnderlay.kt
/** Moving child layers must redraw over a complete current underlay, including their old bounds. */
internal fun Modifier.playerFrameUnderlay(base: Color, panel: PlayerPanelState, leaving: State<Float>,
    ownsFrame: () -> Boolean) = drawWithContent {
    // Read animation state here: invalidate the full root drawing without recomposing the scene.
    panel.progress
    panel.classicFrame
    leaving.value
    if (ownsFrame() && panel.initialized) drawPlayerFrameUnderlay(base)
    drawContent()
}

internal fun DrawScope.drawPlayerFrameUnderlay(base: Color) {
    drawRect(base.copy(alpha = 1f))
}
