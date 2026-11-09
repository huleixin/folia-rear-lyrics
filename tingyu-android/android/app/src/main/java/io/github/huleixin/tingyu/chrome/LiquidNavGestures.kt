package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.input.pointer.util.VelocityTracker
import kotlin.math.abs

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/LiquidNavGestures.kt
// Initial-pass observation leaves ordinary Tab.clickable taps alone. Only a drag that
// starts inside the moving capsule consumes movement/up, cancelling the child's click.
internal fun Modifier.liquidNavGestures(
    motion: LiquidNavMotion, vertical: Boolean, extent: Float, disabled: Boolean, reduced: Boolean,
    selected: () -> Int, action: (String, Double) -> Unit,
) = pointerInput(motion, vertical, extent, disabled, reduced) {
    if (disabled || extent <= 0f) return@pointerInput
    fun axis(point: Offset) = if (vertical) point.y else point.x
    fun point(offset: Offset) = Offset(offset.x / size.width.coerceAtLeast(1), offset.y / size.height.coerceAtLeast(1))
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
        val origin = motion.value
        val eligible = axis(down.position) / extent in origin..(origin + 1f)
        val tracker = VelocityTracker(); tracker.addPosition(down.uptimeMillis, down.position)
        var total = 0f; var drag = false; var completed = false
        motion.press(point(down.position), reduced); action("interactionStart", 0.0)
        try {
            while (true) {
                val event = awaitPointerEvent(PointerEventPass.Initial)
                val change = event.changes.firstOrNull { it.id == down.id } ?: break
                if (drag && !motion.dragging) break // an external route update has taken ownership
                motion.movePointer(point(change.position))
                tracker.addPosition(change.uptimeMillis, change.position)
                total += axis(change.positionChange())
                if (!drag && eligible && change.pressed && abs(total) > viewConfiguration.touchSlop && !change.isConsumed) {
                    drag = true; motion.startDrag()
                }
                if (drag) {
                    change.consume()
                    val speed = tracker.calculateVelocity().let { if (vertical) it.y else it.x } / extent
                    motion.dragTo(origin + total / extent, speed)
                }
                if (!change.pressed) {
                    if (drag) { val target = motion.nearest(); motion.select(target, reduced); action("navigate", target.toDouble()) }
                    completed = true; break
                }
                if (change.isConsumed && !drag) break
            }
        } finally {
            if (drag && !completed) motion.cancel(selected(), reduced)
            motion.release(reduced); action("interactionEnd", 0.0)
        }
    }
}
