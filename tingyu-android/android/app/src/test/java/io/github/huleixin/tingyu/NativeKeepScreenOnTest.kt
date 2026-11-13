package io.github.huleixin.tingyu

import android.app.Activity
import android.view.WindowManager
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

// android/app/src/test/java/io/github/huleixin/tingyu/NativeKeepScreenOnTest.kt
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class NativeKeepScreenOnTest {
    @Test fun stageAndMinimalPageRequestsReleaseIndependently() {
        val host = Robolectric.buildActivity(Activity::class.java).setup()
        val activity = host.get()
        fun awake() = activity.window.attributes.flags and WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON != 0
        try {
            NativeKeepScreenOn.attach(activity)
            NativeKeepScreenOn.reset()
            NativeKeepScreenOn.setGlobal(true)
            assertFalse(awake())
            NativeKeepScreenOn.setStageVisible(true)
            assertTrue(awake())
            NativeKeepScreenOn.setStageVisible(false)
            assertFalse(awake())
            NativeKeepScreenOn.setLyrics(true)
            assertTrue(awake())
            NativeKeepScreenOn.setGlobal(false)
            assertTrue(awake())
            NativeKeepScreenOn.setLyrics(false)
            assertFalse(awake())
            NativeKeepScreenOn.setGlobal(true)
            NativeKeepScreenOn.setStageVisible(true)
            NativeKeepScreenOn.reset()
            assertFalse(awake())
        } finally {
            NativeKeepScreenOn.setGlobal(false)
            NativeKeepScreenOn.reset()
            host.pause().stop().destroy()
        }
    }
}
