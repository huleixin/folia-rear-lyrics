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
import androidx.compose.foundation.lazy.items
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.Dp
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
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import kotlinx.coroutines.delay
import kotlin.math.abs
import kotlin.math.ceil

// Pad recommendation layout consumes the existing sections and action identities.
@Composable internal fun PadHomePage(page:NativePage,modifier:Modifier,action:PageAction){
    val hero=page.sections.firstOrNull{it.layout=="hero"}
    val recent=page.sections.firstOrNull{it.id=="recent"}
    val hostBottom=with(LocalDensity.current){LocalNativePageBottomPx.current.toDp()}
    val bottom=if(hostBottom>0.dp)hostBottom else (page.safeBottom+88f).dp
    Column(modifier.padding(start=112.dp,end=26.dp,top=(page.safeTop+16).dp,bottom=bottom)){
        PageHeading(page,large=true,action=action)
        Spacer(Modifier.height(12.dp))
        BoxWithConstraints(Modifier.weight(1f)){
            // Width chooses the count; height caps square artwork so both sections clear the mini player.
            val targetCover=(maxHeight*.25f).coerceIn(104.dp,164.dp)
            val columns=ceil((maxWidth.value+18f)/(targetCover.value+18f)).toInt().coerceAtLeast(4)
            val playlistCover=(maxWidth-18.dp*(columns-1))/columns
            // Four extra dp absorb independent row rounding without introducing a tiny scroll range.
            val bandBudget=(maxHeight-playlistCover-44.dp-40.dp-16.dp-16.dp-40.dp).coerceAtLeast(218.dp)
            val paneWidth=(maxWidth-26.dp)/2
            val coverLimit=((bandBudget-14.dp)/2-44.dp).coerceIn(72.dp,152.dp)
            val recentColumns=((paneWidth.value+14f)/(coverLimit.value+14f)).toInt().coerceIn(2,6)
            val recentCover=minOf((paneWidth-14.dp*(recentColumns-1))/recentColumns,coverLimit)
            val recentHeight=(recentCover+44.dp)*2+14.dp
            LazyColumn(Modifier.fillMaxSize().clipToBounds().testTag("pad-home-list"),
                contentPadding=PaddingValues(bottom=12.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){
                if(hero!=null)item(key="recommendation-band"){
                    Column{
                        // The heading sits above the common artwork baseline, never inside the right band.
                        Row(Modifier.fillMaxWidth().padding(bottom=10.dp),horizontalArrangement=Arrangement.spacedBy(26.dp)){
                            Spacer(Modifier.weight(1f))
                            if(recent!=null)PageSectionHeading(recent,Modifier.weight(1f),action,titleSize=20)
                            else Spacer(Modifier.weight(1f).height(30.dp))
                        }
                        Row(horizontalArrangement=Arrangement.spacedBy(26.dp)){
                            Box(Modifier.weight(1f)){PadHeroStack(hero,action,recentHeight-40.dp)}
                            Column(Modifier.weight(1f)){
                                recent?.items?.take(recentColumns*2)?.chunked(recentColumns)?.forEachIndexed{index,row->
                                    if(index>0)Spacer(Modifier.height(14.dp))
                                    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween){
                                        row.forEach{key(it.id){PadArtworkCard(it,Modifier.width(recentCover),action,ratio=1f,completeCover=true)}}
                                        repeat(recentColumns-row.size){Spacer(Modifier.width(recentCover))}
                                    }
                                }
                            }
                        }
                    }
                }
                page.sections.filter{it!==hero&&(hero==null||it!==recent)}.forEach{section->
                    // Overview playlists occupy one row; their existing “all” action opens the library.
                    if(section.id=="playlists")item(key=section.id){
                        Column{
                            PageSectionHeading(section,Modifier.padding(bottom=10.dp),action,titleSize=20)
                            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(18.dp)){
                                section.items.take(columns).forEach{key(it.id){PadArtworkCard(it,Modifier.weight(1f),action,ratio=1f,completeCover=true)}}
                                repeat((columns-section.items.size).coerceAtLeast(0)){Spacer(Modifier.weight(1f))}
                            }
                        }
                    }else{
                        if(section.title.isNotBlank())item(key="${section.id}:heading"){PageSectionHeading(section,action=action,titleSize=20)}
                        if(section.layout=="rows")items(section.items,key={"${section.id}:${it.id}"}){item->
                            NativePageRow(item,action={action(it,"",0.0)})
                        }else if(section.items.isNotEmpty())items(section.items.chunked(columns),key={"${section.id}:${it.first().id}"}){row->
                            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(18.dp)){
                                row.forEach{PadArtworkCard(it,Modifier.weight(1f),action,ratio=1f,completeCover=true)}
                                repeat(columns-row.size){Spacer(Modifier.weight(1f))}
                            }
                        }else if(section.text.isNotBlank())item(key="${section.id}:message"){Text(section.text,color=PageMuted)}
                    }
                }
            }
        }
    }
}

