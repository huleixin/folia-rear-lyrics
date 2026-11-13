package io.github.huleixin.tingyu.chrome

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.dp
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

// Resize the actual native search page while its existing text node owns focus.
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[34],qualifiers="w1280dp-h800dp-mdpi")
class PadSearchFocusTest {
    @get:Rule val compose=createAndroidComposeRule<ComponentActivity>()
    @Test fun inputSurvivesImeResizeAndResultUpdates(){
        var height by mutableStateOf(800f)
        var query by mutableStateOf("")
        val changes=mutableListOf<String>()
        compose.setContent{
            CompositionLocalProvider(LocalPadWindow provides padLayoutWindow(1280f,height,800f),LocalInterfacePalette provides InterfacePalette(true,"glacier")){
                val p=NativePage.parse(JSONObject("""{"id":"search","session":"focus","enabled":true,"width":1280,"height":800,"viewportWidth":1280,"model":{"key":"search:qq","title":"搜索","sections":[{"id":"query","layout":"input","action":"change","submit":"submit"},{"id":"sources","layout":"chips","items":[]}]}}"""))
                NativePageView(p.copy(sections=p.sections.map{if(it.id=="query")it.copy(value=query)else it}),Modifier.width(1280.dp).height(height.dp)){id,text,_->if(id=="change"){query=text;changes+=text}}
            }
        }
        compose.onNode(hasSetTextAction()).performClick().assertIsFocused()
        compose.runOnIdle{height=380f}
        compose.onNode(hasSetTextAction()).assertIsFocused().performTextInput("周杰伦")
        compose.runOnIdle{height=800f}
        compose.onNode(hasSetTextAction()).assertIsFocused().assertTextContains("周杰伦")
        assertEquals("周杰伦",changes.last())
    }
}
