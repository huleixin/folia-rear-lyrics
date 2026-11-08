package io.github.huleixin.tingyu.chrome

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.gestures.snapping.SnapPosition
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import androidx.compose.ui.layout.ContentScale
import kotlinx.coroutines.launch

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeHomePage.kt
// Mirrors mobileLibrary.css + mobileRecommendations.css: fixed heading, snapping hero,
// horizontal square recent artwork, and compact two-column playlist rows.
@Composable internal fun NativeHomePage(page:NativePage,modifier:Modifier,action:PageAction) {
    BoxWithConstraints(modifier){
        val wide=maxWidth>=840.dp;val short=wide&&maxHeight<=600.dp
        val start=if(wide)if(short)108.dp else 116.dp else 22.dp
        val end=if(wide)32.dp else 22.dp
        val viewport=if(wide)maxWidth.value-start.value-end.value else maxWidth.value
        Column(Modifier.fillMaxSize().padding(top=(page.safeTop+if(short)8 else 36).dp)){
            PageHeading(page,Modifier.padding(start=start,end=end).heightIn(min=if(short)60.dp else 72.dp),large=true,action=action)
            Spacer(Modifier.height(6.dp))
            // 顶部滚动渐隐（Top Scroll Scrim）：猜你喜欢/每日推荐/最近播放/我的歌单上滑时
            // 在固定标题下方柔和消隐，横向卡片滑动不受影响（遮罩只画不接事件）。
            val list = rememberLazyListState()
            TopScrollScrimViewport(state=list,fusion=TopScrimFusion.Gradient(page.surfaceColors()),modifier=Modifier.fillMaxSize()) {
            LazyColumn(Modifier.fillMaxSize(),state=list,contentPadding=PaddingValues(bottom=(page.bottomClearance+page.safeBottom).dp)) {
                page.sections.forEach { section ->
                    when {
                        section.layout=="hero" -> item(key=section.id){NativeHeroRail(section,viewport,start,end,wide,short,action)}
                        // 方形封面横滑 rail：在线首页的「最近播放」与本地首页的「最近播放 / 常听专辑」共用一套。
                        section.layout=="cards" && section.id in setOf("recent","localAlbums") -> item(key=section.id){
                            Column(Modifier.padding(top=4.dp)) {
                                PageSectionHeading(section,Modifier.padding(start=start,end=end,bottom=4.dp),action)
                                LazyRow(contentPadding=PaddingValues(start=start,end=end),horizontalArrangement=Arrangement.spacedBy(12.dp)) {
                                    items(section.items,key={it.id}) { item ->
                                        val cover=NativePageDesign.recentWidth(viewport,wide).dp
                                        Column(Modifier.width(cover)) {
                                            Box(Modifier.clickable(enabled=!item.disabled){action(item.action,"",0.0)}){PageArtwork(item.image,Modifier.fillMaxWidth().aspectRatio(1f))}
                                            Row(Modifier.fillMaxWidth().padding(top=4.dp),verticalAlignment=Alignment.CenterVertically) {
                                                Column(Modifier.weight(1f).clickable(enabled=!item.disabled){action(item.action,"",0.0)}){
                                                    Text(item.title,color=PageInk,fontSize=13.sp,lineHeight=18.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
                                                    Text(item.subtitle,color=PageMuted,fontSize=12.sp,lineHeight=18.sp,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=2.dp))
                                                }
                                                if(item.secondary.isNotBlank())Box(Modifier.width(24.dp).height(36.dp).clickable{action(item.secondary,"",0.0)},contentAlignment=Alignment.Center){PageIcon("ellipsis-vertical",PageMuted,Modifier.size(16.dp))}
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        // 本地首页的四个快捷入口：四张独立轻量玻璃卡（深绿半透明、小圆角、
                        // 圆形图标容器），图标在上 / 名称居中 / 真实数量在下，无竖线分隔；
                        // 按压沿用 ChromeMaterial 的缩放+透明度反馈。导航与计数逻辑不变。
                        section.layout=="quickLinks" -> item(key=section.id){
                            Row(Modifier.padding(start=start,end=end,top=6.dp),horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                                section.items.forEach { item ->
                                    val interaction=remember { MutableInteractionSource() }
                                    val pressed by interaction.collectIsPressedAsState()
                                    val scale by animateFloatAsState(if(pressed)0.96f else 1f,label="quick-press")
                                    Column(Modifier.weight(1f)
                                        .graphicsLayer{scaleX=scale;scaleY=scale;alpha=if(pressed)0.85f else 1f}
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(interfaceColor(Color(0x3A17352A),Color(0x59D7EADC)))
                                        .border(1.dp,interfaceColor(Color(0x14FFFFFF),Color(0x2E93BBA0)),RoundedCornerShape(12.dp))
                                        .clickable(interactionSource=interaction,indication=null,enabled=!item.disabled&&item.action.isNotBlank()){action(item.action,"",0.0)}
                                        .padding(vertical=10.dp),
                                        horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(5.dp)) {
                                        Box(Modifier.size(32.dp).clip(RoundedCornerShape(999.dp))
                                            .background(interfaceColor(Color(0x3D9FE0C4),LightInterfaceColors.Selected)),
                                            contentAlignment=Alignment.Center){PageIcon(if(item.image.isNotBlank())item.image else "music2",PageInk.copy(alpha=.92f),Modifier.size(15.dp))}
                                        Text(item.title,color=PageInk,fontSize=12.sp,lineHeight=15.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
                                        Text(item.subtitle,color=PageMuted,fontSize=10.sp,lineHeight=13.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
                                    }
                                }
                            }
                        }
                        // 本地首页的「为你发现」：两张深色柔和渐变卡（左：久未播放·深青蓝；
                        // 右：随机探索·深紫），柔光纹理同语言不同朝向，播放按钮收进右下角
                        // 小圆钮。底色固定深色 + 白字，深浅色模式都可读（与 hero 卡同一策略）。
                        section.layout=="discoverCards" -> item(key=section.id){
                            Column(Modifier.padding(top=4.dp)) {
                                PageSectionHeading(section,Modifier.padding(start=start,end=end,bottom=6.dp),action)
                                Row(Modifier.padding(start=start,end=end),horizontalArrangement=Arrangement.spacedBy(10.dp)) {
                                    section.items.forEachIndexed { index, item ->
                                        val interaction=remember { MutableInteractionSource() }
                                        val pressed by interaction.collectIsPressedAsState()
                                        val scale by animateFloatAsState(if(pressed)0.97f else 1f,label="discover-press")
                                        val deep=if(index==0)Color(0xFF16303C) else Color(0xFF231B33)
                                        val deepEnd=if(index==0)Color(0xFF0F212B) else Color(0xFF15101F)
                                        val sheen=if(index==0)Color(0x2E5FA8C0) else Color(0x2E8F72C9)
                                        Box(Modifier.weight(1f).heightIn(min=86.dp)
                                            .graphicsLayer{scaleX=scale;scaleY=scale;alpha=if(pressed)0.9f else 1f}
                                            .clip(RoundedCornerShape(14.dp))
                                            .background(Brush.linearGradient(0f to deep,1f to deepEnd))
                                            .drawBehind {
                                                // 轻微流光：柔光从左上（左卡）/右上（右卡）淡出；
                                                // 再叠一层对角微光做抽象纹理，统一但不完全相同。
                                                drawRect(Brush.radialGradient(colors=listOf(sheen,Color(0x00000000)),
                                                    center=Offset(if(index==0)0f else size.width,0f),radius=size.width*1.15f))
                                                drawRect(Brush.linearGradient(colors=listOf(Color(0x0FFFFFFF),Color(0x00000000)),
                                                    start=Offset(0f,size.height),end=Offset(size.width*.6f,0f)))
                                            }
                                            .clickable(interactionSource=interaction,indication=null,enabled=!item.disabled&&item.action.isNotBlank()){action(item.action,"",0.0)}) {
                                            Column(Modifier.fillMaxWidth().padding(start=14.dp,end=50.dp,top=12.dp,bottom=10.dp)) {
                                                Text(item.title,color=Color(0xF2FFFFFF),fontSize=14.sp,lineHeight=19.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
                                                Text(item.subtitle,color=Color(0xB8FFFFFF),fontSize=11.sp,lineHeight=15.sp,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=3.dp))
                                            }
                                            Box(Modifier.align(Alignment.BottomEnd).padding(end=12.dp,bottom=10.dp).size(28.dp)
                                                .clip(RoundedCornerShape(999.dp)).background(Color(0x2EFFFFFF)).border(1.dp,Color(0x24FFFFFF),RoundedCornerShape(999.dp))
                                                .clickable(enabled=!item.disabled&&item.action.isNotBlank()){action(item.action,"",0.0)},
                                                contentAlignment=Alignment.Center){ChromeGlyph("play",Color.White,Modifier.size(13.dp))}
                                        }
                                    }
                                }
                            }
                        }
                        section.id=="playlists" -> item(key=section.id){
                            Column(Modifier.padding(start=start,end=end,top=20.dp)){
                                PageSectionHeading(section,Modifier.padding(bottom=4.dp),action)
                                section.items.chunked(2).forEachIndexed { index,row ->
                                    Row(Modifier.fillMaxWidth().padding(top=if(index==0)0.dp else 10.dp),horizontalArrangement=Arrangement.spacedBy(10.dp)){
                                        row.forEach { item -> NativeHomePlaylist(item,Modifier.weight(1f),action) }
                                        if(row.size<2)Spacer(Modifier.weight(1f))
                                    }
                                }
                            }
                        }
                        section.layout=="rows" -> {
                            item(key="${section.id}:heading"){PageSectionHeading(section,Modifier.padding(start=start,end=end,bottom=4.dp),action)}
                            items(section.items,key={it.id}) { item -> Box(Modifier.padding(start=start,end=end)){NativePageRow(item,62.dp,46.dp,14,12,divider=true){action(it,"",0.0)}} }
                        }
                        section.text.isNotBlank() -> item(key=section.id){Text(section.text,color=PageMuted,fontSize=13.sp,modifier=Modifier.padding(start=start,end=end,top=18.dp,bottom=18.dp))}
                    }
                }
            }
            }
        }
    }
}
@Composable private fun NativeHeroRail(section:NativePageSection,viewport:Float,start:androidx.compose.ui.unit.Dp,end:androidx.compose.ui.unit.Dp,wide:Boolean,short:Boolean,action:PageAction) {
    val state=rememberLazyListState();val scope=rememberCoroutineScope()
    val width=NativePageDesign.heroWidth(viewport,wide,short).dp
    val height=NativePageDesign.heroHeight(width.value,short).dp
    val title=(if(short)30f else (viewport*.09f).coerceIn(31f,40f)).sp
    LazyRow(state=state,flingBehavior=rememberSnapFlingBehavior(state,snapPosition=SnapPosition.Start),
        contentPadding=PaddingValues(start=start,end=end,bottom=4.dp),horizontalArrangement=Arrangement.spacedBy(11.dp)){
        items(section.items,key={it.id}) { item ->
            // 眉题：在线首页第一张卡是 TINGYU，本地首页第一张是 TINGYU · LOCAL（对应设计图）。
            val eyebrow=when(item.id) { "guess-you-like"->"TINGYU"; "local-most-played"->"TINGYU · LOCAL"; else->"" }
            // 本地三张卡用的成品背景图底部偏亮，白色副标题/按钮对比度不足；
            // 只对 local-* 加一层非常轻的底部渐变遮罩（≤16% 黑），在线卡的既有设计不动。
            val localScrim=item.id.startsWith("local-")
            Box(Modifier.width(width).height(height).clip(RoundedCornerShape(15.dp)).background(Color(0xFF172320))) {
                AsyncImage(pageImage(item.image),null,Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
                if(localScrim)Box(Modifier.fillMaxSize().background(
                    Brush.verticalGradient(0f to Color(0x00000000),0.55f to Color(0x00000000),1f to Color(0x29000000))))
                if(eyebrow.isNotBlank())Text(eyebrow,color=Color.White.copy(alpha=.92f),fontSize=10.sp,letterSpacing=3.sp,modifier=Modifier.offset(18.dp,18.dp))
                Text(item.title,color=Color.White,fontSize=title,lineHeight=title*1.14f,fontWeight=FontWeight(780),letterSpacing=(-1.1).sp,
                    modifier=Modifier.padding(start=18.dp,top=if(short)40.dp else 50.dp).width(width*.8f))
                if(eyebrow.isNotBlank())Box(Modifier.offset(18.dp,(50+title.value*2.28f+10).dp).size(16.dp,2.dp).background(Color(0x99FFFFFF),RoundedCornerShape(2.dp)))
                Text(item.subtitle,color=Color(0xD9FFFDF2),fontSize=12.sp,lineHeight=18.sp,maxLines=2,modifier=Modifier.align(Alignment.BottomStart).padding(start=18.dp,bottom=52.dp))
                Row(Modifier.align(Alignment.BottomStart).padding(start=18.dp,bottom=14.dp).height(38.dp)
                    .clip(RoundedCornerShape(24.dp)).background(Color(0x30FFFFFF)).border(1.dp,Color(0x45FFFFFF),RoundedCornerShape(24.dp))
                    .clickable(enabled=!item.disabled){action(item.action,"",0.0)}.padding(horizontal=15.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(9.dp)) {
                    if(!item.disabled)ChromeGlyph("play",Color.White,Modifier.size(16.dp))
                    Text(item.secondaryLabel.ifBlank{if(item.disabled)"暂不可用"else"立即播放"},color=Color.White,fontSize=13.sp,fontWeight=FontWeight.Medium)
                }
            }
        }
    }
    Row(Modifier.fillMaxWidth().padding(top=4.dp,bottom=6.dp).height(15.dp),horizontalArrangement=Arrangement.spacedBy(7.dp,Alignment.CenterHorizontally),verticalAlignment=Alignment.CenterVertically){
        section.items.forEachIndexed { index,_ -> Box(Modifier.size(14.dp,3.dp).clip(RoundedCornerShape(4.dp))
            .background(if(state.firstVisibleItemIndex==index)interfaceColor(Color(0xFFF1F5F2),LightInterfaceColors.Muted)else interfaceColor(Color(0x38FFFFFF),LightInterfaceColors.SelectedBorder)).clickable{scope.launch{state.animateScrollToItem(index)}}) }
    }
}
@Composable private fun NativeHomePlaylist(item:NativePageItem,modifier:Modifier,action:PageAction){
    Row(modifier.heightIn(min=58.dp).clip(RoundedCornerShape(8.dp)).background(interfaceColor(Color(0xDB14241F),LightInterfaceColors.Card)).border(1.dp,interfaceColor(Color(0x10FFFFFF),LightInterfaceColors.Border),RoundedCornerShape(8.dp)),verticalAlignment=Alignment.CenterVertically){
        Row(Modifier.weight(1f).clickable{action(item.action,"",0.0)},verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(9.dp)){
            PageArtwork(item.image,Modifier.size(56.dp),10.dp)
            Column(Modifier.weight(1f)){
                Text(item.title,color=PageInk,fontSize=12.sp,lineHeight=16.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
                Text(item.subtitle,color=PageMuted,fontSize=10.sp,lineHeight=14.sp,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=3.dp))
            }
        }
        if(item.secondary.isNotBlank())Box(Modifier.padding(end=3.dp).width(22.dp).height(36.dp).clickable{action(item.secondary,"",0.0)},contentAlignment=Alignment.Center){PageIcon("ellipsis-vertical",PageMuted,Modifier.size(16.dp))}
    }
}
