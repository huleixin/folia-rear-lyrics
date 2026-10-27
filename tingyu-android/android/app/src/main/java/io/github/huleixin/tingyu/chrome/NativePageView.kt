package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import android.net.Uri
import android.util.Base64

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePageView.kt
private val PageInk=Color(0xFFF1F6F3)
private val PageMuted=Color(0xFFA2B8AE)
@Composable internal fun pageImage(url: String): Any? = remember(url) {
    if(url.startsWith("data:image")&&url.contains(','))runCatching{Base64.decode(url.substringAfter(','),Base64.DEFAULT)}.getOrNull()
    else {
        val uri=runCatching{Uri.parse(url)}.getOrNull()
        if(uri?.host in setOf("localhost","rear.folia.local") && uri?.path?.startsWith("/assets/")==true)
            "file:///android_asset/public${uri.path}" else url
    }
}
@Composable fun NativePageView(page: NativePage, modifier: Modifier, onAction: (String,String,Double)->Unit) {
    val focus=LocalFocusManager.current
    val action:(String,String,Double)->Unit={id,text,value->
        if(page.sections.none{it.action==id||it.request==id})focus.clearFocus()
        onAction(id,text,value)
    }
    val background=if(page.home) Brush.verticalGradient(listOf(Color(0xFF062A23),Color(0xFF010E0D)),endY=1100f)
        else Brush.verticalGradient(listOf(Color(0xFF071C15),Color(0xFF030A09)),endY=900f)
    BoxWithConstraints(modifier.background(background)) {
        val pageWidth=maxWidth
        val wide=pageWidth>=840.dp
        val list=rememberLazyListState()
        val rowIdentity=page.sections.filter{it.layout=="rows"}.map{it.id to it.dataKey}
        var previousIdentity by rememberSaveable{mutableStateOf(rowIdentity.toString())}
        LaunchedEffect(rowIdentity){if(previousIdentity!=rowIdentity.toString()){list.scrollToItem(0);previousIdentity=rowIdentity.toString()}}
        val rowCaches=page.sections.filter{it.layout=="rows"}.associate{section->section.id to key(section.id){rememberNativeRows(page.key,section)}}
        val horizontal=if(wide)32.dp else 16.dp
        val withRail=wide&&page.id in setOf("home","collection")
        val start=if(withRail)if(maxHeight<=600.dp)108.dp else 116.dp else horizontal
        LazyColumn(Modifier.fillMaxSize().imePadding(),state=list,
            contentPadding=PaddingValues(start=start,end=horizontal,top=(page.safeTop+page.topPadding).dp,
                bottom=(if(wide)page.bottomClearance.coerceAtMost(90f)else page.bottomClearance+page.safeBottom).dp),
            verticalArrangement=Arrangement.spacedBy(18.dp)) {
            item(key="page-heading") {
                Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) {
                    if(page.leading.isNotBlank()) ChromeButton("返回",size=42.dp,onClick={action(page.leading,"",0.0)}){Text("‹",color=PageInk,fontSize=32.sp)}
                    Column(Modifier.weight(1f)) {
                        Text(page.title,color=PageInk,fontSize=if(page.home)30.sp else 24.sp,fontWeight=FontWeight.Bold)
                        if(page.subtitle.isNotBlank())Text(page.subtitle,color=PageMuted,fontSize=13.sp)
                    }
                    if(page.trailing.isNotBlank())PagePill(page.trailingLabel){action(page.trailing,"",0.0)}
                }
            }
            page.sections.forEach { section ->
                if(section.title.isNotBlank())item(key="${section.id}:title") {
                    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) {
                        Text(section.title,color=PageInk,fontSize=18.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.weight(1f))
                        if(section.more.isNotBlank())PagePill(section.moreLabel){action(section.more,"",0.0)}
                    }
                }
                when(section.layout) {
                    "hero" -> item(key=section.id) {
                        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(12.dp)) {
                            section.items.forEach { item ->
                                val width=if(wide)330.dp else (pageWidth-48.dp).coerceAtMost(390.dp)
                                Box(Modifier.width(width).height(width*.86f).clip(RoundedCornerShape(22.dp)).background(Color(0xFF192F2A))) {
                                    if(item.image.isNotBlank())AsyncImage(pageImage(item.image),null,Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
                                    Column(Modifier.fillMaxSize().padding(22.dp),verticalArrangement=Arrangement.SpaceBetween) {
                                        Text(item.title,color=Color.White,fontSize=34.sp,fontWeight=FontWeight.Bold)
                                        Column {
                                            Text(item.subtitle,color=Color.White.copy(alpha=.85f),fontSize=15.sp)
                                            Spacer(Modifier.height(12.dp))
                                            PagePill(item.secondaryLabel.ifBlank{if(item.disabled)"暂不可用"else"▶  立即播放"},!item.disabled){action(item.action,"",0.0)}
                                        }
                                    }
                                }
                            }
                        }
                    }
                    "chips" -> item(key=section.id) {
                        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                            section.items.forEach { item -> PagePill(item.title,!item.disabled,item.selected){action(item.action,"",0.0)} }
                        }
                    }
                    "input" -> item(key=section.id) { NativePageInput(section,action) }
                    "cards" -> {
                        val columns=if(wide)4 else if(pageWidth>=600.dp)3 else 2
                        section.items.chunked(columns).forEachIndexed { index, row -> item(key="${section.id}:grid:$index") {
                            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(12.dp)) {
                                row.forEach { item -> Column(Modifier.weight(1f).clip(RoundedCornerShape(16.dp))
                                    .clickable(enabled=!item.disabled){action(item.action,"",0.0)}.padding(8.dp)) {
                                    if(item.image.isNotBlank())AsyncImage(pageImage(item.image),null,Modifier.fillMaxWidth().aspectRatio(1.25f).clip(RoundedCornerShape(12.dp)),contentScale=ContentScale.Crop)
                                    Text(item.title,color=PageInk,fontSize=14.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
                                    Text(item.subtitle,color=PageMuted,fontSize=11.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
                                    if(item.secondary.isNotBlank())PagePill(item.secondaryLabel){action(item.secondary,"",0.0)}
                                } }
                                repeat(columns-row.size){Spacer(Modifier.weight(1f))}
                            }
                        } }
                    }
                    "rows" -> items(section.total,key={index->"${section.id}:${section.dataKey}:row:$index"}) { index ->
                        val cache=rowCaches.getValue(section.id);val item=cache.get(section,index)
                        if(item!=null)NativePageRow(item){id->action(id,"",0.0)}
                        else {
                            Spacer(Modifier.fillMaxWidth().height(70.dp))
                            if(section.request.isNotBlank())LaunchedEffect(page.key,section.id,index/100){
                                if(cache.request(index))action(section.request,"",(index/100*100).toDouble())
                            }
                        }
                    }
                    else -> item(key=section.id) { Text(section.text,color=PageMuted,fontSize=13.sp) }
                }
                if(section.busy)item(key="${section.id}:busy") { CircularProgressIndicator(Modifier.size(22.dp),color=Color(0xFF9FE0C4),strokeWidth=2.dp) }
                if(section.more.isNotBlank()&&section.title.isBlank())item(key="${section.id}:more") { PagePill(section.moreLabel){action(section.more,"",0.0)} }
            }
        }
    }
}
@Composable private fun PagePill(text: String, enabled: Boolean=true, selected: Boolean=false, onClick:()->Unit) {
    Text(text,color=if(enabled)PageInk else PageMuted,fontSize=12.sp,modifier=Modifier.clip(RoundedCornerShape(24.dp))
        .background(if(selected)Color(0xFF285B48)else Color(0x661C342B)).clickable(enabled=enabled,onClick=onClick).padding(horizontal=14.dp,vertical=10.dp))
}
@Composable private fun NativePageRow(item: NativePageItem, action:(String)->Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color(0x77182C23))
        .clickable(enabled=!item.disabled&&item.action.isNotBlank()){action(item.action)}.padding(12.dp),verticalAlignment=Alignment.CenterVertically) {
        if(item.image.isNotBlank()) { AsyncImage(pageImage(item.image),null,Modifier.size(46.dp).clip(RoundedCornerShape(10.dp)),contentScale=ContentScale.Crop);Spacer(Modifier.width(12.dp)) }
        Column(Modifier.weight(1f)) {
            Text(item.title,color=if(item.selected)Color(0xFF9FE0C4)else PageInk.copy(alpha=if(item.disabled).45f else 1f),fontSize=14.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
            if(item.subtitle.isNotBlank())Text(item.subtitle,color=PageMuted,fontSize=11.sp,maxLines=2,overflow=TextOverflow.Ellipsis)
        }
        if(item.secondary.isNotBlank())ChromeButton(item.secondaryLabel,size=44.dp,onClick={action(item.secondary)}){Text(item.secondaryLabel,color=PageMuted,fontSize=12.sp)}
    }
}
