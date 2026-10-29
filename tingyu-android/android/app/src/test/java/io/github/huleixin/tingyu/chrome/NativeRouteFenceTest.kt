package io.github.huleixin.tingyu.chrome

import org.junit.Assert.*
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/NativeRouteFenceTest.kt
class NativeRouteFenceTest {
    @Test fun delayedStageFrameCannotReopenAfterBackOrAnotherNavigation(){
        val fence=NativeRouteFence()
        val stage=fence.request(5,2)!!;assertTrue(fence.current(stage))
        val back=fence.request(5,3)!!;assertFalse(fence.current(stage));assertTrue(fence.current(back))
        assertNull(fence.request(5,1));assertTrue(fence.current(back))
        val reopen=fence.request(5,4)!!;assertFalse(fence.current(back));assertTrue(fence.current(reopen))
        val newBridge=fence.request(6,1)!!;assertFalse(fence.current(reopen));assertNull(fence.request(5,100))
        fence.close();assertFalse(fence.current(newBridge));assertNull(fence.request(7,1))
    }
    @Test fun nativeRoutesCannotExposeAnOldWebViewFrameThroughTheirFade(){
        for(route in listOf("home","collection","search")){
            assertFalse(webOwnsRoutePixels(route,false,false))
            assertTrue(webOwnsRoutePixels(route,true,false))
            assertTrue(webOwnsRoutePixels(route,false,true))
        }
        for(route in listOf("stage","web","settings"))assertTrue(webOwnsRoutePixels(route,false,false))
    }
    @Test fun everyStagePathUsesTheStageMotionRatherThanHorizontalDepth(){
        for(route in listOf("home:qq","library:qq","collection:playlist:abc","search:query","settings:document:appearance")){
            assertEquals(NativeMotionKind.STAGE,NativeMotionPolicy.kind(route,"stage",false,false))
            assertEquals(NativeMotionKind.STAGE,NativeMotionPolicy.kind("stage",route,true,false))
        }
        assertEquals(NativeMotionKind.NONE,NativeMotionPolicy.kind("stage","home:qq",true,true))
    }
}
