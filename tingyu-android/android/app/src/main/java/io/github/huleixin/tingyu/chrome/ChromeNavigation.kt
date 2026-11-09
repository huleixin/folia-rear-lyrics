package io.github.huleixin.tingyu.chrome

import android.graphics.drawable.BitmapDrawable
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.BasicText
import androidx.compose.material3.LocalTextStyle
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kyant.backdrop.Backdrop
import com.kyant.backdrop.backdrops.layerBackdrop
import com.kyant.backdrop.backdrops.rememberCombinedBackdrop
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import io.github.huleixin.tingyu.glass.GlassNavIcons
import kotlin.math.abs

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/ChromeNavigation.kt
// Adapted from LiquidBottomTabs/LiquidBottomTab, Kyant0/AndroidLiquidGlass, Apache-2.0.
// Copyright (c) Kyant0. Tingyu adaptation keeps four original slots, all dimensions and
// glass material parameters. Tab taps and drag commit once; external routes never emit taps.
@Composable fun ChromeNavigation(s: ChromeSurface, backdrop: Backdrop, modifier: Modifier, action: (String, Double) -> Unit) {
    val ink = chromeColor(s.ink); val accent = chromeColor(s.accent)
    val spec = ChromeGlassPresets.active()
    val radius = if (s.vertical) 28.dp else 32.dp
    val scope = rememberCoroutineScope()
    val motion = remember { LiquidNavMotion(scope, s.selected) }
    val latest by rememberUpdatedState(s)
    val latestAction by rememberUpdatedState(action)
    val highlight = remember { LiquidNavHighlight() }
    // Export the existing bar instead of drawing a second invisible copy of its blur/lens.
    val tabsBackdrop = rememberLayerBackdrop()
    val iconsBackdrop = rememberLayerBackdrop()
    val pillBackdrop = rememberCombinedBackdrop(tabsBackdrop, iconsBackdrop)
    LaunchedEffect(s.selected, s.reducedMotion) { if (s.selected >= 0) motion.select(s.selected, s.reducedMotion) }
    LaunchedEffect(s.disabled) { if (s.disabled) motion.cancel(s.selected, s.reducedMotion) }
    BoxWithConstraints(modifier) {
        // Paint/export first, so the very first capsule frame already has a valid backdrop.
        Box(Modifier.matchParentSize().chromeGlass(backdrop, s.light, radius, spec, ChromeGlassPresets.NavFill,
            pressPoint = { if (motion.pressProgress > .001f) motion.pointer else null }, exportedBackdrop = tabsBackdrop))
        BoxWithConstraints(Modifier.fillMaxSize().padding(4.dp)) {
        val density = LocalDensity.current
        val extent = with(density) { (if (s.vertical) maxHeight else maxWidth).toPx() } / 4f
        val touch = Modifier.liquidNavGestures(motion, s.vertical, extent, s.disabled, s.reducedMotion,
            selected = { latest.selected }, action = { name, value -> latestAction(name, value) })
        val items: @Composable () -> Unit = {
            repeat(4) { index ->
                val context = LocalContext.current; val px = with(density) { 23.dp.roundToPx() }
                val name = listOf("recommend", "library", "search", "settings")[index]
                // Rasterize once per theme/size. Color and press scale are read at draw time.
                val bitmap = remember(index, s.light, px) { (GlassNavIcons.load(context, name, false, s.light, px) as BitmapDrawable).bitmap.asImageBitmap() }
                val muted = if (s.light) LightInterfaceColors.Muted else ink.copy(alpha = .82f)
                val source = remember { MutableInteractionSource() }
                val active = motion.targetIndex == index && s.selected >= 0
                fun weight() = if (latest.selected < 0) 0f else (1f - abs(motion.value - index)).coerceIn(0f, 1f)
                Column(Modifier.then(if (s.vertical) Modifier.fillMaxWidth().height(maxHeight / 4) else Modifier.width(maxWidth / 4).fillMaxHeight())
                    .semantics { selected = active }
                    .clickable(interactionSource = source, indication = null, enabled = !s.disabled, role = Role.Tab) {
                        motion.select(index, latest.reducedMotion); latestAction("navigate", index.toDouble())
                    }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Canvas(Modifier.size(23.dp).graphicsLayer {
                        val grow = 1f + .035f * weight() * motion.pressProgress
                        scaleX = grow; scaleY = grow
                    }) {
                        val w = weight()
                        // Lighting interpolation preserves every original inactive SVG color at rest.
                        drawImage(bitmap, colorFilter = ColorFilter.lighting(
                            Color(1f-w,1f-w,1f-w), Color(accent.red*w,accent.green*w,accent.blue*w)))
                    }
                    Spacer(Modifier.height(2.dp))
                    BasicText(s.label("nav$index", listOf("推荐", "资料库", "搜索", "设置")[index]),
                        style = LocalTextStyle.current.copy(fontSize = 10.sp), color = { lerp(muted, accent, weight()) },
                        maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        // A single visible icon row is also the lens source. Capsule refraction covers the
        // original pixels with their refracted sample, rather than stacking another icon UI.
        if (s.vertical) Column(Modifier.fillMaxSize().then(touch).layerBackdrop(iconsBackdrop)) { items() }
        else Row(Modifier.fillMaxSize().then(touch).layerBackdrop(iconsBackdrop)) { items() }
        val bounds = if (s.vertical) Modifier.fillMaxWidth().height(maxHeight / 4) else Modifier.fillMaxHeight().width(maxWidth / 4)
        if (s.selected >= 0 || motion.dragging) Box(bounds.testTag("liquid-nav-pill").graphicsLayer {
            if (s.vertical) translationY = motion.value * extent else translationX = motion.value * extent
        }.liquidNavPill(pillBackdrop, motion, s.light, accent, s.vertical, highlight))
        }
    }
}
