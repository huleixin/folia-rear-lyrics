package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeDirectoryPage.kt
// The existing library has a fixed header/filter and contiguous 68px rows, not spaced cards.
@Composable internal fun NativeDirectoryPage(page:NativePage,modifier:Modifier,action:PageAction) {
    BoxWithConstraints(modifier){
        val width=maxWidth;val wide=width>=840.dp;val library=page.key.startsWith("library:")
        val start=if(wide)if(maxHeight<=600.dp)108.dp else 116.dp else if(library&&width>=374.dp)18.dp else 16.dp
        val end=if(wide)32.dp else if(library&&width>=374.dp)18.dp else 16.dp
        val rowSections=page.sections.filter{it.layout=="rows"&&it.id!="intro"}
        val caches=rowSections.associate{it.id to key(it.id){rememberNativeRows(page.key,it)}}
        val list=rememberLazyListState();val identity=rowSections.map{it.id to it.dataKey}.toString()
        var previous by rememberSaveable { mutableStateOf(identity) }
        LaunchedEffect(identity){if(previous!=identity){list.scrollToItem(0);previous=identity}}
        Column(Modifier.fillMaxSize().padding(top=(page.safeTop+if(library)36 else 8).dp)){
            if(library){
                PageHeading(page,Modifier.padding(start=start+4.dp,end=end+4.dp,bottom=16.dp).heightIn(min=44.dp),large=true,action=action)
            } else Row(Modifier.fillMaxWidth().padding(start=start-8.dp,end=end-8.dp).height(44.dp),verticalAlignment=Alignment.CenterVertically){
                ChromeButton("返回",size=42.dp,onClick={action(page.leading,"",0.0)}){PageIcon("chevron-left",PageInk,Modifier.size(23.dp))}
                Spacer(Modifier.weight(1f))
                if(page.trailing.isNotBlank())ChromeButton("更多",size=42.dp,onClick={action(page.trailing,"",0.0)}){PageIcon("ellipsis-vertical",PageInk,Modifier.size(23.dp))}
            }
            if(library) {
                page.sections.filter{it.layout=="chips"&&it.id!="sort"}.forEach { section ->
                    NativeSourceTabs(section,Modifier.padding(start=start,end=end,bottom=12.dp),action=action)
                }
                page.sections.filter{it.layout=="message"&&it.more.isNotBlank()&&it.text.isBlank()}.forEach{section->
                    Box(Modifier.padding(start=start,end=end,bottom=8.dp)){PagePill(section.moreLabel,{action(section.more,"",0.0)})}
                }
                page.sections.firstOrNull{it.layout=="input"}?.let{section->
                    Box(Modifier.padding(start=start,end=end,bottom=14.dp)){NativePageInput(section,action)}
                }
                val sort=page.sections.firstOrNull{it.id=="sort"}
                if(sort!=null)Row(Modifier.fillMaxWidth().padding(start=start,end=end,bottom=8.dp).heightIn(min=34.dp),verticalAlignment=Alignment.CenterVertically){
                    Text(sort.title,color=PageInk,fontSize=17.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.weight(1f))
                    if(sort.items.isNotEmpty())PageSort(sort,action)
                }
            }
            LazyColumn(Modifier.fillMaxSize().imePadding(),state=list,contentPadding=PaddingValues(start=start,end=end,
                bottom=(page.bottomClearance+page.safeBottom).dp)){
                page.sections.forEach { section ->
                    when {
                        section.id=="intro" -> item(key=section.id){
                            Column(Modifier.padding(top=4.dp,bottom=13.dp)){
                                Text(page.title,color=PageInk,fontSize=27.sp,lineHeight=34.sp,fontWeight=FontWeight.Bold)
                                section.items.firstOrNull()?.let{item->Row(Modifier.fillMaxWidth().padding(top=12.dp),horizontalArrangement=Arrangement.spacedBy(20.dp),verticalAlignment=Alignment.CenterVertically){
                                    PageArtwork(item.image,Modifier.size(if(page.key.contains("artist:"))100.dp else 118.dp),12.dp)
                                    Text(item.subtitle,color=PageMuted,fontSize=13.sp,lineHeight=23.sp)
                                }}
                            }
                        }
                        section.layout=="rows" -> pagedNativeRows(page,section,caches.getValue(section.id),if(library)NativePageDesign.DirectoryRow else 62,action,chevron=library)
                        !library&&section.layout=="chips" -> item(key=section.id){NativeSourceTabs(section,Modifier.padding(bottom=12.dp),action=action)}
                        !library&&section.layout=="input" -> item(key=section.id){Box(Modifier.padding(bottom=10.dp)){NativePageInput(section,action)}}
                        section.layout=="message"&&section.text.isNotBlank() -> item(key=section.id){Text(section.text,color=PageMuted,fontSize=13.sp,modifier=Modifier.padding(vertical=20.dp,horizontal=8.dp))}
                    }
                    if(section.busy)item(key="${section.id}:busy"){CircularProgressIndicator(Modifier.padding(12.dp).size(20.dp),color=PageAccent,strokeWidth=2.dp)}
                    if(section.more.isNotBlank()&&section.text.isNotBlank())item(key="${section.id}:retry"){PagePill(section.moreLabel,{action(section.more,"",0.0)})}
                }
            }
        }
    }
}
internal fun LazyListScope.pagedNativeRows(page:NativePage,section:NativePageSection,cache:NativeRowsCache,height:Int,action:PageAction,chevron:Boolean=false){
    items(section.total,key={index->"${section.id}:${section.dataKey}:$index"}){index->
        val item=cache.get(section,index)
        if(item!=null)NativePageRow(item,height.dp,if(chevron)NativePageDesign.DirectoryArt.dp else 40.dp,if(chevron)15 else 14,if(chevron)12 else 11,divider=!chevron,chevron=chevron){action(it,"",0.0)}
        else {
            Spacer(Modifier.height(height.dp))
            if(section.request.isNotBlank())LaunchedEffect(page.key,section.id,section.dataKey,index/100){if(cache.request(index))action(section.request,"",(index/100*100).toDouble())}
        }
    }
}
@Composable internal fun NativeSourceTabs(section:NativePageSection,modifier:Modifier=Modifier,search:Boolean=false,action:PageAction){
    Row(modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(if(search)8.dp else 6.dp)){
        section.items.forEach { item ->
            val shape=RoundedCornerShape(999.dp)
            Box(Modifier.height(36.dp).clip(shape).background(if(item.selected)Color(0x2C6BC8A7)else if(search)Color(0x08FFFFFF)else Color.Transparent)
                .then(if(search)Modifier.border(1.dp,if(item.selected)Color(0x709FE0C4)else Color.Transparent,shape)else Modifier)
                .clickable(enabled=!item.disabled){action(item.action,"",0.0)}.padding(horizontal=if(search)14.dp else 18.dp),contentAlignment=Alignment.Center){
                Text(item.title,color=if(item.selected)PageAccent else PageMuted,fontSize=(if(search)13 else 14).sp)
            }
        }
    }
}
