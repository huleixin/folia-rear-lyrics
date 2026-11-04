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
// 播放器的**标准矢量图标集**（第 19 轮）：播放模式四种 + 播放控制五种，全局唯一的
// 几何来源。24 单位网格、2 单位线宽（渲染在 22~24dp 时正好是 1.8~2dp）、圆头圆角。
//
// 几何取自 lucide 的标准线性图标（ISC 许可，成熟播放器同一套视觉语言）：
//   顺序播放 = 双横线带右箭头；列表循环 / 单曲循环 = 标准 repeat / repeat-1；
//   随机 = 标准 shuffle；上一首 / 下一首 = skip 三角 + 竖杆；播放 / 暂停 = 实心三角 / 双柱；
//   队列 = list-music。WebView 侧（PlaybackModeIcon.tsx 与 lucide 组件）用同一组数字。
//
// 之前各处自绘的「环+竖线」「交叉线」为什么换掉：笔画配比随手写随手变，四个模式
// 放在一起不像一套。这里四个模式同一网格同一线宽同一端点，天然成套。

/** 一个矢量图标：实心子路径 + 描边子路径（24 网格坐标）。 */
data class PlayerIcon(val fill: List<String> = emptyList(), val stroke: List<String> = emptyList())

object PlayerIcons {
    private val REPEAT = PlayerIcon(
        stroke = listOf(
            "M17 2 21 6 17 10",
            "M3 11v-1a4 4 0 0 1 4-4h14",
            "M7 22 3 18 7 14",
            "M21 13v1a4 4 0 0 1-4 4H3",
        ),
    )
    private val SHUFFLE = PlayerIcon(
        stroke = listOf(
            "M18 14 22 18 18 22",
            "M18 2 22 6 18 10",
            "M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22",
            "M2 6h1.972a4 4 0 0 1 3.6 2.2",
            "M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.358-.452",
        ),
    )

    /** 播放模式 → 图标。未知模式按顺序播放处理。 */
    fun forMode(mode: String): PlayerIcon = when (mode) {
        "all" -> REPEAT
        "one" -> PlayerIcon(
            stroke = REPEAT.stroke + "M11 10h1v4",
        )
        "shuffle" -> SHUFFLE
        else -> PlayerIcon(
            stroke = listOf(
                "M4 8h9",
                "M10 5l3 3-3 3",
                "M4 16h13",
                "M14 13l3 3-3 3",
            ),
        )
    }

    val SKIP_BACK = PlayerIcon(fill = listOf("M19 20L9 12L19 4Z"), stroke = listOf("M5 19V5"))
    val SKIP_FORWARD = PlayerIcon(fill = listOf("M5 4L15 12L5 20Z"), stroke = listOf("M19 5v14"))
    val PLAY = PlayerIcon(fill = listOf("M7 4.5v15l12.5-7.5Z"))
    val PAUSE = PlayerIcon(
        fill = listOf(
            "M8 5h1.6a1.2 1.2 0 0 1 1.2 1.2v11.6a1.2 1.2 0 0 1-1.2 1.2H8a1.2 1.2 0 0 1-1.2-1.2V6.2A1.2 1.2 0 0 1 8 5Z",
            "M14.4 5H16a1.2 1.2 0 0 1 1.2 1.2v11.6a1.2 1.2 0 0 1-1.2 1.2h-1.6a1.2 1.2 0 0 1-1.2-1.2V6.2A1.2 1.2 0 0 1 14.4 5Z",
        ),
    )
    val QUEUE = PlayerIcon(
        stroke = listOf(
            "M21 15V6",
            "M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
            "M12 12H3",
            "M16 6H3",
            "M12 18H3",
        ),
    )
}

/** 解析好的图标（Path 只建一次，随图标实例缓存）。 */
private class ResolvedIcon(icon: PlayerIcon) {
    val fill: List<Path> = icon.fill.map { PathParser().parsePathString(it).toPath() }
    val stroke: List<Path> = icon.stroke.map { PathParser().parsePathString(it).toPath() }
}

/** 播放模式图标：顺序 / 列表循环 / 单曲循环 / 随机，24dp 视觉基准。 */
@Composable
fun PlaybackModeIcon(mode: String, tint: Color, modifier: Modifier) {
    PlayerVectorIcon(remember(mode) { ResolvedIcon(PlayerIcons.forMode(mode)) }, tint, modifier)
}

/** 播放控制图标：skipBack / skipForward / play / pause / queue。 */
@Composable
fun PlayerControlIcon(kind: String, tint: Color, modifier: Modifier) {
    val icon = remember(kind) {
        ResolvedIcon(
            when (kind) {
                "skipBack" -> PlayerIcons.SKIP_BACK
                "skipForward" -> PlayerIcons.SKIP_FORWARD
                "play" -> PlayerIcons.PLAY
                "pause" -> PlayerIcons.PAUSE
                else -> PlayerIcons.QUEUE
            }
        )
    }
    PlayerVectorIcon(icon, tint, modifier)
}

@Composable
private fun PlayerVectorIcon(icon: ResolvedIcon, tint: Color, modifier: Modifier) {
    Canvas(modifier) {
        withTransform({ scale(size.minDimension / 24f, size.minDimension / 24f, pivot = Offset.Zero) }) {
            icon.fill.forEach { drawPath(it, tint) }
            icon.stroke.forEach {
                drawPath(it, tint, style = Stroke(2f, cap = StrokeCap.Round, join = StrokeJoin.Round))
            }
        }
    }
}
