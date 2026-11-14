package io.github.huleixin.tingyu.chrome

import android.webkit.WebView
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.robolectric.shadows.ShadowLooper
import java.util.concurrent.TimeUnit

// NativeSettingsHostTest.kt: actual shell routing, native child Back, safe bounds and retained settings actions.
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[30],qualifiers="zh-rCN-w393dp-h852dp-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class NativeSettingsHostTest{
    @get:Rule val compose=createAndroidComposeRule<ComponentActivity>()
    @Test fun fourNativeSettingsReturnToTheSameLiveIndex(){
        lateinit var web:WebView;lateinit var host:ComposeChromeHost
        compose.runOnUiThread{
            // Robolectric's WebView shadow measures 0x0; use only the native window geometry here.
            web=object:WebView(compose.activity){override fun onMeasure(widthSpec:Int,heightSpec:Int){
                setMeasuredDimension(android.view.View.MeasureSpec.getSize(widthSpec),android.view.View.MeasureSpec.getSize(heightSpec))
            }}
            val parent=FrameLayout(compose.activity);parent.addView(web,FrameLayout.LayoutParams(-1,-1));compose.activity.setContentView(parent)
            parent.measure(android.view.View.MeasureSpec.makeMeasureSpec(393,android.view.View.MeasureSpec.EXACTLY),android.view.View.MeasureSpec.makeMeasureSpec(852,android.view.View.MeasureSpec.EXACTLY));parent.layout(0,0,393,852)
            host=ComposeChromeHost(web,ChromeActionListener{_,_,_,_->})
            assertFalse(host.openLyricsSettings("desktop"))
            host.bootstrap();web.layout(0,0,393,852);host.setSafeInsets(32f,24f)
            host.shell(JSONObject("""{"route":"settings","generation":1,"revision":1,"navigation":"settings-test","pageTarget":"settings:index"}"""))
            val packet=JSONObject("""{"id":"settings","session":"settings-test","generation":1,"revision":1,"navigation":"settings-test","enabled":true,"width":393,"height":852,"viewportWidth":393,"model":{"key":"settings:index","title":"设置","sections":[{"id":"support","title":"支持与交流","layout":"rows","items":[{"id":"coffee","title":"咖啡入口","action":"support:coffee"},{"id":"group","title":"交流入口","action":"support:group"}]}]}}""")
            host.pageUpdate(PreparedNativePage.parse(packet)){assertTrue(it.optBoolean("accepted"))}
        }
        compose.waitForIdle()
        // ShadowWebView does not retain AndroidView layout bounds. Supply the native viewport after its first layout.
        compose.runOnUiThread{web.right=393;web.bottom=852;host.setSafeInsets(33f,24f)}
        try{
            for(kind in listOf("desktop","bluetooth","coffee","group")){
                compose.onNodeWithText("咖啡入口").assertIsDisplayed()
                if(kind in listOf("desktop","bluetooth"))compose.runOnUiThread{assertTrue(host.openLyricsSettings(kind))}
                else compose.onNodeWithText(if(kind=="coffee")"咖啡入口"else"交流入口").performTouchInput{click()}
                compose.onNodeWithTag("native-settings-fullscreen").assertIsDisplayed()
                val back=compose.onNodeWithContentDescription("返回").fetchSemanticsNode().boundsInRoot
                assertTrue(back.top>=48f)
                if(kind=="bluetooth")compose.runOnUiThread{compose.activity.onBackPressedDispatcher.onBackPressed()}
                else compose.onNodeWithContentDescription("返回").performTouchInput{click()}
                compose.mainClock.advanceTimeBy(300)
                compose.runOnUiThread{ShadowLooper.idleMainLooper(300,TimeUnit.MILLISECONDS)}
                compose.onNodeWithTag("native-settings-fullscreen").assertDoesNotExist()
                compose.onNodeWithText("咖啡入口").assertIsDisplayed()
            }
            compose.runOnUiThread{host.suspend();assertFalse(host.openLyricsSettings("desktop"))}
        }finally{compose.runOnUiThread{host.destroy();web.destroy()}}
    }
}
