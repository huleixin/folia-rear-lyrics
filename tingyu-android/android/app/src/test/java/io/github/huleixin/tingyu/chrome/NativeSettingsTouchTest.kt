package io.github.huleixin.tingyu.chrome

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.dp
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/NativeSettingsTouchTest.kt
// Real touch injection: semantics-only onClick would pass performClick but fails these taps.
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk=[34],qualifiers="w393dp-h852dp-420dpi")
class NativeSettingsTouchTest {
    @get:Rule val compose=createAndroidComposeRule<ComponentActivity>()
    private val document=NativeSettingsDocument.parse(JSONObject("""{
      "paints":[],"controls":[
        {"id":"top","kind":"click","label":"top","area":"scroll","x":20,"y":30,"w":180,"h":48},
        {"id":"bottom","kind":"click","label":"bottom","area":"scroll","x":20,"y":630,"w":180,"h":48}],
      "areas":[{"id":"scroll","x":0,"y":0,"w":300,"h":250,"contentHeight":750,"offset":0}],"live":[]
    }"""))
    @Test fun tapAndDragUseTheControlAndItsScrollParentExactlyOnce(){
        val clicks=mutableListOf<String>()
        compose.setContent{NativeSettingsDocumentView(document,Modifier.size(300.dp,250.dp)){id,_,_->if(!id.startsWith("scroll:"))clicks.add(id)}}
        compose.onNodeWithContentDescription("top").performTouchInput{click()}
        compose.runOnIdle{assertEquals(listOf("top"),clicks)}
        compose.onNodeWithContentDescription("top").performTouchInput{swipeUp()}
        compose.waitForIdle()
        compose.runOnIdle{assertEquals(listOf("top"),clicks)}
        assertTrue(compose.onNode(hasScrollAction()).fetchSemanticsNode().config[SemanticsProperties.VerticalScrollAxisRange].value()>0f)
        repeat(2){compose.onNode(hasScrollAction()).performTouchInput{swipeUp(durationMillis=500)}}
        compose.mainClock.advanceTimeBy(2000)
        compose.waitForIdle()
        val position=compose.onNode(hasScrollAction()).fetchSemanticsNode().config[SemanticsProperties.VerticalScrollAxisRange]
        println("settings scroll=${position.value()} max=${position.maxValue()}")
        println(compose.onRoot(useUnmergedTree=true).printToString())
        assertTrue(position.value()>380f)
        compose.onNodeWithContentDescription("bottom").performTouchInput{click()}
        compose.runOnIdle{assertEquals(listOf("top","bottom"),clicks)}
    }
}
