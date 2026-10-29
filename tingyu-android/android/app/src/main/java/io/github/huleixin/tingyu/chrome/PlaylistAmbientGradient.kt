package io.github.huleixin.tingyu.chrome

import androidx.compose.ui.graphics.Color

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/PlaylistAmbientGradient.kt
internal val PlaylistBackgroundColors = listOf(Color(0xFF03221A),Color(0xFF03130E),Color(0xFF031812))
internal const val PlaylistAmbientFadeStart = .28f
internal const val PlaylistAmbientFadeEnd = .90f

/** Same sRGB stops and viewport coordinates as the page's underlying background. */
internal fun playlistBackgroundColor(position:Float):Color {
    val progress=position.coerceIn(0f,1f)*2
    val index=if(progress<1)0 else 1
    val fraction=(progress-index).coerceIn(0f,1f)
    val start=PlaylistBackgroundColors[index];val end=PlaylistBackgroundColors[index+1]
    return Color(start.red+(end.red-start.red)*fraction,start.green+(end.green-start.green)*fraction,
        start.blue+(end.blue-start.blue)*fraction)
}

/** Zero slope at both ends avoids the visible edge of a linear alpha ramp reaching a clipped bound. */
internal fun playlistAmbientVisibility(position:Float):Float {
    val progress=((position-PlaylistAmbientFadeStart)/(PlaylistAmbientFadeEnd-PlaylistAmbientFadeStart)).coerceIn(0f,1f)
    return 1-progress*progress*(3-2*progress)
}

/** A small cached SrcOver gradient covers the blurred image with the exact page background. */
internal fun playlistAmbientCoverStops(viewportHeight:Float,ambientHeight:Float):Array<Pair<Float,Color>> {
    require(viewportHeight.isFinite()&&viewportHeight>0&&ambientHeight.isFinite()&&ambientHeight>0)
    val positions=( (0..32).map{it/32f} + listOf(PlaylistAmbientFadeStart,PlaylistAmbientFadeEnd)
        + listOf((viewportHeight*.5f/ambientHeight).coerceIn(0f,1f)) ).distinct().sorted()
    return positions.map { position -> position to playlistBackgroundColor(position*ambientHeight/viewportHeight)
        .copy(alpha=1-playlistAmbientVisibility(position)) }.toTypedArray()
}
