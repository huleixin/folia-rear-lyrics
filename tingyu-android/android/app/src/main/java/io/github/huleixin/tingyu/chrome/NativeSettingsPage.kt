package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeSettingsPage.kt
// Mirrors mobileSettings.css: 32px heading, muted 13px group labels, single grouped cards.
private val SettingIcons=mapOf("appearance" to "sparkles","general" to "languages","playback" to "play-circle",
    "interaction" to "keyboard","integration" to "server","storage" to "database","graphics" to "gauge",
    "lab" to "flask-conical","developer" to "terminal","about" to "circle-help","adaptation" to "smartphone","state" to "activity","guide" to "info")
private val GroupIcons=mapOf("rear" to "captions","appearance" to "sparkles","controls" to "play-circle","connections" to "database","system" to "settings2")
@Composable internal fun NativeSettingsPage(page:NativePage,modifier:Modifier,action:PageAction){
    BoxWithConstraints(modifier){
        val inset=if(maxWidth<374.dp)18.dp else 22.dp
        Column(Modifier.fillMaxSize()){
            Row(Modifier.fillMaxWidth().padding(start=inset,end=inset,top=(page.safeTop+24).dp,bottom=20.dp).heightIn(min=40.dp),verticalAlignment=Alignment.CenterVertically){
                Text(page.title,color=Color(0xFFE8F4ED),fontSize=32.sp,lineHeight=40.sp,fontWeight=FontWeight.Bold,letterSpacing=(-1.28).sp,modifier=Modifier.weight(1f))
                Box(Modifier.size(40.dp).clip(RoundedCornerShape(999.dp)).background(Color(0x0B99BBA5)).clickable{action(page.leading,"",0.0)},contentAlignment=Alignment.Center){PageIcon("x",PageInk,Modifier.size(23.dp))}
            }
            LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(start=inset,end=inset,bottom=(24+page.safeBottom).dp)){
                page.sections.forEach{section->item(key=section.id){
                    Column(Modifier.padding(bottom=16.dp)){
                        if(section.title.isNotBlank())Row(Modifier.padding(start=2.dp,end=2.dp,bottom=8.dp).height(20.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)){
                            PageIcon(GroupIcons[section.id]?:"settings2",Color(0xFFACBFB6),Modifier.size(16.dp))
                            Text(section.title,color=Color(0xFFACBFB6),fontSize=NativePageDesign.SettingsGroupTitle.sp,lineHeight=20.sp)
                        }
                        if(section.id=="rear")NativeRearSettings(section,action)
                        else if(section.layout=="rows")SettingsCard{
                            section.items.forEachIndexed{index,item->
                                if(index>0)Box(Modifier.fillMaxWidth().padding(start=62.dp,end=14.dp).height(1.dp).background(Color(0x0CA5CDB9)))
                                NativeSettingsRow(item,action=action)
                            }
                        } else Text(section.text,color=PageMuted,fontSize=12.sp)
                    }
                }}
            }
        }
    }
}
@Composable private fun SettingsCard(content:@Composable ColumnScope.()->Unit){
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color(0x3323493B))
        .border(1.dp,Color(0x1FA5CDB9),RoundedCornerShape(14.dp)),content=content)
}
@Composable private fun NativeSettingsRow(item:NativePageItem,modifier:Modifier=Modifier,inset:Dp=14.dp,action:PageAction){
    Row(modifier.fillMaxWidth().heightIn(min=48.dp).clickable(enabled=item.action.isNotBlank()&&!item.disabled){action(item.action,"",0.0)}
        .padding(horizontal=inset,vertical=8.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)){
        Box(Modifier.size(34.dp).clip(RoundedCornerShape(999.dp)).background(Color(0x0CA6D7BF)),contentAlignment=Alignment.Center){PageIcon(SettingIcons[item.id]?:"settings2",Color(0xFFD2E3DA),Modifier.size(21.dp))}
        Column(Modifier.weight(1f)){
            Text(item.title,color=Color(0xFFE8F4ED),fontSize=NativePageDesign.SettingsRowTitle.sp,lineHeight=19.sp,fontWeight=FontWeight.Medium)
            if(item.subtitle.isNotBlank())Text(item.subtitle,color=if(item.selected)Color(0xFF74D9BA)else Color(0xFF9EB3AA),fontSize=11.sp,lineHeight=16.5.sp,modifier=Modifier.padding(top=2.dp))
        }
        if(item.secondary.isNotBlank())Text(item.secondaryLabel,color=Color(0xFF74D9BA),fontSize=11.sp,modifier=Modifier.clickable{action(item.secondary,"",0.0)}.padding(vertical=10.dp))
        else if(item.action.isNotBlank())PageIcon("chevron-right",Color(0xFFC7D7CE),Modifier.size(18.dp))
    }
}
@Composable private fun NativeRearSettings(section:NativePageSection,action:PageAction){
    val toggle=section.items.firstOrNull{it.id=="toggle"}
    SettingsCard{
        Column(Modifier.padding(start=14.dp,end=14.dp,top=14.dp)){
            if(toggle!=null)Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(4.dp))){
                if(section.image.isNotBlank())AsyncImage(pageImage(section.image),null,
                    Modifier.align(Alignment.BottomEnd).offset(x=14.dp,y=12.dp).width(170.dp).graphicsLayer{alpha=.75f},contentScale=ContentScale.FillWidth)
                Row(Modifier.fillMaxWidth().padding(start=3.dp,end=3.dp,bottom=10.dp),verticalAlignment=Alignment.Top,horizontalArrangement=Arrangement.spacedBy(12.dp)){
                    Column(Modifier.weight(1f)){
                        Text(toggle.title,color=PageInk,fontSize=15.sp,lineHeight=22.5.sp,fontWeight=FontWeight.SemiBold)
                        Text(toggle.subtitle,color=Color(0xFF9EB3AA),fontSize=12.sp,lineHeight=19.8.sp,modifier=Modifier.padding(top=4.dp))
                    }
                    Row(Modifier.clip(RoundedCornerShape(12.dp)).background(Color(0xFF2D684F)).border(1.dp,Color(0x1A7FC2A5),RoundedCornerShape(12.dp))
                        .clickable(enabled=!toggle.disabled){action(toggle.action,"",0.0)}.padding(horizontal=9.dp,vertical=7.dp),verticalAlignment=Alignment.CenterVertically){
                        Text(toggle.secondaryLabel,color=Color(0xFFE0F8ED),fontSize=12.sp,fontWeight=FontWeight.Medium)
                        PageIcon("chevron-right",PageInk,Modifier.size(16.dp))
                    }
                }
            }
            section.items.filter{it.id in setOf("adaptation","state")}.forEach{item->
                if(item.id=="adaptation")Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0x1FA5CDB9)))
                NativeSettingsRow(item,inset=2.dp,action=action)
            }
            if(section.text.isNotBlank())Text(section.text,color=PageMuted,fontSize=11.sp,lineHeight=17.6.sp,modifier=Modifier.padding(top=4.dp,bottom=10.dp))
            section.items.firstOrNull{it.id=="mode"}?.let{item->
                var expanded by remember { mutableStateOf(false) }
                Row(Modifier.fillMaxWidth().padding(top=16.dp),verticalAlignment=Alignment.CenterVertically){
                    Text(item.title,color=PageInk,fontSize=14.sp,modifier=Modifier.weight(1f))
                    Box{
                        Row(Modifier.clip(RoundedCornerShape(8.dp)).background(Color(0x1A000000)).clickable(enabled=!item.disabled){expanded=true}.padding(8.dp),verticalAlignment=Alignment.CenterVertically){
                            Text(item.subtitle,color=PageInk.copy(alpha=if(item.disabled).45f else 1f),fontSize=13.sp)
                            PageIcon("chevron-down",PageMuted,Modifier.padding(start=5.dp).size(14.dp))
                        }
                        DropdownMenu(expanded,{expanded=false}){listOf("shizuku" to "Shizuku","lsp" to "LSP / LSPosed").forEach{(id,label)->
                            DropdownMenuItem(text={Text(label,fontSize=13.sp)},onClick={expanded=false;action("backend:$id","",0.0)})
                        }}
                    }
                }
            }
            section.items.firstOrNull{it.id=="switchHint"}?.let{Text(it.subtitle,color=PageMuted,fontSize=12.sp,lineHeight=19.2.sp,modifier=Modifier.padding(top=8.dp))}
            section.items.firstOrNull{it.id=="backendHelp"}?.let{item->
                var open by remember{mutableStateOf(false)}
                Row(Modifier.fillMaxWidth().heightIn(min=40.dp).clickable{open=!open},verticalAlignment=Alignment.CenterVertically){
                    Text(item.title,color=PageMuted,fontSize=12.sp,modifier=Modifier.weight(1f));PageIcon("chevron-down",PageMuted,Modifier.size(14.dp))
                }
                if(open)Text(item.subtitle,color=PageMuted,fontSize=12.sp,lineHeight=19.2.sp,modifier=Modifier.padding(bottom=12.dp))
            }
            section.items.firstOrNull{it.id=="guide"}?.let{item->
                Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0x1FA5CDB9)))
                NativeSettingsRow(item,inset=2.dp,action=action)
            }
        }
    }
}
