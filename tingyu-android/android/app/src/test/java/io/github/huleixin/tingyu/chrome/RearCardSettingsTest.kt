package io.github.huleixin.tingyu.chrome

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.dp
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/RearCardSettingsTest.kt
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w393dp-h852dp-160dpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class RearCardSettingsTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    @Test fun bothCardPreferencesRenderAsSwitchesAndDispatchTheirOriginalActions() {
        var aod by mutableStateOf(true)
        var awake by mutableStateOf(false)
        val events = mutableListOf<String>()
        compose.setContent {
            val page = NativePage.parse(JSONObject("""{"id":"settings","session":"qa","width":393,"height":852,"viewportWidth":393,"model":{"key":"settings:rear:advanced","title":"高级设置","sections":[{"id":"rear-aod","title":"原生卡片显示","layout":"rows","items":[{"id":"aod","title":"跟随系统背屏 AOD 设置","subtitle":"系统允许时显示静态歌词","action":"rear:aod","selected":$aod},{"id":"keep-awake","title":"背屏歌词常亮","subtitle":"主屏可熄灭，退出卡片后恢复系统规则","action":"rear:keep-awake","selected":$awake}]}]}}"""))
            CompositionLocalProvider(LocalInterfacePalette provides InterfacePalette(true)) {
                NativeRearControlPage(page, Modifier.width(393.dp).height(852.dp), 1f) { id, _, _ ->
                    events += id
                    if (id == "rear:aod") aod = !aod else if (id == "rear:keep-awake") awake = !awake
                }
            }
        }
        compose.onNodeWithContentDescription("跟随系统背屏 AOD 设置").assertIsOn().performClick().assertIsOff()
        compose.onNodeWithContentDescription("背屏歌词常亮").assertIsOff().performClick().assertIsOn()
        assertEquals(listOf("rear:aod", "rear:keep-awake"), events)
        val output = System.getenv("TINGYU_LAYOUT_SCREENSHOTS") ?: return
        compose.runOnIdle {
            val bitmap = android.graphics.Bitmap.createBitmap(393, 852, android.graphics.Bitmap.Config.ARGB_8888)
            compose.activity.window.decorView.draw(android.graphics.Canvas(bitmap))
            val file = java.io.File(output, "native-card-switches.png"); file.parentFile?.mkdirs()
            file.outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }; bitmap.recycle()
        }
    }
}
