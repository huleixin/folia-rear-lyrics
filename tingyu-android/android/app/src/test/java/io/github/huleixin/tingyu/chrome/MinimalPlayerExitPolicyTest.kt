package io.github.huleixin.tingyu.chrome

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/MinimalPlayerExitPolicyTest.kt
//
// 钉住"播放页离开 stage 时怎么收场"的决策（对应真机 1.08~1.40s 的多重叠影）。
// 这里验的是**决策**：什么路由该举着、什么时候可以直接摘、什么时候还得演普通退场。
// 真实观感要在真机上看，单测保证不会又改回"一边淡出、一边把下面那份透出来"。

class MinimalPlayerExitPolicyTest {

    @Test
    fun finishedCollapseDoesNotReenterOrWaitForThePlaylistToCoverIt() {
        for (to in listOf("collection", "home", "search")) {
            assertFalse(MinimalPlayerExitPolicy.holdForCover("stage", to, "minimal", true, collapsed = true))
            assertEquals(MinimalPlayerExitPolicy.Exit.NONE, MinimalPlayerExitPolicy.exit(to, false, collapsed = true))
        }
    }

    @Test
    fun leavingThePlayerForACollectionPageHandsTheScreenToThePage() {
        assertTrue(
            "去歌手/专辑页时播放页必须原地保持，等页面压上来盖住",
            MinimalPlayerExitPolicy.holdForCover("stage", "collection", "minimal", true),
        )
    }

    @Test
    fun otherDestinationsKeepTheirExistingMotion() {
        listOf("home", "search", "settings", "web").forEach { to ->
            assertFalse(
                "去 $to 时不该举着播放页：那几条路由底下要露出来的就是目标页本身",
                MinimalPlayerExitPolicy.holdForCover("stage", to, "minimal", true),
            )
        }
        assertFalse(
            "从别的页面进集合页不涉及播放页退场",
            MinimalPlayerExitPolicy.holdForCover("home", "collection", "minimal", true),
        )
    }

    @Test
    fun classicStageAndDisabledFlagNeverHold() {
        assertFalse(
            "经典 WebView 舞台没有 Compose 播放页可举",
            MinimalPlayerExitPolicy.holdForCover("stage", "collection", "stage", true),
        )
        assertFalse(
            "开关关掉时极简页由 WebView 自己画",
            MinimalPlayerExitPolicy.holdForCover("stage", "collection", "minimal", false),
        )
    }

    @Test
    fun collectionExitIsSilentOnlyOnceThePageIsOnScreen() {
        assertEquals(
            "页面已经在组合里：直接在它底下消失，不再演退场",
            MinimalPlayerExitPolicy.Exit.NONE,
            MinimalPlayerExitPolicy.exit("collection", covered = true),
        )
        assertEquals(
            "页面还没到：必须照常退场，否则会露出下面还没换掉的内容",
            MinimalPlayerExitPolicy.Exit.SLIDE_AND_FADE,
            MinimalPlayerExitPolicy.exit("collection", covered = false),
        )
    }

    @Test
    fun settingsAndHomeAreUnchanged() {
        assertEquals(
            MinimalPlayerExitPolicy.Exit.NONE,
            MinimalPlayerExitPolicy.exit("settings", covered = false),
        )
        assertEquals(
            MinimalPlayerExitPolicy.Exit.SLIDE_AND_FADE,
            MinimalPlayerExitPolicy.exit("home", covered = false),
        )
        assertEquals(
            MinimalPlayerExitPolicy.Exit.SLIDE_AND_FADE,
            MinimalPlayerExitPolicy.exit("search", covered = false),
        )
    }

    @Test
    fun holdNeverOutstaysAHumanSenseOfImmediacy() {
        assertTrue(
            "压上来之后要尽快摘掉，否则会一直占着一个全屏图层",
            MinimalPlayerExitPolicy.COVER_SETTLE_MS in 200..400,
        )
        assertTrue(
            "页面迟迟不来必须放手，不能把播放页当永久遮罩",
            MinimalPlayerExitPolicy.HOLD_TIMEOUT_MS in 600..2_000,
        )
        assertTrue(
            "超时必须晚于等页面的时间",
            MinimalPlayerExitPolicy.HOLD_TIMEOUT_MS > MinimalPlayerExitPolicy.COVER_SETTLE_MS,
        )
    }
}
