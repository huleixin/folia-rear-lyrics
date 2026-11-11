package io.github.huleixin.tingyu.chrome

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.pointer.pointerInput

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/LiquidMotion.kt
internal val LocalLiquidReduced = compositionLocalOf { false }
internal val LocalPanelProgress = compositionLocalOf<State<Float>> { mutableStateOf(1f) }
internal val LocalMotionOrigin = staticCompositionLocalOf { MotionOrigin() }
internal val LocalPlayerReveal = compositionLocalOf<State<Float>> { mutableStateOf(1f) }

/** Geometry is captured on interaction, not polled on every animation frame. */
internal class MotionOrigin {
    var bounds: Rect? = null
    private var recorded = 0L
    fun record(rect: Rect?) { bounds = rect; recorded = android.os.SystemClock.uptimeMillis() }
    fun recent(): Rect? = bounds?.takeIf { android.os.SystemClock.uptimeMillis() - recorded < 1500 }
}

/** Transform one retained live canvas; Folia, playback and lyric clocks keep their identity. */
internal fun Modifier.liquidPlayer(origin: Rect?, entry: State<Float>, exit: NativeStageExit,
    exitProgress: State<Float>, visible: Boolean = true, artwork: PlayerArtworkAnchor? = null) = graphicsLayer {
    val fraction = (entry.value * (if (exit.active) 1f - exitProgress.value else 1f)).coerceIn(0f, 1f)
    alpha = if (!visible) 0f else if (origin == null) fraction else liquidReveal(fraction, 0f).let { (it * 12f).coerceAtMost(1f) }
    transformOrigin = TransformOrigin(0f, 0f)
    if (origin != null) {
        val transform = playerTransform(origin, artwork?.bounds, size, fraction)
        scaleX = transform.scale; scaleY = transform.scale
        translationX = transform.translation.x; translationY = transform.translation.y
        clip = fraction < .9999f
        shape = androidx.compose.foundation.shape.RoundedCornerShape(transform.radius * density)
    } else {
        scaleX = 1f; scaleY = 1f; translationX = 0f
        translationY = (1f - fraction) * 32f * density
        clip = false
    }
}

@Composable internal fun rememberLiquidPlayerProgress(show: Boolean, resume: Boolean, reduced: Boolean, exiting: Boolean, ready: Boolean = true): State<Float> {
    // A new route owns a new entry clock: frame zero is already the mini bounds.
    // Cancelling this effect on Back freezes entry before the collapse clock takes over.
    val value = remember(show) { Animatable(if (show && !resume && !reduced) 0f else 1f) }
    LaunchedEffect(show, reduced, exiting, ready, resume) {
        if (exiting) value.stop()
        else if (!show || resume || reduced) value.snapTo(1f)
        else if (ready) value.animateTo(1f, tween(TingYuMotion.PlayerMorphMs, easing = TingYuMotion.Emphasized))
    }
    return value.asState()
}

internal fun liquidReveal(fraction: Float, start: Float): Float =
    ((fraction - start) / (1f - start)).coerceIn(0f, 1f)

/** Content follows the same clock as its container; it cannot outlive or race the morph. */
@Composable internal fun Modifier.liquidPlayerContent(start: Float = .18f): Modifier {
    val progress = LocalPlayerReveal.current
    return graphicsLayer {
        val p = liquidReveal(progress.value, start)
        alpha = p
        translationY = 14f * density * (1f - p)
    }
}

/** The transform belongs to the actual card, never a full-screen wrapper or separate Popup. */
@Composable internal fun Modifier.liquidPanel(kind: String, anchor: Rect? = null, destination: androidx.compose.ui.geometry.Offset = androidx.compose.ui.geometry.Offset.Zero): Modifier {
    val progress = LocalPanelProgress.current
    return pointerInput(Unit) { detectTapGestures { } }.graphicsLayer {
        val p = progress.value.coerceIn(0f, 1f)
        when (kind) {
            "menu" -> {
                transformOrigin = TransformOrigin(0f, 0f)
                scaleX = 1f - (1f - ((anchor?.width ?: size.width) / size.width.coerceAtLeast(1f)).coerceIn(.12f, 1f)) * (1f - p)
                scaleY = 1f - (1f - ((anchor?.height ?: 40f) / size.height.coerceAtLeast(1f)).coerceIn(.12f, 1f)) * (1f - p)
                translationX = ((anchor?.left ?: destination.x) - destination.x) * (1f - p)
                translationY = ((anchor?.top ?: destination.y) - destination.y) * (1f - p)
                alpha = (p * 3f).coerceIn(0f, 1f)
            }
            "dialog" -> { scaleX = .94f + .06f * p; scaleY = scaleX; alpha = p }
            else -> { translationY = size.height * (1f - p) }
        }
    }
}
