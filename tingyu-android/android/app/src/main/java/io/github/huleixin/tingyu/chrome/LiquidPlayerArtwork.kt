package io.github.huleixin.tingyu.chrome

import androidx.compose.runtime.*
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/LiquidPlayerArtwork.kt
/** Measure inside the same transformed canvas: outer scaling cancels out of these coordinates. */
internal class PlayerArtworkAnchor {
    private var canvas: LayoutCoordinates? = null
    private var artwork: LayoutCoordinates? = null
    var bounds by mutableStateOf<Rect?>(null)
        private set
    fun clear() { artwork = null; bounds = null }
    var canvasSize by mutableStateOf<Size?>(null)
        private set
    fun canvas(value: LayoutCoordinates) {
        canvas = value
        canvasSize = Size(value.size.width.toFloat(), value.size.height.toFloat())
        refresh()
    }
    fun artwork(value: LayoutCoordinates) { artwork = value; refresh() }
    private fun refresh() {
        val root = canvas ?: return; val cover = artwork ?: return
        if (root.isAttached && cover.isAttached) bounds = root.localBoundingBoxOf(cover, clipBounds = false)
    }
}
internal val LocalPlayerArtworkAnchor = staticCompositionLocalOf { PlayerArtworkAnchor() }
internal data class PlayerTransform(val scale: Float, val translation: Offset, val radius: Float)
/** Uniform scaling maps the real large cover back to the tapped mini cover without stretching. */
internal fun playerTransform(origin: Rect, cover: Rect?, size: Size, fraction: Float): PlayerTransform {
    val p = fraction.coerceIn(0f, 1f)
    val target = cover?.takeIf { it.width > 0f && it.height > 0f }
        ?: Rect(size.width * .15f, size.height * .24f, size.width * .85f, size.height * .24f + size.width * .7f)
    val initial = (origin.width / target.width).coerceIn(.01f, 1f)
    val scale = initial + (1f - initial) * p
    val translation = (origin.center - target.center * initial) * (1f - p)
    return PlayerTransform(scale, translation, 32f * (1f - p))
}


internal const val MiniPlayerCoverRadiusDp = 10f
internal const val FullPlayerCoverRadiusDp = 22f

internal fun playerMotionReveal(progress: Float, start: Float, end: Float): Float {
    val p = ((progress - start) / (end - start)).coerceIn(0f, 1f)
    return p * p * (3f - 2f * p)
}

/** Convert a screen-space radius to the cover layer's local coordinates before it is scaled. */
internal fun playerCoverLocalRadius(progress: Float, miniSide: Float?, fullSide: Float, fullRadius: Float): Float {
    val p = progress.coerceIn(0f, 1f)
    if (miniSide == null || miniSide <= 0f || fullSide <= 0f || p == 1f) return fullRadius
    val scale = (miniSide + (fullSide - miniSide) * p) / fullSide
    return (MiniPlayerCoverRadiusDp + (fullRadius - MiniPlayerCoverRadiusDp) * p) / scale
}

/** The transform stays within the shell. A missing layout anchor never exposes the full-size card. */
internal fun Modifier.playerCoverTransform(
    anchor: PlayerArtworkAnchor,
    moving: () -> Boolean,
    bounds: (Rect) -> Rect,
    opacity: () -> Float,
) = graphicsLayer {
    val target = anchor.bounds
    val isMoving = moving()
    if (isMoving && target != null && target.width > 0f && target.height > 0f) {
        val frame = bounds(target)
        transformOrigin = TransformOrigin(0f, 0f)
        scaleX = frame.width / target.width
        scaleY = frame.height / target.height
        translationX = frame.left - target.left
        translationY = frame.top - target.top
        alpha = opacity()
    } else {
        scaleX = 1f
        scaleY = 1f
        translationX = 0f
        translationY = 0f
        alpha = if (isMoving) 0f else 1f
    }
}
