package io.github.huleixin.tingyu.lyrics

import android.content.Context
import android.hardware.display.DisplayManager
import android.os.Build
import android.view.Display
import android.view.WindowManager

// A playback Service has no display association. Always target the front/default screen explicitly.
internal fun desktopLyricsWindowContext(context: Context): Context {
    val display = requireNotNull(context.getSystemService(DisplayManager::class.java)
        ?.getDisplay(Display.DEFAULT_DISPLAY)) { "Default display unavailable" }
    val displayContext = context.createDisplayContext(display)
    return if (Build.VERSION.SDK_INT >= 30)
        displayContext.createWindowContext(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, null)
    else displayContext
}
