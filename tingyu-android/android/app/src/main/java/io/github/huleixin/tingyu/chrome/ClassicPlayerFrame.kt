package io.github.huleixin.tingyu.chrome

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/ClassicPlayerFrame.kt
/** Original classic channels and fades, kept separate from the immersive shell timeline. */
internal class ClassicPlayerFrame(
    val channels: FloatArray,
    val shell: Float, val decorations: Float, val mini: Float,
    val header: Float, val controls: Float, val lyrics: Float,
) {
    val expanded: Boolean get() = channels.all { it >= .9999f } && shell >= .9999f &&
        decorations >= .9999f && mini <= .0001f && header >= .9999f &&
        controls >= .9999f && lyrics >= .9999f
    fun section(role: String) = when (role) {
        "header" -> header; "controls" -> controls; else -> lyrics
    }

    /** Closing multiplies the captured frame, so interrupting entry does not jump. */
    fun closing(fraction: Float): ClassicPlayerFrame {
        val ms = fraction * SaltPlayerTimeline.ExitMs
        val path = SaltPlayerTimeline.sample(ms, true)
        return ClassicPlayerFrame(FloatArray(7) { channels[it] * path[it] },
            shell * (1f - ramp(ms, 140f, 380f)), decorations * (1f - ramp(ms, 0f, 100f)),
            mini + (1f - mini) * ramp(ms, 120f, 340f),
            header * (1f - ramp(ms, 0f, 150f)), controls * (1f - ramp(ms, 0f, 120f)),
            lyrics * (1f - ramp(ms, 0f, 150f)))
    }

    fun blend(to: ClassicPlayerFrame, fraction: Float): ClassicPlayerFrame {
        val p = fraction.coerceIn(0f, 1f)
        fun mix(a: Float, b: Float) = a + (b - a) * p
        return ClassicPlayerFrame(FloatArray(7) { mix(channels[it], to.channels[it]) },
            mix(shell, to.shell), mix(decorations, to.decorations), mix(mini, to.mini),
            mix(header, to.header), mix(controls, to.controls), mix(lyrics, to.lyrics))
    }

    /** Spatial drag starts at the actual shell top; all other channels retain their captured offsets. */
    fun dragged(startProgress: Float, progress: Float): ClassicPlayerFrame =
        if (progress < startProgress) blend(Collapsed, (startProgress - progress) / startProgress.coerceAtLeast(.0001f))
        else blend(Expanded, (progress - startProgress) / (1f - startProgress).coerceAtLeast(.0001f))

    companion object {
        val Collapsed get() = ClassicPlayerFrame(FloatArray(7), 0f, 0f, 1f, 0f, 0f, 0f)
        val Expanded get() = ClassicPlayerFrame(FloatArray(7) { 1f }, 1f, 1f, 0f, 1f, 1f, 1f)
        fun opening(fraction: Float): ClassicPlayerFrame {
            val ms = fraction * SaltPlayerTimeline.EnterMs
            return ClassicPlayerFrame(SaltPlayerTimeline.sample(ms), ramp(ms, 0f, 35f),
                ramp(ms, 600f, 980f), 1f - ramp(ms, 0f, 35f),
                ramp(ms, 75f, 190f), ramp(ms, 150f, 350f), ramp(ms, 100f, 240f))
        }
        private fun ramp(ms: Float, start: Float, end: Float): Float {
            val p = ((ms - start) / (end - start)).coerceIn(0f, 1f)
            return p * p * (3f - 2f * p)
        }
    }
}
