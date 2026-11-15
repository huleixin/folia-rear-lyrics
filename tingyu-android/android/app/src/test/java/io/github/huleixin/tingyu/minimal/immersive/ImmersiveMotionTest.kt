package io.github.huleixin.tingyu.minimal.immersive

import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import io.github.huleixin.tingyu.chrome.NativeStageExit
import io.github.huleixin.tingyu.chrome.MinimalPlayerMorph
import org.junit.Assert.*
import org.junit.Test

// Entry, interruption and exit must follow the existing Tingyu animation timeline.
class ImmersiveMotionTest {
    @Test fun entryAndInterruptedExitMatchClassicGeometry() {
        val panel = Rect(10f,700f,390f,760f)
        val cover = Rect(20f,710f,60f,750f)
        val target = Rect(80f,160f,320f,400f)
        val size = Size(400f,800f)
        val entry = mutableStateOf(0f)
        val leaving = mutableStateOf(0f)
        val exit = NativeStageExit()
        val immersive = ImmersivePlayerMotion(panel,cover,entry,exit,leaving,false)
        val classic = MinimalPlayerMorph(panel,cover,entry,exit,leaving,false)
        for (progress in listOf(0f,.1f,.4f,.8f,1f)) {
            entry.value = progress
            assertEquals(classic.panelBounds(size),immersive.panelBounds(size))
            assertEquals(classic.coverBounds(target),immersive.coverBounds(target))
        }
        entry.value = .4f
        exit.begin(null,true) {}
        for (progress in listOf(0f,.2f,.7f,1f)) {
            leaving.value = progress
            assertEquals(classic.panelBounds(size),immersive.panelBounds(size))
            assertEquals(classic.coverBounds(target),immersive.coverBounds(target))
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
    }
}
