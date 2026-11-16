package io.github.huleixin.tingyu.minimal.immersive

import io.github.huleixin.tingyu.minimal.PlayerPanelState
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
    val entry: State<Float>, val exit: NativeStageExit, val leaving: State<Float>, val reduced: Boolean,
    val interactive: PlayerPanelState? = null) {
    var drag by mutableFloatStateOf(0f)
    fun fraction(): Float = ((interactive?.takeIf { it.initialized }?.progress ?: entry.value) *
        (1f - if (exit.active) leaving.value else 0f) * (1f - drag)).coerceIn(0f, 1f)
    fun active() = interactive?.dragging == true || fraction() < .9999f || exit.active
    fun panelBounds(size: Size): Rect {
        return lerp(panel ?: Rect(0f,size.height,size.width,size.height), Rect(Offset.Zero,size), fraction())
    }
    fun coverBounds(target: Rect): Rect = lerp(cover ?: target, target, fraction())
    fun miniAlpha() = ((1f - fraction()) * 5f - 3.5f).coerceIn(0f,1f)
    fun shellAlpha() = (fraction() / .12f).coerceIn(0f,1f)
    fun materialFraction(): Float {
        val p = ((fraction() - .03f) / .80f).coerceIn(0f, 1f)
        return p * p * (3f - 2f * p)
    }
    fun coverAlpha() = 1f
    fun sceneAlpha() = ((fraction() - .12f) / .68f).coerceIn(0f, 1f)

}

/** Keep the live scene at its final size; its clip and artwork share reversible progress. */
internal class ImmersiveShellShape(val bounds: Rect, val radius: Float): Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline =
        Outline.Rounded(RoundRect(bounds, CornerRadius(radius.coerceAtMost(bounds.height / 2f))))
}
internal fun Modifier.immersivePlayerContainer(motion: ImmersivePlayerMotion?) = graphicsLayer {
    // Read progress here, where Compose observes layer invalidation. The outline is
    // an immutable frame snapshot, not a lazy shape reading mutable gesture state.
    val fraction = motion?.fraction() ?: 1f
    clip = motion?.active() == true
    if (clip) {
        val bounds = motion!!.panelBounds(size)
        shape = ImmersiveShellShape(bounds, minOf(46f * density, bounds.height / 2f) * (1f - fraction))
    }
}

/** Decorations consume the same interactive progress as the shared artwork. */
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
