package io.github.huleixin.tingyu.minimal.immersive

import androidx.activity.ComponentActivity
import android.graphics.Bitmap
import android.graphics.Canvas
import java.io.File
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import io.github.huleixin.tingyu.chrome.LocalLiquidReduced
import io.github.huleixin.tingyu.minimal.*
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

// Actual Compose surface smoke test; fixture data tests routing, not upstream visual fidelity.
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w407dp-h885dp-480dpi")
class ImmersivePlayerSurfaceTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private fun visible(matcher: SemanticsMatcher): SemanticsNodeInteraction {
        val nodes = compose.onAllNodes(matcher)
        return nodes.fetchSemanticsNodes().indices.map { nodes[it] }.first { it.isDisplayed() }
    }
    private fun capture(name: String) {
        compose.runOnIdle {
            val view = compose.activity.window.decorView
            val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
            view.draw(Canvas(bitmap))
            val file = File("build/reports/immersive-surface/$name.png")
            file.parentFile!!.mkdirs()
            file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
            bitmap.recycle()
        }
    }
    private fun assertArtworkBelowActions() {
        val artwork = compose.onNodeWithTag("immersive-artwork").fetchSemanticsNode().boundsInRoot
        val collapse = visible(hasContentDescription("收起播放器")).fetchSemanticsNode().boundsInRoot
        assertTrue("Artwork overlaps collapse action: $artwork / $collapse", artwork.top >= collapse.bottom - 1f)
    }

    @Test fun coverLyricsQueueAndStageUseTheExistingCommandBridge() = exerciseSurface("portrait")

    @Test
    @Config(sdk = [34], qualifiers = "w885dp-h407dp-480dpi")
    fun landscapeCoverLyricsQueueKeepActionsClear() = exerciseSurface("landscape")

    // Exercise real resident layers and command routing at both aspect ratios.
    private fun exerciseSurface(orientation: String) {
        val actions = mutableListOf<String>()
        val commands = BridgeMinimalCommands(MinimalCommandSender { action, _ -> actions.add(action); true }) { true }
        val state = MinimalPlayerState(
            playback = MinimalPlayback(track = MinimalTrack(key="song", title="Surface song", artist="Surface artist", durationMs=180000),
                source=MinimalClockSource.BRIDGE, epoch="epoch"),
            lyrics = MinimalLyrics(songKey="song", epoch="epoch", status=MinimalLyricsStatus.READY,
                lines=listOf(MinimalLyricLine(0.0, 10.0, "Surface lyrics"))))
        val queue = MinimalQueue(version=1, currentIndex=0, currentKey="song", total=1,
            items=listOf(MinimalQueueItem("song#0", "song", "Queue fixture", "Surface artist")))
        compose.mainClock.autoAdvance = false
        compose.setContent {
            CompositionLocalProvider(LocalLiquidReduced provides true) {
                ImmersivePlayerHost(state, MinimalArtwork(), commands, queue, true, 0, {}, {}, {}, {},
                    modifier=Modifier.fillMaxSize())
            }
        }
        compose.mainClock.advanceTimeBy(1500)
        visible(hasText("Surface song")).assertIsDisplayed()
        assertArtworkBelowActions()
        capture("${orientation}-cover")
        visible(hasContentDescription("歌词舞台")).performClick()
        assertEquals(listOf(MinimalActions.OPEN_STAGE), actions)
        visible(hasContentDescription("歌词")).performClick()
        compose.mainClock.advanceTimeBy(1500)
        visible(hasContentDescription("歌词")).assertIsSelected()
        compose.onNodeWithText("Surface lyrics", useUnmergedTree = true).assertExists()
        assertArtworkBelowActions()
        capture("${orientation}-lyrics")
        visible(hasContentDescription("播放队列")).performClick()
        compose.mainClock.advanceTimeBy(1500)
        compose.onNodeWithText("播放队列 · 1").assertIsDisplayed()
        visible(hasText("Queue fixture")).assertExists()
        assertArtworkBelowActions()
        capture("${orientation}-queue")
        assertFalse(actions.any { it in listOf(MinimalActions.PLAY, MinimalActions.SEEK, MinimalActions.NEXT) })
    }
}
