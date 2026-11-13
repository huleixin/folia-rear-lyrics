package io.github.huleixin.tingyu.chrome

import org.junit.Assert.*
import org.junit.Test

// Boundary coverage prevents a wide phone or narrow split window acquiring a split player.
class PadWindowTest {
    @Test fun sizes() {
        assertFalse(PadWindow(393f,852f).expanded)
        assertFalse(PadWindow(852f,393f).splitPlayer)
        assertTrue(PadWindow(1280f,800f).splitPlayer)
        assertFalse(PadWindow(800f,1280f).splitPlayer)
        assertFalse(PadWindow(599f,800f).tablet)
        assertTrue(PadWindow(600f,900f).tablet)
        assertFalse(PadWindow(640f,800f).expanded)
        assertEquals(5,PadWindow(1280f,800f).columns)
    }
}
