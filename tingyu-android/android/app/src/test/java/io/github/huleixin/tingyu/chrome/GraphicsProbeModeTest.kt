package io.github.huleixin.tingyu.chrome

import org.junit.Assert.*
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/GraphicsProbeModeTest.kt
class GraphicsProbeModeTest {
    @Test fun experimentsMustReturnToBaselineBeforeChangingAnotherVariable(){
        for(mode in GraphicsProbeMode.entries){
            assertTrue(GraphicsProbeMode.allowed(GraphicsProbeMode.A,mode))
            assertTrue(GraphicsProbeMode.allowed(mode,GraphicsProbeMode.A))
            assertTrue(GraphicsProbeMode.allowed(mode,mode))
        }
        assertFalse(GraphicsProbeMode.allowed(GraphicsProbeMode.B,GraphicsProbeMode.C31))
        assertFalse(GraphicsProbeMode.allowed(GraphicsProbeMode.C31,GraphicsProbeMode.C_HW))
        assertEquals(GraphicsProbeMode.A,GraphicsProbeMode.parse("unsupported"))
    }
}
