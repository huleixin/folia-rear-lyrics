package io.github.huleixin.tingyu.minimal.immersive

import android.graphics.Bitmap
import android.os.SystemClock
import androidx.compose.runtime.*
import io.github.huleixin.tingyu.minimal.*
import io.github.huleixin.tingyu.minimal.immersive.port.*

// Read-only visual projection. No player, loader, clock anchor or queue is created here.

class MeloXPlaybackUiState(
    val playback: MinimalPlayback,
    val lyrics: LyricsDocument?,
    val lyricsLoading: Boolean,
    val artworkBitmap: Bitmap?,
    private val seek: (Long) -> Unit,
    val controls: MinimalControls = MinimalControls(),
    val commands: MinimalPlayerCommands? = null,
    val queue: MinimalQueue = MinimalQueue(),
    val queueCommands: MinimalPlayerCommands? = commands,
    private val systemVolume: ImmersiveSystemVolume? = null,
) {
    val mediaId: String get() = playback.track.key
    val title: String get() = playback.track.title
    val artist: String get() = playback.track.artist
    val artworkUrl: String get() = playback.track.artwork
    val durationMs: Long get() = playback.track.durationMs
    val positionMs: Long get() = playback.anchorPositionMs
    val isPlaying: Boolean get() = playback.playing && !playback.buffering
    val hasPrevious: Boolean get() = controls.canPrevious
    val liked: Boolean get() = controls.liked
    val qualityLabel: String get() = controls.qualityLabelOverride.ifBlank { controls.quality }
    val volumeAvailable: Boolean get() = systemVolume?.available == true
    val volume: Float get() = systemVolume?.value ?: 0f
    fun previous() { commands?.previous() }
    fun next() { commands?.next() }
    fun togglePlayPause() { commands?.toggle() }
    fun like() { if (!controls.likeDisabled) commands?.like() }
    fun openStage() { commands?.openStage() }
    fun beginVolumeDrag() { systemVolume?.dragging = true }
    fun endVolumeDrag() { systemVolume?.dragging = false }
    fun changeVolume(value: Float) { systemVolume?.set(value) }
    fun syncSystemVolumeNow(): Boolean = systemVolume?.sync() ?: false
    fun syncSystemVolume() { systemVolume?.sync() }
    fun positionAtNow(): Long = playback.positionMsAt(SystemClock.elapsedRealtime())
    fun seekTo(timeMs: Long) = seek(timeMs.coerceIn(0L, durationMs.coerceAtLeast(0L)))
}

/** Retain authored timing only. The line projection folds an untimed line into one word. */
fun MinimalLyrics.toImmersiveDocument(expectedKey: String, expectedEpoch: String): LyricsDocument? {
    if (songKey != expectedKey || epoch != expectedEpoch || !ready) return null
    val precise = wordByWord
    val mapped = lines.mapNotNull { line ->
        if (!line.startSec.isFinite() || !line.endSec.isFinite()) return@mapNotNull null
        val syllables = if (!precise) emptyList() else line.words.mapNotNull { word ->
            if (!word.startSec.isFinite() || !word.endSec.isFinite() || word.endSec.coerceAtLeast(0.0) <= word.startSec.coerceAtLeast(0.0)) null
            else LyricSyllable(word.text, (word.startSec.coerceAtLeast(0.0) * 1000).toLong(), (word.endSec.coerceAtLeast(0.0) * 1000).toLong())
        }
        val start = (line.startSec.coerceAtLeast(0.0) * 1000).toLong()
        val end = (line.endSec.coerceAtLeast(0.0) * 1000).toLong().coerceAtLeast(start)
        LyricLine(
            timeMs = start,
            durationMs = end - start,
            text = line.text, translation = line.translation, syllables = syllables,
            timingKind = if (syllables.isEmpty()) LyricTimingKind.LineSynchronized else LyricTimingKind.Precise,
        )
    }.sortedBy { it.timeMs }
    return LyricsDocument(
        lines = mapped,
        quality = if (mapped.any { it.syllables.isNotEmpty() }) LyricQuality.WordSynchronized else LyricQuality.LineSynchronized,
        pseudoTimingAllowed = false,
        isUnsynchronized = mapped.isNotEmpty() && mapped.all { it.timeMs == 0L && it.syllables.isEmpty() },
    )
}
