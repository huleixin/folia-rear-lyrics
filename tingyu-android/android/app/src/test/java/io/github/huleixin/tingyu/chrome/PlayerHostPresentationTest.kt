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
}
