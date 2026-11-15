package io.github.huleixin.tingyu.minimal.style

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.layout.ContentScale
import io.github.huleixin.tingyu.chrome.LocalLiquidReduced
import kotlinx.coroutines.CancellationException

// A short-lived snapshot bridges visual styles; only the selected live renderer exists.
@Composable
internal fun PlayerStyleTransition(target: PlayerStyle, modifier: Modifier = Modifier,
    content: @Composable (PlayerStyle) -> Unit,
) {
    val reduced = LocalLiquidReduced.current
    var capturing by remember { mutableStateOf(false) }
    var displayed by remember { mutableStateOf(target) }
    var outgoing by remember { mutableStateOf<ImageBitmap?>(null) }
    val fade = remember { Animatable(0f) }
    val layer = rememberGraphicsLayer()
    var recorded by remember { mutableStateOf(false) }
    LaunchedEffect(target, reduced) {
        if (displayed == target) return@LaunchedEffect
        if (reduced) { displayed = target; outgoing = null; return@LaunchedEffect }
        recorded = false
        capturing = true
        try {
            withFrameNanos { }
            outgoing = if (recorded) layer.toImageBitmap() else null
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { outgoing = null }
        finally { capturing = false }
        displayed = target
        fade.snapTo(1f)
        try { fade.animateTo(0f, tween(240)) }
        finally { outgoing = null }
    }
    Box(modifier) {
        Box(Modifier.fillMaxSize().drawWithContent {
            if (capturing) {
                layer.record { this@drawWithContent.drawContent() }
                drawLayer(layer)
                recorded = true
            } else drawContent()
        }) { content(displayed) }
        outgoing?.let { bitmap ->
            Image(bitmap, null, Modifier.fillMaxSize().graphicsLayer { alpha = fade.value },
                contentScale = ContentScale.FillBounds)
        }
    }
}
