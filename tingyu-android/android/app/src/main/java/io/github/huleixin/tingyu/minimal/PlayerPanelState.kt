package io.github.huleixin.tingyu.minimal

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import io.github.huleixin.tingyu.chrome.TingYuMotion
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.roundToInt

/** One spatial progress for the native shell, artwork and gesture in either direction. */
internal class PlayerPanelState(private val scope: CoroutineScope) {
    var progress by mutableFloatStateOf(1f); private set
    var dragging by mutableStateOf(false); private set
    var collapsePending by mutableStateOf(false); private set
    var initialized by mutableStateOf(false); private set
    var awaitingEntry by mutableStateOf(false); private set
    private var animation: Job? = null
    private var target = 1f
    private var cancelTarget = 1f

    fun prepareEntry() {
        if (initialized) return
        adopt(0f)
        awaitingEntry = true
    }

    fun open(reduced: Boolean) {
        if (!initialized) adopt(0f)
        settle(1f, reduced)
    }

    fun adopt(value: Float) {
        if (initialized) return
        initialized = true
        progress = value
    }

    fun beginDrag(cancelTo: Float? = null) {
        cancelTarget = cancelTo ?: target
        animation?.cancel()
        awaitingEntry = false
        collapsePending = false
        dragging = true
    }

    fun dragBy(deltaY: Float, range: Float) {
        if (!dragging) beginDrag()
        progress = (progress - deltaY / range.coerceAtLeast(1f)).coerceIn(0f, 1f)
    }

    fun release(velocityY: Float, canceled: Boolean = false, reduced: Boolean = false) {
        settle(if (canceled) cancelTarget else releaseTarget(progress, velocityY), reduced)
    }

    fun close(reduced: Boolean) {
        adopt(1f)
        settle(0f, reduced)
    }

    fun reset() {
        animation?.cancel()
        initialized = false
        dragging = false
        awaitingEntry = false
        collapsePending = false
        progress = 1f
        target = 1f
    }

    fun consumeCollapse() { collapsePending = false }

    private fun settle(end: Float, reduced: Boolean) {
        animation?.cancel()
        target = end
        dragging = false
        awaitingEntry = false
        collapsePending = false
        val duration = (320 * abs(end - progress)).roundToInt().coerceAtLeast(90)
        if (reduced || end == progress) {
            progress = end
            collapsePending = end == 0f
            return
        }
        animation = scope.launch {
            Animatable(progress).animateTo(end, tween(duration, easing = TingYuMotion.Emphasized)) {
                progress = value
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
