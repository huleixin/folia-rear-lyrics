package io.github.huleixin.tingyu.minimal.immersive.port

import java.text.Normalizer

// SPDX-License-Identifier: GPL-3.0-only
// Adapted from lladlam/MeloX-Android 0.7.3, c04f36b9af540806b3bb185b347572e9ca12d87d.
// Tingyu modifications: existing playback/lyrics/artwork adapters; no provider or service migration.


/** Aligns supplied readings using kana anchors; never invents readings for individual kanji. */
internal object JapaneseRubyAlignment {
    data class Part(val original: String, val reading: String?)
    private val kana = buildMap<String, List<String>> {
        fun row(characters: String, sounds: String) = characters.map(Char::toString).zip(sounds.split(' ')).forEach { (c, sound) -> put(c, listOf(sound)) }
        row("あいうえお", "a i u e o")
        row("かきくけこ", "ka ki ku ke ko"); row("がぎぐげご", "ga gi gu ge go")
        row("さしすせそ", "sa shi su se so"); row("ざじずぜぞ", "za ji zu ze zo")
        row("たちつてと", "ta chi tsu te to"); row("だぢづでど", "da ji zu de do")
        row("なにぬねの", "na ni nu ne no"); row("はひふへほ", "ha hi fu he ho")
        row("ばびぶべぼ", "ba bi bu be bo"); row("ぱぴぷぺぽ", "pa pi pu pe po")
        row("まみむめも", "ma mi mu me mo"); row("やゆよ", "ya yu yo")
        row("らりるれろ", "ra ri ru re ro"); row("わをんゔ", "wa wo n vu")
        put("し", listOf("shi", "si")); put("ち", listOf("chi", "ti")); put("つ", listOf("tsu", "tu"))
        put("じ", listOf("ji", "zi")); put("ふ", listOf("fu", "hu"))
        put("は", listOf("ha", "wa")); put("へ", listOf("he", "e")); put("を", listOf("wo", "o"))
        put("ん", listOf("n", "m"))
        for ((base, prefix) in listOf("き" to "ky", "ぎ" to "gy", "し" to "sh", "じ" to "j", "ち" to "ch",
            "に" to "ny", "ひ" to "hy", "び" to "by", "ぴ" to "py", "み" to "my", "り" to "ry")) {
            listOf("ゃ" to "a", "ゅ" to "u", "ょ" to "o").forEach { (small, vowel) -> put(base + small, listOf(prefix + vowel)) }
        }
        listOf("ぁ" to "a", "ぃ" to "i", "ぅ" to "u", "ぇ" to "e", "ぉ" to "o").forEach { (small, vowel) ->
            put(small, listOf(vowel))
            listOf("ふ" to "f", "ゔ" to "v", "て" to "t", "で" to "d", "つ" to "ts").forEach { (base, prefix) ->
                put(base + small, listOf(prefix + vowel))
            }
        }
    }
    fun align(text: String, reading: String): List<Part>? {
        if (text.length > 256 || reading.length > 1024 || text.none { it in '\u3040'..'\u30ff' }) return null
        // Keep source offsets so apostrophes/spaces in a reading do not shift subsequent annotations.
        val letters = reading.indices.filter { reading[it].lowercaseChar() in 'a'..'z' }
        val compact = letters.joinToString("") { reading[it].lowercaseChar().toString() }
        if (compact.isEmpty() || reading.any { it.isLetter() && it.lowercaseChar() !in 'a'..'z' }) return null
        val originals = mutableListOf<String>()
        var at = 0
        while (at < text.length) {
            val cp = text.codePointAt(at)
            val char = String(Character.toChars(cp))
            when {
                Character.UnicodeScript.of(cp) == Character.UnicodeScript.HAN -> {
                    if (originals.lastOrNull()?.codePoints()?.allMatch { Character.UnicodeScript.of(it) == Character.UnicodeScript.HAN } == true)
                        originals[originals.lastIndex] += char
                    else originals += char
                }
                char.length == 1 && char[0] in "ゃゅょぁぃぅぇぉャュョァィゥェォ\u3099\u309a" -> {
                    if (originals.isEmpty()) originals += char else originals[originals.lastIndex] += char
                }
                else -> originals += char
            }
            at += Character.charCount(cp)
        }
        fun normalized(value: String) = Normalizer.normalize(value, Normalizer.Form.NFKC).map {
            if (it in 'ァ'..'ヶ') (it.code - 0x60).toChar() else it
        }.joinToString("")
        val memo = mutableMapOf<Pair<Int, Int>, List<Int>?>()
        fun solve(index: Int, offset: Int): List<Int>? {
            if (index == originals.size) return if (offset == compact.length) emptyList() else null
            val key = index to offset
            if (memo.containsKey(key)) return memo[key]
            if (memo.size > 4096) return null
            val original = originals[index]
            val value = normalized(original)
            val choices: List<Int> = when {
                value == "っ" -> if (offset + 1 < compact.length && compact[offset] !in "aeioun" &&
                    (compact[offset] == compact[offset + 1] || compact.startsWith("tch", offset))) listOf(1) else emptyList()
                value == "ー" -> if (offset > 0 && offset < compact.length && compact[offset] in "aeiou") listOf(1) else emptyList()
                value in kana -> kana.getValue(value).filter { compact.startsWith(it, offset) }.map(String::length)
                original.codePoints().allMatch { Character.UnicodeScript.of(it) == Character.UnicodeScript.HAN } ->
                    (1..minOf(48, compact.length - offset)).toList()
                original.all { it.isWhitespace() || !it.isLetterOrDigit() } -> listOf(0)
                else -> emptyList()
            }
            for (length in choices) {
                val rest = solve(index + 1, offset + length)
                if (rest != null) return (listOf(length) + rest).also { memo[key] = it }
            }
            memo[key] = null
            return null
        }
        val lengths = solve(0, 0) ?: return null
        var offset = 0
        return originals.zip(lengths) { original, length ->
            val ruby = if (length == 0) null else reading.substring(letters[offset], letters[offset + length - 1] + 1).trim()
            offset += length
            Part(original, ruby)
        }
    }
}
