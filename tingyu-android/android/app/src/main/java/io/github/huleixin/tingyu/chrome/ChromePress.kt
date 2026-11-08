package io.github.huleixin.tingyu.chrome

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.isSpecified
import androidx.compose.ui.unit.dp

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/ChromePress.kt
//
// 听屿统一按压反馈（1.3.188 灰矩形专项）。
//
// 问题根因：Compose Material 的默认 indication 是 bounded Ripple，它的绘制范围是
// **节点矩形**，与控件视觉圆角无关。听屿的底栏格子、歌单行、设置行都是「无裁剪的
// 全宽/整格矩形」，所以一长按就出现一块方角灰底 —— 与液态玻璃的圆角完全冲突。
//
// 这里不做「全局关掉 ripple」那种掩盖式修复，而是给每类控件明确指定：
//   · shape —— 反馈自己按控件圆角绘制（drawBehind + createOutline，天然贴合圆角）
//   · tint  —— 项目调色板里的按压色，低透明度，叠在玻璃之上不会发灰
//   · scaleTo —— 小尺寸目标（底栏入口、图标按钮）用轻微缩放，不用色块
//
// 点击语义完全不变：调用方仍然自己传 enabled / role / onClick，
// 只是把 indication 从系统 ripple 换成这套反馈。

/** 行级按压色：浅色用墨色 6%，深色用白色 7%。叠在玻璃/卡片上都只是"轻压一下"。 */
@Composable
internal fun pagePressTint(): Color = interfaceColor(Color(0x12FFFFFF), Color(0x0F1B2A22))

/**
 * 给 [source] 绑定的控件加按压反馈。必须配合
 * `clickable(interactionSource = source, indication = null, …)` 使用。
 *
 * @param scaleTo 目标缩放（1f = 不缩放）。小控件建议 0.93f，行级控件保持 1f 只走 tint。
 * @param tint    按压叠色，传 [Color.Unspecified] 表示只用缩放。
 */
@Composable
internal fun Modifier.chromePressed(
    source: InteractionSource,
    shape: Shape = RoundedCornerShape(14.dp),
    tint: Color = Color.Unspecified,
    scaleTo: Float = 1f,
): Modifier {
    val pressed by source.collectIsPressedAsState()
    // damping 0.62 / stiffness 1100：按下快、回弹略过冲，和底栏选中项的 press 曲线同一手感。
    val progress by animateFloatAsState(
        targetValue = if (pressed) 1f else 0f,
        animationSpec = spring(dampingRatio = .62f, stiffness = 1100f),
        label = "chrome-pressed",
    )
    var modifier = this
    if (scaleTo != 1f) {
        modifier = modifier.graphicsLayer {
            val scale = 1f + (scaleTo - 1f) * progress
            scaleX = scale
            scaleY = scale
        }
    }
    if (tint.isSpecified) {
        modifier = modifier.drawBehind {
            if (progress > .001f) {
                // 按控件真实圆角画，矩形区域永远不会露出方角。
                val outline = shape.createOutline(size, layoutDirection, this)
                drawOutline(outline, color = tint.copy(alpha = tint.alpha * progress))
            }
        }
    }
    return modifier
}

/** 行级控件的常用组合：圆角 tint，无缩放。shape 由调用方按行高决定。 */
@Composable
internal fun Modifier.chromeRowPressed(source: InteractionSource, corner: androidx.compose.ui.unit.Dp = 14.dp): Modifier =
    chromePressed(source, RoundedCornerShape(corner), pagePressTint())

/** 小尺寸控件（图标、底栏入口）：只做轻微缩放，不叠色。 */
@Composable
internal fun Modifier.chromeTapPressed(source: InteractionSource, scaleTo: Float = .93f): Modifier =
    chromePressed(source, scaleTo = scaleTo)

/** 便捷构造：每个控件一个交互源，避免共享导致多个控件一起亮。 */
@Composable
internal fun rememberPressSource(): MutableInteractionSource = androidx.compose.runtime.remember {
    MutableInteractionSource()
}

/**
 * 一行替换掉系统 ripple 的点击：
 *   `Modifier.fillMaxWidth().height(48.dp).clickable{ … }`
 * → `Modifier.fillMaxWidth().height(48.dp).chromeClickable(corner = 12.dp){ … }`
 *
 * indication 固定为 null（不再画矩形水波），反馈由 [chromePressed] 自绘圆角 tint 或缩放提供。
 * enabled / role 语义与官方 clickable 一致，点击、无障碍、长按判定全部沿用 Compose 原实现。
 */
@Composable
internal fun Modifier.chromeClickable(
    enabled: Boolean = true,
    role: androidx.compose.ui.semantics.Role? = null,
    corner: androidx.compose.ui.unit.Dp = 14.dp,
    scaleTo: Float = 1f,
    tint: Color? = null,
    onClick: () -> Unit,
): Modifier {
    val source = androidx.compose.runtime.remember { MutableInteractionSource() }
    val resolvedTint = tint ?: if (scaleTo != 1f) Color.Unspecified else pagePressTint()
    return chromePressed(source, RoundedCornerShape(corner), resolvedTint, scaleTo)
        .clickable(
            interactionSource = source,
            indication = null,
            enabled = enabled,
            role = role,
            onClick = onClick,
        )
}
