package io.github.huleixin.tingyu.chrome

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.runtime.*
import androidx.compose.ui.geometry.Offset
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.roundToInt

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/LiquidNavMotion.kt
// Adapted from Kyant0/AndroidLiquidGlass DampedDragAnimation (Apache-2.0).
// Copyright (c) Kyant0. Changes: one retargetable motion, actual spring velocity for clicks,
// direct finger tracking, bounded deformation, and no job/VelocityTracker allocation per frame.
internal class LiquidNavMotion(private val scope: CoroutineScope, initial: Int) {
    private val position = Animatable(initial.coerceIn(0, 3).toFloat(), .001f)
    private val pressure = Animatable(0f, .001f)
    private val horizontalScale = Animatable(1f, .001f)
    private val verticalScale = Animatable(1f, .001f)
    private var motionJob: Job? = null
    private var feedbackJob: Job? = null
    private var fingerValue by mutableFloatStateOf(position.value)
    private var fingerVelocity by mutableFloatStateOf(0f)
    var dragging by mutableStateOf(false); private set
    var pressed by mutableStateOf(false); private set
    var targetIndex by mutableIntStateOf(initial.coerceIn(0, 3)); private set
    var pointer by mutableStateOf<Offset?>(null); private set
    val value get() = if (dragging) fingerValue else position.value.coerceIn(-.06f, 3.06f)
    val velocity get() = if (dragging) fingerVelocity else position.velocity
    val pressProgress get() = pressure.value.coerceIn(0f, 1f)
    val energy get() = (abs(velocity) / 10f).coerceIn(0f, 1f)
    val opticalProgress get() = (pressProgress + energy * .25f).coerceAtMost(1.25f)
    val scaleX get() = horizontalScale.value / (1f - .75f * (abs(velocity) / 10f).coerceIn(0f, .2f))
    val scaleY get() = verticalScale.value * (1f - .5f * (abs(velocity) / 10f).coerceIn(0f, .2f))

    private fun feedback(down: Boolean, reduced: Boolean) {
        feedbackJob?.cancel()
        feedbackJob = scope.launch {
            val progress = if (down && !reduced) 1f else 0f
            launch { if (reduced) pressure.snapTo(0f) else pressure.animateTo(progress, spring(1f, 1000f, .001f)) }
            launch { if (reduced) horizontalScale.snapTo(1f) else horizontalScale.animateTo(1f + .055f * progress, spring(.6f, 250f, .001f)) }
            launch { if (reduced) verticalScale.snapTo(1f) else verticalScale.animateTo(1f + .055f * progress, spring(.7f, 250f, .001f)) }
        }
    }
    fun movePointer(point: Offset) { pointer = point }
    fun press(point: Offset, reduced: Boolean) { pressed = true; pointer = point; feedback(true, reduced) }
    fun release(reduced: Boolean) { pressed = false; if (motionJob?.isActive != true) feedback(false, reduced) }
    fun startDrag() {
        val current = value
        motionJob?.cancel(); fingerValue = current; fingerVelocity = 0f; dragging = true
    }
    fun dragTo(value: Float, velocity: Float) { fingerValue = value.coerceIn(0f, 3f); fingerVelocity = velocity.coerceIn(-12f, 12f) }
    fun nearest() = value.roundToInt().coerceIn(0, 3)

    /** Cancel only the previous destination, preserving its current pose AND momentum. */
    fun select(index: Int, reduced: Boolean, force: Boolean = false) {
        val next = index.coerceIn(0, 3)
        if (!force && !dragging && targetIndex == next && (motionJob?.isActive == true || abs(value - next) < .001f)) return
        val start = value; val speed = velocity
        targetIndex = next; motionJob?.cancel()
        motionJob = scope.launch {
            if (dragging) { position.snapTo(start); dragging = false }
            if (reduced) position.snapTo(next.toFloat())
            else {
                feedback(true, false)
                position.animateTo(next.toFloat(), spring(.78f, 600f, .001f), initialVelocity = speed)
            }
            if (!pressed) feedback(false, reduced)
        }
    }
    fun cancel(index: Int, reduced: Boolean) { pressed = false; select(index, reduced, force = true) }
}
