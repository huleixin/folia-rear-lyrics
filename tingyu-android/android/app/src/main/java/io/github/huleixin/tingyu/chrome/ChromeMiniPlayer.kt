package io.github.huleixin.tingyu.chrome

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
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.geometry.Rect
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
@Composable internal fun ChromeMiniPlayer(s: ChromeSurface, timeline: ChromeTimeline?, backdrop: Backdrop, modifier: Modifier,
    timer:MiniSleepUi?=null,onSleepAnchor:(Rect)->Unit={},action: (String,Double)->Unit) {
    val ink=chromeColor(s.ink);val accent=chromeColor(s.accent)
    val cover=pageImage(s.cover)
    // 与底栏同一份材质规范（vibrancy → blur → lens + 光学高光/内阴影），只在表面不透明度上
    // 按内容密度加厚一档（MiniFill）：歌名/歌手/播放键要压住模糊背景，但折射与高光逻辑一致。
    BoxWithConstraints(modifier.chromeGlass(backdrop,s.light,28.dp,ChromeGlassPresets.active(),ChromeGlassPresets.MiniFill)) {
    val compact=maxWidth<340.dp
    val spacing=miniPlayerSpacing(maxWidth.value)
    Row(Modifier.fillMaxSize().padding(horizontal=6.dp,vertical=3.dp),verticalAlignment=Alignment.CenterVertically) {
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
            if(abs(offset.value)>8f)Text(s.label(if(offset.value<0)"next" else "previous",if(offset.value<0)"下一首" else "上一首"),color=if(s.light)ink else ink.copy(alpha=.7f),fontSize=12.sp,maxLines=1,
                modifier=Modifier.align(Alignment.Center).graphicsLayer{translationX=offset.value+(if(offset.value<0)width else -width)})
            Row(Modifier.fillMaxSize().graphicsLayer{translationX=offset.value}.chromeClickable(role=Role.Button,corner=18.dp){action("openStage",0.0)},verticalAlignment=Alignment.CenterVertically) {
                // 左内边距原本加在裁剪容器（18.dp 圆角）之外，封面在这一层里从 x=0 起画，
                // 左上角正好落进圆角被裁掉 —— 看起来就是「封面偏左、缺一角」。
                // 只给封面本体让出 10.dp，不动整条的高度/宽度、玻璃效果、按钮与圆角；
                // padding 放在 size 之前，34.dp 的封面尺寸与 10.dp 圆角保持不变。
                Box(Modifier.padding(start=10.dp).size(34.dp).clip(RoundedCornerShape(10.dp)).background(accent.copy(alpha=.2f)),contentAlignment=Alignment.Center) {
                    ChromeGlyph("music",if(s.light)ink else ink.copy(alpha=.7f))
                    if(s.cover.isNotBlank())AsyncImage(model=cover,contentDescription=null,modifier=Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
                }
                Spacer(Modifier.width(spacing.gap.dp))
                Column(Modifier.weight(1f)) {
                    Text(s.title,color=ink,fontSize=13.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
                    Text(s.artist,color=if(s.light)LightInterfaceColors.Muted else ink.copy(alpha=.65f),fontSize=10.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
                }
            }
        }
        ChromeButton(s.label("quality","音质"),size=spacing.quality.dp,reduced=s.reducedMotion,onClick={action("quality",0.0)}) {
            Text(s.label("qualityValue","高品质"),color=if(s.light)LightInterfaceColors.Muted else ink.copy(alpha=.75f),fontSize=if(compact)8.sp else 9.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
        }
        if(timer!=null)MiniSleepButton(timer,s.light,spacing.moon,s.reducedMotion,action={action("sleep",0.0)},
            modifier=Modifier.onGloballyPositioned{onSleepAnchor(it.boundsInRoot())})
        ChromeButton(s.label(if(s.playing)"pause" else "play",if(s.playing)"暂停" else "播放"),enabled=!s.disabled,size=42.dp,reduced=s.reducedMotion,onClick={action("toggle",0.0)}) {
            ChromeProgressRing(timeline,Modifier.size(34.dp),ink);ChromeGlyph(if(s.playing)"pause" else "play",ink,Modifier.size(19.dp))
        }
        ChromeButton(s.label("queue","播放队列"),size=spacing.queue.dp,reduced=s.reducedMotion,onClick={action("queue",0.0)}) {ChromeGlyph("queue",ink,Modifier.size(24.dp))}
    }
    }
}
