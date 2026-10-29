package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeSongSubtitle.kt
internal fun catalogBadgeLimit(widthDp:Int,fontScale:Float)=if(widthDp<360||fontScale>1.3f)1 else 2
/** Static catalog metadata; no animations, image requests, playback subscriptions or extra GPU layer. */
@Composable internal fun NativeSongSubtitle(item:NativePageItem, size:Int=11, lineHeight:TextUnit=TextUnit.Unspecified, modifier:Modifier=Modifier) {
    if(item.audioSpecs.isEmpty()) {
        Text(item.subtitle,color=PageMuted,fontSize=size.sp,lineHeight=lineHeight,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=modifier)
        return
    }
    Row(modifier.fillMaxWidth().clearAndSetSemantics {
        contentDescription = listOf(item.subtitle,item.audioSpecsLabel).filter{it.isNotBlank()}.joinToString(", ")
    },verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(5.dp)) {
        Text(item.subtitle,color=PageMuted,fontSize=size.sp,lineHeight=lineHeight,maxLines=1,overflow=TextOverflow.Ellipsis,
            modifier=Modifier.weight(1f,fill=false))
        Row(Modifier.widthIn(max=100.dp),horizontalArrangement=Arrangement.spacedBy(4.dp),verticalAlignment=Alignment.CenterVertically) {
            item.audioSpecs.take(catalogBadgeLimit(LocalConfiguration.current.screenWidthDp,LocalDensity.current.fontScale)).forEach { label ->
                val shape=RoundedCornerShape(3.dp)
                Text(label,color=PageAccent.copy(alpha=.8f),fontSize=(size-2).coerceAtLeast(8).sp,lineHeight=(size+1).sp,
                    fontWeight=FontWeight.Medium,maxLines=1,softWrap=false,overflow=TextOverflow.Ellipsis,
                    modifier=Modifier.background(PageAccent.copy(alpha=.07f),shape).border(.5.dp,PageAccent.copy(alpha=.22f),shape).padding(horizontal=3.dp))
            }
        }
    }
}
