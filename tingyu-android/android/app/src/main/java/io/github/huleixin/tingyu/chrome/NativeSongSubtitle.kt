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
import io.github.huleixin.tingyu.minimal.ui.MinimalQualityBadge
import io.github.huleixin.tingyu.minimal.ui.QualityBadgeSize
import io.github.huleixin.tingyu.minimal.ui.QualityLevel

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
            // 全局音质标签（目录语境：这首歌有什么版本）。页模型里的 spec 名（hires/lossless/…）
            // 映射为标签层级后交给统一组件；映射不出来的（dts 等）不画 —— 不再使用旧 PageAccent 灰签。
            item.audioSpecs.take(catalogBadgeLimit(LocalConfiguration.current.screenWidthDp,LocalDensity.current.fontScale)).forEach { label ->
                QualityLevel.fromCatalogSpec(label)?.let { level ->
                    MinimalQualityBadge(level, QualityBadgeSize.COMPACT)
                }
            }
        }
    }
}
