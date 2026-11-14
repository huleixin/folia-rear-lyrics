package io.github.huleixin.tingyu.chrome

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Shader
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.dp
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import com.kyant.backdrop.backdrops.layerBackdrop
import coil.imageLoader
import coil.memory.MemoryCache
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

// PadHomeDensityTest.kt: native viewport, square artwork, adaptive overview and a floating mini player.
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[30],qualifiers="zh-rCN-w1280dp-h854dp-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class PadHomeDensityTest{
    @get:Rule val compose=createAndroidComposeRule<ComponentActivity>()
    private val events=mutableListOf<String>()
    private val covers=mutableMapOf<Int,String>()
    // Offline square album fixtures keep screenshot review independent of network/account artwork.
    private fun cover(index:Int):String=covers.getOrPut(index){
        val palette=listOf(0xFFCADDD8,0xFF2C454D,0xFFE8AB84,0xFF81748D,0xFFAFB9A0,0xFF6E99B2,0xFFC9A467,0xFF9B6576)
        val bitmap=Bitmap.createBitmap(320,320,Bitmap.Config.ARGB_8888)
        val canvas=Canvas(bitmap);val paint=Paint(Paint.ANTI_ALIAS_FLAG)
        paint.shader=LinearGradient(0f,0f,320f,320f,palette[index%palette.size].toInt(),0xFF263B40.toInt(),Shader.TileMode.CLAMP)
        canvas.drawRect(0f,0f,320f,320f,paint);paint.shader=null
        paint.color=0x77FFF1CB;canvas.drawCircle(218f,104f,66f,paint)
        paint.color=0x4422333A;canvas.drawCircle(70f,293f,169f,paint)
        paint.color=Color.WHITE;paint.strokeWidth=1.5f;canvas.drawLine(26f,28f,294f,28f,paint)
        paint.textSize=13f;canvas.drawText("TINGYU  /  ${(index+1).toString().padStart(2,'0')}",26f,52f,paint)
        paint.textSize=33f;paint.typeface=android.graphics.Typeface.create("sans-serif-light",android.graphics.Typeface.NORMAL)
        canvas.drawText(listOf("SLOW DAYS","ECHOES","SUNLIGHT","MIDNIGHT","GREEN","OCEAN","GOLDEN","DREAMS")[index%8],26f,266f,paint)
        paint.textSize=11f;canvas.drawText("MUSIC FOR YOUR EVERYDAY",27f,289f,paint)
        val file=File(compose.activity.cacheDir,"pad-album-$index.png")
        file.outputStream().use{bitmap.compress(Bitmap.CompressFormat.PNG,100,it)}
        val uri=android.net.Uri.fromFile(file).toString()
        compose.activity.imageLoader.memoryCache?.set(MemoryCache.Key(uri),MemoryCache.Value(bitmap))
        uri
    }
    private fun row(id:String,title:String,image:String="daily-30")=JSONObject().put("id",id).put("title",title).put("subtitle","歌手 / 33 首歌曲").put("action",id).put("secondary","$id:menu")
        .put("image",if(id.startsWith("hero"))"file:///android_asset/public/assets/mobile-home/$image.png"else cover(id.filter{it.isDigit()}.toInt()%8))
    private fun section(id:String,title:String,layout:String,rows:List<JSONObject>)=JSONObject().put("id",id).put("title",title).put("layout",layout).put("items",JSONArray(rows)).put("more","$id:all").put("moreLabel","全部")
    private fun page(width:Int,height:Int):NativePage{
        val sections=listOf(
            section("hero","","hero",listOf(row("hero0","每日30首").put("subtitle","根据你的喜好，精选推荐"),row("hero1","猜你喜欢","guess-you-like"),row("hero2","新歌速递","new-releases"))),
            section("recent","最近播放","cards",(0..11).map{row("recent$it","最近歌曲$it")}),
            section("playlists","我的歌单","cards",(0..199).map{row("playlist$it","歌单$it")})
        )
        val model=JSONObject().put("key","home:qq:density:false").put("title","推荐").put("subtitle","为你发现更多好音乐").put("trailing","sources").put("trailingLabel","QQ音乐").put("sections",JSONArray(sections))
        return NativePage.parse(JSONObject().put("id","home").put("session","density").put("enabled",true)
            .put("width",width).put("height",height).put("viewportWidth",width).put("safeTop",24).put("model",model))
    }
    private fun shot(name:String){compose.waitForIdle();compose.runOnIdle{
        val view=compose.activity.window.decorView;val b=Bitmap.createBitmap(view.width,view.height,Bitmap.Config.ARGB_8888);view.draw(Canvas(b))
        val f=File("build/reports/pad-home-density/$name.png");f.parentFile!!.mkdirs();f.outputStream().use{b.compress(Bitmap.CompressFormat.PNG,100,it)};b.recycle()
    }}
    @Test fun squareOverviewFitsAboveMiniAcrossThemesWithoutMorePlaylistRows(){
        val model=page(1280,854)
        var palette by mutableStateOf(InterfacePalette(true,"glacier"))
        val mini=NativeShellCache(compose.activity).chrome("mini",1280f,854f,0f,24f).copy(title="正在播放",disabled=false,duration=240.0)
        val nav=NativeShellCache(compose.activity).chrome("nav",1280f,854f,0f,24f).copy(disabled=false,selected=0)
        compose.setContent{CompositionLocalProvider(LocalPadWindow provides PadWindow(1280f,854f),LocalInterfacePalette provides palette,LocalChromeRendering provides false,LocalNativePageBottomPx provides 112f){
            val backdrop=rememberLayerBackdrop()
            Box(Modifier.fillMaxSize().layerBackdrop(backdrop)){
                NativePageView(model,Modifier.fillMaxSize()){id,_,_->events+=id}
                ChromeNavigation(nav.interfacePaint(palette),backdrop,Modifier.offset(x=12.dp,y=48.dp).size(80.dp,790.dp)){id,_->events+=id}
                ChromeMiniPlayer(mini.interfacePaint(palette),null,backdrop,Modifier.offset(x=116.dp,y=754.dp).size(1132.dp,62.dp)){id,_->events+=id}
            }
        }}
        for((theme,light)in listOf("classic" to true,"glacier" to true,"glacier" to false)){
            compose.runOnIdle{palette=InterfacePalette(light,theme)}
            val list=compose.onNodeWithTag("pad-home-list").fetchSemanticsNode().boundsInRoot
            assertEquals(742f,list.bottom,.1f)
            shot("landscape-$theme-$light")
            val covers=compose.onAllNodes(hasTestTag("pad-cover:playlist0"),useUnmergedTree=true).fetchSemanticsNodes()
            assertEquals(1,covers.size)
            for(i in 0..6){
                compose.onNodeWithText("歌单$i").assertIsDisplayed()
                val r=compose.onNodeWithTag("pad-card:playlist$i").fetchSemanticsNode().boundsInRoot
                assertTrue("whole first-row card avoids player: $r",r.bottom<=742.1f)
            }
            assertSquareAndAligned(7,8)
            compose.onNodeWithText("歌单7").assertDoesNotExist()
            val firstTop=compose.onNodeWithTag("pad-card:playlist0").fetchSemanticsNode().boundsInRoot.top
            compose.onNodeWithTag("pad-home-list").performTouchInput{swipeUp()}
            assertEquals("overview has no hidden playlist rows to scroll into",firstTop,compose.onNodeWithTag("pad-card:playlist0").fetchSemanticsNode().boundsInRoot.top,.5f)
            shot("landscape-$theme-$light")
        }
        compose.onNodeWithText("歌单6").performTouchInput{click()};assertEquals("playlist6",events.last())
        compose.onAllNodesWithText("全部")[1].performClick();assertEquals("playlists:all",events.last())
        compose.onAllNodesWithText("全部")[0].performClick();assertEquals("recent:all",events.last())
        assertTrue(compose.onAllNodesWithContentDescription("更多").fetchSemanticsNodes().isNotEmpty()) // action buttons remain available in the rendered row
        compose.onNodeWithTag("pad-cover:recent7",useUnmergedTree=true).performTouchInput{click()};assertEquals("recent7",events.last())
    }
    private fun assertSquareAndAligned(playlists:Int,recents:Int){
        val hero=compose.onNodeWithTag("pad-hero-artwork",useUnmergedTree=true).fetchSemanticsNode().boundsInRoot
        val firstRecent=compose.onNodeWithTag("pad-cover:recent0",useUnmergedTree=true).fetchSemanticsNode().boundsInRoot
        assertEquals("hero and recent artwork share top edge",hero.top,firstRecent.top,.5f)
        assertTrue("hero no longer dominates two thirds",hero.width<600f)
        val playlistTop=compose.onNodeWithTag("pad-cover:playlist0",useUnmergedTree=true).fetchSemanticsNode().boundsInRoot.top
        for((prefix,count)in listOf("playlist" to playlists,"recent" to recents))for(i in 0 until count){
            val art=compose.onNodeWithTag("pad-cover:$prefix$i",useUnmergedTree=true).fetchSemanticsNode().boundsInRoot
            assertEquals("$prefix$i stays square",art.width,art.height,.5f)
            if(prefix=="playlist")assertEquals("all playlists share one row",playlistTop,art.top,.5f)
        }
    }
    @Test @Config(qualifiers="zh-rCN-w1280dp-h1000dp-mdpi") fun tallerWindowUsesThreeRecentColumns(){
        mountNarrow(1280,1000)
        assertSquareAndAligned(7,6)
        compose.onNodeWithText("最近歌曲6").assertDoesNotExist()
        shot("landscape-tall-three-columns")
    }
    @Test @Config(qualifiers="zh-rCN-w1024dp-h768dp-mdpi") fun smallerWindowAdaptsPlaylistCount(){
        mountNarrow(1024,768)
        assertSquareAndAligned(6,8)
        compose.onNodeWithText("歌单6").assertDoesNotExist()
        shot("landscape-small")
    }
    @Test fun allRecentStillShowsScrollableHistory(){
        val source=page(1280,854)
        val history=source.sections.first{it.id=="recent"}.copy(layout="rows")
        compose.setContent{CompositionLocalProvider(LocalPadWindow provides PadWindow(1280f,854f),LocalChromeRendering provides false){
            NativePageView(source.copy(sections=listOf(history)),Modifier.fillMaxSize()){id,_,_->events+=id}
        }}
        compose.onNodeWithTag("pad-home-list").performScrollToNode(hasText("最近歌曲11"))
        compose.onNodeWithText("最近歌曲11").performTouchInput{click()};assertEquals("recent11",events.last())
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
