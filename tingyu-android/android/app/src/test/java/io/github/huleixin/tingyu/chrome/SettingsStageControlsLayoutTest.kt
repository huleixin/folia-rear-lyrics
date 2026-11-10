package io.github.huleixin.tingyu.chrome

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.DpRect
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

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/SettingsStageControlsLayoutTest.kt
// Rear FPS inset and stage option pills, rendered from real state-host fixtures.
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w393dp-h852dp-160dpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SettingsStageControlsLayoutTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private data class Screen(val name:String,val width:Int=393,val light:Boolean=true)
    private var screen by mutableStateOf(Screen("rear-fps"))
    private data class Event(val id:String,val value:Double)
    private val events=mutableListOf<Event>()
    private fun json(name:String)=JSONObject(javaClass.classLoader!!.getResource("settings-layout/$name.json")!!.readText())
    private fun all(node:SettingsLayoutNode):List<SettingsLayoutNode> = listOf(node)+node.children.flatMap(::all)
    private fun tagged(node:SettingsLayoutNode)=compose.onNodeWithTag("settings-layout:${node.id}",useUnmergedTree=true)
    private fun start() {
        compose.setContent { val s=screen
            CompositionLocalProvider(LocalInterfacePalette provides InterfacePalette(s.light)) { key(s) {
                val flow=json(s.name)
                val page=NativePage.parse(JSONObject().put("id","settings").put("session","stage-qa")
                    .put("viewportWidth",s.width).put("width",s.width).put("height",852)
                    .put("model",JSONObject().put("key","settings:document:qa").put("title",flow.optString("title"))
                        .put("document",JSONObject().put("flow",flow))))
                NativePageView(page,Modifier.width(s.width.dp).height(852.dp)) { id,_,value->events+=Event(id,value) }
            } }
        }
    }
    private fun show(s:Screen):TySettingsPage { compose.runOnIdle { screen=s };compose.waitForIdle();return TySettingsPage.parse(json(s.name)) }
    private fun save(suffix:String) {
        val output=System.getenv("TINGYU_LAYOUT_SCREENSHOTS")?:return
        val s=screen
        val file=File(output,"native-${s.name}-${if(s.light)"light" else "dark"}-${s.width}-$suffix.png");file.parentFile?.mkdirs()
        compose.runOnIdle {
            val bitmap=android.graphics.Bitmap.createBitmap(s.width,852,android.graphics.Bitmap.Config.ARGB_8888)
            compose.activity.window.decorView.draw(android.graphics.Canvas(bitmap))
            file.outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it) };bitmap.recycle()
        }
    }
    private fun bounds(node:SettingsLayoutNode):DpRect=tagged(node).getUnclippedBoundsInRoot()
    private fun path(root:SettingsLayoutNode,target:SettingsLayoutNode):List<SettingsLayoutNode>? =
        if(root===target)listOf(root) else root.children.firstNotNullOfOrNull { path(it,target) }?.let { listOf(root)+it }

    @Test fun frameRateSliderKeepsTheCardInsetAndCommitsEveryEndpoint() {
        start()
        for(width in listOf(393,320))for(light in listOf(true,false))for(name in listOf("rear-fps","rear-fps-off")) {
            val page=show(Screen(name,width,light))
            val slider=page.nodes.single { it.kind=="slider"&&it.title=="限制档位" }
            val tree=page.layout!!
            val layout=all(tree).single { it.ref==slider.id }
            val chain=path(tree,layout)!!
            val card=chain.last { it.kind=="card" }
            val column=chain.last { it.style.padding==listOf(14f,0f,14f,14f) }
            tagged(layout).performScrollTo().assertIsDisplayed();save("fps")
            val c=bounds(card);val s=bounds(layout)
            assertTrue("Slider left inset: $s in $c",s.left-c.left>=13.dp)
            assertTrue("Slider right inset: $s in $c",c.right-s.right>=13.dp)
            assertTrue("Bottom inset: $s in $c",c.bottom-s.bottom>=13.dp)
            // Label/value row and tick labels share the inset column with the track.
            for(text in all(column).filter { it.kind=="text" }) {
                val t=bounds(text)
                assertTrue("Text ${text.text} outside inset: $t in $c",t.left-c.left>=13.dp&&c.right-t.right>=12.dp)
            }
            val before=events.size
            tagged(layout).performTouchInput { click(Offset(2f,centerY)) }
            tagged(layout).performTouchInput { click(Offset(right-2f,centerY)) }
            compose.waitForIdle()
            if(slider.disabled) assertEquals("Disabled limiter must not commit",before,events.size)
            else assertEquals(listOf(0.0,3.0),events.drop(before).filter { it.id==TySettingEvent.slide(slider.action) }.map { it.value })
        }
    }

    @Test fun stageOptionGroupsStayCompactSelectableAndInsideTheirCard() {
        start()
        for(width in listOf(393,320))for(light in listOf(true,false))for(name in listOf("stage-sonnet","stage-sonnet-post")) {
            val page=show(Screen(name,width,light))
            val tree=page.layout!!
            val byId=page.nodes.associateBy { it.id }
            val groups=all(tree).filter { g->g.kind=="wrap"&&g.children.size in 2..3&&g.children.all { it.kind=="control"&&byId[it.ref]!=null } }
            assertTrue("Option groups missing: ${groups.size}",groups.size>=8)
            groups.forEachIndexed { index,group->
                tagged(group).performScrollTo()
                val card=path(tree,group)!!.lastOrNull { it.kind=="card" }
                val pills=group.children.map(::bounds)
                // Short choices sit on one line at normal width; on narrow screens they may wrap, but never overlap.
                if(width>=393)pills.zipWithNext().forEach { (a,b)->assertEquals(a.top.value,b.top.value,1f);assertTrue("Overlap $a $b",a.right+7.dp<=b.left) }
                else for(i in pills.indices)for(j in i+1 until pills.size){val a=pills[i];val b=pills[j]
                    assertTrue("Overlap $a $b",a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top)}
                assertEquals("Pills must not stack one per line",true,width<393||pills.map { it.top.value.toInt() }.distinct().size==1)
                pills.forEach { assertTrue("Pill height $it",it.bottom-it.top in 34.dp..48.dp);assertTrue("Pill not compact $it",it.right-it.left<(width/2).dp) }
                if(card!=null){val c=bounds(card);pills.forEach { assertTrue("Pill outside card $it $c",it.left>=c.left&&it.right<=c.right) }}
                val selected=group.children.filter { byId[it.ref]!!.detail=="✓" }
                assertEquals("Exactly one selected choice",1,selected.size)
                tagged(selected[0]).assert(isSelected() or hasAnyDescendant(isSelected()))
                if(index<3){
                    val other=group.children.first { it!==selected[0] }
                    tagged(other).performClick()
                    assertEquals(TySettingEvent.action(byId[other.ref]!!.action),events.last().id)
                    save("group-$index")
                }
            }
            // The visualizer mode list wraps into rows without overlapping.
            val modes=all(tree).first { g->g.kind=="wrap"&&g.children.size>=10 }
            tagged(modes).performScrollTo();save("modes")
            val rects=modes.children.map(::bounds)
            for(i in rects.indices)for(j in i+1 until rects.size){val a=rects[i];val b=rects[j]
                assertTrue("Mode pills overlap",a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top)}
        }
    }
}

