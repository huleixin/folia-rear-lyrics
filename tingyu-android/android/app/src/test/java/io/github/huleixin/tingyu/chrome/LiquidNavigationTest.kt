package io.github.huleixin.tingyu.chrome

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.dp
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/LiquidNavigationTest.kt
// Exercise real Compose springs and pointer dispatch. JVM wall time is not device GPU frame time.
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w393dp-h852dp-420dpi")
class LiquidNavigationTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private lateinit var motion: LiquidNavMotion
    private fun motionProbe(initial: Int = 0) {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            val scope = rememberCoroutineScope()
            motion = remember { LiquidNavMotion(scope, initial) }
            Box(Modifier.size(100.dp).graphicsLayer { translationX = motion.value })
        }
    }
    @Test fun rapidRetargetKeepsPositionAndOnlyLastDestinationWins() {
        motionProbe(2)
        assertEquals(2f, motion.value, 0f)
        compose.runOnIdle { motion.select(0, false) }
        compose.mainClock.advanceTimeBy(96)
        val before = motion.value
        assertTrue(before > 0f && before < 2f)
        compose.runOnIdle { motion.select(3, false) }
        assertEquals(before, motion.value, .001f)
        repeat(10) { i ->
            compose.mainClock.advanceTimeBy(32)
            val pose = motion.value
            compose.runOnIdle { motion.select(i % 4, false) }
            assertEquals(pose, motion.value, .001f)
        }
        compose.runOnIdle { motion.select(1, false) }
        compose.mainClock.advanceTimeBy(2200)
        assertEquals(1f, motion.value, .002f)
        assertEquals(1f, motion.scaleX, .005f); assertEquals(1f, motion.scaleY, .005f)
        assertEquals(0f, motion.opticalProgress, .005f)
    }
    @Test fun clickVelocityDeformsAndDrivesOpticsWithoutASecondAnimationOwner() {
        motionProbe()
        compose.runOnIdle { motion.select(3, false) }
        var widest = 1f; var thinnest = 1f; var energy = 0f; var speedOptics = false
        repeat(30) {
            compose.mainClock.advanceTimeByFrame()
            widest = maxOf(widest, motion.scaleX); thinnest = minOf(thinnest, motion.scaleY)
            energy = maxOf(energy, motion.energy)
            speedOptics = speedOptics || motion.opticalProgress > motion.pressProgress + .02f
        }
        assertTrue("horizontal stretch $widest", widest > 1.08f)
        assertTrue("vertical contraction $thinnest", thinnest < .99f)
        assertTrue(energy > .1f); assertTrue("velocity contributes to refraction even during a press",speedOptics)
    }
    @Test fun dragReleaseStartsAtFingerPositionAndCancellationRestoresRoute() {
        motionProbe()
        compose.runOnIdle {
            motion.press(Offset(.5f, .5f), false); motion.startDrag(); motion.dragTo(1.7f, 2f)
        }
        assertEquals(1.7f, motion.value, 0f); assertEquals(2, motion.nearest())
        compose.runOnIdle { motion.select(motion.nearest(), false); motion.release(false) }
        assertEquals(1.7f, motion.value, .001f)
        compose.mainClock.advanceTimeBy(2000)
        assertEquals(2f, motion.value, .001f)
        compose.runOnIdle { motion.startDrag(); motion.dragTo(2.5f, 0f); motion.cancel(1, true) }
        compose.mainClock.advanceTimeByFrame()
        assertEquals(1f, motion.value, .001f)
    }
    private fun surface(selected: Int = 0, light: Boolean = true) = ChromeSurface.parse(JSONObject()
        .put("id", "nav").put("session", "test").put("viewportWidth", 393)
        .put("data", JSONObject().put("selected", selected).put("light", light)))

    // Robolectric desktop Skia cannot compile Kyant's Android child-shader lens.
    // API 32 exercises touch/layout/Backdrop blur; AGSL optics require a device.
    @Test @Config(sdk = [32]) fun aPillDragCommitsOneNavigationAndOrdinaryTabsRemainClickable() {
        val selected = mutableIntStateOf(0); val events = mutableListOf<Int>()
        compose.setContent {
            ChromeNavigation(surface(selected.intValue), rememberLayerBackdrop(), Modifier.width(393.dp).height(54.dp)) { name, value ->
                if (name == "navigate") { events.add(value.toInt()); selected.intValue = value.toInt() }
            }
        }
        compose.onNodeWithText("推荐").performTouchInput { swipe(center, center + Offset(245.dp.toPx(), 0f), 400) }
        compose.waitForIdle()
        assertEquals(listOf(3), events)
        compose.onNodeWithText("资料库").performClick(); compose.waitForIdle()
        assertEquals(listOf(3, 1), events)
        compose.onNodeWithText("推荐").assertExists(); compose.onNodeWithText("搜索").assertExists(); compose.onNodeWithText("设置").assertExists()
    }
    @Test @Config(sdk = [32]) fun coldAndExternalRouteSelectionNeverEmitsNavigation() {
        val selected = mutableIntStateOf(2); val events = mutableListOf<String>()
        compose.setContent {
            ChromeNavigation(surface(selected.intValue, false), rememberLayerBackdrop(), Modifier.width(393.dp).height(54.dp)) { name, _ -> events.add(name) }
        }
        compose.onNodeWithText("搜索").assertIsSelected()
        compose.runOnIdle { selected.intValue = 3 }; compose.waitForIdle()
        compose.onNodeWithText("设置").assertIsSelected(); assertTrue(events.isEmpty())
    }
}
