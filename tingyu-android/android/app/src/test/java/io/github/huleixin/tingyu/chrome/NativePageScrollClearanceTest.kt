package io.github.huleixin.tingyu.chrome

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.dp
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/NativePageScrollClearanceTest.kt
// Real production lists: the final hot-search action/settings row must scroll above floating chrome.
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w393dp-h852dp-420dpi")
class NativePageScrollClearanceTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private fun page(id: String, sections: JSONArray) = NativePage.parse(JSONObject()
        .put("id", id).put("session", "scroll-test").put("viewportWidth", 393).put("width",393).put("height",600)
        .put("model", JSONObject().put("key",if(id=="settings")"settings:index" else "search:home").put("title","选项").put("sections",sections)))
    private fun check(page: NativePage, text: String, clearance: Float) {
        var density = 1f
        compose.setContent {
            density = LocalDensity.current.density
            CompositionLocalProvider(LocalNativePageBottomPx provides clearance*density) {
                NativePageView(page,Modifier.width(393.dp).height(600.dp)){_,_,_->}
            }
        }
        compose.onNode(hasScrollAction()).performScrollToNode(hasText(text))
        // Bring-into-view may use the full viewport under floating chrome; exercise the
        // requested end-of-scroll state, including the final content padding itself.
        repeat(2) { compose.onNode(hasScrollAction()).performTouchInput { swipeUp() } }
        compose.waitForIdle()
        compose.onNodeWithText(text).assertIsDisplayed()
        val bottom = compose.onNodeWithText(text).fetchSemanticsNode().boundsInRoot.bottom
        assertTrue("bottom=$bottom footer=${(600f-clearance+12f)*density}",bottom <= (600f-clearance+12f)*density)
    }
    @Test fun hotSearchExpandButtonClearsMiniPlayer() {
        val items=JSONArray();repeat(40){items.put(JSONObject().put("id","hot$it").put("title","热搜 $it").put("action","hot:$it"))}
        check(page("search",JSONArray().put(JSONObject().put("id","hot").put("title","热门搜索").put("layout","chips").put("items",items).put("more","expand").put("moreLabel","展开更多热搜"))),"展开更多热搜",148f)
    }
    @Test fun lastSearchResultClearsBothBars() {
        val sections=JSONArray()
        repeat(20){i->sections.put(JSONObject().put("id","suggest$i").put("layout","chips").put("items",JSONArray().put(JSONObject().put("id","r$i").put("title","搜索结果 $i").put("action","result:$i"))))}
        check(page("search",sections),"搜索结果 19",148f)
    }
    @Test fun lastSettingsGroupClearsNavigation() {
        val sections=JSONArray()
        repeat(18){i->sections.put(JSONObject().put("id","group$i").put("title","分组 $i").put("layout","rows").put("items",JSONArray().put(JSONObject().put("id","s$i").put("title","设置项目 $i").put("subtitle","说明").put("action","settings:$i"))))}
        check(page("settings",sections),"设置项目 17",96f)
    }
}
