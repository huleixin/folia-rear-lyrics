package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeRearControlPage.kt
// Presentation-only: state and capability decisions come from the shared React page model.
@Composable internal fun NativeRearControlPage(page:NativePage,modifier:Modifier,fontScale:Float,action:PageAction){
    val density=LocalDensity.current
    CompositionLocalProvider(LocalDensity provides Density(density.density,fontScale)){
        BoxWithConstraints(modifier){
            val inset=if(maxWidth<374.dp)18.dp else 22.dp
            // 沉浸式毛玻璃顶栏（TopGlassBar）：背屏控制分组全幅滚动进入固定返回栏玻璃后方。
            val colors=page.surfaceColors()
            val glass=rememberTyTopGlassState(estimateHeaderBottomDp=page.safeTop+84f)
            Box(Modifier.fillMaxSize()){
                TyTopGlassContentLayer(glass,colors,ambientImage=null,ambientViewportHeight=null,modifier=Modifier.fillMaxSize()){
                val list = rememberLazyListState()
                LazyColumn(Modifier.fillMaxSize(),state=list,contentPadding=PaddingValues(start=inset,end=inset,top=glass.contentTop,bottom=(24+page.safeBottom).dp),verticalArrangement=Arrangement.spacedBy(16.dp)){
                    page.sections.forEach{section->item(key=section.id){
                        Column{
                            if(section.title.isNotBlank())Text(section.title,color=PageMuted,fontSize=13.sp,lineHeight=20.sp,modifier=Modifier.padding(start=2.dp,bottom=8.dp))
                            when(section.layout){
                                "message"->Text(section.text,color=PageMuted,fontSize=12.sp,lineHeight=19.sp,modifier=Modifier.padding(horizontal=2.dp))
                                "chips"->RearChoices(section,action)
                                else->Column(Modifier.fillMaxWidth().rearCard()){
                                    section.items.forEachIndexed{index,item->
                                        if(index>0)Box(Modifier.fillMaxWidth().padding(horizontal=14.dp).height(1.dp).background(interfaceColor(Color(0x1FA5CDB9),LightInterfaceColors.Divider)))
                                        RearControlRow(item,action)
                                    }
                                }
                            }
                            if(section.layout!="message"&&section.text.isNotBlank())Text(section.text,color=PageMuted,fontSize=12.sp,lineHeight=19.sp,modifier=Modifier.padding(start=2.dp,end=2.dp,top=8.dp))
                        }
                    }}
                }
                }
                TyTopGlassSurface(glass,colors)
                // 顶栏内容（清晰层）：返回按钮 + 标题，绘制在玻璃之上。
                Row(Modifier.fillMaxWidth().padding(start=inset,end=inset,top=(page.safeTop+24).dp,bottom=20.dp)
                    .onGloballyPositioned{glass.reportHeader(it.positionInWindow().y,it.size.height)},verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)){
                    Box(Modifier.size(40.dp).clip(RoundedCornerShape(999.dp)).semantics{contentDescription=page.trailingLabel}.clickable{action(page.leading,"",0.0)},contentAlignment=Alignment.Center){PageIcon("chevron-left",PageInk,Modifier.size(24.dp))}
                    Text(page.title,color=PageInk,fontSize=22.sp,lineHeight=28.sp,fontWeight=FontWeight.Bold,modifier=Modifier.weight(1f))
                }
            }
        }
    }
}
@Composable private fun Modifier.rearCard()=clip(RoundedCornerShape(14.dp)).background(interfaceColor(Color(0x3323493B),LightInterfaceColors.Card))
    .border(1.dp,interfaceColor(Color(0x1FA5CDB9),LightInterfaceColors.Border),RoundedCornerShape(14.dp))
@Composable private fun RearChoices(section:NativePageSection,action:PageAction){
    Row(Modifier.fillMaxWidth().rearCard().padding(4.dp),horizontalArrangement=Arrangement.spacedBy(4.dp)){
        section.items.forEach{item->
            Box(Modifier.weight(1f).heightIn(min=42.dp).clip(RoundedCornerShape(10.dp))
                .background(if(item.selected)interfaceColor(Color(0x1A74D9BA),LightInterfaceColors.Selected)else Color.Transparent)
                .border(1.dp,if(item.selected)interfaceColor(Color(0x4074D9BA),LightInterfaceColors.SelectedBorder)else Color.Transparent,RoundedCornerShape(10.dp))
                .semantics{selected=item.selected;role=Role.RadioButton;if(item.disabled)disabled()}
                .clickable(enabled=!item.disabled){action(item.action,"",0.0)}.padding(horizontal=6.dp,vertical=9.dp),contentAlignment=Alignment.Center){
                Text(item.title,color=if(item.selected)interfaceColor(Color(0xFF74D9BA),LightInterfaceColors.Ink)else PageInk,fontSize=13.sp,lineHeight=19.sp,fontWeight=if(item.selected)FontWeight.SemiBold else FontWeight.Normal,textAlign=androidx.compose.ui.text.style.TextAlign.Center)
            }
        }
    }
}
@Composable private fun RearControlRow(item:NativePageItem,action:PageAction){
    val toggle=item.id in setOf("toggle","cover-sleep")
    Row(Modifier.fillMaxWidth().heightIn(min=52.dp).then(if(!toggle&&item.action.isNotBlank())Modifier.chromeClickable(enabled=!item.disabled,corner=12.dp){action(item.action,"",0.0)}else Modifier)
        .padding(horizontal=14.dp,vertical=10.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)){
        Column(Modifier.weight(1f)){
            Text(item.title,color=PageInk,fontSize=14.sp,lineHeight=21.sp,fontWeight=FontWeight.Medium)
            if((toggle||item.action.isNotBlank())&&item.subtitle.isNotBlank())Text(item.subtitle,color=PageMuted,fontSize=12.sp,lineHeight=18.sp,modifier=Modifier.padding(top=2.dp))
        }
        when{
            toggle->Switch(checked=item.selected,onCheckedChange={action(item.action,"",0.0)},enabled=!item.disabled,
                modifier=Modifier.semantics{contentDescription=item.title},colors=SwitchDefaults.colors(checkedTrackColor=interfaceColor(Color(0xFF74D9BA),LightInterfaceColors.Accent),checkedThumbColor=interfaceColor(Color(0xFF103327),LightInterfaceColors.Sheet),uncheckedTrackColor=interfaceColor(Color(0xFF40584D),LightInterfaceColors.Surface),uncheckedThumbColor=PageMuted,uncheckedBorderColor=PageMuted))
            item.action.isNotBlank()->PageIcon("chevron-right",PageMuted,Modifier.size(18.dp))
            else->Text(item.subtitle,color=PageMuted,fontSize=13.sp,lineHeight=19.sp,textAlign=androidx.compose.ui.text.style.TextAlign.End,modifier=Modifier.weight(1f))
        }
    }
}
