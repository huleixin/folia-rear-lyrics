package io.github.huleixin.tingyu.chrome

import androidx.compose.runtime.BroadcastFrameClock
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
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
    private val panel = PlayerPanelState(scope).apply { useClassicMotion(true) }
    private val miniPanel = Rect(10f, 700f, 390f, 760f)
    private val miniCover = Rect(24f, 710f, 64f, 750f)
    private val fullCover = Rect(75f, 120f, 325f, 370f)
    private val size = Size(400f, 800f)
    private val exit = NativeStageExit()
    private val morph = MinimalPlayerMorph(miniPanel, miniCover, mutableStateOf(1f), exit, mutableStateOf(0f), false, panel)
    private var now = 0L

    @After fun closeScope() { scope.cancel() }

    private fun frame() {
        now += 16_000_000
        clock.sendFrame(now)
        val shell = morph.panelBounds(size)
        val cover = morph.coverBounds(fullCover, size)
        assertEquals(miniPanel.top * (1f - panel.progress), shell.top, .001f)
        assertTrue("cover $cover escapes shell $shell", cover.left >= shell.left - .001f && cover.right <= shell.right + .001f)
        assertTrue("cover $cover escapes shell $shell", cover.top >= shell.top - .001f && cover.bottom <= shell.bottom + .001f)
        assertEquals(morph.shellAlpha(), morph.coverAlpha(), 0f)
        val coverProgress = (cover.width - miniCover.width) / (fullCover.width - miniCover.width)
        val radius = playerCoverLocalRadius(coverProgress, miniCover.width, fullCover.width, FullPlayerCoverRadiusDp)
        assertEquals(10f + 12f * coverProgress, radius * cover.width / fullCover.width, .001f)
    }

    @Test fun twentyOpenCloseCyclesKeepTheCoverInsideThePanel() {
        repeat(20) {
            panel.prepareEntry()
            assertEquals(0f, panel.progress, 0f)
            panel.open(false)
            repeat(64) { frame() }
            assertEquals(1f, panel.progress, 0f)
            assertFalse(morph.active())
            panel.close(false)
            repeat(34) { frame() }
            assertEquals(0f, panel.progress, 0f)
            assertEquals(0f, morph.coverAlpha(), 0f)
            assertTrue(panel.collapsePending)
            panel.reset()
        }
    }

    @Test fun rapidReversalsPreserveCurrentGeometryAndIgnoreCanceledExit() {
        panel.open(false)
        repeat(8) { frame() }
        val opening = morph.coverBounds(fullCover, size)
        panel.close(false)
        assertEquals(opening, morph.coverBounds(fullCover, size))
        repeat(4) { frame() }
        val closing = morph.coverBounds(fullCover, size)
        assertTrue(panel.progress in .01f.. .99f)
        panel.open(false)
        assertEquals(closing, morph.coverBounds(fullCover, size))
        repeat(60) { frame() }
        assertFalse(panel.collapsePending)
        assertEquals(fullCover, morph.coverBounds(fullCover, size))
    }

    @Test fun clickUsesRecordedChannelsAndKeepsTheLateDecorations() {
        panel.open(false)
        repeat(8) { frame() }
        val early = panel.classicFrame!!
        assertArrayEquals(SaltPlayerTimeline.sample(112f), early.channels, .001f)
        assertEquals(0f, early.decorations, 0f)
        assertTrue(early.channels[6] > early.channels[0])
        assertTrue(early.header > early.controls)
        repeat(34) { frame() }
        assertEquals(1f, panel.progress, .001f)
        assertTrue(morph.active())
        assertTrue(morph.decorations() in .001f.. .999f)
        repeat(24) { frame() }
        assertFalse(morph.active())
    }

    @Test fun dragFromMiniHoldsAndReversesSpatiallyBeforeVelocitySettles() {
        panel.prepareEntry()
        panel.beginDrag(cancelTo = 0f)
        panel.dragBy(-245f, miniPanel.top)
        val held = morph.panelBounds(size)
        val cover = morph.coverBounds(fullCover, size)
        repeat(70) { frame() }
        assertEquals(.35f, panel.progress, .0001f)
        assertEquals(held, morph.panelBounds(size))
        assertEquals(cover, morph.coverBounds(fullCover, size))

        panel.dragBy(70f, miniPanel.top)
        assertEquals(held.top + 70f, morph.panelBounds(size).top, .01f)
        panel.dragBy(-70f, miniPanel.top)
        assertEquals(held.top, morph.panelBounds(size).top, .01f)
        panel.release(-1500f)
        assertEquals(held.top, morph.panelBounds(size).top, .01f)
        repeat(4) { frame() }
        assertTrue(panel.progress in .36f.. .99f)
        repeat(55) { frame() }
        assertEquals(1f, panel.progress, 0f)
        assertFalse(panel.collapsePending)
    }

    @Test fun cancelFromMiniSettlesBackBeforeCommittingRoute() {
        panel.prepareEntry()
        panel.beginDrag(cancelTo = 0f)
        panel.dragBy(-440f, miniPanel.top)
        panel.release(-1700f, canceled = true)
        assertFalse(panel.collapsePending)
        repeat(60) { frame() }
        assertEquals(0f, panel.progress, 0f)
        assertTrue(panel.collapsePending)
        assertEquals(miniCover, morph.coverBounds(fullCover, size))
    }
}
