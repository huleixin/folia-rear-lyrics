package io.github.huleixin.tingyu.chrome

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.dp
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/MediaDetailSearchTest.kt
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk=[34],qualifiers="w393dp-h852dp-420dpi")
class MediaDetailSearchTest {
    @get:Rule val compose=createAndroidComposeRule<ComponentActivity>()
    private fun page(open:Boolean,query:String):NativePage {
        val sections=JSONArray("""[
          {"id":"toolbar","layout":"chips","items":[{"id":"back","title":"返回"},{"id":"filterToggle","title":"搜索此歌单"},{"id":"menu","title":"更多"}]},
          {"id":"intro","layout":"rows","creator":"QQ音乐","items":[{"id":"cover","title":"测试歌单","subtitle":"3 首歌曲"}]},
          {"id":"controls","layout":"chips","items":[{"id":"play","title":"播放全部","action":"playAll"}]},
          {"id":"tracks","layout":"rows","total":1,"items":[{"id":"song","title":"测试歌曲","number":"01","action":"play:0"}]}
        ]""")
        if(open||query.isNotEmpty())sections.put(JSONObject().put("id","filter").put("layout","input").put("value",query)
            .put("placeholder","搜索此歌单").put("action","filter").put("more","filterClose").put("moreLabel","取消"))
        return NativePage.parse(JSONObject().put("id","collection").put("session","detail-test").put("viewportWidth",393).put("width",393).put("height",700)
            .put("model",JSONObject().put("key","collection:qa").put("title","测试歌单").put("leading","back").put("trailing","menu").put("sections",sections)))
    }
    @Test fun searchReplacesToolbarKeepsOneHeaderAndCanReopenRetainedQuery(){
        var open by mutableStateOf(false);var query by mutableStateOf("");var closes=0;var density=1f
        compose.setContent{
            density=LocalDensity.current.density
            NativePageView(page(open,query),Modifier.width(393.dp).height(700.dp)){id,text,_->when(id){
                "filterToggle"->open=true;"filterClose"->{open=false;closes++};"filter"->query=text
            }}
        }
        fun coverTop()=compose.onNodeWithText("测试歌单").fetchSemanticsNode().boundsInRoot.top
        val initial=coverTop()
        compose.onNodeWithContentDescription("搜索此歌单").performClick();compose.waitForIdle()
        compose.onNodeWithContentDescription("返回").assertDoesNotExist()
        compose.onNodeWithContentDescription("更多").assertDoesNotExist()
        val field=compose.onNode(hasSetTextAction() and isFocused())
        field.performTextInput("周杰伦")
        assertTrue("one toolbar, no additional search-row padding",kotlin.math.abs(coverTop()-initial)<3*density)
        compose.onNodeWithText("取消").performClick();compose.mainClock.advanceTimeBy(400);compose.waitForIdle()
        compose.onNodeWithContentDescription("返回").assertIsDisplayed();assertEquals(1,closes)
        compose.onNodeWithContentDescription("搜索此歌单").performClick();compose.waitForIdle()
        compose.onNode(hasSetTextAction()).assertTextEquals("周杰伦")
        compose.onNodeWithContentDescription("清空").performClick();compose.waitForIdle()
        compose.onNode(hasSetTextAction()).assert(SemanticsMatcher.expectValue(SemanticsProperties.EditableText,AnnotatedString("")))
        assertTrue(open)
    }
    @Test fun quickReopenCancelsThePendingCloseAndNeverShowsBothToolbars(){
        var searching by mutableStateOf(true);var closes=0
        val section=page(true,"").sections.first{it.id=="filter"}
        compose.mainClock.autoAdvance=false
        compose.setContent{MediaDetailToolbar("qa",searching,section,{_,_,_->},{searching=false},{closes++}){
            androidx.compose.material3.Text("原工具栏")
        }}
        compose.mainClock.advanceTimeBy(300)
        compose.runOnIdle{searching=false};compose.mainClock.advanceTimeBy(50)
        compose.runOnIdle{searching=true};compose.mainClock.advanceTimeBy(400)
        compose.onNodeWithText("原工具栏").assertDoesNotExist();compose.onNodeWithText("取消").assertIsDisplayed()
        assertEquals(0,closes)
    }
}
