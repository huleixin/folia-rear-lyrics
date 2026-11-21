package io.github.huleixin.tingyu.chrome

import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/MinimalCoverOverlay.kt
internal val LocalMinimalCoverOverlay = staticCompositionLocalOf<SharedTransitionScope?> { null }
/** The real cover is drawn once above pager clipping; no thumbnail copy or second image loader. */
@Composable internal fun MinimalCoverOverlay(content: @Composable ()->Unit) {
    // The moving cover has its own transform; the host owns the full-frame underlay.
    SharedTransitionLayout(Modifier.fillMaxSize()) {
        CompositionLocalProvider(LocalMinimalCoverOverlay provides this) { content() }
    }
}
@Composable internal fun Modifier.minimalMovingCover(
    anchor: PlayerArtworkAnchor,
    visiblePage: Boolean,
    active: Boolean,
    moving: () -> Boolean,
): Modifier {
    val motion = LocalMinimalMorph.current
    if (!visiblePage) return this
    val isMorphing = { motion?.active() == true }
    val overlay = LocalMinimalCoverOverlay.current
    val elevated = if (overlay == null) this else with(overlay) {
        renderInSharedTransitionScopeOverlay(zIndexInOverlay = 5f,
            renderInOverlay = { isMorphing() || (active && moving()) })
    }
    // The pager overlay remains below the player panel's outer clip.
    return if (motion == null) elevated else elevated.playerCoverTransform(anchor, isMorphing, motion::coverBounds, motion::coverAlpha)
}
