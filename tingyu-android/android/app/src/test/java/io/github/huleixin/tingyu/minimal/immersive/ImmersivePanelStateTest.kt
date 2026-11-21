package io.github.huleixin.tingyu.minimal.immersive

import io.github.huleixin.tingyu.minimal.PlayerPanelState
import androidx.compose.runtime.BroadcastFrameClock
import kotlinx.coroutines.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/minimal/immersive/ImmersivePanelStateTest.kt
class PlayerPanelStateTest {
    private val clock = BroadcastFrameClock()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined + clock)
    private val panel = PlayerPanelState(scope)
    private var now = 0L
    private fun frames(count: Int) { repeat(count) { now += 16_000_000; clock.sendFrame(now) } }
    @After fun releaseScope() { scope.cancel() }

    @Test fun dragCatchesAutomaticAnimationAndCanHoldAndReverse() {
        panel.open(false); frames(12)
        val caught = panel.progress
        assertTrue(caught > 0f && caught < 1f)
        panel.beginDrag(); frames(20)
        assertEquals(caught,panel.progress,0f)
        panel.dragBy(100f,1000f)
        assertEquals(caught-.1f,panel.progress,.0001f)
        panel.dragBy(-100f,1000f)
        assertEquals(caught,panel.progress,.0001f)
        panel.release(0f,canceled=true); frames(160)
        assertEquals(1f,panel.progress,0f); assertFalse(panel.collapsePending)
    }
    @Test fun closingCanBeCaughtBeforeRoutingAndReopened() {
        panel.adopt(1f); panel.close(false); frames(12)
        assertFalse(panel.collapsePending)
        val caught = panel.progress
        panel.beginDrag(); assertEquals(caught,panel.progress,0f)
        panel.release(-1500f); frames(160)
        assertEquals(1f,panel.progress,0f); assertFalse(panel.collapsePending)
    }
    @Test fun cancelFromMiniReturnsToMiniAndCommitsOnlyAtTheEndpoint() {
        panel.open(false); panel.beginDrag(cancelTo=0f)
        panel.dragBy(-360f,1000f); assertEquals(.36f,panel.progress,.0001f)
        panel.release(0f,canceled=true)
        assertFalse(panel.collapsePending); frames(160)
        assertEquals(0f,panel.progress,0f); assertTrue(panel.collapsePending)
        panel.consumeCollapse(); frames(20); assertFalse(panel.collapsePending)
    }
    @Test fun positionAndVelocitySettleBothWays() {
        assertEquals(1f,PlayerPanelState.releaseTarget(.1f,-1300f),0f)
        assertEquals(0f,PlayerPanelState.releaseTarget(.9f,1300f),0f)
        assertEquals(0f,PlayerPanelState.releaseTarget(.49f,0f),0f)
        assertEquals(1f,PlayerPanelState.releaseTarget(.51f,0f),0f)
        panel.adopt(1f); panel.beginDrag(); panel.dragBy(750f,1000f)
        panel.release(0f); frames(160)
        assertEquals(0f,panel.progress,0f); assertTrue(panel.collapsePending)
    }
    @Test fun resetCancelsOldWorkAndReducedMotionStillSupportsDragging() {
        panel.open(false); frames(8); panel.reset(); frames(160)
        assertFalse(panel.initialized); assertFalse(panel.collapsePending)
        panel.adopt(1f); panel.beginDrag(); panel.dragBy(400f,1000f)
        assertEquals(.6f,panel.progress,.0001f)
        panel.release(0f,reduced=true)
        assertEquals(1f,panel.progress,0f)
        panel.close(true); assertEquals(0f,panel.progress,0f); assertTrue(panel.collapsePending)
    }

    @Test fun releaseCarriesFingerVelocityIntoTheFirstSpringFrames() {
        panel.adopt(.6f)
        panel.beginDrag()
        panel.dragBy(0f, 1000f)
        panel.release(0f)
        frames(4)
        val stationary = panel.progress
        panel.reset()

        panel.adopt(.6f)
        panel.beginDrag()
        panel.dragBy(0f, 1000f)
        panel.release(-900f)
        frames(4)
        assertTrue(panel.progress > stationary)
        frames(60)
        assertEquals(1f, panel.progress, 0f)
    }
}
