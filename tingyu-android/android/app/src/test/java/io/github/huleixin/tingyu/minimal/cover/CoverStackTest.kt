package io.github.huleixin.tingyu.minimal.cover

import io.github.huleixin.tingyu.minimal.MinimalQueue
import io.github.huleixin.tingyu.minimal.MinimalTrack
import io.github.huleixin.tingyu.playback.NativePlaylist
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/minimal/cover/CoverStackTest.kt
//
// 相册堆叠的纯逻辑：静止姿态、1:1 跟手、离场方向、回弹、残影阈值、队列解析。
//
// 这些断言是"已验收手感"的可执行版本 —— 改参数改坏了哪一条，这里第一个红。
// 不涉及 Compose 布局与手势分发（那些在 MinimalCoverStackTest 里用真实触摸注入验）。

class CoverStackTest {

    @Before
    fun setUp() {
        NativePlaylist.resetForTest()
    }

    private fun state(width: Float = 320f): CoverStackState {
        val state = CoverStackState()
        state.setSize(width, 1f)
        return state
    }

    private fun card(key: String, slot: Int, moving: Boolean = false) = CoverCard(
        key = key,
        songKey = key,
        title = key,
        artist = "",
        artwork = "",
        from = slot.toFloat(),
        to = slot.toFloat(),
        moving = moving,
    )

    private fun entry(key: String) = CoverEntry(key, "t-$key", "a-$key", "art-$key")

    // ---- 静止姿态 ----

    @Test
    fun `rest pose is three near-identical sleeves tilted the opposite ways`() {
        val frames = buildSlotFrames(CoverStackSpec(), pxPerDp = 3f)
        assertEquals(0f, frames[0].x, 0.001f)
        assertEquals(0f, frames[0].y, 0.001f)
        assertEquals(1f, frames[0].scale, 0.0001f)
        assertEquals(0f, frames[0].rot, 0.0001f)

        // 第二张逆时针、第三张顺时针：反向微旋才读得出"两张纸"
        assertTrue(frames[1].rot < 0f)
        assertTrue(frames[2].rot > 0f)
        // ±4°（规范给的是 4~6°，取截图更接近的下界）
        assertEquals(-4f, frames[1].rot, 0.001f)
        assertEquals(4f, frames[2].rot, 0.001f)
        // 几乎同尺寸：缩差不超过 4%
        assertTrue(1f - frames[1].scale < 0.04f)
        assertTrue(frames[1].scale - frames[2].scale < 0.04f)
        // 错位方向不同，不重合、不成整齐阶梯
        assertTrue(frames[1].x < 0f && frames[2].x > 0f)
        assertTrue(frames[1].y != frames[2].y)

        // 待补入的第四层：同角度、同中心、更小 —— 完全藏在第三张后面
        assertEquals(frames[2].x, frames[3].x, 0.001f)
        assertEquals(frames[2].y, frames[3].y, 0.001f)
        assertEquals(frames[2].rot, frames[3].rot, 0.001f)
        assertTrue(frames[3].scale < frames[2].scale)
    }

    @Test
    fun `frames interpolate continuously and clamp at the ends`() {
        val frames = buildSlotFrames(CoverStackSpec(), 1f)
        val out = FloatArray(4)
        frameAt(frames, 1.5f, out)
        assertEquals((frames[1].x + frames[2].x) / 2f, out[0], 0.001f)
        assertEquals((frames[1].rot + frames[2].rot) / 2f, out[3], 0.001f)
        frameAt(frames, -3f, out)
        assertEquals(frames[0].x, out[0], 0.001f)
        frameAt(frames, 9f, out)
        assertEquals(frames[3].x, out[0], 0.001f)
    }

    @Test
    fun `back layers are dimmed more the deeper they are`() {
        assertEquals(0f, dimAt(0f), 0.0001f)
        assertEquals(0.15f, dimAt(1f), 0.0001f)
        assertEquals(0.28f, dimAt(2f), 0.0001f)
        assertTrue(dimAt(1.5f) > dimAt(1f))
        assertTrue(dimAt(3f) <= 0.34f + 0.0001f)
    }

