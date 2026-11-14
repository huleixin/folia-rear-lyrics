package io.github.huleixin.tingyu.chrome

import android.net.Uri
import android.util.Base64
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
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
internal val PageInk:Color @Composable get()=topGlassForegroundColor(LocalInterfacePalette.current.ink,LocalInterfacePalette.current.topInk)
internal val PageMuted:Color @Composable get()=topGlassForegroundColor(LocalInterfacePalette.current.muted,LocalInterfacePalette.current.topMuted)
internal val PageAccent:Color @Composable get()=topGlassForegroundColor(LocalInterfacePalette.current.accent,LocalInterfacePalette.current.topAccent)
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
        else if(uri?.host in setOf("localhost","rear.folia.local")&&uri?.path=="/api/lyric-proxy") {
            val remote=uri.getQueryParameter("url")?:url
            if(io.github.huleixin.tingyu.playback.SharedArtworkAccess.imageRequestUrl(remote))
                ImageRequest.Builder(context).data(io.github.huleixin.tingyu.playback.SharedArtworkAccess.contentUri(context,remote))
                    .diskCachePolicy(coil.request.CachePolicy.DISABLED).crossfade(false).build()
            else remote
        }
        else if(io.github.huleixin.tingyu.playback.SharedArtworkAccess.imageRequestUrl(url))
            ImageRequest.Builder(context).data(io.github.huleixin.tingyu.playback.SharedArtworkAccess.contentUri(context,url))
                .diskCachePolicy(coil.request.CachePolicy.DISABLED).crossfade(false).build()
        else url
    }
    .let { data ->
        if(data is String)ImageRequest.Builder(context).data(data)
            .memoryCacheKey(data).diskCacheKey(data).placeholderMemoryCacheKey(data).crossfade(false).build()
        else data
    }
}
}
@Composable internal fun PageArtwork(url: String, modifier: Modifier, radius: Dp = 9.dp, sharedAction: String = "", contentScale: ContentScale = ContentScale.Crop) {
    // 启动期封面模型会翻一次面（Web 管理地址在缩略图就绪前发的是空串，就绪后才是 data:）。
    // Coil 一换模型就清空重解 —— 深色页面上一帧空图，肉眼看就是「卡片闪一下」
    // （23:29 录屏逐帧：两张亮色封面只消失一帧）。这里记住最近一个非空地址：
    // 空串回落到它，封面绝不因模型翻面而消失；真正的换图（不同 URL）照常更新。
    var lastKnown by remember { mutableStateOf("") }
    val effective = if (url.isBlank()) lastKnown else url
    SideEffect { if (url.isNotBlank() && url != lastKnown) lastKnown = url }
    Box(modifier.liquidCover(sharedAction,radius).background(LocalInterfacePalette.current.surface), contentAlignment = Alignment.Center) {
        if (effective.isBlank()) PageIcon("music2", PageMuted, Modifier.size(21.dp))
        else AsyncImage(pageImage(effective), null, Modifier.fillMaxSize(), contentScale = contentScale)
    }
}
@Composable internal fun PagePill(text: String, onClick: () -> Unit, selected: Boolean = false, enabled: Boolean = true,
    height: Dp = 30.dp, font: Int = 11, trailing: String = "", border: Boolean = true, leading: String = "") {
    val shape = RoundedCornerShape(999.dp)
    Row(Modifier.heightIn(min=height).clip(shape)
        .background(if (selected) LocalInterfacePalette.current.selected else LocalInterfacePalette.current.subtle)
        .then(if(border) Modifier.border(1.dp, if(selected) LocalInterfacePalette.current.selectedBorder else LocalInterfacePalette.current.chipBorder, shape) else Modifier)
        .clickable(enabled=enabled,onClick=onClick).padding(horizontal=10.dp), verticalAlignment=Alignment.CenterVertically,
        horizontalArrangement=Arrangement.spacedBy(3.dp)) {
        // leading：本地音源选择器要求「设备图标 + 名称 + 下拉箭头」，online 来源不带图标照旧。
        if(leading.isNotBlank())PageIcon(leading,PageInk.copy(alpha=.9f),Modifier.size(15.dp))
        Text(text, color=if(selected)PageAccent else PageInk.copy(alpha=if(!enabled).45f else if(LocalTopGlassForeground.current&&LocalInterfacePalette.current.light)1f else .85f),fontSize=font.sp,maxLines=1)
        if(trailing.isNotBlank())PageIcon(trailing,PageMuted,Modifier.size(15.dp))
    }
}
@Composable internal fun PageHeading(page:NativePage, modifier:Modifier=Modifier, large:Boolean=false, action:PageAction) {
    Row(modifier.fillMaxWidth(),verticalAlignment=Alignment.Top) {
        if(page.leading.isNotBlank())ChromeButton("返回",size=40.dp,onClick={action(page.leading,"",0.0)}){PageIcon("chevron-left",PageInk,Modifier.size(24.dp))}
        Column(Modifier.weight(1f).padding(top=6.dp)) {
            Text(page.title,color=PageInk,fontSize=(if(large)32 else 27).sp,lineHeight=34.sp,fontWeight=FontWeight.Bold,letterSpacing=(-1).sp)
            if(page.subtitle.isNotBlank())Text(page.subtitle,color=topGlassForegroundColor(LocalInterfacePalette.current.headerSubtitle,LocalInterfacePalette.current.topMuted),fontSize=14.sp,lineHeight=19.sp,modifier=Modifier.padding(top=5.dp))
        }
        if(page.trailing.isNotBlank())Box(Modifier.padding(top=9.dp)){
            PagePill(page.trailingLabel,{action(page.trailing,"",0.0)},height=34.dp,trailing=if(page.id=="home")"chevron-down"else"",font=11,
                leading=if(page.id=="home")page.trailingIcon else "")
        }
    }
}
@Composable internal fun PageSectionHeading(section:NativePageSection,modifier:Modifier=Modifier,action:PageAction,titleSize:Int=16) {
    Row(modifier.fillMaxWidth().heightIn(min=30.dp),verticalAlignment=Alignment.CenterVertically) {
        Text(section.title,color=PageInk,fontSize=titleSize.sp,lineHeight=(titleSize+5).sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.weight(1f))
        if(section.more.isNotBlank())PagePill(section.moreLabel,{action(section.more,"",0.0)},trailing="chevron-right")
    }
}
@Composable internal fun PageSort(section:NativePageSection,action:PageAction) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        Row(Modifier.heightIn(min=34.dp).chromeClickable(corner=10.dp){expanded=true},verticalAlignment=Alignment.CenterVertically) {
            Text(section.items.firstOrNull{it.selected}?.title?:"",color=LocalInterfacePalette.current.selectionLabel,fontSize=12.sp)
            PageIcon("chevron-down",PageMuted,Modifier.padding(start=3.dp).size(14.dp))
        }
        LiquidDropdown(expanded,{expanded=false}) { section.items.forEach { item ->
            // The menu surface is the same cream in every theme; page ink disappears on it in dark mode.
            DropdownMenuItem(text={Text(item.title,color=LocalInterfacePalette.current.menuInk,fontSize=12.sp)},onClick={expanded=false;action(item.action,"",0.0)})
        } }
    }
}
@Composable internal fun NativePageRow(item:NativePageItem, height:Dp=68.dp, art:Dp=56.dp, titleSize:Int=15,
    subtitleSize:Int=12, divider:Boolean=false, chevron:Boolean=false, playing:Boolean=false, alwaysArt:Boolean=false, pending:Boolean=false, action:(String)->Unit) {
    // 歌单/资料库/搜索的歌曲行：以前是整行 clickable + 系统 ripple，长按就在标题副标题上
    // 压出一块方角灰底。改成自绘圆角 tint（14dp），关掉 ripple。
    val pressSource=rememberPressSource()
    val coverSource=rememberCoverSource(item.action,if(art>=50.dp)11.dp else 7.dp)
    Row(Modifier.fillMaxWidth().height(height)
            .chromeRowPressed(pressSource)
            .clickable(interactionSource=pressSource,indication=null,enabled=!item.disabled&&item.action.isNotBlank()){coverSource.select();action(item.action)},
        verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(if(art>=50.dp)13.dp else 10.dp)) {
        // alwaysArt：资料库歌曲行固定占位（无封面歌也保持同一布局）；当前播放行在封面上
        // 叠加轻量标识：播放中=均衡器动画，暂停=静止暂停符；标题色由 selected 走 PageAccent。
        if(item.image.isNotBlank()||chevron||alwaysArt)Box(Modifier.size(art)){
            PageArtwork(item.image,Modifier.size(art),if(art>=50.dp)11.dp else 7.dp,sharedAction=if(item.action.startsWith("open:")||item.action.startsWith("playlist:")||item.action.startsWith("album:"))coverSource.key else "")
            if(pending)Box(Modifier.fillMaxSize(),contentAlignment=Alignment.Center){
                androidx.compose.material3.CircularProgressIndicator(Modifier.size(20.dp),color=PageAccent,strokeWidth=2.dp)
            }else if(item.selected)Box(Modifier.fillMaxSize().background(Color(0x52000000)),contentAlignment=Alignment.Center){NowPlayingBadge(playing)}
        }
        Column(Modifier.weight(1f)) {
            Text(item.title,color=if(item.selected)PageAccent else PageInk.copy(alpha=if(item.disabled).45f else 1f),fontSize=titleSize.sp,lineHeight=(titleSize*1.4).sp,
                fontWeight=FontWeight.Medium,maxLines=1,overflow=TextOverflow.Ellipsis)
            if(item.subtitle.isNotBlank()||item.audioSpecs.isNotEmpty())NativeSongSubtitle(item,size=subtitleSize,lineHeight=(subtitleSize*1.5).sp,modifier=Modifier.padding(top=2.dp))
        }
        if(item.duration.isNotBlank())Text(item.duration,color=PageMuted,fontSize=12.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
        if(item.secondary.isNotBlank())ChromeButton("更多",size=36.dp,onClick={action(item.secondary)}){PageIcon("ellipsis-vertical",PageMuted,Modifier.size(18.dp))}
        else if(chevron)PageIcon("chevron-right",PageMuted,Modifier.size(16.dp))
    }
    if(divider)Box(Modifier.fillMaxWidth().height(1.dp).background(LocalInterfacePalette.current.divider))
}
/** 当前播放封面标识：播放中=三根轻量均衡器条（青绿强调色），暂停=静止暂停符。 */
@Composable private fun NowPlayingBadge(playing:Boolean){
    if(!playing||LocalLiquidReduced.current){ChromeGlyph(if(playing)"play"else"pause",Color.White,Modifier.size(13.dp));return}
    val transition=rememberInfiniteTransition(label="now-playing-eq")
    val bars=List(3){index->transition.animateFloat(0f,1f,infiniteRepeatable(tween(420+index*90,easing=LinearEasing),RepeatMode.Reverse),label="eq-$index")}
    Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(2.dp)){
        bars.forEachIndexed{index,bar->
            val value by bar
            Box(Modifier.size(3.dp,(5f+6f*value).dp).clip(RoundedCornerShape(1.5.dp)).background(LocalInterfacePalette.current.nowPlayingAccent))
        }
    }
}
