package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.graphics.Color
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
                    Box(Modifier.fillMaxWidth().aspectRatio(1f)){
                        PageArtwork(item.image,Modifier.fillMaxSize(),16.dp)
                        if(item.secondary.isNotBlank())Box(Modifier.align(Alignment.TopEnd).padding(4.dp)){
                            ChromeButton(item.secondaryLabel.ifBlank{item.title},modifier=Modifier.background(Color.Black.copy(alpha=.64f),CircleShape),size=48.dp,onClick={action(item.secondary,"",0.0)}){PageIcon("ellipsis-vertical",Color.White,Modifier.size(18.dp))}
                        }
                    }
                    Text(item.title,color=PageInk,fontSize=15.sp,fontWeight=FontWeight.SemiBold,maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.fillMaxWidth().padding(top=7.dp))
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
    BoxWithConstraints(Modifier.fillMaxWidth().padding(vertical=8.dp)){
        val columns=(maxWidth.value/(88f*LocalDensity.current.fontScale.coerceAtLeast(1f))).toInt().coerceIn(1,4)
        Column{
        if(section.title.isNotBlank())PageSectionHeading(section,action=action)
        section.items.chunked(columns).forEach{row->
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)){
                row.forEach{item->
                    Column(Modifier.weight(1f).heightIn(min=48.dp).chromeClickable(corner=12.dp){if(!item.disabled)action(item.action,"",0.0)}.padding(vertical=8.dp),horizontalAlignment=Alignment.CenterHorizontally){
                        if(item.image.isNotBlank())PageIcon(item.image,PageAccent,Modifier.size(22.dp))
                        Text(item.title,color=if(item.disabled)PageMuted else PageInk,fontSize=13.sp,modifier=Modifier.padding(top=4.dp))
                        if(item.subtitle.isNotBlank()) Text(item.subtitle,color=PageMuted,fontSize=11.sp,maxLines=2,overflow=TextOverflow.Ellipsis)
                    }
                }
                repeat(columns-row.size){Spacer(Modifier.weight(1f))}
            }
        }
        }
    }
}
