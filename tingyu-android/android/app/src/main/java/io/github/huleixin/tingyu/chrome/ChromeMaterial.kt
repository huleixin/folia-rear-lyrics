package io.github.huleixin.tingyu.chrome

import android.os.Build
import androidx.core.graphics.toColorInt
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
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
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
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
@Composable fun Modifier.chromeGlass(backdrop: Backdrop, light: Boolean, radius: Dp = 28.dp): Modifier {
    val density = LocalDensity.current
    val shape = RoundedCornerShape(radius)
    val blurRadius = with(density) { 4.dp.toPx() }
    val lensHeight = with(density) { 12.dp.toPx() }
    return drawBackdrop(backdrop = backdrop, shape = { shape }, effects = {
        vibrancy(); blur(blurRadius)
        if (Build.VERSION.SDK_INT >= 33) lens(lensHeight, lensHeight * 1.35f)
    }, onDrawSurface = { drawRect(if (light) Color(0x88F3F5F4) else Color(0x78303B36)) })
        .border(0.8.dp,Color.White.copy(alpha = if(light) 0.45f else 0.23f),shape)
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
@Composable fun ChromeGlyph(name: String, color: Color, modifier: Modifier = Modifier) {
    Canvas(modifier.size(24.dp)) {
        val u=size.minDimension/24f
        fun line(x:Float,y:Float,xx:Float,yy:Float) = drawLine(color,Offset(x*u,y*u),Offset(xx*u,yy*u),2*u,StrokeCap.Round)
        fun filledPath(path:Path) { drawPath(path,color);drawPath(path,color,style=Stroke(2*u,cap=StrokeCap.Round,join=StrokeJoin.Round)) }
        when(name) {
            "play" -> {
                val p=Path().apply { moveTo(5*u,5*u);cubicTo(5*u,3.46f*u,6.67f*u,2.50f*u,8.008f*u,3.272f*u)
                    lineTo(20.005f*u,10.27f*u);cubicTo(21.34f*u,11.05f*u,21.34f*u,12.95f*u,20.008f*u,13.728f*u)
                    lineTo(8.008f*u,20.728f*u);cubicTo(6.67f*u,21.50f*u,5*u,20.54f*u,5*u,19*u);close() }
                filledPath(p)
            }
            "pause" -> {
                for(x in listOf(5f,14f)) {
                    drawRoundRect(color,Offset(x*u,3*u),Size(5*u,18*u),CornerRadius(u))
                    drawRoundRect(color,Offset(x*u,3*u),Size(5*u,18*u),CornerRadius(u),style=Stroke(2*u))
                }
            }
            "next" -> {
                val p=Path().apply {moveTo(6.029f*u,4.285f*u);cubicTo(4.70f*u,3.51f*u,3*u,4.46f*u,3*u,6*u)
                    lineTo(3*u,18*u);cubicTo(3*u,19.54f*u,4.70f*u,20.49f*u,6.029f*u,19.715f*u)
                    lineTo(16.026f*u,13.717f*u);cubicTo(17.36f*u,12.94f*u,17.36f*u,11.06f*u,16.029f*u,10.283f*u);close() }
                filledPath(p);line(21f,4f,21f,20f)
            }
            "previous" -> {
                val p=Path().apply {moveTo(17.971f*u,4.285f*u);cubicTo(19.30f*u,3.51f*u,21*u,4.46f*u,21*u,6*u)
                    lineTo(21*u,18*u);cubicTo(21*u,19.54f*u,19.30f*u,20.49f*u,17.971f*u,19.715f*u)
                    lineTo(7.974f*u,13.717f*u);cubicTo(6.64f*u,12.94f*u,6.64f*u,11.06f*u,7.971f*u,10.283f*u);close() }
                filledPath(p);line(3f,4f,3f,20f)
            }
            "queue" -> { line(3f,5f,16f,5f);line(3f,12f,11f,12f);line(3f,19f,11f,19f);line(21f,5f,21f,16f);drawCircle(color,3*u,Offset(18*u,16*u),style=Stroke(2*u)) }
            "shuffle" -> {
                val routes=Path().apply {
                    moveTo(2*u,18*u);lineTo(4.5f*u,18*u);cubicTo(10*u,18*u,12*u,6*u,19.5f*u,6*u);lineTo(22*u,6*u)
                    moveTo(2*u,6*u);lineTo(4.5f*u,6*u);cubicTo(7*u,6*u,8.5f*u,8*u,10*u,10*u)
                    moveTo(14*u,14*u);cubicTo(15.5f*u,16*u,17*u,18*u,19.5f*u,18*u);lineTo(22*u,18*u)
                }
                drawPath(routes,color,style=Stroke(2*u,cap=StrokeCap.Round,join=StrokeJoin.Round))
                line(18f,2f,22f,6f);line(22f,6f,18f,10f);line(18f,14f,22f,18f);line(22f,18f,18f,22f)
            }
            "one" -> { line(12f,8f,12f,16f);line(10f,10f,12f,8f);line(9f,16f,15f,16f);line(3f,5f,21f,5f);line(21f,5f,21f,10f);line(3f,19f,21f,19f);line(3f,14f,3f,19f) }
            "repeat" -> { line(4f,6f,20f,6f);line(20f,6f,20f,11f);line(17f,3f,20f,6f);line(4f,18f,20f,18f);line(4f,13f,4f,18f);line(4f,18f,7f,21f) }
            else -> { drawCircle(color,7*u,Offset(12*u,12*u),style=Stroke(2*u));line(12f,5f,12f,15f) }
        }
    }
}
