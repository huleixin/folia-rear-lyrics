package io.github.huleixin.tingyu.chrome

import org.junit.Assert.*
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/NativeFooterLayoutTest.kt
class NativeFooterLayoutTest {
    @Test fun returningWithoutChangingSongRestoresTheHomeNavigationAndMiniPosition(){
        val home=NativeFooterLayout.rect("mini",393f,852f,30f,22f,false)
        val detail=NativeFooterLayout.rect("mini",393f,852f,30f,22f,true)
        assertEquals(60f,detail.top-home.top,0f)
        assertFalse(NativeFooterLayout.visible("nav","collection",true,393f))
        assertTrue(NativeFooterLayout.visible("nav","home",false,393f))
        assertFalse(NativeFooterLayout.visible("mini","stage",false,393f))
        assertEquals(home,NativeFooterLayout.rect("mini",393f,852f,30f,22f,false))
        assertEquals(22f+8f,852f-detail.top-detail.height,0f)
    }
    @Test fun tabletPlaylistKeepsItsNavigationRail(){
        assertTrue(NativeFooterLayout.visible("nav","collection",true,1000f))
        assertEquals(80f,NativeFooterLayout.rect("nav",1000f,700f,30f,22f,true).width,0f)
    }
    @Test fun stageAndItsSettingsUseOneFadeWithoutChangingApprovedTabMotion(){
        assertEquals(NativeMotionKind.STAGE,NativeMotionPolicy.kind("settings:document:visualizer","stage",true,false))
        assertEquals(NativeMotionKind.STAGE,NativeMotionPolicy.kind("stage","settings:document:playback",false,false))
        assertEquals(NativeMotionKind.TAB,NativeMotionPolicy.kind("home:one","library:two",false,false))
    }
    @Test fun repeatedStageBackFinishesOneAnimationThenResolvesAllCallers(){
        val exit=NativeStageExit();var calls=0
        exit.begin(null){calls++};exit.begin(null){calls++};assertEquals(0,calls);assertTrue(exit.active)
        exit.finish();assertEquals(2,calls);exit.begin(null){calls++};assertEquals(3,calls)
        exit.clear();assertFalse(exit.active)
        exit.begin(null){calls++};assertTrue(exit.active);exit.finish();assertEquals(4,calls)
    }
}
