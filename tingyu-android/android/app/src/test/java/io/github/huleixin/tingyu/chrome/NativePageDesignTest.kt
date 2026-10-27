package io.github.huleixin.tingyu.chrome

import org.junit.Assert.*
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/NativePageDesignTest.kt
class NativePageDesignTest {
    @Test fun phoneHomeKeepsTheOriginalPeekingHeroAndThreeSquareCovers() {
        for(viewport in listOf(320f,393f,412f)){
            val hero=NativePageDesign.heroWidth(viewport,false,false)
            assertEquals(viewport*.73f,hero,.001f)
            assertTrue(hero+22+11<viewport)
            assertEquals(hero*6/7,NativePageDesign.heroHeight(hero,false),.001f)
            val cover=NativePageDesign.recentWidth(viewport,false)
            assertTrue(cover*3+24<=viewport-44)
            assertTrue(cover*4+36>viewport-44)
        }
    }
    @Test fun directoryAndFormsRetainTheCompactOriginalMetrics() {
        assertEquals(68,NativePageDesign.DirectoryRow)
        assertEquals(56,NativePageDesign.DirectoryArt)
        assertEquals(12,NativePageDesign.DirectoryRow-NativePageDesign.DirectoryArt)
        assertEquals(40,NativePageDesign.LibraryFilter)
        assertEquals(46,NativePageDesign.SearchField)
        assertEquals(13,NativePageDesign.SettingsRowTitle)
        assertEquals(13,NativePageDesign.SettingsGroupTitle)
    }
    @Test fun landscapeDoesNotStretchThePosterIntoAnOversizedSquare() {
        assertEquals(440f,NativePageDesign.heroWidth(1024f,true,true),.001f)
        assertEquals(240f,NativePageDesign.heroHeight(440f,true),.001f)
        assertEquals(150f,NativePageDesign.recentWidth(1024f,true),.001f)
    }
}
