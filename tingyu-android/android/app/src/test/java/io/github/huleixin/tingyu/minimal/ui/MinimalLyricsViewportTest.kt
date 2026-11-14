package io.github.huleixin.tingyu.minimal.ui

import androidx.activity.ComponentActivity
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import io.github.huleixin.tingyu.minimal.*
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

// android/app/src/test/java/io/github/huleixin/tingyu/minimal/ui/MinimalLyricsViewportTest.kt
// Long songs must not lay out every row when entering or swiping the player.
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w393dp-h852dp-420dpi")
class MinimalLyricsViewportTest {
    @get:Rule val compose=createAndroidComposeRule<ComponentActivity>()
    private val state=MinimalPlayerState(
        playback=MinimalPlayback(track=MinimalTrack(key="long",title="Long song"),anchorPositionMs=100_000,source=MinimalClockSource.ENGINE),
        lyrics=MinimalLyrics(status=MinimalLyricsStatus.READY,lines=List(600){i->MinimalLyricLine(startSec=i*2.0,endSec=i*2.0+2,text="Lyric row $i")}),
    )
    private val commands=BridgeMinimalCommands(MinimalCommandSender{_,_->true}){true}

    @Test fun phoneAndPortraitKeepHeaderWhileLandscapePadDropsDuplicate(){
        val window=mutableStateOf(io.github.huleixin.tingyu.chrome.PadWindow(393f,852f))
        compose.setContent{androidx.compose.runtime.CompositionLocalProvider(io.github.huleixin.tingyu.chrome.LocalPadWindow provides window.value){
            MinimalLyricsPage(state,MinimalArtwork(),buildMinimalPalette(null,false),minimalInk(false),mutableLongStateOf(0),true,false,{})
        }}
        compose.onNodeWithText("Long song").assertExists()
        compose.runOnIdle{window.value=io.github.huleixin.tingyu.chrome.PadWindow(800f,1280f)}
        compose.onNodeWithText("Long song").assertExists()
        compose.runOnIdle{window.value=io.github.huleixin.tingyu.chrome.PadWindow(1280f,800f)}
        compose.onNodeWithText("Long song").assertDoesNotExist()
    }

    @Test fun onlyViewportRowsAreComposedAndClickStillSeeks() {
        var seek=-1.0
        compose.setContent {
            MinimalLyricsPage(state,MinimalArtwork(),buildMinimalPalette(null,false),minimalInk(false),mutableLongStateOf(0),true,false,{seek=it})
        }
        val rows=compose.onAllNodes(hasText("Lyric row",substring=true)).fetchSemanticsNodes()
        assertTrue("composed ${rows.size} of 600 rows",rows.size in 2..30)
        compose.onNodeWithText("Lyric row 50").assertIsDisplayed().performClick()
        assertTrue(seek==100.0)
    }

    @Test fun tenStageRoundTripsRetainLyricsPagerWithoutReentry() {
        val detour=mutableStateOf(false)
        var settledPage=-1
        compose.setContent {
            MinimalPlayerScreen(state,MinimalArtwork(),commands,initialPage=1,onPageChanged={settledPage=it},light=false,safeTop=0f,safeBottom=0f,detour=detour.value,onCollapse={},onOpenStage={})
        }
        // 语义树里同名行可能有两份：当前歌词页一份、被保留的封面页歌词预览一份（在屏外 x<0）。
        // 这里关心的是"歌词页还在组合里且在屏内可见"，用多节点查找而不是唯一匹配。
        fun lyricRows()=compose.onAllNodesWithText("Lyric row 50").fetchSemanticsNodes()
        fun onScreenRowVisible()=lyricRows().any { it.boundsInRoot.left>=0f && it.boundsInRoot.right>0f }
        assertTrue("lyrics page composed initially",onScreenRowVisible())
        repeat(10) {
            compose.runOnIdle { detour.value=true }
            assertTrue("lyrics retained while visiting stage",lyricRows().isNotEmpty())
            compose.runOnIdle { detour.value=false }
            assertTrue("lyrics visible again after returning",onScreenRowVisible())
            assertTrue(settledPage==1)
        }
        // 滑动切页在 Robolectric 自动时钟下 waitForIdle 会误报不空闲（实测手动步进
        // 40 帧后 page=0 且布局完全稳定），改为关掉自动推进、手动泵帧到落定再断言。
        compose.mainClock.autoAdvance=false
        compose.onRoot().performTouchInput { swipeRight() }
        repeat(30){ compose.mainClock.advanceTimeByFrame() }
        compose.mainClock.autoAdvance=true
        assertTrue("pager remains usable after returning",settledPage==0)
    }
}
