package io.github.huleixin.tingyu.chrome

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import kotlin.math.roundToInt

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/MediaDetail.kt
// 统一原生音乐集合详情模板（阶段 E）：歌单/专辑/每日推荐/收藏/自建/本地文件夹共用，
// 歌手页保留独立结构（NativeDirectoryPage artist 分支）。结构与度量和 WebView 侧
// MobilePlaylistHeader / mobilePlaylistDetail.css 逐值对齐（PLAYLIST_DETAIL_PARITY.md）。
private val PlaylistJade:Color @Composable get()=LocalInterfacePalette.current.mediaAccent

/** 集合详情统一入口：按 sections 契约（toolbar/intro/controls/songHeading/filter/tracks）渲染。 */
@Composable internal fun MediaDetailScaffold(page:NativePage,modifier:Modifier,action:PageAction){
    val intro=page.sections.firstOrNull{it.id=="intro"};val cover=intro?.items?.firstOrNull()
    val controls=page.sections.firstOrNull{it.id=="controls"};val tracks=page.sections.firstOrNull{it.id=="tracks"}
    if(intro==null||cover==null||controls==null||tracks==null){NativeDirectoryPage(page,modifier,action);return}
    val toolbar=page.sections.firstOrNull{it.id=="toolbar"}?.items.orEmpty()
    fun label(id:String)=toolbar.firstOrNull{it.id==id}?.title?:""
    val cache=rememberNativeRows(page.key,tracks)
    val list=rememberLazyListState()
    // Returning from the player re-enters the composition, which used to re-run an unconditional
    // scrollToItem(0) and throw away the position the saveable list state had just restored.
    // Reset only when the row identity really changes (sort, filter, in-collection search).
    var previousTracksKey by rememberSaveable { mutableStateOf(tracks.dataKey) }
    LaunchedEffect(tracks.dataKey){if(previousTracksKey!=tracks.dataKey){list.scrollToItem(0);previousTracksKey=tracks.dataKey}}
    // 沉浸式毛玻璃顶栏（TopGlassBar）：歌曲列表全幅滚动进入固定返回栏的玻璃后方；
    // 随滚动的封面/信息区不是顶栏，玻璃范围只由返回栏测量决定。玻璃底色含封面氛围层副本
    // （内容层绘制，页面级原件在能力具备时移除以免重复采样）。
    val colors=page.surfaceColors()
    val glass=rememberTyTopGlassState(estimateHeaderBottomDp=page.safeTop+52f)
    // 集合内搜索替换同一行工具栏；两种状态共用玻璃高度，搜索不再叠在按钮之上。
    val filterSection=page.sections.firstOrNull{it.layout=="input"}
    var searchExpanded by remember(page.key){mutableStateOf(false)}
    val focusManager=androidx.compose.ui.platform.LocalFocusManager.current
    fun closeSearch(){focusManager.clearFocus();searchExpanded=false}
    LaunchedEffect(filterSection!=null){searchExpanded=filterSection!=null}
    BackHandler(enabled=searchExpanded){closeSearch()}
    val headerItems=1
    val currentVisible by remember(tracks.activeIndex,headerItems){derivedStateOf{list.layoutInfo.visibleItemsInfo.any{it.index==tracks.activeIndex+headerItems}}}
    val pageDensity=LocalDensity.current
    LaunchedEffect(tracks.locateRevision){if(tracks.locateRevision>0&&tracks.activeIndex>=0){
        // 定位落到玻璃顶栏下方 12dp（视口改为全幅后，原来的 -100 会把当前行留在玻璃后面）。
        val clearPx=with(pageDensity){(glass.headerBottomDp+TyTopGlass.TailDp+12).dp.toPx()}.roundToInt()
        list.animateScrollToItem(tracks.activeIndex+headerItems,-clearPx)
    }}
    BoxWithConstraints(modifier){
        val short=maxHeight<500.dp;val width=maxWidth.value
        // BoxWithConstraintsScope 带 @LayoutScopeMarker：Column 作用域里不能再隐式读 maxHeight，
        // 需要先在根作用域提升为局部值（玻璃内容层的氛围层视口高度要用）。
        val detailMaxHeight=maxHeight
        Box(Modifier.fillMaxSize()){
            TyTopGlassContentLayer(glass,colors,ambientImage=cover.image,ambientViewportHeight=detailMaxHeight,modifier=Modifier.fillMaxSize()){
            val listTop=if(short)8.dp else 18.dp
            LazyColumn(Modifier.fillMaxSize(),state=list,contentPadding=PaddingValues(top=glass.contentTop+listTop,bottom=(page.bottomClearance+page.safeBottom).dp)){
                item("header"){
                    MediaDetailHeader(cover,page.title,intro,controls,
                        page.sections.firstOrNull{it.id=="songHeading"},short,width,action)
                }
                items(tracks.total,key={index->"${tracks.dataKey}:$index"}){index->
                    val item=cache.get(tracks,index)
                    if(item!=null)MediaDetailTrack(item.copy(selected=item.id.substringAfter(':')==tracks.activeKey),tracks.playing,maxOf(tracks.total.toString().length,item.number.length),action)
                    else {Spacer(Modifier.height(52.dp));LaunchedEffect(page.key,page.session,tracks.dataKey,index/100){if(cache.request(index,page.session))action(tracks.request,"",(index/100*100).toDouble())}}
                }
                page.sections.filter{it.layout=="message"&&it.id!="songHeading"}.forEach{section->item(section.id){Column(Modifier.padding(18.dp)){
                    if(section.text.isNotBlank())Text(section.text,color=PageMuted,fontSize=12.sp)
                    if(section.more.isNotBlank())PagePill(section.moreLabel,{action(section.more,"",0.0)})
                }}}
            }
            }
            TyTopGlassSurface(glass,colors)
            // 顶部操作区（清晰层）：水平边距与 WebView 对齐：.ml-page 16px + .ml-collection-top 10px = 26px。
            TyTopGlassForeground {
                Column(Modifier.fillMaxWidth().padding(top=(page.safeTop+8).dp)
                    .onGloballyPositioned{glass.reportHeader(it.positionInWindow().y,it.size.height)}){
                MediaDetailToolbar(page.key,searchExpanded,filterSection,action,
                    onRequestClose={closeSearch()},onClosed={action("filterClose","",0.0)}){
                Row(Modifier.fillMaxWidth().padding(horizontal=26.dp).height(NativeSearchBarHeight),verticalAlignment=Alignment.CenterVertically){
                    ChromeButton(label("back"),enabled=!searchExpanded,size=44.dp,onClick={action(page.leading,"",0.0)}){PageIcon("arrow-left",PageInk,Modifier.size(23.dp))}
                    Spacer(Modifier.weight(1f))
                    ChromeButton(label("filterToggle"),enabled=!searchExpanded,size=44.dp,onClick={if(filterSection!=null)searchExpanded=true;action("filterToggle","",0.0)}){PageIcon("search",PageInk,Modifier.size(21.dp))}
                    ChromeButton(label("menu"),enabled=!searchExpanded,size=44.dp,onClick={action(page.trailing,"",0.0)}){PageIcon("ellipsis-vertical",PageInk,Modifier.size(23.dp))}
                }
                }
                }
            }
        }
        if(toolbar.any{it.id=="locateCurrent"}&&(!currentVisible||tracks.activeIndex<0))Box(Modifier.align(Alignment.BottomEnd).padding(end=18.dp,bottom=(page.safeBottom+74).dp)){
            PlaylistLocateButton(label("locateCurrent")){action("locateCurrent","",0.0)}
        }
    }
}