    // ---- 跟手 ----

    @Test
    fun `drag moves the top cover exactly with the finger on both axes`() {
        val state = state()
        state.applyCards(listOf(card("a", 0, moving = true), card("b", 1), card("c", 2)))
        state.drag(-50f, -20f, 0.2f)
        var frame = state.frameFor(state.cards[0])
        assertEquals(-50f, frame[0], 0.01f)
        assertEquals(-20f, frame[1], 0.01f)
        // 不旋转：默认完全不跟手倾斜
        assertEquals(0f, frame[3], 0.001f)

        // 换方向：斜下也一样 1:1
        state.drag(-80f, 55f, 0.25f)
        frame = state.frameFor(state.cards[0])
        assertEquals(-80f, frame[0], 0.01f)
        assertEquals(55f, frame[1], 0.01f)
    }

    @Test
    fun `dragging also lifts the next two covers a fraction of the way`() {
        val state = state()
        state.applyCards(
            listOf(
                card("a", 0, moving = true),
                CoverCard("b", "b", "", "", "", 1f, 0f),
                CoverCard("c", "c", "", "", "", 2f, 1f),
            ),
        )
        val before = state.frameFor(state.cards[2]).copyOf()
        state.drag(-60f, 0f, CoverStackSpec.DRAG_PROGRESS_LIMIT)
        val after = state.frameFor(state.cards[2])
        // 第三张朝第二张的层位走了一部分（不是完全不动，也没有抢跑到顶）
        assertTrue(after[0] != before[0] || after[1] != before[1])
        assertTrue(state.progress <= CoverStackSpec.DRAG_PROGRESS_LIMIT + 0.0001f)
    }

    @Test
    fun `finger stop immediately stops the cover`() {
        val state = state()
        state.applyCards(listOf(card("a", 0, moving = true)))
        state.drag(-40f, 0f, 0.1f)
        // 手指不动：位置一个像素都不该变
        repeat(30) { state.step(16.7f) }
        assertEquals(-40f, state.frameFor(state.cards[0])[0], 0.01f)
    }

    // ---- 离场 ----

    @Test
    fun `commit continues from the release point and ends at progress one`() {
        val state = state()
        state.applyCards(
            listOf(
                card("a", 0, moving = true),
                CoverCard("b", "b", "", "", "", 1f, 0f),
            ),
        )
        var done = false
        state.onCommitDone = { done = true }
        state.drag(-70f, -30f, 0.3f)
        state.beginCommit(DragDirection.NEXT, state.progress, state.edgeX, state.edgeY, -900f, -400f)
        // 不能从起点重播：第一步就应当从 -70px 往外走
        state.step(16.7f)
        assertTrue(state.edgeX < -70f)
        var guard = 0
        while (state.step(16.7f) && guard++ < 400) { /* 跑到结束 */ }
        assertTrue(done)
        assertEquals(1f, state.progress, 0.0001f)
        assertEquals(StackPhase.IDLE, state.phase)
    }

    @Test
    fun `exit target keeps the release direction and always leaves sideways`() {
        // 左上甩：方向不变
        val (x1, y1) = exitTarget(DragDirection.NEXT, -100f, -80f, 320f, 1f)
        assertTrue(x1 < 0f && y1 < 0f)
        assertEquals(0.8f, y1 / x1, 0.02f)
        // 几乎纯上甩：不强行拽回水平线 —— 方向不变（斜率 20），靠纵向离开屏幕
        val (x2, y2) = exitTarget(DragDirection.NEXT, -10f, -200f, 320f, 1f)
        assertTrue(x2 < 0f && y2 < 0f)
        assertTrue("纵向必须真的飞出画面：$y2", y2 <= -600f)
        assertEquals(20f, y2 / x2, 0.2f)
        // 上一首：回到 0（放进来的那张最终要落在正中）
        assertEquals(0f, exitTarget(DragDirection.PREV, 500f, 200f, 320f, 1f).first, 0.001f)
    }

