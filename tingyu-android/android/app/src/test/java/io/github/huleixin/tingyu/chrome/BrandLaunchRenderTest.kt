package io.github.huleixin.tingyu.chrome

import android.webkit.WebView
import android.webkit.ValueCallback
import androidx.activity.ComponentActivity
import androidx.compose.runtime.*
import androidx.compose.material3.Text
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

// Verify real Compose frame readiness and cleanup handoff independently of network/player startup.
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class BrandLaunchRenderTest {
    @get:Rule val compose=createAndroidComposeRule<ComponentActivity>()
    @Test fun waitsForBothHostsThenFadesExactlyOnce() = exercise(false)
    @Test fun reducedMotionReleasesAfterReadyFrames() = exercise(true)
    @Test fun brandLaunchSurfaceRendersContent() {
        val palette = InterfacePalette(false)
        compose.setContent { BrandLaunchSurface(palette = palette, reduced = false) }
        compose.waitForIdle()
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
