package io.github.huleixin.tingyu.minimal.ui

import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import io.github.huleixin.tingyu.chrome.TyPanelMotion
import io.github.huleixin.tingyu.chrome.TyPanelScrim
import io.github.huleixin.tingyu.chrome.TyPanelTheme

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/MinimalSheetMotion.kt
//
// 极简播放器的队列 / 工具页进出场。
//
// 第 21 轮（原生化专项）：这里的实现整体上收到 chrome/TyPanelStyle.kt —— 与二级操作面板、
// 支持与交流面板共用同一份遮罩浓度、同一份曲线、同一份时长。本文件保留为**语义别名**，
// 调用点不必改，历史命名（"minimal"）也不会误导成"只有极简页用"。
//
//   打开：底部上滑 + 渐入 260ms，遮罩同步渐显 260ms；
//   关闭：向下滑出 200ms，遮罩同步渐隐 200ms。
//
// 遮罩从各弹窗内部上收到宿主：弹窗本体只滑自己，遮罩只淡自己 —— 上一版没有动画，
// 弹窗是"啪"一下出现的；再上一版遮罩长在弹窗里，会跟着弹窗一起滑，视觉上像整屏在动。

internal fun minimalSheetEnter(): EnterTransition = TyPanelMotion.Enter

internal fun minimalSheetExit(): ExitTransition = TyPanelMotion.Exit

/** 遮罩浓度：与所有面板同一套值（深色 0.55 / 浅色 0.28）。 */
internal fun minimalSheetScrimAlpha(light: Boolean): Float = TyPanelTheme.of(light).scrim

/** 弹窗遮罩：只渐显渐隐，不吃滑移；点击关闭。委托统一实现。 */
@Composable
internal fun MinimalSheetScrim(
    visible: Boolean,
    light: Boolean,
    onClose: () -> Unit,
) {
    TyPanelScrim(visible, light, onClose)
}