    @Test
    fun `spring returns to rest without overshooting far`() {
        val state = state()
        state.applyCards(listOf(card("a", 0, moving = true)))
        var done = false
        state.onSpringDone = { done = true }
        state.drag(-30f, 0f, 0.05f)
        state.springBack()
        var maxOvershoot = 0f
        var guard = 0
        while (state.step(16.7f) && guard++ < 400) {
            maxOvershoot = maxOf(maxOvershoot, state.edgeX)
        }
        assertTrue(done)
        assertEquals(0f, state.edgeX, 0.01f)
        // 阻尼 0.9：允许指尖级的过冲（几像素），但绝不弹跳
        assertTrue("overshoot=$maxOvershoot", maxOvershoot < 12f)
    }

    // ---- 残影 ----

    @Test
    fun `slow drag stays perfectly sharp`() {
        val state = state()
        state.applyCards(listOf(card("a", 0, moving = true)))
        // 每帧 2px ≈ 120px/s
        repeat(8) { state.drag(-2f * (it + 1), 0f, 0f) }
        assertEquals(0f, state.trailAlpha, 0.0001f)
    }

    @Test
    fun `fast drag grows a subtle directional trail`() {
        val state = state()
        state.applyCards(listOf(card("a", 0, moving = true)))
        // 第一帧只建立基准（与 Demo 一致：锁定那一刻不凭空算出速度），第二帧才是真实速度
        state.drag(-10f, 0f, 0f)
        // 每帧 40px ≈ 2400px/s
        state.drag(-50f, 0f, 0f)
        assertTrue("alpha=${state.trailAlpha}", state.trailAlpha > 0.02f)
        // 上限很克制：不会糊成一片
        assertTrue("alpha=${state.trailAlpha}", state.trailAlpha < 0.2f + 0.0001f)
        // 方向 = 速度反方向（向左甩 → 残影往右）
        val ghost = state.ghostAt(2, 3)
        assertTrue(ghost[0] > 0f)
        assertEquals(0f, ghost[1], 0.01f)
        assertTrue(ghost[2] <= state.trailAlpha + 0.0001f)

        // 斜向甩：残影也跟着斜
        val diagonal = state()
        diagonal.applyCards(listOf(card("a", 0, moving = true)))
        diagonal.drag(-5f, -5f, 0f)
        diagonal.drag(-30f, -40f, 0f)
        val diagonalGhost = diagonal.ghostAt(2, 3)
        assertTrue(diagonalGhost[0] > 0f && diagonalGhost[1] > 0f)
    }

    @Test
    fun `trail level off means no trail at all`() {
        val state = CoverStackState(CoverStackSpec(trail = CoverTrailLevel.OFF))
        state.setSize(320f, 1f)
        state.applyCards(listOf(card("a", 0, moving = true)))
        state.drag(-120f, 0f, 0f)
        assertEquals(0f, state.trailAlpha, 0.0001f)
    }

    @Test
    fun `release velocity uses a short window and decays after a pause`() {
        val velocity = ReleaseVelocity()
        velocity.add(0L, 0f, 0f)
        velocity.add(16L, 40f, 0f)
        velocity.add(32L, 80f, 0f)
        val (vx, _) = velocity.velocity(32L)
        assertEquals(2500f, vx, 60f)
        // 松手前停住 300ms：速度必须衰减到 0，否则"停住了还算甩动"
        val idle = velocity.velocity(332L)
        assertEquals(0f, idle.first, 1f)
    }

    // ---- 队列 ----

