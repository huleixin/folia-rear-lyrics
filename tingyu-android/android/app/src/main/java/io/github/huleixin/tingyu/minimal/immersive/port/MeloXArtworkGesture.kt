package io.github.huleixin.tingyu.minimal.immersive.port

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.ui.input.pointer.PointerInputScope
import kotlin.math.abs

// SPDX-License-Identifier: GPL-3.0-only
// Adapted from MeloX Android 0.7.3, MeloXIOSNowPlayingSharedHost.kt.
// Tingyu locks the initial drag direction and releases without a track action on cancellation.

internal suspend fun PointerInputScope.meloXArtworkGestures(
    enabled: () -> Boolean, swipeEnabled: Boolean, thresholdPx: Float, maxDragPx: Float,
    onDragDelta: (Float) -> Unit, onRelease: (Float) -> Unit,
    onDoubleTap: () -> Unit, onTap: (() -> Unit)?,
) {
    var lastTapUptime = 0L
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false)
        if (!enabled() || down.isConsumed) return@awaitEachGesture
        var dx = 0f
        var dy = 0f
        var direction = 0 // 0 undecided, 1 horizontal, 2 vertical/claimed by another recognizer.
        var completed = false
        try {
            while (true) {
                val event = awaitPointerEvent()
                val change = event.changes.firstOrNull { it.id == down.id } ?: break
                if (change.isConsumed || event.changes.count { it.pressed } > 1 || !enabled()) break
                if (!change.pressed) {
                    completed = true
                    if (direction == 1) {
                        change.consume()
                        onRelease(if (abs(dx) >= thresholdPx) dx else 0f)
                    } else if (direction == 0 && abs(dx) <= viewConfiguration.touchSlop && abs(dy) <= viewConfiguration.touchSlop) {
                        if (onTap != null) { change.consume(); onTap() }
                        else if (change.uptimeMillis - lastTapUptime in 1..320) {
                            lastTapUptime = 0L
                            change.consume()
                            onDoubleTap()
                        } else lastTapUptime = change.uptimeMillis
                    }
                    break
                }
                val delta = change.position - change.previousPosition
                dx += delta.x
                dy += delta.y
                if (direction == 0 && maxOf(abs(dx), abs(dy)) > viewConfiguration.touchSlop) {
                    direction = if (swipeEnabled && abs(dx) > abs(dy)) 1 else 2
                    lastTapUptime = 0L
                }
                if (direction == 1) {
                    change.consume()
                    if (abs(dx) <= maxDragPx || dx * delta.x < 0f) onDragDelta(delta.x)
                }
            }
        } finally {
            if (!completed && direction == 1) onRelease(0f)
        }
    }
}
