package io.github.huleixin.tingyu.minimal.immersive

import androidx.compose.animation.core.spring
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.*
import androidx.compose.ui.graphics.*
import androidx.compose.ui.unit.*
import io.github.huleixin.tingyu.chrome.*

// SPDX-License-Identifier: GPL-3.0-only
// Geometry/easing adapted from MeloXPlayerTransitionSpec and MeloXApp at
// c04f36b9af540806b3bb185b347572e9ca12d87d (MeloX Android 0.7.3).
// The shell uses Tingyu's retained native canvas, never a second player.
internal val LocalImmersiveMorph = staticCompositionLocalOf<ImmersivePlayerMotion?> { null }
internal fun immersiveSettleSpec() = spring<Float>(dampingRatio = 1f,
    stiffness = (6.2f / .46f) * (6.2f / .46f), visibilityThreshold = .001f)

internal class ImmersivePlayerMotion(val panel: Rect?, val cover: Rect?,
    val entry: State<Float>, val exit: NativeStageExit, val leaving: State<Float>, val reduced: Boolean) {
    var drag by mutableFloatStateOf(0f)
    fun fraction(): Float = (entry.value * (1f - if (exit.active) leaving.value else 0f) * (1f - drag)).coerceIn(0f, 1f)
    fun active() = !reduced && (entry.value < .9999f || exit.active || drag > .0001f)
    private val classic = if (panel != null && cover != null) MinimalPlayerMorph(panel, cover, entry, exit, leaving, reduced) else null
    fun panelBounds(size: Size): Rect {
        val bounds = classic?.panelBounds(size) ?: lerp(panel ?: Rect(0f,size.height,size.width,size.height), Rect(Offset.Zero,size), fraction())
        return lerp(bounds, panel ?: bounds, drag)
    }
    fun coverBounds(target: Rect): Rect = lerp(classic?.coverBounds(target) ?: target, cover ?: target, drag)
    fun miniAlpha() = classic?.miniAlpha() ?: ((1f - fraction()) * 5f - 3.5f).coerceIn(0f,1f)
    fun shellAlpha() = if (reduced) 1f else classic?.shellAlpha() ?: fraction()
    fun materialFraction(): Float {
        if (reduced) return 1f
        val p = ((fraction() - .03f) / .80f).coerceIn(0f, 1f)
        return p * p * (3f - 2f * p)
    }
    fun coverAlpha() = if (reduced) 1f else classic?.coverAlpha() ?: 1f
    fun sceneAlpha() = classic?.sectionAlpha("controls") ?: fraction()

}

/** Keep the live scene at its final size: only its clip follows the classic shell geometry. */
internal fun Modifier.immersivePlayerContainer(motion: ImmersivePlayerMotion?) = graphicsLayer {
    clip = motion?.active() == true
    if (clip) shape = object : Shape {
        override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
            val bounds = motion!!.panelBounds(size)
            val radius = minOf(46f * density.density, bounds.height / 2f) * (1f - motion.fraction())
            return Outline.Rounded(RoundRect(bounds, CornerRadius(radius)))
        }
    }
}

/** Decorations consume the same classic entry/exit clock as the shared artwork. */
internal fun Modifier.immersiveSceneReveal(motion: ImmersivePlayerMotion?) = graphicsLayer {
    alpha = motion?.sceneAlpha() ?: 1f
}

@Composable internal fun Modifier.immersiveMovingCover(anchor: PlayerArtworkAnchor, active: Boolean): Modifier {
    val motion = LocalImmersiveMorph.current
    val overlay = LocalMinimalCoverOverlay.current ?: return this
    return with(overlay) { renderInSharedTransitionScopeOverlay(zIndexInOverlay = 5f,
        renderInOverlay = { active && motion?.active() == true }) }.graphicsLayer {
        val target = anchor.bounds
        if (active && motion?.active() == true && target != null && target.width > 0f && target.height > 0f) {
            val bounds = motion.coverBounds(target)
            transformOrigin = TransformOrigin(0f, 0f)
            scaleX = bounds.width / target.width; scaleY = bounds.height / target.height
            translationX = bounds.left - target.left; translationY = bounds.top - target.top
            alpha = motion.coverAlpha()
        } else { scaleX = 1f; scaleY = 1f; translationX = 0f; translationY = 0f; alpha = 1f }
    }
}
