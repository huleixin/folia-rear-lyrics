package io.github.huleixin.tingyu.chrome

import org.junit.Assert.*
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/NativeFooterLayoutTest.kt
class NativeFooterLayoutTest {
    @Test fun playlistFooterSurvivesStageAndSettingsShellsUntilBrowsingResumes(){
        val source=NativeFooterRoute().follow("collection",true,"collection:playlist:123")
        val stage=source.follow("stage",false,"stage")
        val settings=stage.follow("settings",false,"settings:document:options:playback:")
        val returned=settings.follow("stage",false,"stage")
        assertEquals(source,returned)
        for(width in listOf(393f,1000f)){
            assertEquals(width>=840f,NativeFooterLayout.targetVisible("nav","stage",returned.route,
                stageExiting=true,detail=returned.detail,width=width,artist=returned.artist))
            assertTrue(NativeFooterLayout.targetVisible("mini","stage",returned.route,
                stageExiting=true,detail=returned.detail,width=width,artist=returned.artist))
            assertEquals(NativeFooterLayout.rect("mini",width,852f,30f,22f,true),
                NativeFooterLayout.rect("mini",width,852f,30f,22f,returned.detail))
        }
        assertEquals(NativeFooterRoute(),returned.follow("home",false,"home:recommend"))
        val artist=returned.follow("collection",false,"collection:artist:456").follow("stage",false,"stage")
        assertFalse(NativeFooterLayout.targetVisible("mini","stage",artist.route,
            stageExiting=true,detail=artist.detail,artist=artist.artist))
    }

    @Test fun openingPlayerSettingsNeverRevealsTheHiddenMiniDuringItsExit(){
        for(presence in listOf(1f,.75f,.5f,.01f,0f)){
            assertEquals(0f,NativeFooterLayout.miniPresenceAlpha("settings",presence,true),0f)
            assertEquals(presence,NativeFooterLayout.miniPresenceAlpha("settings",presence,false),0f)
            assertEquals(presence,NativeFooterLayout.miniPresenceAlpha("collection",presence,true),0f)
        }
    }

    @Test fun artistDetailHidesBothNativeFootersAndHomeRestoresThem(){
        for(width in listOf(393f,1000f))for(id in listOf("mini","nav")){
            assertFalse(NativeFooterLayout.visible(id,"collection",false,width,artist=true))
            assertTrue(NativeFooterLayout.visible(id,"home",false,width,artist=true))
        }
        assertTrue(NativeFooterLayout.visible("mini","collection",false,393f))
    }

