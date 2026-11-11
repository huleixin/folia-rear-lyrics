package io.github.huleixin.tingyu.chrome

import androidx.compose.runtime.*
import androidx.compose.ui.geometry.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.*

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/MinimalPlayerMorph.kt
internal val LocalMinimalMorph = staticCompositionLocalOf<MinimalPlayerMorph?> { null }
internal class MinimalPlayerMorph(val panel: Rect, val cover: Rect, val entry: State<Float>,
    val exit: NativeStageExit, val leaving: State<Float>, val reduced: Boolean) {
    fun active() = !reduced && (entry.value < 1f || exit.active)
    fun elapsed() = if(exit.active)leaving.value*SaltPlayerTimeline.ExitMs else entry.value*SaltPlayerTimeline.EnterMs
    fun channels(): FloatArray {
        val opened=SaltPlayerTimeline.sample(entry.value*SaltPlayerTimeline.EnterMs)
        if(!exit.active)return opened
        val closing=SaltPlayerTimeline.sample(leaving.value*SaltPlayerTimeline.ExitMs,true)
        return FloatArray(7) { opened[it]*closing[it] }
    }
    fun panelBounds(size: Size): Rect {
        val c=channels()
        return Rect(panel.left*(1-c[1]),panel.top*(1-c[0]),
            panel.right+(size.width-panel.right)*c[2],panel.bottom+(size.height-panel.bottom)*c[3])
    }
    fun coverBounds(target: Rect): Rect {
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
    fun shellAlpha()=enterRamp(0f,35f)*(if(exit.active)1f-ramp(140f,380f)else 1f)
    fun decorations()=if(exit.active)enterRamp(600f,980f)*(1f-ramp(0f,100f)) else enterRamp(600f,980f)
    fun coverAlpha()=if(exit.active)1f-ramp(380f,500f) else 1f
    fun miniAlpha(): Float {
        val before=1f-enterRamp(0f,35f)
        return if(exit.active)before+(1-before)*ramp(120f,340f) else before
    }
    fun sectionAlpha(role: String): Float {
        if(!active())return 1f
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
        shape=MinimalShellShape(motion.panelBounds(size),size.width*.16f)
    } else clip=false
}
@Composable internal fun Modifier.minimalSection(role: String): Modifier {
    val motion=LocalMinimalMorph.current
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