@Composable internal fun PadArtworkCard(item:NativePageItem,modifier:Modifier,action:PageAction,ratio:Float=1.5f,imageHeight:Dp?=null,completeCover:Boolean=false){
    Column(modifier.testTag("pad-card:${item.id}")){
        Box(Modifier.fillMaxWidth().then(if(imageHeight!=null)Modifier.height(imageHeight)else Modifier.aspectRatio(ratio)).testTag("pad-cover:${item.id}").clip(RoundedCornerShape(14.dp)).chromeClickable(enabled=!item.disabled,corner=14.dp){action(item.action,"",0.0)}){
            PageArtwork(item.image,Modifier.fillMaxSize(),14.dp,contentScale=if(completeCover)ContentScale.Fit else ContentScale.Crop)
        }
        val captionStyle=if(completeCover)TextStyle(platformStyle=PlatformTextStyle(includeFontPadding=false))else TextStyle.Default
        Row(Modifier.fillMaxWidth().then(if(completeCover)Modifier.height(44.dp)else Modifier).padding(top=8.dp),verticalAlignment=Alignment.CenterVertically){
            Column(Modifier.weight(1f).chromeClickable(enabled=!item.disabled,corner=8.dp){action(item.action,"",0.0)}){
                Text(item.title,color=PageInk,fontSize=(if(completeCover)14 else 16).sp,lineHeight=(if(completeCover)20 else 22).sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis,style=captionStyle)
                Text(item.subtitle,color=PageMuted,fontSize=(if(completeCover)12 else 13).sp,lineHeight=(if(completeCover)16 else 18).sp,maxLines=1,overflow=TextOverflow.Ellipsis,style=captionStyle)
            }
            if(item.secondary.isNotBlank())ChromeButton("更多",size=36.dp,onClick={action(item.secondary,"",0.0)}){PageIcon("ellipsis-vertical",PageMuted,Modifier.size(17.dp))}
        }
    }
}

@Composable internal fun PadHeroStack(section:NativePageSection,action:PageAction,cardHeight:Dp?=null){
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
            val h=cardHeight?:(maxWidth*.54f).coerceIn(220.dp,300.dp)
            for(depth in 2 downTo 1){
                val item=items[(index+depth)%items.size]
                AsyncImage(pageImage(item.image),null,Modifier.padding(horizontal=(depth*8).dp).offset(y=(depth*12).dp).fillMaxWidth().height(h).clip(RoundedCornerShape(24.dp)),contentScale=ContentScale.Crop)
            }
            AnimatedContent(index%items.size,transitionSpec={
                (slideInVertically{32}+fadeIn()) togetherWith (slideOutHorizontally{-it*direction}+fadeOut())
            },label="pad-hero",modifier=Modifier.fillMaxWidth().height(h).testTag("pad-hero-artwork").pointerInput(items.size){
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
