package io.github.huleixin.tingyu.lyrics

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import io.github.huleixin.tingyu.chrome.*
import io.github.huleixin.tingyu.minimal.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

// Render real Compose controls and overlay text; these screenshots are JVM evidence, not device tests.
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "zh-rCN-w393dp-h852dp-160dpi")
class DesktopLyricsRenderTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private fun save(name: String) { compose.runOnIdle {
        val view = compose.activity.window.decorView
        val bitmap = android.graphics.Bitmap.createBitmap(view.width, view.height, android.graphics.Bitmap.Config.ARGB_8888)
        view.draw(android.graphics.Canvas(bitmap)); val file = File("build/screenshots/lyrics/$name.png"); file.parentFile?.mkdirs()
        file.outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }; bitmap.recycle()
    } }
    // JVM software Canvas cannot create the Haze RenderScript Surface; verify full-page layout on the supported non-blur SDK path.
    @Test @Config(sdk=[30]) fun settingsUseAllThreePalettesAndRemainScrollable() {
        var light by mutableStateOf(false); var style by mutableStateOf("classic")
        compose.setContent { CompositionLocalProvider(LocalInterfacePalette provides InterfacePalette(light, style)) { LyricsSettingsSheet(compose.activity) {} } }
        for (mode in listOf("classic", "glacier-light", "glacier-dark")) {
            compose.runOnIdle { light = mode == "glacier-light"; style = if (mode == "classic") "classic" else "glacier" }
            compose.onNodeWithText("启用桌面歌词").assertIsDisplayed(); save("settings-$mode")
            compose.onNodeWithText("高亮颜色").performScrollTo().assertIsDisplayed()
            compose.onNodeWithText("启用桌面歌词").performScrollTo()
        }
    }
    @Test fun enlargedTextAndSongChangeNeverKeepTheOldLine() {
        var key by mutableStateOf("tx:1")
        compose.setContent {
            val s = MinimalPlayerState(playback = MinimalPlayback(MinimalTrack(key, title = "新歌曲"), epoch = key, source = MinimalClockSource.ENGINE),
                lyrics = MinimalLyrics("tx:1", "tx:1", status = MinimalLyricsStatus.READY, lines = listOf(MinimalLyricLine(0.0, 8.0, "若是无缘再见"))))
            CompositionLocalProvider(LocalDensity provides Density(1f, 1.5f)) { Box(Modifier.width(320.dp)) { DesktopLyricsView(LyricsProjection.at(s, 0), LyricsPreferencesState(style = DesktopLyricsStyle(fontSize = 30f)), { _, _ -> }, {}, {}, {}) } }
        }
        compose.onNodeWithContentDescription("若是无缘再见").assertIsDisplayed(); save("overlay-large-font")
        compose.runOnIdle { key = "tx:2" }; compose.onNodeWithContentDescription("若是无缘再见").assertDoesNotExist(); compose.onNodeWithContentDescription("新歌曲").assertIsDisplayed()
    }
    @Test @Config(sdk=[30]) fun bluetoothSettingsUseExistingPalettesAndShowExperimentalStatus() {
        var light by mutableStateOf(false); var style by mutableStateOf("classic")
        compose.setContent { CompositionLocalProvider(LocalInterfacePalette provides InterfacePalette(light, style)) {
            BluetoothLyricsSettingsSheet(compose.activity, {}) {}
        } }
        for (mode in listOf("classic", "glacier-light", "glacier-dark")) {
            compose.runOnIdle { light = mode == "glacier-light"; style = if (mode == "classic") "classic" else "glacier" }
            compose.onNodeWithText("实验功能 · 默认关闭").assertIsDisplayed(); save("bluetooth-$mode")
            compose.onNodeWithText("测试当前歌词（3 秒）").performScrollTo().assertIsDisplayed()
            compose.onNodeWithText("仅兼容部分车机").performScrollTo()
        }
    }
    @Test fun longSplitLinesKeepFullTextAndCompactIconActions() {
        val sentence = "这是一句很长很长的歌词需要跟随演唱进度滚动显示完整内容"
        val s = MinimalPlayerState(
            playback = MinimalPlayback(MinimalTrack("tx:long"), anchorPositionMs = 5000, epoch = "one", source = MinimalClockSource.ENGINE),
            lyrics = MinimalLyrics("tx:long", "one", status = MinimalLyricsStatus.READY, lines = listOf(
                MinimalLyricLine(0.0, 10.0, sentence), MinimalLyricLine(10.0, 20.0, "下一句靠右显示"))))
        compose.setContent { Box(Modifier.width(320.dp)) {
            DesktopLyricsView(LyricsProjection.at(s, 0), LyricsPreferencesState(style = DesktopLyricsStyle(splitLines = true)),
                { _, _ -> }, {}, {}, {})
        } }
        compose.onNodeWithContentDescription(sentence).assertIsDisplayed()
        compose.onNodeWithContentDescription("下一句靠右显示").assertIsDisplayed()
        compose.onNodeWithContentDescription("锁定").assertIsDisplayed()
        compose.onNodeWithContentDescription("关闭").assertIsDisplayed()
        val lock = compose.onNodeWithContentDescription("锁定").fetchSemanticsNode().boundsInRoot
        val close = compose.onNodeWithContentDescription("关闭").fetchSemanticsNode().boundsInRoot
        org.junit.Assert.assertEquals(lock.top, close.top, .1f)
        org.junit.Assert.assertTrue(close.left >= lock.right)
        save("overlay-long-split")
    }
}
