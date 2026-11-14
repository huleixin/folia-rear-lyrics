package io.github.huleixin.tingyu.chrome

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.width
import androidx.compose.material3.LocalTextStyle
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
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

// Selection semantics and actual Compose geometry; LEGACY does not validate GPU pixels.
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w800dp-h852dp-160dpi")
@GraphicsMode(GraphicsMode.Mode.LEGACY)
class SettingsSelectionTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private data class Screen(val width: Int, val light: Boolean, val style: String)
    private var screen by mutableStateOf(Screen(393, true, "classic"))
    private var selected by mutableStateOf("pixel")
    private val labels = linkedMapOf("pixel" to "像素", "fluid" to "流体", "mixed" to "混合")
    private fun control(id: String): SettingsLayoutNode = SettingsLayoutNode(
        id, "control", SettingsLayoutStyle(radius=16f, border=true, font=14f, padding=listOf(12f,8f,12f,8f)),
        id, "", "", listOf(SettingsLayoutNode("label:$id", "text", SettingsLayoutStyle(), "", labels.getValue(id), "", emptyList())))
    private fun flow() = TySettingsPage.parse(JSONObject().put("nodes", org.json.JSONArray(labels.map { (id, label) ->
        JSONObject().put("id",id).put("kind","action").put("title",label).put("detail",if(id==selected)"✓" else "")
    })))

    @Test fun selectionChangesAndLabelsFitOnPhoneAndTabletAcrossThemes() {
        compose.setContent {
            val s=screen; val theme=TyPanelTheme.of(s.light,s.style)
            CompositionLocalProvider(LocalInterfacePalette provides InterfacePalette(s.light,s.style),
                LocalTextStyle provides TextStyle(color=theme.text)) {
                SettingsLayoutView(SettingsLayoutNode("group","wrap",SettingsLayoutStyle(gap=8f),"","","",labels.keys.map(::control)),
                    flow().nodes.associateBy { it.id },theme,{ id,_,_-> selected=id.removePrefix("act:") },Modifier.width(s.width.dp))
            }
        }
        for(width in listOf(320,393,800)) for(light in listOf(true,false)) for(style in listOf("classic","glacier")) {
            compose.runOnIdle { screen=Screen(width,light,style); selected="pixel" }; compose.waitForIdle()
            fun pill(id:String)=compose.onNodeWithTag("settings-layout:$id",useUnmergedTree=true)
            for(id in labels.keys) {
                pill(id).assert(if(id=="pixel")isSelected() else isNotSelected())
                val p=pill(id).getUnclippedBoundsInRoot()
                val label=compose.onNodeWithTag("settings-layout:label:$id",useUnmergedTree=true).getUnclippedBoundsInRoot()
                assertTrue("Label $label outside $p",label.left>=p.left && label.right<=p.right && label.top>=p.top && label.bottom<=p.bottom)
                assertTrue("Noncompact choice $p",p.right-p.left < 120.dp)
                assertTrue("Choice outside viewport $p",p.left>=0.dp && p.right<=width.dp)
            }
            val rects=labels.keys.map { pill(it).getUnclippedBoundsInRoot() }
            rects.zipWithNext().forEach { (a,b) -> assertTrue("Choices overlap $a $b",a.right+7.dp<=b.left) }
            pill("fluid").performClick();compose.waitForIdle()
            pill("fluid").assertIsSelected();pill("pixel").assertIsNotSelected();pill("mixed").assertIsNotSelected()
        }
    }
}
