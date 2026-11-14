package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.*
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/SettingsLayoutControls.kt
// Inline controls occupy their declared position; they never add a second title or row.
@Composable
internal fun SettingsLayoutControl(node:TySettingNode,layout:SettingsLayoutNode,controls:Map<String,TySettingNode>,theme:TyPanelTheme,
    action:PageAction,modifier:Modifier,compact:Boolean){
    val s=layout.style
    val enabled=!node.disabled
    val outer=modifier.alpha(if(enabled)1f else .45f)
    when(node.kind){
        "switch","checkbox"->InlineSettingToggle(node,theme,outer,action)
        "input"->SettingsLayoutInput(node,theme,outer,s,action)
        "select"->{
            var expanded by remember(node.id){mutableStateOf(false)}
            Box(outer){
                Row(Modifier.then(if(!compact&&s.width<=0)Modifier.fillMaxWidth() else Modifier)
                    .heightIn(min=44.dp).clip(RoundedCornerShape(if(s.radius>0)s.radius.dp else 12.dp))
                    .background(theme.card).border(1.dp,theme.line,RoundedCornerShape(12.dp))
                    .chromeClickable(enabled=enabled){action("open:${node.action}","",0.0);expanded=true}
                    .padding(horizontal=12.dp,vertical=10.dp),verticalAlignment=Alignment.CenterVertically){
                    Text(node.options.firstOrNull{it.value==node.value}?.label?:node.placeholder.ifBlank{node.value},modifier=if(compact&&s.width<=0)Modifier.widthIn(max=160.dp)else Modifier.weight(1f))
                    PageIcon("chevron-down",theme.muted,Modifier.padding(start=8.dp).size(16.dp))
                }
                SettingsOptionPopup(theme,node.title,node.options,node.value,visible=expanded,onClose={expanded=false}){value->expanded=false;action(TySettingEvent.set(node.action),value,0.0)}
            }
        }
        "slider"->Box(outer){SettingsSlider(theme,"",value=node.value.toFloatOrNull()?:node.min,min=node.min,max=node.max,step=node.step,enabled=enabled,showLabel=false){value->action(TySettingEvent.slide(node.action),"",value.toDouble())}}
        "color"->SettingsColorPad(node,outer,action)
        "preview"->SettingsLayoutPreview(node,layout,controls,theme,outer,action)
        "image"->AsyncImage(model=pageImage(node.value),contentDescription=node.title.ifBlank{null},
            modifier=outer.then(if(s.width<=0)Modifier.fillMaxWidth()else Modifier).then(if(s.height<=0)Modifier.heightIn(min=24.dp,max=240.dp)else Modifier).clip(RoundedCornerShape(s.radius.dp)))
        "reorder"->Box(outer){SettingsOrder(theme,node,action,showTitle=false)}
        else->{
            val selected=node.detail=="✓"
            val shape=RoundedCornerShape(if(s.radius>0)s.radius.dp else 10.dp)
            var button=outer.then(if(!compact&&s.width<=0)Modifier.fillMaxWidth()else Modifier)
                .heightIn(min=if(s.height>0)s.height.dp else if(s.minHeight>0)s.minHeight.dp else if(compact&&s.padding.isEmpty()&&!s.fill&&!s.border)0.dp else 36.dp).clip(shape)
            if(s.tone=="primary")button=button.background(theme.accent)
            else if(s.fill||selected)button=button.background(if(selected)theme.accent.copy(alpha=.13f)else theme.card)
            if(s.border||selected)button=button.border(1.dp,if(selected)theme.accent.copy(alpha=.65f)else theme.line,shape)
            button=button.settingsSwatch(layout.text,s.radius)
            button=button.semantics(mergeDescendants=true){contentDescription=node.title;if(selected)this.selected=true}
                .chromeClickable(enabled=enabled){action(TySettingEvent.action(node.action),"",0.0)}.layoutEdges(s.padding)
            Box(button,contentAlignment=if(s.center)Alignment.Center else Alignment.CenterStart){
                if(layout.children.isNotEmpty())Column{
                    layout.children.forEach { child->SettingsLayoutView(child,controls,theme,action,compact=true) }
                }else if(layout.text.isBlank())Text(node.title,color=if(selected)theme.accent else LocalTextStyle.current.color)
            }
        }
    }
}

@Composable
private fun InlineSettingToggle(node:TySettingNode,theme:TyPanelTheme,modifier:Modifier,action:PageAction){
    val checked=node.value=="1";val mixed=node.value=="mixed";val checkbox=node.kind=="checkbox"
    Canvas(modifier.size(if(checkbox)20.dp else 46.dp,if(checkbox)20.dp else 26.dp)
        .semantics{contentDescription=node.title;role=if(checkbox)Role.Checkbox else Role.Switch;toggleableState=if(mixed)ToggleableState.Indeterminate else if(checked)ToggleableState.On else ToggleableState.Off}
        .chromeClickable(enabled=!node.disabled,role=if(checkbox)Role.Checkbox else Role.Switch){action(TySettingEvent.set(node.action),if(checked)"0"else"1",0.0)}){
        if(checkbox){
            drawRoundRect(if(checked||mixed)theme.accent else theme.line,cornerRadius=CornerRadius(4.dp.toPx()),style=if(checked||mixed)androidx.compose.ui.graphics.drawscope.Fill else Stroke(1.5.dp.toPx()))
            if(mixed)drawLine(theme.surface,androidx.compose.ui.geometry.Offset(size.width*.25f,size.height*.5f),androidx.compose.ui.geometry.Offset(size.width*.75f,size.height*.5f),2.dp.toPx())
            if(checked){val path=androidx.compose.ui.graphics.Path().apply{moveTo(size.width*.23f,size.height*.5f);lineTo(size.width*.43f,size.height*.7f);lineTo(size.width*.78f,size.height*.3f)};drawPath(path,theme.surface,style=Stroke(2.dp.toPx()))}
        }else{
            drawRoundRect(if(checked)theme.accent.copy(alpha=.75f)else theme.muted.copy(alpha=.28f),cornerRadius=CornerRadius(size.height/2))
            val radius=size.height/2-3.dp.toPx();drawCircle(theme.knob,radius,androidx.compose.ui.geometry.Offset(if(checked)size.width-radius-3.dp.toPx()else radius+3.dp.toPx(),size.height/2))
        }
    }
}
