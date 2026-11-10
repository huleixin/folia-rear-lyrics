package io.github.huleixin.tingyu.chrome

import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.LocalTextStyle
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

// Exercise production input memory and nested theme swatch rendering across provider updates.
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[34],qualifiers="w393dp-h852dp-160dpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class InterfaceThemeRenderTest {
    @get:Rule val compose=createAndroidComposeRule<ComponentActivity>()
    @Test fun productionThemeCardsFitAndDispatchOriginalActionAtBothWidths() {
        var width by mutableStateOf(393)
        var palette by mutableStateOf(InterfacePalette())
        val flowJson=JSONObject(javaClass.classLoader!!.getResource("settings-layout/theme-preview.json")!!.readText())
        val flow=TySettingsPage.parse(flowJson)
        val events=mutableListOf<String>()
        fun all(n:SettingsLayoutNode):List<SettingsLayoutNode> = listOf(n)+n.children.flatMap(::all)
        compose.setContent {
            CompositionLocalProvider(LocalInterfacePalette provides palette) {
                // Render the production settings content; Robolectric cannot allocate the
                // RenderScript surface used by the separate Haze header on a software Canvas.
                TySettingsPageView(flow,settingsFlowTheme(),
                    Modifier.width(width.dp).height(852.dp).background(palette.backgrounds.first())){id,_,_->events+=id}
            }
        }
        val sampleNodes=all(flow.layout!!).filter{it.kind=="column"&&it.text.startsWith("#")}
        assertEquals(4,sampleNodes.size)
        for(w in listOf(393,320))for(style in listOf("classic","glacier"))for(light in listOf(false,true)) {
            compose.runOnIdle { width=w;palette=InterfacePalette(light,style) };compose.waitForIdle()
            compose.onNodeWithText("冰川").assertIsDisplayed().performClick()
            assertEquals(TySettingEvent.action(flow.nodes.first{it.title=="冰川"}.action),events.last())
            sampleNodes.forEach{sample->
                val box=compose.onNodeWithTag("settings-layout:"+sample.id,useUnmergedTree=true).fetchSemanticsNode().boundsInRoot
                assertTrue("Sample must stay inside page",box.left>=0&&box.right<=w)
                sample.children.forEach{line->
                    val bounds=compose.onNodeWithTag("settings-layout:"+line.id,useUnmergedTree=true).fetchSemanticsNode().boundsInRoot
                    assertTrue("Sample line overflow: "+bounds,bounds.left>=box.left&&bounds.right<=box.right)
                }
            }
            val file=File("build/reports/interface-themes/cards-"+style+"-"+(if(light)"light" else "dark")+"-"+w+".png")
            file.parentFile!!.mkdirs()
            compose.runOnIdle {
                val bitmap=android.graphics.Bitmap.createBitmap(w,852,android.graphics.Bitmap.Config.ARGB_8888)
                compose.activity.window.decorView.draw(android.graphics.Canvas(bitmap))
                file.outputStream().use{bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)}
                bitmap.recycle()
            }
        }
    }
    @Test fun liveProviderUpdatesKeepInputAndRenderBothPreviewBackgrounds() {
        var palette by mutableStateOf(InterfacePalette())
        val flow=TySettingsPage.parse(JSONObject("""{"key":"appearance","nodes":[{"id":"query","kind":"input","title":"Search","value":""}],"layout":{"id":"page","kind":"column","style":{"gap":12},"children":[{"id":"input","kind":"control","ref":"query"},{"id":"samples","kind":"row","style":{"gap":6},"children":[{"id":"light-sample","kind":"column","text":"#E3ECF5","style":{"grow":true,"height":44,"padding":[8,8,8,8],"gap":6},"children":[{"id":"light-line","kind":"spacer","text":"#172A38","style":{"width":22,"height":4}}]},{"id":"dark-sample","kind":"column","text":"#101A28","style":{"grow":true,"height":44,"padding":[8,8,8,8]},"children":[{"id":"dark-line","kind":"spacer","text":"#E8F1F9","style":{"width":22,"height":4}}]}]},{"id":"surface","kind":"card","style":{"height":40},"children":[]}]}}"""))
        compose.setContent {
            CompositionLocalProvider(LocalInterfacePalette provides palette,LocalTextStyle provides TextStyle(color=palette.ink)) {
                SettingsLayoutView(flow.layout!!,flow.nodes.associateBy{it.id},TyPanelTheme.of(palette.light,palette.style),{_,_,_->},Modifier.width(300.dp).background(palette.sheet))
            }
        }
        compose.onNode(hasSetTextAction()).performTextInput("retained query")
        for(style in listOf("classic","glacier"))for(light in listOf(false,true)) {
            compose.runOnIdle { palette=InterfacePalette(light,style) };compose.waitForIdle()
            compose.onNode(hasSetTextAction()).assertTextEquals("retained query").assertIsFocused()
            val lightBounds=compose.onNodeWithTag("settings-layout:light-sample",useUnmergedTree=true).fetchSemanticsNode().boundsInWindow
            val darkBounds=compose.onNodeWithTag("settings-layout:dark-sample",useUnmergedTree=true).fetchSemanticsNode().boundsInWindow
            val bitmap=compose.runOnIdle {
                val view=compose.activity.window.decorView
                android.graphics.Bitmap.createBitmap(view.width,view.height,android.graphics.Bitmap.Config.ARGB_8888).also { view.draw(android.graphics.Canvas(it)) }
            }
            assertEquals(Color(0xFFE3ECF5).toArgb(),bitmap.getPixel(lightBounds.center.x.toInt(),lightBounds.bottom.toInt()-3))
            assertEquals(Color(0xFF101A28).toArgb(),bitmap.getPixel(darkBounds.center.x.toInt(),darkBounds.bottom.toInt()-3))
            val file=File("build/reports/interface-themes/"+style+"-"+(if(light)"light" else "dark")+".png")
            file.parentFile!!.mkdirs();file.outputStream().use{bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)}
        }
    }
}
