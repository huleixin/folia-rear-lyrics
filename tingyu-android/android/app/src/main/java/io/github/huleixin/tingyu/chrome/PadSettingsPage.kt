package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// Index keeps the real settings actions; only the rear-display entry is excluded on Pad.
@Composable internal fun PadSettingsPage(page:NativePage,modifier:Modifier,action:PageAction){
    val groups=page.sections.filter{it.id!="rear"}
    Column(modifier.padding(start=114.dp,end=30.dp,top=(page.safeTop+26).dp)){
        Text(page.title,color=PageInk,fontSize=32.sp,fontWeight=FontWeight.Bold)
        Spacer(Modifier.height(26.dp))
        Row(Modifier.weight(1f),horizontalArrangement=Arrangement.spacedBy(28.dp)){
            val split=(groups.size+1)/2
            listOf(groups.take(split),groups.drop(split)).forEach{column->
                LazyColumn(Modifier.weight(1f),contentPadding=PaddingValues(bottom=108.dp),verticalArrangement=Arrangement.spacedBy(22.dp)){
                    column.forEach{group->item(key=group.id){Column{
                        if(group.title.isNotBlank())Text(group.title,color=PageInk,fontSize=17.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.padding(bottom=12.dp))
                        if(group.items.isNotEmpty())SettingsCard{group.items.forEach{NativeSettingsRow(it,action=action)}}
                        else if(group.text.isNotBlank())Text(group.text,color=PageMuted)
                    }}}
                }
            }
        }
    }
}
