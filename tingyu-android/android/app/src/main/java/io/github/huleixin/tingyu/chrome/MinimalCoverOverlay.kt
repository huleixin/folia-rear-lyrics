package io.github.huleixin.tingyu.chrome

import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/MinimalCoverOverlay.kt
internal val LocalMinimalCoverOverlay = staticCompositionLocalOf<SharedTransitionScope?> { null }
/** The real cover is drawn once above pager clipping; no thumbnail copy or second image loader. */
@Composable internal fun MinimalCoverOverlay(content: @Composable ()->Unit) {
    val motion = LocalMinimalMorph.current
    // Isolate the live shell plus overlay artwork while their damage bounds move.
    // Each frame clears this one target; release it as soon as motion settles.
    SharedTransitionLayout(Modifier.fillMaxSize().graphicsLayer {
        compositingStrategy = if(motion?.active() == true) CompositingStrategy.Offscreen else CompositingStrategy.Auto
    }) {
        CompositionLocalProvider(LocalMinimalCoverOverlay provides this) { content() }
    }
}
@Composable internal fun Modifier.minimalMovingCover(anchor: PlayerArtworkAnchor, active: Boolean, moving: () -> Boolean = { false }): Modifier {
    val motion=LocalMinimalMorph.current
    val overlay=LocalMinimalCoverOverlay.current ?: return this
    val elevated=with(overlay) { renderInSharedTransitionScopeOverlay(zIndexInOverlay=5f,renderInOverlay={active && (motion?.active() == true || moving())}) }
    return elevated.graphicsLayer {
        val target=anchor.bounds
        if(motion != null && motion.active() && active && target!=null && target.width>0 && target.height>0) {
            val bounds=motion.coverBounds(target)
            transformOrigin=TransformOrigin(0f,0f)
            scaleX=bounds.width/target.width;scaleY=bounds.height/target.height
            translationX=bounds.left-target.left;translationY=bounds.top-target.top
            alpha=motion.coverAlpha()
        } else {scaleX=1f;scaleY=1f;translationX=0f;translationY=0f;alpha=1f}
    }
}
