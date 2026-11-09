package io.github.huleixin.tingyu.chrome

import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import com.kyant.backdrop.Backdrop
import com.kyant.backdrop.drawBackdrop
import com.kyant.backdrop.effects.lens
import com.kyant.backdrop.highlight.Highlight
import com.kyant.backdrop.highlight.HighlightStyle
import com.kyant.backdrop.shadow.InnerShadow
import com.kyant.backdrop.shadow.Shadow

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/LiquidNavPill.kt
// LiquidBottomTabs optical adaptation (Kyant0, Apache-2.0). Tingyu's existing idle
// scrim, accent, lens, highlight and shadow values stay intact; motion adds optical energy.
@Composable internal fun Modifier.liquidNavPill(
    backdrop: Backdrop, motion: LiquidNavMotion, light: Boolean, accent: Color,
    vertical: Boolean, highlight: LiquidNavHighlight,
): Modifier {
    val scrim = if (light) Color.Black.copy(alpha = .075f) else Color.White.copy(alpha = .075f)
    if (Build.VERSION.SDK_INT < 31) return graphicsLayer { scaleX = motion.scaleX; scaleY = motion.scaleY }
        .background(scrim, RoundedCornerShape(24.dp))
    return drawBackdrop(
        backdrop = backdrop,
        shape = { RoundedCornerShape(24.dp - 3.dp * motion.pressProgress) },
        effects = {
            if (Build.VERSION.SDK_INT >= 33) {
                val strength = .55f + .45f * motion.opticalProgress
                val height = 9.dp.toPx() * strength
                val amount = 12.dp.toPx() * strength
                // lens subtracts height. Leave a CONSTANT 12dp afterwards so motion
                // changes uniforms, never the retained offscreen texture dimensions.
                padding = height + 12.dp.toPx()
                lens(height, amount, chromaticAberration = true)
            }
        },
        highlight = { Highlight(.7.dp, .35.dp, .22f + .62f * motion.opticalProgress, HighlightStyle.Default) },
        shadow = { Shadow(radius = 12.dp, offset = DpOffset(0.dp, 2.dp), color = Color.Black.copy(alpha = .10f), alpha = .22f + .5f * motion.opticalProgress) },
        innerShadow = { InnerShadow(radius = 8.dp, alpha = .22f + .55f * motion.opticalProgress) },
        layerBlock = { scaleX = motion.scaleX; scaleY = motion.scaleY },
        onDrawSurface = {
            drawRect(scrim)
            drawRect(accent.copy(alpha = if (light) .085f else .12f))
            drawRect(Brush.verticalGradient(0f to Color.White.copy(alpha = .085f), .40f to Color.White.copy(alpha = .025f), 1f to Color.Transparent), blendMode = BlendMode.Plus)
        },
    ).graphicsLayer {
        clip = true; shape = RoundedCornerShape(24.dp - 3.dp * motion.pressProgress)
    }.then(highlight.modifier(motion, vertical))
}
