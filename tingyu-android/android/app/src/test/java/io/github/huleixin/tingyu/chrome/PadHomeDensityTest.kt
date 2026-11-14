package io.github.huleixin.tingyu.chrome

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.dp
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import com.kyant.backdrop.backdrops.layerBackdrop
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

// PadHomeDensityTest.kt: native viewport, many real action identities, lazy rows and a floating mini player.
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[30],qualifiers="zh-rCN-w1280dp-h854dp-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class PadHomeDensityTest{
    @get:Rule val compose=createAndroidComposeRule<ComponentActivity>()
    private val events=mutableListOf<String>()
    private fun row(id:String,title:String,image:String="daily-30")=JSONObject().put("id",id).put("title",title).put("subtitle","歌手 / 33 首歌曲").put("action",id).put("secondary","$id:menu")
        .put("image","file:///android_asset/public/assets/mobile-home/$image.png")
    private fun section(id:String,title:String,layout:String,rows:List<JSONObject>)=JSONObject().put("id",id).put("title",title).put("layout",layout).put("items",JSONArray(rows))
    private fun page(width:Int,height:Int):NativePage{
        val sections=listOf(
            section("hero","","hero",listOf(row("hero0","猜你喜欢","guess-you-like"),row("hero1","每日30首"),row("hero2","新歌速递","new-releases"))),
            section("recent","最近播放","cards",(0..3).map{row("recent$it","最近歌曲$it")}),
            section("playlists","我的歌单","cards",(0..199).map{row("playlist$it","歌单$it")})
        )
        val model=JSONObject().put("key","home:qq:density:false").put("title","推荐").put("subtitle","为你发现更多好音乐").put("sections",JSONArray(sections))
        return NativePage.parse(JSONObject().put("id","home").put("session","density").put("enabled",true)
            .put("width",width).put("height",height).put("viewportWidth",width).put("safeTop",24).put("model",model))
    }
    private fun shot(name:String){compose.waitForIdle();compose.runOnIdle{
        val view=compose.activity.window.decorView;val b=Bitmap.createBitmap(view.width,view.height,Bitmap.Config.ARGB_8888);view.draw(Canvas(b))
        val f=File("build/reports/pad-home-density/$name.png");f.parentFile!!.mkdirs();f.outputStream().use{b.compress(Bitmap.CompressFormat.PNG,100,it)};b.recycle()
    }}
    @Test fun fiveCardsFitAboveMiniAcrossThemesAndLaterRowsStayLazy(){
        val model=page(1280,854)
        var palette by mutableStateOf(InterfacePalette(true,"glacier"))
        val mini=NativeShellCache(compose.activity).chrome("mini",1280f,854f,0f,24f).copy(title="正在播放",disabled=false,duration=240.0)
        compose.setContent{CompositionLocalProvider(LocalPadWindow provides PadWindow(1280f,854f),LocalInterfacePalette provides palette,LocalChromeRendering provides false,LocalNativePageBottomPx provides 112f){
            val backdrop=rememberLayerBackdrop()
            Box(Modifier.fillMaxSize().layerBackdrop(backdrop)){
                NativePageView(model,Modifier.fillMaxSize()){id,_,_->events+=id}
                ChromeMiniPlayer(mini.interfacePaint(palette),null,backdrop,Modifier.offset(x=116.dp,y=754.dp).size(1132.dp,62.dp)){id,_->events+=id}
            }
        }}
        for((theme,light)in listOf("classic" to true,"glacier" to true,"glacier" to false)){
            compose.runOnIdle{palette=InterfacePalette(light,theme)}
            val list=compose.onNodeWithTag("pad-home-list").fetchSemanticsNode().boundsInRoot
            assertEquals(742f,list.bottom,.1f)
            shot("landscape-$theme-$light")
            for(i in 0..4){
                compose.onNodeWithText("歌单$i").assertIsDisplayed()
                val r=compose.onNodeWithTag("pad-card:playlist$i").fetchSemanticsNode().boundsInRoot
                assertTrue("whole first-row card avoids player: $r",r.bottom<=742.1f)
            }
            assertTrue("only a few rows are composed",compose.onAllNodes(hasText("歌单",substring=true)).fetchSemanticsNodes().size<30)
            shot("landscape-$theme-$light")
        }
        compose.onNodeWithTag("pad-home-list").performScrollToNode(hasText("歌单199"))
        compose.onNodeWithText("歌单199").performTouchInput{click()};assertEquals("playlist199",events.last())
        assertTrue(compose.onAllNodesWithContentDescription("更多").fetchSemanticsNodes().isNotEmpty()) // action buttons remain available in the rendered row
        shot("landscape-last-playlists")
    }
    @Test @Config(qualifiers="zh-rCN-w800dp-h1280dp-mdpi") fun portraitShowsMoreThanFourAndScrolls(){
        mountNarrow(800,1280)
        compose.onNodeWithTag("native-home-list").performScrollToNode(hasText("歌单19"))
        compose.onNodeWithText("歌单19").performTouchInput{click()};assertEquals("playlist19",events.last());shot("portrait")
    }
    @Test @Config(qualifiers="zh-rCN-w640dp-h800dp-mdpi") fun splitWindowRetainsAdditionalPlaylists(){
        mountNarrow(640,800)
        compose.onNodeWithTag("native-home-list").performScrollToNode(hasText("歌单19"))
        compose.onNodeWithText("歌单19").performTouchInput{click()};assertEquals("playlist19",events.last());shot("split")
    }
    @Test @Config(qualifiers="zh-rCN-w393dp-h852dp-mdpi") fun phoneKeepsOriginalFourCardOverview(){
        mountNarrow(393,852)
        compose.onNodeWithTag("native-home-list").performScrollToNode(hasText("歌单3"))
        compose.onNodeWithText("歌单3").assertIsDisplayed();compose.onNodeWithText("歌单4").assertDoesNotExist();shot("phone")
    }
    private fun mountNarrow(width:Int,height:Int){
        val model=page(width,height)
        compose.setContent{CompositionLocalProvider(LocalPadWindow provides PadWindow(width.toFloat(),height.toFloat()),LocalInterfacePalette provides InterfacePalette(true,"glacier"),LocalChromeRendering provides false){
            NativePageView(model,Modifier.fillMaxSize()){id,_,_->events+=id}
        }}
    }
}
