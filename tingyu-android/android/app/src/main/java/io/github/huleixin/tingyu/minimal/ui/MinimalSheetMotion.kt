package io.github.huleixin.tingyu.minimal.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.CubicBezierEasing
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/MinimalSheetMotion.kt
//
// 统一的底部弹窗运动（第 15 轮）：队列与四个工具页共用一份，Compose / WebView 两侧同一节奏。
//
//   打开：底部上滑 + 渐入 260ms，遮罩同步渐显 260ms；
//   关闭：向下滑出 200ms，遮罩同步渐隐 200ms。
//
// 遮罩从各弹窗内部上收到宿主：弹窗本体只滑自己，遮罩只淡自己 —— 上一版没有动画，
// 弹窗是"啪"一下出现的；再上一版遮罩长在弹窗里，会跟着弹窗一起滑，视觉上像整屏在动。

internal val MinimalSheetEaseIn = CubicBezierEasing(0.2f, 0.7f, 0.2f, 1f)
internal val MinimalSheetEaseOut = CubicBezierEasing(0.42f, 0f, 0.74f, 0.3f)

internal fun minimalSheetEnter(): EnterTransition = slideInVertically(
    animationSpec = tween(260, easing = MinimalSheetEaseIn),
    initialOffsetY = { it },
) + fadeIn(tween(200, easing = MinimalSheetEaseIn))

internal fun minimalSheetExit(): ExitTransition = slideOutVertically(
    animationSpec = tween(200, easing = MinimalSheetEaseOut),
    targetOffsetY = { it },
) + fadeOut(tween(140, easing = MinimalSheetEaseOut))

/** 遮罩浓度：与队列/工具页 theme.scrim 同一套值，收在这里让宿主不必感知主题结构。 */
internal fun minimalSheetScrimAlpha(light: Boolean): Float = if (light) 0.28f else 0.55f

/** 弹窗遮罩：只渐显渐隐，不吃滑移；点击关闭。 */
@Composable
internal fun MinimalSheetScrim(
    visible: Boolean,
    light: Boolean,
    onClose: () -> Unit,
) {
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(260, easing = MinimalSheetEaseIn)),
        exit = fadeOut(tween(200, easing = MinimalSheetEaseOut)),
    ) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = minimalSheetScrimAlpha(light)))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onClose,
                ),
        )
    }
}
