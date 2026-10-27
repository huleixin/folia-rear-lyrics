package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kyant.backdrop.Backdrop

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/ChromeStagePlayer.kt
@Composable fun ChromeStagePlayer(s: ChromeSurface, timeline: ChromeTimeline?, backdrop: Backdrop, modifier: Modifier, action: (String,Double)->Unit) {
    val ink=chromeColor(s.ink);val accent=chromeColor(s.accent)
    Column(modifier.chromeGlass(backdrop,s.light,30.dp).padding(horizontal=18.dp,vertical=10.dp),verticalArrangement=Arrangement.SpaceBetween) {
        Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.SpaceBetween) {
            Column(horizontalAlignment=Alignment.CenterHorizontally) {
                ChromeButton(s.label("loop","播放模式"),enabled=!s.disabled,size=48.dp,reduced=s.reducedMotion,onClick={action("loop",0.0)}) {ChromeGlyph(if(s.loop=="shuffle")"shuffle" else if(s.loop=="one")"one" else "repeat",ink,Modifier.size(21.dp))}
                Text(s.label("loopValue","顺序播放"),color=ink.copy(alpha=.8f),fontSize=10.sp)
            }
            Row(verticalAlignment=Alignment.CenterVertically) {
                ChromeButton(s.label("previous","上一首"),enabled=!s.disabled&&s.canPrevious,size=48.dp,reduced=s.reducedMotion,onClick={action("previous",0.0)}) {ChromeGlyph("previous",ink,Modifier.size(25.dp))}
                ChromeButton(s.label(if(s.playing)"pause" else "play",if(s.playing)"暂停" else "播放"),enabled=!s.disabled,size=56.dp,reduced=s.reducedMotion,onClick={action("toggle",0.0)}) {
                    Canvas(Modifier.fillMaxSize()){drawCircle(ink.copy(alpha=.13f))};ChromeGlyph(if(s.playing)"pause" else "play",ink,Modifier.size(28.dp))
                }
                ChromeButton(s.label("next","下一首"),enabled=!s.disabled&&s.canNext,size=48.dp,reduced=s.reducedMotion,onClick={action("next",0.0)}) {ChromeGlyph("next",ink,Modifier.size(25.dp))}
            }
            Column(horizontalAlignment=Alignment.CenterHorizontally) {
                ChromeButton(s.label("queue","队列"),size=48.dp,reduced=s.reducedMotion,onClick={action("queue",0.0)}) {ChromeGlyph("queue",ink,Modifier.size(22.dp))}
                Text(s.label("queue","队列"),color=ink.copy(alpha=.8f),fontSize=10.sp)
            }
        }
        ChromeSeek(s,timeline,accent,ink,action)
    }
}
@Composable private fun ChromeSeek(s: ChromeSurface, timeline: ChromeTimeline?, accent: Color, ink: Color, action: (String,Double)->Unit) {
    val now=rememberChromeNow(timeline);var dragged by remember(s.trackKey){mutableStateOf<Double?>(null)}
    val current by remember(timeline) { derivedStateOf { chromeTime(timeline?.at(now.value)?:0.0) } }
    val enabled=!s.disabled&&s.duration>0
    Column {
        Canvas(Modifier.fillMaxWidth().height(28.dp).semantics {
            contentDescription=s.label("seek","播放进度")
            progressBarRangeInfo=ProgressBarRangeInfo((timeline?.position?:0.0).toFloat(),0f..s.duration.toFloat().coerceAtLeast(1f))
            setProgress {if(enabled){action("seek",it.toDouble().coerceIn(0.0,s.duration));true}else false}
        }.pointerInput(enabled,s.duration,s.trackKey) {
            if(enabled)detectDragGestures(onDragStart={dragged=(it.x/size.width*s.duration).coerceIn(0.0,s.duration);action("interactionStart",0.0)},onDragEnd={dragged?.let{action("seek",it)};dragged=null;action("interactionEnd",0.0)},onDragCancel={dragged=null;action("interactionEnd",0.0)}) {change,_->change.consume();dragged=(change.position.x/size.width*s.duration).coerceIn(0.0,s.duration)}
        }.pointerInput(enabled,s.duration) {if(enabled)detectTapGestures{action("seek",(it.x/size.width*s.duration).coerceIn(0.0,s.duration))}}) {
            val position=dragged?:timeline?.at(now.value)?:0.0
            val fraction=if(s.duration>0)(position/s.duration).toFloat().coerceIn(0f,1f)else 0f
            val y=size.height/2
            drawLine(ink.copy(alpha=.22f),Offset(0f,y),Offset(size.width,y),3.dp.toPx(),StrokeCap.Round)
            drawLine(accent,Offset(0f,y),Offset(size.width*fraction,y),3.dp.toPx(),StrokeCap.Round)
            drawCircle(ink,5.dp.toPx(),Offset(size.width*fraction,y))
        }
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) {
            Text(dragged?.let{chromeTime(it)}?:current,color=ink.copy(alpha=.7f),fontSize=11.sp)
            Text(chromeTime(s.duration),color=ink.copy(alpha=.7f),fontSize=11.sp)
        }
    }
}
