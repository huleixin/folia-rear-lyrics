package io.github.huleixin.tingyu.chrome

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.ui.graphics.Brush
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
    val window=LocalPadWindow.current
    val hero=page.sections.firstOrNull{it.layout=="hero"||it.layout=="discoveryHero"}
    val recent=page.sections.firstOrNull{it.id=="recent"}
    val hasDualHero=window.homeDualHero&&hero!=null&&hero.items.isNotEmpty()&&recent!=null&&recent.items.isNotEmpty()
    val hostBottom=with(LocalDensity.current){LocalNativePageBottomPx.current.toDp()}
    val bottom=if(hostBottom>0.dp)hostBottom else (page.safeBottom+88f).dp
    val startInset=if(window.expanded)112.dp else window.pageHorizontalMargin.dp
    val endInset=window.pageHorizontalMargin.dp
    val gap=window.cardSpacing.dp
    Box(modifier.padding(start=startInset,end=endInset,top=(page.safeTop+if(window.shortWindow)10 else 16).dp,bottom=bottom),contentAlignment=Alignment.TopCenter){
        Column(Modifier.fillMaxSize().widthIn(max=window.homeMaxWidth.dp)){
            PageHeading(page,large=!window.shortWindow,action=action)
            Spacer(Modifier.height(if(window.shortWindow)8.dp else 12.dp))
            BoxWithConstraints(Modifier.weight(1f)){
                // Width chooses the count; height caps square artwork so both sections clear the mini player.
                val targetCover=(maxHeight*.25f).coerceIn(104.dp,164.dp)
                val columns=ceil((maxWidth.value+gap.value)/(targetCover.value+gap.value)).toInt().coerceIn(4,8)
                val playlistCover=(maxWidth-gap*(columns-1))/columns
                // Four extra dp absorb independent row rounding without introducing a tiny scroll range.
                val bandBudget=(maxHeight-playlistCover-44.dp-40.dp-16.dp-16.dp-40.dp).coerceAtLeast(if(window.shortWindow)184.dp else 218.dp)
                val paneGap=if(maxWidth>=1000.dp)26.dp else 20.dp
                val paneWidth=(maxWidth-paneGap)/2
                val coverLimit=((bandBudget-14.dp)/2-44.dp).coerceIn(72.dp,152.dp)
                val recentColumns=((paneWidth.value+14f)/(coverLimit.value+14f)).toInt().coerceIn(2,6)
                val recentCover=minOf((paneWidth-14.dp*(recentColumns-1))/recentColumns,coverLimit)
                val recentHeight=(recentCover+44.dp)*2+14.dp
                LazyColumn(Modifier.fillMaxSize().clipToBounds().testTag("pad-home-list"),
                    contentPadding=PaddingValues(bottom=12.dp),verticalArrangement=Arrangement.spacedBy(if(window.shortWindow)12.dp else 16.dp)){
                    if(hasDualHero&&hero!=null&&recent!=null)item(key="recommendation-band"){
                        Column{
                            // The heading sits above the common artwork baseline, never inside the right band.
                            Row(Modifier.fillMaxWidth().padding(bottom=10.dp),horizontalArrangement=Arrangement.spacedBy(paneGap)){
                                if(hero.title.isNotBlank())PageSectionHeading(hero,Modifier.weight(1f),action,titleSize=20)
                                else Spacer(Modifier.weight(1f))
                                PageSectionHeading(recent,Modifier.weight(1f),action,titleSize=20)
                            }
                            Row(horizontalArrangement=Arrangement.spacedBy(paneGap)){
                                Box(Modifier.weight(1f)){
                                    if(hero.layout=="discoveryHero")DiscoveryHero(hero,action=action)
                                    else PadHeroStack(hero,action,(recentHeight-40.dp).coerceAtLeast(180.dp))
                                }
                                Column(Modifier.weight(1f)){
                                    recent.items.take(recentColumns*2).chunked(recentColumns).forEachIndexed{index,row->
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
                    page.sections.filter{if(hasDualHero)it!==hero&&it!==recent else true}.forEach{section->
                        // Overview playlists occupy one row; their existing “all” action opens the library.
                        if(section.id=="playlists"&&section.items.isNotEmpty())item(key=section.id){
                            Column{
                                PageSectionHeading(section,Modifier.padding(bottom=10.dp),action,titleSize=20)
                                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(gap)){
                                    section.items.take(columns).forEach{key(it.id){PadArtworkCard(it,Modifier.weight(1f),action,ratio=1f,completeCover=true)}}
                                    repeat((columns-section.items.size).coerceAtLeast(0)){Spacer(Modifier.weight(1f))}
                                }
                            }
                        }else if(section.layout=="hero"&&section.items.isNotEmpty()){
                            item(key=section.id){
                                val h=(maxWidth*.38f).coerceIn(190.dp,if(window.shortWindow)220.dp else 280.dp)
                                Box(Modifier.fillMaxWidth().widthIn(max=680.dp)){PadHeroStack(section,action,h)}
                            }
                        }else{
                            if(section.title.isNotBlank())item(key="${section.id}:heading"){PageSectionHeading(section,action=action,titleSize=20)}
                            if(section.layout=="chips")item(key=section.id){NativeSourceTabs(section,Modifier.padding(bottom=8.dp),action=action)}
                            else if(section.layout=="discoveryHero"&&section.items.isNotEmpty())item(key=section.id){DiscoveryHero(section,action=action)}
                            else if(section.layout=="radarCards"&&section.items.isNotEmpty())item(key=section.id){DiscoveryRadars(section,action=action)}
                            else if(section.layout=="textActions"&&section.items.isNotEmpty())item(key=section.id){DiscoveryTextActions(section,action=action)}
                            else if(section.layout=="quickLinks"&&section.items.isNotEmpty())item(key=section.id){
                                val perRow=if(maxWidth>=720.dp)section.items.size.coerceAtMost(6) else section.items.size.coerceAtMost(3)
                                Column(verticalArrangement=Arrangement.spacedBy(10.dp)){
                                    section.items.chunked(perRow.coerceAtLeast(1)).forEach{row->
                                        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(12.dp)){
                                            row.forEach{item->Box(Modifier.weight(1f).height(76.dp).clip(RoundedCornerShape(12.dp))
                                                .background(LocalInterfacePalette.current.homeQuickCard).border(1.dp,LocalInterfacePalette.current.homeQuickBorder,RoundedCornerShape(12.dp))
                                                .clickable(enabled=!item.disabled&&item.action.isNotBlank()){action(item.action,"",0.0)},contentAlignment=Alignment.Center){
                                                Column(horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(4.dp)){
                                                    PageIcon(if(item.image.isNotBlank())item.image else "music2",PageInk,Modifier.size(18.dp))
                                                    Text(item.title,color=PageInk,fontSize=12.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
                                                }
                                            }}
                                            repeat((perRow-row.size).coerceAtLeast(0)){Spacer(Modifier.weight(1f))}
                                        }
                                    }
                                }
                            }
                            else if(section.layout=="discoverCards"&&section.items.isNotEmpty())item(key=section.id){
                                val perRow=if(maxWidth>=720.dp)section.items.size.coerceAtMost(3) else section.items.size.coerceAtMost(2)
                                Column(verticalArrangement=Arrangement.spacedBy(12.dp)){
                                    section.items.chunked(perRow.coerceAtLeast(1)).forEach{row->
                                        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(14.dp)){
                                            row.forEach{item->Box(Modifier.weight(1f).heightIn(min=96.dp).clip(RoundedCornerShape(14.dp))
                                                .background(Brush.linearGradient(0f to Color(0xFF16303C),1f to Color(0xFF0F212B)))
                                                .clickable(enabled=!item.disabled&&item.action.isNotBlank()){action(item.action,"",0.0)}){
                                                Column(Modifier.fillMaxWidth().padding(14.dp)){
                                                    Text(item.title,color=Color.White,fontSize=15.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
                                                    Text(item.subtitle,color=Color(0xB8FFFFFF),fontSize=12.sp,maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=4.dp))
                                                }
                                            }}
                                            repeat((perRow-row.size).coerceAtLeast(0)){Spacer(Modifier.weight(1f))}
                                        }
                                    }
                                }
                            }
                            else if(section.layout=="rows"&&section.items.isNotEmpty()){
                                if(maxWidth>=820.dp&&section.items.size>=4){
                                    items(section.items.chunked(2),key={"${section.id}:2col:${it.first().id}"}){pair->
                                        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(gap)){
                                            pair.forEach{rowItem->Box(Modifier.weight(1f)){NativePageRow(rowItem,action={action(it,"",0.0)})}}
                                            if(pair.size==1)Spacer(Modifier.weight(1f))
                                        }
                                    }
                                }else{
                                    items(section.items,key={"${section.id}:${it.id}"}){item->
                                        NativePageRow(item,action={action(it,"",0.0)})
                                    }
                                }
                            }else if(section.items.isNotEmpty())items(section.items.chunked(columns),key={"${section.id}:${it.first().id}"}){row->
                                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(gap)){
                                    row.forEach{PadArtworkCard(it,Modifier.weight(1f),action,ratio=1f,completeCover=true)}
                                    repeat(columns-row.size){Spacer(Modifier.weight(1f))}
                                }
                            }else if(section.text.isNotBlank())item(key="${section.id}:message"){
                                Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(LocalInterfacePalette.current.card).padding(horizontal=16.dp,vertical=14.dp)){
                                    Text(section.text,color=PageMuted,fontSize=13.sp)
                                }
                            }
                        }
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
