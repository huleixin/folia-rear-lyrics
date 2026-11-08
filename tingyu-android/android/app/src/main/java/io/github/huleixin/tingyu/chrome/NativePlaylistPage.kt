package io.github.huleixin.tingyu.chrome

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.Rect
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
private val PlaylistJade:Color @Composable get()=interfaceColor(Color(0xFF7EE0C2),LightInterfaceColors.Accent)
@Composable internal fun NativePlaylistPage(page:NativePage,modifier:Modifier,action:PageAction){
    val intro=page.sections.first{it.id=="playlistIntro"};val cover=intro.items.first()
    val controls=page.sections.first{it.id=="controls"};val tracks=page.sections.first{it.id=="tracks"}
    val toolbar=page.sections.firstOrNull{it.id=="toolbar"}?.items.orEmpty()
    fun label(id:String)=toolbar.firstOrNull{it.id==id}?.title?:""
    val cache=rememberNativeRows(page.key,tracks)
    val list=rememberLazyListState()
    LaunchedEffect(tracks.dataKey){list.scrollToItem(0)}
    // 歌单内搜索（68593）：输入框不再作为 LazyColumn 的 item（那样会跟着歌曲滚、点开时
    // "凭空出现在列表中间"）。它由页面级的固定层承载，从右上角放大镜的位置展开。
    val filterSection=page.sections.firstOrNull{it.layout=="input"}
    var pageOrigin by remember{mutableStateOf(Offset.Zero)}
    var searchExpanded by remember(page.key){mutableStateOf(false)}
    var filterIcon by remember{mutableStateOf<Rect?>(null)}
    LaunchedEffect(filterSection!=null){if(filterSection!=null)searchExpanded=true}
    BackHandler(enabled=searchExpanded){searchExpanded=false}
    val headerItems=1
    val currentVisible by remember(tracks.activeIndex,headerItems){derivedStateOf{list.layoutInfo.visibleItemsInfo.any{it.index==tracks.activeIndex+headerItems}}}
    LaunchedEffect(tracks.locateRevision){if(tracks.locateRevision>0&&tracks.activeIndex>=0){
        list.animateScrollToItem(tracks.activeIndex+headerItems,-100)
    }}
    BoxWithConstraints(modifier.pageOrigin{pageOrigin=it}){
        val short=maxHeight<500.dp;val width=maxWidth.value
        NativePlaylistBackdrop(cover.image,maxHeight)
        Column(Modifier.fillMaxSize().padding(top=(page.safeTop+8).dp)){
            // 顶部操作区水平边距与 WebView 对齐：.ml-page 16px + .ml-collection-top 10px = 26px。
            Row(Modifier.fillMaxWidth().padding(horizontal=26.dp).height(44.dp),verticalAlignment=Alignment.CenterVertically){
                ChromeButton(label("back"),size=44.dp,onClick={action(page.leading,"",0.0)}){PageIcon("arrow-left",PageInk,Modifier.size(23.dp))}
                Spacer(Modifier.weight(1f))
                Box(Modifier.pageAnchor(pageOrigin){filterIcon=it}){
                    ChromeButton(label("filterToggle"),size=44.dp,onClick={action("filterToggle","",0.0)}){PageIcon("search",PageInk,Modifier.size(21.dp))}
                }
                ChromeButton(label("menu"),size=44.dp,onClick={action(page.trailing,"",0.0)}){PageIcon("ellipsis-vertical",PageInk,Modifier.size(23.dp))}
            }
            val listTop by animateDpAsState((if(short)8.dp else 18.dp)+if(searchExpanded)NativeSearchBarHeight+14.dp else 0.dp,tween(240),label="pl-list-top")
            LazyColumn(Modifier.fillMaxSize(),state=list,contentPadding=PaddingValues(top=listTop,bottom=(page.bottomClearance+page.safeBottom).dp)){
                item("header"){
                    Column(Modifier.padding(horizontal=18.dp)){
                        Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(if(width<=370)12.dp else 16.dp)){
                            val art=if(short)80.dp else (width*.31f).coerceIn(108f,140f).dp
                            Box(Modifier.size(art).shadow(8.dp,RoundedCornerShape(12.dp)).clip(RoundedCornerShape(12.dp)).background(interfaceColor(Color(0xFF14211E),LightInterfaceColors.Surface))){
                                // 封面阴影与 WebView .ml-playlist-cover（0 8px 24px）对齐。
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
                                Row(Modifier.weight(1f).height(42.dp).clip(RoundedCornerShape(24.dp)).background(interfaceColor(Color(0xFF7EE0C2),LightInterfaceColors.Button))
                                    .graphicsLayer{alpha=if(item.disabled).45f else 1f}.clickable(enabled=!item.disabled){action(item.action,"",0.0)},
                                    horizontalArrangement=Arrangement.spacedBy(8.dp,Alignment.CenterHorizontally),verticalAlignment=Alignment.CenterVertically){
                                    ChromeGlyph("play",Color(0xFF04231B),Modifier.size(20.dp));Text(item.title,color=Color(0xFF04231B),fontSize=15.sp,fontWeight=FontWeight(650))
                                }
                            }
                            controls.items.drop(1).forEach{item->
                                Box(Modifier.size(44.dp,42.dp).clip(RoundedCornerShape(99.dp)).background(interfaceColor(Color(0x0AB7E6D3),LightInterfaceColors.Subtle)).clickable(enabled=!item.disabled){action(item.action,"",0.0)},contentAlignment=Alignment.Center){
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
        if(filterSection!=null)NativeSearchOverlay(
            visible=searchExpanded,
            section=filterSection,
            action=action,
            safeTop=page.safeTop,
            origin=filterIcon,
            onRequestClose={searchExpanded=false},
            // 收起动画播完才让 JS 撤掉筛选区：否则输入框会在动画中途消失（"闪一下"）。
            onClosed={action("filterToggle","",0.0)},
        )
    }
}
@Composable private fun NativePlaylistTrack(item:NativePageItem,playing:Boolean,numberDigits:Int,action:PageAction){
    val jade=PlaylistJade
    val numberWidth=playlistNumberWidth(numberDigits,LocalDensity.current.fontScale).dp
    Column(Modifier.fillMaxWidth().background(if(item.selected)interfaceColor(Color(0x247EE0C2),LightInterfaceColors.Selected)else Color.Transparent)
        .drawBehind{if(item.selected)drawRect(jade,size=Size(3.dp.toPx(),size.height))}){
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
        Box(Modifier.fillMaxWidth().padding(start=86.dp,end=18.dp).height(1.dp).background(interfaceColor(Color(0x09C7E4D5),LightInterfaceColors.Divider)))
    }
}
