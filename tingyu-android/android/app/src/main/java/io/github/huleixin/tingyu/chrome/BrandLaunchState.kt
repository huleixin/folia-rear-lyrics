package io.github.huleixin.tingyu.chrome

import android.webkit.WebView
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.runtime.*
import kotlinx.coroutines.delay

// One startup handoff; it never owns navigation or player state.
class BrandLaunchState(show: Boolean = false) {
    var reduced = false
    var active by mutableStateOf(show)
    var reactReady by mutableStateOf(false)
}

@Composable
fun brandLaunchAlpha(state: BrandLaunchState, pageReady: Boolean, reduced: Boolean, web: WebView, webContentReady: Boolean = false): androidx.compose.runtime.State<Float> {
    val alpha = remember { Animatable(1f) }
    LaunchedEffect(state.active, state.reactReady, pageReady, webContentReady) {
        if (state.active && state.reactReady && (pageReady || webContentReady)) {
            // Let the accepted native page draw before revealing it. No animation-duration gate.
            withFrameNanos {}
            withFrameNanos {}
            if (webContentReady) {
                // A cold deep link may target the retained web stage instead of a native page.
                // Fade only its HTML cover, keeping the stage itself fully opaque.
                alpha.snapTo(1f)
                web.evaluateJavascript("window.__tingyuFadeSplash && window.__tingyuFadeSplash()", null)
                if (!reduced) delay(320)
            } else {
                alpha.animateTo(0f, tween(if (reduced) 0 else 320))
            }
            web.evaluateJavascript("window.__tingyuFinishSplash && window.__tingyuFinishSplash()") {
                state.active = false
            }
        }
    }
    return alpha.asState()
}
