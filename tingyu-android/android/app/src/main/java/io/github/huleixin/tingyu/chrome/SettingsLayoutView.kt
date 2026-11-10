package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.graphics.Color

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/SettingsLayoutView.kt
// Page-declared hierarchy replaces the flattened list. There are no inferred groups,
// automatic dividers or duplicated control labels: every row/card/grid belongs to its page.
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun SettingsLayoutView(node: SettingsLayoutNode, controls: Map<String,TySettingNode>, theme: TyPanelTheme,
    action: PageAction, modifier: Modifier = Modifier, compact: Boolean = false) {
    val s=node.style
    val viewport=with(LocalDensity.current){LocalSettingsPreviewViewport.current.width.toDp().value}
    val containerKind=if(s.stackBelow>0&&viewport<s.stackBelow)"column"else node.kind
    var outer=modifier.testTag("settings-layout:${node.id}").layoutEdges(s.margin)
    if(s.width>0)outer=outer.width(s.width.dp)
    if(s.height>0)outer=outer.height(s.height.dp)
    if(s.minHeight>0)outer=outer.heightIn(min=s.minHeight.dp)
    if(s.aspect>0)outer=outer.aspectRatio(s.aspect)
    val textStyle=LocalTextStyle.current.merge(TextStyle(
        color=when(s.tone){"muted"->theme.muted;"accent"->theme.accent;"danger"->theme.danger;else->Color.Unspecified},
        fontSize=if(s.font>0)s.font.sp else androidx.compose.ui.unit.TextUnit.Unspecified,
        lineHeight=if(s.font>0)(s.font*1.45f).sp else androidx.compose.ui.unit.TextUnit.Unspecified,
        fontWeight=if(s.weight>0)FontWeight(s.weight) else null,textAlign=if(s.center)TextAlign.Center else TextAlign.Unspecified))
    CompositionLocalProvider(LocalTextStyle provides textStyle) {
        when(node.kind){
            "vector"->SettingsLayoutArt(node,theme,outer.fillMaxWidth())
            "break"->Spacer(outer.fillMaxWidth().height(0.dp))
            "text"->Text(node.text,modifier=outer.layoutEdges(s.padding))
            "icon"->PageIcon(node.icon,if(s.tone=="accent")theme.accent else if(s.tone=="muted")theme.muted else theme.text,
                outer.size(if(s.width>0)s.width.dp else 16.dp,if(s.height>0)s.height.dp else 16.dp))
            "control"->controls[node.ref]?.let { SettingsLayoutControl(it,node,controls,theme,action,outer,compact) }
            "spacer"->if(s.progress>=0f)Canvas(outer.fillMaxWidth().clip(RoundedCornerShape(s.radius.dp))){
                drawRect(theme.line);drawRect(theme.accent,size=androidx.compose.ui.geometry.Size(size.width*s.progress,size.height))
            }else Spacer(outer.settingsSwatch(node.text,s.radius))
            else->{
                if(!compact&&s.width<=0)outer=outer.fillMaxWidth()
                val shape=RoundedCornerShape(if(s.radius>0)s.radius.dp else if(node.kind=="card"||node.kind=="segment")14.dp else 0.dp)
                if(node.kind=="card"||node.kind=="segment"||s.fill)outer=outer.clip(shape).background(if(node.kind=="segment")theme.line.copy(alpha=.4f) else theme.card)
                if(s.border)outer=outer.border(1.dp,theme.line,shape)
                if(s.divider)outer=outer.drawBehind { drawLine(theme.line, androidx.compose.ui.geometry.Offset(0f,size.height), androidx.compose.ui.geometry.Offset(size.width,size.height), 1.dp.toPx()) }
                outer=outer.layoutEdges(s.padding)
                when(containerKind){
                    "row","segment"->Row(outer,horizontalArrangement=if(s.align=="between")Arrangement.SpaceBetween else Arrangement.spacedBy(s.gap.dp,
                        if(s.center)Alignment.CenterHorizontally else if(s.align=="end")Alignment.End else Alignment.Start),
                        verticalAlignment=if(s.align=="start")Alignment.Top else Alignment.CenterVertically){
                        node.children.forEach { child->key(child.id){SettingsLayoutView(child,controls,theme,action,
                            if(child.style.grow||node.kind=="segment")Modifier.weight(1f) else Modifier,true)} }
                    }
                    "wrap"->FlowRow(outer,horizontalArrangement=Arrangement.spacedBy(s.gap.dp,if(s.center)Alignment.CenterHorizontally else Alignment.Start),verticalArrangement=Arrangement.spacedBy(s.gap.dp)){
                        node.children.forEach { child->key(child.id){SettingsLayoutView(child,controls,theme,action,compact=true)} }
                    }
                    "grid"->BoxWithConstraints(outer){
                        val columns=if(s.wideColumns>0&&maxWidth>=s.breakpoint.dp)s.wideColumns else s.columns
                        Column(verticalArrangement=Arrangement.spacedBy(s.gap.dp)){
                            node.children.chunked(columns).forEach { row->Row(horizontalArrangement=Arrangement.spacedBy(s.gap.dp)){
                                row.forEach { child->key(child.id){SettingsLayoutView(child,controls,theme,action,Modifier.weight(1f))} }
                                repeat(columns-row.size){Spacer(Modifier.weight(1f))}
                            } }
                        }
                    }
                    else->Column(outer,verticalArrangement=Arrangement.spacedBy(s.gap.dp),horizontalAlignment=if(s.center)Alignment.CenterHorizontally else Alignment.Start){
                        node.children.forEach { child->key(child.id){SettingsLayoutView(child,controls,theme,action)} }
                    }
                }
            }
        }
    }
}

internal fun Modifier.layoutEdges(edges:List<Float>):Modifier = if(edges.size==4)padding(start=edges[0].dp,top=edges[1].dp,end=edges[2].dp,bottom=edges[3].dp) else this
