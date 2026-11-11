package io.github.huleixin.tingyu.chrome

import androidx.activity.ComponentActivity
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.click
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import io.github.huleixin.tingyu.minimal.BridgeMinimalCommands
import io.github.huleixin.tingyu.minimal.MinimalArtwork
import io.github.huleixin.tingyu.minimal.MinimalCommandSender
import io.github.huleixin.tingyu.minimal.MinimalControls
import io.github.huleixin.tingyu.minimal.MinimalPlayback
import io.github.huleixin.tingyu.minimal.MinimalPlayerState
import io.github.huleixin.tingyu.minimal.MinimalTrack
import io.github.huleixin.tingyu.minimal.ui.MinimalPlayerScreen
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/MinimalPlayerFooterTest.kt
// 直接检查正式 Compose 页的语义与几何，不依赖 NATIVE 位图渲染。

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.LEGACY)
@Config(sdk = [34], qualifiers = "w393dp-h852dp-420dpi")
class MinimalPlayerFooterTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val page = mutableStateOf(0)
    private val controls = mutableStateOf(MinimalControls(
        canPrevious = true, canNext = true, bound = true, mode = "all",
        qualityLevel = "flac", qualityMode = "hires",
    ))
    private val events = mutableListOf<String>()
    private var sleepAnchor: Rect? = null
    private val toolLabels = listOf(
        "播放模式：列表循环", "定时关闭", "当前音质：FLAC，选择音质", "播放队列", "更多",
    )

    private fun start(live: Boolean = true) {
        val commands = BridgeMinimalCommands(MinimalCommandSender { action, _ ->
            events.add(action)
            true
        }, { live })
        val playback = MinimalPlayback(track = MinimalTrack(
            key = "test:footer", title = "Footer", artist = "Artist", durationMs = 180_000,
        ))
        compose.mainClock.autoAdvance = false
        compose.setContent {
            MinimalPlayerScreen(
                state = MinimalPlayerState(playback = playback, controls = controls.value),
                artwork = MinimalArtwork(), commands = commands,
                initialPage = page.value, resetToken = page.value,
                light = false, safeTop = 0f, safeBottom = 0f, detour = false,
                onCollapse = {}, onOpenStage = {},
                onOpenQueue = { events.add("nativeQueue") },
                onOpenTools = { events.add("nativeTools:$it") },
                onOpenSleep = { events.add("nativeSleep") },
                onSleepAnchor = { sleepAnchor = it },
            )
        }
        compose.mainClock.advanceTimeBy(500)
        compose.waitForIdle()
    }

    private fun bounds(label: String): Rect =
        compose.onNodeWithContentDescription(label).fetchSemanticsNode().boundsInRoot

    @Test
    fun artistNameAndWholeRowBothReachTheExistingArtistActionOnce() {
        start()
        compose.onAllNodes(hasText("Artist") and hasClickAction(),useUnmergedTree=true).assertCountEquals(1)
        compose.onNode(hasText("Artist") and hasClickAction(),useUnmergedTree=true).performTouchInput { click() }
        assertEquals(listOf("artistOpen"),events)
        events.clear()
        compose.onNodeWithContentDescription("打开歌手：Artist",useUnmergedTree=true).performTouchInput { click(androidx.compose.ui.geometry.Offset(width-2f,height/2f)) }
        assertEquals(listOf("artistOpen"),events)
    }

    @Test
    fun coverAndLyricsKeepSeekTransportAndFiveToolsInTheSamePositions() {
        start()
        val labels = listOf("播放进度", "上一首", "播放", "下一首") + toolLabels
        val cover = labels.map(::bounds)
        val tools = toolLabels.map(::bounds)
        assertTrue(cover[0].bottom <= cover[1].top)
        assertTrue(cover[2].bottom <= tools.first().top)
        tools.zipWithNext().forEach { (left, right) ->
            assertTrue(left.right <= right.left)
            assertEquals(left.center.y, right.center.y, 1f)
        }
        assertEquals(bounds("定时关闭"), sleepAnchor)

        compose.runOnIdle { page.value = 1 }
        compose.mainClock.advanceTimeBy(500)
        compose.waitForIdle()
        labels.zip(cover).forEach { (label, before) -> assertEquals(before, bounds(label)) }
    }

    @Test
    fun nativeSleepStaysAvailableWhenPlaybackBridgeIsUnavailable() {
        start(live = false)
        compose.onNodeWithContentDescription("播放").assertIsNotEnabled()
        compose.onNodeWithContentDescription("播放队列").assertIsNotEnabled()
        compose.onNodeWithContentDescription("定时关闭").assertIsEnabled().performClick()
        assertEquals(listOf("nativeSleep"), events)
    }

    @Test
    fun footerUsesActualQualityAndPreservesNativeToolsQueueAndDiagnosticActions() {
        start()
        compose.onNodeWithContentDescription(toolLabels[0]).performClick()
        compose.onNodeWithContentDescription(toolLabels[2]).performClick()
        compose.onNodeWithContentDescription("播放队列").performClick()
        compose.onNodeWithContentDescription("更多").performSemanticsAction(SemanticsActions.OnLongClick) { it() }
        assertEquals(listOf("loop", "nativeTools:quality", "nativeQueue", "diagBadge"), events)

        compose.runOnIdle {
            controls.value = controls.value.copy(qualityLevel = "hq", qualityMode = "master")
        }
        compose.mainClock.advanceTimeByFrame()
        compose.onNodeWithContentDescription("当前音质：HQ，选择音质").assertIsEnabled()
    }
}
