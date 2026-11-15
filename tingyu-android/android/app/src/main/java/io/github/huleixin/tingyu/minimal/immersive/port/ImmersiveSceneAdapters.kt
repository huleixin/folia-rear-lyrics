package io.github.huleixin.tingyu.minimal.immersive.port

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.interaction.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.platform.*
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.*
import com.kyant.backdrop.Backdrop
import com.kyant.backdrop.drawBackdrop
import com.kyant.backdrop.effects.blur
import com.kyant.backdrop.effects.vibrancy
import io.github.huleixin.tingyu.chrome.PageIcon
import io.github.huleixin.tingyu.chrome.pageIconPaths
import io.github.huleixin.tingyu.minimal.immersive.MeloXPlaybackUiState

// SPDX-License-Identifier: GPL-3.0-only
// Scene geometry, glass and button springs adapted from MeloX Android 0.7.3,
// c04f36b9af540806b3bb185b347572e9ca12d87d. Tingyu uses existing Lucide icons
// and business commands instead of SF Symbols, provider menus or output discovery.

internal enum class MeloXNowPlayingPage { Artwork, Lyrics, Queue }
internal val LocalImmersiveBackdrop = staticCompositionLocalOf<Backdrop?> { null }
internal fun Modifier.meloXPlayerStatusBarsPadding() = statusBarsPadding()
internal fun Modifier.meloXPlayerNavigationBarsPadding() = navigationBarsPadding()
internal fun Modifier.meloXPlayerDisplayCutoutPadding() = displayCutoutPadding()
internal fun Modifier.meloXIconDrawingScale() = this // Upstream drawing scale is 1f.
internal fun meloXContentEnter() = fadeIn(tween(320, easing = FastOutSlowInEasing))
internal fun meloXContentExit() = fadeOut(tween(240, easing = FastOutSlowInEasing))
internal fun meloXPlayerTweenDurationMillis() = 460
internal fun sceneFormatDuration(ms: Long): String =
    (ms.coerceAtLeast(0) / 60_000).toString() + ":" + (ms.coerceAtLeast(0) / 1000 % 60).toString().padStart(2, '0')

@Composable
internal fun Modifier.meloXBackdropBlur(shape: Shape, blurRadius: Dp = 20.dp, surfaceColor: Color = Color.Transparent): Modifier {
    val backdrop = LocalImmersiveBackdrop.current
    if (blurRadius <= 0.dp || backdrop == null) return background(surfaceColor, shape)
    return drawBackdrop(backdrop, shape = { shape }, effects = { blur(blurRadius.toPx()) },
        highlight = null, shadow = null, innerShadow = null,
        onDrawSurface = { if (surfaceColor != Color.Transparent) drawRect(surfaceColor) })
}

@Composable
private fun Modifier.scenePageDisc(surfaceColor: Color, hole: Path?): Modifier {
    val backdrop = LocalImmersiveBackdrop.current
    if (backdrop == null) return background(surfaceColor, CircleShape)
    return drawBackdrop(backdrop, shape = { CircleShape }, effects = { vibrancy(); blur(6.dp.toPx()) },
        highlight = null, shadow = null, innerShadow = null,
        onDrawSurface = {
            if (hole != null) clipPath(hole, ClipOp.Difference) { drawRect(surfaceColor) }
            else drawRect(surfaceColor)
        })
}

