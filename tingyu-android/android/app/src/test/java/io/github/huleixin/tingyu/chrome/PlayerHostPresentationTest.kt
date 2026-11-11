package io.github.huleixin.tingyu.chrome

import androidx.activity.ComponentActivity
import androidx.compose.runtime.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import io.github.huleixin.tingyu.minimal.MinimalPlayerState
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/PlayerHostPresentationTest.kt
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.LEGACY)
@Config(sdk = [34])
class PlayerHostPresentationTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    @Composable private fun OldHost(source: MutableStateFlow<MinimalPlayerState>, record: (Long) -> Unit) {
        val state by source.collectAsState()
        val revision = state.revision
        SideEffect { record(revision) }
    }

    @Composable private fun IsolatedHost(source: MutableStateFlow<MinimalPlayerState>, record: (PlayerHostPresentation) -> Unit) {
        val projected = remember(source) { source.hostPresentations() }
        val state by projected.collectAsState(initial = source.value.hostPresentation())
        val presentation = state
        SideEffect { record(presentation) }
    }

    @Test fun revisionTrafficDoesNotInvalidateShellButEveryControlChangeArrives() {
        val source = MutableStateFlow(MinimalPlayerState())
        var oldCommits = 0; var isolatedCommits = 0
        var shown = PlayerHostPresentation()
        compose.setContent {
            OldHost(source) { oldCommits++ }
            IsolatedHost(source) { isolatedCommits++; shown = it }
        }
        compose.waitForIdle()
        val oldStart = oldCommits; val isolatedStart = isolatedCommits
        repeat(60) { frame ->
            compose.runOnIdle { source.value = source.value.copy(revision = frame + 1L) }
            compose.waitForIdle()
        }
        assertEquals(60, oldCommits - oldStart)
        assertEquals(0, isolatedCommits - isolatedStart)
        for (mode in listOf("shuffle", "one", "all", "off")) {
            compose.runOnIdle { source.value = source.value.copy(controls = source.value.controls.copy(mode = mode)) }
            compose.waitForIdle(); assertEquals(mode, shown.mode)
        }
        repeat(8) { token ->
            compose.runOnIdle { source.value = source.value.copy(controls = source.value.controls.copy(
                stageMotionDetour = token % 2 == 0, stageMotionToken = token + 1L)) }
            compose.waitForIdle(); assertEquals(token + 1L, shown.stageMotionToken)
            assertEquals(token % 2 == 0, shown.stageMotionDetour)
        }
        compose.runOnIdle { source.value = source.value.copy(playback = source.value.playback.copy(playing = true)) }
        compose.waitForIdle(); assertTrue(shown.playing)
        println("Shell invalidation reproduction: 60 revisions; full=60 projected=0 (controlled JVM Compose test, not device frames)")
    }

    @Test fun miniLyricScrollOffsetStaysStillForShortLinesAndTracksLongLinesWithinBounds() {
        // 短句不滚动
        assertEquals(0f, miniLyricScrollOffsetPx(textWidthPx = 140, containerWidthPx = 200, sungFraction = 0f), 0.001f)
        assertEquals(0f, miniLyricScrollOffsetPx(textWidthPx = 200, containerWidthPx = 200, sungFraction = 0.5f), 0.001f)
        assertEquals(0f, miniLyricScrollOffsetPx(textWidthPx = 180, containerWidthPx = 200, sungFraction = 1f), 0.001f)

        // 长句：起唱阶段在锚点前保持 0，中段平滑左移，末尾贴齐右边界不越界
        val textWidth = 400
        val containerWidth = 200
        val maxScroll = (textWidth - containerWidth).toFloat()
        assertEquals(0f, miniLyricScrollOffsetPx(textWidth, containerWidth, 0f), 0.001f)
        assertEquals(0f, miniLyricScrollOffsetPx(textWidth, containerWidth, 0.15f), 0.001f)
        val midScroll = miniLyricScrollOffsetPx(textWidth, containerWidth, 0.5f)
        assertTrue(midScroll > 0f && midScroll < maxScroll)
        assertEquals(maxScroll, miniLyricScrollOffsetPx(textWidth, containerWidth, 0.92f), 0.001f)
        assertEquals(maxScroll, miniLyricScrollOffsetPx(textWidth, containerWidth, 1f), 0.001f)
    }
}
