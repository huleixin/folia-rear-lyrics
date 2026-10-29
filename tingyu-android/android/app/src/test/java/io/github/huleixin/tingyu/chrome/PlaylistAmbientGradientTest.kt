package io.github.huleixin.tingyu.chrome

import androidx.compose.ui.graphics.Color
import org.junit.Assert.*
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/PlaylistAmbientGradientTest.kt
class PlaylistAmbientGradientTest {
    @Test fun pageColorsStayIdenticalAtTheirOriginalViewportStops() {
        assertEquals(Color(0xFF03221A),playlistBackgroundColor(0f))
        assertEquals(Color(0xFF03130E),playlistBackgroundColor(.5f))
        assertEquals(Color(0xFF031812),playlistBackgroundColor(1f))
    }
    @Test fun coverIsAlreadyInvisibleBeforeItsClippingBoundaryAndBothSlopesAreSoft() {
        assertEquals(1f,playlistAmbientVisibility(PlaylistAmbientFadeStart),0f)
        assertEquals(0f,playlistAmbientVisibility(PlaylistAmbientFadeEnd),0f)
        assertEquals(0f,playlistAmbientVisibility(1f),0f)
        assertTrue(1-playlistAmbientVisibility(PlaylistAmbientFadeStart+.0001f)<.000001f)
        assertTrue(playlistAmbientVisibility(PlaylistAmbientFadeEnd-.0001f)<.000001f)
    }
    @Test fun fadeIsMonotonicAndNeverAddsANewBrightOrTransparentBand() {
        var previous=1f
        for(index in 0..1000) {
            val current=playlistAmbientVisibility(index/1000f)
            assertTrue(current in 0f..1f);assertTrue(current<=previous+.000001f);previous=current
        }
    }
    @Test fun finalOpaqueBandMatchesTheViewportBackgroundOnEveryScreenHeight() {
        for(height in listOf(360f,640f,852f,1280f)) {
            val ambient=minOf(560f,height*.7f)
            val stops=playlistAmbientCoverStops(height,ambient)
            assertEquals(0f,stops.first().first,0f);assertEquals(1f,stops.last().first,0f)
            assertEquals(0f,stops.first().second.alpha,0f)
            assertTrue(stops.size<=36)
            for((position,color) in stops.filter{it.first>=PlaylistAmbientFadeEnd}) {
                assertEquals(1f,color.alpha,0f)
                assertEquals(playlistBackgroundColor(position*ambient/height),color)
            }
        }
    }
    @Test fun theOpaqueTailKeepsTheUnderlyingGradientInsteadOfPaintingAFlatBlackRectangle() {
        val stops=playlistAmbientCoverStops(1000f,560f)
        val tail=stops.filter{it.first>=PlaylistAmbientFadeEnd}
        assertNotEquals(tail.first().second,tail.last().second)
        assertTrue(stops.any{ kotlin.math.abs(it.first-500f/560f)<.00001f })
    }
    @Test fun invalidLayoutBoundsCannotGenerateNonFiniteShaderStops() {
        for((viewport,ambient) in listOf(0f to 100f,Float.POSITIVE_INFINITY to 100f,100f to Float.NaN)) {
            try { playlistAmbientCoverStops(viewport,ambient);fail("Expected rejected bounds") }
            catch(expected:IllegalArgumentException) { /* Invalid constraints must not reach the shader. */ }
        }
    }
}
