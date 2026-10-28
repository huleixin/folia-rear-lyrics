package io.github.huleixin.tingyu.chrome

import org.junit.Assert.*
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/NativeStartupMotionTest.kt
class NativeStartupMotionTest {
    @Test fun delayedWebInsetsCannotSinkEitherFooterDuringStartup(){
        val height=852f;val bottom=22f
        for(distance in listOf(62f,114f)){
            val boot=height-distance-bottom
            for(reported in listOf(0f,8f,22f))assertEquals(boot,chromeSafeTop(height-distance-reported,bottom,reported),.001f)
        }
    }
    @Test fun landscapeAndZeroInsetsDoNotInventAnExtraBottomGap(){
        assertEquals(460f,chromeSafeTop(460f,0f,0f),.001f)
        assertEquals(460f,chromeSafeTop(460f,0f,20f),.001f)
    }
    @Test fun tabSwitchesNeverFlyInFromASideRegardlessOfHistory(){
        for(back in listOf(false,true))for(target in listOf("library:qq","home:qq","search:qq","settings:index"))
            assertEquals(NativeMotionKind.TAB,NativeMotionPolicy.kind("home:local",target,back,false))
    }
    @Test fun navigationUsesOneAxisAndReversesOnlyOnBack(){
        assertEquals(NativeMotionKind.PUSH,NativeMotionPolicy.kind("settings:index","settings:document:general",false,false))
        assertEquals(NativeMotionKind.POP,NativeMotionPolicy.kind("settings:document:general","settings:index",true,false))
        assertEquals(NativeMotionKind.STAGE,NativeMotionPolicy.kind("home:qq","stage",false,false))
        assertEquals(NativeMotionKind.STAGE,NativeMotionPolicy.kind("stage","home:qq",true,false))
        assertEquals(NativeMotionKind.NONE,NativeMotionPolicy.kind("","home:qq",false,false))
        assertEquals(NativeMotionKind.NONE,NativeMotionPolicy.kind("stage","settings:document:playback",false,true))
    }
}
