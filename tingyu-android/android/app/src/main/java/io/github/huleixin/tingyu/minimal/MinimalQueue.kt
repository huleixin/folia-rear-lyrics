package io.github.huleixin.tingyu.minimal

import org.json.JSONObject

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/MinimalQueue.kt
//
// 队列抽屉的数据。**只读快照**，不持有队列本身。
//
// 队列的真身在 JS（`usePlaybackStore.playQueue`），行内动作也走原来的处理器；
// 这里解析的只是一份带版本号的投影，原生据此渲染。

data class MinimalQueueItem(
    /** 歌曲身份。高亮、切歌校验都用它，而不是下标 —— 下标会随删除移动。 */
    val key: String,
    val title: String,
    val artist: String,
)

data class MinimalQueue(
    /** 队列版本：内容或顺序一变就变，用来丢弃乱序到达的旧快照。 */
    val version: Long = -1L,
    /** 当前曲下标，-1 表示不在队列里。 */
    val currentIndex: Int = -1,
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
                val key = row.optString("k", "")
                if (key.isEmpty()) return null
                items += MinimalQueueItem(
                    key = key,
                    title = row.optString("t", ""),
                    artist = row.optString("a", ""),
                )
            }
            val current = value.optInt("i", -1)
            return MinimalQueue(
                version = version,
                currentIndex = if (current in items.indices) current else -1,
                total = total,
                items = items,
            )
        }
    }
}
