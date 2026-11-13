package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

// Use the same bounded row cache and 100-item request window as the original search list.
internal fun LazyListScope.padSearchGrid(page:NativePage,section:NativePageSection,cache:NativeRowsCache,action:PageAction){
    items((section.total+1)/2,key={"${section.id}:grid:${section.dataKey}:$it"}){row->
        Row(Modifier.fillMaxWidth().padding(bottom=16.dp),horizontalArrangement=Arrangement.spacedBy(18.dp)){
            repeat(2){column->
                val index=row*2+column
                val item=if(index<section.total)cache.get(section,index)else null
                if(item!=null)PadArtworkCard(item,Modifier.weight(1f),action)
                else {
                    Spacer(Modifier.weight(1f).height(100.dp))
                    if(index<section.total&&section.request.isNotBlank())LaunchedEffect(page.session,section.id,section.dataKey,index/100){if(cache.request(index,page.session))action(section.request,"",(index/100*100).toDouble())}
                }
            }
        }
    }
}
