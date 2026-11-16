package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/DiscoveryCards.kt
// Original static vector artwork. Uses the current palette, with no bitmap or animation clock.
@Composable private fun DiscoveryArt(kind:String,modifier:Modifier) {
    val palette=LocalInterfacePalette.current
    val ink=palette.accent
    Canvas(modifier.background(Brush.linearGradient(listOf(palette.homeQuickSelected,palette.homeCard)))) {
        val w=size.width;val h=size.height
        if(kind=="time") {
            drawCircle(ink.copy(alpha=.14f),h*.37f,Offset(w*.57f,h*.46f))
            drawCircle(ink.copy(alpha=.4f),h*.27f,Offset(w*.57f,h*.46f),style=Stroke(1.5.dp.toPx()))
            drawLine(ink.copy(alpha=.6f),Offset(w*.57f,h*.46f),Offset(w*.57f,h*.26f),2.dp.toPx())
            drawLine(ink.copy(alpha=.6f),Offset(w*.57f,h*.46f),Offset(w*.7f,h*.52f),2.dp.toPx())
        } else if(kind=="style") {
            repeat(3){i->drawCircle(ink.copy(alpha=.13f+i*.04f),h*(.38f-i*.08f),Offset(w*(.36f+i*.15f),h*(.5f-i*.08f)))}
            repeat(5){i->val x=w*(.25f+i*.12f);drawLine(ink.copy(alpha=.5f),Offset(x,h*.3f),Offset(x,h*(.5f+(i%3)*.1f)),3.dp.toPx())}
        } else {
            drawCircle(ink.copy(alpha=.18f),h*.22f,Offset(w*.79f,h*.27f))
            repeat(3){i->
                val path=Path().apply{moveTo(0f,h*(.8f+i*.08f));cubicTo(w*.25f,h*(.25f+i*.1f),w*.65f,h*(1.05f-i*.1f),w,h*(.45f+i*.12f));lineTo(w,h);lineTo(0f,h);close()}
                drawPath(path,ink.copy(alpha=.08f+i*.04f))
            }
            if(kind=="explore") {
                val sail=Path().apply{moveTo(w*.52f,h*.28f);lineTo(w*.52f,h*.67f);lineTo(w*.25f,h*.67f);close()}
                drawPath(sail,ink.copy(alpha=.5f))
            }
        }
    }
}

@Composable internal fun DiscoveryHero(section:NativePageSection,modifier:Modifier=Modifier,action:PageAction) {
    val item=section.items.firstOrNull()?:return
    val palette=LocalInterfacePalette.current
    Box(modifier.fillMaxWidth().heightIn(min=136.dp).testTag("discovery-hero").clip(RoundedCornerShape(20.dp))) {
        DiscoveryArt("roam",Modifier.matchParentSize())
        // Opaque-enough text area protects contrast without flattening the brand artwork.
        Column(Modifier.fillMaxWidth().background(Brush.horizontalGradient(listOf(palette.homeCard.copy(alpha=.96f),palette.homeCard.copy(alpha=.15f)))).padding(horizontal=20.dp,vertical=14.dp)) {
            Text(item.title,color=palette.ink,fontSize=22.sp,lineHeight=28.sp,fontWeight=FontWeight.Bold)
            Text(item.subtitle,color=palette.muted,fontSize=12.sp,lineHeight=18.sp,modifier=Modifier.padding(top=4.dp))
            Row(Modifier.padding(top=8.dp).heightIn(min=44.dp).clip(RoundedCornerShape(22.dp))
                .background(palette.ink).chromeClickable(enabled=!item.disabled,corner=22.dp){action(item.action,"",0.0)}
                .padding(horizontal=16.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(7.dp)) {
                PageIcon("play",palette.surface,Modifier.size(15.dp))
                Text(item.secondaryLabel,color=palette.surface,fontSize=12.sp,fontWeight=FontWeight.SemiBold)
            }
        }
    }
}

@Composable internal fun DiscoveryRadars(section:NativePageSection,modifier:Modifier=Modifier,action:PageAction) {
    val palette=LocalInterfacePalette.current
    Row(modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(10.dp)) {
        section.items.forEach { item ->
            Column(Modifier.weight(1f).testTag("discovery-radar:"+item.id).chromeClickable(enabled=!item.disabled,corner=14.dp){action(item.action,"",0.0)}) {
                Box(Modifier.fillMaxWidth().aspectRatio(1.12f).clip(RoundedCornerShape(14.dp))) {
                    DiscoveryArt(item.id,Modifier.matchParentSize())
                    if(item.secondary.isNotBlank())Box(Modifier.align(Alignment.BottomEnd).size(44.dp)
                        .semantics{contentDescription="播放"+item.title}.chromeClickable(enabled=!item.disabled,corner=22.dp){action(item.secondary,"",0.0)},contentAlignment=Alignment.Center){
                        Box(Modifier.size(26.dp).clip(RoundedCornerShape(13.dp)).background(palette.ink),contentAlignment=Alignment.Center){PageIcon("play",palette.surface,Modifier.size(13.dp))}
                    }
                }
                Text(item.title,color=palette.ink,fontSize=14.sp,lineHeight=20.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.padding(top=8.dp))
                Text(item.subtitle,color=palette.muted,fontSize=11.sp,lineHeight=16.sp,modifier=Modifier.padding(top=2.dp))
            }
        }
    }
}

@Composable internal fun DiscoveryTextActions(section:NativePageSection,modifier:Modifier=Modifier,action:PageAction) {
    Row(modifier.fillMaxWidth(),horizontalArrangement=Arrangement.End) {
        section.items.forEach { item ->
            Row(Modifier.heightIn(min=44.dp).chromeClickable(enabled=!item.disabled){action(item.action,"",0.0)}.padding(horizontal=8.dp),
                verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(5.dp)) {
                if(item.image.isNotBlank())PageIcon(item.image,PageMuted,Modifier.size(15.dp))
                Text(item.title,color=PageMuted,fontSize=12.sp)
                PageIcon("chevron-right",PageMuted,Modifier.size(13.dp))
            }
        }
    }
}
