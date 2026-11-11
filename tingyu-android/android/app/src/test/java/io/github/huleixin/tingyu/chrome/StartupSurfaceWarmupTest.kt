package io.github.huleixin.tingyu.chrome

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import io.github.huleixin.tingyu.minimal.BridgeMinimalCommands
import io.github.huleixin.tingyu.minimal.MinimalPlayerRuntime
import io.github.huleixin.tingyu.minimal.MinimalQueue
import io.github.huleixin.tingyu.minimal.cover.CoverStackArtwork
import io.github.huleixin.tingyu.minimal.cover.CoverStackState
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/StartupSurfaceWarmupTest.kt
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.LEGACY)
@Config(sdk = [34], qualifiers = "w393dp-h852dp-420dpi")
class StartupSurfaceWarmupTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    @Test fun startupWarmupComposesAllInteractiveSurfacesAndMeasuresPlayerArtwork() {
        val context = compose.activity
        val cache = NativeShellCache(context)
        val minimal = MinimalPlayerRuntime.get(context)
        val commands = BridgeMinimalCommands({ _, _ -> true }, { true })
        val stack = CoverStackState()
        val artwork = CoverStackArtwork(context)
        val anchor = PlayerArtworkAnchor()
        var completed = false
        try {
            compose.setContent {
                StartupSurfaceWarmup(
                    cache = cache,
                    width = 393f,
                    height = 852f,
                    safeTop = 24f,
                    safeBottom = 20f,
                    minimal = minimal,
                    minimalCommands = commands,
                    queueState = MinimalQueue(),
                    coverStack = stack,
                    coverArtwork = artwork,
                    playerArtwork = anchor,
                    interfaceLight = false,
                    minimalEnabled = true,
                    onDone = { completed = true },
                )
                // Also verify that a partial/boot collection page without intro/controls never throws.
                MediaDetailScaffold(cache.page("collection", 393f, 852f, 24f), Modifier.fillMaxSize()) { _, _, _ -> }
            }
            compose.waitForIdle()
            assertTrue(completed)
            assertNotNull(anchor.bounds)
        } finally {
            artwork.release()
        }
    }
}
