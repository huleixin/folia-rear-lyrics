package io.github.huleixin.tingyu.chrome

import androidx.compose.runtime.staticCompositionLocalOf

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePageViewport.kt
// Physical pixels from the host, converted only inside each page's CSS density.
internal val LocalNativePageBottomPx = staticCompositionLocalOf { 0f }

/** Actual overlap, including floating chrome's top gap; never a guessed constant CSS inset. */
internal fun nativePageBottomClearance(pageTopPx: Float, pageHeightPx: Float, footerTopsPx: List<Float>, gapPx: Float): Float {
    val bottom = pageTopPx + pageHeightPx
    val first = footerTopsPx.filter { it >= pageTopPx && it < bottom }.minOrNull() ?: return 0f
    return (bottom - first + gapPx).coerceAtLeast(0f)
}

/** Index/search are full-window native pages; a delayed WebView resize packet cannot crop them. */
internal fun nativePageHeightPx(id: String, document: Boolean, requested: Float, top: Float, root: Float): Float {
    val available = (root - top).coerceAtLeast(0f)
    return if (id == "search" || id == "settings" && !document) available else minOf(requested, available)
}
