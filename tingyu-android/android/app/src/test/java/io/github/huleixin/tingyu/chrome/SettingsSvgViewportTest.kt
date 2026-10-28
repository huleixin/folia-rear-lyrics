package io.github.huleixin.tingyu.chrome

import org.junit.Assert.*
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/SettingsSvgViewportTest.kt
class SettingsSvgViewportTest {
    @Test fun deviceIllustrationsFitTheirMeasuredCardInsteadOfUsingIconCoordinates(){
        val svg=SettingsSvgViewport.parse("0 0 160 100",24f,24f,"")
        for(width in listOf(90f,128f,160f,220f)){
            val fit=svg.placement(width,width*100/160)
            assertEquals(width/160,fit[0],.001f)
            assertEquals(width,160*fit[0]+fit[2],.001f)
            assertEquals(width*100/160,100*fit[1]+fit[3],.001f)
        }
    }
    @Test fun nonSquareViewportLetterboxesAndHonoursNonzeroOrigins(){
        val fit=SettingsSvgViewport.parse("10 -20 160 100",24f,24f,"xMidYMid meet").placement(160f,160f)
        assertArrayEquals(floatArrayOf(1f,1f,-10f,50f),fit,.001f)
        val stretch=SettingsSvgViewport.parse("0 0 160 100",24f,24f,"none").placement(160f,160f)
        assertArrayEquals(floatArrayOf(1f,1.6f,0f,0f),stretch,.001f)
    }
    @Test fun lucideIconsStillUseTheirOwn24PixelViewport(){
        val fit=SettingsSvgViewport.parse("0 0 24 24",24f,24f,"").placement(18f,18f)
        assertArrayEquals(floatArrayOf(.75f,.75f,0f,0f),fit,.001f)
    }
    @Test fun invalidGeometryAndScientificSvgNumbersAreHandled(){
        val invalid=SettingsSvgViewport.parse("0 0 -1 0",160f,100f,"").placement(80f,50f)
        assertTrue(invalid.all{it.isFinite()})
        assertEquals(listOf(1e-3f,-2.5f,3f),svgNumbers("1e-3,-2.5 3"))
    }
}
