package io.github.huleixin.tingyu.chrome

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import kotlinx.coroutines.delay
import kotlin.math.abs

// Pad recommendation layout consumes the existing sections and action identities.
@Composable internal fun PadHomePage(page:NativePage,modifier:Modifier,action:PageAction){
    val hero=page.sections.firstOrNull{it.layout=="hero"}
    val recent=page.sections.firstOrNull{it.id=="recent"}
    LazyColumn(modifier.padding(start=112.dp,end=26.dp),contentPadding=PaddingValues(top=(page.safeTop+24).dp,bottom=110.dp),verticalArrangement=Arrangement.spacedBy(20.dp)){
        item{PageHeading(page,Modifier.fillMaxWidth(),large=true,action=action)}
        item{
            Row(horizontalArrangement=Arrangement.spacedBy(26.dp)){
                if(hero!=null)Box(Modifier.weight(1.65f)){PadHeroStack(hero,action)}
                if(recent!=null)Column(Modifier.weight(1f)){
                    PageSectionHeading(recent,Modifier.padding(bottom=12.dp),action)
                    recent.items.take(4).chunked(2).forEach{row->
                        Row(horizontalArrangement=Arrangement.spacedBy(14.dp)){
                            row.forEach{PadArtworkCard(it,Modifier.weight(1f),action,1.6f)}
                            if(row.size==1)Spacer(Modifier.weight(1f))
                        }
                        Spacer(Modifier.height(12.dp))
                    }
                }
            }
        }
        page.sections.filter{it!==hero&&it!==recent}.forEach{section->
            item(key=section.id){
                Column{
                    PageSectionHeading(section,Modifier.padding(bottom=12.dp),action)
                    if(section.items.isNotEmpty())section.items.chunked(LocalPadWindow.current.columns).forEach{row->
                        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(18.dp)){
                            row.forEach{PadArtworkCard(it,Modifier.weight(1f),action)}
                            repeat(LocalPadWindow.current.columns-row.size){Spacer(Modifier.weight(1f))}
                        }
                        Spacer(Modifier.height(16.dp))
                    }else if(section.text.isNotBlank())Text(section.text,color=PageMuted)
                }
            }
        }
    }
}

@Composable internal fun PadArtworkCard(item:NativePageItem,modifier:Modifier,action:PageAction,ratio:Float=1.3f){
    Column(modifier){
        Box(Modifier.fillMaxWidth().aspectRatio(ratio).clip(RoundedCornerShape(14.dp)).chromeClickable(enabled=!item.disabled,corner=14.dp){action(item.action,"",0.0)}){
            PageArtwork(item.image,Modifier.fillMaxSize(),14.dp)
        }
        Row(Modifier.fillMaxWidth().padding(top=5.dp),verticalAlignment=Alignment.CenterVertically){
            Column(Modifier.weight(1f).chromeClickable(enabled=!item.disabled,corner=8.dp){action(item.action,"",0.0)}){
                Text(item.title,color=PageInk,fontSize=14.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
                Text(item.subtitle,color=PageMuted,fontSize=12.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
            }
            if(item.secondary.isNotBlank())ChromeButton("更多",size=36.dp,onClick={action(item.secondary,"",0.0)}){PageIcon("ellipsis-vertical",PageMuted,Modifier.size(17.dp))}
        }
    }
}

@Composable internal fun PadHeroStack(section:NativePageSection,action:PageAction){
    val items=section.items
    if(items.isEmpty())return
    var index by remember(section.id){mutableIntStateOf(0)}
    var manualEpoch by remember{mutableIntStateOf(0)}
    var dragging by remember{mutableStateOf(false)}
    var drag by remember{mutableFloatStateOf(0f)}
    var direction by remember{mutableIntStateOf(1)}
    val lifecycle=LocalLifecycleOwner.current.lifecycle
    val lifecycleState by lifecycle.currentStateFlow.collectAsStateWithLifecycle()
    val rendering=LocalChromeRendering.current&&lifecycleState.isAtLeast(Lifecycle.State.RESUMED)
    LaunchedEffect(items.size,manualEpoch,dragging,rendering){
        if(items.size<2||dragging||!rendering)return@LaunchedEffect
        if(manualEpoch>0)delay(6000)
        while(true){delay(5500);direction=1;index=(index+1)%items.size}
    }
    Column{
        BoxWithConstraints(Modifier.fillMaxWidth().padding(bottom=28.dp)){
            val h=(maxWidth*.54f).coerceIn(245.dp,360.dp)
            for(depth in 2 downTo 1){
                val item=items[(index+depth)%items.size]
                AsyncImage(pageImage(item.image),null,Modifier.padding(horizontal=(depth*8).dp).offset(y=(depth*12).dp).fillMaxWidth().height(h).clip(RoundedCornerShape(24.dp)),contentScale=ContentScale.Crop)
            }
            AnimatedContent(index%items.size,transitionSpec={
                (slideInVertically{32}+fadeIn()) togetherWith (slideOutHorizontally{-it*direction}+fadeOut())
            },label="pad-hero",modifier=Modifier.fillMaxWidth().height(h).pointerInput(items.size){
                detectHorizontalDragGestures(onDragStart={drag=0f;dragging=true},onDragCancel={dragging=false;manualEpoch++},onDragEnd={
                    if(abs(drag)>48.dp.toPx()){direction=if(drag<0)1 else -1;index=(index+direction+items.size)%items.size}
                    dragging=false;manualEpoch++
                }){change,amount->change.consume();drag+=amount}
            }){position->
                val item=items[position]
                Box(Modifier.fillMaxSize().clip(RoundedCornerShape(24.dp)).background(Color(0xFF30286D)).chromeClickable(enabled=!item.disabled,corner=24.dp){action(item.action,"",0.0)}){
                    AsyncImage(pageImage(item.image),null,Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
                    Column(Modifier.fillMaxSize().padding(26.dp),verticalArrangement=Arrangement.SpaceBetween){
                        Text("TINGYU",color=Color.White,letterSpacing=4.sp,fontSize=13.sp)
                        Column{Text(item.title.replace("\n",""),color=Color.White,fontSize=34.sp,fontWeight=FontWeight.Bold);Text(item.subtitle.replace("\n",""),color=Color.White,fontSize=16.sp)}
                        Row(verticalAlignment=Alignment.CenterVertically){Text(item.secondaryLabel.ifBlank{"查看歌曲"},color=Color.White,fontSize=16.sp);PageIcon("chevron-right",Color.White,Modifier.padding(start=8.dp).size(18.dp))}
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.Center){items.forEachIndexed{i,_->
            Box(Modifier.padding(4.dp).size(18.dp,4.dp).clip(RoundedCornerShape(4.dp)).background(if(index%items.size==i)PageAccent else PageMuted.copy(alpha=.3f)).chromeClickable{index=i;manualEpoch++})
        }}
    }
}
