package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// NativeListeningBars.kt: bounded, static statistics using the current page theme.
@Composable internal fun NativeListeningBars(section: NativePageSection, action: PageAction) {
    Column(Modifier.fillMaxWidth().padding(vertical=12.dp)) {
        PageSectionHeading(section, action=action)
        section.items.take(31).forEach { item ->
            val fraction = item.number.toFloatOrNull()?.takeIf { it.isFinite() }?.coerceIn(0f,1f) ?: 0f
            Column(Modifier.fillMaxWidth().padding(vertical=5.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement=Arrangement.spacedBy(12.dp)) {
                    Text(item.title,color=PageInk,fontSize=12.sp,modifier=Modifier.weight(1f))
                    Text(item.subtitle,color=PageMuted,fontSize=12.sp)
                }
                Box(Modifier.fillMaxWidth().padding(top=4.dp).height(5.dp).clip(RoundedCornerShape(3.dp)).background(PageAccent.copy(alpha=.12f))) {
                    Box(Modifier.fillMaxWidth(fraction).fillMaxHeight().background(PageAccent))
                }
            }
        }
        if(section.items.isEmpty())Text("暂无有效记录",color=PageMuted,fontSize=13.sp)
    }
}
