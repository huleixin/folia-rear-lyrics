package io.github.huleixin.tingyu.minimal

import androidx.compose.animation.core.Animatable
import io.github.huleixin.tingyu.minimal.immersive.immersiveSettleSpec
import androidx.compose.runtime.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/PlayerPanelState.kt
/** One reversible timeline; routing is committed only after reaching the mini-player endpoint. */
internal class PlayerPanelState(private val scope: CoroutineScope) {
    var progress by mutableFloatStateOf(1f); private set
    var dragging by mutableStateOf(false); private set
    var collapsePending by mutableStateOf(false); private set
    var initialized by mutableStateOf(false); private set
    private var animation: Job? = null
    private var target = 1f
    private var cancelTarget = 1f
    private var dragRange = 1f

    fun open(reduced: Boolean) {
        animation?.cancel()
        initialized = true; collapsePending = false; progress = 0f
        animate(1f, 0f, reduced)
    }
    fun adopt(value: Float) {
        if (!initialized) { initialized = true; progress = value; target = 1f }
    }
    fun beginDrag(cancelTo: Float? = null) {
        cancelTarget = cancelTo ?: target
        animation?.cancel(); collapsePending = false; dragging = true
    }
    fun dragBy(deltaY: Float, range: Float) {
        if (!dragging) beginDrag()
        dragRange = range.coerceAtLeast(1f)
        progress = (progress - deltaY / range.coerceAtLeast(1f)).coerceIn(0f, 1f)
    }
    fun release(velocityY: Float, canceled: Boolean = false, reduced: Boolean = false) {
        dragging = false
        val end = if (canceled) cancelTarget else releaseTarget(progress, velocityY)
        animate(end, -velocityY / dragRange, reduced)
    }
    fun close(reduced: Boolean) { dragging = false; collapsePending = false; animate(0f, 0f, reduced) }
    fun reset() {
        animation?.cancel(); dragging = false; collapsePending = false
        initialized = false; progress = 1f; target = 1f
    }
    fun consumeCollapse() { collapsePending = false }

    private fun animate(end: Float, velocity: Float, reduced: Boolean) {
        animation?.cancel(); target = end
        animation = scope.launch {
            if (!reduced) {
                val clock = Animatable(progress)
                clock.animateTo(end, immersiveSettleSpec(), initialVelocity = velocity) {
                    progress = value.coerceIn(0f, 1f)
                }
            }
            progress = end
            collapsePending = end == 0f
        }
    }
    companion object {
        fun releaseTarget(progress: Float, velocityY: Float): Float = when {
            velocityY <= -1200f -> 1f
            velocityY >= 1200f -> 0f
            progress >= .5f -> 1f
            else -> 0f
        }
    }
}
