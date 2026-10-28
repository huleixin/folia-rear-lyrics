package io.github.huleixin.tingyu.chrome

import android.util.Base64
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.kyant.backdrop.Backdrop
import kotlinx.coroutines.launch
import kotlin.math.abs

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/ChromeMiniPlayer.kt
@Composable fun ChromeMiniPlayer(s: ChromeSurface, timeline: ChromeTimeline?, backdrop: Backdrop, modifier: Modifier, action: (String,Double)->Unit) {
    val ink=chromeColor(s.ink);val accent=chromeColor(s.accent)
    val cover=pageImage(s.cover)
    Row(modifier.chromeGlass(backdrop,s.light,28.dp).padding(horizontal=6.dp,vertical=3.dp),verticalAlignment=Alignment.CenterVertically) {
        val scope=rememberCoroutineScope();val offset=remember{Animatable(0f)}
        var dx by remember{mutableFloatStateOf(0f)};var width by remember{mutableFloatStateOf(1f)}
        val drag=Modifier.pointerInput(s.canNext,s.canPrevious,s.disabled,s.trackKey) {
            detectHorizontalDragGestures(onDragStart={dx=0f;width=size.width.toFloat();action("interactionStart",0.0)},onDragCancel={scope.launch{offset.animateTo(0f)};action("interactionEnd",0.0)},onDragEnd={
                val next=dx<0;val allowed=!s.disabled && if(next)s.canNext else s.canPrevious
                val commit=allowed && abs(dx)>minOf(width*.24f,72.dp.toPx())
                scope.launch {
                    if(commit && !s.reducedMotion)offset.animateTo(if(next)-width else width,spring(stiffness=900f))
                    if(commit)action(if(next)"next" else "previous",0.0)
                    offset.snapTo(if(commit && !s.reducedMotion) if(next)width*.18f else -width*.18f else offset.value)
                    if(s.reducedMotion)offset.snapTo(0f) else offset.animateTo(0f,spring(stiffness=650f))
                    action("interactionEnd",0.0)
                }
            }) { change,amount ->
                change.consume();val desired=dx+amount;val allowed=if(desired<0)s.canNext else s.canPrevious
                dx=desired.coerceIn(-width,width);scope.launch { offset.snapTo(if(allowed)dx else dx*.22f) }
            }
        }
        Box(Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(18.dp)).then(drag)) {
            if(abs(offset.value)>8f)Text(s.label(if(offset.value<0)"next" else "previous",if(offset.value<0)"下一首" else "上一首"),color=ink.copy(alpha=.7f),fontSize=12.sp,maxLines=1,
                modifier=Modifier.align(Alignment.Center).graphicsLayer{translationX=offset.value+(if(offset.value<0)width else -width)})
            Row(Modifier.fillMaxSize().graphicsLayer{translationX=offset.value}.clickable(role=Role.Button){action("openStage",0.0)},verticalAlignment=Alignment.CenterVertically) {
                Box(Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(accent.copy(alpha=.2f)),contentAlignment=Alignment.Center) {
                    ChromeGlyph("music",ink.copy(alpha=.7f))
                    if(s.cover.isNotBlank())AsyncImage(model=cover,contentDescription=null,modifier=Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
                }
                Spacer(Modifier.width(8.dp))
                Column(Modifier.weight(1f)) {
                    Text(s.title,color=ink,fontSize=13.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
                    Text(s.artist,color=ink.copy(alpha=.65f),fontSize=10.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
                }
            }
        }
        ChromeButton(s.label("quality","音质"),size=38.dp,reduced=s.reducedMotion,onClick={action("quality",0.0)}) {
            Text(s.label("qualityValue","高品质"),color=ink.copy(alpha=.75f),fontSize=9.sp,maxLines=1)
        }
        ChromeButton(s.label(if(s.playing)"pause" else "play",if(s.playing)"暂停" else "播放"),enabled=!s.disabled,size=42.dp,reduced=s.reducedMotion,onClick={action("toggle",0.0)}) {
            ChromeProgressRing(timeline,Modifier.size(34.dp),ink);ChromeGlyph(if(s.playing)"pause" else "play",ink,Modifier.size(19.dp))
        }
        ChromeButton(s.label("queue","播放队列"),size=42.dp,reduced=s.reducedMotion,onClick={action("queue",0.0)}) {ChromeGlyph("queue",ink)}
    }
}