@Composable
internal fun MeloXPlaybackTitleMenu(
    state: MeloXPlaybackUiState, onOpenQueue: () -> Unit, modifier: Modifier = Modifier,
    titleSize: TextUnit = 20.sp, titleLineHeight: TextUnit = 24.sp,
    artistSize: TextUnit = 18.sp, artistLineHeight: TextUnit = 22.sp,
    showHeartModeLabel: Boolean = false, horizontalPadding: Dp = 0.dp,
) {
    Column(modifier.fillMaxWidth().padding(horizontal = horizontalPadding)) {
        Text(state.title, color = Color.White, fontSize = titleSize, lineHeight = titleLineHeight,
            fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(state.artist, Modifier.clickable(enabled = LocalMeloXPlayerControlsEnabled.current && state.commands?.available == true) { state.commands?.openArtist(-1) },
            color = Color.White.copy(alpha = .64f), fontSize = artistSize, lineHeight = artistLineHeight,
            maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
internal fun ScenePageSelector(
    state: MeloXPlaybackUiState, page: MeloXNowPlayingPage,
    onPageSelected: (MeloXNowPlayingPage) -> Unit, compact: Boolean = false,
    useVectorGlyphs: Boolean = compact, modifier: Modifier = Modifier,
) {
    Row(modifier.fillMaxWidth().height(if (compact) 42.dp else 50.dp)
        .padding(horizontal = if (compact) MeloXCompactPageSelectorHPadding else 32.dp),
        horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        ScenePageButton(SceneGlyphKind.Lyrics, page == MeloXNowPlayingPage.Lyrics, true, compact) { onPageSelected(MeloXNowPlayingPage.Lyrics) }
        ScenePageButton(SceneGlyphKind.Stage, false, state.commands?.available == true, compact) { state.openStage() }
        Box {
            ScenePageButton(SceneGlyphKind.Queue, page == MeloXNowPlayingPage.Queue, true, compact) { onPageSelected(MeloXNowPlayingPage.Queue) }
            if (page != MeloXNowPlayingPage.Queue && state.controls.mode in listOf("all", "one", "shuffle")) {
                val badgeSize = (if (compact) 18.dp else 20.dp) * .9025f
                Box(Modifier.align(Alignment.TopEnd).offset(1.5.dp, (-1.5).dp).size(badgeSize)
                    .clip(CircleShape).background(Color.Black.copy(alpha = .42f)), contentAlignment = Alignment.Center) {
                    PlaybackModeGlyph(state.controls.mode, Modifier.size(badgeSize * .72f), Color.White.copy(alpha = .92f))
                }
            }
        }
    }
}

@Composable
private fun ScenePageButton(kind: SceneGlyphKind, selected: Boolean, enabled: Boolean, compact: Boolean, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val pressScale by animateFloatAsState(if (pressed) .86f else 1f,
        spring(Spring.DampingRatioMediumBouncy, 650f), label = "scene-page-press")
    val selectionScale by animateFloatAsState(if (selected) 1.04f else 1f,
        spring(Spring.DampingRatioMediumBouncy, Spring.StiffnessMedium), label = "scene-page-selected")
    val buttonSize = if (compact) 40.dp else 48.dp
    val glyphSize = if (compact) 18.dp else 22.dp
    val discSize = buttonSize * .8f
    val context = LocalContext.current
    val density = LocalDensity.current
    val icon = when (kind) { SceneGlyphKind.Lyrics -> "captions"; SceneGlyphKind.Stage -> "monitor-play"; else -> "list" }
    val haptic = meloXHaptic()
    val hole = remember(context, density, icon, glyphSize, discSize) {
        val stroke = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
            style = android.graphics.Paint.Style.STROKE; strokeWidth = 2f
            strokeCap = android.graphics.Paint.Cap.ROUND; strokeJoin = android.graphics.Paint.Join.ROUND
        }
        val combined = android.graphics.Path()
        pageIconPaths(context, icon).forEach { p ->
            val filled = android.graphics.Path(); stroke.getFillPath(p, filled); combined.addPath(filled)
        }
        val glyphPx = with(density) { glyphSize.toPx() }
        val discPx = with(density) { discSize.toPx() }
        val matrix = android.graphics.Matrix().apply { setScale(glyphPx / 24f, glyphPx / 24f); postTranslate((discPx - glyphPx) / 2, (discPx - glyphPx) / 2) }
        combined.transform(matrix); combined.asComposePath()
    }
    Box(Modifier.size(buttonSize).graphicsLayer { scaleX = pressScale * selectionScale; scaleY = scaleX }
        .clip(CircleShape).semantics {
            contentDescription = when (kind) { SceneGlyphKind.Lyrics -> "歌词"; SceneGlyphKind.Stage -> "歌词舞台"; else -> "播放队列" }
            this.selected = selected
        }.clickable(enabled = enabled && LocalMeloXPlayerControlsEnabled.current, interactionSource = interaction, indication = null) { meloXSelectionHaptic(haptic); onClick() }, contentAlignment = Alignment.Center) {
        if (selected) Box(Modifier.size(discSize).scenePageDisc(Color.White.copy(alpha = .88f), hole))
        else PageIcon(icon, Color.White.copy(alpha = if (enabled) .88f else .35f), Modifier.size(glyphSize))
    }
}

/** Independently authored standard repeat/shuffle geometry; no extracted SF paths. */
@Composable
internal fun PlaybackModeGlyph(mode: String, modifier: Modifier, color: Color) {
    Box(modifier, contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val p = Path()
            fun point(x: Float, y: Float) = androidx.compose.ui.geometry.Offset(size.width*x, size.height*y)
            fun line(ax: Float, ay: Float, bx: Float, by: Float) = drawLine(color, point(ax,ay),point(bx,by),size.minDimension*.085f,StrokeCap.Round)
            if (mode == "shuffle") {
                line(.12f,.22f,.88f,.78f); line(.12f,.78f,.88f,.22f)
                line(.68f,.2f,.88f,.22f); line(.88f,.22f,.86f,.42f)
                line(.68f,.8f,.88f,.78f); line(.88f,.78f,.86f,.58f)
            } else {
                p.moveTo(size.width*.78f,size.height*.25f); p.lineTo(size.width*.27f,size.height*.25f)
                p.cubicTo(0f,size.height*.25f,0f,size.height*.75f,size.width*.27f,size.height*.75f)
                p.lineTo(size.width*.73f,size.height*.75f)
                p.cubicTo(size.width,size.height*.75f,size.width,size.height*.25f,size.width*.73f,size.height*.25f)
                drawPath(p,color,style=androidx.compose.ui.graphics.drawscope.Stroke(size.minDimension*.075f,cap=StrokeCap.Round))
                line(.64f,.1f,.8f,.25f); line(.8f,.25f,.64f,.4f)
            }
        }
        if (mode == "one") Text("1", color = color, fontSize = 8.sp, fontWeight = FontWeight.Bold)
    }
}
