package io.github.huleixin.tingyu.chrome

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import io.github.huleixin.tingyu.minimal.*
import io.github.huleixin.tingyu.minimal.ui.*
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

// Render the actual ordinary player overlays through live global palette changes.
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[34],qualifiers="w393dp-h852dp-160dpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class PlayerOverlayThemeTest {
    @get:Rule val compose=createAndroidComposeRule<ComponentActivity>()
    private var palette by mutableStateOf(InterfacePalette(true,"classic"))
    private val backdrop=Color(0xFFB4C4D3)
    private val events=mutableListOf<String>()
    private val actions=object:MinimalToolActions {
        override val available=true
        override fun send(action:String,value:Double):Boolean {events+=action;return true}
    }
    private val transport=BridgeMinimalCommands(MinimalCommandSender { _,_->true }) {true}
    private val tools=MinimalTools(
        quality=MinimalQualityState(current="lossless",currentLabel="无损"),
        effects=MinimalEffectsState(enabled=true),
        lyrics=MinimalLyricsState(title="冬眠",artist="司南",sources=listOf("online" to "平台歌词"),selected="online"),
        lx=MinimalLxState(scripts=listOf(MinimalLxScript("sample","示例音源","v1",true,listOf("网易" to "标准 / 无损")))),
    )
    private fun mount(content:@Composable ()->Unit) {
        compose.setContent {
            CompositionLocalProvider(LocalInterfacePalette provides palette) {
                Box(Modifier.fillMaxSize().background(backdrop)){content()}
            }
        }
    }
    private fun verifyAllPalettes(name:String,menu:Boolean=false,check:()->Unit={}) {
        for(style in listOf("classic","glacier","classic"))for(light in listOf(true,false)) {
            compose.runOnIdle {palette=InterfacePalette(light,style)}
            compose.waitForIdle();check()
            val bitmap=compose.runOnIdle {
                val view=compose.activity.window.decorView
                Bitmap.createBitmap(view.width,view.height,Bitmap.Config.ARGB_8888).also {view.draw(Canvas(it))}
            }
            val expected=(if(menu)palette.menuSurface.copy(alpha=.97f).compositeOver(backdrop) else palette.panelSurface).toArgb()
            val pixels=IntArray(bitmap.width*bitmap.height)
            bitmap.getPixels(pixels,0,bitmap.width,0,0,bitmap.width,bitmap.height)
            fun matches(pixel:Int)=listOf(0,8,16).all{shift->kotlin.math.abs(((pixel shr shift) and 255)-((expected shr shift) and 255))<=1}
            assertTrue(name+" must paint "+style+" / "+light+" surface",pixels.count(::matches)>1500)
            val file=File("build/reports/interface-themes/overlays/"+name+"-"+style+"-"+(if(light)"light" else "dark")+".png")
            file.parentFile!!.mkdirs();file.outputStream().use{bitmap.compress(Bitmap.CompressFormat.PNG,100,it)}
            bitmap.recycle()
        }
    }
    @Test fun qualityUsesGlobalThemeAndKeepsActions() {
        mount {MinimalQualitySheet(tools,palette.light,actions,{}, {}, {})}
        verifyAllPalettes("quality") {
            compose.onNodeWithText("音质",substring=false).assertIsDisplayed()
            compose.onNodeWithText("高品质").performClick()
            assertEquals("qualityPick",events.last())
        }
    }
    @Test fun effectsUsesGlobalTheme() {
        mount {MinimalEffectsSheet(tools,palette.light,actions,{})}
        verifyAllPalettes("effects") {compose.onNodeWithText("音频效果器").assertIsDisplayed()}
    }
    @Test fun lyricsKeepsEditedOffsetWhileGlobalThemeChanges() {
        mount {MinimalLyricsToolsSheet(tools,palette.light,actions,transport,"all",false,{}, {})}
        compose.onNode(hasSetTextAction()).performScrollTo().performTextReplacement("375")
        verifyAllPalettes("lyrics") {compose.onNode(hasSetTextAction()).assertTextEquals("375")}
        compose.onNodeWithText("歌曲",substring=false).performClick()
        verifyAllPalettes("song") {compose.onNodeWithText("单曲时间校准").assertDoesNotExist()}
    }
    @Test fun sourceManagerUsesGlobalTheme() {
        mount {MinimalLxSheet(tools,palette.light,actions,{})}
        verifyAllPalettes("source") {compose.onNodeWithText("示例音源",substring=false).assertIsDisplayed()}
    }
    @Test fun queueUsesGlobalThemeAndKeepsTrack() {
        val queue=MinimalQueue(version=1,currentIndex=0,currentKey="song",mode="all",total=1,
            items=listOf(MinimalQueueItem("song#1","song","冬眠","司南")))
        mount {MinimalQueueSheet(queue,palette.light,"all",{}, {true},{true},{_,_->true},{true})}
        verifyAllPalettes("queue") {compose.onNodeWithText("冬眠").assertIsDisplayed()}
    }
    @Test fun moreMenuUsesGlobalThemeAndKeepsActions() {
        mount {MoreMenuPanel("无损",false){events+=it.toString()}}
        verifyAllPalettes("menu",menu=true) {
            compose.onNodeWithText("音质选择").performClick();assertEquals("0",events.last())
        }
    }
}
