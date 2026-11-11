package io.github.huleixin.tingyu.chrome

import androidx.activity.ComponentActivity
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/SettingsModalExitTest.kt
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.LEGACY)
@Config(sdk=[34],qualifiers="w393dp-h852dp-420dpi")
class SettingsModalExitTest {
    @get:Rule val compose=createAndroidComposeRule<ComponentActivity>()
    @Test fun exitingModalKeepsContentButCannotDispatchOldActions() {
        val modal=TySettingsPage.parse(JSONObject("""{"key":"edit","title":"Editor","nodes":[
            {"id":"save","kind":"action","title":"Save editor","action":"save"}]}"""))
        val flow=mutableStateOf(TySettingsPage("settings:test","Settings","",emptyList(),modal))
        val page=NativePage.parse(JSONObject("""{"id":"settings","session":"test","enabled":true,
            "width":393,"height":852,"viewportWidth":393,"model":{"key":"settings:test","sections":[]}}"""))
        var actions=0
        compose.mainClock.autoAdvance=false
        compose.setContent { SettingsFlowPage(flow.value,page) { _,_,_ -> actions++ } }
        compose.mainClock.advanceTimeBy(1500);compose.waitForIdle()
        compose.onNodeWithText("Save editor").performClick();assertEquals(1,actions)
        compose.runOnIdle { flow.value=flow.value.copy(modal=null) }
        compose.mainClock.advanceTimeByFrame();compose.waitForIdle()
        compose.onNodeWithText("Save editor").assertExists().performClick()
        compose.onRoot().performTouchInput { click(Offset(10f,10f)) }
        assertEquals(1,actions)
        compose.mainClock.advanceTimeBy(500);compose.waitForIdle()
        compose.onNodeWithText("Save editor").assertDoesNotExist()
    }
}
