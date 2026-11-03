package io.github.huleixin.tingyu.minimal

import io.github.huleixin.tingyu.PlaybackPositionClock

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/MinimalPlayback.kt
//
// 极简播放页（Compose）读的播放状态：**一份投影，不是第二个播放器**。
//
// 这里只有「哪一首、在哪、在不在放」这三个事实，加上它们各自的锚点。位置一律是
// 「锚点 + 单调时钟外推」，用的就是媒体会话那条 {@link PlaybackPositionClock}：
// 同一个公式、同一份输入，所以控制条、通知栏、背屏和 Compose 页不可能算出不同的位置。
//
// 为什么必须带锚点而不是直接放「当前位置」：Compose 每帧都要重画进度，如果状态里只有
// 一个标量位置，就得有人每 16 ms 去改它 —— 那就是第二个计时器。现在状态只在**语义变化**
// 时更新（换歌 / 播放暂停 / seek / 时长到达），画面自己按帧外推。

/** 位置锚点来自哪条播放通道。同一时刻只有一个通道在出声。 */
enum class MinimalClockSource {
    /** Media3（{@code NativeAudioEngine}）自己解码出声，位置由它自己的时钟给出。 */
    ENGINE,

    /** 浏览器 {@code <audio>} 出声（EQ / 自动混音 / 不支持的地址），位置来自桥的锚点。 */
    BRIDGE,

    /** 还没有任何播放通道：不显示进度，也不外推。 */
    NONE,
}

/** 当前这一首的身份与静态信息。换歌才会变。 */
data class MinimalTrack(
    val key: String = "",
    val title: String = "",
    val artist: String = "",
    val album: String = "",
    val artwork: String = "",
    val durationMs: Long = 0L,
) {
    val present: Boolean get() = key.isNotEmpty()
}

/**
 * 一次播放状态快照。不可变，可安全跨线程传递。
 *
 * @param anchorPositionMs 锚点位置，**毫秒**
 * @param anchorElapsedMs  取到锚点时的 {@code SystemClock.elapsedRealtime()}
 * @param epoch            换歌代次（{@code songKey#generation}）；异步结果据此丢弃旧歌
 * @param maxExtrapolationMs 最多外推多久。引擎通道是权威时钟，不设上限；桥通道 4 s 没心跳就冻结
 */
data class MinimalPlayback(
    val track: MinimalTrack = MinimalTrack(),
    val playing: Boolean = false,
    val anchorPositionMs: Long = 0L,
    val anchorElapsedMs: Long = 0L,
    val playbackRate: Float = 1f,
    val source: MinimalClockSource = MinimalClockSource.NONE,
    val epoch: String = "",
    val maxExtrapolationMs: Long = Long.MAX_VALUE,
) {
    /** 在 [nowElapsedMs] 这一刻的位置（毫秒）。暂停时就是暂停的位置，未播放通道时为 0。 */
    fun positionMsAt(nowElapsedMs: Long): Long {
        if (source == MinimalClockSource.NONE || !track.present) return 0L
        // 上限只截「外推的那一段」，锚点本身永远成立：桥断了画面停在最后已知位置，不假装在走。
        val elapsed = (nowElapsedMs - anchorElapsedMs).coerceIn(0L, maxExtrapolationMs)
        return PlaybackPositionClock.at(
            playing, anchorPositionMs, anchorElapsedMs, anchorElapsedMs + elapsed,
            track.durationMs, playbackRate,
        )
    }

    fun positionSecAt(nowElapsedMs: Long): Double = positionMsAt(nowElapsedMs) / 1000.0

    /** 0..1；总时长未知时为 0，进度条据此停在起点而不是乱跳。 */
    fun progressAt(nowElapsedMs: Long): Float {
        val duration = track.durationMs
        if (duration <= 0L) return 0f
        return (positionMsAt(nowElapsedMs).toDouble() / duration).toFloat().coerceIn(0f, 1f)
    }

    /**
     * 歌词时钟：**原始播放位置**，秒。
     *
     * 极简页的歌词行已经由交付点烘焙过用户偏移（{@code RearNativeLyricLines} 的 rows），
     * 所以这里**不能**再减一次偏移 —— 那是舞台侧 {@code lyricCurrentTime} 的约定
     * （舞台的 lines 是未烘焙的）。两条链各自只烘焙一次，此处对齐的是背屏那条。
     */
    fun lyricSecAt(nowElapsedMs: Long): Double = positionSecAt(nowElapsedMs)
}
