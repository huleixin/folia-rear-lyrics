package io.github.huleixin.tingyu.chrome

import android.graphics.Bitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

// Must run on an Android device/emulator. Compilation alone is not visual acceptance.
@RunWith(AndroidJUnit4::class)
class RearSettingsDeviceTest {
    @get:Rule val ui = createAndroidComposeRule<RearSettingsPreviewActivity>()
    @Test fun modesThemesWidthsAndLargeFontsRenderNativeControls() {
        for (width in listOf(320,360,393)) for (light in listOf(false,true)) for (backend in listOf("lsp","shizuku")) {
            ui.runOnIdle { ui.activity.width=width; ui.activity.light=light; ui.activity.backend=backend; ui.activity.advanced=false; ui.activity.fontScale=if(width==320)1.5f else 1f }
            ui.onNodeWithText(if(backend=="lsp") "LSPosed 模块" else "Shizuku 服务").assertIsDisplayed()
            ui.onNodeWithContentDescription("背屏歌词").performClick()
            ui.runOnIdle { assertEquals("rear:toggle",ui.activity.calls.last()) }
            val file=File(ui.activity.externalCacheDir,"rear-$backend-$width-$light-native.png")
            file.outputStream().use { ui.onRoot().captureToImage().asAndroidBitmap().compress(Bitmap.CompressFormat.PNG,100,it) }
            ui.runOnIdle { ui.activity.advanced=true }
            ui.onNodeWithText("Legacy",substring=true).performClick()
            ui.runOnIdle { assertEquals("engine:legacy",ui.activity.calls.last()) }
            ui.onNodeWithContentDescription("返回").performClick()
            ui.runOnIdle { assertEquals("rear:back",ui.activity.calls.last()) }
        }
    }
    @Test fun enabledBackendIsNotClickableAndMountDoesNotStartServices() {
        ui.runOnIdle { assertTrue(ui.activity.calls.isEmpty());ui.activity.enabled=true }
        ui.onNodeWithText("Shizuku",useUnmergedTree=true).assert(hasAnyAncestor(isNotEnabled()))
        ui.onNodeWithContentDescription("背屏歌词").performClick()
        ui.runOnIdle { assertEquals(listOf("rear:toggle"),ui.activity.calls) }
        ui.activityRule.scenario.recreate();ui.waitForIdle()
        ui.runOnIdle { assertTrue(ui.activity.calls.isEmpty()) }
    }
}
