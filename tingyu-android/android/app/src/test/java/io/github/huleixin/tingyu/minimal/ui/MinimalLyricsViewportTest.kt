package io.github.huleixin.tingyu.minimal.ui

import androidx.activity.ComponentActivity
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
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

    private fun lyricsScreen(panel: (io.github.huleixin.tingyu.minimal.PlayerPanelState)->Unit, state: MinimalPlayerState) {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            val scope = rememberCoroutineScope()
            val controller = remember { io.github.huleixin.tingyu.minimal.PlayerPanelState(scope).apply { adopt(1f) } }
            panel(controller)
            CompositionLocalProvider(
                io.github.huleixin.tingyu.chrome.LocalPlayerPanelState provides controller,
                io.github.huleixin.tingyu.chrome.LocalMinimalMorph provides io.github.huleixin.tingyu.chrome.MinimalPlayerMorph(
                    with(LocalDensity.current) { androidx.compose.ui.geometry.Rect(0f, 700.dp.toPx(), 393.dp.toPx(), 780.dp.toPx()) },
                    with(LocalDensity.current) { androidx.compose.ui.geometry.Rect(20.dp.toPx(), 710.dp.toPx(), 60.dp.toPx(), 750.dp.toPx()) },
                    mutableStateOf(1f), io.github.huleixin.tingyu.chrome.NativeStageExit(), mutableStateOf(0f), false, controller),
            ) {
                MinimalPlayerScreen(state, MinimalArtwork(), commands, initialPage = 1,
                    light = false, safeTop = 24f, safeBottom = 0f, detour = false,
                    onCollapse = {}, onOpenStage = {})
            }
        }
        compose.mainClock.advanceTimeByFrame()
    }

    @Test fun pullingDownAtLyricsTopMovesPanelAndReverseCancels() {
        lateinit var panel: io.github.huleixin.tingyu.minimal.PlayerPanelState
        val atTop = MinimalPlayerState(
            playback = MinimalPlayback(track = MinimalTrack(key = "top", title = "Top"), anchorPositionMs = 0,
                source = MinimalClockSource.ENGINE),
            lyrics = MinimalLyrics(status = MinimalLyricsStatus.READY,
                lines = List(20) { i -> MinimalLyricLine(startSec = i * 2.0, endSec = i * 2.0 + 2, text = "Top row $i") }),
        )
        lyricsScreen({ panel = it }, atTop)
        val row = compose.onAllNodesWithText("Top row 0").fetchSemanticsNodes()
            .first { it.boundsInRoot.right > 0f }
        compose.onNodeWithText("Top row 0").performTouchInput { down(center); moveBy(Offset(0f, 90f)) }
        compose.mainClock.advanceTimeByFrame()
        compose.runOnIdle { assertTrue(panel.dragging); assertTrue(panel.progress < 1f) }
        compose.onNodeWithText("Top row 0").performTouchInput { moveBy(Offset(0f, -90f)); up() }
        compose.mainClock.advanceTimeBy(2000)
        compose.runOnIdle { assertTrue(panel.progress > .999f); assertTrue(!panel.collapsePending) }
        assertTrue(row.boundsInRoot.width > 0f)
    }

    @Test fun scrollingLyricsAwayFromTopDoesNotClosePlayer() {
        lateinit var panel: io.github.huleixin.tingyu.minimal.PlayerPanelState
        lyricsScreen({ panel = it }, state)
        compose.onNodeWithText("Lyric row 50").performTouchInput { down(center); moveBy(Offset(0f, 100f)) }
        compose.mainClock.advanceTimeByFrame()
        compose.runOnIdle { assertTrue(!panel.dragging); assertTrue(panel.progress > .999f) }
        compose.onNodeWithText("Lyric row 50").performTouchInput { up() }
    }
}
