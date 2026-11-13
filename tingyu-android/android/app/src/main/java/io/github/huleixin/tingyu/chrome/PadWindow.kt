package io.github.huleixin.tingyu.chrome

import androidx.compose.runtime.staticCompositionLocalOf

// Window dimensions are dp from the actual Compose root, including multi-window resize.
data class PadWindow(val width: Float = 0f, val height: Float = 0f) {
    val tablet get() = minOf(width, height) >= 600f
    val expanded get() = width >= 840f && height >= 480f
    val splitPlayer get() = expanded && width > height
    val columns get() = (width / 220f).toInt().coerceIn(4, 5)
    val rail get() = if (expanded) 104f else 0f
}
val LocalPadWindow = staticCompositionLocalOf { PadWindow() }
