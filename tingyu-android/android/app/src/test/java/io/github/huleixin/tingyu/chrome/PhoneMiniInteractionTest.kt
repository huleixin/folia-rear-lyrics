package io.github.huleixin.tingyu.chrome

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.dp
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

// Real Compose hit testing on phone controls, including callback replacement after return.
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[34],qualifiers="w393dp-h852dp-mdpi")
class PhoneMiniInteractionTest {
    @get:Rule val compose=createAndroidComposeRule<ComponentActivity>()
    @Test fun controlsRemainClickableAfterCallbackReplacement(){
        val events=mutableListOf<String>()
        var generation by mutableStateOf(1)
        val mini=NativeShellCache(compose.activity).chrome("mini",393f,852f,0f,24f).copy(title="测试歌曲",disabled=false,playing=false)
        compose.setContent{
            CompositionLocalProvider(LocalPadWindow provides PadWindow(393f,852f),LocalInterfacePalette provides InterfacePalette(true,"glacier"),LocalChromeRendering provides false){
                val captured=generation
                val action:(String,Double)->Unit={id,_->events+="$captured:$id"}
                val backdrop=rememberLayerBackdrop()
                ChromeMiniPlayer(mini,null,backdrop,Modifier.width(370.dp).height(62.dp).chromeInteraction(action),action=action)
            }
        }
        compose.onNodeWithText("测试歌曲").performTouchInput{click()}
        assertTrue(events.contains("1:openStage"))
        compose.runOnIdle{generation=2;events.clear()}
        compose.onNodeWithContentDescription("播放").performTouchInput{click()}
        assertTrue(events.contains("2:toggle"));assertTrue(events.contains("2:interactionStart"))
        compose.onNodeWithContentDescription("播放队列").performTouchInput{click()}
        assertTrue(events.contains("2:queue"));assertFalse(events.any{it.startsWith("1:")})
    }
}
