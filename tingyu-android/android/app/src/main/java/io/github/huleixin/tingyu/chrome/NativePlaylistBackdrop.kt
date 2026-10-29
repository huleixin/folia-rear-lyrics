package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePlaylistBackdrop.kt
/** Fade only the cover into the existing page colors, without an isolated DstIn mask. */
@Composable internal fun NativePlaylistBackdrop(image:String,viewportHeight:Dp) {
    if(image.isBlank()||viewportHeight<=0.dp)return
    val ambientHeight=minOf(560.dp,viewportHeight*.7f)
    Box(Modifier.fillMaxWidth().height(ambientHeight).clipToBounds().drawWithCache {
        val fade=Brush.verticalGradient(*playlistAmbientCoverStops(viewportHeight.toPx(),size.height))
        onDrawWithContent { drawContent();drawRect(fade) }
    }) {
        AsyncImage(pageImage(image),null,Modifier.align(Alignment.TopEnd).offset(y=(-30).dp)
            .fillMaxWidth().height(maxOf(440.dp,ambientHeight+60.dp)).graphicsLayer{alpha=.28f}
            .blur(22.dp,edgeTreatment=BlurredEdgeTreatment.Unbounded),contentScale=ContentScale.Crop)
    }
}