    @Test
    fun `window resolves real next two and the previous from the logical playlist`() {
        val playlist = NativePlaylist.get()
        playlist.replace(
            listOf("a", "b", "c", "d").map { key ->
                NativePlaylist.Track(key, "tx", "m-$key", "t-$key", "ar-$key", "al-$key", 1000L, "art-$key", "")
            },
            NativePlaylist.Mode.SEQUENCE, false, 0L, "test", null,
        )
        val window = resolveCoverWindow(MinimalTrack(key = "a"), playlist, MinimalQueue())
        assertEquals("a", window.current?.songKey)
        assertEquals("b", window.next?.songKey)
        assertEquals("c", window.next2?.songKey)
        assertEquals("d", window.next3?.songKey)
        assertTrue(window.canGoNext)
        // 顺序模式的第一首：没有上一首，右滑必须判定为不可用（不能编一张假封面）
        assertNull(window.previous)
        assertFalse(window.canGoPrev)

        // 走到中间：上一首来自真实播放历史（JS 给的 previous）
        playlist.replace(
            listOf("b", "c", "d").map { key ->
                NativePlaylist.Track(key, "tx", "m-$key", "t-$key", "ar-$key", "al-$key", 1000L, "art-$key", "")
            },
            NativePlaylist.Mode.SEQUENCE, false, 0L, "test",
            NativePlaylist.Track("a", "tx", "m-a", "t-a", "ar-a", "al-a", 1000L, "art-a", ""),
        )
        val middle = resolveCoverWindow(MinimalTrack(key = "b"), playlist, MinimalQueue())
        assertEquals("a", middle.previous?.songKey)
        assertTrue(middle.canGoPrev)
        assertEquals("art-a", middle.previous?.artwork)
    }

    @Test
    fun `list loop wraps to the last track as previous`() {
        val playlist = NativePlaylist.get()
        playlist.replace(
            listOf("a", "b").map { key ->
                NativePlaylist.Track(key, "tx", "m-$key", "t-$key", "", "", 1000L, "", "")
            },
            NativePlaylist.Mode.LOOP_ALL, true, 0L, "test",
            NativePlaylist.Track("b", "tx", "m-b", "t-b", "", "", 1000L, "", ""),
        )
        val window = resolveCoverWindow(MinimalTrack(key = "a"), playlist, MinimalQueue())
        assertEquals("b", window.next?.songKey)
        assertEquals("b", window.previous?.songKey)
    }

    @Test
    fun `duplicate songs in the queue keep separate card identities`() {
        val cards = buildCards(listOf(entry("a"), entry("a"), entry("b")))
        assertEquals(listOf("a#0", "a#1", "b#0"), cards.map { it.key })
        assertEquals(listOf(0f, 1f, 2f), cards.map { it.from })
    }

    @Test
    fun `transition tables keep four layers and the right slot movement`() {
        val window = CoverWindow(
            current = entry("a"),
            next = entry("b"),
            next2 = entry("c"),
            next3 = entry("d"),
            previous = entry("p"),
            canGoNext = true,
            canGoPrev = true,
        )
        val next = transitionCards(DragDirection.NEXT, window)
        assertEquals(listOf("a#0", "b#0", "c#0", "d#0"), next.map { it.key })
        assertEquals(0f, next[0].from)
        assertTrue(next[0].moving)
        assertEquals(1f, next[1].from)
        assertEquals(0f, next[1].to)
        assertEquals(3f, next[3].from)
        assertEquals(2f, next[3].to)
        // 越深越晚起步：三张封面不会齐步走
        assertTrue(next[3].lag > next[2].lag)

        val prev = transitionCards(DragDirection.PREV, window)
        assertEquals(listOf("p#0", "a#0", "b#0", "c#0"), prev.map { it.key })
        assertTrue(prev[0].moving)
        assertEquals(0f, prev[1].from)
        assertEquals(1f, prev[1].to)
        assertEquals(2f, prev[3].from)
        assertEquals(3f, prev[3].to)

        val rest = restCards(window)
        assertEquals(listOf("a#0", "b#0", "c#0"), rest.map { it.key })
        assertTrue(rest.none { it.moving })
    }

    @Test
    fun `empty queue degrades to a single layer without pretending to have neighbours`() {
        val window = resolveCoverWindow(MinimalTrack(key = "a"), NativePlaylist.get(), MinimalQueue())
        assertNull(window.next)
        assertFalse(window.canGoNext)
        assertFalse(window.canGoPrev)
        assertEquals(1, restCards(window).size)
    }
}
