package io.github.huleixin.tingyu.minimal.style

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.huleixin.tingyu.chrome.*
import io.github.huleixin.tingyu.minimal.*
import io.github.huleixin.tingyu.minimal.immersive.ImmersivePlayerHost
import io.github.huleixin.tingyu.minimal.immersive.port.MeloXNowPlayingPage
import io.github.huleixin.tingyu.minimal.ui.MinimalPlayerScreen
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

// Capture the real Tingyu renderers sequentially, then dispose them. No mock UI or audio service.
@Composable
internal fun PlayerStylePreviews(runtime: MinimalPlayerRuntime, commands: MinimalPlayerCommands,
    queue: MinimalQueue, selected: PlayerStyle, enabled: Boolean, onSelect: (PlayerStyle) -> Unit,
) {
    val theme = TyPanelTheme.from(LocalInterfacePalette.current)
    val snapshot = remember { runtime.state.value }
    val artwork = remember { runtime.artwork.value }
    val images = remember { mutableStateMapOf<Pair<PlayerStyle, Int>, ImageBitmap>() }
    var page by remember { mutableIntStateOf(0) }
    var capture by remember { mutableIntStateOf(0) }
    var failure by remember { mutableStateOf(false) }
    val jobs = remember { PlayerStyle.entries.flatMap { style -> listOf(style to 0, style to 1) } }
    val passive = remember { BridgeMinimalCommands(MinimalCommandSender { _, _ -> false }) { false } }
    Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        PlayerStyle.entries.forEach { style ->
            Column(Modifier.weight(1f).clip(RoundedCornerShape(16.dp))
                .border(if (selected == style) 2.dp else 1.dp,
                    if (selected == style) theme.accent else theme.line, RoundedCornerShape(16.dp))
                .clickable(enabled = enabled) { onSelect(style) }.padding(8.dp)) {
                val bitmap = images[style to page]
                Box(Modifier.fillMaxWidth().aspectRatio(360f / 780f).clip(RoundedCornerShape(10.dp))
                    .background(theme.card), contentAlignment = Alignment.Center) {
                    if (bitmap != null) Image(bitmap, style.label + "真实预览", Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
                    else Text(if (failure) "预览生成失败" else "生成真实预览…", color = theme.muted, fontSize = 11.sp)
                }
                Spacer(Modifier.height(8.dp))
                Text((if (selected == style) "✓ " else "") + style.label, color = theme.text, fontSize = 14.sp)
                Text(style.description, color = theme.muted, fontSize = 11.sp)
            }
        }
    }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
        listOf("封面", "歌词").forEachIndexed { index, label ->
            Text(label, color = if (page == index) theme.accent else theme.muted,
                modifier = Modifier.clickable { page = index }.padding(14.dp), fontSize = 13.sp)
        }
        if (failure) Text("重试", color = theme.accent, modifier = Modifier.clickable { failure = false }.padding(14.dp))
    }
    if (capture < jobs.size && !failure) key(capture) {
        val (style, initial) = jobs[capture]
        val layer = rememberGraphicsLayer()
        var drawn by remember { mutableStateOf(false) }
        val anchor = remember { PlayerArtworkAnchor() }
        // A 1dp layout slot holds an unclipped full-size render target, never sent to the screen.
        Box(Modifier.size(1.dp)) {
            CompositionLocalProvider(LocalPlayerArtworkAnchor provides anchor,
                io.github.huleixin.tingyu.minimal.immersive.LocalImmersiveMorph provides null, LocalMinimalMorph provides null, LocalLiquidReduced provides true) {
                Box(Modifier.requiredSize(360.dp, 780.dp).drawWithContent {
                    layer.record { this@drawWithContent.drawContent() }
                    drawn = true
                }) {
                    if (style == PlayerStyle.CLASSIC) MinimalPlayerScreen(snapshot, artwork, passive, queue,
                        initialPage = initial, light = snapshot.controls.light ?: true,
                        safeTop = 24f, safeBottom = 20f, detour = true, onCollapse = {}, onOpenStage = {})
                    else ImmersivePlayerHost(snapshot, artwork, passive, queue, false, initial, {}, {}, {}, {},
                        preview = true, initialPage = if (initial == 0) MeloXNowPlayingPage.Artwork else MeloXNowPlayingPage.Lyrics)
                }
            }
        }
        LaunchedEffect(drawn) {
            if (!drawn) return@LaunchedEffect
            try {
                delay(650) // allow the actual renderer's initial layout and artwork scale to settle
                withFrameNanos { }
                images[style to initial] = layer.toImageBitmap()
                capture++
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { failure = true }
        }
    }
}
