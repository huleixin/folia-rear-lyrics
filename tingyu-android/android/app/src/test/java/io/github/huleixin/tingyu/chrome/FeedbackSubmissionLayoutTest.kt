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

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/FeedbackSubmissionLayoutTest.kt
// Fixtures are captured from FeedbackPanel by feedbackPanelInteraction.test.ts.
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[34],qualifiers="w393dp-h852dp-160dpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class FeedbackSubmissionLayoutTest {
    @get:Rule val compose=createAndroidComposeRule<ComponentActivity>()
    private fun fixture(name:String)=JSONObject(javaClass.classLoader!!.getResource("settings-layout/"+name+".json")!!.readText())
    private fun screenshot(name:String,width:Int,height:Int){
        val output=System.getenv("TINGYU_LAYOUT_SCREENSHOTS")?:return
        compose.runOnIdle {
            val file=File(output,name+".png");file.parentFile?.mkdirs()
            val bitmap=android.graphics.Bitmap.createBitmap(width,height,android.graphics.Bitmap.Config.ARGB_8888)
            compose.activity.window.decorView.draw(android.graphics.Canvas(bitmap))
            file.outputStream().use{bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()
        }
    }

    private fun review(width:Int,height:Int){
        var stage by mutableStateOf("feedback-submit")
        var consent by mutableStateOf(false)
        var palette by mutableStateOf(InterfacePalette(true))
        val events=mutableListOf<String>()
        compose.setContent { CompositionLocalProvider(LocalInterfacePalette provides palette){
            val f=fixture(stage)
            if(consent){val nodes=f.getJSONArray("nodes");for(i in 0 until nodes.length()){
                val n=nodes.getJSONObject(i);if(n.optString("title")=="确认上传")n.put("disabled",false)
                if(n.optString("kind")=="switch")n.put("value","1")
            }}
            val action:PageAction={id,text,_->
                events+=id
                if(stage=="feedback-submit"&&id.startsWith("act:"))stage="feedback-confirm"
                else if(id.startsWith("set:")&&text=="1")consent=true
            }
            // Render the production dialog and contents. The underlying Haze header needs
            // a RenderScript surface which Robolectric cannot allocate on a software Canvas.
            val modal=TySettingsPage.parse(f);val theme=settingsFlowTheme()
            CompositionLocalProvider(LocalSettingsPreviewViewport provides androidx.compose.ui.geometry.Rect(0f,0f,width.toFloat(),height.toFloat())) {
                Box(Modifier.width(width.dp).height(height.dp)){
                    TyDialogFrame(theme,modal.title,modal.subtitle,onClose={},settingsLayout=modal.layout!=null){
                        TySettingsContent(modal,theme,action)
                    }
                }
            }
        }}
        for(style in listOf("classic","glacier"))for(light in listOf(true,false)){
            compose.runOnIdle { palette=InterfacePalette(light,style);stage="feedback-submit";consent=false;events.clear() };compose.waitForIdle()
            val variant=style+"-"+(if(light)"light" else "dark")+"-"+width
            screenshot("feedback-categories-"+variant,width,height)
            compose.onNodeWithText("提交反馈").performScrollTo().assertIsDisplayed().performClick();compose.waitForIdle()
            val submit=compose.onNodeWithText("确认上传")
            submit.performScrollTo().assertIsDisplayed().assertIsNotEnabled()
            val consentTitle=TySettingsPage.parse(fixture("feedback-confirm")).nodes.first{it.kind=="switch"}.title
            compose.onNodeWithContentDescription(consentTitle).performScrollTo().performClick();compose.waitForIdle()
            submit.performScrollTo().assertIsEnabled()
            val bounds=submit.fetchSemanticsNode().boundsInRoot
            assertTrue(bounds.left>=0&&bounds.right<=width+1f)
            screenshot("feedback-"+variant,width,height)
            submit.performClick();compose.waitForIdle();assertTrue(events.last().startsWith("act:"))
        }
    }
    @Test fun phoneSubmissionKeepsPrimaryAndConsentReachable()=review(393,852)
    @Test @Config(qualifiers="w1024dp-h768dp-160dpi") fun padSubmissionKeepsPrimaryAndConsentReachable()=review(1024,768)
}
