package io.github.huleixin.tingyu.minimal.immersive.port
import androidx.compose.runtime.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

// SPDX-License-Identifier: GPL-3.0-only
// Adapted from lladlam/MeloX-Android 0.7.3, c04f36b9af540806b3bb185b347572e9ca12d87d.
// Tingyu modifications: existing playback/lyrics/artwork adapters; no provider or service migration.


// Tingyu adds collapse/favorite touch targets; header and shared artwork use one height.
internal val ImmersiveTopBarHeight = 44.dp

enum class MeloXLyricsRenderingQuality { Low, Balanced, High }
enum class MeloXLyricAnnotationDisplayMode { FocusedLine, AllLines }
enum class MeloXLyricsGroupingMode { Word, Character }
enum class MeloXLyricsFontWeight(val composeWeight: FontWeight) { Heavy(FontWeight.ExtraBold) }
internal object MeloXSettingsRuntime {
    var artworkMotionEnabled by mutableStateOf(true)
    var artworkTapLyrics by mutableStateOf(true)
    var artworkSwipeTracks by mutableStateOf(true)
    var lyricInterfaceAutoHideDelayMs by mutableStateOf(5_000)
    var flowingLightBrightness by mutableStateOf(1f)
    var flowingLightMixBoostEnabled by mutableStateOf(false)
    var flowingLightSaturation by mutableStateOf(1f)
    var flowingLightSpeed by mutableStateOf(1f)
    var hapticFeedbackEnabled by mutableStateOf(true)
    var lyricAutoFollowEnabled by mutableStateOf(true)
    var lyricBackgroundFrameRate by mutableStateOf(24)
    var lyricBlurStrength by mutableStateOf(1f)
    var lyricCascadeBounce by mutableStateOf(.26f)
    var lyricCascadeBounceEnabled by mutableStateOf(true)
    var lyricCascadeBounceGradient by mutableStateOf(.85f)
    var lyricCascadeCatchUpRatio by mutableStateOf(.97f)
    var lyricCascadeChaseSpeedGradient by mutableStateOf(.70f)
    var lyricCascadeDelayIncreaseMs by mutableStateOf(5f)
    var lyricCascadeDelayMs by mutableStateOf(21f)
    var lyricCascadeDurationMs by mutableStateOf(740f)
    var lyricCascadeFollowingDelayMs by mutableStateOf(30f)
    var lyricDimAmount by mutableStateOf(1f)
    var lyricDistanceBlurScale by mutableStateOf(1.05f)
    var lyricFocusColorLeadMs by mutableStateOf(0)
    var lyricFocusPosition by mutableStateOf(.25f)
    var lyricFocusScale by mutableStateOf(1.02f)
    var lyricFollowDelayMs by mutableStateOf(3_000)
    var lyricFontScale by mutableStateOf(1f)
    var lyricFontWeight by mutableStateOf(MeloXLyricsFontWeight.Heavy)
    var lyricGlowEnabled by mutableStateOf(true)
    var lyricGlowLongTonesOnly by mutableStateOf(true)
    var lyricGlowStrength by mutableStateOf(1f)
    var lyricHiddenInterfaceBlurScale by mutableStateOf(.85f)
    var lyricHighlightGradientReduction by mutableStateOf(.65f)
    var lyricHighlightGradientWidth by mutableStateOf(.7f)
    var lyricInactiveOpacity by mutableStateOf(.42f)
    var lyricInterludeCountdownEnabled by mutableStateOf(true)
    var lyricLiftMode by mutableStateOf(MeloXLyricsGroupingMode.Character)
    var lyricLongPressShareEnabled by mutableStateOf(true)
    var lyricLongToneDetectionMode by mutableStateOf(MeloXLyricsGroupingMode.Character)
    var lyricLongToneStrength by mutableStateOf(1f)
    var lyricLongToneThresholdMs by mutableStateOf(950)
    var lyricReduceMotion by mutableStateOf(false)
    var lyricRefreshRate by mutableStateOf(60)
    var lyricRenderingQuality by mutableStateOf(MeloXLyricsRenderingQuality.High)
    var lyricRomanizationDisplayMode by mutableStateOf(MeloXLyricAnnotationDisplayMode.FocusedLine)
    var lyricRomanizationFontScale by mutableStateOf(.65f)
    var lyricRomanizationOpacity by mutableStateOf(.9f)
    var lyricScaleBounce by mutableStateOf(.32f)
    var lyricScaleBounceDurationMs by mutableStateOf(580)
    var lyricScaleBounceEnabled by mutableStateOf(true)
    var lyricScrollHideThresholdDp by mutableStateOf(200)
    var lyricSnapThresholdMs by mutableStateOf(260f)
    var lyricSpacingScale by mutableStateOf(1f)
    var lyricTapSeekEnabled by mutableStateOf(true)
    var lyricTranslationFontScale by mutableStateOf(.65f)
    var lyricTranslationOpacity by mutableStateOf(.9f)
    var lyricWordBounceEnabled by mutableStateOf(false)
    var lyricWordByWordEnabled by mutableStateOf(true)
    var reduceMotion by mutableStateOf(false)
    var showLyricRomanization by mutableStateOf(true)
    var showLyricTranslation by mutableStateOf(true)
}
