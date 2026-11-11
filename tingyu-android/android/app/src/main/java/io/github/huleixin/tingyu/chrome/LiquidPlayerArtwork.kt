package io.github.huleixin.tingyu.chrome

import androidx.compose.runtime.*
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.layout.LayoutCoordinates

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/LiquidPlayerArtwork.kt
/** Measure inside the same transformed canvas: outer scaling cancels out of these coordinates. */
internal class PlayerArtworkAnchor {
    private var canvas: LayoutCoordinates? = null
    private var artwork: LayoutCoordinates? = null
    var bounds by mutableStateOf<Rect?>(null)
        private set
    fun canvas(value: LayoutCoordinates) { canvas = value; refresh() }
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
