package io.github.huleixin.tingyu.chrome

import android.graphics.Bitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.function.Consumer
import com.getcapacitor.JSObject

// android/app/src/androidTest/java/io/github/huleixin/tingyu/chrome/MiniSleepMenuDeviceTest.kt
@RunWith(AndroidJUnit4::class)
class MiniSleepMenuDeviceTest {
    @get:Rule val ui=createAndroidComposeRule<MiniSleepPreviewActivity>()
    private fun open(){ui.onNodeWithContentDescription("定时关闭",substring=true).performClick()}
    private fun snapshot()=ui.activity.session.timer.snapshot()
    private fun capture(name:String){
        val file=File(ui.activity.externalCacheDir,"sleep-menu-$name.png")
        file.outputStream().use{stream->ui.onRoot().captureToImage().asAndroidBitmap().compress(Bitmap.CompressFormat.PNG,100,stream)}
    }
    @Test fun quickCustomCancelAndRecreationShareOneNativeTask(){
        open();ui.onNodeWithText("30 分钟").performClick()
        ui.runOnIdle{assertTrue(snapshot().optBoolean("active"));assertEquals(1800000,snapshot().optLong("durationMs"))}
        ui.onNodeWithText("更多选项 ›").assertDoesNotExist()
        open();ui.onNodeWithText("修改").performClick();ui.onNodeWithContentDescription("增加小时").performClick()
        ui.onNodeWithText("开始定时").performClick()
        ui.runOnIdle{assertEquals(5400000,snapshot().optLong("durationMs"))}
        val before=ui.activity.session.timer
        ui.activityRule.scenario.recreate();ui.waitForIdle()
        ui.runOnIdle{assertSame(before,ui.activity.session.timer);assertTrue(snapshot().optBoolean("active"));assertTrue(snapshot().optLong("remainingMs")<=5400000)}
        open();ui.onNodeWithText("取消定时").performClick();ui.runOnIdle{assertFalse(snapshot().optBoolean("active"))}
    }
    @Test fun bothViewsFit320360393AndLightThemeWithoutChangingMiniHeight(){
        for(width in listOf(320,360,393))for(light in listOf(false,true)){
            ui.runOnIdle{ui.activity.previewWidth=width;ui.activity.light=light};open();ui.waitForIdle()
            capture("$width-${if(light)"light"else"dark"}-quick")
            ui.onNodeWithText("更多选项 ›").performClick();ui.onNodeWithText("开始定时").assertIsDisplayed()
            capture("$width-${if(light)"light"else"dark"}-advanced")
            ui.onNodeWithContentDescription("关闭定时菜单").performTouchInput{click(Offset(2f,2f))}
        }
    }
    @Test fun missingMediaFailureKeepsMenuOpenAndDoesNotArm(){
        ui.runOnIdle{ui.activity.session.timer.detach()};open();ui.onNodeWithText("15 分钟").performClick()
        ui.onNodeWithText("请先选择歌曲并使用系统原生播放引擎").assertExists()
        ui.runOnIdle{assertFalse(snapshot().optBoolean("active"))}
    }
    @Test fun trackModeHasNoInventedClockAndCanBeCancelledAfterLock(){
        open();ui.onNodeWithText("本曲结束").performClick();open()
        ui.onNodeWithText("等待当前歌曲自然结束").assertExists()
        ui.onNodeWithText("00:00").assertDoesNotExist()
        ui.runOnIdle{assertEquals("track",snapshot().optString("mode"));assertTrue(snapshot().optBoolean("waiting"))}
        val automation=InstrumentationRegistry.getInstrumentation().uiAutomation
        automation.executeShellCommand("input keyevent 223").close()
        automation.executeShellCommand("input keyevent 224").close()
        automation.executeShellCommand("wm dismiss-keyguard").close()
        ui.waitForIdle();ui.runOnIdle{assertTrue(snapshot().optBoolean("active"))}
        ui.onNodeWithText("取消定时").performClick();ui.runOnIdle{assertFalse(snapshot().optBoolean("active"))}
    }
    @Test fun nativeAndWebObserversAreIndependentAndOneFailureCannotChangeTimerOutcome(){
        var a=0;var b=0
        val first=Consumer<JSObject>{a++};val second=Consumer<JSObject>{b++};val failing=Consumer<JSObject>{throw IllegalStateException("observer")}
        ui.runOnIdle{
            val timer=ui.activity.session.timer
            timer.observe(first);timer.observe(first);timer.observe(failing);timer.observe(second)
            try{timer.start("deadline",900000);assertEquals(1,a);assertEquals(1,b);timer.unobserve(first);timer.cancel("test");assertEquals(1,a);assertEquals(2,b)}
            finally{timer.unobserve(first);timer.unobserve(second);timer.unobserve(failing)}
        }
    }
}
