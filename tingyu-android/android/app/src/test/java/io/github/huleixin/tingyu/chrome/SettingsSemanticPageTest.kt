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

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/SettingsSemanticPageTest.kt
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w393dp-h852dp-420dpi")
class SettingsSemanticPageTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private fun page(flow: JSONObject): NativePage = NativePage.parse(JSONObject()
        .put("id", "settings").put("session", "semantic-test").put("viewportWidth", 393).put("width", 393).put("height", 700)
        .put("model", JSONObject().put("key", "settings:document:qa").put("title", "设置").put("sections", org.json.JSONArray())
            .put("document", JSONObject().put("flow", flow).put("paints", org.json.JSONArray()).put("controls", org.json.JSONArray()))))
    private fun flow(nodes: String, key: String = "playback") = JSONObject("""{"key":"$key","title":"播放控制","nodes":$nodes}""")

    @Test fun nativeInputsEchoImmediatelyCanBeClearedAndUseExistingActionNamespace() {
        var value by mutableStateOf("原值")
        val events = mutableListOf<Pair<String, String>>()
        compose.setContent {
            val f = flow("""[{"id":"token","kind":"input","title":"API 密钥","value":"$value","immediate":true,"inputType":"password"}]""")
            NativePageView(page(f), Modifier.width(393.dp).height(700.dp)) { id, text, _ -> events += id to text; if (id.startsWith("submit:")) value = text }
        }
        compose.onNode(hasSetTextAction()).performTextReplacement("新的密钥")
        compose.waitForIdle(); assertEquals("新的密钥", value)
        compose.onNode(hasSetTextAction()).performTextClearance(); compose.waitForIdle()
        assertEquals("", value); assertTrue(events.filter { it.first.startsWith("submit:") }.all { it.first == "submit:token" })
        compose.onNodeWithText("确定").assertDoesNotExist()
    }
    @Test fun nestedNativePageReplacesContentAndBackRemainsAvailableOnNarrowScreens() {
        var child by mutableStateOf(false)
        compose.setContent {
            val f = if (child) flow("""[{"id":"reset","kind":"action","title":"重置偏移"}]""", "offset")
            else flow("""[{"id":"offset","kind":"action","title":"全局时间偏移"}]""")
            NativePageView(page(f), Modifier.width(320.dp).height(700.dp)) { id, _, _ -> if (id == "act:offset") child = true else if (id == "back") child = false }
        }
        compose.onNodeWithText("全局时间偏移").performClick(); compose.waitForIdle()
        compose.onNodeWithText("全局时间偏移").assertDoesNotExist(); compose.onNodeWithText("重置偏移").assertIsDisplayed()
        compose.onNodeWithContentDescription("返回").performClick(); compose.waitForIdle()
        compose.onNodeWithText("全局时间偏移").assertIsDisplayed(); assertFalse(child)
    }
    @Test fun nativeModalOwnsConfirmationAndDismissalWithoutChangingUnderlyingPage() {
        var modal by mutableStateOf(true); val events = mutableListOf<String>()
        compose.setContent {
            val f = flow("""[{"id":"clear","kind":"action","title":"清理缓存"}]""")
            if (modal) f.put("modal", JSONObject("""{"key":"confirm","title":"确认清理","nodes":[{"id":"confirm","kind":"action","title":"确认删除"}]}"""))
            NativePageView(page(f), Modifier.width(393.dp).height(700.dp)) { id, _, _ -> events += id; modal = false }
        }
        compose.onNodeWithText("确认删除").performClick(); compose.waitForIdle()
        assertEquals(listOf("act:confirm"), events); compose.onNodeWithText("清理缓存").assertIsDisplayed()
    }
    @Test fun richKindsAndModalParseWithoutBrowserRectanglesAndPreserveDisabledOptions() {
        val parsed = TySettingsPage.parse(JSONObject("""{"key":"theme","title":"外观","nodes":[
            {"id":"c","kind":"color","value":"#123456"}, {"id":"p","kind":"preview","min":240},
            {"id":"i","kind":"image","value":"https://example.invalid/qr.png"},
            {"id":"s","kind":"select","options":[{"value":"x","label":"不可用","disabled":true}]}],
            "modal":{"key":"m","nodes":[],"modal":{"key":"ignored","nodes":[]}}}"""))
        assertEquals(listOf("color", "preview", "image", "select"), parsed.nodes.map { it.kind })
        assertTrue(parsed.nodes.last().options.first().disabled); assertNull(parsed.modal?.modal)
    }
    @Test fun invalidFlowIsRejectedRatherThanSilentlyBecomingAnEmptyMeasuredPage() {
        try {
            NativeSettingsDocument.parse(JSONObject().put("flow", JSONObject().put("title", "x".repeat(400001))))
            fail("invalid flow must not silently lose its controls")
        } catch (_: IllegalArgumentException) { }
        val nodes = org.json.JSONArray()
        repeat(500) { nodes.put(JSONObject().put("id", "n$it").put("kind", "note").put("title", "说明")) }
        nodes.put(JSONObject().put("id", "confirm").put("kind", "action").put("title", "确认导入"))
        val f = TySettingsPage.parse(JSONObject().put("nodes", nodes))
        assertEquals("确认导入", f.nodes.last().title)
    }
    @Test fun selectiveImportCheckboxRetainsItsMixedStateAndOriginalHandler() {
        var value by mutableStateOf("mixed"); val events = mutableListOf<String>()
        compose.setContent {
            val f = flow("""[{"id":"theme","kind":"checkbox","title":"主题配置","value":"$value"}]""")
            NativePageView(page(f), Modifier.width(393.dp).height(700.dp)) { id, text, _ -> events += id; value = text }
        }
        compose.onNodeWithText("主题配置").performClick(); compose.waitForIdle()
        assertEquals(listOf("set:theme"), events); assertEquals("1", value)
    }
    @Test fun nativeOrderingEmitsOnePermutationAndRetainsEveryFormat() {
        var result = ""
        compose.setContent {
            val f = flow("""[{"id":"formats","kind":"reorder","title":"格式优先级","placeholder":"上移","confirmLabel":"下移",
                "options":[{"value":"lrc","label":".lrc"},{"value":"ttml","label":".ttml"},{"value":"ass","label":".ass"}]}]""")
            NativePageView(page(f), Modifier.width(393.dp).height(700.dp)) { id, text, _ -> assertEquals("act:formats", id); result = text }
        }
        compose.onNodeWithContentDescription("下移 .lrc").performClick(); compose.waitForIdle()
        assertEquals("[\"ttml\",\"lrc\",\"ass\"]", result)
    }
}
