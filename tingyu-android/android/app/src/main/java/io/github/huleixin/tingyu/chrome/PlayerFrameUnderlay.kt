package io.github.huleixin.tingyu.chrome

import androidx.compose.runtime.State
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import io.github.huleixin.tingyu.minimal.PlayerPanelState

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/PlayerFrameUnderlay.kt
/** Moving child layers must redraw over a complete current underlay, including their old bounds. */
internal fun Modifier.playerFrameUnderlay(panel: PlayerPanelState, leaving: State<Float>) = drawWithContent {
    // Read animation state here: invalidate the full root drawing without recomposing the scene.
    panel.progress
    panel.classicFrame
    leaving.value
    // The player shell is clipped during its morph, so the retained page / WebView
    // underneath must remain visible through the newly exposed area. Filling this
    // root with the launch palette turns that area into a flat light-colored slab.
    // Keep the invalidation reads above; child layers still redraw their old bounds.
    drawContent()
}
