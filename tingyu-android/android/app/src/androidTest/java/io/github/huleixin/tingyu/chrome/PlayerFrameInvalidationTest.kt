package io.github.huleixin.tingyu.chrome

import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import io.github.huleixin.tingyu.minimal.PlayerPanelState
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

// android/app/src/androidTest/java/io/github/huleixin/tingyu/chrome/PlayerFrameInvalidationTest.kt
// Verify draw-phase subscriptions independently of device buffer preservation.
@RunWith(AndroidJUnit4::class)
class PlayerFrameInvalidationTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    @Test fun draggingAndSettlingRedrawTheRootWithoutSceneRecomposition() {
        compose.mainClock.autoAdvance = false
        lateinit var panel: PlayerPanelState
        var scenes = 0
        var draws = 0
        compose.setContent {
            scenes++
            val scope = rememberCoroutineScope()
            panel = remember { PlayerPanelState(scope) }
            val leaving = remember { mutableStateOf(0f) }
            Box(Modifier.size(120.dp, 240.dp)
                .drawWithContent { draws++; drawContent() }
                .playerFrameUnderlay(panel, leaving)) {
                Box(Modifier.size(100.dp, 20.dp).graphicsLayer {
                    translationY = 200f * (1f - panel.progress)
                }.background(Color.White.copy(alpha = .5f)))
            }
        }
        compose.runOnIdle { panel.open(true); panel.beginDrag() }
        compose.mainClock.advanceTimeByFrame(); compose.waitForIdle()
        val initialScenes = scenes
        var lastDraws = draws
        for (delta in listOf(50f, 70f, -40f)) {
            compose.runOnIdle { panel.dragBy(delta, 200f) }
            compose.mainClock.advanceTimeByFrame(); compose.waitForIdle()
            assertTrue("root did not redraw after drag $delta", draws > lastDraws)
            assertEquals(initialScenes, scenes)
            lastDraws = draws
        }
        compose.runOnIdle { panel.open(false) }
        compose.mainClock.advanceTimeBy(96); compose.waitForIdle()
        assertTrue(panel.progress in .01f.. .99f)
        assertTrue("root did not redraw while settling", draws > lastDraws)
        assertEquals(initialScenes, scenes)
        compose.mainClock.advanceTimeBy(320); compose.waitForIdle()
        assertEquals(1f, panel.progress, .0001f)
    }
}
