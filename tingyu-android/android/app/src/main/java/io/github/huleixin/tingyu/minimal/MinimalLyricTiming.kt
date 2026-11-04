package io.github.huleixin.tingyu.minimal

import java.text.BreakIterator

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/MinimalLyricTiming.kt
//
// 逐字时间：`utils/lyrics/graphemeTiming.ts` 的移植，只保留极简歌词页要用的部分。
//
// 规则与原实现一致：有逐字时间就按词内均分到字，没有就整行均分。区别只在于这里不处理
// 「词和整行文本对不上」的复杂对齐（原实现用序列搜索把标点补回词间），那种情况直接退回整行均分 ——
// 错的是高亮粒度，不是高亮位置，而且只发生在词标签不覆盖整行的异常数据上。

/** 一个字形簇及其在歌曲里的时间。 */
data class MinimalGrapheme(val text: String, val startSec: Double, val endSec: Double)

/** 一行的逐字时间轴。构建一次，之后每帧只做一次线性扫描。 */
class MinimalGraphemeTimeline(val graphemes: List<MinimalGrapheme>) {
    val text: String = graphemes.joinToString("") { it.text }
    val isEmpty: Boolean get() = graphemes.isEmpty()

    /**
     * 到 [atSec] 为止已经唱完的字数。
     *
     * 线性扫描而不是二分：一行只有几十个字，而且构建器只保证**良构**输入的时间不递减，
     * 扫描对异常数据同样正确。
     */
    fun sungCount(atSec: Double): Int {
        if (!atSec.isFinite()) return 0
        var sung = 0
        for (grapheme in graphemes) {
            if (grapheme.endSec > atSec) break
            sung++
        }
        return sung
    }

    /** 这一刻正在唱的那个字的进度 0..1，用于行末的细线（没有逐字时整行线性）。 */
    fun progress(atSec: Double): Float {
        if (graphemes.isEmpty()) return 0f
        val first = graphemes.first().startSec
        val last = graphemes.last().endSec
        if (atSec <= first) return 0f
        if (atSec >= last) return 1f
        return ((atSec - first) / (last - first)).toFloat().coerceIn(0f, 1f)
    }

    /**
     * 连续卡拉OK进度（第 17 轮）：已唱到的**字形位置**，浮点字数。
     * 一字之内按该字自身的 start/end 线性推进 —— 高亮从"一字一跳"变成连续渐入。
     * 时间基准与 [sungCount] 完全同源，不引入任何新的对时逻辑。
     */
    fun sungPosition(atSec: Double): Float {
        if (!atSec.isFinite() || graphemes.isEmpty()) return 0f
        for ((index, grapheme) in graphemes.withIndex()) {
            when {
                atSec < grapheme.startSec -> return index.toFloat()
                atSec < grapheme.endSec -> {
                    val span = (grapheme.endSec - grapheme.startSec).coerceAtLeast(1e-6)
                    return index + ((atSec - grapheme.startSec) / span).toFloat().coerceIn(0f, 1f)
                }
            }
        }
        return graphemes.size.toFloat()
    }

    companion object {
        val EMPTY = MinimalGraphemeTimeline(emptyList())
    }
}

private val graphemeBreaker: BreakIterator = BreakIterator.getCharacterInstance()

/** 按字形簇切分（CJK 逐字、emoji 不拆、组合符不拆）。 */
fun splitGraphemes(text: String): List<String> {
    if (text.isEmpty()) return emptyList()
    val out = ArrayList<String>(text.length)
    synchronized(graphemeBreaker) {
        graphemeBreaker.setText(text)
        var start = graphemeBreaker.first()
        var end = graphemeBreaker.next()
        while (end != BreakIterator.DONE) {
            out += text.substring(start, end)
            start = end
            end = graphemeBreaker.next()
        }
    }
    return out
}

private fun evenTimings(text: String, startSec: Double, endSec: Double): List<MinimalGrapheme> {
    val graphemes = splitGraphemes(text)
    if (graphemes.isEmpty()) return emptyList()
    val span = (endSec - startSec).coerceAtLeast(0.0)
    val unit = span / graphemes.size
    return graphemes.mapIndexed { index, value ->
        MinimalGrapheme(
            text = value,
            startSec = startSec + unit * index,
            endSec = if (index == graphemes.lastIndex) endSec else startSec + unit * (index + 1),
        )
    }
}

/**
 * 一行 → 逐字时间轴。
 *
 * 词标签覆盖整行时按词内均分（真正的卡拉OK感）；否则整行均分（LRC 只有行时间时的正确退化）。
 */
fun buildGraphemeTimeline(line: MinimalLyricLine): MinimalGraphemeTimeline {
    val words = line.words
    if (words.isEmpty()) return MinimalGraphemeTimeline(evenTimings(line.text, line.startSec, line.endSec))
    if (words.joinToString("") { it.text } != line.text) {
        return MinimalGraphemeTimeline(evenTimings(line.text, line.startSec, line.endSec))
    }
    val out = ArrayList<MinimalGrapheme>(line.text.length)
    for (word in words) {
        out += evenTimings(word.text, word.startSec, word.endSec)
    }
    if (out.isEmpty()) return MinimalGraphemeTimeline(evenTimings(line.text, line.startSec, line.endSec))
    return MinimalGraphemeTimeline(out)
}

/** 行上附着的逐字时间轴（按需构建一次）。 */
val MinimalLyricLine.graphemeTimeline: MinimalGraphemeTimeline
    get() = timelineCache.getOrPut(this) { buildGraphemeTimeline(this) }

private val timelineCache = java.util.Collections.synchronizedMap(
    object : java.util.LinkedHashMap<MinimalLyricLine, MinimalGraphemeTimeline>(64, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<MinimalLyricLine, MinimalGraphemeTimeline>) = size > 512
    }
)
