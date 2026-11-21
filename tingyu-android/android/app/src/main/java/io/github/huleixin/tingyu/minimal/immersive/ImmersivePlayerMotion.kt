package io.github.huleixin.tingyu.minimal.immersive

import io.github.huleixin.tingyu.minimal.PlayerPanelState
import androidx.compose.animation.core.spring
import androidx.compose.runtime.State
import androidx.compose.runtime.staticCompositionLocalOf
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
    fun fraction(): Float = interactive?.takeIf { it.initialized }?.progress
        ?: (entry.value * (if (exit.active) 1f - leaving.value else 1f)).coerceIn(0f, 1f)

    fun active() = interactive?.dragging == true || fraction() < 1f
    fun panelBounds(size: Size): Rect {
        return lerp(panel ?: Rect(0f,size.height,size.width,size.height), Rect(Offset.Zero,size), fraction())
    }
    fun coverBounds(target: Rect): Rect = lerp(cover ?: target, target, fraction())
    fun miniAlpha() = 1f - playerMotionReveal(fraction(), 0f, .12f)
    // Fade only the final overlap, where the live mini bar takes over the same pixels.
    fun shellAlpha() = if (panel != null) playerMotionReveal(fraction(), 0f, .12f) else 1f
    fun materialFraction(): Float {
        val p = ((fraction() - .03f) / .80f).coerceIn(0f, 1f)
        return p * p * (3f - 2f * p)
    }
    fun coverAlpha() = 1f
    fun sceneAlpha() = 1f

    /** Vertical travel of the full-size scene; the shell clip supplies the remaining geometry. */
    fun sceneTranslationY(size: Size): Float {
        return panelBounds(size).top
    }

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
        // Each frame shrinks the rounded clip. Without an offscreen pass the previous,
        // larger outline stays in the layer and slow drags leave stacked shells behind.
        compositingStrategy = CompositingStrategy.Offscreen
        val bounds = motion!!.panelBounds(size)
        shape = ImmersiveShellShape(bounds, minOf(46f * density, bounds.height / 2f) * (1f - fraction))
    } else compositingStrategy = CompositingStrategy.Auto
}

/** Decorations consume the same interactive progress as the shared artwork. */
internal fun Modifier.immersiveSceneReveal(motion: ImmersivePlayerMotion?) = graphicsLayer {
    if (motion != null && motion.active()) {
        alpha = motion.sceneAlpha()
        translationY = motion.sceneTranslationY(size)
    } else {
        alpha = 1f
        translationY = 0f
    }
}

internal fun Modifier.immersiveMovingCover(anchor: PlayerArtworkAnchor, motion: ImmersivePlayerMotion?) =
    if (motion == null) this else playerCoverTransform(anchor, motion::active, motion::coverBounds, motion::coverAlpha)
