package io.github.huleixin.tingyu.minimal.immersive.port

import java.text.BreakIterator
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

// SPDX-License-Identifier: GPL-3.0-only
// Adapted from lladlam/MeloX-Android 0.7.3, c04f36b9af540806b3bb185b347572e9ca12d87d.
// Tingyu modifications: existing playback/lyrics/artwork adapters; no provider or service migration.


data class LyricRubyUnit(
    val originalText: String,
    val originalSyllables: List<LyricSyllable>,
    val romanizationText: String?,
)

/** Aligns NetEase yromalrc/romalrc fragments with the primary timed lyric. */
object LyricRomanizationAligner {
    fun units(line: LyricLine): List<LyricRubyUnit> {
        val romanization = line.romanization?.trim().orEmpty()
        if (romanization.isBlank()) return emptyList()

        timedUnits(line)?.let { return it.flatMap(::splitJapanese) }

        val japanese = splitJapanese(LyricRubyUnit(line.text, line.syllables, romanization))
        if (japanese.size > 1) return japanese

        val tokens = romanization.split(Regex("\\s+")).filter(String::isNotBlank)
        if (tokens.isNotEmpty() && line.syllables.size == tokens.size) {
            return line.syllables.zip(tokens) { syllable, token ->
                LyricRubyUnit(syllable.text, listOf(syllable), token)
            }
        }

        val graphemes = graphemes(line.text)
        val phonetic = graphemes.filterNot(String::isBlank)
        if (tokens.isNotEmpty() && phonetic.size == tokens.size) {
            var tokenIndex = 0
            return graphemes.map { original ->
                if (original.isBlank()) LyricRubyUnit(original, emptyList(), null)
                else LyricRubyUnit(original, emptyList(), tokens[tokenIndex++])
            }
        }

        return listOf(LyricRubyUnit(line.text, line.syllables, romanization))
    }

    private fun splitJapanese(unit: LyricRubyUnit): List<LyricRubyUnit> {
        val parts = JapaneseRubyAlignment.align(unit.originalText, unit.romanizationText.orEmpty()) ?: return listOf(unit)
        if (unit.originalSyllables.isNotEmpty() && unit.originalSyllables.joinToString("") { it.text } != unit.originalText) return listOf(unit)
        var offset = 0
        return parts.map { part ->
            val start = offset; offset += part.original.length
            var syllableOffset = 0
            val syllables = unit.originalSyllables.mapNotNull { syllable ->
                val from = max(start, syllableOffset)
                val to = min(offset, syllableOffset + syllable.text.length)
                val originalOffset = syllableOffset
                syllableOffset += syllable.text.length
                if (from < to) syllable.copy(text = syllable.text.substring(from - originalOffset, to - originalOffset)) else null
            }
            LyricRubyUnit(part.original, syllables, part.reading)
        }
    }

    private fun timedUnits(line: LyricLine): List<LyricRubyUnit>? {
        val originals = line.syllables.filter { it.text.isNotEmpty() }
        val romanized = line.romanizationSyllables.filter { it.text.isNotBlank() }
        if (originals.isEmpty() || romanized.isEmpty()) return null

        if (originals.size == romanized.size) {
            return originals.zip(romanized) { original, ruby ->
                LyricRubyUnit(original.text, listOf(original), ruby.text.trim())
            }
        }

        val groups = linkedMapOf<Int, MutableList<LyricSyllable>>()
        originals.forEach { original ->
            val match = romanized.indices.minByOrNull { temporalDistance(original, romanized[it]) }
                ?: return@forEach
            groups.getOrPut(match) { mutableListOf() }.add(original)
        }
        val indices = groups.keys.toList()
        if (indices != indices.sorted() || indices.toSet() != romanized.indices.toSet()) return null
        return groups.map { (romanizationIndex, originalGroup) ->
            LyricRubyUnit(
                originalText = originalGroup.joinToString("") { it.text },
                originalSyllables = originalGroup,
                romanizationText = romanized[romanizationIndex].text.trim(),
            )
        }
    }

    private fun temporalDistance(left: LyricSyllable, right: LyricSyllable): Long {
        val overlap = min(left.endTimeMs, right.endTimeMs) - max(left.startTimeMs, right.startTimeMs)
        if (overlap >= 0L) {
            val leftMid = (left.startTimeMs + left.endTimeMs) / 2L
            val rightMid = (right.startTimeMs + right.endTimeMs) / 2L
            return abs(leftMid - rightMid) / 6L
        }
        return max(left.startTimeMs, right.startTimeMs) - min(left.endTimeMs, right.endTimeMs)
    }

    private fun graphemes(text: String): List<String> {
        val iterator = BreakIterator.getCharacterInstance(Locale.ROOT).apply { setText(text) }
        return buildList {
            var start = iterator.first()
            var end = iterator.next()
            while (end != BreakIterator.DONE) {
                add(text.substring(start, end))
                start = end
                end = iterator.next()
            }
        }
    }
}
