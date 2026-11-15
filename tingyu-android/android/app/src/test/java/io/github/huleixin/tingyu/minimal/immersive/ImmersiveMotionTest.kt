package io.github.huleixin.tingyu.minimal.immersive

import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import io.github.huleixin.tingyu.chrome.NativeStageExit
import org.junit.Assert.*
import org.junit.Test

// Bounds and the master reveal have independent clocks, matching the upstream transition contract.
class ImmersiveMotionTest {
    @Test fun closingSinkHasOnePeakAndMovesShellAndArtworkTogether() {
        assertEquals(0f, immersiveSinkFraction(0f), 0f)
        assertEquals(0f, immersiveSinkFraction(.62f), 0f)
        assertEquals(1f, immersiveSinkFraction(.81f), .00001f)
        assertEquals(0f, immersiveSinkFraction(1f), 0f)
        assertEquals(0f, immersiveSinkFraction(Float.NaN), 0f)
        val exit = NativeStageExit().also { it.begin(null, true) {} }
        val clock = mutableStateOf(.81f)
        val panel = Rect(10f, 700f, 390f, 760f)
        val cover = Rect(20f, 710f, 60f, 750f)
        val motion = ImmersivePlayerMotion(panel, cover, mutableStateOf(1f),
            exit, mutableStateOf(1f), false, mutableStateOf(0f), clock, 22f)
        assertEquals(panel.translate(0f, 22f), motion.panelBounds(Size(400f, 800f)))
        assertEquals(cover.translate(0f, 22f), motion.coverBounds(Rect(20f, 100f, 380f, 460f)))
        clock.value = 1f
        assertEquals(panel, motion.panelBounds(Size(400f, 800f)))
        exit.clear()
        clock.value = .81f
        assertEquals(0f, motion.sinkOffset(), 0f)
    }
    @Test fun independentBoundsDoNotDoubleEaseTheMasterSpring() {
        val geometry = mutableStateOf(.35f)
        val motion = ImmersivePlayerMotion(Rect(10f, 700f, 390f, 760f), null,
            mutableStateOf(.9f), NativeStageExit(), mutableStateOf(0f), false, geometry)
        assertEquals(.35f, motion.geometryFraction(), .00001f)
        motion.drag = .2f; assertEquals(.28f, motion.geometryFraction(), .00001f)
        val bounds = motion.panelBounds(Size(400f, 800f))
        assertEquals(504f, bounds.top, .001f)
        geometry.value = 1f; motion.drag = 0f
        assertEquals(Rect(0f, 0f, 400f, 800f), motion.panelBounds(Size(400f, 800f)))
        geometry.value = 0f
        assertEquals(Rect(10f, 700f, 390f, 760f), motion.panelBounds(Size(400f, 800f)))
    }
    @Test fun boundsEasingHasExactEndpointsAndNoReversal() {
        assertEquals(0f, ImmersiveBoundsEasing.transform(0f), .00001f)
        assertEquals(1f, ImmersiveBoundsEasing.transform(1f), .00001f)
        val frames = (0..100).map { ImmersiveBoundsEasing.transform(it / 100f) }
        assertTrue(frames.zipWithNext().all { (a, b) -> b >= a })
    }
}
