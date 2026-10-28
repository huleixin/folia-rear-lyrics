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
internal val PlaylistAccent = Color(0xFF7EE0C2)
internal fun playlistNumberWidth(digits: Int, fontScale: Float): Float =
    (maxOf(2, digits) * 6.8f * fontScale.coerceAtLeast(1f) + 4f).coerceAtLeast(19f)
internal fun playlistBarHeight(phase: Float, bar: Int): Float =
    .24f + .64f * ((sin((phase * 6.283185f + bar * 2.1f).toDouble()) + 1) / 2).toFloat()

@Composable internal fun PlaylistLocateButton(label: String, onClick: () -> Unit) {
    ChromeButton(label, size=40.dp, onClick=onClick, modifier=Modifier
        .shadow(3.dp,CircleShape).background(Color(0xF0183029),CircleShape)
        .border(.8.dp,PlaylistAccent.copy(alpha=.34f),CircleShape)) {
        Canvas(Modifier.size(21.dp)) {
            val stroke=Stroke(1.65.dp.toPx(),cap=StrokeCap.Round)
            val inset=size.width*.17f
            repeat(4) { drawArc(PlaylistAccent,it*90f+16f,58f,false,
                Offset(inset,inset),Size(size.width-inset*2,size.height-inset*2),style=stroke) }
            drawCircle(PlaylistAccent,size.width*.14f,center)
        }
    }
}

/** Only this visible draw node ticks. No audio analysis, bridge traffic or list recomposition. */
@Composable internal fun PlaylistPlaybackIndicator(playing: Boolean) {
    val phase=remember { mutableFloatStateOf(0f) }
    LaunchedEffect(playing) {
        phase.floatValue=0f
        if(!playing || (coroutineContext[MotionDurationScale]?.scaleFactor ?: 1f)==0f)return@LaunchedEffect
        val start=SystemClock.elapsedRealtime()
        while(isActive){ delay(50);phase.floatValue=(SystemClock.elapsedRealtime()-start)%1500/1500f }
    }
    Canvas(Modifier.width(12.dp).height(15.dp)) {
        if(playing) repeat(3) { bar ->
            val height=playlistBarHeight(phase.floatValue,bar)
            val x=size.width*(bar+.5f)/3
            drawLine(PlaylistAccent,Offset(x,size.height),Offset(x,size.height*(1-height)),2.dp.toPx(),StrokeCap.Round)
        } else repeat(2) { bar ->
            val x=size.width*(if(bar==0).3f else .7f)
            drawLine(PlaylistAccent,Offset(x,size.height*.2f),Offset(x,size.height*.8f),2.dp.toPx(),StrokeCap.Round)
        }
    }
}
