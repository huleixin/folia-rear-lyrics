package io.github.huleixin.tingyu.chrome

import org.junit.Assert.*
import org.junit.Test

// Boundary coverage prevents a wide phone or narrow split window acquiring a split player or dual pane.
class PadWindowTest {
    @Test fun keyboardResizeDoesNotReplaceTabletInput() {
        assertTrue(padLayoutWindow(1280f, 380f, 800f).expanded)
        assertTrue(padLayoutWindow(1280f, 800f, 800f).expanded)
        assertFalse(padLayoutWindow(640f, 380f, 800f).expanded)
        assertFalse(padLayoutWindow(1280f, 380f, 380f).expanded)
        assertTrue(padLayoutWindow(1280f, 380f, 800f).settingsDualPane)
        assertTrue(padLayoutWindow(1280f, 380f, 800f).homeDualHero)
    }

    @Test fun sizes() {
        assertFalse(PadWindow(393f, 852f).expanded)
        assertFalse(PadWindow(852f, 393f).splitPlayer)
        assertTrue(PadWindow(1280f, 800f).splitPlayer)
        assertFalse(PadWindow(800f, 1280f).splitPlayer)
        assertFalse(PadWindow(599f, 800f).tablet)
        assertTrue(PadWindow(600f, 900f).tablet)
        assertFalse(PadWindow(640f, 800f).expanded)
        assertEquals(5, PadWindow(1280f, 800f).columns)
    }

    @Test fun sizeClassBoundariesAndMatrix() {
        assertEquals(PadSizeClass.COMPACT, PadWindow(360f, 800f).sizeClass)
        assertEquals(PadSizeClass.COMPACT, PadWindow(393f, 852f).sizeClass)
        assertEquals(PadSizeClass.COMPACT, PadWindow(480f, 800f).sizeClass)
        assertEquals(PadSizeClass.COMPACT, PadWindow(599f, 800f).sizeClass)

        assertEquals(PadSizeClass.MEDIUM, PadWindow(600f, 960f).sizeClass)
        assertEquals(PadSizeClass.MEDIUM, PadWindow(768f, 1024f).sizeClass)
        assertEquals(PadSizeClass.MEDIUM, PadWindow(800f, 1280f).sizeClass)
        assertEquals(PadSizeClass.MEDIUM, PadWindow(839f, 800f).sizeClass)

        assertEquals(PadSizeClass.EXPANDED, PadWindow(840f, 600f).sizeClass)
        assertEquals(PadSizeClass.EXPANDED, PadWindow(960f, 600f).sizeClass)
        assertEquals(PadSizeClass.EXPANDED, PadWindow(1024f, 768f).sizeClass)
        assertEquals(PadSizeClass.EXPANDED, PadWindow(1199f, 800f).sizeClass)

        assertEquals(PadSizeClass.LARGE, PadWindow(1200f, 1600f).sizeClass)
        assertEquals(PadSizeClass.LARGE, PadWindow(1280f, 800f).sizeClass)
        assertEquals(PadSizeClass.LARGE, PadWindow(1600f, 1000f).sizeClass)
        assertEquals(PadSizeClass.LARGE, PadWindow(1920f, 1080f).sizeClass)
    }

    @Test fun adaptiveDualPaneAndColumnsAcrossMatrix() {
        val phone = PadWindow(393f, 852f)
        assertFalse(phone.homeDualHero)
        assertFalse(phone.settingsDualPane)
        assertEquals(0f, phone.rail, 0.01f)

        val compactSplit = PadWindow(480f, 800f)
        assertFalse(compactSplit.homeDualHero)
        assertFalse(compactSplit.settingsDualPane)

        val portraitSmallPad = PadWindow(600f, 960f)
        assertFalse(portraitSmallPad.homeDualHero)
        assertFalse(portraitSmallPad.settingsDualPane)
        assertEquals(0f, portraitSmallPad.rail, 0.01f)

        val portraitPad = PadWindow(800f, 1280f)
        assertFalse(portraitPad.homeDualHero)
        assertTrue(portraitPad.settingsDualPane)
        assertEquals(800f, portraitPad.contentWidth, 0.01f)

        val landscapeSmallPad = PadWindow(960f, 600f)
        assertTrue(landscapeSmallPad.expanded)
        assertTrue(landscapeSmallPad.homeDualHero)
        assertTrue(landscapeSmallPad.settingsDualPane)
        assertEquals(856f, landscapeSmallPad.contentWidth, 0.01f)

        val largePortraitPad = PadWindow(1200f, 1600f)
        assertTrue(largePortraitPad.expanded)
        assertTrue(largePortraitPad.homeDualHero)
        assertTrue(largePortraitPad.settingsDualPane)
        assertFalse(largePortraitPad.splitPlayer)

        val ultraWide = PadWindow(1920f, 1080f)
        assertEquals(6, ultraWide.adaptiveColumns(minItemWidth = 156f))
        assertTrue(PadWindow(1280f, 480f).shortWindow)
        assertFalse(PadWindow(1280f, 800f).shortWindow)
    }
}
