package io.github.huleixin.tingyu.chrome

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.unit.dp
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/LiquidMotionTest.kt
// Production animation clocks and geometry; LEGACY avoids host Skia dependence.
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.LEGACY)
@Config(sdk=[34])
class LiquidMotionTest {
    @get:Rule val compose=createAndroidComposeRule<ComponentActivity>()
    private fun pumpUntil(condition:()->Boolean) {
        // Readiness/theme changes start a new LaunchedEffect on the host main looper.
        // Pump frames and drain it instead of assuming the coroutine started at t=0.
        repeat(60) {
            compose.mainClock.advanceTimeByFrame();compose.waitForIdle()
            if(condition()) return
        }
        assertTrue("animation did not start after 60 frames",condition())
    }

    @Test fun sharedCoverKeepsNestedBackIdentityAndDoesNotReuseUnrelatedClicks() {
        val selection=CoverSelection()
        val first=CoverBinding("home/card-one",10.dp)
        val nested=CoverBinding("album/card-two",7.dp)
        selection.select("home","open:one",first)
        selection.acceptAction("home","open:one")
        assertEquals(first,selection.enter("album:one",false))
        selection.select("album:one","open:two",nested)
        selection.acceptAction("album:one","open:two")
        assertEquals(nested,selection.enter("album:two",false))
        assertEquals(first,selection.enter("album:one",true))
        selection.select("home","open:one",first)
        selection.acceptAction("home","open:other")
        assertNull(selection.enter("album:other",false))
        assertNull(selection.enter("album:one",false))
    }

    @Test fun detailLoadingCannotReplaceItsCapturedCoverAndHistoryIsBounded() {
        val selection=CoverSelection();val binding=CoverBinding("library/actual-click",11.dp)
        selection.select("library","open:one",binding)
        val captured=selection.enter("album:one",false)
        selection.acceptAction("album:one","requestTracks")
        assertEquals(binding,captured)
        repeat(13){selection.enter("settings:$it",false)}
        assertNull(selection.enter("album:one",true))
    }

    @Test fun waitingForNativeFirstFrameKeepsEntryAtTheMiniBounds() {
        val ready=mutableStateOf(false);lateinit var clock:State<Float>
        compose.mainClock.autoAdvance=false
        compose.setContent { clock=rememberLiquidPlayerProgress(true,false,false,false,ready.value);Box{} }
        compose.mainClock.advanceTimeBy(800)
        assertEquals(0f,clock.value,.001f)
        compose.runOnIdle {ready.value=true}
        pumpUntil {clock.value>0f}
        assertTrue(clock.value>0f && clock.value<1f)
        compose.mainClock.advanceTimeBy(600)
        assertEquals(1f,clock.value,.001f)
    }

    @Test fun backFreezesEntryBeforeCollapseAndAcknowledgesOnce() {
        val exit=NativeStageExit();lateinit var entry:State<Float>;lateinit var leaving:State<Float>;var replies=0
        compose.mainClock.autoAdvance=false
        compose.setContent {
            entry=rememberLiquidPlayerProgress(true,false,false,exit.active)
            leaving=rememberStageExitProgress(exit,false);Box{}
        }
        compose.mainClock.advanceTimeBy(128)
        assertTrue(entry.value>0f && entry.value<1f)
        compose.runOnIdle {exit.begin(null,true){replies++}}
        compose.mainClock.advanceTimeBy(64)
        val frozen=entry.value;val before=frozen*(1f-leaving.value)
        compose.mainClock.advanceTimeBy(80)
        assertEquals(frozen,entry.value,.001f)
        assertTrue(entry.value*(1f-leaving.value)<before)
        compose.mainClock.advanceTimeBy(600)
        assertEquals(0f,entry.value*(1f-leaving.value),.001f)
        assertEquals(1,replies)
        compose.mainClock.advanceTimeBy(600);assertEquals(1,replies)
    }

    @Test fun reduceMotionDuringEntryFinishesWithoutASecondAnimation() {
        val reduced=mutableStateOf(false);lateinit var clock:State<Float>
        compose.mainClock.autoAdvance=false
        compose.setContent {clock=rememberLiquidPlayerProgress(true,false,reduced.value,false);Box{}}
        compose.mainClock.advanceTimeBy(112)
        compose.runOnIdle {reduced.value=true}
        compose.mainClock.advanceTimeBy(48)
        assertEquals(1f,clock.value,.001f)
    }

    @Test fun returningFromSettingsDoesNotReplayEntry() {
        lateinit var clock:State<Float>
        compose.setContent {clock=rememberLiquidPlayerProgress(true,true,false,false,false);Box{}}
        assertEquals(1f,clock.value,.001f)
    }

    @Test fun reversingThemeStartsFromTheVisibleColorAndKeepsEndpoints() {
        val light=mutableStateOf(false);lateinit var palette:InterfacePalette
        compose.mainClock.autoAdvance=false
        compose.setContent {palette=rememberLiquidPalette(light.value,"glacier",false);Box{}}
        val dark=InterfacePalette(false,"glacier").surface
        assertEquals(dark,palette.surface)
        compose.runOnIdle {light.value=true}
        pumpUntil {palette.surface!=dark}
        val visible=palette.surface
        assertNotEquals(dark,visible)
        compose.runOnIdle {light.value=false}
        compose.mainClock.advanceTimeBy(32)
        assertTrue(kotlin.math.abs(palette.surface.red-visible.red)<.35f)
        compose.mainClock.advanceTimeBy(500);compose.waitForIdle()
        assertEquals(dark,palette.surface)
    }
}
