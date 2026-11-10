package io.github.huleixin.tingyu.chrome

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/TyPanelStyle.kt
//
// 统一面板视觉与运动（原生化专项·第 21 轮）。
//
// 背景：Android 上的"二级操作面板"此前有三种互不相干的实现 ——
//   1. 极简播放器：minimal/ui 的 MinimalQueueSheet / MinimalToolsSheets（自绘 surface + 宿主级遮罩）；
//   2. 支持与交流：SupportSheets 的 Material3 ModalBottomSheet（另一套圆角、另一套进出场）；
//   3. 其余全部仍是 WebView 的 .ml-sheet（DOM portal）。
// 三种方言的圆角、遮罩浓度、进出场曲线都不同，用户在不同入口看到的是"三个 App 的弹窗"。
//
// 本文件是唯一事实源：所有 Compose 面板（队列/工具页/支持/二级操作面板）都从这里取
// surface 色、圆角、遮罩浓度与进出场。数值 = 1.3.182 基线 MinimalToolsSheets 的既有值，
// 属于**收编**，不是重设计 —— 极简页因此视觉零变化。
//
// 与 JS 侧 src/components/shared/motionTokens.ts、CSS 侧 src/styles/tingyuTokens.css 对应。

/** 面板 surface 常量。字段与 MinimalToolsSheets 的 ToolsTheme 历史结构一致（保持兼容）。 */
@Immutable
internal data class TyPanelTheme(
    val surface: Color,
    val card: Color,
    val text: Color,
    val muted: Color,
    val accent: Color,
    val line: Color,
    val scrim: Float,
    val danger: Color,
    val knob: Color = Color.White,
) {
    companion object {
        // The optional style is supplied only by ordinary app panels. Minimal-player callers
        // retain the classic palette and their own cover/daylight ownership.
        // Ordinary tools/queue now supply the global style too; the player canvas stays independent.
        internal fun of(light: Boolean, style: String = "classic"): TyPanelTheme {
            val p = InterfacePalette(light, style)
            return TyPanelTheme(p.panelSurface,p.panelCard,p.panelInk,p.panelMuted,p.panelAccent,
                p.panelLine,if(light) .28f else .55f,p.panelDanger,p.toggleKnob)
        }
    }
}

/** 面板尺寸常量（dp）。进出场、圆角、行高全部收在这里，页面不再各写一份。 */
internal object TyPanelDims {
    /** 底部面板顶圆角：22dp（原 MinimalToolsSheets）。 */
    const val TopRadius = 22f
    /** 居中对话框圆角：20dp。 */
    const val DialogRadius = 20f
    /** 操作行最小高度：48dp（触摸目标下限）。 */
    const val ActionRowMinHeight = 48f
    /** 面板左右内边距。 */
    const val HorizontalPadding = 20f
    /** 面板底部安全留白（无手势条时的呼吸位）。 */
    const val BottomPadding = 22f
    /** 默认最大高度占屏比；长列表页由调用方提高。 */
    const val DefaultHeightFraction = 0.86f
}

/**
 * 统一底部面板进出场：上滑 + 渐入 260ms，下滑 + 渐隐 200/140ms。
 * 与极简队列/工具页同一节奏 —— 这是"Liquid Glass 之下统一动效"的唯一一份实现。
 */
internal object TyPanelMotion {
    val Enter: EnterTransition = slideInVertically(
        animationSpec = tween(TingYuMotion.SheetInMs, easing = TingYuMotion.SheetIn),
        initialOffsetY = { it },
    ) + fadeIn(tween(200, easing = TingYuMotion.SheetIn))

    val Exit: ExitTransition = slideOutVertically(
        animationSpec = tween(200, easing = TingYuMotion.StageExit),
        targetOffsetY = { it },
    ) + fadeOut(tween(140, easing = TingYuMotion.StageExit))

    /** 遮罩只渐显渐隐，不吃滑移 —— 遮罩跟着面板一起滑会像"整屏在动"。 */
    val ScrimEnter: EnterTransition = fadeIn(tween(260, easing = TingYuMotion.SheetIn))
    val ScrimExit: ExitTransition = fadeOut(tween(200, easing = TingYuMotion.StageExit))
}

/**
 * 面板遮罩。宿主级调用（面板本体只滑自己）。
 * 点击关闭 = 与 WebView .ml-sheet-scrim 的"点空白处关闭"同一语义。
 */
@Composable
internal fun TyPanelScrim(visible: Boolean, light: Boolean, onClose: () -> Unit) {
    AnimatedVisibility(visible = visible, enter = TyPanelMotion.ScrimEnter, exit = TyPanelMotion.ScrimExit) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = TyPanelTheme.of(light).scrim))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onClose,
                ),
        )
    }
}
