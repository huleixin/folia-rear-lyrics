package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// NativeLibraryCards.kt: existing page protocol, lazy grids and compact library actions.
internal fun LazyListScope.libraryGridRows(page:NativePage,section:NativePageSection,cache:NativeRowsCache,columns:Int,action:PageAction){
    items((section.total+columns-1)/columns,key={"${section.id}:${section.dataKey}:grid:$it"}){row->
        Row(Modifier.fillMaxWidth().padding(bottom=16.dp),horizontalArrangement=Arrangement.spacedBy(12.dp)){
            repeat(columns){column->
                val index=row*columns+column
                val item=if(index<section.total)cache.get(section,index)else null
                if(item!=null)Column(Modifier.weight(1f).chromeClickable(corner=16.dp){action(item.action,"",0.0)}){
                    PageArtwork(item.image,Modifier.fillMaxWidth().aspectRatio(1f),16.dp)
                    Row(Modifier.fillMaxWidth().padding(top=7.dp),verticalAlignment=Alignment.CenterVertically){
                        Text(item.title,color=PageInk,fontSize=15.sp,fontWeight=FontWeight.SemiBold,maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.weight(1f))
                        if(item.secondary.isNotBlank())ChromeButton("更多",size=40.dp,onClick={action(item.secondary,"",0.0)}){PageIcon("ellipsis-vertical",PageMuted,Modifier.size(18.dp))}
                    }
                    if(item.subtitle.isNotBlank()) Text(item.subtitle,color=PageMuted,fontSize=12.sp,maxLines=2,overflow=TextOverflow.Ellipsis)
                }else{
                    Spacer(Modifier.weight(1f).aspectRatio(1f))
                    if(index<section.total&&section.request.isNotBlank())LaunchedEffect(page.key,page.session,section.dataKey,index/100){
                        if(cache.request(index,page.session))action(section.request,"",(index/100*100).toDouble())
                    }
                }
            }
        }
    }
}

@Composable internal fun LibraryQuickActions(section:NativePageSection,action:PageAction){
    Column(Modifier.fillMaxWidth().padding(vertical=8.dp)){
        if(section.title.isNotBlank())PageSectionHeading(section,action=action)
        section.items.chunked(4).forEach{row->
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)){
                row.forEach{item->
                    Column(Modifier.weight(1f).heightIn(min=48.dp).chromeClickable(corner=12.dp){if(!item.disabled)action(item.action,"",0.0)}.padding(vertical=8.dp),horizontalAlignment=Alignment.CenterHorizontally){
                        if(item.image.isNotBlank())PageIcon(item.image,PageAccent,Modifier.size(22.dp))
                        Text(item.title,color=if(item.disabled)PageMuted else PageInk,fontSize=13.sp,maxLines=2,modifier=Modifier.padding(top=4.dp))
                        if(item.subtitle.isNotBlank()) Text(item.subtitle,color=PageMuted,fontSize=11.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }
}
