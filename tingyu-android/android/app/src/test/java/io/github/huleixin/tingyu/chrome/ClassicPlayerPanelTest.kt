package io.github.huleixin.tingyu.chrome

import androidx.compose.runtime.BroadcastFrameClock
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.lerp
import io.github.huleixin.tingyu.minimal.PlayerPanelState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.junit.After
import org.junit.Assert.*
import org.junit.Test

class ClassicPlayerPanelTest {
    private val clock = BroadcastFrameClock()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined + clock)
    private val panel = PlayerPanelState(scope)
    private val miniPanel = Rect(10f, 700f, 390f, 760f)
    private val miniCover = Rect(24f, 710f, 64f, 750f)
    private val fullCover = Rect(75f, 120f, 325f, 370f)
    private val size = Size(400f, 800f)
    private val fullPanel = Rect(0f, 0f, size.width, size.height)
    private val exit = NativeStageExit()
    private val morph = MinimalPlayerMorph(miniPanel, miniCover, mutableStateOf(1f), exit, mutableStateOf(0f), false, panel)
    private var now = 0L

    @After fun closeScope() { scope.cancel() }

    private fun frame() {
        now += 16_000_000
        clock.sendFrame(now)
        val p = panel.progress
        val shell = morph.panelBounds(size)
        val cover = morph.coverBounds(fullCover)
        assertEquals(lerp(miniPanel, fullPanel, p), shell)
        assertEquals(lerp(miniCover, fullCover, p), cover)
        assertTrue(cover.left >= shell.left && cover.right <= shell.right)
        assertTrue(cover.top >= shell.top && cover.bottom <= shell.bottom)
        val radius = playerCoverLocalRadius(p, miniCover.width, fullCover.width, FullPlayerCoverRadiusDp)
        assertEquals(10f + 12f * p, radius * cover.width / fullCover.width, .001f)
    }

    @Test fun twentyOpenCloseCyclesKeepTheCoverInsideThePanel() {
        repeat(20) {
            panel.prepareEntry()
            assertEquals(0f, panel.progress, 0f)
            panel.open(false)
            repeat(25) { frame() }
            assertEquals(1f, panel.progress, 0f)
            assertFalse(morph.active())
            panel.close(false)
            repeat(25) { frame() }
            assertEquals(0f, panel.progress, 0f)
            assertEquals(0f, morph.coverAlpha(), 0f)
            assertTrue(panel.collapsePending)
            panel.reset()
        }
    }

    @Test fun rapidReversalsPreserveCurrentGeometryAndIgnoreCanceledExit() {
        panel.open(false)
        repeat(8) { frame() }
        val opening = morph.coverBounds(fullCover)
        panel.close(false)
        assertEquals(opening, morph.coverBounds(fullCover))
        repeat(4) { frame() }
        val closing = morph.coverBounds(fullCover)
        assertTrue(panel.progress in .01f.. .99f)
        panel.open(false)
        assertEquals(closing, morph.coverBounds(fullCover))
        repeat(25) { frame() }
        assertFalse(panel.collapsePending)
        assertEquals(fullCover, morph.coverBounds(fullCover))
    }
}
