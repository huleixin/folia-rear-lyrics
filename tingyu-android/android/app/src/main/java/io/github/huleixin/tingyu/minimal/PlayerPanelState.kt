package io.github.huleixin.tingyu.minimal

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import io.github.huleixin.tingyu.chrome.ClassicPlayerFrame
import io.github.huleixin.tingyu.chrome.SaltPlayerTimeline
import io.github.huleixin.tingyu.minimal.immersive.immersiveSettleSpec
import androidx.compose.runtime.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/PlayerPanelState.kt
/** One owner for style-specific motion; routing commits only at the mini-player endpoint. */
internal class PlayerPanelState(private val scope: CoroutineScope) {
    var progress by mutableFloatStateOf(1f); private set
    var dragging by mutableStateOf(false); private set
    var collapsePending by mutableStateOf(false); private set
    var initialized by mutableStateOf(false); private set
    var classicFrame by mutableStateOf<ClassicPlayerFrame?>(null); private set
    private var classic = false
    private var dragFrame: ClassicPlayerFrame? = null
    private var dragStart = 1f
    private var animation: Job? = null
    private var target = 1f
    private var cancelTarget = 1f
    private var dragRange = 1f

    fun useClassicMotion(value: Boolean) {
        if (classic == value) return
        animation?.cancel(); classic = value; dragFrame = null
        classicFrame = if (value && initialized) ClassicPlayerFrame.Expanded else null
        progress = 1f; dragging = false; collapsePending = false
    }
    fun open(reduced: Boolean, classicMotion: Boolean = classic) {
        animation?.cancel()
        classic = classicMotion
        initialized = true; dragging = false; dragFrame = null
        collapsePending = false; progress = 0f
        classicFrame = if (classic) ClassicPlayerFrame.Collapsed else null
        if (classic) animateClassic(true, reduced) else animate(1f, 0f, reduced)
    }
    fun adopt(value: Float) {
        if (!initialized) {
            initialized = true; progress = value; target = 1f
            classicFrame = if (classic) ClassicPlayerFrame.opening(value) else null
        }
    }
    fun beginDrag(cancelTo: Float? = null) {
        cancelTarget = cancelTo ?: target
        animation?.cancel(); collapsePending = false; dragging = true
        classicFrame?.let {
            // Catch the visual shell position, not the elapsed entry clock.
            progress = it.channels[0]; dragStart = progress; dragFrame = it
        }
    }
    fun dragBy(deltaY: Float, range: Float) {
        if (!dragging) beginDrag()
        dragRange = range.coerceAtLeast(1f)
        progress = (progress - deltaY / range.coerceAtLeast(1f)).coerceIn(0f, 1f)
        classicFrame = dragFrame?.dragged(dragStart, progress)
    }
    fun release(velocityY: Float, canceled: Boolean = false, reduced: Boolean = false) {
        dragging = false
        val end = if (canceled) cancelTarget else releaseTarget(progress, velocityY)
        animate(end, -velocityY / dragRange, reduced)
    }
    fun close(reduced: Boolean) {
        dragging = false; collapsePending = false
        if (classic) animateClassic(false, reduced) else animate(0f, 0f, reduced)
    }
    fun reset() {
        animation?.cancel(); dragging = false; collapsePending = false
        initialized = false; progress = 1f; target = 1f
        classicFrame = null; dragFrame = null
    }
    /**
     * Route exit finished. Hold the collapsed endpoint until [reset] runs, otherwise the
     * panel still reports progress 1 after the exit owner is cleared and the shell expands
     * back to full screen for the frames before the next route commit.
     */
    fun holdCollapsed() {
        animation?.cancel(); dragging = false; collapsePending = false
        progress = 0f; target = 0f; cancelTarget = 0f; dragFrame = null
        if (classic) classicFrame = ClassicPlayerFrame.Collapsed
    }
    fun consumeCollapse() { collapsePending = false }

    /** Clicks keep the recorded independent classic curves; gestures use the captured frame. */
    private fun animateClassic(opening: Boolean, reduced: Boolean) {
        animation?.cancel(); target = if (opening) 1f else 0f
        val start = classicFrame ?: ClassicPlayerFrame.Expanded
        animation = scope.launch {
            if (!reduced) {
                Animatable(0f).animateTo(1f, tween(
                    if (opening) SaltPlayerTimeline.EnterMs else SaltPlayerTimeline.ExitMs,
                    easing = LinearEasing)) {
                    val frame = if (opening) ClassicPlayerFrame.opening(value) else start.closing(value)
                    classicFrame = frame
                    progress = if (opening) value else frame.channels[0]
                }
            }
            progress = target
            classicFrame = if (opening) ClassicPlayerFrame.Expanded else ClassicPlayerFrame.Collapsed
            collapsePending = !opening
        }
    }

    private fun animate(end: Float, velocity: Float, reduced: Boolean) {
        animation?.cancel(); target = end
        val startProgress = progress
        val startFrame = classicFrame
        animation = scope.launch {
            if (!reduced) {
                // A late entry interruption may already have full bounds while fades are unfinished.
                if (startFrame != null && kotlin.math.abs(end - startProgress) < .0001f) {
                    val endFrame = if (end == 1f) ClassicPlayerFrame.Expanded else ClassicPlayerFrame.Collapsed
                    Animatable(0f).animateTo(1f, tween(180)) {
                        classicFrame = startFrame.blend(endFrame, value)
                    }
                } else {
                    val clock = Animatable(progress)
                    clock.animateTo(end, immersiveSettleSpec(), initialVelocity = velocity) {
                        progress = value.coerceIn(0f, 1f)
                        classicFrame = startFrame?.dragged(startProgress, progress)
                    }
                }
            }
            progress = end
            if (startFrame != null) classicFrame = if (end == 1f) ClassicPlayerFrame.Expanded else ClassicPlayerFrame.Collapsed
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
