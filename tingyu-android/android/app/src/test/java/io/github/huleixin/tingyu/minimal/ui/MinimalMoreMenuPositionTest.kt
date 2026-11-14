package io.github.huleixin.tingyu.minimal.ui

import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.unit.IntSize
import org.junit.Assert.*
import org.junit.Test

// MinimalMoreMenuPositionTest.kt: window pixels and live button bounds, independent of device density.
class MinimalMoreMenuPositionTest{
    @Test fun menuTracksButtonInsteadOfWindowRight(){
        val p=minimalMoreMenuPosition(Rect(460f,770f,508f,818f),IntSize(210,250),IntSize(1280,854),24,24,12,8)
        assertEquals(298,p.x);assertEquals(512,p.y)
        val moved=minimalMoreMenuPosition(Rect(560f,670f,608f,718f),IntSize(210,250),IntSize(1280,854),24,24,12,8)
        assertEquals(p.x+100,moved.x);assertEquals(p.y-100,moved.y)
    }
    @Test fun topAndEdgesClampOnResizedWindow(){
        val viewport=IntSize(640,400);val panel=IntSize(210,250)
        val p=minimalMoreMenuPosition(Rect(610f,30f,658f,78f),panel,viewport,32,24,12,8)
        assertTrue(p.x>=12);assertTrue(p.x+panel.width<=628)
        assertTrue(p.y>=44);assertTrue(p.y+panel.height<=364)
    }
}
