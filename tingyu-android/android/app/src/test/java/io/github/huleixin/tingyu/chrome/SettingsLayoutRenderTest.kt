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
import org.robolectric.annotation.GraphicsMode
import java.io.File

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/SettingsLayoutRenderTest.kt
// Fixtures come from real settings state hosts. Assert native geometry and save rendered
// frames for visual review; passing a semantic contract alone cannot prove a layout.
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w393dp-h852dp-160dpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SettingsLayoutRenderTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private val routes = listOf("appearance", "general", "playback", "integration", "storage", "graphics", "developer", "help", "offset-editor", "filter-editor", "stage-editor", "theme-editor", "theme-park")
    private fun flow(name:String)=JSONObject(javaClass.classLoader!!.getResource("settings-layout/$name.json")!!.readText())
    private fun page(flow:JSONObject,width:Int,height:Int)=NativePage.parse(JSONObject().put("id","settings").put("session","layout-qa")
        .put("viewportWidth",width).put("width",width).put("height",height).put("model",JSONObject().put("key","settings:document:qa")
            .put("title",flow.optString("title")).put("document",JSONObject().put("flow",flow))))
    private fun descendants(node:SettingsLayoutNode):List<SettingsLayoutNode> = listOf(node)+node.children.flatMap(::descendants)

    private fun review(width:Int,height:Int,themes:List<Boolean>) {
        var route by mutableStateOf(routes.first())
        var light by mutableStateOf(false)
        compose.setContent { CompositionLocalProvider(LocalInterfacePalette provides InterfacePalette(light)) {
            key(route,light){NativePageView(page(flow(route),width,height),Modifier.width(width.dp).height(height.dp)) { _,_,_-> }}
        } }
        for(theme in themes)for(name in routes) {
            compose.runOnIdle { route=name; light=theme }; compose.waitForIdle()
            val model=TySettingsPage.parse(flow(name)); val layout=model.layout!!
            compose.onNodeWithText(model.title).assertIsDisplayed()
            compose.onNodeWithContentDescription("返回").assertIsDisplayed()
            assertTrue("Header moved outside its fixed inset: $name",compose.onNodeWithText(model.title).fetchSemanticsNode().boundsInRoot.top>=24f)
            // Every two-column choice retains equal widths and a shared top edge.
            descendants(layout).filter { it.kind=="grid"&&it.style.columns==2&&it.children.size>=2 }.forEach { grid ->
                val a=compose.onNodeWithTag("settings-layout:${grid.children[0].id}",useUnmergedTree=true).fetchSemanticsNode().boundsInRoot
                val b=compose.onNodeWithTag("settings-layout:${grid.children[1].id}",useUnmergedTree=true).fetchSemanticsNode().boundsInRoot
                if(a.height>0&&b.height>0) { assertEquals(a.top,b.top,1f); assertEquals(a.width,b.width,1f); assertTrue(a.right<=b.left+1f) }
            }
            // A switch belongs beside its copy, never beneath it or outside the screen.
            descendants(layout).filter { it.kind=="row"&&it.children.any { c->model.nodes.any { n->n.id==c.ref&&n.kind=="switch" } } }.forEach { row ->
                row.children.filter { child->model.nodes.any { it.id==child.ref&&it.kind=="switch" } }.forEach { child ->
                    val b=compose.onNodeWithTag("settings-layout:${child.id}",useUnmergedTree=true).fetchSemanticsNode().boundsInRoot
                    if(b.height>0)assertTrue("$name toggle outside viewport: $b",b.left>=0&&b.right<=width+1f)
                }
            }
            val output=System.getenv("TINGYU_LAYOUT_SCREENSHOTS")
            if(output!=null) { val file=File(output,"native-$name-${if(theme)"light" else "dark"}-$width-$height.png");file.parentFile?.mkdirs()
                compose.runOnIdle {
                    val view=compose.activity.window.decorView
                    val bitmap=android.graphics.Bitmap.createBitmap(width,height,android.graphics.Bitmap.Config.ARGB_8888)
                    view.draw(android.graphics.Canvas(bitmap))
                    file.outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it) }
                    bitmap.recycle()
                }
            }
            if(height<400)descendants(layout).lastOrNull { it.kind=="text"||it.kind=="control" }?.let { tail ->
                compose.onNodeWithTag("settings-layout:${tail.id}",useUnmergedTree=true).performScrollTo().assertIsDisplayed()
            }
        }
    }
    @Test fun restoredInlineInputStillEditsAndClearsThroughItsOriginalHandler() {
        val source=flow("theme-editor");val events=mutableListOf<Pair<String,String>>()
        val model=TySettingsPage.parse(source);val field=model.nodes.first { it.kind=="input" }
        compose.setContent { NativePageView(page(source,320,380),Modifier.width(320.dp).height(380.dp)) { id,text,_->events+=id to text } }
        val input=compose.onAllNodes(hasSetTextAction()).onFirst()
        input.performScrollTo().performTextReplacement("#447755");input.performTextClearance()
        assertTrue(events.any { it.first==TySettingEvent.submit(field.action)&&it.second=="#447755" })
        assertTrue(events.any { it.first==TySettingEvent.submit(field.action)&&it.second.isEmpty() })
    }
    @Test fun originalGroupsGridsAndRowsRenderInBothThemes()=review(393,852,listOf(false,true))
    @Test fun narrowPagesKeepTheirControlsInsideTheViewport()=review(320,700,listOf(true))
    @Test fun reducedViewportKeepsNativeScrollingAvailable()=review(320,380,listOf(true))
}
