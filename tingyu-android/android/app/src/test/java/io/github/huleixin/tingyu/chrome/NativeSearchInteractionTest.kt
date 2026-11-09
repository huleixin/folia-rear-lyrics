package io.github.huleixin.tingyu.chrome

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
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

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/NativeSearchInteractionTest.kt
// Exercise production Compose fields/menus/measurement, not a second UI implementation.
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk=[34],qualifiers="w393dp-h852dp-420dpi")
class NativeSearchInteractionTest {
    @get:Rule val compose=createAndroidComposeRule<ComponentActivity>()
    private fun page(expanded:Boolean=false,tabs:Boolean=false,width:Int=393):NativePage {
        val sources=JSONArray();listOf("QQ音乐","本地","Navidrome").forEachIndexed{i,title->sources.put(JSONObject().put("id","s$i").put("title",title).put("action","source:$i").put("selected",i==0))}
        val hot=JSONArray();repeat(if(expanded)32 else 10){hot.put(JSONObject().put("id","hot$it").put("title","热搜 ${it+1}").put("action","hot:$it"))}
        val sections=JSONArray().put(JSONObject().put("id","query").put("layout","input").put("placeholder","搜索歌曲").put("action","change").put("submit","submit"))
            .put(JSONObject().put("id","sources").put("layout","chips").put("items",sources))
            .put(JSONObject().put("id","hot").put("layout","chips").put("title","热门搜索").put("items",hot).put("more","hotExpand").put("moreLabel",if(expanded)"收起" else "查看更多").put("expanded",expanded))
        if(tabs)sections.put(JSONObject().put("id","tabs").put("layout","chips").put("items",JSONArray().put(JSONObject().put("id","song").put("title","单曲").put("action","tab:song"))))
        return NativePage.parse(JSONObject().put("id","search").put("session","search-ui-test").put("viewportWidth",width).put("width",width).put("height",600)
            .put("model",JSONObject().put("key","search:qq").put("leading","close").put("sections",sections)))
    }
    @Test fun compactSourceMenuKeepsInputAndSubmitReachable()=checkCompactSourceMenu(false)
    @Test fun lightCompactSourceMenuKeepsInputAndSubmitReachable()=checkCompactSourceMenu(true)
    private fun checkCompactSourceMenu(light:Boolean){
        val events=mutableListOf<Pair<String,String>>();var density=1f
        compose.setContent{
            density=LocalDensity.current.density
            CompositionLocalProvider(LocalInterfacePalette provides InterfacePalette(light)){
                Box(Modifier.width(320.dp).height(600.dp)){NativePageView(page(width=320),Modifier.fillMaxSize()){id,text,_->events.add(id to text)}}
            }
        }
        val input=compose.onNode(hasSetTextAction())
        assertTrue("narrow search input must remain usable",input.fetchSemanticsNode().boundsInRoot.width>=100*density)
        compose.onNodeWithContentDescription("搜索音源：QQ音乐").performClick()
        compose.onNodeWithText("Navidrome").performClick()
        assertTrue(events.contains("source:2" to ""))
        input.performTextInput("许嵩");input.performImeAction()
        assertTrue(events.contains("change" to "许嵩"));assertTrue(events.contains("submit" to "许嵩"))
    }
    @Test fun hotActionIsInHeadingAndExpansionKeepsOrdering(){
        var expanded by mutableStateOf(false)
        compose.setContent{NativePageView(page(expanded),Modifier.width(393.dp).height(600.dp)){id,_,_->if(id=="hotExpand")expanded=!expanded}}
        val heading=compose.onNodeWithText("热门搜索").fetchSemanticsNode().boundsInRoot
        val button=compose.onNodeWithText("查看更多").fetchSemanticsNode().boundsInRoot
        assertTrue("toggle must share the title row: title=$heading toggle=$button",
            button.left>=heading.right-1f&&button.top<heading.bottom&&button.bottom>heading.top)
        compose.onNodeWithText("热搜 10").assertExists();compose.onNodeWithText("热搜 11").assertDoesNotExist()
        compose.onNodeWithText("查看更多").performClick();compose.waitForIdle()
        compose.onNodeWithText("收起").assertExists();compose.onNodeWithText("热搜 32").assertExists()
        compose.onNodeWithText("收起").performClick();compose.waitForIdle()
        compose.onNodeWithText("热搜 11").assertDoesNotExist()
    }
    @Test fun glassHeaderRemeasuresWhenResultCategoriesAppearAndDisappear(){
        var tabs by mutableStateOf(false);var density=1f
        compose.setContent{density=LocalDensity.current.density;NativePageView(page(tabs=tabs),Modifier.width(393.dp).height(600.dp)){_,_,_->}}
        fun top()=compose.onNodeWithText("热门搜索").fetchSemanticsNode().boundsInRoot.top
        val initial=top()
        val fieldBottom=compose.onNodeWithContentDescription("搜索音源：QQ音乐").fetchSemanticsNode().boundsInRoot.bottom
        // Preserve the existing 32dp glass tail + list/heading spacing, but no former source row.
        assertTrue("unexpected gap: heading=$initial fieldBottom=$fieldBottom",initial-fieldBottom<(TyTopGlass.TailDp+36)*density)
        compose.runOnIdle{tabs=true};compose.waitForIdle();assertTrue(top()>initial+35*density)
        compose.runOnIdle{tabs=false};compose.waitForIdle();assertTrue(kotlin.math.abs(top()-initial)<2*density)
    }
    @Test fun localLibraryRetainsSourceToolsAndSearchOverlay()=checkLocalLibrary(false)
    @Test fun lightLocalLibraryRetainsSourceToolsAndSearchOverlay()=checkLocalLibrary(true)
    private fun checkLocalLibrary(light:Boolean){
        val events=mutableListOf<Pair<String,String>>()
        val sections=JSONArray().put(JSONObject().put("id","library-tools").put("layout","message").put("title","更多").put("action","tools"))
            .put(JSONObject().put("id","filter").put("layout","input").put("placeholder","搜索资料库").put("action","filter"))
            .put(JSONObject().put("id","local-sections").put("layout","chips").put("items",JSONArray().put(JSONObject().put("id","songs").put("title","歌曲").put("action","songs"))))
        val local=NativePage.parse(JSONObject().put("id","home").put("session","local-ui-test").put("viewportWidth",320).put("width",320).put("height",600)
            .put("model",JSONObject().put("key","library:local:songs").put("title","我的音乐").put("trailing","sources").put("trailingLabel","本地音乐").put("sections",sections)))
        compose.setContent{CompositionLocalProvider(LocalInterfacePalette provides InterfacePalette(light)){
            NativePageView(local,Modifier.width(320.dp).height(600.dp)){id,text,_->events.add(id to text)}
        }}
        compose.onNodeWithText("本地音乐").performClick();assertTrue(events.contains("sources" to ""))
        compose.onNodeWithContentDescription("更多").performClick();assertTrue(events.contains("tools" to ""))
        compose.onNode(hasText("搜索资料库") and isNotEnabled()).performTouchInput{click()};compose.waitForIdle()
        compose.onNode(hasSetTextAction() and isFocused()).performTextInput("周杰伦")
        assertTrue(events.contains("filter" to "周杰伦"))
        compose.onNodeWithText("取消").performClick();compose.waitForIdle()
        compose.onNodeWithText("本地音乐").assertIsDisplayed()
    }
}
