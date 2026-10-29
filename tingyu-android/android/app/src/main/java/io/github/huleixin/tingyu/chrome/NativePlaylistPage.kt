package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalDensity
import coil.compose.AsyncImage

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePlaylistPage.kt
// Same structure and metrics as MobilePlaylistHeader / mobilePlaylistDetail.css.
private val PlaylistJade=Color(0xFF7EE0C2)
@Composable internal fun NativePlaylistPage(page:NativePage,modifier:Modifier,action:PageAction){
    val intro=page.sections.first{it.id=="playlistIntro"};val cover=intro.items.first()
    val controls=page.sections.first{it.id=="controls"};val tracks=page.sections.first{it.id=="tracks"}
    val toolbar=page.sections.firstOrNull{it.id=="toolbar"}?.items.orEmpty()
    fun label(id:String)=toolbar.firstOrNull{it.id==id}?.title?:""
    val cache=rememberNativeRows(page.key,tracks)
    val list=rememberLazyListState()
    LaunchedEffect(tracks.dataKey){list.scrollToItem(0)}
    val headerItems=1+page.sections.count{it.layout=="input"}
    val currentVisible by remember(tracks.activeIndex,headerItems){derivedStateOf{list.layoutInfo.visibleItemsInfo.any{it.index==tracks.activeIndex+headerItems}}}
    LaunchedEffect(tracks.locateRevision){if(tracks.locateRevision>0&&tracks.activeIndex>=0){
        list.animateScrollToItem(tracks.activeIndex+headerItems,-100)
    }}
    BoxWithConstraints(modifier){
        val short=maxHeight<500.dp;val width=maxWidth.value
        NativePlaylistBackdrop(cover.image,maxHeight)
        Column(Modifier.fillMaxSize().padding(top=(page.safeTop+8).dp)){
            Row(Modifier.fillMaxWidth().padding(horizontal=10.dp).height(44.dp),verticalAlignment=Alignment.CenterVertically){
                ChromeButton(label("back"),size=44.dp,onClick={action(page.leading,"",0.0)}){PageIcon("arrow-left",PageInk,Modifier.size(23.dp))}
                Spacer(Modifier.weight(1f))
                ChromeButton(label("filterToggle"),size=44.dp,onClick={action("filterToggle","",0.0)}){PageIcon("search",PageInk,Modifier.size(21.dp))}
                ChromeButton(label("menu"),size=44.dp,onClick={action(page.trailing,"",0.0)}){PageIcon("ellipsis-vertical",PageInk,Modifier.size(23.dp))}
            }
            LazyColumn(Modifier.fillMaxSize(),state=list,contentPadding=PaddingValues(top=if(short)8.dp else 18.dp,bottom=(page.bottomClearance+page.safeBottom).dp)){
                item("header"){
                    Column(Modifier.padding(horizontal=18.dp)){
                        Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(if(width<=370)12.dp else 16.dp)){
                            val art=if(short)80.dp else (width*.31f).coerceIn(108f,140f).dp
                            Box(Modifier.size(art).clip(RoundedCornerShape(12.dp)).background(Color(0xFF14211E))){
                                AsyncImage(pageImage(cover.image),null,Modifier.fillMaxSize(),contentScale=ContentScale.Fit)
                            }
                            Column(Modifier.weight(1f)){
                                val font=if(short)18f else (width*.048f).coerceIn(18f,22f)
                                Text(page.title,color=PageInk,fontSize=font.sp,lineHeight=(font*1.4f).sp,fontWeight=FontWeight.Bold,maxLines=if(short)2 else 3,overflow=TextOverflow.Ellipsis)
                                Text(cover.subtitle,color=PageMuted,fontSize=12.sp,modifier=Modifier.padding(top=9.dp,bottom=8.dp))
                                Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){
                                    if(intro.creatorImage.isNotBlank())PageArtwork(intro.creatorImage,Modifier.size(23.dp),99.dp)
                                    Text(intro.creator,color=PageInk,fontSize=12.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
                                }
                            }
                        }
                        if(intro.description.isNotBlank()){
                            var expanded by remember(intro.description){mutableStateOf(false)}
                            val collapsible=intro.description.length>80||intro.description.contains('\n')
                            Row(Modifier.fillMaxWidth().padding(top=11.dp).clickable(enabled=collapsible){expanded=!expanded},verticalAlignment=Alignment.CenterVertically){
                                Text(intro.description,color=PageMuted,fontSize=12.sp,lineHeight=19.8.sp,maxLines=if(expanded||!collapsible)Int.MAX_VALUE else 2,overflow=TextOverflow.Ellipsis,modifier=Modifier.weight(1f))
                                if(collapsible)PageIcon("chevron-down",PageMuted,Modifier.padding(start=8.dp).size(16.dp))
                            }
                        }
                        Row(Modifier.fillMaxWidth().padding(top=14.dp,bottom=16.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)){
                            controls.items.firstOrNull()?.let{item->
                                Row(Modifier.weight(1f).height(42.dp).clip(RoundedCornerShape(24.dp)).background(Color(0xFF7EE0C2))
                                    .graphicsLayer{alpha=if(item.disabled).45f else 1f}.clickable(enabled=!item.disabled){action(item.action,"",0.0)},
                                    horizontalArrangement=Arrangement.spacedBy(8.dp,Alignment.CenterHorizontally),verticalAlignment=Alignment.CenterVertically){
                                    ChromeGlyph("play",Color(0xFF04231B),Modifier.size(20.dp));Text(item.title,color=Color(0xFF04231B),fontSize=15.sp,fontWeight=FontWeight(650))
                                }
                            }
                            controls.items.drop(1).forEach{item->
                                Box(Modifier.size(44.dp,42.dp).clip(RoundedCornerShape(99.dp)).background(Color(0x0AB7E6D3)).clickable(enabled=!item.disabled){action(item.action,"",0.0)},contentAlignment=Alignment.Center){
                                    PageIcon(if(item.id=="subscribe")"heart"else"plus",if(item.selected)PlaylistJade else PageInk,Modifier.size(24.dp),filled=item.id=="subscribe"&&item.selected)
                                }
                            }
                        }
                        page.sections.firstOrNull{it.id=="songHeading"}?.let{heading->Row(Modifier.padding(start=4.dp,top=4.dp,bottom=12.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){
                            Column{Text(heading.title,color=PageInk,fontSize=18.sp,fontWeight=FontWeight(650));Box(Modifier.padding(top=5.dp).width(36.dp).height(2.dp).background(PlaylistJade))}
                            Text(heading.text,color=PageMuted,fontSize=12.sp)
                        }}
                    }
                }
                page.sections.filter{it.layout=="input"}.forEach{section->item(section.id){Box(Modifier.padding(horizontal=18.dp,vertical=8.dp)){NativePageInput(section,action)}}}
                items(tracks.total,key={index->"${tracks.dataKey}:$index"}){index->
                    val item=cache.get(tracks,index)
                    if(item!=null)NativePlaylistTrack(item.copy(selected=item.id.substringAfter(':')==tracks.activeKey),tracks.playing,maxOf(tracks.total.toString().length,item.number.length),action)
                    else {Spacer(Modifier.height(52.dp));LaunchedEffect(page.key,page.session,tracks.dataKey,index/100){if(cache.request(index,page.session))action(tracks.request,"",(index/100*100).toDouble())}}
                }
                page.sections.filter{it.layout=="message"&&it.id!="songHeading"}.forEach{section->item(section.id){Column(Modifier.padding(18.dp)){
                    if(section.text.isNotBlank())Text(section.text,color=PageMuted,fontSize=12.sp)
                    if(section.more.isNotBlank())PagePill(section.moreLabel,{action(section.more,"",0.0)})
                }}}
            }
        }
        if(toolbar.any{it.id=="locateCurrent"}&&(!currentVisible||tracks.activeIndex<0))Box(Modifier.align(Alignment.BottomEnd).padding(end=18.dp,bottom=(page.safeBottom+74).dp)){
            PlaylistLocateButton(label("locateCurrent")){action("locateCurrent","",0.0)}
        }
    }
}
@Composable private fun NativePlaylistTrack(item:NativePageItem,playing:Boolean,numberDigits:Int,action:PageAction){
    val numberWidth=playlistNumberWidth(numberDigits,LocalDensity.current.fontScale).dp
    Column(Modifier.fillMaxWidth().background(if(item.selected)Color(0x247EE0C2)else Color.Transparent)
        .drawBehind{if(item.selected)drawRect(PlaylistJade,size=Size(3.dp.toPx(),size.height))}){
        Row(Modifier.fillMaxWidth().height(51.dp).padding(start=18.dp,end=14.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(9.dp)){
            Text(item.number,color=if(item.selected)PlaylistJade else PageMuted,fontSize=11.sp,maxLines=1,softWrap=false,
                textAlign=TextAlign.End,modifier=Modifier.width(numberWidth))
            PageArtwork(item.image,Modifier.size(36.dp).clickable(enabled=!item.disabled){action(item.action,"",0.0)},7.dp)
            Column(Modifier.weight(1f).clickable(enabled=!item.disabled){action(item.action,"",0.0)}){
                Text(item.title,color=if(item.selected)PlaylistJade else PageInk.copy(alpha=if(item.disabled).45f else 1f),fontSize=14.sp,fontWeight=FontWeight(if(item.selected)700 else 550),maxLines=1,overflow=TextOverflow.Ellipsis)
                NativeSongSubtitle(item,modifier=Modifier.padding(top=1.dp))
            }
            if(item.selected)PlaylistPlaybackIndicator(playing)
            Text(item.duration,color=PageMuted,fontSize=11.sp,textAlign=TextAlign.End,modifier=Modifier.width(34.dp))
            ChromeButton(item.secondaryLabel,size=36.dp,onClick={action(item.secondary,"",0.0)}){PageIcon("ellipsis-vertical",PageMuted,Modifier.size(19.dp))}
        }
        Box(Modifier.fillMaxWidth().padding(start=86.dp,end=18.dp).height(1.dp).background(Color(0x09C7E4D5)))
    }
}
