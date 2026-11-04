package io.github.huleixin.tingyu.minimal.ui

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.PathParser

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/PlayerIcons.kt
//
// 播放器的**唯一图标来源**（第 20 轮）：听屿经典播放图标包（10 枚）。
// 几何逐字取自图标包的 android_vector/*.xml（manifest 见包内 manifest.json），
// 不重绘、不改数字 —— 封面页、极简歌词页、歌词舞台、队列抽屉、歌曲工具、
// WebView 回退侧用的都是这一套路径。
//
// 图标包的每枚图标自带描边宽度（2.15 ~ 3.15 单位，24 网格），渲染在 22~26dp
// 时正好落在 1.8~3.2dp 线宽区间；queue 的三枚圆点是零长度线段 + 圆头端点的
// 包内原始写法，两端（Skia / SVG）行为一致。
//
// 颜色：XML 里的黑只是中性占位 —— 一律由 tint 决定。普通态随主题（ink），
// 激活态薄荷绿 mintActive()，音质徽章香槟金（QualityChip 调色板）。

/** 一组同宽度的描边子路径（24 网格坐标，宽度单位与网格一致）。 */
data class StrokeRun(val width: Float, val paths: List<String>)

/** 一个矢量图标：实心子路径 + 分组描边子路径。 */
data class PlayerIcon(val fill: List<String> = emptyList(), val stroke: List<StrokeRun> = emptyList())

object PlayerIcons {
    // —— 图标包原始数据（android_vector/*.xml，路径与宽度逐字未改）——

    /** play_order 顺序播放 */
    val ORDER = PlayerIcon(
        stroke = listOf(
            StrokeRun(2.15f, listOf("M3.2 5.1 H13.1 M3.2 11.2 H11.2 M3.2 17.3 H13.1")),
        ),
        fill = listOf("M15.0 8.2 L21.5 12.0 L15.0 15.8 Z"),
    )

    /** play_repeat_all 列表循环 */
    val REPEAT_ALL = PlayerIcon(
        stroke = listOf(
            StrokeRun(
                2.35f,
                listOf(
                    "M3.7 10.0 V8.5 C3.7 5.9 5.8 4.1 8.8 4.1 H19.8",
                    "M16.3 0.9 L19.8 4.1 L16.3 7.4",
                    "M20.3 14.0 V15.5 C20.3 18.1 18.2 19.9 15.2 19.9 H4.2",
                    "M7.7 16.6 L4.2 19.9 L7.7 23.0",
                ),
            ),
        ),
    )

    /** play_repeat_one 单曲循环 = 列表循环 + 1 */
    val REPEAT_ONE = PlayerIcon(
        stroke = REPEAT_ALL.stroke + StrokeRun(2.25f, listOf("M10.8 10.0 L13.0 8.3 V15.8")),
    )

    /** play_shuffle 随机播放 */
    val SHUFFLE = PlayerIcon(
        stroke = listOf(
            StrokeRun(
                2.3f,
                listOf(
                    "M3.0 5.7 H5.9 C9.5 5.7 12.7 18.3 18.0 18.3 H20.5",
                    "M17.5 15.4 L20.5 18.3 L17.5 21.1",
                    "M3.0 18.3 H5.9 C9.5 18.3 12.7 5.7 18.0 5.7 H20.5",
                    "M17.5 2.9 L20.5 5.7 L17.5 8.6",
                ),
            ),
        ),
    )

    /** control_previous 上一首 */
    val SKIP_BACK = PlayerIcon(
        stroke = listOf(StrokeRun(2.75f, listOf("M4.2 4.4 V19.6"))),
        fill = listOf(
            "M18.8 4.8 Q19.8 4.2 19.8 5.7 V18.3 Q19.8 19.8 18.8 19.2 L7.4 12.9 Q6.0 12 7.4 11.1 Z",
        ),
    )

    /** control_next 下一首 */
    val SKIP_FORWARD = PlayerIcon(
        stroke = listOf(StrokeRun(2.75f, listOf("M19.8 4.4 V19.6"))),
        fill = listOf(
            "M5.2 4.8 Q4.2 4.2 4.2 5.7 V18.3 Q4.2 19.8 5.2 19.2 L16.6 12.9 Q18.0 12 16.6 11.1 Z",
        ),
    )

    /** control_play 播放 */
    val PLAY = PlayerIcon(
        fill = listOf("M6.4 3.7 Q5.2 3.0 5.2 4.8 V19.2 Q5.2 21.0 6.4 20.3 L19.5 12.9 Q21.1 12.0 19.5 11.1 Z"),
    )

