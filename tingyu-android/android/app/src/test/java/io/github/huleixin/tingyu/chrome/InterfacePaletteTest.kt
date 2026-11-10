package io.github.huleixin.tingyu.chrome

import androidx.compose.ui.graphics.Color
import org.junit.Assert.*
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/InterfacePaletteTest.kt
class InterfacePaletteTest {
    @Test fun glacierKeepsOpticsAndStageWhileReplacingOrdinaryHue(){
        for(light in listOf(false,true)){
            val p=InterfacePalette(light,"glacier")
            assertEquals(if(light)Color(0xFFE3ECF5)else Color(0xFF101A28),p.launch)
            assertEquals(if(light)Color(0xFF172A38)else Color(0xFFE8F1F9),p.ink)
            val stage=ChromeSurface.parse(org.json.JSONObject("""{"id":"stage","session":"s","generation":1,"revision":1,"viewportWidth":393,"data":{"light":false}}"""))
            assertSame(stage,stage.interfacePaint(p))
            for(spec in ChromeGlassPresets.all){
                val updated=spec.interfaceMaterial("glacier")
                assertEquals(spec.lightSurface.alpha,updated.lightSurface.alpha)
                assertEquals(spec.darkSurface.alpha,updated.darkSurface.alpha)
                assertEquals(spec,updated.copy(lightSurface=spec.lightSurface,darkSurface=spec.darkSurface))
            }
        }
        assertEquals(InterfacePalette(false).ink,InterfacePalette(false,"invalid").ink)
    }

    @Test fun classicPreservesCustomOpticalSurfacesAndAlpha(){
        for(spec in ChromeGlassPresets.all) assertSame(spec,spec.interfaceMaterial("classic"))
        val custom=ChromeGlassPresets.Default.copy(lightSurface=Color(0x73445667),darkSurface=Color(0x91223344))
        assertSame(custom,custom.interfaceMaterial("classic"))
        assertSame(custom,custom.interfaceMaterial("unknown"))
        assertEquals(Color.White.copy(alpha=.055f),InterfacePalette(false).panelCard)
    }
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
        assertEquals(Color(0x3323493B),palette.card)
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
        assertSame(stage,stage.interfacePaint(InterfacePalette(true)))
    }
}
