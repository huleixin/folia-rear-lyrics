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
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
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
    val bottomClearance=with(LocalDensity.current){LocalNativePageBottomPx.current.toDp()}
    BoxWithConstraints(modifier){
        val inset=if(maxWidth<374.dp)18.dp else 22.dp
        // 沉浸式毛玻璃顶栏（TopGlassBar）：设置分组卡全幅滚动进入固定标题栏玻璃后方。
        val colors=page.surfaceColors()
        val glass=rememberTyTopGlassState(estimateHeaderBottomDp=page.safeTop+84f)
        Box(Modifier.fillMaxSize()){
            TyTopGlassContentLayer(glass,colors,ambientImage=null,ambientViewportHeight=null,modifier=Modifier.fillMaxSize()){
            val list = rememberLazyListState()
            LazyColumn(Modifier.fillMaxSize(),state=list,contentPadding=PaddingValues(start=inset,end=inset,top=glass.contentTop,bottom=maxOf((24+page.safeBottom).dp,bottomClearance))){
                page.sections.forEach{section->item(key=section.id){
                    Column(Modifier.padding(bottom=16.dp)){
                        if(section.title.isNotBlank())Row(Modifier.padding(start=2.dp,end=2.dp,bottom=8.dp).height(20.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)){
                            PageIcon(GroupIcons[section.id]?:"settings2",LocalInterfacePalette.current.settingsGroup,Modifier.size(16.dp))
                            Text(section.title,color=LocalInterfacePalette.current.settingsGroup,fontSize=NativePageDesign.SettingsGroupTitle.sp,lineHeight=20.sp)
                        }
                        if(section.id=="rear")NativeRearSettings(section,action)
                        else if(section.layout=="rows")SettingsCard{
                            section.items.forEachIndexed{index,item->
                                if(index>0)Box(Modifier.fillMaxWidth().padding(start=62.dp,end=14.dp).height(1.dp).background(LocalInterfacePalette.current.settingsDivider))
                                NativeSettingsRow(item,action=action)
                            }
                        } else Text(section.text,color=PageMuted,fontSize=12.sp)
                    }
                }}
            }
            }
            TyTopGlassSurface(glass,colors)
            // 设置一级页由系统返回/底栏导航退出；顶栏只保留标题。
            TyTopGlassForeground {
                Row(Modifier.fillMaxWidth().padding(start=inset,end=inset,top=(page.safeTop+24).dp,bottom=20.dp).heightIn(min=40.dp)
                    .onGloballyPositioned{glass.reportHeader(it.positionInWindow().y,it.size.height)},verticalAlignment=Alignment.CenterVertically){
                    Text(page.title,color=topGlassForegroundColor(LocalInterfacePalette.current.settingsInk,LocalInterfacePalette.current.topInk),fontSize=32.sp,lineHeight=40.sp,fontWeight=FontWeight.Bold,letterSpacing=(-1.28).sp,modifier=Modifier.weight(1f))
                }
            }
        }
    }
}
@Composable private fun SettingsCard(content:@Composable ColumnScope.()->Unit){
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(LocalInterfacePalette.current.card)
        .border(1.dp,LocalInterfacePalette.current.border,RoundedCornerShape(14.dp)),content=content)
}
@Composable private fun NativeSettingsRow(item:NativePageItem,modifier:Modifier=Modifier,inset:Dp=14.dp,action:PageAction){
    Row(modifier.fillMaxWidth().heightIn(min=48.dp).chromeClickable(enabled=item.action.isNotBlank()&&!item.disabled,corner=12.dp){action(item.action,"",0.0)}
        .padding(horizontal=inset,vertical=8.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)){
        Box(Modifier.size(34.dp).clip(RoundedCornerShape(999.dp)).background(LocalInterfacePalette.current.settingsIconSurface),contentAlignment=Alignment.Center){PageIcon(SettingIcons[item.id]?:"settings2",LocalInterfacePalette.current.settingsIcon,Modifier.size(21.dp))}
        Column(Modifier.weight(1f)){
            Text(item.title,color=LocalInterfacePalette.current.settingsInk,fontSize=NativePageDesign.SettingsRowTitle.sp,lineHeight=19.sp,fontWeight=FontWeight.Medium)
            if(item.subtitle.isNotBlank())Text(item.subtitle,color=if(item.selected)LocalInterfacePalette.current.settingsAccentSurface else LocalInterfacePalette.current.settingsMuted,fontSize=11.sp,lineHeight=16.5.sp,modifier=Modifier.padding(top=2.dp))
        }
        if(item.secondary.isNotBlank())Text(item.secondaryLabel,color=LocalInterfacePalette.current.settingsAccentSurface,fontSize=11.sp,modifier=Modifier.chromeClickable(corner=8.dp){action(item.secondary,"",0.0)}.padding(vertical=10.dp))
        else if(item.action.isNotBlank())PageIcon("chevron-right",LocalInterfacePalette.current.settingsChevron,Modifier.size(18.dp))
    }
}
@Composable private fun NativeRearSettings(section:NativePageSection,action:PageAction){
    val item=section.items.firstOrNull()?:return
    SettingsCard{
        Row(Modifier.fillMaxWidth().heightIn(min=68.dp).chromeClickable(enabled=!item.disabled,corner=12.dp){action(item.action,"",0.0)}.padding(horizontal=14.dp,vertical=12.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)){
            Box(Modifier.size(34.dp).clip(RoundedCornerShape(999.dp)).background(LocalInterfacePalette.current.settingsIconSurface),contentAlignment=Alignment.Center){PageIcon("captions",LocalInterfacePalette.current.settingsIcon,Modifier.size(21.dp))}
            Column(Modifier.weight(1f)){
                Text(item.title,color=PageInk,fontSize=14.sp,lineHeight=20.sp,fontWeight=FontWeight.Medium)
                Text(item.subtitle,color=PageMuted,fontSize=12.sp,lineHeight=18.sp,maxLines=1,overflow=androidx.compose.ui.text.style.TextOverflow.Ellipsis)
            }
            PageIcon("chevron-right",PageMuted,Modifier.size(18.dp))
        }
    }
}
