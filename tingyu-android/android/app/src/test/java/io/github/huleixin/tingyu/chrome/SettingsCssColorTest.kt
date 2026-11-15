package io.github.huleixin.tingyu.chrome

import android.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/SettingsCssColorTest.kt
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.LEGACY)
class SettingsCssColorTest {
    @Test fun cssAlphaStaysInAlphaChannel() {
        assertEquals(Color.argb(0x18, 0x44, 0x40, 0x3c), settingColor("#44403c18"))
        assertEquals(Color.argb(0x88, 0x11, 0x22, 0x33), settingColor("#1238"))
        assertEquals(Color.argb(0, 0xab, 0xcd, 0xef), settingColor("#abcdef00"))
    }
    @Test fun opaqueRgbAndInvalidValuesKeepTheirBehavior() {
        assertEquals(Color.rgb(0x11, 0x22, 0x33), settingColor("#123"))
        assertEquals(Color.rgb(0x44, 0x40, 0x3c), settingColor("#44403c"))
        assertEquals(Color.argb(127, 68, 64, 60), settingColor("rgba(68, 64, 60, 0.5)"))
        assertEquals(Color.MAGENTA, settingColor("invalid", Color.MAGENTA))
    }
}
