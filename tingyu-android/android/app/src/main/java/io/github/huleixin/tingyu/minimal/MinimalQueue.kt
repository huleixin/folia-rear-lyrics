package io.github.huleixin.tingyu.minimal

import org.json.JSONObject

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/MinimalQueue.kt
//
// 队列抽屉的数据。**只读快照**，不持有队列本身。
//
// 队列的真身在 JS（`usePlaybackStore.playQueue`），行内动作也走原来的处理器；
// 这里解析的只是一份带版本号的投影，原生据此渲染。
//
// 两个版本概念分开（第 9 轮）：
//   · [version]     —— 队列内容/顺序。变了才需要整包重推。
//   · [currentKey]  —— 正在播放哪首。切歌不改队列数组，单独走轻量通道
//                      （{@link MinimalPlayerRuntime#onQueueCurrent}），几百首不必每切一首都过桥。

data class MinimalQueueItem(
    /**
     * 条目的**独立稳定身份**：`songKey#出现序号`。队列里同一首歌可能出现多次，
     * LazyColumn 的 key 和拖拽校验都要能区分它们，不能只靠歌曲 key。
     */
    val uid: String,
    /** 歌曲身份。高亮以它为准 —— 下标会随删除/排序漂移。 */
    val songKey: String,
    val title: String,
    val artist: String,
    /** 目录支持的音质层级（standard/hq/flac/hires/master/spatial）。空 = 目录没说，行内不画标签。 */
    val qualityLevel: String = "",
)

data class MinimalQueue(
    /** 队列版本：内容或顺序一变就变，用来丢弃乱序到达的旧快照。 */
    val version: Long = -1L,
    /** 当前曲下标，-1 表示不在队列里。用于把列表滚到当前曲。 */
    val currentIndex: Int = -1,
    /** 当前曲身份。高亮只认它，不认下标。 */
    val currentKey: String = "",
    /** 播放模式（off | all | one | shuffle）。空表示桥上还没有结论。 */
    val mode: String = "",
    val total: Int = 0,
    val items: List<MinimalQueueItem> = emptyList(),
) {
    val isEmpty: Boolean get() = items.isEmpty()

    companion object {
        /** 任一字段读不出来就整包丢弃：宁可继续显示上一份，也不要显示半份队列。 */
        fun parse(value: JSONObject?): MinimalQueue? {
            if (value == null) return null
            val array = value.optJSONArray("items") ?: return null
            val version = value.optLong("v", -1L).takeIf { it >= 0 } ?: return null
            val total = value.optInt("n", array.length())
            if (array.length() != total) return null
            val items = ArrayList<MinimalQueueItem>(array.length())
            for (index in 0 until array.length()) {
                val row = array.optJSONObject(index) ?: return null
                val songKey = row.optString("k", "")
                if (songKey.isEmpty()) return null
                val uid = row.optString("u", "").ifEmpty { "$songKey#$index" }
                items += MinimalQueueItem(
                    uid = uid,
                    songKey = songKey,
                    title = row.optString("t", ""),
                    artist = row.optString("a", ""),
                    qualityLevel = row.optString("q", "").take(16),
                )
            }
            val current = value.optInt("i", -1)
            return MinimalQueue(
                version = version,
                currentIndex = if (current in items.indices) current else -1,
                currentKey = value.optString("ck", ""),
                mode = value.optString("mode", "").takeIf { it in MODES } ?: "",
                total = total,
                items = items,
            )
        }

        private val MODES = setOf("off", "all", "one", "shuffle")
    }
}
