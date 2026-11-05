package io.github.huleixin.tingyu.minimal.cover

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import io.github.huleixin.tingyu.minimal.MinimalQueue
import io.github.huleixin.tingyu.minimal.MinimalTrack
import io.github.huleixin.tingyu.playback.NativePlaylist
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

// android/app/src/test/java/io/github/huleixin/tingyu/minimal/cover/CoverStackControllerSkipTxTest.kt
//
// 切歌事务状态机（Robolectric：需要 SystemClock 与 Looper）。
//
// 覆盖验收清单里最容易回归的几条竞态：
//   · 动画提前结束、真实播放器尚未确认 —— 封面只许是视觉预览（ANIMATION_DONE）；
//   · 播放状态先于动画到达 —— 动画收尾时立即确认，不等桥帧、不等 2.5s 兜底；
//   · 新请求覆盖旧请求 / 提交期间连点 —— 只发一条命令；
//   · 目标歌曲失败 —— 宽限期兜底 force 回退真实身份，事务标记 FAILED；
//   · 取消拖动 —— 不发命令、不产生事务、封面不换歌。
@RunWith(RobolectricTestRunner::class)
// 与 MinimalCoverStackTest 同一档 sdk=34：默认档（targetSdk 36）在 Robolectric 4.17 的
// setUpApplicationState 里会踩 FileDescriptor 拦截器的 JDK 兼容问题。
@Config(sdk = [34])
class CoverStackControllerSkipTxTest {

    private val context: Context = ApplicationProvider.getApplicationContext()

    private lateinit var state: CoverStackState
    private lateinit var controller: CoverStackController
    private val sentCommands = mutableListOf<Pair<String, Long>>()
    private val queue = MinimalQueue()

    @Before
    fun setUp() {
        NativePlaylist.resetForTest()
        NativePlaylist.get().replace(
            listOf(track("a"), track("b"), track("c"), track("d")),
            NativePlaylist.Mode.SEQUENCE, false, 1L, "test",
        )
        state = CoverStackState()
        controller = CoverStackController(
            state = state,
            artwork = CoverStackArtwork(context),
            sendNext = { id -> sentCommands.add("next" to id); true },
            sendPrevious = { id -> sentCommands.add("prev" to id); true },
        )
        controller.sync(playbackOf("a"), queue)
    }

    private fun track(key: String) = NativePlaylist.Track(
        key, "qq", "m-$key", "歌$key", "歌手", "专辑", 100_000L, "", "",
    )

    private fun playbackOf(key: String) = MinimalTrack(
        key = key, title = "歌$key", artist = "歌手", durationMs = 100_000L,
    )

    /** 把提交动画跑完（dt 截断在 48ms，几十帧内必然到终点）。 */
    private fun finishAnimation() {
        var guard = 0
        while (state.phase != StackPhase.IDLE && guard++ < 400) state.step(48f)
        assertEquals(StackPhase.IDLE, state.phase)
    }

    @Test
    fun `动画先完成而播放未确认时封面只是视觉预览`() {
        assertTrue(controller.onGestureCommit(DragDirection.NEXT, 0f, 0f))
        assertEquals(SkipStage.REQUESTED, controller.transaction.stage)
        assertEquals(1, sentCommands.size)
        assertEquals("b", controller.transaction.expectedSongKey)

        finishAnimation()

        assertEquals(SkipStage.ANIMATION_DONE, controller.transaction.stage)
        // 顶层已经是预期中的下一首……
        assertEquals("b", state.cards.first().songKey)
        // ……但真实播放身份还在 a：窗口里的 current 未变，不能把预览当成正在播。
        assertEquals("a", controller.window.current?.songKey)

        // 真实播放状态追上来：确认。
        controller.sync(playbackOf("b"), queue)
        assertEquals(SkipStage.CONFIRMED, controller.transaction.stage)
        assertEquals("b", state.cards.first().songKey)
    }

    @Test
    fun `播放状态先于动画到达时收尾立即确认不等桥帧`() {
        assertTrue(controller.onGestureCommit(DragDirection.NEXT, 0f, 0f))
        assertEquals(StackPhase.COMMIT, state.phase)

        // 真实播放状态在动画进行中就到了（Media3 换曲事件）：sync 此时按老规矩 early-return。
        controller.sync(playbackOf("b"), queue)
        assertEquals(SkipStage.REQUESTED, controller.transaction.stage)

        finishAnimation()

        // 动画收尾的重放用最近一次 sync 的播放状态立即落位 —— 不依赖下一次桥帧。
        assertEquals(SkipStage.CONFIRMED, controller.transaction.stage)
        assertEquals("b", state.cards.first().songKey)
        assertEquals("b", controller.window.current?.songKey)
    }

    @Test
    fun `提交期间连点只发一条切歌命令`() {
        assertTrue(controller.onGestureCommit(DragDirection.NEXT, 0f, 0f))
        // 按钮入口：提交期间被吞（返回 true 表示"由这里接管"，不回退、不发第二命令）。
        assertTrue(controller.skip(DragDirection.NEXT))
        assertEquals(1, sentCommands.size)
        // 手势入口同样拒绝。
        assertFalse(controller.onGestureCommit(DragDirection.NEXT, 0f, 0f))
        assertEquals(1, sentCommands.size)
    }

    @Test
    fun `目标歌曲失败时 force 回退真实正在播的那首`() {
        assertTrue(controller.onGestureCommit(DragDirection.NEXT, 0f, 0f))
        finishAnimation()
        assertEquals("b", state.cards.first().songKey)

        // 解析失败/桥断开：播放状态从未离开 a，超时兜底 force 对齐。
        controller.sync(playbackOf("a"), queue, force = true)

        assertEquals(SkipStage.FAILED, controller.transaction.stage)
        assertEquals("a", state.cards.first().songKey)
    }

    @Test
    fun `取消拖动不发命令也不产生切歌事务`() {
        controller.onGestureLocked(DragDirection.NEXT, blocked = false)
        state.drag(-100f, 0f, 0.2f)
        controller.onGestureCancel()

        var guard = 0
        while (state.phase != StackPhase.IDLE && guard++ < 400) state.step(48f)

        assertEquals(0, sentCommands.size)
        assertEquals(SkipStage.NONE, controller.transaction.stage)
        assertEquals("a", state.cards.first().songKey)
    }

    @Test
    fun `requestId 随命令单调递增`() {
        assertTrue(controller.onGestureCommit(DragDirection.NEXT, 0f, 0f))
        finishAnimation()
        controller.sync(playbackOf("b"), queue)
        assertTrue(controller.skip(DragDirection.NEXT))
        assertEquals(2, sentCommands.size)
        val firstId = sentCommands[0].second
        val secondId = sentCommands[1].second
        assertTrue(firstId > 0)
        assertEquals(firstId + 1, secondId)
    }
}