/** 封面 + 标题 + 来源/创建者 + 可折叠简介 + 播放操作区 + 可选分组标题。 */
@Composable internal fun MediaDetailHeader(
    cover:NativePageItem,title:String,intro:NativePageSection,controls:NativePageSection,
    songHeading:NativePageSection?,short:Boolean,width:Float,action:PageAction,
){
    Column(Modifier.padding(horizontal=18.dp)){
        Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(if(width<=370)12.dp else 16.dp)){
            val art=if(short)80.dp else (width*.31f).coerceIn(108f,140f).dp
            Box(Modifier.size(art).liquidCover("",12.dp,destination=true).shadow(8.dp,RoundedCornerShape(12.dp),clip=false).background(LocalInterfacePalette.current.surface)){
                // 封面阴影与 WebView .ml-playlist-cover（0 8px 24px）对齐。
                AsyncImage(pageImage(cover.image),null,Modifier.fillMaxSize(),contentScale=ContentScale.Fit)
            }
            Column(Modifier.weight(1f).liquidDetailContent(.12f)){
                val font=if(short)18f else (width*.048f).coerceIn(18f,22f)
                Text(title,color=PageInk,fontSize=font.sp,lineHeight=(font*1.4f).sp,fontWeight=FontWeight.Bold,maxLines=if(short)2 else 3,overflow=TextOverflow.Ellipsis)
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
            Row(Modifier.fillMaxWidth().liquidDetailContent(.18f).padding(top=11.dp).chromeClickable(enabled=collapsible,corner=10.dp){expanded=!expanded},verticalAlignment=Alignment.CenterVertically){
                Text(intro.description,color=PageMuted,fontSize=12.sp,lineHeight=19.8.sp,maxLines=if(expanded||!collapsible)Int.MAX_VALUE else 2,overflow=TextOverflow.Ellipsis,modifier=Modifier.weight(1f))
                if(collapsible)PageIcon("chevron-down",PageMuted,Modifier.padding(start=8.dp).size(16.dp))
            }
        }
        MediaDetailActionsRow(controls,action)
        if(songHeading!=null)Row(Modifier.padding(start=4.dp,top=4.dp,bottom=12.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){
            Column{Text(songHeading.title,color=PageInk,fontSize=18.sp,fontWeight=FontWeight(650));Box(Modifier.padding(top=5.dp).width(36.dp).height(2.dp).background(PlaylistJade))}
            Text(songHeading.text,color=PageMuted,fontSize=12.sp)
        }
    }
}

/** 播放全部主按钮 + 次级图标按钮（入队/收藏），能力由数据侧决定。 */
@Composable internal fun MediaDetailActionsRow(controls:NativePageSection,action:PageAction){
    Row(Modifier.fillMaxWidth().liquidDetailContent(.24f).padding(top=14.dp,bottom=16.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)){
        controls.items.firstOrNull()?.let{item->
            Row(Modifier.weight(1f).height(42.dp).clip(RoundedCornerShape(24.dp)).background(LocalInterfacePalette.current.button)
                .graphicsLayer{alpha=if(item.disabled).45f else 1f}.clickable(enabled=!item.disabled){action(item.action,"",0.0)},
                horizontalArrangement=Arrangement.spacedBy(8.dp,Alignment.CenterHorizontally),verticalAlignment=Alignment.CenterVertically){
                ChromeGlyph("play",LocalInterfacePalette.current.onAccent,Modifier.size(20.dp));Text(item.title,color=LocalInterfacePalette.current.onAccent,fontSize=15.sp,fontWeight=FontWeight(650))
            }
        }
        controls.items.drop(1).forEach{item->
            Box(Modifier.size(44.dp,42.dp).clip(RoundedCornerShape(99.dp)).background(LocalInterfacePalette.current.mediaSubtle).clickable(enabled=!item.disabled){action(item.action,"",0.0)},contentAlignment=Alignment.Center){
                PageIcon(if(item.id=="subscribe")"heart"else"plus",if(item.selected)PlaylistJade else PageInk,Modifier.size(24.dp),filled=item.id=="subscribe"&&item.selected)
            }
        }
    }
}

/** 统一歌曲行：序号（独立字段）/封面/标题/副标题/播放指示/时长/菜单 + 玉绿当前行与分隔线。 */
@Composable internal fun MediaDetailTrack(item:NativePageItem,playing:Boolean,numberDigits:Int,action:PageAction){
    val jade=PlaylistJade
    val numberWidth=playlistNumberWidth(numberDigits,LocalDensity.current.fontScale).dp
    Column(Modifier.fillMaxWidth().liquidDetailContent(.28f).background(if(item.selected)LocalInterfacePalette.current.mediaSelected else Color.Transparent)
        .drawBehind{if(item.selected)drawRect(jade,size=Size(3.dp.toPx(),size.height))}){
        Row(Modifier.fillMaxWidth().height(51.dp).chromeClickable(enabled=!item.disabled&&item.action.isNotBlank(),corner=10.dp){action(item.action,"",0.0)}.padding(start=18.dp,end=14.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(9.dp)){
            Text(item.number,color=if(item.selected)PlaylistJade else PageMuted,fontSize=11.sp,maxLines=1,softWrap=false,
                textAlign=TextAlign.End,modifier=Modifier.width(numberWidth))
            PageArtwork(item.image,Modifier.size(36.dp),7.dp)
            Column(Modifier.weight(1f)){
                Text(item.title,color=if(item.selected)PlaylistJade else PageInk.copy(alpha=if(item.disabled).45f else 1f),fontSize=14.sp,fontWeight=FontWeight(if(item.selected)700 else 550),maxLines=1,overflow=TextOverflow.Ellipsis)
                NativeSongSubtitle(item,modifier=Modifier.padding(top=1.dp))
            }
            if(item.selected)PlaylistPlaybackIndicator(playing)
            Text(item.duration,color=PageMuted,fontSize=11.sp,textAlign=TextAlign.End,modifier=Modifier.width(34.dp))
            ChromeButton(item.secondaryLabel,size=36.dp,onClick={action(item.secondary,"",0.0)}){PageIcon("ellipsis-vertical",PageMuted,Modifier.size(19.dp))}
        }
        Box(Modifier.fillMaxWidth().padding(start=86.dp,end=18.dp).height(1.dp).background(LocalInterfacePalette.current.mediaDivider))
    }
}
