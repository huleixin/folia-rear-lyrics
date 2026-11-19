package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import java.io.File

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/DiscoveryCards.kt
// 听屿漫游与专属雷达正式艺术素材接入：本地 WebP 加载，严格保持原图配色与指定文字/按钮对比度。

private object DiscoveryCardColors {
    val RoamTitle = Color(0xFF203747)
    val RoamSubtitle = Color(0xFF49677D)
    val RoamButtonBg = Color(0xFF203F59)
    val RoamButtonFg = Color(0xFFFFFFFF)
    val RadarPlayBg = Color(0xCC203747) // #203747 @ 80%
}

private fun discoveryAssetFileName(kind: String): String = when (kind) {
    "roam" -> "roaming.webp"
    "style" -> "radar-style.webp"
    "time" -> "radar-time.webp"
    "explore" -> "radar-explore.webp"
    else -> "radar-explore.webp"
}

@Composable
internal fun DiscoveryAssetImage(
    kind: String,
    modifier: Modifier = Modifier,
    alignment: Alignment = Alignment.Center,
) {
    val context = LocalContext.current
    val fileName = discoveryAssetFileName(kind)
    val request = remember(fileName, context) {
        val assetPath = "public/assets/discovery/$fileName"
        val hasAsset = runCatching { context.assets.open(assetPath).close(); true }.getOrDefault(false)
        val data: Any = if (hasAsset) {
            "file:///android_asset/$assetPath"
        } else {
            val local = File("public/assets/discovery/$fileName")
            if (local.exists()) local else "file:///android_asset/$assetPath"
        }
        ImageRequest.Builder(context)
            .data(data)
            .memoryCacheKey("discovery:$fileName")
            .crossfade(false)
            .build()
    }
    AsyncImage(
        model = request,
        contentDescription = null,
        modifier = modifier,
        alignment = alignment,
        contentScale = ContentScale.Crop
    )
}

@Composable
internal fun DiscoveryHero(section: NativePageSection, modifier: Modifier = Modifier, action: PageAction) {
    val item = section.items.firstOrNull() ?: return
    Box(
        modifier
            .fillMaxWidth()
            .height(148.dp)
            .testTag("discovery-hero")
            .clip(RoundedCornerShape(20.dp))
            .clickable(enabled = !item.disabled) { action(item.action, "", 0.0) }
    ) {
        DiscoveryAssetImage("roam", Modifier.matchParentSize())
        // 仅在左侧增加极轻的透明浅色渐变保障深色文字可读性，不改变右侧风景主体
        Box(
            Modifier
                .matchParentSize()
                .background(
                    Brush.horizontalGradient(
                        0.0f to Color(0x66F2F8FC),
                        0.45f to Color(0x28F2F8FC),
                        0.72f to Color.Transparent
                    )
                )
        )
        Column(
            Modifier
                .fillMaxSize()
                .padding(20.dp),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            Column(Modifier.fillMaxWidth(0.64f)) {
                Text(
                    item.title,
                    color = DiscoveryCardColors.RoamTitle,
                    fontSize = 23.sp,
                    lineHeight = 29.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    item.subtitle,
                    color = DiscoveryCardColors.RoamSubtitle,
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 6.dp)
                )
            }
            Row(
                Modifier
                    .height(40.dp)
                    .clip(RoundedCornerShape(20.dp))
                    .background(
                        if (item.disabled) DiscoveryCardColors.RoamButtonBg.copy(alpha = 0.55f)
                        else DiscoveryCardColors.RoamButtonBg
                    )
                    .chromeClickable(enabled = !item.disabled, corner = 20.dp) { action(item.action, "", 0.0) }
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(7.dp)
            ) {
                PageIcon("play", DiscoveryCardColors.RoamButtonFg, Modifier.size(16.dp))
                Text(
                    item.secondaryLabel,
                    color = DiscoveryCardColors.RoamButtonFg,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

@Composable
internal fun DiscoveryRadars(section: NativePageSection, modifier: Modifier = Modifier, action: PageAction) {
    val palette = LocalInterfacePalette.current
    val window = LocalPadWindow.current
    val wideRadar = window.tablet && window.landscape
    val cropAlignment = remember(wideRadar) {
        if (wideRadar) BiasAlignment(0f, 0.16f) else Alignment.Center
    }
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(if (window.tablet) 14.dp else 10.dp)) {
        section.items.forEach { item ->
            val canPlay = item.secondary.isNotBlank() && !item.disabled
            Column(
                Modifier
                    .weight(1f)
                    .testTag("discovery-radar:" + item.id)
                    .chromeClickable(enabled = !item.disabled, role = Role.Button, corner = 14.dp, scaleTo = 0.985f) { action(item.action, "", 0.0) }
            ) {
                // Compute explicit height before clipping so capped 2:1 / 1:1 covers never overflow onto text below.
                BoxWithConstraints(Modifier.fillMaxWidth()) {
                    val coverHeight = when {
                        wideRadar -> minOf(maxWidth / 2f, 160.dp)
                        window.tablet -> minOf(maxWidth, 212.dp)
                        else -> maxWidth
                    }
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .height(coverHeight)
                            .testTag("discovery-radar-cover:" + item.id)
                            .clip(RoundedCornerShape(14.dp))
                    ) {
                        DiscoveryAssetImage(item.id, Modifier.fillMaxSize(), alignment = cropAlignment)
                        // 右下角 32dp 播放按钮（距右/底 8dp），触区 48dp；无全图蒙层，保持原图真实色彩与对比度
                        Box(
                            Modifier
                                .align(Alignment.BottomEnd)
                                .size(48.dp)
                                .then(
                                    if (canPlay) {
                                        Modifier
                                            .semantics { contentDescription = "播放" + item.title }
                                            .clickable(
                                                interactionSource = remember { MutableInteractionSource() },
                                                indication = null,
                                                role = Role.Button
                                            ) { action(item.secondary, "", 0.0) }
                                    } else Modifier
                                )
                                .padding(end = 8.dp, bottom = 8.dp),
                            contentAlignment = Alignment.BottomEnd
                        ) {
                            Box(
                                Modifier
                                    .size(32.dp)
                                    .clip(CircleShape)
                                    .background(
                                        if (canPlay) DiscoveryCardColors.RadarPlayBg
                                        else DiscoveryCardColors.RadarPlayBg.copy(alpha = 0.42f)
                                    ),
                                contentAlignment = Alignment.Center
                            ) {
                                PageIcon("play", Color.White.copy(alpha = if (canPlay) 1f else 0.55f), Modifier.size(14.dp))
                            }
                        }
                    }
                }
                Text(
                    item.title,
                    color = palette.ink,
                    fontSize = 14.sp,
                    lineHeight = 19.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 10.dp)
                )
                Text(
                    item.subtitle,
                    color = palette.muted,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
        }
    }
}

@Composable
internal fun DiscoveryTextActions(section: NativePageSection, modifier: Modifier = Modifier, action: PageAction) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
        section.items.forEach { item ->
            Row(
                Modifier
                    .heightIn(min = 48.dp)
                    .chromeClickable(enabled = !item.disabled) { action(item.action, "", 0.0) }
                    .padding(horizontal = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp)
            ) {
                if (item.image.isNotBlank()) PageIcon(item.image, PageMuted, Modifier.size(15.dp))
                Text(item.title, color = PageMuted, fontSize = 12.sp)
                PageIcon("chevron-right", PageMuted, Modifier.size(13.dp))
            }
        }
    }
}
