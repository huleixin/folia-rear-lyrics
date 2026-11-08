package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.sp

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeSettingsPage.kt
// Mirrors mobileSettings.css: 32px heading, muted 13px group labels, single grouped cards.
private val SettingIcons=mapOf("appearance" to "sparkles","general" to "languages","playback" to "play-circle",
    "interaction" to "keyboard","integration" to "server","storage" to "database","graphics" to "gauge",
    "lab" to "flask-conical","developer" to "terminal","about" to "circle-help","adaptation" to "smartphone","state" to "activity","guide" to "info",
    "coffee" to "coffee","community" to "messages-square")
private val GroupIcons=mapOf("rear" to "captions","appearance" to "sparkles","controls" to "play-circle","connections" to "database","system" to "settings2","support" to "heart")
@Composable internal fun NativeSettingsPage(page:NativePage,modifier:Modifier,action:PageAction){
    BoxWithConstraints(modifier){
        val inset=if(maxWidth<374.dp)18.dp else 22.dp
        Column(Modifier.fillMaxSize()){
            Row(Modifier.fillMaxWidth().padding(start=inset,end=inset,top=(page.safeTop+24).dp,bottom=20.dp).heightIn(min=40.dp),verticalAlignment=Alignment.CenterVertically){
                Text(page.title,color=interfaceColor(Color(0xFFE8F4ED),LightInterfaceColors.Ink),fontSize=32.sp,lineHeight=40.sp,fontWeight=FontWeight.Bold,letterSpacing=(-1.28).sp,modifier=Modifier.weight(1f))
                Box(Modifier.size(40.dp).clip(RoundedCornerShape(999.dp)).background(interfaceColor(Color(0x0B99BBA5),LightInterfaceColors.Subtle)).clickable{action(page.leading,"",0.0)},contentAlignment=Alignment.Center){PageIcon("x",PageInk,Modifier.size(23.dp))}
            }
            // 顶部滚动渐隐（Top Scroll Scrim）：设置分组卡在固定标题栏下方柔和消隐。
            val list = rememberLazyListState()
            TopScrollScrimViewport(state=list,fusion=TopScrimFusion.Gradient(page.surfaceColors()),modifier=Modifier.fillMaxSize()) {
            LazyColumn(Modifier.fillMaxSize(),state=list,contentPadding=PaddingValues(start=inset,end=inset,bottom=(24+page.safeBottom).dp)){
                page.sections.forEach{section->item(key=section.id){
                    Column(Modifier.padding(bottom=16.dp)){
                        if(section.title.isNotBlank())Row(Modifier.padding(start=2.dp,end=2.dp,bottom=8.dp).height(20.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)){
                            PageIcon(GroupIcons[section.id]?:"settings2",interfaceColor(Color(0xFFACBFB6),LightInterfaceColors.Muted),Modifier.size(16.dp))
                            Text(section.title,color=interfaceColor(Color(0xFFACBFB6),LightInterfaceColors.Muted),fontSize=NativePageDesign.SettingsGroupTitle.sp,lineHeight=20.sp)
                        }
                        if(section.id=="rear")NativeRearSettings(section,action)
                        else if(section.layout=="rows")SettingsCard{
                            section.items.forEachIndexed{index,item->
                                if(index>0)Box(Modifier.fillMaxWidth().padding(start=62.dp,end=14.dp).height(1.dp).background(interfaceColor(Color(0x0CA5CDB9),LightInterfaceColors.Divider)))
                                NativeSettingsRow(item,action=action)
                            }
                        } else Text(section.text,color=PageMuted,fontSize=12.sp)
                    }
                }}
            }
            }
        }
    }
}
@Composable private fun SettingsCard(content:@Composable ColumnScope.()->Unit){
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(interfaceColor(Color(0x3323493B),LightInterfaceColors.Card))
        .border(1.dp,interfaceColor(Color(0x1FA5CDB9),LightInterfaceColors.Border),RoundedCornerShape(14.dp)),content=content)
}
@Composable private fun NativeSettingsRow(item:NativePageItem,modifier:Modifier=Modifier,inset:Dp=14.dp,action:PageAction){
    Row(modifier.fillMaxWidth().heightIn(min=48.dp).clickable(enabled=item.action.isNotBlank()&&!item.disabled){action(item.action,"",0.0)}
        .padding(horizontal=inset,vertical=8.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)){
        Box(Modifier.size(34.dp).clip(RoundedCornerShape(999.dp)).background(interfaceColor(Color(0x0CA6D7BF),LightInterfaceColors.Subtle)),contentAlignment=Alignment.Center){PageIcon(SettingIcons[item.id]?:"settings2",interfaceColor(Color(0xFFD2E3DA),LightInterfaceColors.Icon),Modifier.size(21.dp))}
        Column(Modifier.weight(1f)){
            Text(item.title,color=interfaceColor(Color(0xFFE8F4ED),LightInterfaceColors.Ink),fontSize=NativePageDesign.SettingsRowTitle.sp,lineHeight=19.sp,fontWeight=FontWeight.Medium)
            if(item.subtitle.isNotBlank())Text(item.subtitle,color=if(item.selected)interfaceColor(Color(0xFF74D9BA),LightInterfaceColors.Accent)else interfaceColor(Color(0xFF9EB3AA),LightInterfaceColors.Muted),fontSize=11.sp,lineHeight=16.5.sp,modifier=Modifier.padding(top=2.dp))
        }
        if(item.secondary.isNotBlank())Text(item.secondaryLabel,color=interfaceColor(Color(0xFF74D9BA),LightInterfaceColors.Accent),fontSize=11.sp,modifier=Modifier.clickable{action(item.secondary,"",0.0)}.padding(vertical=10.dp))
        else if(item.action.isNotBlank())PageIcon("chevron-right",interfaceColor(Color(0xFFC7D7CE),LightInterfaceColors.Muted),Modifier.size(18.dp))
    }
}
@Composable private fun NativeRearSettings(section:NativePageSection,action:PageAction){
    val item=section.items.firstOrNull()?:return
    SettingsCard{
        Row(Modifier.fillMaxWidth().heightIn(min=68.dp).clickable(enabled=!item.disabled){action(item.action,"",0.0)}.padding(horizontal=14.dp,vertical=12.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)){
            Box(Modifier.size(34.dp).clip(RoundedCornerShape(999.dp)).background(interfaceColor(Color(0x0CA6D7BF),LightInterfaceColors.Subtle)),contentAlignment=Alignment.Center){PageIcon("captions",interfaceColor(Color(0xFFD2E3DA),LightInterfaceColors.Icon),Modifier.size(21.dp))}
            Column(Modifier.weight(1f)){
                Text(item.title,color=PageInk,fontSize=14.sp,lineHeight=20.sp,fontWeight=FontWeight.Medium)
                Text(item.subtitle,color=PageMuted,fontSize=12.sp,lineHeight=18.sp,maxLines=1,overflow=androidx.compose.ui.text.style.TextOverflow.Ellipsis)
            }
            PageIcon("chevron-right",PageMuted,Modifier.size(18.dp))
        }
    }
}
