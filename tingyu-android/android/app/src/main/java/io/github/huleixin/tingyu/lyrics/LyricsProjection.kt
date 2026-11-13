package io.github.huleixin.tingyu.lyrics

import android.os.SystemClock
import io.github.huleixin.tingyu.minimal.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlin.math.ceil

// Shared line projection: consumes the existing runtime and clock; never parses or fetches lyrics.
data class LyricsProjection(val state: MinimalPlayerState = MinimalPlayerState(), val index: Int = -1) {
    val valid: Boolean get() = state.playback.track.present && state.lyrics.songKey == songKey && state.lyrics.epoch == epoch && state.lyrics.ready
    fun lineAt(index: Int): MinimalLyricLine? = if (valid) state.lyrics.lines.getOrNull(index) else null
    val line: MinimalLyricLine? get() = lineAt(index)
    val next: MinimalLyricLine? get() = lineAt(index + 1)
    val songKey: String get() = state.playback.track.key
    val epoch: String get() = state.playback.epoch

    companion object {
        fun at(state: MinimalPlayerState, now: Long): LyricsProjection {
            val valid = state.playback.track.present && state.lyrics.songKey == state.playback.track.key &&
                state.lyrics.epoch == state.playback.epoch && state.lyrics.status == MinimalLyricsStatus.READY
            return LyricsProjection(state, if (valid) state.lyrics.activeIndex(state.playback.lyricSecAt(now)) else -1)
        }

        /** Wake only at the next line boundary, respecting speed and the compatible clock freeze cap. */
        fun nextDelay(state: MinimalPlayerState, now: Long): Long? {
            if (!LyricsProjection(state).valid) return null
            val playback = state.playback
            if (!playback.playing || playback.buffering || playback.playbackRate <= 0f) return null
            val cap = playback.maxExtrapolationMs
            val elapsed = (now - playback.anchorElapsedMs).coerceAtLeast(0)
            if (elapsed >= cap) return null
            val time = playback.lyricSecAt(now)
            val start = state.lyrics.lines.firstOrNull { it.startSec > time }?.startSec ?: return null
            val delay = ceil((start - time) * 1000 / playback.playbackRate).toLong().coerceAtLeast(1)
            if (delay > cap - elapsed) return null
            if (playback.track.durationMs > 0 && start * 1000 > playback.track.durationMs) return null
            return delay
        }
    }
}

/** One event-driven boundary job shared by desktop and Bluetooth consumers in the playback service. */
class LyricsProjectionSource(private val runtime: MinimalPlayerRuntime) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val mutable = MutableStateFlow(LyricsProjection())
    val state: StateFlow<LyricsProjection> = mutable.asStateFlow()
    private var boundary: Job? = null

    init {
        runtime.start()
        scope.launch { runtime.state.collect { refresh(it) } }
    }

    private fun refresh(value: MinimalPlayerState) {
        boundary?.cancel()
        val now = SystemClock.elapsedRealtime()
        mutable.value = LyricsProjection.at(value, now)
        LyricsProjection.nextDelay(value, now)?.let { wait ->
            boundary = scope.launch { delay(wait); refresh(runtime.state.value) }
        }
    }

    fun close() { scope.cancel() }
}
