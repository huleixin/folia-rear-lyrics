package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.graphics.Color
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
            LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(bottom=(page.bottomClearance+page.safeBottom).dp)) {
                page.sections.forEach { section ->
                    when {
                        section.layout=="hero" -> item(key=section.id){NativeHeroRail(section,viewport,start,end,wide,short,action)}
                        section.id=="recent" && section.layout=="cards" -> item(key=section.id){
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
@Composable private fun NativeHeroRail(section:NativePageSection,viewport:Float,start:androidx.compose.ui.unit.Dp,end:androidx.compose.ui.unit.Dp,wide:Boolean,short:Boolean,action:PageAction) {
    val state=rememberLazyListState();val scope=rememberCoroutineScope()
    val width=NativePageDesign.heroWidth(viewport,wide,short).dp
    val height=NativePageDesign.heroHeight(width.value,short).dp
    val title=(if(short)30f else (viewport*.09f).coerceIn(31f,40f)).sp
    LazyRow(state=state,flingBehavior=rememberSnapFlingBehavior(state,snapPosition=SnapPosition.Start),
        contentPadding=PaddingValues(start=start,end=end,bottom=4.dp),horizontalArrangement=Arrangement.spacedBy(11.dp)){
        items(section.items,key={it.id}) { item ->
            Box(Modifier.width(width).height(height).clip(RoundedCornerShape(15.dp)).background(Color(0xFF172320))) {
                AsyncImage(pageImage(item.image),null,Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
                if(item.id=="guess-you-like")Text("TINGYU",color=Color.White.copy(alpha=.92f),fontSize=10.sp,letterSpacing=3.sp,modifier=Modifier.offset(18.dp,18.dp))
                Text(item.title,color=Color.White,fontSize=title,lineHeight=title*1.14f,fontWeight=FontWeight(780),letterSpacing=(-1.1).sp,
                    modifier=Modifier.padding(start=18.dp,top=if(short)40.dp else 50.dp).width(width*.8f))
                if(item.id=="guess-you-like")Box(Modifier.offset(18.dp,(50+title.value*2.28f+10).dp).size(16.dp,2.dp).background(Color(0x99FFFFFF),RoundedCornerShape(2.dp)))
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
            .background(if(state.firstVisibleItemIndex==index)Color(0xFFF1F5F2)else Color(0x38FFFFFF)).clickable{scope.launch{state.animateScrollToItem(index)}}) }
    }
}
@Composable private fun NativeHomePlaylist(item:NativePageItem,modifier:Modifier,action:PageAction){
    Row(modifier.heightIn(min=58.dp).clip(RoundedCornerShape(8.dp)).background(Color(0xDB14241F)).border(1.dp,Color(0x10FFFFFF),RoundedCornerShape(8.dp)),verticalAlignment=Alignment.CenterVertically){
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
