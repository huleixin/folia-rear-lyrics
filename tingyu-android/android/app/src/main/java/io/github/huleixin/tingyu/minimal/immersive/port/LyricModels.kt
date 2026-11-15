package io.github.huleixin.tingyu.minimal.immersive.port

import java.text.BreakIterator
import java.util.Locale

// SPDX-License-Identifier: GPL-3.0-only
// Adapted from lladlam/MeloX-Android 0.7.3, c04f36b9af540806b3bb185b347572e9ca12d87d.
// Tingyu modifications: existing playback/lyrics/artwork adapters; no provider or service migration.


data class LyricSyllable(
    val text: String,
    val startTimeMs: Long,
    val endTimeMs: Long,
)

/** Authored word timing and LRC-inferred display durations must not be conflated. */
enum class LyricTimingKind { Precise, LineSynchronized }

enum class LyricHighlightStrategy {
    /**
     * The active line is the one whose start time has passed. This matches most
     * line-level renderers and is the historical default.
     */
    LineStart,

    /**
     * The active line only changes once its first authored syllable has started.
     * Providers that return a lead-in marker before the first word (common in
     * YRC/QRC/TTML) therefore keep the previous line highlighted until the vocal
     * actually begins.
     */
    FirstSyllableOrLineStart,
}

data class LyricAgent(
    val id: String,
    val name: String,
    val alignment: LyricAgentAlignment = LyricAgentAlignment.Normal,
)

enum class LyricAgentAlignment { Normal, Flipped }

data class LyricAccompaniment(
    val timeMs: Long,
    val durationMs: Long? = null,
    val text: String,
    val syllables: List<LyricSyllable> = emptyList(),
    val translation: String? = null,
    val romanization: String? = null,
    val agent: LyricAgent? = null,
    val timingKind: LyricTimingKind = LyricTimingKind.Precise,
)

enum class LyricSource { Netease, QQMusic, Kugou, AppleMusic, AmlL, Local }

enum class LyricQuality { Fallback, LineSynchronized, WordSynchronized, Authored }

data class LyricLine(
    val timeMs: Long,
    val durationMs: Long? = null,
    val text: String,
    val syllables: List<LyricSyllable> = emptyList(),
    val translation: String? = null,
    val adaptTranslation: Boolean = false,
    val romanization: String? = null,
    val romanizationSyllables: List<LyricSyllable> = emptyList(),
    val agent: LyricAgent? = null,
    val timingKind: LyricTimingKind = LyricTimingKind.Precise,
    val accompaniment: List<LyricAccompaniment> = emptyList(),
)

/** Paragraph/line markers can precede both voices; compare actual vocal onsets. */
internal fun LyricAccompaniment.precedesLead(line: LyricLine): Boolean {
    fun vocalStart(syllables: List<LyricSyllable>, fallback: Long): Long =
        syllables.asSequence()
            .filter { it.text.isNotBlank() && it.startTimeMs >= 0L && it.endTimeMs > it.startTimeMs }
            .minOfOrNull { it.startTimeMs } ?: fallback

    return vocalStart(syllables, timeMs) < vocalStart(line.syllables, line.timeMs)
}

data class LyricsDocument(
    val lines: List<LyricLine>,
    val source: LyricSource = LyricSource.Local,
    val quality: LyricQuality = LyricQuality.Fallback,
    /** Whether line-timed lyrics may be expanded into synthetic per-grapheme timing. */
    val pseudoTimingAllowed: Boolean = false,
    /** Local model provenance; generated upgrades may finish after the AMLL early-update window. */
    val autoSyncModelKey: String? = null,
    /** Plain lyric text has no playback clock; render it as a manually scrollable document. */
    val isUnsynchronized: Boolean = false,
) {
    fun highlightedIndex(positionMs: Long, strategy: LyricHighlightStrategy = LyricHighlightStrategy.LineStart): Int? {
        if (isUnsynchronized || lines.isEmpty()) return null
        var low = 0
        var high = lines.size
        while (low < high) {
            val mid = (low + high) ushr 1
            if (lines[mid].timeMs <= positionMs) {
                low = mid + 1
            } else {
                high = mid
            }
        }
        val index = (low - 1).takeIf { it >= 0 } ?: return null
        if (strategy != LyricHighlightStrategy.FirstSyllableOrLineStart || index == 0) return index
        val line = lines[index]
        val firstSyllable = line.syllables.firstOrNull()
            ?: line.romanizationSyllables.firstOrNull()
        val vocalStart = firstSyllable?.startTimeMs?.takeIf { it >= 0L } ?: line.timeMs
        return if (positionMs >= vocalStart) index else (index - 1).coerceAtLeast(0)
    }
}
