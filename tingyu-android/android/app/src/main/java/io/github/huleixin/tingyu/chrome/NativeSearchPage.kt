package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
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

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeSearchPage.kt
// Same search field/close button, wrapping history chips and numbered two-column hot list.
@OptIn(ExperimentalLayoutApi::class)
@Composable internal fun NativeSearchPage(page:NativePage,modifier:Modifier,action:PageAction){
    val menu=page.key.startsWith("search:menu:")
    val caches=page.sections.filter{it.layout=="rows"}.associate{it.id to key(it.id){rememberNativeRows(page.key,it)}}
    Column(modifier.padding(top=page.safeTop.dp)){
        if(menu)PageHeading(page,Modifier.padding(14.dp),action=action)
        else Column(Modifier.padding(start=14.dp,end=14.dp,top=10.dp)){
            Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)){
                page.sections.firstOrNull{it.id=="query"}?.let{section->Box(Modifier.weight(1f)){NativePageInput(section,action,search=true)}}
                Box(Modifier.size(44.dp).clip(RoundedCornerShape(999.dp)).background(Color(0x08FFFFFF)).clickable{action(page.leading,"",0.0)},contentAlignment=Alignment.Center){PageIcon("x",PageInk,Modifier.size(20.dp))}
            }
            page.sections.firstOrNull{it.id=="sources"}?.let{NativeSourceTabs(it,Modifier.padding(top=10.dp,bottom=2.dp),search=true,action=action)}
            page.sections.firstOrNull{it.id=="tabs"}?.let{section->
                Row(Modifier.fillMaxWidth().padding(top=8.dp).horizontalScroll(rememberScrollState())){section.items.forEach{item->
                    Column(Modifier.widthIn(min=64.dp).clickable{action(item.action,"",0.0)},horizontalAlignment=Alignment.CenterHorizontally){
                        Box(Modifier.height(44.dp).padding(horizontal=8.dp),contentAlignment=Alignment.Center){Text(item.title,color=if(item.selected)PageAccent else PageMuted,fontSize=14.sp,fontWeight=if(item.selected)FontWeight.SemiBold else FontWeight.Normal)}
                        Box(Modifier.fillMaxWidth().height(2.dp).background(if(item.selected)PageAccent else Color.Transparent))
                    }
                }}
            }
        }
        LazyColumn(Modifier.fillMaxSize().imePadding(),contentPadding=PaddingValues(start=14.dp,end=14.dp,top=if(menu)0.dp else 16.dp,bottom=(page.safeBottom+18).dp)){
            page.sections.filter{it.id !in setOf("query","sources","tabs")}.forEach{section->
                val history=section.id=="history";val hot=section.id=="hot"
                if(section.title.isNotBlank())item(key="${section.id}:heading"){
                    Row(Modifier.fillMaxWidth().padding(top=6.dp,bottom=10.dp).heightIn(min=28.dp),verticalAlignment=Alignment.CenterVertically){
                        if(hot)PageIcon("flame",PageMuted,Modifier.padding(end=8.dp).size(19.dp))
                        Text(section.title,color=PageInk,fontSize=16.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.weight(1f))
                        if(history)ChromeButton("清空历史",size=40.dp,onClick={action(section.more,"",0.0)}){PageIcon("trash2",PageMuted,Modifier.size(17.dp))}
                        else if(!hot&&section.more.isNotBlank())Text(section.moreLabel,color=PageMuted,fontSize=12.sp,modifier=Modifier.clickable{action(section.more,"",0.0)}.padding(8.dp))
                    }
                }
                when {
                    hot -> item(key=section.id){
                        Column{
                            section.items.chunked(2).forEachIndexed{row,items->Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(12.dp)){
                                items.forEachIndexed{column,item->Row(Modifier.weight(1f).height(44.dp).clickable{action(item.action,"",0.0)},verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)){
                                    val rank=row*2+column+1
                                    Text(rank.toString(),color=if(rank<=3)PageAccent else PageMuted,fontSize=12.sp,modifier=Modifier.width(16.dp))
                                    Text(item.title,color=if(rank<=3)PageAccent else PageInk,fontSize=13.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
                                }}
                                if(items.size==1)Spacer(Modifier.weight(1f))
                            }}
                            if(section.more.isNotBlank())Box(Modifier.fillMaxWidth().padding(top=12.dp),contentAlignment=Alignment.Center){PagePill(section.moreLabel,{action(section.more,"",0.0)},height=42.dp,font=12,trailing="chevron-down")}
                        }
                    }
                    history||section.layout=="chips"&&section.id=="discovery" -> item(key=section.id){
                        FlowRow(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
                            section.items.forEach{item->
                                Row(Modifier.height(38.dp).clip(RoundedCornerShape(999.dp)).background(Color(0x08FFFFFF)).border(1.dp,Color(0x12FFFFFF),RoundedCornerShape(999.dp)),verticalAlignment=Alignment.CenterVertically){
                                    Text(item.title,color=PageInk,fontSize=13.sp,modifier=Modifier.clickable{action(item.action,"",0.0)}.padding(horizontal=12.dp))
                                    if(item.secondary.isNotBlank())Box(Modifier.width(30.dp).fillMaxHeight().clickable{action(item.secondary,"",0.0)},contentAlignment=Alignment.Center){PageIcon("x",PageMuted,Modifier.size(13.dp))}
                                }
                            }
                        }
                        Spacer(Modifier.height(20.dp));Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0x12FFFFFF)));Spacer(Modifier.height(12.dp))
                    }
                    section.layout=="rows" -> pagedNativeRows(page,section,caches.getValue(section.id),56,action)
                    section.layout=="chips" -> item(key=section.id){Column{section.items.forEach{item->
                        Row(Modifier.fillMaxWidth().height(52.dp).clickable{action(item.action,"",0.0)},verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)){
                            PageIcon("search",PageMuted,Modifier.size(17.dp));Text(item.title,color=PageInk,fontSize=14.sp)
                        }
                    }}}
                    section.text.isNotBlank() -> item(key=section.id){Text(section.text,color=PageMuted,fontSize=13.sp,modifier=Modifier.padding(vertical=12.dp))}
                }
                if(section.busy)item(key="${section.id}:busy"){CircularProgressIndicator(Modifier.padding(12.dp).size(20.dp),color=PageAccent,strokeWidth=2.dp)}
                if(section.more.isNotBlank()&&section.title.isBlank())item(key="${section.id}:more"){PagePill(section.moreLabel,{action(section.more,"",0.0)})}
            }
        }
    }
}
