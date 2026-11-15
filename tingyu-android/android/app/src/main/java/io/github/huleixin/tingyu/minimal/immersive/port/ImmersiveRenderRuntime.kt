package io.github.huleixin.tingyu.minimal.immersive.port

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

// Visibility and motion hints belong to the one visible immersive surface, not the audio service.
internal object MeloXAppVisibility {
    var isForeground by mutableStateOf(false)
}

internal object MeloXUiMotionRuntime {
    var orientationTransition by mutableStateOf(false)
    var pageTransition by mutableStateOf(false)
    var anyPlayerMotion by mutableStateOf(false)
    var foregroundSettling by mutableStateOf(false)
}

/** Audio analysis is not supplied by Tingyu; retain the upstream constant-flow branch. */
internal data class FlowAnalysis(
    val isPlaying: Boolean,
    val hasAnalysis: Boolean = false,
    val energy: Float = 0f,
    val beat: Float = 0f,
)
