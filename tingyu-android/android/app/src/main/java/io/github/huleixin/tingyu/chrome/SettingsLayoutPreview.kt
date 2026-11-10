package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/SettingsLayoutPreview.kt
// Keep the renderer, original preview height and native controls in their overlay positions.
@Composable
internal fun SettingsLayoutPreview(node:TySettingNode,layout:SettingsLayoutNode,controls:Map<String,TySettingNode>,theme:TyPanelTheme,
    modifier:Modifier,action:PageAction){
    val density=LocalDensity.current
    val screen=with(density){LocalSettingsPreviewViewport.current.bottom.toDp().value}
    val height=when(layout.style.preview){"stage"->(screen*.32f).coerceIn(180f,300f);"theme"->(screen*.46f).coerceIn(300f,460f);"offset"->132f;else->240f}
    Box(modifier.fillMaxWidth().height(height.dp).clip(RoundedCornerShape(28.dp))){
        SettingsPreview(node.copy(min=height),action)
        layout.children.forEach { child->controls[child.ref]?.let { control->
            val area=when(child.style.overlay){
                "background"->Modifier.fillMaxWidth().padding(horizontal=16.dp).padding(top=16.dp).height((height*.2f).dp).align(Alignment.TopCenter)
                "visualizer"->Modifier.fillMaxWidth(.8f).padding(top=(height*.28f).dp).height((height*.48f).dp).align(Alignment.TopCenter)
                "subtitle"->Modifier.fillMaxWidth().padding(horizontal=16.dp).padding(bottom=24.dp).height((height*.18f).dp).align(Alignment.BottomCenter)
                "theme-pause"->Modifier.align(Alignment.TopEnd).padding(16.dp).size(40.dp)
                else->Modifier.align(Alignment.BottomEnd).padding(16.dp).size(40.dp)
            }
            val hotspot=child.style.overlay in setOf("background","visualizer","subtitle")
            val shape=RoundedCornerShape(if(hotspot)24.dp else 999.dp)
            Box(area.clip(shape).then(if(!hotspot)Modifier.background(Color.Black.copy(alpha=.45f)).border(1.dp,Color.White.copy(alpha=.15f),shape)else Modifier)
                .semantics{contentDescription=control.title}.chromeClickable(enabled=!control.disabled){action(TySettingEvent.action(control.action),"",0.0)},contentAlignment=Alignment.Center){
                if(!hotspot){
                    fun icon(n:SettingsLayoutNode):String?=if(n.kind=="icon")n.icon else n.children.firstNotNullOfOrNull{icon(it)}
                    PageIcon(icon(child)?:"pause",Color.White,Modifier.size(17.dp))
                }
            }
        } }
    }
}
