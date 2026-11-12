package io.github.huleixin.tingyu.chrome

import android.webkit.WebView
import android.webkit.ValueCallback
import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.runtime.*
import androidx.compose.material3.Text
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.graphics.toArgb
import java.io.File
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

// Verify real Compose frame readiness and cleanup handoff independently of network/player startup.
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[34],qualifiers="w393dp-h852dp-160dpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class BrandLaunchRenderTest {
    @get:Rule val compose=createAndroidComposeRule<ComponentActivity>()
    @Test fun waitsForBothHostsThenFadesExactlyOnce() = exercise(false)
    @Test fun reducedMotionReleasesAfterReadyFrames() = exercise(true)
    @Test fun brandLaunchSurfacePreservesRoundedArtworkAcrossThemes() {
        var palette by mutableStateOf(InterfacePalette(false))
        compose.setContent { BrandLaunchSurface(palette = palette, reduced = true) }
        for(style in listOf("classic","glacier"))for(light in listOf(false,true)){
            compose.runOnIdle{palette=InterfacePalette(light,style)}
            compose.waitForIdle()
            val logo=compose.onNodeWithContentDescription("听屿海浪品牌 Logo").assertIsDisplayed()
                .fetchSemanticsNode().boundsInWindow
            compose.runOnIdle {
                val view=compose.activity.window.decorView
                val bitmap=Bitmap.createBitmap(view.width,view.height,Bitmap.Config.ARGB_8888)
                view.draw(Canvas(bitmap))
                val x=logo.left.toInt();val y=logo.top.toInt();val side=logo.width.toInt()
                assertEquals(112,side)
                // All four corners reveal the launch background, never a square ice tile.
                for((dx,dy) in listOf(1 to 1,side-2 to 1,1 to side-2,side-2 to side-2)){
                    val outside=bitmap.getPixel(x-1,y+dy);val corner=bitmap.getPixel(x+dx,y+dy)
                    // The ambient radial gradient can vary slightly across the sample points.
                    for(shift in listOf(0,8,16))assertTrue("Rounded corner must reveal the ambient background",
                        kotlin.math.abs(((outside shr shift) and 255)-((corner shr shift) and 255))<=3)
                }
                assertNotEquals(palette.launch.toArgb(),bitmap.getPixel(x+side/2,y+5))
                val file=File("build/reports/brand-launch/$style-${if(light)"light" else "dark"}.png")
                file.parentFile!!.mkdirs();file.outputStream().use{bitmap.compress(Bitmap.CompressFormat.PNG,100,it)}
                bitmap.recycle()
            }
        }
    }
    @Test fun animatedBrandRendersEntryAndSettledFrames() {
        compose.mainClock.autoAdvance=false
        compose.setContent{BrandLaunchSurface(InterfacePalette(true,"glacier"),reduced=false)}
        for(time in listOf(128L,400L,800L)){
            compose.mainClock.advanceTimeBy(time-compose.mainClock.currentTime)
            compose.waitForIdle()
            compose.onNodeWithContentDescription("听屿海浪品牌 Logo").assertIsDisplayed()
            compose.runOnIdle{
                val view=compose.activity.window.decorView
                val bitmap=Bitmap.createBitmap(view.width,view.height,Bitmap.Config.ARGB_8888)
                view.draw(Canvas(bitmap))
                val file=File("build/reports/brand-launch/animated-$time.png")
                file.parentFile!!.mkdirs();file.outputStream().use{bitmap.compress(Bitmap.CompressFormat.PNG,100,it)}
                bitmap.recycle()
            }
        }
    }
    @Test fun webStageColdLinkFadesOnlyTheHtmlCover() {
        val state=BrandLaunchState(true).apply{reactReady=true}
        val scripts=mutableListOf<String>()
        val web=object:WebView(compose.activity){
            override fun evaluateJavascript(script:String,callback:ValueCallback<String>?) {
                scripts.add(script);callback?.onReceiveValue("null")
            }
        }
        var opacity=0f
        compose.mainClock.autoAdvance=false
        compose.setContent { val alpha=brandLaunchAlpha(state,false,false,web,webContentReady=true);SideEffect{opacity=alpha.value} }
        compose.mainClock.advanceTimeBy(100);compose.waitForIdle()
        assertTrue(state.active);assertEquals(1f,opacity,0f)
        compose.mainClock.advanceTimeBy(500);compose.waitForIdle()
        assertFalse(state.active);assertEquals(1f,opacity,0f)
        assertEquals(2,scripts.size);assertTrue(scripts[0].contains("__tingyuFadeSplash"));assertTrue(scripts[1].contains("__tingyuFinishSplash"))
    }
    private fun exercise(reduced:Boolean) {
        val state=BrandLaunchState(true)
        var pageReady by mutableStateOf(false)
        var cleanups=0
        val web=object:WebView(compose.activity){
            override fun evaluateJavascript(script:String,callback:ValueCallback<String>?) {
                assertTrue(script.contains("__tingyuFinishSplash"));cleanups++;callback?.onReceiveValue("null")
            }
        }
        compose.mainClock.autoAdvance=false
        compose.setContent { val alpha=brandLaunchAlpha(state,pageReady,reduced,web);Text(alpha.value.toString()) }
        compose.mainClock.advanceTimeBy(1000);compose.waitForIdle()
        assertTrue(state.active);assertEquals(0,cleanups)
        compose.runOnIdle{state.reactReady=true}
        compose.mainClock.advanceTimeBy(1000);compose.waitForIdle()
        assertTrue(state.active);assertEquals(0,cleanups)
        compose.runOnIdle{pageReady=true}
        if(!reduced){compose.mainClock.advanceTimeBy(100);compose.waitForIdle();assertTrue(state.active)}
        compose.mainClock.advanceTimeBy(if(reduced)128 else 500);compose.waitForIdle()
        assertFalse(state.active);assertEquals(1,cleanups)
        compose.runOnIdle{pageReady=false;state.reactReady=true}
        compose.mainClock.advanceTimeBy(1000);compose.waitForIdle()
        assertEquals(1,cleanups)
    }
}
