package io.github.huleixin.tingyu.chrome

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import io.github.huleixin.tingyu.lyrics.LyricsPreferences
import io.github.huleixin.tingyu.lyrics.LyricsPreferencesState
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

// LyricsFullScreenSettingsTest.kt: render all four actual pages and exercise their common Back control.
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[30],qualifiers="zh-rCN-w393dp-h852dp-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class LyricsFullScreenSettingsTest {
    @get:Rule val compose=createAndroidComposeRule<ComponentActivity>()
    @Test fun pagesCoverWindowAcrossThemesAndRetainBack(){
        LyricsPreferences.get(compose.activity).update{LyricsPreferencesState()}
        var page by mutableStateOf(0);var palette by mutableStateOf(InterfacePalette(true,"classic"));var backs=0
        compose.setContent{CompositionLocalProvider(LocalInterfacePalette provides palette,LocalChromeRendering provides false){
            Box(Modifier.fillMaxSize()){key(page){
                when(page){
                    0->LyricsSettingsSheet(compose.activity,onClose={backs++})
                    1->BluetoothLyricsSettingsSheet(compose.activity,requestPermission={},onClose={backs++})
                    2->SupportSheets("coffee",null){backs++}
                    else->SupportSheets("group",null){backs++}
                }
            }}
        }}
        for((theme,light) in listOf("classic" to true,"glacier" to true,"glacier" to false))for(index in 0..3){
            compose.runOnIdle{page=index;palette=InterfacePalette(light,theme)}
            compose.waitForIdle()
            val frame=compose.onNodeWithTag("native-settings-fullscreen").fetchSemanticsNode().boundsInRoot
            val root=compose.onRoot().fetchSemanticsNode().boundsInRoot
            assertEquals(root.width,frame.width,.1f);assertEquals(root.height,frame.height,.1f)
            compose.runOnIdle{
                val view=compose.activity.window.decorView;val bitmap=Bitmap.createBitmap(view.width,view.height,Bitmap.Config.ARGB_8888);view.draw(Canvas(bitmap))
                val f=File("build/reports/lyrics-fullscreen/$theme-$light-$index.png");f.parentFile!!.mkdirs();f.outputStream().use{bitmap.compress(Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()
            }
            compose.onNodeWithContentDescription("返回").performTouchInput{click()}
        }
        assertEquals(12,backs)
    }
}
