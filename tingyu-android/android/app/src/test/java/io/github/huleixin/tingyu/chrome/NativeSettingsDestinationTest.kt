package io.github.huleixin.tingyu.chrome

import org.junit.Assert.*
import org.junit.Test

// NativeSettingsDestinationTest.kt: native children use ordinary PUSH/POP despite the retained parent's last Back.
class NativeSettingsDestinationTest{
    @Test fun fourPagesUseStableSettingsRoutesAndOrdinaryMotion(){
        for(kind in listOf("desktop","bluetooth","coffee","group")){
            val route=NativeSettingsDestination(kind).key
            assertEquals(kind,NativeSettingsDestination.fromKey(route))
            val enterBack=NativeSettingsDestination.returning("settings:index",route,true)
            assertFalse(enterBack)
            assertEquals(NativeMotionKind.PUSH,NativeMotionPolicy.kind("settings:index",route,enterBack,false))
            val exitBack=NativeSettingsDestination.returning(route,"settings:index",false)
            assertTrue(exitBack)
            assertEquals(NativeMotionKind.POP,NativeMotionPolicy.kind(route,"settings:index",exitBack,false))
            assertEquals(NativeMotionKind.NONE,NativeMotionPolicy.kind(route,"settings:index",exitBack,true))
        }
        assertNull(NativeSettingsDestination.fromKey("settings:document:appearance"))
        assertNull(NativeSettingsDestination.fromKey("settings:native:unregistered"))
    }
}
