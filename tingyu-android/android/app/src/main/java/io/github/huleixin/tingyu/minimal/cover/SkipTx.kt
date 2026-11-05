package io.github.huleixin.tingyu.minimal.cover

import android.os.SystemClock

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/cover/SkipTx.kt
//
// 一次切歌的事务模型 + 可关闭的诊断时间线。
//
// 为什么要有它：封面堆叠动画"跑完"和"播放器真的切到那首"是两个相距几百毫秒到数秒的事件，
// 1.3.150 之前它们被当成同一个完成信号 —— 动画一结束就把预期中的下一首当成正在播的歌，
// 歌名、歌词、进度条却还在等真实播放状态，于是封面、文字、声音各切各的。
//
// 事务把这条时间线上的事件拆开（每个都带 requestId 与单调时钟，日志可关）：
//   GESTURE_RELEASE     手指松开、判定为一次切歌
//   SKIP_REQUEST        切歌命令发出（requestId 经命令桥带给 JS）
//   JS_ACTION_RECEIVED  （JS 侧日志，见 src/services/skipTxLog.ts）
//   AUDIO_RESOLVE_START / AUDIO_SOURCE_READY / AUDIO_PLAYING（JS 侧）
//   ENGINE_TRACK_CHANGED / ENGINE_BUFFERING / ENGINE_READY / AUDIO_PLAYING
//                       （引擎侧日志，见 RearNativeTrack）
//   COVER_ANIMATION_DONE 封面动画完成 —— 此后未经确认的封面只是视觉预览
//   UI_TRACK_CONFIRMED   播放状态确认了目标歌曲身份，封面/文字/歌词/进度统一落位
//   SKIP_FAILED          宽限期内没等到目标身份，回退真实正在播的那首

/** 事务推进到哪一步。NONE 表示当前没有在途的切歌。 */
enum class SkipStage {
    NONE,
    /** 命令已发出，封面动画还在跑。 */
    REQUESTED,
    /** 封面动画已完成，等待真实播放状态确认。顶层封面此时只是视觉预览。 */
    ANIMATION_DONE,
    /** 播放状态确认了目标身份。 */
    CONFIRMED,
    /** 没等到目标身份，已经回退。 */
    FAILED,
}

/** 一次我们发起、等待播放状态确认的切歌。不可变，换阶段就换实例。 */
data class SkipTransaction(
    /** 单调递增；随命令 value 过桥，JS 侧日志用它对齐。 */
    val requestId: Long = 0L,
    val direction: DragDirection = DragDirection.NEXT,
    /** 发起时正在播的那首。 */
    val fromSongKey: String = "",
    /** 我们期望切到的那首。 */
    val expectedSongKey: String = "",
    val stage: SkipStage = SkipStage.NONE,
    /** 发起时刻（SystemClock.uptimeMillis）。 */
    val startedAtUptime: Long = 0L,
) {
    val active: Boolean get() = stage == SkipStage.REQUESTED || stage == SkipStage.ANIMATION_DONE
}

/**
 * 切歌事务的诊断时间线。tag = {@code TingyuSkipTx}，logcat 一把就能拉出完整一次切歌：
 *
 * <pre>
 * adb logcat -s TingyuSkipTx
 * 10:20:01.123 SKIP_REQUEST id=42 next from=abc123.. to=def456.. atUptime=12345678 atElapsed=...
 * </pre>
 *
 * 只记歌曲身份的短前缀、requestId 与单调时钟；音源 URL、Cookie、Token 一律不进日志。
 * 生产默认开启（成本是每条一个 Log.i），诊断开关留给真机排查噪声时用。
 */
object SkipTxLog {

    @Volatile
    var enabled: Boolean = true

    // 纯 JVM 单测里 android.os.SystemClock / android.util.Log 未 mock 会抛异常。
    // 日志只是旁路诊断，任何失败都静默关闭自己，绝不影响播放与状态机（含既有测试）。
    private fun log(event: String, requestId: Long, detail: String) {
        if (!enabled) return
        try {
            android.util.Log.i(
                "TingyuSkipTx",
                "$event id=$requestId $detail atUptime=${SystemClock.uptimeMillis()} atElapsed=${SystemClock.elapsedRealtime()}",
            )
        } catch (_: Throwable) {
            enabled = false
        }
    }

    @JvmStatic
    fun gestureRelease(requestId: Long, direction: DragDirection, fromKey: String) = log(
        "GESTURE_RELEASE", requestId, "dir=${direction.name.lowercase()} from=${short(fromKey)}",
    )

    @JvmStatic
    fun skipRequest(requestId: Long, direction: DragDirection, fromKey: String, toKey: String) = log(
        "SKIP_REQUEST", requestId, "dir=${direction.name.lowercase()} from=${short(fromKey)} to=${short(toKey)}",
    )

    @JvmStatic
    fun coverAnimationDone(requestId: Long, expectedKey: String, confirmed: Boolean) = log(
        "COVER_ANIMATION_DONE", requestId, "expected=${short(expectedKey)} playbackConfirmed=$confirmed",
    )

    @JvmStatic
    fun uiTrackConfirmed(requestId: Long, songKey: String, leadMs: Long) = log(
        "UI_TRACK_CONFIRMED", requestId, "song=${short(songKey)} animationLeadMs=$leadMs",
    )

    @JvmStatic
    fun skipFailed(requestId: Long, expectedKey: String, liveKey: String) = log(
        "SKIP_FAILED", requestId, "expected=${short(expectedKey)} live=${short(liveKey)}",
    )

    @JvmStatic
    fun externalTrackChange(fromKey: String, toKey: String) = log(
        "ENGINE_TRACK_CHANGED", -1L, "ui-observed from=${short(fromKey)} to=${short(toKey)}",
    )

    // ---- 引擎侧事件（RearNativeTrack 喂，覆盖 Media3 与兼容通道）----

    /** 引擎真实换曲：RearNativeTrack.onTrack 的 key 变化。 */
    @JvmStatic
    fun engineTrackChangedInternal(fromKey: String, toKey: String) = log(
        "ENGINE_TRACK_CHANGED", -1L, "engine from=${short(fromKey)} to=${short(toKey)}",
    )

    /** 引擎进入/退出缓冲（STATE_BUFFERING ⇄ STATE_READY 之前的那段）。 */
    @JvmStatic
    fun engineBuffering(songKey: String, value: Boolean) = log(
        if (value) "ENGINE_BUFFERING" else "ENGINE_READY", -1L, "song=${short(songKey)}",
    )

    /** 引擎真正开始出声（isPlaying false→true）。 */
    @JvmStatic
    fun engineAudioPlaying(songKey: String) = log(
        "AUDIO_PLAYING", -1L, "song=${short(songKey)} channel=engine",
    )

    @JvmStatic
    fun stage(requestId: Long, songKey: String, note: String) = log(
        "STAGE", requestId, "song=${short(songKey)} $note",
    )

    /** 身份只留短前缀：日志是给人对时间线的，不是给爬 URL 的。 */
    internal fun short(key: String): String = if (key.length <= 12) key else key.take(12) + ".."
}
