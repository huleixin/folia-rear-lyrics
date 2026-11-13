package io.github.huleixin.tingyu.chrome

import androidx.activity.ComponentActivity
import androidx.compose.runtime.*
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.dp
import org.junit.Rule
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.json.JSONObject
import java.io.File

// Render the actual Android poster rail, not a web mock. Verify browse CTA alignment and click.
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "zh-rCN-w375dp-h817dp-160dpi")
class HomeHeroEntryRenderTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    @Test fun browseEntryUsesPosterLeftEdgeAndOpensExactlyOnce() {
        val page = NativePage.parse(JSONObject("""{
            "id":"home","session":"hero-test","viewportWidth":375,
            "model":{"key":"hero-test","sections":[{"id":"hero","layout":"hero","items":[
                {"id":"guess-you-like","title":"猜你\n喜欢","subtitle":"为你而来的\n私人电台",
                 "image":"file:///android_asset/public/assets/mobile-home/guess-you-like.png",
                 "secondaryLabel":"查看歌曲","action":"browse-fm"}]}]}
        }"""))
        var clicked = 0
        compose.setContent { CompositionLocalProvider(LocalInterfacePalette provides InterfacePalette(true, "glacier")) {
            NativeHeroRail(page.sections.first(),375f,22.dp,22.dp,false,false) { action,_,_ ->
                assertEquals("browse-fm", action); clicked++
            }
        } }
        val label = compose.onNodeWithText("查看歌曲")
        label.assertIsDisplayed()
        val subtitle = compose.onNodeWithText("为你而来的\n私人电台", useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
        val bounds = compose.onNodeWithText("查看歌曲", useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
        assertEquals(subtitle.left, bounds.left, .5f)
        assertTrue(bounds.top - subtitle.bottom >= 12f)
        label.performClick()
        compose.runOnIdle { assertEquals(1, clicked)
            val view = compose.activity.window.decorView
            val bitmap = android.graphics.Bitmap.createBitmap(view.width,view.height,android.graphics.Bitmap.Config.ARGB_8888)
            view.draw(android.graphics.Canvas(bitmap))
            val file = File("build/screenshots/home/hero-browse.png");file.parentFile?.mkdirs()
            file.outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it) };bitmap.recycle()
        }
    }
}
