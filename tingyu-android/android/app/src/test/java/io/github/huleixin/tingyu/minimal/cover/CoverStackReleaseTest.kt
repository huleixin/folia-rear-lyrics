package io.github.huleixin.tingyu.minimal.cover

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/minimal/cover/CoverStackReleaseTest.kt
// Release continuity and removal only after the complete visual leaves the canvas.
class CoverStackReleaseTest {
    @Test
    fun preservesReleaseVelocity() {
        val motion = ReleaseTween(-100f, -700f, -2400f, 280f)
        val x = motion.step(0.01f)
        assertEquals(-2400f, (x + 100f) / 0.00001f, 4f)
        assertEquals(-700f, motion.step(280f), 0.001f)
        assertTrue(motion.done)
    }

    @Test
    fun clearsPhoneAndTabletViewportWithoutReversal() {
        val canvases = listOf(
            CoverViewport(-26f, -150f, 367f, 702f),
            CoverViewport(-290f, -160f, 990f, 640f),
            CoverViewport(-52f, -380f, 734f, 1280f),
        )
        for (viewport in canvases) for ((vx, vy) in listOf(-1100f to 0f, -10f to -2000f, -1700f to 1400f)) {
            val target = coverExitTarget(-100f, -40f, vx, vy, 320f, viewport, 150f, 280f, 1f)
            assertTrue(viewport.outside(target.first, target.second, 320f, 150f))
            val x = ReleaseTween(-100f, target.first, vx, 280f)
            val y = ReleaseTween(-40f, target.second, vy, 280f)
            var previousX = -100f
            var previousY = -40f
            repeat(35) {
                val nextX = x.step(8f)
                val nextY = y.step(8f)
                assertTrue(nextX <= previousX + 0.001f)
                if (vy < 0f) assertTrue(nextY <= previousY + 0.001f)
                if (vy > 0f) assertTrue(nextY >= previousY - 0.001f)
                previousX = nextX
                previousY = nextY
            }
        }
    }

    @Test
    fun deepFastDragNeverReturnsToOldEndpoint() {
        val target = coverExitTarget(-1800f, -500f, -12000f, -3000f, 320f,
            CoverViewport(-26f, -150f, 367f, 702f), 150f, 220f, 1f)
        assertTrue(target.first < -1800f)
        assertTrue(target.second < -500f)
        val motion = ReleaseTween(-1800f, target.first, -12000f, 220f)
        var previous = -1800f
        repeat(30) {
            val next = motion.step(8f)
            assertTrue(next <= previous + 0.001f)
            previous = next
        }
    }

    @Test
    fun commitFinishesOnlyAfterExitAndPromotionOnAllFrameCadences() {
        for (dt in listOf(8.33f, 16.67f, 33.33f)) {
            val state = CoverStackState().apply {
                setSize(320f, 1f)
                setViewport(-280f, -160f, 1000f, 640f)
                applyCards(listOf(
                    CoverCard("a#0", "a", "a", "", "", 0f, 0f, moving = true),
                    CoverCard("b#0", "b", "b", "", "", 1f, 0f),
                ))
                drag(-100f, -20f, 0.6f)
            }
            var completed = false
            state.onCommitDone = {
                assertTrue(CoverViewport(-280f, -160f, 1000f, 640f).outside(
                    state.edgeX, state.edgeY, 320f, 147.2f))
                assertEquals(1f, state.progress, 0.0001f)
                completed = true
            }
            state.beginCommit(DragDirection.NEXT, 0.6f, -100f, -20f, -1000f, -100f)
            assertEquals("b", state.committedCard?.songKey)
            var time = 0f
            while (state.step(dt) && time < 1000f) time += dt
            assertTrue(completed)
            assertTrue(time <= 320f + dt)
        }
    }

    @Test
    fun unadmittedDragCannotCancelExit() {
        val state = CoverStackState().apply { setSize(320f, 1f) }
        state.beginCommit(DragDirection.NEXT, 0.5f, -100f, 0f, -1000f, 0f)
        state.step(16f)
        val x = state.edgeX
        state.drag(-5f, 0f, 0f)
        assertEquals(StackPhase.COMMIT, state.phase)
        assertEquals(x, state.edgeX, 0.001f)
        state.step(16f)
        assertTrue(state.edgeX < x)
    }

    @Test
    fun callbackStartedTransitionKeepsFrameLoopAlive() {
        val state = CoverStackState().apply { setSize(320f, 1f) }
        var completions = 0
        state.onCommitDone = {
            completions++
            if (completions == 1) state.beginCommit(DragDirection.NEXT, 0f, 0f, 0f, 0f, 0f)
        }
        state.beginCommit(DragDirection.NEXT, 0f, 0f, 0f, 0f, 0f)
        var running = true
        repeat(60) { if (running) running = state.step(16.7f) }
        assertEquals(2, completions)
        assertFalse(running)
    }

    @Test
    fun previousAndCancelledGesturesSettleWithoutLosingTheirIdentity() {
        val state = CoverStackState().apply {
            setSize(320f, 1f)
            applyCards(listOf(CoverCard("p#0", "p", "previous", "", "", 0f, 0f, moving = true)))
            drag(-180f, 30f, 0.6f)
        }
        state.beginCommit(DragDirection.PREV, 0.6f, -180f, 30f, 1600f, 200f)
        assertEquals("p", state.committedCard?.songKey)
        repeat(30) { state.step(16.7f) }
        assertEquals(StackPhase.IDLE, state.phase)
        assertEquals(0f, state.edgeX, 0.001f)
        assertEquals(0f, state.edgeY, 0.001f)
        state.drag(-60f, 10f, 0.2f)
        state.springBack()
        repeat(180) { state.step(16.7f) }
        assertEquals(StackPhase.IDLE, state.phase)
        assertEquals(0f, state.progress, 0.001f)
        assertEquals("p", state.cards.first().songKey)
    }

    @Test
    fun reducedMotionSettlesOnce() {
        val state = CoverStackState().apply { motionEnabled = false }
        var calls = 0
        state.onCommitDone = { calls++ }
        state.beginCommit(DragDirection.NEXT, 0.4f, -100f, 0f, -2000f, 0f)
        assertFalse(state.step(16f))
        assertEquals(1, calls)
        assertEquals(1f, state.progress, 0.001f)
    }
}
