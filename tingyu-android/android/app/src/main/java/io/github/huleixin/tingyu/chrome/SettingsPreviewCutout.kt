package io.github.huleixin.tingyu.chrome

import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathOperation

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/SettingsPreviewCutout.kt
// Only the background omits preview pixels; no Clear operation enters Haze's cached source.
internal class SettingsPreviewCutouts {
    private val holes = mutableStateMapOf<String, Pair<Rect, Rect>>()
    fun update(id: String, bounds: Rect, visible: Rect) { holes[id] = bounds to visible }
    fun remove(id: String) { holes.remove(id) }

    /** Intersect the original rounded card with a rectangular viewport, without rounding the cut edge. */
    fun path(originX: Float, originY: Float, radius: Float): Path? {
        if (holes.isEmpty()) return null
        val result = Path()
        holes.values.forEach { (bounds, visible) ->
            if (visible.width > 0f && visible.height > 0f) {
                val card = Path().apply { addRoundRect(RoundRect(bounds.translate(-originX, -originY), radius, radius)) }
                val clip = Path().apply { addRect(visible.translate(-originX, -originY)) }
                result.addPath(Path.combine(PathOperation.Intersect, card, clip))
            }
        }
        return result
    }
}

internal val LocalSettingsPreviewCutouts = staticCompositionLocalOf<SettingsPreviewCutouts?> { null }
