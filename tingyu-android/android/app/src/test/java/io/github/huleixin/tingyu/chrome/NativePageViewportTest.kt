package io.github.huleixin.tingyu.chrome

import org.junit.Assert.assertEquals
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/NativePageViewportTest.kt
// Use actual footer rectangles, including fractional display/CSS scales and IME-sized roots.
class NativePageViewportTest {
    @Test fun searchClearsBothFloatingBarsAndSettingsOnlyClearsNavigation() {
        for (density in listOf(1f, 2.75f, 3.25f)) {
            val height = 852f * density
            val nav = chromeFooterRect("nav",393f,852f,30f,22f,density).top * density
            val mini = chromeFooterRect("mini",393f,852f,30f,22f,density).top * density
            assertEquals(148f*density, nativePageBottomClearance(0f,height,listOf(nav,mini),12f*density), .001f)
            assertEquals(96f*density, nativePageBottomClearance(0f,height,listOf(nav),12f*density), .001f)
        }
    }
    @Test fun hiddenOrOffscreenChromeDoesNotReserveKeyboardSpaceTwice() {
        assertEquals(0f,nativePageBottomClearance(0f,500f,emptyList(),12f),0f)
        assertEquals(0f,nativePageBottomClearance(0f,500f,listOf(716f,768f),12f),0f)
    }
    @Test fun nativeFullPageImmediatelyFollowsImeResizeAndRestoreDespiteOldDomPacket() {
        assertEquals(500f,nativePageHeightPx("search",false,852f,0f,500f),0f)
        assertEquals(852f,nativePageHeightPx("search",false,500f,0f,852f),0f)
        assertEquals(852f,nativePageHeightPx("settings",false,500f,0f,852f),0f)
        assertEquals(480f,nativePageHeightPx("settings",true,700f,20f,500f),0f)
    }
}
