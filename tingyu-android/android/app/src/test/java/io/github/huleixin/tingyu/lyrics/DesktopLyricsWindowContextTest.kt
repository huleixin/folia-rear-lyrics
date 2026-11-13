package io.github.huleixin.tingyu.lyrics

import android.app.Service
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.os.IBinder
import android.view.Display
import android.view.WindowManager
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

// Model the real service restriction; Compose screenshot tests never exercised this constructor.
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30, 31, 34])
class DesktopLyricsWindowContextTest {
    class PlaybackService : Service() { override fun onBind(intent: Intent?): IBinder? = null }
    @Test fun nonVisualServiceIsBoundToDefaultDisplayBeforeCreatingOverlayContext() {
        val service = Robolectric.buildService(PlaybackService::class.java).create()
        try {
            var boundDisplay = -1
            val nonVisual = object : ContextWrapper(service.get()) {
                override fun createWindowContext(type: Int, options: android.os.Bundle?): Context =
                    throw UnsupportedOperationException("Service is not associated with a display")
                override fun createDisplayContext(display: Display): Context {
                    boundDisplay = display.displayId
                    return super.createDisplayContext(display)
                }
            }
            assertThrows(UnsupportedOperationException::class.java) {
                nonVisual.createWindowContext(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, null)
            }
            val result = desktopLyricsWindowContext(nonVisual)
            assertEquals(Display.DEFAULT_DISPLAY, boundDisplay)
            assertNotNull(result.getSystemService(WindowManager::class.java))
        } finally { service.destroy() }
    }
}
