package io.github.huleixin.tingyu.chrome

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
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
    @Test fun verticalDragSurvivesCallbackHandoffAndDoesNotChangeTracks(){
        val events=mutableListOf<String>()
        val deltas=mutableListOf<Float>()
        var generation by mutableStateOf(1)
        val mini=NativeShellCache(compose.activity).chrome("mini",393f,852f,0f,24f)
            .copy(title="拖动歌曲",disabled=false,canNext=true,canPrevious=true,reducedMotion=true)
        compose.setContent{
            CompositionLocalProvider(LocalPadWindow provides PadWindow(393f,852f),LocalInterfacePalette provides InterfacePalette(true,"glacier"),LocalChromeRendering provides false){
                val captured=generation
                val action:(String,Double)->Unit={id,_->events+="$captured:$id"}
                val backdrop=rememberLayerBackdrop()
                Box(Modifier.padding(top=300.dp)){
                    ChromeMiniPlayer(mini,null,backdrop,Modifier.width(370.dp).height(62.dp).chromeInteraction(action),
                        onExpandDragStart={events+="$captured:start"},
                        onExpandDrag={deltas+=it;events+="$captured:drag"},
                        onExpandDragEnd={_,canceled->events+="$captured:end:$canceled"},action=action)
                }
            }
        }
        val title=compose.onNodeWithText("拖动歌曲")
        title.performTouchInput{down(center);moveBy(Offset(0f,-30f))}
        assertTrue(events.contains("1:start"))
        compose.runOnIdle{generation=2}
        title.performTouchInput{advanceEventTime(300);moveBy(Offset(0f,-80f));advanceEventTime(300);moveBy(Offset(0f,40f));up()}
        assertTrue(events.contains("2:drag"));assertTrue(events.contains("2:end:false"))
        assertFalse(events.any{it.endsWith(":next")||it.endsWith(":previous")||it.endsWith(":openStage")||it.endsWith(":end:true")})
        assertTrue(deltas.any{it<0f}&&deltas.any{it>0f})
        compose.runOnIdle{events.clear()}
        title.performTouchInput{swipe(center+Offset(60f,0f),center-Offset(100f,0f),durationMillis=500)}
        compose.waitForIdle()
        assertTrue(events.contains("2:previous")||events.contains("2:next"))
        assertFalse(events.any{it.endsWith(":start")||it.endsWith(":drag")})
    }
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
