package io.github.huleixin.tingyu.chrome

import android.os.SystemClock
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlin.math.max

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/ChromePlayback.kt
// The ticking state is read by draw nodes only; it never re-renders the WebView or whole control tree.
internal val LocalChromeRendering = staticCompositionLocalOf { true }

@Composable fun rememberChromeNow(timeline: ChromeTimeline?): State<Long> {
    val now=remember { mutableLongStateOf(SystemClock.elapsedRealtime()) }
    val rendering=LocalChromeRendering.current
    LaunchedEffect(timeline,rendering) {
        now.longValue=SystemClock.elapsedRealtime()
        if(rendering&&timeline?.playing==true) while(SystemClock.elapsedRealtime()-timeline.receivedAt<2600) { delay(33);now.longValue=SystemClock.elapsedRealtime() }
    }
    return now
}
fun chromeTime(time: Double): String { val n=time.toInt().coerceAtLeast(0);return "%02d:%02d".format(n/60,n%60) }
@Composable fun ChromeProgressRing(timeline: ChromeTimeline?, modifier: Modifier, color: Color) {
    val now=rememberChromeNow(timeline)
    Canvas(modifier) {
        val inset=2.dp.toPx();val bounds=Size(size.width-inset*2,size.height-inset*2)
        // 轨道圈不能太淡：刚切歌的几秒里 position≈0、时长未到（loadedmetadata 才有），
        // 进度弧是 0°，整圈就只剩这条轨道 —— 0.22 在亮色玻璃上几乎隐形，
        // 用户看到的就是"第二首开始进度圈没有了"。0.34 与 WebView 版肉眼一致且亮暗主题都可见。
        drawArc(color.copy(alpha=.34f),-90f,360f,false,Offset(inset,inset),bounds,style=Stroke(2.dp.toPx(),cap=StrokeCap.Round))
        val position=timeline?.at(now.value)?:0.0;val duration=timeline?.duration?:0.0
        if(duration>0)drawArc(color,-90f,(position/duration*360).toFloat().coerceIn(0f,360f),false,Offset(inset,inset),bounds,style=Stroke(2.dp.toPx(),cap=StrokeCap.Round))
    }
}
