package io.github.huleixin.tingyu.chrome

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.unit.dp
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithContentDescription
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import com.kyant.backdrop.backdrops.layerBackdrop
import io.github.huleixin.tingyu.minimal.*
import io.github.huleixin.tingyu.minimal.ui.MinimalPlayerScreen
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

// Render actual Compose pages across window sizes and the existing interface palettes.
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk=[30],qualifiers="w1280dp-h800dp-mdpi")
class PadPagesTest {
    @get:Rule val compose=createAndroidComposeRule<ComponentActivity>()
    private val events=mutableListOf<String>()
    private fun row(id:String,title:String)=JSONObject().put("id",id).put("title",title).put("subtitle","歌手 / 专辑").put("action",id)
    private fun section(id:String,layout:String,title:String,items:List<JSONObject>)=JSONObject().put("id",id).put("layout",layout).put("title",title).put("items",JSONArray(items))
    private fun page(id:String,key:String,sections:List<JSONObject>)=NativePage.parse(JSONObject().put("id",id).put("session","pad-test").put("enabled",true).put("width",1280).put("height",800).put("viewportWidth",1280)
        .put("model",JSONObject().put("key",key).put("title",if(id=="search")"搜索"else if(id=="settings")"设置"else"为你推荐").put("sections",JSONArray(sections))))
    private fun shot(name:String){compose.waitForIdle();compose.runOnIdle{
        val view=compose.activity.window.decorView
        val bitmap=Bitmap.createBitmap(view.width,view.height,Bitmap.Config.ARGB_8888);view.draw(Canvas(bitmap))
        val file=File("build/reports/pad/$name.png");file.parentFile!!.mkdirs();file.outputStream().use{bitmap.compress(Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()
    }}
    @Test fun pagesAndResize(){
        val hero=section("hero","hero","",(0..2).map{row("hero$it",listOf("猜你喜欢","每日30首","新歌速递")[it]).put("image","file:///android_asset/public/assets/mobile-home/guess-you-like.png")})
        val home=page("home","home:recommend",listOf(hero,section("recent","cards","最近播放",(0..3).map{row("recent$it","最近歌曲$it")}),section("playlists","cards","我的歌单",(0..9).map{row("playlist$it","歌单$it")})))
        val search=page("search","search:qq",listOf(section("query","input","",emptyList()).put("action","change").put("placeholder","搜索歌曲、歌手"),section("history","rows","搜索历史",listOf(row("history","周杰伦"))),section("hot","chips","热门搜索",listOf(row("hot","晴天")))))
        val settings=page("settings","settings:index",listOf(section("rear","rows","背屏",listOf(row("rear","背屏歌词"))),section("lyrics-output","rows","桌面与车载歌词",listOf(row("desktop","桌面歌词"))),section("appearance","rows","外观",listOf(row("visual","视觉设置"))),section("controls","rows","控制",listOf(row("playback","播放控制")))))
        var current by mutableStateOf(home);var palette by mutableStateOf(InterfacePalette(true,"glacier"));var size by mutableStateOf(PadWindow(1280f,800f))
        compose.setContent{CompositionLocalProvider(LocalPadWindow provides size,LocalInterfacePalette provides palette,LocalChromeRendering provides false){Box(Modifier.fillMaxSize()){NativePageView(current,Modifier.size(size.width.dp,size.height.dp)){action,_,_->events+=action}}}}
        for(style in listOf("classic","glacier"))for(light in listOf(true,false)){
            compose.runOnIdle{palette=InterfacePalette(light,style);current=home};shot("home-$style-$light")
            compose.onNodeWithText("最近歌曲0").performClick();assertEquals("recent0",events.last())
            compose.runOnIdle{current=search};shot("search-$style-$light")
            compose.onNodeWithText("晴天").performClick();assertEquals("hot",events.last())
            compose.runOnIdle{current=settings};shot("settings-$style-$light")
            compose.onNodeWithText("背屏歌词").assertDoesNotExist()
            compose.onNodeWithText("桌面歌词").performClick();assertEquals("desktop",events.last())
        }
        compose.runOnIdle{size=PadWindow(640f,800f);current=home};shot("split-narrow")
        compose.runOnIdle{size=PadWindow(800f,1280f);current=settings};shot("portrait-settings")
        compose.onNodeWithText("背屏歌词").assertDoesNotExist()
        compose.runOnIdle{size=PadWindow(393f,800f);current=settings};shot("phone-settings")
        compose.onNodeWithText("背屏歌词").assertIsDisplayed()
    }
    @Test fun playerReusesCoverAndLyrics(){
        compose.mainClock.autoAdvance=false
        val track=MinimalTrack(key="song",title="陪我看日出",artist="回音哥",durationMs=240000)
        val lyrics=MinimalLyrics.fromRows("""{"songKey":"song","state":"ready","lines":[{"startTime":0,"endTime":10,"fullText":"雨过了就有路","words":[]},{"startTime":10,"endTime":20,"fullText":"像那年看日出","words":[]}]}""","song","song#1","test")
        val state=MinimalPlayerState(playback=MinimalPlayback(track=track,anchorPositionMs=4000,source=MinimalClockSource.ENGINE),lyrics=lyrics,controls=MinimalControls(bound=true,canNext=true,canPrevious=true))
        val commands=BridgeMinimalCommands({action,_->events+=action;true},{true})
        compose.setContent{CompositionLocalProvider(LocalPadWindow provides PadWindow(1280f,800f),LocalInterfacePalette provides InterfacePalette(true,"glacier")){
            MinimalPlayerScreen(state,MinimalArtwork(),commands,light=true,safeTop=24f,safeBottom=0f,detour=false,onCollapse={},onOpenStage={})
        }}
        compose.mainClock.advanceTimeByFrame();compose.mainClock.advanceTimeByFrame()
        shot("player-landscape")
        compose.onAllNodesWithText("陪我看日出").assertCountEquals(2)
        compose.onNodeWithText("雨过了就有路").assertExists()
    }
    @Test fun libraryPanesKeepIndependentActions(){
        val directory=page("home","library:qq:playlist",listOf(section("directory","rows","我的歌单",listOf(row("open:one","测试歌单")))))
        val detail=page("collection","collection:playlist:one",listOf(
            section("intro","rows","",listOf(row("intro","歌单详情"))),
            section("controls","chips","",listOf(row("playAll","播放全部"))),
            section("tracks","rows","",listOf(row("song:one","茶花开了")))))
        val side=mutableListOf<String>();val main=mutableListOf<String>()
        compose.setContent{CompositionLocalProvider(LocalPadWindow provides PadWindow(1280f,800f),LocalInterfacePalette provides InterfacePalette(true,"glacier")){
            NativePageView(detail,Modifier.fillMaxSize(),libraryPage=directory,libraryAction={id,_,_->side+=id}){id,_,_->main+=id}
        }}
        shot("library-landscape")
        compose.onNodeWithText("测试歌单").performClick();assertEquals("open:one",side.last());assertTrue(main.isEmpty())
        compose.onNodeWithText("茶花开了").performClick();assertEquals("song:one",main.last())
    }
    @Test fun railAndLargeMiniUseExistingCommands(){
        val cache=NativeShellCache(compose.activity)
        val mini=cache.chrome("mini",1280f,800f,0f,24f).interfacePaint(InterfacePalette(true,"glacier")).copy(title="当前歌曲",disabled=false,canNext=true,canPrevious=true,duration=240.0)
        val nav=cache.chrome("nav",1280f,800f,0f,24f).interfacePaint(InterfacePalette(true,"glacier")).copy(disabled=false,selected=0)
        compose.setContent{CompositionLocalProvider(LocalPadWindow provides PadWindow(1280f,800f),LocalInterfacePalette provides InterfacePalette(true,"glacier"),LocalChromeRendering provides false){
            val backdrop=rememberLayerBackdrop()
            Box(Modifier.fillMaxSize().layerBackdrop(backdrop)){
                ChromeNavigation(nav,backdrop,Modifier.padding(top=24.dp).size(80.dp,650.dp)){id,_->events+=id}
                ChromeMiniPlayer(mini,null,backdrop,Modifier.padding(start=112.dp,top=700.dp).size(1136.dp,62.dp)){id,_->events+=id}
            }
        }}
        shot("shell-navigation-mini")
        compose.onNodeWithText("资料库").performClick();assertEquals("navigate",events.last())
        compose.onNodeWithContentDescription("下一首").performClick();assertEquals("next",events.last())
        compose.onNodeWithContentDescription("喜欢 / 取消喜欢").performClick();assertEquals("padLike",events.last())
    }
}
