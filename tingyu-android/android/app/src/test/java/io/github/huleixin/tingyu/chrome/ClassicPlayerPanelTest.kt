package io.github.huleixin.tingyu.chrome

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import io.github.huleixin.tingyu.minimal.PlayerPanelState
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/ClassicPlayerPanelTest.kt
// Test the initialized shared controller used by the host, rather than the timed fallback.
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.LEGACY)
@Config(sdk = [34])
class ClassicPlayerPanelTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private lateinit var panel: PlayerPanelState
    private lateinit var morph: MinimalPlayerMorph
    private val origin = Rect(10f, 700f, 390f, 760f)
    private val size = Size(400f, 800f)
    private fun setup() {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            val scope = rememberCoroutineScope()
            panel = remember { PlayerPanelState(scope).apply { useClassicMotion(true) } }
            morph = remember { MinimalPlayerMorph(origin, Rect(20f, 710f, 60f, 750f),
                mutableStateOf(1f), NativeStageExit(), mutableStateOf(0f), false, panel) }
            Box {}
        }
    }
    private fun frame(expected: ClassicPlayerFrame) {
        val actual = panel.classicFrame!!
        assertArrayEquals(expected.channels, morph.channels(), .0001f)
        assertEquals(expected.shell, morph.shellAlpha(), .0001f)
        assertEquals(expected.decorations, morph.decorations(), .0001f)
        assertEquals(expected.mini, morph.miniAlpha(), .0001f)
        for (role in listOf("header", "controls", "lyrics"))
            assertEquals(expected.section(role), morph.sectionAlpha(role), .0001f)
        assertEquals(expected.expanded, actual.expanded)
    }
    @Test fun clicksRestoreTheSevenOriginalCurvesAndIndependentFades() {
        setup()
        compose.runOnIdle { panel.open(false) }
        repeat(75) {
            compose.mainClock.advanceTimeByFrame(); compose.waitForIdle()
            frame(ClassicPlayerFrame.opening(panel.progress))
        }
        assertTrue(panel.classicFrame!!.expanded)
        compose.runOnIdle { panel.close(false) }
        var fadeSeenBeforeShellFade = false
        var independentCoverSeen = false
        repeat(42) {
            compose.mainClock.advanceTimeByFrame(); compose.waitForIdle()
            val current = panel.classicFrame!!
            if (current.controls in .01f.. .99f && current.shell >= .9999f) {
                assertTrue(morph.active()); fadeSeenBeforeShellFade = true
                assertEquals(current.controls, morph.sectionAlpha("controls"), .0001f)
            }
            if (current.channels[0] in .1f.. .9f &&
                kotlin.math.abs(current.channels[4] - current.channels[0]) > .02f) independentCoverSeen = true
        }
        assertTrue(fadeSeenBeforeShellFade); assertTrue(independentCoverSeen)
        assertTrue(panel.collapsePending); frame(ClassicPlayerFrame.Collapsed)
    }
    @Test fun grabbingEntryRetainsOffsetsAndDragHasNoJumpOrDirectionHistory() {
        setup()
        compose.runOnIdle { panel.open(false) }
        compose.mainClock.advanceTimeBy(160); compose.waitForIdle()
        val before = panel.classicFrame!!
        val bounds = morph.panelBounds(size)
        compose.runOnIdle { panel.beginDrag() }
        assertEquals(bounds, morph.panelBounds(size)); frame(before)
        compose.runOnIdle { panel.dragBy(100f, 700f) }
        assertEquals(bounds.top + 100f, morph.panelBounds(size).top, .01f)
        val dragged = panel.classicFrame!!
        compose.runOnIdle { panel.dragBy(-50f, 700f); panel.dragBy(50f, 700f) }
        frame(dragged)
        compose.runOnIdle { panel.release(0f, canceled = true, reduced = true) }
        frame(ClassicPlayerFrame.Expanded); assertFalse(panel.collapsePending)
    }
    @Test fun interruptedCloseStartsAtCapturedFrameAndOnlyCurrentAnimationCanCommit() {
        setup()
        compose.runOnIdle { panel.open(false) }
        compose.mainClock.advanceTimeBy(160); compose.waitForIdle()
        val before = panel.classicFrame!!
        compose.runOnIdle { panel.close(false) }
        frame(before)
        repeat(8) { compose.mainClock.advanceTimeByFrame(); compose.waitForIdle() }
        compose.runOnIdle { panel.beginDrag(); panel.dragBy(-600f, 700f); panel.release(0f, true, true) }
        // Canceling a closing drag restores its original destination: collapsed.
        assertTrue(panel.collapsePending)
        compose.runOnIdle { panel.open(true) }
        compose.mainClock.advanceTimeBy(1100); compose.waitForIdle()
        assertFalse(panel.collapsePending); frame(ClassicPlayerFrame.Expanded)
    }
    @Test fun catchingLateDecorationsDoesNotDisableTheRemainingAnimation() {
        setup()
        compose.runOnIdle { panel.open(false) }
        compose.mainClock.advanceTimeBy(780); compose.waitForIdle()
        assertEquals(1f, panel.classicFrame!!.channels[0], .0001f)
        assertFalse(panel.classicFrame!!.expanded)
        compose.runOnIdle { panel.beginDrag(); panel.release(0f, true) }
        assertTrue(morph.active())
        compose.mainClock.advanceTimeBy(400); compose.waitForIdle()
        frame(ClassicPlayerFrame.Expanded); assertFalse(morph.active())
    }
}
