package io.github.huleixin.tingyu.chrome

import androidx.activity.ComponentActivity
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.zIndex
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import io.github.huleixin.tingyu.minimal.MinimalQueue
import io.github.huleixin.tingyu.minimal.MinimalQueueItem
import io.github.huleixin.tingyu.minimal.ui.*
import io.github.huleixin.tingyu.playback.SleepTimerController
import org.junit.After
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.lang.reflect.Proxy

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/PlayerSheetsInteractionTest.kt
// 真实 Compose 命中与滚动验证；LEGACY 不用于证明像素或真机帧率。
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.LEGACY)
@Config(sdk=[34], qualifiers="w393dp-h852dp-420dpi")
class PlayerSheetsInteractionTest {
    @get:Rule val compose=createAndroidComposeRule<ComponentActivity>()
    private val open=mutableStateOf(true)
    private var closed=0
    private var underlyingClicks=0
    private var timer:SleepTimerController?=null
    private lateinit var sleep:MiniSleepUi
    private fun dismiss(){closed++;open.value=false}
    private fun settle(){compose.mainClock.advanceTimeBy(500);compose.waitForIdle()}
    private fun reopen(){compose.runOnIdle{open.value=true};settle()}
    @After fun cleanTimer(){timer?.detach()}

    private fun queue(count:Int, state:LazyListState=LazyListState(), moves:MutableList<Pair<Int,Int>> = mutableListOf(), plays:MutableList<Int> = mutableListOf()) {
        compose.mainClock.autoAdvance=true
        compose.setContent {
            Box(Modifier.fillMaxSize()) {
                // 模拟正式宿主的原生页面/播放器层；遮罩必须高于它。
                Box(Modifier.fillMaxSize().zIndex(3f).clickable{underlyingClicks++})
                MinimalSheetScrim(open.value,true,::dismiss)
                AnimatedVisibility(open.value,enter=minimalSheetEnter(),exit=minimalSheetExit(),modifier=Modifier.fillMaxSize().zIndex(6f)) {
                    MinimalQueueSheet(MinimalQueue(total=count,items=List(count){MinimalQueueItem("u$it","k$it","歌曲$it","歌手")}),
                        true,"shuffle",::dismiss,{plays.add(it);true},{true},{a,b->moves.add(a to b);true},{true},state)
                }
            }
        }
        settle()
    }

    @Test fun queueInteriorDoesNotCloseButOutsideClosesWithoutActivatingThePage() {
        queue(0)
        compose.onNodeWithText("队列是空的").performTouchInput{click()}
        assertEquals(0,closed)
        compose.onRoot().performTouchInput{click(Offset(center.x,center.y*.2f))}
        settle()
        assertEquals(1,closed)
        assertEquals(0,underlyingClicks)
        compose.onNodeWithText("播放队列").assertDoesNotExist()
    }

    @Test fun queueRowsStillPlayScrollAndReorderWithoutDismissing() {
        val state=LazyListState();val moves=mutableListOf<Pair<Int,Int>>();val plays=mutableListOf<Int>()
        queue(40,state,moves,plays)
        compose.onNodeWithText("歌曲0").performTouchInput{click()}
        assertEquals(listOf(0),plays)
        val handles=compose.onAllNodesWithContentDescription("长按拖动排序")
        val first=handles[0].fetchSemanticsNode().boundsInRoot.center
        val second=handles[1].fetchSemanticsNode().boundsInRoot.center
        compose.onRoot().performTouchInput {
            down(first);advanceEventTime(650);moveTo(second,150);up()
        }
        settle()
        assertEquals(listOf(0 to 1),moves)
        compose.onRoot().performTouchInput{swipe(Offset(center.x,height*.88f),Offset(center.x,height*.60f),250)}
        settle()
        assertTrue(state.firstVisibleItemIndex>0||state.firstVisibleItemScrollOffset>0)
        assertEquals(0,closed)
        assertEquals(0,underlyingClicks)
    }

    private fun sleepSheet() {
        timer=SleepTimerController.get(compose.activity)
        val player=Proxy.newProxyInstance(ExoPlayer::class.java.classLoader,arrayOf(ExoPlayer::class.java)){_,method,_->
            when(method.name){"getCurrentMediaItem"->MediaItem.fromUri("https://example.invalid/audio");"getPlayWhenReady"->false;else->null}
        } as ExoPlayer
        timer!!.attach(player,{})
        sleep=MiniSleepUi(timer!!)
        // ScrollTo/bringIntoView uses the frame clock; keep it advancing during scroll assertions.
        compose.mainClock.autoAdvance=true
        compose.setContent {
            CompositionLocalProvider(LocalChromeRendering provides false,LocalInterfacePalette provides InterfacePalette(true)) {
                Box(Modifier.fillMaxSize()) {
                    Box(Modifier.fillMaxSize().clickable{underlyingClicks++})
                    TyPanelScrim(open.value,true,::dismiss)
                    AnimatedVisibility(open.value,enter=minimalSheetEnter(),exit=minimalSheetExit()) {
                        MiniSleepMenu(sleep,24f,24f,true,reduced=true,onDismiss=::dismiss)
                    }
                }
            }
        }
        settle()
    }

    @Test fun sleepOutsideClosesAndQuickTimerAndCancelRemainFunctional() {
        sleepSheet()
        compose.onNodeWithText("快捷定时").performTouchInput{click()}
        assertEquals(0,closed)
        compose.onRoot().performTouchInput{click(Offset(center.x,center.y*.2f))}
        settle()
        assertEquals(1,closed);assertEquals(0,underlyingClicks)
        reopen()
        compose.onNodeWithText("15 分钟").performTouchInput{click()}
        settle()
        assertTrue(sleep.snapshot.active);assertEquals(900000L,sleep.snapshot.duration)
        reopen()
        compose.onNodeWithText("取消定时").performTouchInput{click()}
        settle()
        assertFalse(sleep.snapshot.active)
    }

    @Test @Config(qualifiers="w852dp-h393dp-420dpi")
    fun shortLandscapeCanScrollToCustomTimerAndKeepAllStopModes() {
        sleepSheet()
        compose.onNodeWithText("自定义").performTouchInput{click()}
        settle()
        compose.onNodeWithText("时间结束立即暂停").assertExists()
        compose.onNodeWithText("当前歌曲播放完暂停").assertExists()
        compose.onNodeWithText("时间结束后播完当前歌曲再暂停").performScrollTo().performTouchInput{click()}
        compose.onNodeWithText("开始定时").performScrollTo().assertIsDisplayed().performTouchInput{click()}
        settle()
        assertTrue(sleep.snapshot.active)
        assertEquals("deadline_track",sleep.snapshot.mode)
        assertEquals(1800000L,sleep.snapshot.duration)
        assertEquals(1,closed);assertEquals(0,underlyingClicks)
    }
}
