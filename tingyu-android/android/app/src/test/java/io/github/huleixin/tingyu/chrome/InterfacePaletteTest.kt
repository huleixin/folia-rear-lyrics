package io.github.huleixin.tingyu.chrome

import androidx.compose.ui.graphics.Color
import org.junit.Assert.*
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/InterfacePaletteTest.kt
class InterfacePaletteTest {
    @Test fun explicitModesIgnoreSystemButSystemModeTracksIt(){
        for(system in listOf(false,true)){
            assertTrue(InterfaceAppearance.resolve("light",system))
            assertFalse(InterfaceAppearance.resolve("dark",system))
            assertEquals(system,InterfaceAppearance.resolve("system",system))
        }
    }
    @Test fun originalDarkLiteralsAndTranslucencyArePreserved(){
        val palette=InterfacePalette()
        assertEquals(Color(0xFFF4F7F5),palette.ink)
        assertEquals(Color(0xFFA2B6AC),palette.muted)
        assertEquals(Color(0xFF9FE0C4),palette.accent)
        assertEquals(PlaylistBackgroundColors,palette.backgrounds)
        assertEquals(Color(0x3323493B),palette.color(Color(0x3323493B),Color.White))
    }
    @Test fun lightCoverFadeMatchesUnderlyingPageWithoutASeam(){
        val colors=InterfacePalette(true).backgrounds
        for(height in listOf(640f,852f,1280f)){
            val ambient=minOf(560f,height*.7f)
            for((position,color) in playlistAmbientCoverStops(height,ambient,colors).filter{it.first>=PlaylistAmbientFadeEnd})
                assertEquals(playlistBackgroundColor(position*ambient/height,colors),color)
        }
    }
    @Test fun stagePixelsAndGeometryAreNotModifiedByInterfacePaint(){
        val stage=ChromeSurface.parse(org.json.JSONObject("""{"id":"stage","session":"s","generation":1,"revision":1,"viewportWidth":393,"data":{"light":false}}"""))
        assertSame(stage,stage.interfacePaint(true))
    }
}
