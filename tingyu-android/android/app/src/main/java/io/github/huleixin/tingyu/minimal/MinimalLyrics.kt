package io.github.huleixin.tingyu.minimal

import org.json.JSONArray
import org.json.JSONObject

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/MinimalLyrics.kt
//
// 极简播放页的歌词：**统一版本的只读投影**。
//
// 它不取词、不选版本、不排时间轴。行结构来自 {@code RearNativeLyricLines} 的 rows ——
// 也就是背屏渲染器读的那一份，最终版本由 {@code LyricTimelineAuthority} 在三端之间裁决。
// 于是「同一首歌，岛上 / 背屏 / 舞台 / Compose 页各唱一句不同的词」在结构上不可能发生：
// 四个读端编译到的是同一个交付点。
//
// 这里只做两件本地事：把 rows JSON 解析成不可变对象，以及给出「这一刻唱到第几行」。

/** 一个逐字时间片段。逐字歌词没有时，整行会被折成一个片段（与背屏 rows 的约定一致）。 */
data class MinimalLyricWord(
    val text: String = "",
    val startSec: Double = 0.0,
    val endSec: Double = 0.0,
)

/** 一行歌词。[startSec]/[endSec] 已经是**经过用户偏移烘焙**的坐标，直接和原始播放位置比较。 */
data class MinimalLyricLine(
    val startSec: Double = 0.0,
    val endSec: Double = 0.0,
    val text: String = "",
    val translation: String? = null,
    val words: List<MinimalLyricWord> = emptyList(),
) {
    /** 这一行里已经唱到的比例，0..1。没有逐字时间时按整行线性插值。 */
    fun sungFraction(atSec: Double): Float {
        if (atSec <= startSec) return 0f
        if (atSec >= endSec) return 1f
        val words = words
        if (words.isNotEmpty()) {
            // 逐字：累加已经唱完的片段，再按当前片段的时间补上它的进度。
            var sung = 0.0
            for (word in words) {
                if (atSec >= word.endSec) {
                    sung += word.text.length
                    continue
                }
                if (atSec > word.startSec && word.endSec > word.startSec) {
                    sung += word.text.length * (atSec - word.startSec) / (word.endSec - word.startSec)
                }
                break
            }
            val total = words.sumOf { it.text.length }
            if (total > 0) return (sung / total).toFloat().coerceIn(0f, 1f)
        }
        val span = endSec - startSec
        return if (span <= 0.0) 1f else ((atSec - startSec) / span).toFloat().coerceIn(0f, 1f)
    }
}

/** 歌词这一首当前处在什么结论上。LOADING 不是"没有词"，不能显示成无词。 */
enum class MinimalLyricsStatus { LOADING, READY, NONE, STALE }

data class MinimalLyrics(
    val songKey: String = "",
    val epoch: String = "",
    /** 版本指纹（rows 缓存的 cacheKey），只用于判断"换没换版本"，不参与渲染。 */
    val version: String = "",
    val status: MinimalLyricsStatus = MinimalLyricsStatus.LOADING,
    val lines: List<MinimalLyricLine> = emptyList(),
    val wordByWord: Boolean = false,
) {
    /** 每行的起始时间，供二分查找；随对象一起构建一次。 */
    private val starts: DoubleArray = DoubleArray(lines.size) { lines[it].startSec }

    val ready: Boolean get() = status == MinimalLyricsStatus.READY && lines.isNotEmpty()

    /** 这一刻唱到第几行；第一行之前是 -1（与舞台 `findActiveLineIndex` 同语义）。 */
    fun activeIndex(atSec: Double): Int {
        if (starts.isEmpty() || !atSec.isFinite() || atSec < starts[0]) return -1
        var low = 0
        var high = starts.size - 1
        var found = 0
        while (low <= high) {
            val middle = (low + high) shr 1
            if (starts[middle] <= atSec) {
                found = middle
                low = middle + 1
            } else {
                high = middle - 1
            }
        }
        return found
    }

    fun lineAt(atSec: Double): MinimalLyricLine? = lines.getOrNull(activeIndex(atSec))

    companion object {
        private const val MAX_LINES = 4000
        private const val MAX_TEXT = 600

        /**
         * rows JSON → 不可变歌词。纯函数：JSON 坏了就返回空列表，绝不抛。
         *
         * @param json {@code RearNativeLyricLines} 的 rows（{@code state/lines/isWordByWord}），
         *             或 null（还没取到）
         */
        fun fromRows(json: String?, songKey: String, epoch: String, version: String): MinimalLyrics {
            if (json.isNullOrBlank()) {
                return MinimalLyrics(songKey, epoch, version, MinimalLyricsStatus.LOADING)
            }
            val payload = try {
                JSONObject(json)
            } catch (_: Exception) {
                return MinimalLyrics(songKey, epoch, version, MinimalLyricsStatus.LOADING)
            }
            // 行结构与身份必须同源：rows 里带着它自己那一首，绝不给别的歌配这一首的词。
            val rowsKey = payload.optString("songKey", "")
            if (rowsKey.isNotEmpty() && songKey.isNotEmpty() && rowsKey != songKey) {
                return MinimalLyrics(songKey, epoch, version, MinimalLyricsStatus.STALE)
            }
            val state = payload.optString("state", "loading")
            val array = payload.optJSONArray("lines") ?: JSONArray()
            if (state == "none" || array.length() == 0) {
                val status = if (state == "none") MinimalLyricsStatus.NONE else MinimalLyricsStatus.LOADING
                return MinimalLyrics(songKey, epoch, version, status)
            }
            val lines = ArrayList<MinimalLyricLine>(array.length().coerceAtMost(MAX_LINES))
            for (index in 0 until array.length().coerceAtMost(MAX_LINES)) {
                val row = array.optJSONObject(index) ?: continue
                val text = row.optString("fullText", "").take(MAX_TEXT)
                if (text.isBlank()) continue
                val start = finite(row.optDouble("startTime", 0.0))
                var end = finite(row.optDouble("endTime", start))
                if (end <= start) end = start + 0.5
                lines += MinimalLyricLine(
                    startSec = start,
                    endSec = end,
                    text = text,
                    translation = row.optString("translation", "").takeIf { it.isNotBlank() },
                    words = words(row.optJSONArray("words")),
                )
            }
            if (lines.isEmpty()) return MinimalLyrics(songKey, epoch, version, MinimalLyricsStatus.NONE)
            return MinimalLyrics(
                songKey = songKey,
                epoch = epoch,
                version = version,
                status = MinimalLyricsStatus.READY,
                lines = lines,
                wordByWord = payload.optBoolean("isWordByWord", false),
            )
        }

        private fun words(array: JSONArray?): List<MinimalLyricWord> {
            if (array == null || array.length() == 0) return emptyList()
            val out = ArrayList<MinimalLyricWord>(array.length())
            for (index in 0 until array.length().coerceAtMost(400)) {
                val word = array.optJSONObject(index) ?: continue
                val text = word.optString("text", "")
                if (text.isEmpty()) continue
                val start = finite(word.optDouble("startTime", 0.0))
                var end = finite(word.optDouble("endTime", start))
                if (end < start) end = start
                out += MinimalLyricWord(text, start, end)
            }
            return out
        }

        private fun finite(value: Double): Double = if (value.isFinite()) value.coerceIn(0.0, 604800.0) else 0.0
    }
}
