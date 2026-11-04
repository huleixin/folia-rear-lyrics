package io.github.huleixin.tingyu.minimal.ui

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/PlayModeGlyph.kt
//
// 四种播放模式的标准线性图标（第 18 轮）：**全局唯一的手绘来源**。
//
// 封面页传输条（MinimalTransport）和队列抽屉（MinimalQueueSheet）都从这里画；
// WebView 回退侧由 `src/components/app/icons/PlaybackModeIcon.tsx` 用同一组坐标
// 镜像（14 单位网格、1.6 单位圆头描边）。风格对齐 QQ 音乐经典线性图标：
// 细线条、圆角、无多余装饰。不要在组件里再各自手绘 —— 那是四个入口四张脸的来源。
//
//   顺序（off）   = 短横带右箭头 + 长横
//   列表循环（all）= 300° 圆环（顶部留缺口）+ 缺口处的落箭头
//   单曲循环（one）= 圆环 + 1
//   随机（shuffle）= 交叉双线 + 两枚箭头

fun DrawScope.drawPlayModeGlyph(mode: String, color: Color) {
    val u = size.minDimension / 14f
    val w = 1.6f * u
    when (mode) {
        "one" -> {
            drawCircle(color, 5f * u, style = Stroke(w))
            drawLine(color, Offset(7f * u, 4.4f * u), Offset(7f * u, 9.6f * u), w, StrokeCap.Round)
        }
        "shuffle" -> {
            drawLine(color, Offset(2.5f * u, 4f * u), Offset(11.5f * u, 10f * u), w, StrokeCap.Round)
            drawLine(color, Offset(2.5f * u, 10f * u), Offset(11.5f * u, 4f * u), w, StrokeCap.Round)
            drawLine(color, Offset(9.6f * u, 2.6f * u), Offset(11.5f * u, 4f * u), w, StrokeCap.Round)
            drawLine(color, Offset(9.6f * u, 11.4f * u), Offset(11.5f * u, 10f * u), w, StrokeCap.Round)
        }
        "all" -> {
            drawArc(color, -60f, 300f, false, style = Stroke(w))
            drawLine(color, Offset(11f * u, 2.6f * u), Offset(11f * u, 6.4f * u), w, StrokeCap.Round)
        }
        else -> {
            drawLine(color, Offset(2.5f * u, 4.2f * u), Offset(8.5f * u, 4.2f * u), w, StrokeCap.Round)
            drawLine(color, Offset(2.5f * u, 9.8f * u), Offset(11.5f * u, 9.8f * u), w, StrokeCap.Round)
            drawLine(color, Offset(6.6f * u, 2.4f * u), Offset(8.5f * u, 4.2f * u), w, StrokeCap.Round)
            drawLine(color, Offset(6.6f * u, 6f * u), Offset(8.5f * u, 4.2f * u), w, StrokeCap.Round)
        }
    }
}
