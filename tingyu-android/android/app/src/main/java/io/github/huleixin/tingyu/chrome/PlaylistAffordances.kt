package io.github.huleixin.tingyu.chrome

import android.os.SystemClock
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.MotionDurationScale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlin.math.sin

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/PlaylistAffordances.kt
internal val PlaylistAccent get() = InterfacePalette().mediaAccent
internal fun playlistNumberWidth(digits: Int, fontScale: Float): Float =
    (maxOf(2, digits) * 6.8f * fontScale.coerceAtLeast(1f) + 4f).coerceAtLeast(19f)
internal fun playlistBarHeight(phase: Float, bar: Int): Float =
    .24f + .64f * ((sin((phase * 6.283185f + bar * 2.1f).toDouble()) + 1) / 2).toFloat()
@Composable internal fun PlaylistLocateButton(label: String, onClick: () -> Unit) {
    val accent=LocalInterfacePalette.current.mediaAccent
    ChromeButton(label, size=40.dp, onClick=onClick, modifier=Modifier
        .shadow(3.dp,CircleShape).background(LocalInterfacePalette.current.floating,CircleShape)
        .border(.8.dp,accent.copy(alpha=.34f),CircleShape)) {
        Canvas(Modifier.size(21.dp)) {
            val stroke=Stroke(1.65.dp.toPx(),cap=StrokeCap.Round)
            val inset=size.width*.17f
            repeat(4) { drawArc(accent,it*90f+16f,58f,false,
                Offset(inset,inset),Size(size.width-inset*2,size.height-inset*2),style=stroke) }
            drawCircle(accent,size.width*.14f,center)
        }
    }
}

/** Only this visible draw node ticks. No audio analysis, bridge traffic or list recomposition. */
@Composable internal fun PlaylistPlaybackIndicator(playing: Boolean) {
    val accent=LocalInterfacePalette.current.mediaAccent
    val phase=remember { mutableFloatStateOf(0f) }
    val rendering=LocalChromeRendering.current
    LaunchedEffect(playing,rendering) {
        phase.floatValue=0f
        if(!rendering || !playing || (coroutineContext[MotionDurationScale]?.scaleFactor ?: 1f)==0f)return@LaunchedEffect
        val start=SystemClock.elapsedRealtime()
        while(isActive){ delay(50);phase.floatValue=(SystemClock.elapsedRealtime()-start)%820/820f }
    }
    // 与 WebView .ml-song-playing 逐参数对齐：4 柱、18×20、820ms 循环、柱间负延迟
    // （0 / -310 / -570 / -180ms）、垂直居中缩放（CSS transform-origin 默认 50%）。暂停时停在 scaleY .4。
    Canvas(Modifier.width(18.dp).height(20.dp)) {
        val delays=floatArrayOf(0f,-310f/820f,-570f/820f,-180f/820f)
        if(playing) repeat(4) { bar ->
            var p=phase.floatValue-delays[bar]
            p-=kotlin.math.floor(p)
            val height=playlistBarHeight(p,bar)
            val x=size.width*(bar+.5f)/4
            val top=size.height*(1f-height)/2f
            drawLine(accent,Offset(x,top),Offset(x,size.height-top),2.dp.toPx(),StrokeCap.Round)
        } else repeat(4) { bar ->
            val x=size.width*(bar+.5f)/4
            val top=size.height*(1f-.4f)/2f
            drawLine(accent,Offset(x,top),Offset(x,size.height-top),2.dp.toPx(),StrokeCap.Round)
        }
    }
}
