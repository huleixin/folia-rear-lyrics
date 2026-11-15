package io.github.huleixin.tingyu.minimal.immersive

import androidx.compose.animation.core.spring
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.LinearEasing
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.*
import androidx.compose.ui.graphics.*
import androidx.compose.ui.layout.layout
import androidx.compose.ui.unit.*
import io.github.huleixin.tingyu.chrome.*
import kotlin.math.exp
import kotlin.math.roundToInt

// SPDX-License-Identifier: GPL-3.0-only
// Geometry/easing adapted from MeloXPlayerTransitionSpec and MeloXApp at
// c04f36b9af540806b3bb185b347572e9ca12d87d (MeloX Android 0.7.3).
// The shell uses Tingyu's retained native canvas, never a second player.
internal val LocalImmersiveMorph = staticCompositionLocalOf<ImmersivePlayerMotion?> { null }
internal fun immersiveSettleSpec() = spring<Float>(dampingRatio = 1f,
    stiffness = (6.2f / .46f) * (6.2f / .46f), visibilityThreshold = .001f)

internal val ImmersiveBoundsEasing = Easing { value ->
    val z = 6f * value.coerceIn(0f, 1f)
    ((1f - (1f + .85f * z) * exp(-z)) / (1f - 6.1f * exp(-6f))).coerceIn(0f, 1f)
}

/** Upstream closing tail: one 22dp sine sink in the last 38% of linear time. */
internal fun immersiveSinkFraction(progress: Float): Float {
    if (!progress.isFinite()) return 0f
    val u = ((progress - .62f) / .38f).coerceIn(0f, 1f)
    return if (u <= 0f || u >= 1f) 0f else kotlin.math.sin(kotlin.math.PI.toFloat() * u)
}

@Composable internal fun rememberImmersiveClosingTime(exiting: Boolean, reduced: Boolean): State<Float> {
    val time = remember { Animatable(0f) }
    LaunchedEffect(exiting, reduced) {
        if (!exiting || reduced) time.snapTo(0f)
        else { time.snapTo(0f); time.animateTo(1f, tween(460, easing = LinearEasing)) }
    }
    return time.asState()
}

/** Bounds have their own wall-clock easing upstream; never ease the master spring twice. */
@Composable internal fun rememberImmersiveBoundsProgress(show: Boolean, resume: Boolean, reduced: Boolean,
    exiting: Boolean, ready: Boolean): State<Float> {
    val value = remember(show) { Animatable(if (show && !resume && !reduced) 0f else 1f) }
    LaunchedEffect(show, resume, reduced, exiting, ready) {
        if (!show || resume || reduced) value.snapTo(1f)
        else if (exiting) value.animateTo(0f, tween(460, easing = ImmersiveBoundsEasing))
        else if (ready) value.animateTo(1f, tween(460, easing = ImmersiveBoundsEasing))
    }
    return value.asState()
}

internal class ImmersivePlayerMotion(val panel: Rect?, val cover: Rect?,
    val entry: State<Float>, val exit: NativeStageExit, val leaving: State<Float>, val reduced: Boolean,
    private val boundsProgress: State<Float>? = null,
    private val closingTime: State<Float>? = null, private val sinkPeakPx: Float = 0f) {
    var drag by mutableFloatStateOf(0f)
    fun fraction(): Float = (entry.value * (1f - if (exit.active) leaving.value else 0f) * (1f - drag)).coerceIn(0f, 1f)
    fun active() = !reduced && (entry.value < .9999f || exit.active || drag > .0001f)
    fun geometryFraction(): Float = ((boundsProgress?.value ?: fraction()) * (if (boundsProgress != null) 1f - drag else 1f)).coerceIn(0f, 1f)
    fun sinkOffset(): Float = if (!reduced && exit.active) immersiveSinkFraction(closingTime?.value ?: 0f) * sinkPeakPx else 0f
    fun panelBounds(size: Size): Rect {
        val start = panel ?: Rect(0f, size.height, size.width, size.height)
        return lerp(start, Rect(Offset.Zero, size), geometryFraction()).translate(0f, sinkOffset())
    }
    fun coverBounds(target: Rect): Rect = lerp(cover ?: target, target, geometryFraction()).translate(0f, sinkOffset())
    fun miniAlpha() = ((1f - fraction()) * 5f - 3.5f).coerceIn(0f, 1f)
}

/** Remeasure the shell as in upstream RemeasureToBounds; artwork stays outside its clip. */
internal fun Modifier.immersivePlayerContainer(motion: ImmersivePlayerMotion?) =
    layout { measurable, constraints ->
        val full = Size(constraints.maxWidth.toFloat(), constraints.maxHeight.toFloat())
        val bounds = if (motion?.active() == true) motion.panelBounds(full) else Rect(Offset.Zero, full)
        val child = measurable.measure(Constraints.fixed(bounds.width.roundToInt().coerceAtLeast(1),
            bounds.height.roundToInt().coerceAtLeast(1)))
        layout(full.width.roundToInt(), full.height.roundToInt()) {
            child.placeWithLayer(bounds.left.roundToInt(), bounds.top.roundToInt()) {
                clip = motion?.active() == true
                shape = androidx.compose.foundation.shape.RoundedCornerShape(
                    minOf(46f * density, bounds.height / 2f))
            }
        }
    }

/** Same scene reveal window as MeloXIOSNowPlayingSharedHost; background remains opaque. */
internal fun Modifier.immersiveSceneReveal(motion: ImmersivePlayerMotion?) = graphicsLayer {
    val u = (((motion?.fraction() ?: 1f) - .04f) / .48f).coerceIn(0f, 1f)
    alpha = u * u * (3f - 2f * u)
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
        } else { scaleX = 1f; scaleY = 1f; translationX = 0f; translationY = 0f }
    }
}
