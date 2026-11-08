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

    /**
     * 2026-11-07 23:02 真机：首页在首帧之后又发了一包，只有一个 playlistId 从空变成已知
     * （`home:qq::false` → `home:qq:2473297053:false`）。旧判定把「两个都是根路由」当 tab 切换，
     * 于是首页在 1.29s 处放了一次 8dp 横移 + 200ms 淡入 —— 玻璃底栏采到两帧叠影，
     * 用户看到的就是「打开首页底部闪一下」。身份相同的两次提交不是导航。
     */
    @Test fun resolvingAPageIdentityIsNotATransition(){
        assertEquals(NativeMotionKind.NONE,NativeMotionPolicy.kind("home:qq::false","home:qq:2473297053:false",false,false))
        assertEquals(NativeMotionKind.NONE,NativeMotionPolicy.kind("library:qq:1","library:qq:2",false,false))
        // 换音源是两个不同身份，保留原来的 tab 转场。
        assertEquals(NativeMotionKind.TAB,NativeMotionPolicy.kind("home:qq:1","home:local:2",false,false))
        // 真正的 tab 切换不受影响。
        assertEquals(NativeMotionKind.TAB,NativeMotionPolicy.kind("home:qq:1","library:qq:1",false,false))
    }

    /**
     * 2026-11-07 23:29 录屏：同一首页的两份模型（只差歌单 id）建了两个页面实例，
     * 旧实例（歌单空态）垫在下面，新实例少画一块时它就露出来 —— 底部闪一帧。
     * 页面实例必须按路由归并；设置子页与歌单详情仍各自成路由。
     */
    @Test fun aPageInstanceBelongsToItsRouteNotItsDataKey(){
        assertEquals("home",NativeMotionPolicy.pageRouteKey("home:qq::false"))
        assertEquals("home",NativeMotionPolicy.pageRouteKey("home:qq:2473297053:false"))
        assertEquals("library",NativeMotionPolicy.pageRouteKey("library:qq:1"))
        assertEquals("search",NativeMotionPolicy.pageRouteKey("search:qq"))
        assertEquals("settings:document:general",NativeMotionPolicy.pageRouteKey("settings:document:general"))
        assertEquals("collection:playlist:123",NativeMotionPolicy.pageRouteKey("collection:playlist:123"))
    }
}
