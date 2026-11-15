package io.github.huleixin.tingyu.minimal.immersive.port

import android.os.SystemClock
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalHapticFeedback

// SPDX-License-Identifier: GPL-3.0-only
// Ported from lladlam/MeloX-Android 0.7.3, c04f36b9af540806b3bb185b347572e9ca12d87d.
// Tingyu: existing state, permitted system fonts and local artwork; no upstream business services.


/**
 * 统一触感出口。
 *
 * 所有触感都先过 `MeloXSettingsRuntime.hapticFeedbackEnabled`，
 * 关掉「触感」开关后整层静默（与既有 Confirm/LongPress 反馈一致）。
 * 返回的是一个稳定 lambda（见 `remember`），可在手势回调里安全捕获。
 */
@Composable
fun meloXHaptic(): (HapticFeedbackType) -> Unit {
    // `LocalHapticFeedback.current` is a @Composable read and cannot live inside
    // the `remember` calculation lambda; read it first, then capture it.
    val haptic = LocalHapticFeedback.current
    return remember(haptic) {
        { type: HapticFeedbackType ->
            if (MeloXSettingsRuntime.hapticFeedbackEnabled) {
                haptic.performHapticFeedback(type)
            }
        }
    }
}

/** 选中/切换/落点：轻、短。tab 点击、翻页、手势落到目标都用它。 */
fun meloXSelectionHaptic(haptic: (HapticFeedbackType) -> Unit) =
    haptic(HapticFeedbackType.SegmentTick)

/**
 * **系统级**弹簧落定震动（2026-10-06）。
 *
 * ⚠⚠⚠ vivo（V2505A）的 `Vibrator` 系统服务**不可用**（`dumpsys vibrator` 空、
 *   `cmd vibrator` 报 "Can't find service"）⇒ `Vibrator.vibrate()` 静默失败。
 *   但 Compose 的 `performHapticFeedback` 在同一台设备上**能出震动**
 *   （tab 点击那处一直在用）。
 *
 * 走 View 层 `performHapticFeedback` —— 它经过 ROM 的兼容层，
 * vivo OriginOS 对 View 层反馈做了适配，对裸 `Vibrator` API 没做。
 *
 * @param type 触感类型，默认 `LongPress`（重、闷，适合播放器弹簧落定）。
 *   底栏 tab 展开/收缩可用 `Confirm`（中重、有"啪"的确认感，更像弹簧回弹）。
 *
 * 服从 `MeloXSettingsRuntime.hapticFeedbackEnabled`。
 */
@Composable
fun rememberSpringThump(
    type: HapticFeedbackType = HapticFeedbackType.LongPress,
): () -> Unit {
    val haptic = LocalHapticFeedback.current
    return remember(haptic, type) {
        {
            if (MeloXSettingsRuntime.hapticFeedbackEnabled) {
                haptic.performHapticFeedback(type)
            }
        }
    }
}

/**
 * 列表触顶/触底「顶到边继续推」的橡胶回弹触感。
 *
 * 挂在 LazyColumn / LazyVerticalGrid 上，靠 NestedScroll 拿到底到顶/到边之后
 * 手指还在往边外推的位移，此时点一下轻 tick，模仿 iOS 的 rubber-band 回弹反馈。
 *
 * ⚠ **必须在 `onPreScroll` 判**：`onPostScroll` 只在子滚动容器**真的消费了**位移时才
 *   被回调；列表已经顶在边界上时消费量为 0，整个 nested scroll 派发被短路，
 *   `onPostScroll` 一次都收不到 ⇒ 手感是「完全没震动」。
 *   `onPreScroll` 在子容器消费**之前**就被调用，每一个拖拽/惯性增量都会走到这里，
 *   因此可以在「本来就没法再滚」的方向上拿到推边增量。
 *   （同代码库的 `PullToRefreshBox` 就是靠 `onPreScroll` 判下拉触边的。）
 *
 * 一个「顶住边」的连续手势只响一次：抬起再按才响第二次。
 */
@Composable
fun Modifier.meloXEdgeOverscrollHaptic(
    listState: LazyListState,
    minDeltaPx: Float = 1f,
    gestureGapMs: Long = 90L,
): Modifier {
    val haptic = meloXHaptic()
    val connection = remember(listState, minDeltaPx, gestureGapMs) {
        object : NestedScrollConnection {
            // 当前 episode：-1 = 顶边在响、1 = 底边在响、0 = 没有在推边
            private var edgeSide = 0
            private var lastDeltaMs = -1L

            private fun fireEdge(side: Int, now: Long) {
                val freshGesture = edgeSide != side || now - lastDeltaMs >= gestureGapMs
                if (edgeSide == 0 || freshGesture) {
                    edgeSide = side
                    haptic(HapticFeedbackType.SegmentTick)
                }
                lastDeltaMs = now
            }

            /**
             * 返回本次增量推的边：
             *   -1 顶边（拖向列表开头） / 1 底边（拖向列表末尾） / 0 不是推边。
             */
            private fun edgeFor(dy: Float): Int {
                // ⚠ 列表整体既上滚不动、下也滚不动（内容不足一屏）⇒ 不给震动，
                //   否则空列表一推就响，像坏了。
                if (!listState.canScrollBackward && !listState.canScrollForward) return 0
                return when {
                    // 拖向开头 ⇒ 位移为负；到顶了还在往这方向推 ⇒ 顶边
                    dy < -minDeltaPx && !listState.canScrollBackward -> -1
                    // 拖向末尾 ⇒ 位移为正；到底了还在往这方向推 ⇒ 底边
                    dy > minDeltaPx && !listState.canScrollForward -> 1
                    else -> 0
                }
            }

            override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
                val side = edgeFor(available.y)
                if (side != 0) {
                    fireEdge(side, SystemClock.uptimeMillis())
                } else {
                    edgeSide = 0
                    lastDeltaMs = SystemClock.uptimeMillis()
                }
                // ⚠ 一律返回 Zero：不消费任何增量，列表滚动行为与原生完全一致。
                return Offset.Zero
            }

            /**
             * 惯性（fling）落到边界时的补充判定点：这一段不走 onPreScroll，
             * 而是靠「剩余没被消费的位移」判断。与 onPreScroll 共用 episode 状态，
             * 同一个推边动作不会响两次。
             */
            override fun onPostScroll(
                available: Offset,
                consumed: Offset,
                source: NestedScrollSource,
            ): Offset {
                val leftover = available.y - consumed.y
                if (source == NestedScrollSource.Fling) {
                    val side = when {
                        leftover < -minDeltaPx && !listState.canScrollBackward -> -1
                        leftover > minDeltaPx && !listState.canScrollForward -> 1
                        else -> 0
                    }
                    if (side != 0) fireEdge(side, SystemClock.uptimeMillis())
                }
                return Offset.Zero
            }
        }
    }
    return this.then(Modifier.nestedScroll(connection))
}
