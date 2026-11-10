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

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/SettingsDetailsLayoutTest.kt
// Real state-host fixtures exercise Compose constraints, not browser geometry.
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w393dp-h852dp-160dpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SettingsDetailsLayoutTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private data class Screen(val name:String,val width:Int=393,val height:Int=852,val light:Boolean=true)
    private var screen by mutableStateOf(Screen("feedback"))
    private val events=mutableListOf<Pair<String,String>>()
    private fun json(name:String)=JSONObject(javaClass.classLoader!!.getResource("settings-layout/$name.json")!!.readText())
    private fun all(node:SettingsLayoutNode):List<SettingsLayoutNode> = listOf(node)+node.children.flatMap(::all)
    private fun tagged(node:SettingsLayoutNode)=compose.onNodeWithTag("settings-layout:${node.id}",useUnmergedTree=true)
    private fun start() {
        compose.setContent { val s=screen
            CompositionLocalProvider(LocalInterfacePalette provides InterfacePalette(s.light)) { key(s) {
                val flow=json(s.name)
                val page=NativePage.parse(JSONObject().put("id","settings").put("session","details-qa")
                    .put("viewportWidth",s.width).put("width",s.width).put("height",s.height)
                    .put("model",JSONObject().put("key","settings:document:qa").put("title",flow.optString("title"))
                        .put("document",JSONObject().put("flow",flow))))
                NativePageView(page,Modifier.width(s.width.dp).height(s.height.dp)) { id,text,_->events+=id to text }
            } }
        }
    }
    private fun show(s:Screen):TySettingsPage {
        compose.runOnIdle { screen=s };compose.waitForIdle()
        val page=TySettingsPage.parse(json(s.name))
        return page.modal?:page
    }
    private fun save(suffix:String) {
        val output=System.getenv("TINGYU_LAYOUT_SCREENSHOTS")?:return
        val s=screen
        val file=File(output,"native-${s.name}-${if(s.light)"light" else "dark"}-${s.width}-${s.height}-$suffix.png")
        file.parentFile?.mkdirs()
        compose.runOnIdle {
            val bitmap=android.graphics.Bitmap.createBitmap(s.width,s.height,android.graphics.Bitmap.Config.ARGB_8888)
            compose.activity.window.decorView.draw(android.graphics.Canvas(bitmap))
            file.outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it) }
            bitmap.recycle()
        }
    }
    // Scroll every control into view before checking it; zero-width/offscreen switches must fail.
    private fun switches(page:TySettingsPage) {
        val nodes=all(page.layout!!)
        for(row in nodes.filter { it.kind=="row" })for(child in row.children) {
            val control=page.nodes.firstOrNull { it.id==child.ref&&it.kind=="switch" }?:continue
            tagged(child).performScrollTo().assertIsDisplayed()
            val bounds=tagged(child).fetchSemanticsNode().boundsInRoot
            assertTrue("Clipped switch "+control.title+": "+bounds,bounds.width>=46f&&bounds.height>=24f)
            assertTrue(bounds.left>=0&&bounds.right<=screen.width+1f)
            row.children.filter { it.style.grow }.forEach { copy ->
                val text=tagged(copy).fetchSemanticsNode().boundsInRoot
                assertTrue("Copy overlaps switch: "+control.title,text.right+row.style.gap<=bounds.left+1f||bounds.right+row.style.gap<=text.left+1f)
            }
            tagged(child).performClick()
            assertEquals(TySettingEvent.set(control.action),events.last().first)
            save("switch-"+page.nodes.indexOf(control))
        }
    }
    @Test fun appearanceSwitchesKeepTheirWidthInBothThemesAndOnNarrowScreens() {
        start()
        for(width in listOf(393,320))for(light in listOf(true,false)) {
            val page=show(Screen("appearance",width,700,light));save("top");switches(page)
        }
    }
    @Test fun dialogsKeepGroupedContentAndReachableBottomActions() {
        start()
        for(size in listOf(393 to 852,320 to 380))for(light in listOf(true,false))for(name in listOf("feedback","lx-empty","lx-populated")) {
            val page=show(Screen(name,size.first,size.second,light));save("top")
            compose.onAllNodesWithText(page.title).onLast().assertIsDisplayed()
            compose.onAllNodesWithContentDescription("关闭").assertCountEquals(1)
            val tree=all(page.layout!!)
            tree.filter { it.kind=="grid"&&it.style.columns==2 }.forEach { grid ->
                grid.children.chunked(2).filter { it.size==2 }.forEach { pair ->
                    tagged(pair[0]).performScrollTo()
                    // A stacked second action can be below the scroll viewport. Compare its
                    // full layout bounds, then separately prove both actions are reachable.
                    val a=tagged(pair[0]).getUnclippedBoundsInRoot()
                    val b=tagged(pair[1]).getUnclippedBoundsInRoot()
                    assertEquals((a.right-a.left).value,(b.right-b.left).value,1f)
                    if(grid.style.stackBelow>screen.width) {
                        assertTrue("Compact actions overlap",a.bottom<=b.top)
                    } else {
                        assertEquals(a.top.value,b.top.value,1f);assertTrue(a.right<b.left)
                    }
                    pair.forEach { tagged(it).performScrollTo().assertIsDisplayed() }
                }
            }
            if(name=="feedback") {
                val input=compose.onAllNodes(hasSetTextAction()).onFirst()
                val field=tree.single { layout -> page.nodes.any { it.id==layout.ref&&it.kind=="input" } }
                tagged(field).performScrollTo().assertIsDisplayed()
                input.assertIsDisplayed()
                val fieldBounds=tagged(field).fetchSemanticsNode().boundsInRoot
                assertTrue("Input card: $fieldBounds",fieldBounds.height>=112f)
                // The editable hit area fills the card, except its 10dp top/bottom padding.
                val inputBounds=input.fetchSemanticsNode().boundsInRoot
                assertTrue("Editable area: $inputBounds",inputBounds.height>=92f)
                input.performTextReplacement("原生反馈输入")
                assertTrue(events.any { it.second=="原生反馈输入" })
                switches(page)
            }
            val last=tree.last { it.kind=="control" }
            tagged(last).performScrollTo().assertIsDisplayed();save("bottom")
            tagged(last).performClick()
            val control=page.nodes.first { it.id==last.ref }
            assertEquals(TySettingEvent.action(control.action),events.last().first)
        }
    }
    @Test fun diagnosticsShowsActionsBeforeLogsAndBoundsTheExpandedConsole() {
        start()
        for(width in listOf(393,320))for(name in listOf("rear-diagnostics","rear-diagnostics-expanded")) {
            val page=show(Screen(name,width,700));save("top")
            compose.onNodeWithText("刷新状态").assertIsDisplayed()
            compose.onNodeWithText("导出诊断数据").assertIsDisplayed()
            val console=all(page.layout!!).singleOrNull { it.style.scroll }
            if(name=="rear-diagnostics")assertNull(console) else {
                assertNotNull(console)
                tagged(console!!).performScrollTo()
                assertTrue(tagged(console).fetchSemanticsNode().boundsInRoot.height<=320f)
                // One Text contains all log lines. Scroll its container to the real final offset.
                tagged(console).performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.ScrollBy) { it(0f,100000f) }
                compose.waitForIdle()
                val range=tagged(console).fetchSemanticsNode().config[androidx.compose.ui.semantics.SemanticsProperties.VerticalScrollAxisRange]
                assertTrue(range.maxValue()>0f);assertEquals(range.maxValue(),range.value(),1f)
                save("log-end")
            }
        }
    }
    @Test fun aboutKeepsAttributionAndACompactFooterWithoutRemovedEntries() {
        start()
        val page=show(Screen("help",320,700));save("top")
        compose.onAllNodesWithText("版本更新").assertCountEquals(0)
        compose.onAllNodesWithText("听屿下载与完整源码").assertCountEquals(0)
        val tree=all(page.layout!!)
        val tail=tree.last { it.kind=="text"||it.kind=="control" }
        tagged(tail).performScrollTo().assertIsDisplayed();save("bottom")
        assertTrue(tree.any { it.text.contains("AGPL-3.0") })
    }
}
