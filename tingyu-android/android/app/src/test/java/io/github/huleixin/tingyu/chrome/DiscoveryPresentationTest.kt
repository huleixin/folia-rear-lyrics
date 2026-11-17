package io.github.huleixin.tingyu.chrome

import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/DiscoveryPresentationTest.kt
// Production Compose components; sample labels are test fixtures, never app recommendation data.
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk=[34],qualifiers="zh-rCN-w393dp-h852dp-160dpi")
class DiscoveryPresentationTest {
    @get:Rule val compose=createAndroidComposeRule<ComponentActivity>()
    private fun capture(name:String) {
        compose.runOnIdle {
            val view=compose.activity.window.decorView
            val bitmap=android.graphics.Bitmap.createBitmap(view.width,view.height,android.graphics.Bitmap.Config.ARGB_8888)
            view.draw(android.graphics.Canvas(bitmap))
            val file=File("build/reports/discovery-ui/"+name+".png");file.parentFile!!.mkdirs()
            file.outputStream().use{bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()
        }
    }
    @Test fun heroAndRadarsFitFourThemesAndSmallScreenWithLargeFont() {
        val page=NativePage.parse(JSONObject("""{"id":"home","session":"discovery-test","viewportWidth":393,"model":{"key":"home:discovery:test","sections":[
            {"id":"hero","layout":"discoveryHero","items":[{"id":"roam","title":"听屿漫游","subtitle":"让熟悉与未知，在下一首相遇","action":"roam","secondaryLabel":"立即漫游"}]},
            {"id":"radars","layout":"radarCards","items":[
                {"id":"style","title":"风格雷达","subtitle":"歌手与音乐的关联","action":"style","secondary":"style:play"},
                {"id":"time","title":"时光雷达","subtitle":"重逢旧日旋律","action":"time","secondary":"time:play"},
                {"id":"explore","title":"探索雷达","subtitle":"发现未听过的音乐","action":"explore","secondary":"explore:play"}]}]}}"""))
        var width by mutableIntStateOf(393);var font by mutableFloatStateOf(1f)
        var palette by mutableStateOf(InterfacePalette(true,"glacier"))
        val actions=mutableListOf<String>()
        compose.setContent {
            CompositionLocalProvider(LocalInterfacePalette provides palette,LocalDensity provides Density(1f,font)) {
                Column(Modifier.width(width.dp).background(palette.backgrounds.first()).padding(16.dp)) {
                    DiscoveryHero(page.sections[0]){id,_,_->actions+=id}
                    Spacer(Modifier.height(24.dp))
                    DiscoveryRadars(page.sections[1]){id,_,_->actions+=id}
                }
            }
        }
        for(w in listOf(393,320))for(style in listOf("classic","glacier"))for(light in listOf(true,false)) {
            compose.runOnIdle{width=w;font=if(w==320)1.3f else 1f;palette=InterfacePalette(light,style)};compose.waitForIdle()
            val hero=compose.onNodeWithTag("discovery-hero").fetchSemanticsNode().boundsInRoot
            assertEquals((w-32).toFloat(),hero.width,.5f)
            assertTrue(hero.height>=136f)
            if(w==393)assertTrue("Default hero should remain compact",hero.height<=152f)
            compose.onNodeWithText("立即漫游").assertIsDisplayed().performClick();assertEquals("roam",actions.last())
            compose.onNodeWithText("时光雷达",useUnmergedTree=true).performClick();assertEquals("time",actions.last())
            val widths=page.sections[1].items.map { item->
                val card=compose.onNodeWithTag("discovery-radar:"+item.id).fetchSemanticsNode().boundsInRoot
                val title=compose.onNodeWithText(item.title,useUnmergedTree=true)
                title.assertIsDisplayed()
                val bounds=title.fetchSemanticsNode().boundsInRoot
                assertTrue(bounds.left>=card.left&&bounds.right<=card.right)
                val layouts=mutableListOf<androidx.compose.ui.text.TextLayoutResult>()
                title.performSemanticsAction(SemanticsActions.GetTextLayoutResult){it(layouts)}
                assertTrue(layouts.isNotEmpty())
                layouts.forEach { result ->
                    // Android text metrics can exceed their rounded pixel width by a tiny fraction.
                    assertTrue(result.multiParagraph.height<=result.size.height+.5f)
                    repeat(result.lineCount) { line ->
                        assertFalse(result.isLineEllipsized(line))
                        assertTrue(result.getLineRight(line)-result.getLineLeft(line)<=result.size.width+.5f)
                    }
                    assertEquals(item.title.length,result.getLineEnd(result.lineCount-1))
                }
                card.width
            }
            assertTrue(widths.max()-widths.min()<=1f)
            compose.onNodeWithContentDescription("播放风格雷达").performClick();assertEquals("style:play",actions.last())
            capture("home-"+style+"-"+(if(light)"light" else "dark")+"-"+w)
        }
    }
    @Test fun sourceControlsUseOneRowAndDisabledWeightCannotOpen() {
        var enabled by mutableStateOf(true)
        val events=mutableListOf<Pair<String,String>>()
        compose.setContent {
            val flow=TySettingsPage.parse(JSONObject("""{"key":"discovery","nodes":[{"id":"s","kind":"source","title":"网易云音乐","value":""""+(if(enabled)"1" else "0")+"""","detail":"1","options":[{"value":"1","label":"1×"},{"value":"2","label":"2×"}]}]}"""))
            CompositionLocalProvider(LocalInterfacePalette provides InterfacePalette(true,"glacier")) {
                TySettingsPageView(flow,settingsFlowTheme(),Modifier.width(320.dp).height(400.dp)){id,text,_->events+=id to text;if(id=="set:s")enabled=text=="1"}
            }
        }
        compose.onNodeWithContentDescription("网易云音乐推荐权重").performClick()
        compose.onNodeWithText("2×").performClick();assertEquals("act:s" to "weight:2",events.last())
        compose.onNodeWithContentDescription("网易云音乐").performClick();assertEquals("set:s" to "0",events.last())
        compose.onNodeWithContentDescription("网易云音乐推荐权重").performClick()
        compose.onNodeWithText("2×").assertDoesNotExist()
        capture("settings-source-disabled")
    }
    @Test fun settingsGroupsSlidersAndBottomActionRemainReachableAcrossThemes() {
        val flow=JSONObject("""{"key":"discovery","title":"推荐设置","nodes":[
            {"id":"personal","kind":"group","title":"个性化推荐"},
            {"id":"record","kind":"switch","title":"个性化记录","value":"1","hint":"仅保存在本机"},
            {"id":"local","kind":"switch","title":"包含本地音乐","value":"1"},
            {"id":"preferences","kind":"group","title":"推荐偏好"},
            {"id":"exploration","kind":"slider","title":"音乐探索程度","hint":"提高未听过歌曲的推荐权重","value":"20","min":0,"max":100,"step":1,"unit":"%"},
            {"id":"crossArtist","kind":"slider","title":"跨歌手探索程度","value":"30","min":0,"max":100,"step":1,"unit":"%"},
            {"id":"familiarity","kind":"slider","title":"熟悉音乐比例","value":"50","min":0,"max":100,"step":1,"unit":"%"},
            {"id":"sources","kind":"group","title":"综合推荐来源"},
            {"id":"netease","kind":"source","title":"网易云音乐","value":"1","detail":"1","options":[{"value":"1","label":"1×"}]},
            {"id":"qq","kind":"source","title":"QQ音乐","value":"1","detail":"1"},
            {"id":"kugou","kind":"source","title":"酷狗音乐","value":"0","detail":"1"},
            {"id":"layout","kind":"group","title":"页面管理"},
            {"id":"modules","kind":"moduleOrder","value":"[]","options":[{"value":"roam","label":"听屿漫游"},{"value":"radars","label":"你的专属雷达"},{"value":"songs","label":"猜你想听"}]},
            {"id":"resetLayout","kind":"action","title":"恢复默认布局"},
            {"id":"privacy","kind":"group","title":"数据与隐私"},
            {"id":"note","kind":"note","title":"清空推荐偏好不会删除收藏、歌单、播放历史或本地音乐。"},
            {"id":"clear","kind":"action","title":"清空推荐偏好"}]}""")
        var palette by mutableStateOf(InterfacePalette(true,"glacier"))
        val events=mutableListOf<Triple<String,String,Double>>()
        compose.setContent { CompositionLocalProvider(LocalInterfacePalette provides palette) {
            // Robolectric cannot create the RenderScript surface used by the shared glass header.
            // Exercise its production scrolling content here; destination/back are covered separately.
            TySettingsPageView(TySettingsPage.parse(flow),settingsFlowTheme(),Modifier.width(393.dp).height(800.dp).background(palette.backgrounds.first()),contentTop=24.dp,bottomPadding=48.dp){id,text,value->events+=Triple(id,text,value)}
        } }
        for(style in listOf("classic","glacier"))for(light in listOf(true,false)) {
            compose.runOnIdle{palette=InterfacePalette(light,style)}
            compose.onNodeWithText("个性化记录").performScrollTo();compose.waitForIdle()
            capture("settings-"+style+"-"+(if(light)"light" else "dark")+"-top")
            compose.onNodeWithText("清空推荐偏好").performScrollTo().assertIsDisplayed().performClick()
            assertEquals("act:clear",events.last().first)
            capture("settings-"+style+"-"+(if(light)"light" else "dark")+"-bottom")
        }
        compose.onNodeWithText("音乐探索程度").performScrollTo();compose.waitForIdle()
        val hint=compose.onNodeWithText("提高未听过歌曲的推荐权重").fetchSemanticsNode().boundsInRoot
        compose.onRoot().performTouchInput { click(androidx.compose.ui.geometry.Offset(270f,hint.bottom+24f)) }
        assertEquals("slide:exploration",events.last().first)
        assertTrue(events.last().third in 55.0..90.0)
    }
    @Test fun moduleVisibilityAndReorderKeepAllModuleIdentities() {
        val flow=TySettingsPage.parse(JSONObject("""{"key":"discovery","nodes":[{"id":"modules","kind":"moduleOrder","value":"[]","options":[{"value":"roam","label":"听屿漫游"},{"value":"radars","label":"你的专属雷达"},{"value":"songs","label":"猜你想听"}]}]}"""))
        val events=mutableListOf<Pair<String,String>>()
        compose.setContent {TySettingsPageView(flow,TyPanelTheme.of(true,"glacier"),Modifier.width(320.dp).height(500.dp)){id,text,_->events+=id to text}}
        compose.onNodeWithContentDescription("显示你的专属雷达").performClick();assertEquals("act:modules" to "toggle:radars",events.last())
        val actions=compose.onNodeWithContentDescription("拖动排序：听屿漫游").fetchSemanticsNode().config[SemanticsActions.CustomActions]
        compose.runOnIdle { assertTrue(actions.first{it.label=="下移"}.action()) }
        assertEquals("act:modules" to "[\"radars\",\"roam\",\"songs\"]",events.last())
        events.clear()
        compose.onNodeWithContentDescription("拖动排序：你的专属雷达").performTouchInput {
            down(center);advanceEventTime(650);moveBy(androidx.compose.ui.geometry.Offset(0f,80f));up()
        }
        assertEquals(1,events.size)
        assertEquals("act:modules",events.single().first)
        assertEquals(listOf("roam","radars","songs"),org.json.JSONArray(events.single().second).let{a->(0 until a.length()).map{a.getString(it)}})
    }
}
