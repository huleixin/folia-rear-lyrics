package io.github.huleixin.tingyu.minimal.cover

import io.github.huleixin.tingyu.minimal.MinimalQueue
import io.github.huleixin.tingyu.minimal.MinimalTrack
import io.github.huleixin.tingyu.playback.NativePlaylist

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/cover/CoverStackQueue.kt
//
// 三层封面到底是谁：**不新开队列**，只读播放器自己的两个权威。
//
//   · 当前曲 → {@link MinimalTrack}（runtime 合成的身份，Media3 为准确认）
//   · 下一首 / 下下首 → {@link NativePlaylist#lookahead}（JS 同步下来的真实播放顺序，
//     随机模式里已经是洗好的牌，所以预览与实际推进是同一个序列）
//   · 上一首 → {@link NativePlaylist#previous}（JS 播放历史里的那一首）；老版本 JS 没给时
//     退回队列抽屉的投影，再没有就如实判定"没有上一首"，绝不编一个假封面
//
// 同一首歌在队列里出现多次时，条目的稳定身份是 `songKey#出现序号`（见 {@link buildCards}）。

/** 一层封面需要的全部信息（不含位图）。 */
data class CoverEntry(
    val songKey: String,
    val title: String,
    val artist: String,
    val artwork: String,
) {
    companion object {
        fun of(track: MinimalTrack): CoverEntry? {
            if (track.key.isEmpty()) return null
            return CoverEntry(track.key, track.title, track.artist, track.artwork)
        }

        fun of(track: NativePlaylist.Track?): CoverEntry? {
            if (track == null || track.songKey.isEmpty()) return null
            return CoverEntry(track.songKey, track.title, track.artist, track.artwork)
        }
    }
}

/**
 * 一屏三层 + 两个方向各一张：当前 / 下一首 / 下下首 / 上一首。
 *
 * @param next3 下下首的下一首。三层里看不到它，但它是"补入"那一刻要出现在第三层的那张 ——
 *              提前从逻辑歌单取出来，补位时才不会白屏。
 * @param canGoNext 队列这一头还有歌。没有时手势只做橡皮筋，不发命令。
 * @param canGoPrev 上一首真的取到了（而不是"大概有"）。
 */
data class CoverWindow(
    val current: CoverEntry? = null,
    val next: CoverEntry? = null,
    val next2: CoverEntry? = null,
    val next3: CoverEntry? = null,
    val previous: CoverEntry? = null,
    val canGoNext: Boolean = false,
    val canGoPrev: Boolean = false,
) {
    /** 三层静止卡片（不足三张时按实际数量降级）。 */
    fun restEntries(): List<CoverEntry?> = listOf(current, next, next2)

    /** 切歌期间的过渡卡片表：多出来的那一张就是要补入 / 要退出的那张。 */
    fun transitionEntries(direction: DragDirection): List<CoverEntry?> = when (direction) {
        DragDirection.NEXT -> listOf(current, next, next2, next3)
        DragDirection.PREV -> listOf(previous, current, next, next2)
    }
}

fun resolveCoverWindow(
    track: MinimalTrack,
    playlist: NativePlaylist = NativePlaylist.get(),
    queue: MinimalQueue = MinimalQueue(),
): CoverWindow {
    val current = CoverEntry.of(track) ?: return CoverWindow()
    val key = current.songKey
    val next = CoverEntry.of(playlist.lookahead(key, 1))
    val previous = CoverEntry.of(playlist.previous()) ?: previousFromQueue(queue, key)
    val usablePrevious = previous?.takeIf { it.songKey != key }
    return CoverWindow(
        current = current,
        next = next,
        next2 = CoverEntry.of(playlist.lookahead(key, 2)),
        next3 = CoverEntry.of(playlist.lookahead(key, 3)),
        previous = usablePrevious,
        canGoNext = next != null,
        canGoPrev = usablePrevious != null,
    )
}

/** 老版本 JS 没有推 `previous` 时的降级：用播放队列投影里的前一条。 */
private fun previousFromQueue(queue: MinimalQueue, currentKey: String): CoverEntry? {
    if (queue.isEmpty) return null
    val index = queue.items.indexOfFirst { it.songKey == currentKey }
        .takeIf { it >= 0 } ?: queue.currentIndex
    if (index < 0) return null
    val previous = queue.items.getOrNull(index - 1) ?: return null
    return CoverEntry(previous.songKey, previous.title, previous.artist, artwork = "")
}

/** 卡片在过渡中的层位变化。 */
data class CardSlot(val from: Float, val to: Float, val moving: Boolean, val lag: Float = 0f)

fun slotsFor(direction: DragDirection): List<CardSlot> = when (direction) {
    // 当前离开，下面三层各上移一层，第四层从底层补入；越深越晚起步
    DragDirection.NEXT -> listOf(
        CardSlot(0f, 0f, moving = true),
        CardSlot(1f, 0f, moving = false),
        CardSlot(2f, 1f, moving = false, lag = 0.1f),
        CardSlot(3f, 2f, moving = false, lag = 0.22f),
    )
    // 上一首从左侧放进最上面，原来的三层依次后退一层
    DragDirection.PREV -> listOf(
        CardSlot(0f, 0f, moving = true),
        CardSlot(0f, 1f, moving = false, lag = 0.08f),
        CardSlot(1f, 2f, moving = false, lag = 0.2f),
        CardSlot(2f, 3f, moving = false, lag = 0.3f),
    )
}

/**
 * 把曲目数组变成带稳定身份的渲染卡片。
 *
 * key 只跟歌曲有关（重复出现时加序号），换层不会换身份 —— Compose 因此能复用同一个图层与
 * 同一张已解码的位图，"补位"只是位置在动，不是换了张图。
 */
fun buildCards(entries: List<CoverEntry?>, slots: List<CardSlot>? = null): List<CoverCard> {
    val seen = HashMap<String, Int>(4)
    return entries.mapIndexedNotNull { index, entry ->
        if (entry == null) return@mapIndexedNotNull null
        val occurrence = seen[entry.songKey] ?: 0
        seen[entry.songKey] = occurrence + 1
        val slot = slots?.getOrNull(index)
        CoverCard(
            key = "${entry.songKey}#$occurrence",
            songKey = entry.songKey,
            title = entry.title,
            artist = entry.artist,
            artwork = entry.artwork,
            from = slot?.from ?: index.coerceAtMost(2).toFloat(),
            to = slot?.to ?: index.coerceAtMost(2).toFloat(),
            moving = slot?.moving ?: false,
            lag = slot?.lag ?: 0f,
        )
    }
}

/** 静止三层。 */
fun restCards(window: CoverWindow): List<CoverCard> = buildCards(window.restEntries())

/** 切歌期间的过渡卡片表。 */
fun transitionCards(direction: DragDirection, window: CoverWindow): List<CoverCard> =
    buildCards(window.transitionEntries(direction), slotsFor(direction))