    /**
     * 一级页面底部行为统一（2026-11-09）。
     *
     * 推荐 / 资料库 / 搜索 → 导航 + 迷你条；设置主页 → 只有导航；歌单详情 → 只有迷你条；
     * 舞台 / web / 设置二级页（settingsRoot=false）→ 都没有。
     * 设置页层级由壳层状态显式下发，NativeFooterLayout 再用 pageTarget 做根页校验。
     */
    @Test fun oneLevelPagesFollowTheSameFooterMatrix(){
        val w=393f
        for(route in listOf("home","collection","search")){
            assertTrue("$route nav",NativeFooterLayout.visible("nav",route,false,w))
            assertTrue("$route mini",NativeFooterLayout.visible("mini",route,false,w))
        }
        // 设置主页：导航保留，迷你条退出。
        assertTrue(NativeFooterLayout.visible("nav","settings",false,w))
        assertFalse(NativeFooterLayout.visible("mini","settings",false,w))
        assertFalse(NativeFooterLayout.visible("nav","settings",false,w,settingsRoot=false))
        // 歌单详情（手机）：导航收起、迷你条上提保留；宽屏保留侧边导航。
        assertFalse(NativeFooterLayout.visible("nav","collection",true,393f))
        assertTrue(NativeFooterLayout.visible("mini","collection",true,393f))
        assertTrue(NativeFooterLayout.visible("nav","collection",true,1000f))
        // 舞台 / 网页：一级导航和迷你条都不显示。
        for(route in listOf("stage","web")){
            assertFalse("$route nav",NativeFooterLayout.visible("nav",route,false,w))
            assertFalse("$route mini",NativeFooterLayout.visible("mini",route,false,w))
        }
        // 舞台控制条只在舞台。
        assertTrue(NativeFooterLayout.visible("stage","stage",false,w))
        assertFalse(NativeFooterLayout.visible("stage","search",false,w))
    }
    @Test fun settingsNavigationOnlyBelongsToTheOptionsIndex(){
        assertTrue(NativeFooterLayout.settingsRoot("settings","settings:index",true))
        assertFalse(NativeFooterLayout.settingsRoot("settings","settings:index",false))
        assertFalse(NativeFooterLayout.settingsRoot("settings","settings:rear:control",true))
        assertFalse(NativeFooterLayout.settingsRoot("settings","settings:document:help:about",true))
        assertFalse(NativeFooterLayout.settingsRoot("home","settings:index",true))
        assertFalse(NativeFooterLayout.visible("nav","settings",false,393f,settingsRoot=false))
        assertFalse(NativeFooterLayout.visible("mini","settings",false,393f,settingsRoot=false))
        assertEquals(220,NativeFooterLayout.SettingsDepthExitMs)
        assertEquals(14f,NativeFooterLayout.SettingsDepthOffsetDp,0f)
    }
    @Test fun stageGeometryIsIndependentOfHiddenHtmlAnimationPoses(){
        val stage=NativeFooterLayout.rect("stage",393f,852f,30f,22f,false)
        // 紧凑一体胶囊：96dp 高（原 136dp），左右 10dp 与迷你播放器同一条安全边距。
        assertEquals(96f,stage.height,0f);assertEquals(32f,852f-stage.top-stage.height,0f)
        assertEquals(10f,stage.left,0f)
        assertEquals(393f-20f,stage.width,0f)
        assertEquals(stage,NativeFooterLayout.rect("stage",393f,852f,30f,22f,true))
    }
    @Test fun landscapeStageControlsStayCenteredAndClearOfTheBottomInset(){
        for(width in listOf(780f,844f,1024f)){
            val stage=NativeFooterLayout.rect("stage",width,390f,24f,22f,false)
            assertEquals(430f,stage.width,0f)
            assertEquals(width/2f,stage.left+stage.width/2f,0f)
            assertEquals(96f,stage.height,0f)
            assertEquals(32f,390f-stage.top-stage.height,0f)
            assertTrue(stage.top>24f+48f)
        }
    }
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
    @Test fun targetVisibleCoordinatesFooterPresenceDuringStageEnterCollapseAndDetailRoutes(){
        // Entering stage from home hides nav immediately while keeping mini bound to the returning route.
        assertFalse(NativeFooterLayout.targetVisible("nav","home","home",pendingStageEntry=true))
        assertFalse(NativeFooterLayout.targetVisible("nav","stage","home",stageExiting=false))
        assertTrue(NativeFooterLayout.targetVisible("mini","stage","home",stageExiting=false))
        // Collapsing stage back to home restores nav during the exit animation; collapsing to playlist keeps nav hidden.
        assertTrue(NativeFooterLayout.targetVisible("nav","stage","home",stageExiting=true))
        assertFalse(NativeFooterLayout.targetVisible("nav","stage","collection",stageExiting=true,detail=true,width=393f))
        assertTrue(NativeFooterLayout.targetVisible("mini","stage","collection",stageExiting=true,detail=true,width=393f))
        // Artist and settings subview hide target visibility cleanly.
        assertFalse(NativeFooterLayout.targetVisible("nav","collection","collection",artist=true))
        assertFalse(NativeFooterLayout.targetVisible("mini","collection","collection",artist=true))
        assertFalse(NativeFooterLayout.targetVisible("nav","settings","settings",settingsRoot=false))
        assertFalse(NativeFooterLayout.targetVisible("mini","settings","settings",settingsRoot=true))
    }
}
