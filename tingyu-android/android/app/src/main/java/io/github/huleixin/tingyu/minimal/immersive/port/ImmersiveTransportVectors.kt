package io.github.huleixin.tingyu.minimal.immersive.port

import android.graphics.RectF
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.StrokeCap

// Tingyu vector replacement. No SF Symbols outlines, Apple fonts or extracted glyph data.
// The original conveyor timing and draw transformations are preserved in MeloXTransportMotion.

internal enum class MeloXSymbol { Play, Pause, Forward, Backward, Ellipsis }
internal enum class MeloXSymbolVariant { Fill, Regular }
internal enum class SceneGlyphKind { Forward, Backward, Play, Pause, SpeakerLow, SpeakerHigh, Lyrics, Stage, Queue }
internal data class ChevronHalves(val left: Path, val right: Path, val pitch: Float)
internal data class ChevronSpec(val bounds: RectF, val halves: ChevronHalves)

@Composable
internal fun rememberTingyuChevronSpec(kind: SceneGlyphKind, textSizeSp: TextUnit): ChevronSpec {
    val px = with(LocalDensity.current) { textSizeSp.toPx() }
    return remember(kind, px) {
        val forward = kind == SceneGlyphKind.Forward
        val half = px * .58f
        val height = px * .78f
        fun triangle(x: Float) = Path().apply {
            moveTo(x + if (forward) 0f else half, 0f)
            lineTo(x + if (forward) half else 0f, height / 2)
            lineTo(x + if (forward) 0f else half, height)
            close()
        }
        ChevronSpec(RectF(0f, 0f, half * 2, height), ChevronHalves(triangle(0f), triangle(half), half))
    }
}

@Composable
internal fun MeloXSymbolIcon(
    symbol: MeloXSymbol, modifier: Modifier, color: Color,
    variant: MeloXSymbolVariant = MeloXSymbolVariant.Fill, iconSize: TextUnit = 24.sp,
) {
    Canvas(modifier) {
        val w = size.width
        val h = size.height
        if (symbol == MeloXSymbol.Ellipsis) {
            listOf(.2f,.5f,.8f).forEach { drawCircle(color,w*.06f,Offset(w*it,h*.5f)) }
        } else if (symbol == MeloXSymbol.Pause) {
            drawRoundRect(color, Offset(w * .16f, h * .06f), Size(w * .24f, h * .88f), CornerRadius(w * .045f))
            drawRoundRect(color, Offset(w * .60f, h * .06f), Size(w * .24f, h * .88f), CornerRadius(w * .045f))
        } else {
            val path = Path().apply {
                moveTo(w * .18f, h * .04f)
                lineTo(w * .94f, h * .5f)
                lineTo(w * .18f, h * .96f)
                close()
            }
            drawPath(path, color)
        }
    }
}

@Composable
internal fun SceneCupertinoGlyph(kind: SceneGlyphKind, modifier: Modifier = Modifier, color: Color = Color.White, useVectorGlyphs: Boolean = true) {
    if (kind == SceneGlyphKind.Play || kind == SceneGlyphKind.Pause) {
        MeloXSymbolIcon(if(kind == SceneGlyphKind.Play) MeloXSymbol.Play else MeloXSymbol.Pause, modifier, color)
        return
    }
    Canvas(modifier) {
        val w=size.width; val h=size.height
        val p=Path().apply {
            moveTo(w*.08f,h*.35f); lineTo(w*.3f,h*.35f); lineTo(w*.58f,h*.12f)
            lineTo(w*.58f,h*.88f); lineTo(w*.3f,h*.65f); lineTo(w*.08f,h*.65f); close()
        }
        drawPath(p,color)
        if(kind == SceneGlyphKind.SpeakerHigh) {
            drawArc(color,-55f,110f,false,Offset(w*.36f,h*.2f),Size(w*.55f,h*.6f),style=Stroke(w*.07f,cap=StrokeCap.Round))
        }
    }
}
