package io.github.huleixin.tingyu.minimal.immersive

import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import io.github.huleixin.tingyu.chrome.NativeStageExit
import androidx.compose.ui.geometry.lerp
import org.junit.Assert.*
import org.junit.Test

// One timeline must produce identical geometry when revisiting a position in either direction.
class ImmersiveMotionTest {
    @Test fun entryAndInterruptedExitShareContinuousGeometry() {
        val panel = Rect(10f,700f,390f,760f)
        val cover = Rect(20f,710f,60f,750f)
        val target = Rect(80f,160f,320f,400f)
        val size = Size(400f,800f)
        val entry = mutableStateOf(0f)
        val leaving = mutableStateOf(0f)
        val exit = NativeStageExit()
        val immersive = ImmersivePlayerMotion(panel,cover,entry,exit,leaving,false)
        for (progress in listOf(0f,.1f,.4f,.8f,1f)) {
            entry.value = progress
            assertEquals(lerp(panel,Rect(0f,0f,400f,800f),progress),immersive.panelBounds(size))
            assertEquals(lerp(cover,target,progress),immersive.coverBounds(target))
            assertEquals(1f,immersive.coverAlpha(),0f)
        }
        entry.value = .4f
        exit.begin(null,true) {}
        for (progress in listOf(0f,.2f,.7f,1f)) {
            leaving.value = progress
            val fraction = .4f * (1f-progress)
            assertEquals(lerp(panel,Rect(0f,0f,400f,800f),fraction),immersive.panelBounds(size))
            assertEquals(lerp(cover,target,fraction),immersive.coverBounds(target))
        }
    }
    @Test fun canceledDragRestoresExpandedGeometry() {
        val panel = Rect(0f,700f,400f,760f)
        val cover = Rect(20f,710f,60f,750f)
        val target = Rect(80f,160f,320f,400f)
        val motion = ImmersivePlayerMotion(panel,cover,mutableStateOf(1f),NativeStageExit(),mutableStateOf(0f),false)
        motion.drag = 1f
        assertEquals(panel,motion.panelBounds(Size(400f,800f)))
        assertEquals(cover,motion.coverBounds(target))
        motion.drag = 0f
        assertEquals(Rect(0f,0f,400f,800f),motion.panelBounds(Size(400f,800f)))
        assertEquals(target,motion.coverBounds(target))
    }    @Test fun materialBlendsInBothDirectionsAndDragCancelRestoresIt() {
        val entry=mutableStateOf(0f);val leaving=mutableStateOf(0f);val exit=NativeStageExit()
        val motion=ImmersivePlayerMotion(Rect(0f,700f,400f,760f),Rect(10f,710f,50f,750f),entry,exit,leaving,false)
        val opening=(0..100).map { entry.value=it/100f;motion.materialFraction() }
        assertEquals(0f,opening.first(),0f);assertEquals(1f,opening.last(),0f)
        assertTrue(opening.zipWithNext().all { (a,b)->b>=a && b-a<.03f })
        motion.drag=.5f;val dragged=motion.materialFraction();assertTrue(dragged in 0f..1f && dragged<1f)
        motion.drag=0f;assertEquals(1f,motion.materialFraction(),0f)
        exit.begin(null,true) {}
        val closing=(0..100).map { leaving.value=it/100f;motion.materialFraction() }
        assertTrue(closing.zipWithNext().all { (a,b)->b<=a && a-b<.03f })
        assertEquals(0f,closing.last(),0f);assertEquals(1f,motion.shellAlpha(),0f)
    }

    @Test fun closingSceneMovesWithTheShellWithoutFadingEarly() {
        val size = Size(400f, 800f)
        val motion = ImmersivePlayerMotion(Rect(0f, 700f, 400f, 760f),
            Rect(10f, 710f, 50f, 750f), mutableStateOf(1f), NativeStageExit(), mutableStateOf(0f), false)
        val travelled = listOf(0f, .2f, .5f, .8f, 1f).map { drag ->
            motion.drag = drag
            assertEquals(1f, motion.sceneAlpha(), 0f)
            motion.sceneTranslationY(size)
        }
        assertEquals(0f, travelled.first(), 0f)
        assertTrue(travelled.zipWithNext().all { (a, b) -> b >= a })
        assertEquals(700f, travelled.last(), .01f)
        motion.drag = 0f
        assertEquals(0f, motion.sceneTranslationY(size), 0f)
    }

    @Test fun completedExitKeepsCollapsedShellAfterTheExitOwnerClears() {
        val panel = Rect(0f,700f,400f,760f)
        val size = Size(400f,800f)
        val panelState = io.github.huleixin.tingyu.minimal.PlayerPanelState(kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Unconfined))
        panelState.adopt(1f)
        val exit = NativeStageExit()
        val motion = ImmersivePlayerMotion(panel,Rect(10f,710f,50f,750f),mutableStateOf(1f),exit,mutableStateOf(1f),false,panelState)
        assertEquals(Rect(0f,0f,400f,800f),motion.panelBounds(size))
        exit.begin(null,true) {}
        exit.finish()
        panelState.holdCollapsed()
        exit.clear()
        // The shell must stay on the mini bounds across the route handoff.
        assertEquals(0f,motion.fraction(),0f)
        assertEquals(panel,motion.panelBounds(size))
    }

}
