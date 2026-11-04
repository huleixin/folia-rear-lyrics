package io.github.huleixin.tingyu.chrome

import android.os.Build
import androidx.core.graphics.toColorInt
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.kyant.backdrop.Backdrop
import com.kyant.backdrop.drawBackdrop
import com.kyant.backdrop.effects.blur
import com.kyant.backdrop.effects.lens
import com.kyant.backdrop.effects.vibrancy
import io.github.huleixin.tingyu.minimal.ui.PlaybackModeIcon
import io.github.huleixin.tingyu.minimal.ui.PlayerControlIcon

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/ChromeMaterial.kt
// Reuse Kyant0 Backdrop's GPU blur/lens API; text and controls remain outside the filtered background.
fun Modifier.chromeInteraction(action: (String,Double)->Unit): Modifier = pointerInput(Unit) {
    awaitEachGesture {
        awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
        action("interactionStart",0.0)
        try { do { val event = awaitPointerEvent(PointerEventPass.Initial) } while(event.changes.any { it.pressed }) }
        finally { action("interactionEnd",0.0) }
    }
}
fun chromeColor(value: String, fallback: Color = Color.White): Color = try { Color(value.toColorInt()) } catch (_: Exception) { fallback }
@Composable fun Modifier.chromeGlass(
    backdrop: Backdrop,
    light: Boolean,
    radius: Dp = 28.dp,
    lightSurfaceAlpha: Float = 166f / 255f,
    legacyLightSurfaceAlpha: Float = 230f / 255f,
): Modifier {
    val density = LocalDensity.current
    val shape = RoundedCornerShape(radius)
    if(Build.VERSION.SDK_INT<31)return background(if(light)Color(0xFFF1F4ED).copy(alpha=legacyLightSurfaceAlpha)else Color(0xE6203029),shape)
        .border(0.8.dp,Color.White.copy(alpha=.23f),shape)
    val blurRadius = with(density) { 4.dp.toPx() }
    val lensHeight = with(density) { 12.dp.toPx() }
    return drawBackdrop(backdrop = backdrop, shape = { shape }, effects = {
        vibrancy(); blur(blurRadius)
        if (Build.VERSION.SDK_INT >= 33) lens(lensHeight, lensHeight * 1.35f)
    }, onDrawSurface = { drawRect(if (light)Color(0xFFF1F4ED).copy(alpha=lightSurfaceAlpha)else Color(0x78303B36)) })
        .border(0.8.dp,if(light)Color(0x99315D43)else Color.White.copy(alpha=0.23f),shape)
}
@Composable fun ChromeButton(label: String, modifier: Modifier = Modifier, enabled: Boolean = true, size: Dp = 44.dp, reduced: Boolean = false,
    onClick: () -> Unit, content: @Composable () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if(pressed && !reduced) 0.92f else 1f,label="press")
    Box(modifier.size(size).graphicsLayer { scaleX=scale;scaleY=scale;alpha=if(enabled)1f else .35f }
        .semantics { contentDescription=label }.clickable(interactionSource=interaction,indication=null,enabled=enabled,role=Role.Button,onClick=onClick),
        contentAlignment=Alignment.Center) { content() }
}
/**
 * 舞台/迷你播放器的图标入口（第 20 轮）：播放控制与播放模式全部来自听屿
 * 图标包（minimal.ui 的 PlayerIcons，即 android_vector 的原始路径），歌词舞台
 * 与极简播放器不再各画一套。"music" 等非播放控制的占位图形保留原兜底。
 */
@Composable fun ChromeGlyph(name: String, color: Color, modifier: Modifier = Modifier) {
    when(name) {
        "play","pause","next","previous","queue" -> PlayerControlIcon(
            when(name) { "next" -> "skipForward"; "previous" -> "skipBack"; else -> name },
            color, modifier,
        )
        "order","off","all","one","shuffle","repeat" -> PlaybackModeIcon(
            when(name) { "repeat" -> "all"; "off" -> "order"; else -> name },
            color, modifier,
        )
        else -> LegacyGlyph(name, color, modifier)
    }
}

/** 非播放控制的占位图形（迷你播放器封面缺省等），不属于播放图标包。 */
@Composable private fun LegacyGlyph(name: String, color: Color, modifier: Modifier = Modifier) {
    Canvas(modifier.size(24.dp)) {
        val u=size.minDimension/24f
        val line = { x:Float,y:Float,xx:Float,yy:Float -> drawLine(color,Offset(x*u,y*u),Offset(xx*u,yy*u),2*u,StrokeCap.Round) }
        when(name) {
            else -> { drawCircle(color,7*u,Offset(12*u,12*u),style=Stroke(2*u));line(12f,5f,12f,15f) }
        }
    }
}
