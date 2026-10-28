package io.github.huleixin.tingyu.chrome

import android.net.Uri
import android.util.Base64
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import androidx.compose.ui.platform.LocalContext

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePageWidgets.kt
internal val PageInk = Color(0xFFF4F7F5)
internal val PageMuted = Color(0xFFA2B6AC)
internal val PageAccent = Color(0xFF9FE0C4)
@Composable internal fun pageImage(url: String): Any? {
    val context=LocalContext.current
    return remember(url,context) {
    if (url.startsWith("data:image") && url.contains(',')) runCatching {
        ImageRequest.Builder(context).data(Base64.decode(url.substringAfter(','), Base64.DEFAULT))
            .memoryCacheKey(url).crossfade(false).build()
    }.getOrNull()
    else {
        val uri = runCatching { Uri.parse(url) }.getOrNull()
        if (uri?.host in setOf("localhost", "rear.folia.local") && uri?.path?.startsWith("/assets/") == true)
            "file:///android_asset/public${uri.path}"
        else if(uri?.host in setOf("localhost","rear.folia.local")&&uri?.path=="/api/lyric-proxy")uri.getQueryParameter("url")?:url
        else url
    }
}
}
@Composable internal fun PageArtwork(url: String, modifier: Modifier, radius: Dp = 9.dp) {
    Box(modifier.clip(RoundedCornerShape(radius)).background(Color(0xFF14211E)), contentAlignment = Alignment.Center) {
        if (url.isBlank()) PageIcon("music2", PageMuted, Modifier.size(21.dp))
        else AsyncImage(pageImage(url), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
    }
}
@Composable internal fun PagePill(text: String, onClick: () -> Unit, selected: Boolean = false, enabled: Boolean = true,
    height: Dp = 30.dp, font: Int = 11, trailing: String = "", border: Boolean = true) {
    val shape = RoundedCornerShape(999.dp)
    Row(Modifier.heightIn(min=height).clip(shape)
        .background(if (selected) Color(0x2E9FE0C4) else Color(0x08FFFFFF))
        .then(if(border) Modifier.border(1.dp, if(selected) Color(0x709FE0C4) else Color(0x18FFFFFF), shape) else Modifier)
        .clickable(enabled=enabled,onClick=onClick).padding(horizontal=10.dp), verticalAlignment=Alignment.CenterVertically,
        horizontalArrangement=Arrangement.spacedBy(3.dp)) {
        Text(text, color=if(selected)PageAccent else PageInk.copy(alpha=if(enabled).85f else .45f),fontSize=font.sp,maxLines=1)
        if(trailing.isNotBlank())PageIcon(trailing,PageMuted,Modifier.size(15.dp))
    }
}
@Composable internal fun PageHeading(page:NativePage, modifier:Modifier=Modifier, large:Boolean=false, action:PageAction) {
    Row(modifier.fillMaxWidth(),verticalAlignment=Alignment.Top) {
        if(page.leading.isNotBlank())ChromeButton("返回",size=40.dp,onClick={action(page.leading,"",0.0)}){PageIcon("chevron-left",PageInk,Modifier.size(24.dp))}
        Column(Modifier.weight(1f).padding(top=6.dp)) {
            Text(page.title,color=PageInk,fontSize=(if(large)32 else 27).sp,lineHeight=34.sp,fontWeight=FontWeight.Bold,letterSpacing=(-1).sp)
            if(page.subtitle.isNotBlank())Text(page.subtitle,color=Color(0xFFB5C3BD),fontSize=14.sp,lineHeight=19.sp,modifier=Modifier.padding(top=5.dp))
        }
        if(page.trailing.isNotBlank())Box(Modifier.padding(top=9.dp)){
            PagePill(page.trailingLabel,{action(page.trailing,"",0.0)},height=34.dp,trailing=if(page.id=="home")"chevron-down"else"",font=11)
        }
    }
}
@Composable internal fun PageSectionHeading(section:NativePageSection,modifier:Modifier=Modifier,action:PageAction) {
    Row(modifier.fillMaxWidth().heightIn(min=30.dp),verticalAlignment=Alignment.CenterVertically) {
        Text(section.title,color=PageInk,fontSize=16.sp,lineHeight=21.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.weight(1f))
        if(section.more.isNotBlank())PagePill(section.moreLabel,{action(section.more,"",0.0)},trailing="chevron-right")
    }
}
@Composable internal fun PageSort(section:NativePageSection,action:PageAction) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        Row(Modifier.heightIn(min=34.dp).clickable{expanded=true},verticalAlignment=Alignment.CenterVertically) {
            Text(section.items.firstOrNull{it.selected}?.title?:"",color=Color(0xFFB4C9BF),fontSize=12.sp)
            PageIcon("chevron-down",PageMuted,Modifier.padding(start=3.dp).size(14.dp))
        }
        DropdownMenu(expanded,{expanded=false}) { section.items.forEach { item ->
            DropdownMenuItem(text={Text(item.title,fontSize=12.sp)},onClick={expanded=false;action(item.action,"",0.0)})
        } }
    }
}
@Composable internal fun NativePageRow(item:NativePageItem, height:Dp=68.dp, art:Dp=56.dp, titleSize:Int=15,
    subtitleSize:Int=12, divider:Boolean=false, chevron:Boolean=false, action:(String)->Unit) {
    Row(Modifier.fillMaxWidth().height(height).clickable(enabled=!item.disabled&&item.action.isNotBlank()){action(item.action)},
        verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(if(art==56.dp)13.dp else 10.dp)) {
        if(item.image.isNotBlank()||chevron)PageArtwork(item.image,Modifier.size(art),if(art==56.dp)11.dp else 7.dp)
        Column(Modifier.weight(1f)) {
            Text(item.title,color=if(item.selected)PageAccent else PageInk.copy(alpha=if(item.disabled).45f else 1f),fontSize=titleSize.sp,lineHeight=(titleSize*1.4).sp,
                fontWeight=FontWeight.Medium,maxLines=1,overflow=TextOverflow.Ellipsis)
            if(item.subtitle.isNotBlank())Text(item.subtitle,color=PageMuted,fontSize=subtitleSize.sp,lineHeight=(subtitleSize*1.5).sp,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=2.dp))
        }
        if(item.secondary.isNotBlank())ChromeButton("更多",size=36.dp,onClick={action(item.secondary)}){PageIcon("ellipsis-vertical",PageMuted,Modifier.size(18.dp))}
        else if(chevron)PageIcon("chevron-right",PageMuted,Modifier.size(16.dp))
    }
    if(divider)Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0x0EFFFFFF)))
}