    /** control_pause 暂停 */
    val PAUSE = PlayerIcon(
        fill = listOf(
            "M7.0 4.1 H9.4 Q10.5 4.1 10.5 5.4 V18.6 Q10.5 19.9 9.4 19.9 H7.0 Q5.9 19.9 5.9 18.6 V5.4 Q5.9 4.1 7.0 4.1 Z",
            "M14.6 4.1 H17.0 Q18.1 4.1 18.1 5.4 V18.6 Q18.1 19.9 17.0 19.9 H14.6 Q13.5 19.9 13.5 18.6 V5.4 Q13.5 4.1 14.6 4.1 Z",
        ),
    )

    /** control_queue 播放列表（三横线 + 三圆点；圆点是零长度线段 + 圆头的包内写法） */
    val QUEUE = PlayerIcon(
        stroke = listOf(
            StrokeRun(2.55f, listOf("M7.4 5.4 H20.1 M7.4 12.0 H20.1 M7.4 18.6 H20.1")),
            StrokeRun(3.15f, listOf("M3.2 5.4 L3.2 5.4 M3.2 12.0 L3.2 12.0 M3.2 18.6 L3.2 18.6")),
        ),
    )

    /** control_audio_bars 音频柱标识 —— 只用于音质徽章，不是随机播放。 */
    val AUDIO_BARS = PlayerIcon(
        stroke = listOf(
            StrokeRun(2.85f, listOf("M3.7 17.2 V20.4 M7.85 12.4 V20.4 M12.0 6.2 V20.4 M16.15 12.4 V20.4 M20.3 17.2 V20.4")),
        ),
    )

    /** 播放模式 → 图标。off / 未知模式按顺序播放处理。 */
    fun forMode(mode: String): PlayerIcon = when (mode) {
        "all" -> REPEAT_ALL
        "one" -> REPEAT_ONE
        "shuffle" -> SHUFFLE
        else -> ORDER
    }

    /** 播放控制 → 图标。audioBars 是音质徽章的音频柱，不是模式。 */
    fun forControl(kind: String): PlayerIcon = when (kind) {
        "skipBack" -> SKIP_BACK
        "skipForward" -> SKIP_FORWARD
        "play" -> PLAY
        "pause" -> PAUSE
        "audioBars" -> AUDIO_BARS
        else -> QUEUE
    }
}

/**
 * 激活态薄荷绿（图标包 control_play 的示例色 #6DBDAD）。
 * 浅色表面上加深一档保证对比度 —— 与香槟金在 QualityChip 的深浅双档同一做法。
 */
fun mintActive(light: Boolean): Color = if (light) Color(0xFF2E8A74) else Color(0xFF6DBDAD)

/** 播放模式是否处于"激活"（非顺序/非 off）——决定是否用薄荷绿。 */
fun modeIsActive(mode: String): Boolean = mode != "order" && mode != "off"

/** 解析好的图标（Path 只建一次，随图标实例缓存）。 */
private class ResolvedIcon(icon: PlayerIcon) {
    val fill: List<Path> = icon.fill.map { PathParser().parsePathString(it).toPath() }
    val stroke: List<Pair<Float, List<Path>>> =
        icon.stroke.map { run -> run.width to run.paths.map { PathParser().parsePathString(it).toPath() } }
}

/** 播放模式图标：顺序 / 列表循环 / 单曲循环 / 随机，24dp 视觉基准。 */
@Composable
fun PlaybackModeIcon(mode: String, tint: Color, modifier: Modifier) {
    PlayerVectorIcon(remember(mode) { ResolvedIcon(PlayerIcons.forMode(mode)) }, tint, modifier)
}

/** 播放控制图标：skipBack / skipForward / play / pause / queue / audioBars。 */
@Composable
fun PlayerControlIcon(kind: String, tint: Color, modifier: Modifier) {
    PlayerVectorIcon(remember(kind) { ResolvedIcon(PlayerIcons.forControl(kind)) }, tint, modifier)
}

@Composable
private fun PlayerVectorIcon(icon: ResolvedIcon, tint: Color, modifier: Modifier) {
    Canvas(modifier) {
        withTransform({ scale(size.minDimension / 24f, size.minDimension / 24f, pivot = Offset.Zero) }) {
            icon.fill.forEach { drawPath(it, tint) }
            icon.stroke.forEach { (width, paths) ->
                paths.forEach {
                    drawPath(it, tint, style = Stroke(width, cap = StrokeCap.Round, join = StrokeJoin.Round))
                }
            }
        }
    }
}
