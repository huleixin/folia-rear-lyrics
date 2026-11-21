package io.github.huleixin.tingyu.chrome

import androidx.compose.runtime.*
import androidx.compose.ui.geometry.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.*

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/MinimalPlayerMorph.kt
internal val LocalMinimalMorph = staticCompositionLocalOf<MinimalPlayerMorph?> { null }
internal val LocalPlayerPanelState = staticCompositionLocalOf<io.github.huleixin.tingyu.minimal.PlayerPanelState?> { null }
internal class MinimalPlayerMorph(val panel: Rect, val cover: Rect, val entry: State<Float>,
    val exit: NativeStageExit, val leaving: State<Float>, val reduced: Boolean,
    val interactive: io.github.huleixin.tingyu.minimal.PlayerPanelState? = null) {
    fun interactiveFraction(): Float? = interactive?.takeIf { it.initialized }?.progress
    fun active() = interactive?.dragging == true ||
        (interactiveFraction()?.let { it < 1f } ?: (!reduced && (entry.value < 1f || exit.active)))
    fun elapsed() = if(exit.active)leaving.value*SaltPlayerTimeline.ExitMs else entry.value*SaltPlayerTimeline.EnterMs
    fun channels(): FloatArray {
        interactiveFraction()?.let { progress -> return FloatArray(7) { progress } }
        val opened=SaltPlayerTimeline.sample(entry.value*SaltPlayerTimeline.EnterMs)
        if(!exit.active)return opened
        val closing=SaltPlayerTimeline.sample(leaving.value*SaltPlayerTimeline.ExitMs,true)
        return FloatArray(7) { opened[it]*closing[it] }
    }
    fun panelBounds(size: Size): Rect {
        interactiveFraction()?.let { return lerp(panel, Rect(Offset.Zero, size), it) }
        val c=channels()
        return Rect(panel.left*(1-c[1]),panel.top*(1-c[0]),
            panel.right+(size.width-panel.right)*c[2],panel.bottom+(size.height-panel.bottom)*c[3])
    }
    fun shellRadius(size: Size): Float {
        interactiveFraction()?.let { return minOf(size.width * .16f, panel.height / 2f) * (1f - it) }
        // The corners converge with the shell, before the slower decorative timeline ends.
        val c=channels()
        val open=minOf(c[0],c[1],c[2],c[3]).coerceIn(0f,1f)
        return minOf(size.width*.16f,panel.height/2f)*(1f-open)
    }
    fun coverBounds(target: Rect): Rect {
        interactiveFraction()?.let { return if (cover.width > 0f) lerp(cover, target, it) else target }
        val c=channels();val center=Offset(cover.center.x+(target.center.x-cover.center.x)*c[4],
            cover.center.y+(target.center.y-cover.center.y)*c[5])
        val width=cover.width+(target.width-cover.width)*c[6]
        val height=cover.height+(target.height-cover.height)*c[6]
        return Rect(center-Offset(width/2,height/2),Size(width,height))
    }
    fun ramp(start: Float, end: Float): Float {
        val x=((elapsed()-start)/(end-start)).coerceIn(0f,1f)
        return x*x*(3-2*x)
    }
    private fun enterRamp(start: Float,end: Float): Float {
        val x=((entry.value*SaltPlayerTimeline.EnterMs-start)/(end-start)).coerceIn(0f,1f)
        return x*x*(3-2*x)
    }
    private fun reveal(start: Float,end: Float): Float {
        val x=((interactiveFraction()!!-start)/(end-start)).coerceIn(0f,1f)
        return x*x*(3f-2f*x)
    }
    fun shellAlpha()=if(interactiveFraction()!=null)reveal(0f,.12f)else enterRamp(0f,35f)*(if(exit.active)1f-ramp(140f,380f)else 1f)
    fun decorations()=if(interactiveFraction()!=null)reveal(.25f,.90f)else if(exit.active)enterRamp(600f,980f)*(1f-ramp(0f,100f)) else enterRamp(600f,980f)
    // The cover must reach the mini endpoint with the shell. Fading it earlier made it
    // disappear while the rest of the page was still travelling.
    fun coverAlpha() = interactiveFraction()?.let { playerMotionReveal(it, 0f, .08f) } ?: 1f
    fun miniAlpha(): Float {
        interactiveFraction()?.let { return 1f - playerMotionReveal(it, 0f, .12f) }
        val before=1f-enterRamp(0f,35f)
        return if(exit.active)before+(1-before)*ramp(120f,340f) else before
    }
    fun sectionAlpha(role: String): Float {
        if(!active())return 1f
        if(interactiveFraction()!=null)return reveal(.12f,if(role=="controls").80f else .68f)
        val opened=when(role){"header"->enterRamp(75f,190f);"controls"->enterRamp(150f,350f);else->enterRamp(100f,240f)}
        return opened*(if(exit.active)1f-ramp(0f,if(role=="controls")120f else 150f)else 1f)
    }
}
private class MinimalShellShape(val bounds: Rect,val radius: Float): Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection,density: Density)=
        Outline.Rounded(RoundRect(bounds,CornerRadius(radius.coerceAtMost(bounds.height/2f))))
}
internal fun Modifier.minimalPlayerContainer(motion: MinimalPlayerMorph?) = graphicsLayer {
    if(motion!=null && motion.active()) {
        clip=true
        shape=MinimalShellShape(motion.panelBounds(size),motion.shellRadius(size))
        compositingStrategy = CompositingStrategy.Offscreen
    } else {
        clip = false
        compositingStrategy = CompositingStrategy.Auto
    }
}
internal fun Modifier.minimalStageCanvas(motion: MinimalPlayerMorph?, visible: Boolean = true) = graphicsLayer {
    if(!visible) {
        alpha = 0f
        scaleX = 1f; scaleY = 1f
        translationX = 0f; translationY = 0f
        clip = false
    } else if(motion != null && motion.active()) {
        val c = motion.channels()
        val initScale = (motion.cover.width / (size.width * 0.42f)).coerceIn(0.18f, 0.45f)
        val scale = initScale + (1f - initScale) * c[6]
        val targetCenterX = size.width * 0.5f
        val targetCenterY = size.height * 0.44f
        val currentCenterX = motion.cover.center.x + (targetCenterX - motion.cover.center.x) * c[4]
        val currentCenterY = motion.cover.center.y + (targetCenterY - motion.cover.center.y) * c[5]
        transformOrigin = TransformOrigin(0f, 0f)
        scaleX = scale
        scaleY = scale
        translationX = currentCenterX - targetCenterX * scale
        translationY = currentCenterY - targetCenterY * scale
        alpha = motion.shellAlpha()
        clip = false
    } else {
        alpha = 1f
        scaleX = 1f; scaleY = 1f
        translationX = 0f; translationY = 0f
        clip = false
    }
}
@Composable internal fun Modifier.minimalSection(role: String): Modifier =
    minimalSection(role, LocalMinimalMorph.current)

internal fun Modifier.minimalSection(role: String, motion: MinimalPlayerMorph?): Modifier {
    return graphicsLayer {
        if(motion!=null && motion.active()) {
            alpha=motion.sectionAlpha(role)
            translationY=if(role=="controls")32f*density*(1-alpha) else motion.panelBounds(size).top
        } else {alpha=1f;translationY=0f}
    }
}
@Composable internal fun Modifier.minimalBackground(): Modifier {
    val motion=LocalMinimalMorph.current
    return graphicsLayer { alpha=if(motion!=null&&motion.active())motion.shellAlpha()else 1f }
}
