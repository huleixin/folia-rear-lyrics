package io.github.huleixin.tingyu.chrome

import io.github.huleixin.tingyu.minimal.MinimalPlayerState
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/PlayerHostPresentation.kt
/** Only these discrete facts affect the shell. Clocks, lyrics and artwork stay at player leaves. */
internal data class PlayerHostPresentation(
    val stageMotionDetour: Boolean = false,
    val stageMotionToken: Long = 0L,
    val mode: String = "off",
    val playing: Boolean = false,
)

internal fun MinimalPlayerState.hostPresentation() = PlayerHostPresentation(
    controls.stageMotionDetour, controls.stageMotionToken, controls.mode, playback.playing,
)

internal fun Flow<MinimalPlayerState>.hostPresentations(): Flow<PlayerHostPresentation> =
    map { it.hostPresentation() }.distinctUntilChanged()
