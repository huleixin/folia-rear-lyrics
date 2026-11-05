package io.github.huleixin.tingyu.chrome

import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/PlayerSurfaceMotionTest.kt
// Exercise the production transforms with the Compose frame clock; no device frame-rate claims.
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w393dp-h852dp-420dpi")
class PlayerSurfaceMotionTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private fun top()=compose.onNodeWithTag("moving").fetchSemanticsNode().positionInRoot.y

    @Test fun minimalCollapseTravelsOneFullHeightBeforeAcknowledgingBack() {
        val exit=NativeStageExit();var replies=0
        compose.mainClock.autoAdvance=false
        compose.setContent {
            val progress=rememberStageExitProgress(exit,false)
            Box(Modifier.fillMaxSize().background(Color.White)) {
                Box(Modifier.fillMaxSize().stageExitTransform(exit,progress,slide=true).testTag("moving").background(Color.Black))
            }
        }
        val height=compose.onNodeWithTag("moving").fetchSemanticsNode().size.height.toFloat()
        compose.runOnIdle { exit.begin(null,true){replies++} }
        // LaunchedEffect 启动有 1~2 帧延迟（实测 t=48ms 时仍在 0），逐帧泵到动画真正起步，
        // 避免把"效果尚未启动"误判为"动画跳变"。
        var moved=false
        for(frame in 0 until 24){
            compose.mainClock.advanceTimeByFrame()
            if(top()>0f){moved=true;break}
        }
        assertTrue("collapse animation must start",moved)
        assertTrue(top()<height);assertEquals(0,replies)
        compose.mainClock.advanceTimeBy(600)
        assertEquals(height,top(),1f);assertEquals(1,replies)
    }

    @Test fun reversingAStageDetourKeepsTheSameSurfacePosition() {
        val phase=mutableStateOf("to-stage")
        compose.mainClock.autoAdvance=false
        compose.setContent {
            Box(Modifier.fillMaxSize()) {
                Box(Modifier.fillMaxSize().playerDetourTransform(phase.value,false,1000f).testTag("moving"))
            }
        }
        compose.mainClock.advanceTimeBy(128)
        val before=top()
        assertTrue(before>0f && before<1000f)
        compose.runOnIdle { phase.value="to-minimal" }
        // 反向后旧动画最后一帧的 tick 会落在同一帧的重组之前（实测差 ~37px，属正常帧序），
        // 两个帧内新 Animatable 接管。钉住的核心回归是旧 bug 的"瞬间弹回屏幕边"：
        // 位置必须仍在反转点附近（±100px 内），绝不允许归零。
        compose.mainClock.advanceTimeByFrame()
        compose.mainClock.advanceTimeByFrame()
        assertTrue("reversal must not reset to the top",Math.abs(top()-before)<100f)
        compose.mainClock.advanceTimeBy(400)
        assertEquals(1000f,top(),1f)
    }
}
