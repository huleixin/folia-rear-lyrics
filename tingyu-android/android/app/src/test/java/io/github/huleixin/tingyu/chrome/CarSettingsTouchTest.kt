package io.github.huleixin.tingyu.chrome

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

// Native settings hit testing at a 1080p logical viewport; this is not an OEM car-device test.
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[30],qualifiers="w1920dp-h1080dp-mdpi")
class CarSettingsTouchTest {
    @get:Rule val compose=createAndroidComposeRule<ComponentActivity>()
    @Test fun indexRowsReceiveTouches(){
        val events=mutableListOf<String>()
        val page=NativePage.parse(JSONObject("""{"id":"settings","session":"car","enabled":true,"width":1920,"height":1080,"viewportWidth":1920,"model":{"key":"settings:index","title":"设置","sections":[{"id":"appearance","layout":"rows","title":"外观","items":[{"id":"visual","title":"视觉设置","action":"visual"}]},{"id":"controls","layout":"rows","title":"控制","items":[{"id":"playback","title":"播放控制","action":"playback"}]}]}}"""))
        compose.setContent{CompositionLocalProvider(LocalPadWindow provides PadWindow(1920f,1080f),LocalInterfacePalette provides InterfacePalette(true,"glacier"),LocalChromeRendering provides false){
            NativePageView(page,Modifier.fillMaxSize()){id,_,_->events+=id}
        }}
        compose.onNodeWithText("视觉设置").performTouchInput{click()}
        compose.onNodeWithText("播放控制").performTouchInput{click()}
        assertEquals(listOf("visual","playback"),events)
    }
}
