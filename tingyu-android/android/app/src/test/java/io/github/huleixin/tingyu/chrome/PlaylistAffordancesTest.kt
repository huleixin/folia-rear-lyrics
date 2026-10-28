package io.github.huleixin.tingyu.chrome

import org.junit.Assert.*
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/PlaylistAffordancesTest.kt
class PlaylistAffordancesTest {
    @Test fun numbersFitThreeAndFourDigitsAtLargeFontScale() {
        for(scale in listOf(1f,1.3f,2f)) for(digits in 2..4) {
            assertTrue(playlistNumberWidth(digits,scale)>digits*6.8f*scale)
        }
        assertTrue(playlistNumberWidth(3,1f)>playlistNumberWidth(2,1f))
    }
    @Test fun barsMoveWithinTheirBoundsAndRepeatWithoutJump() {
        for(bar in 0..2) {
            val values=(0..100).map { playlistBarHeight(it/100f,bar) }
            assertTrue(values.all {it in .239f.. .881f})
            assertTrue(values.max()-values.min()>.6f)
            assertEquals(values.first(),values.last(),.0001f)
        }
    }
}
