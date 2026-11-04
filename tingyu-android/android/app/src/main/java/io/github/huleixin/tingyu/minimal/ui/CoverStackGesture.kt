package io.github.huleixin.tingyu.minimal.ui

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.PointerInputScope
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import io.github.huleixin.tingyu.minimal.cover.CoverStackController
import io.github.huleixin.tingyu.minimal.cover.CoverStackSpec
import io.github.huleixin.tingyu.minimal.cover.CoverStackState
import io.github.huleixin.tingyu.minimal.cover.DragDirection
import io.github.huleixin.tingyu.minimal.cover.ReleaseVelocity
import io.github.huleixin.tingyu.minimal.cover.StackPhase
import io.github.huleixin.tingyu.minimal.cover.rubberBand
import kotlin.math.abs
import kotlin.math.max

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/CoverStackGesture.kt
//
// 封面上的二维拖动手势。和已验收的 Demo 是同一套状态机（useStackGesture.ts）：
//
//   1. 8dp 阈值 + 0.7 方向锁：以纵向为主的手势**不接管**，交还给页面（pager / 歌词滚动）；
//   2. 锁定之后每一点位移都直接写进 translate3d —— 不缓动、不追帧，所以是 1:1 跟手；
//   3. 锁定那一刻就 consume，父级的 HorizontalPager 因此收不到这个手势（一次手势只有一个主人）；
//   4. 切歌判定以横向为主：位移 ≥ 25% 宽度，或横向速度 ≥ 850px/s 且位移 ≥ 10% 宽度；
//   5. 松手速度取最近 100ms 的采样（不是整段平均），停手超过 60ms 会自然衰减；
//   6. 多指 / pointer cancel（系统返回手势、页面开始滚动）一律柔和回弹，不发命令。
//
// 手势所有权由**按下那一刻的位置**决定：只有在这块封面区域里按下的指针才会走到这里，
// 从别处开始的滑动完全不经过本组件 —— 页面切换、歌词页左右滑都不受影响。

/** 把封面拖动手势挂到某个区域上。调用方负责把这个 modifier 只加在封面区域。 */
fun Modifier.coverStackDrag(
    state: CoverStackState,
    controller: CoverStackController,
): Modifier = pointerInput(state, controller) {
    val slop = CoverStackSpec.GESTURE_SLOP_DP.dp.toPx()
    try {
        dragOnce(state, controller, slop)
    } finally {
        // 指针被系统收回（ACTION_CANCEL、节点被移出组合、页面切走）时 Compose 会取消这个协程，
        // 循环里来不及收尾。只要还停在拖动相位就柔和回弹 —— 绝不能把封面留在半路。
        if (state.phase == StackPhase.DRAG) controller.onGestureCancel()
    }
}

private suspend fun PointerInputScope.dragOnce(
    state: CoverStackState,
    controller: CoverStackController,
    slop: Float,
) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Main)
        val pointerId = down.id
        val startX = down.position.x
        val startY = down.position.y
        val velocity = ReleaseVelocity()
        velocity.add(down.uptimeMillis, startX, startY)

        var locked = false
        var blocked = false
        var direction = DragDirection.NEXT
        var dx = 0f
        var dy = 0f
        var upTime = down.uptimeMillis

        while (true) {
            val event = awaitPointerEvent(PointerEventPass.Main)
            val change = event.changes.firstOrNull { it.id == pointerId } ?: break
            dx = change.position.x - startX
            dy = change.position.y - startY
            upTime = change.uptimeMillis

            if (!locked) {
                // 单击、被父级接管、纵向手势、多指：都不归封面。
                if (!change.pressed) break
                if (change.isConsumed) break
                if (event.changes.size > 1) break
                if (max(abs(dx), abs(dy)) < slop) continue
                if (abs(dx) < abs(dy) * CoverStackSpec.AXIS_RATIO) break
                locked = true
                direction = if (dx < 0f) DragDirection.NEXT else DragDirection.PREV
                blocked = !controller.canGo(direction)
                controller.onGestureLocked(direction, blocked)
            }

            if (event.changes.size > 1) {
                // 拖动中来了第二根手指：整次作废，柔和回弹
                controller.onGestureCancel()
                return@awaitEachGesture
            }

            if (!change.pressed) {
                val (vx, vy) = velocity.velocity(upTime)
                val travel = if (direction == DragDirection.NEXT) -dx else dx
                val signedVx = if (direction == DragDirection.NEXT) -vx else vx
                val spec = state.spec
                val width = state.width
                val distanceOk = width > 0f && travel >= width * spec.commitDistance
                // 甩动只看横向分量：纯上下滑不该切歌
                val flingOk = width > 0f && signedVx >= spec.flingVelocity &&
                    travel >= width * spec.flingMinDistance
                val committed = !blocked && (distanceOk || flingOk) &&
                    controller.onGestureCommit(direction, vx, vy)
                if (!committed) controller.onGestureSpring()
                return@awaitEachGesture
            }

            // 已经开始拖：这一下的位移归封面，父级 pager 收到的是"已被消费"
            change.consume()
            velocity.add(change.uptimeMillis, change.position.x, change.position.y)
            applyDrag(state, blocked, direction, dx, dy)
        }

        // 循环里 break 出来的情况：只要锁定过就要回弹，不能把封面留在半路
        if (locked) controller.onGestureCancel()
    }
}

/** 位移 → (edgeX, edgeY, 推进进度)。与 Demo 的公式逐项一致。 */
private fun applyDrag(
    state: CoverStackState,
    blocked: Boolean,
    direction: DragDirection,
    dx: Float,
    dy: Float,
) {
    val width = state.width
    if (width <= 0f) return
    if (blocked) {
        // 这一头没有歌：两个方向都给橡皮筋阻力，松手弹回
        val limit = minOf(64f * (width / 320f), width * 0.2f)
        state.drag(rubberBand(dx, limit), rubberBand(dy, limit), 0f)
        return
    }
    val next = direction == DragDirection.NEXT
    val towardMode = if (next) dx <= 0f else dx >= 0f
    // 位移严格等于手指位移；反向越过起点时给一点阻力，读起来像"推不动"
    val edgeX = if (next) {
        if (dx <= 0f) dx else dx * 0.3f
    } else {
        (if (dx >= 0f) dx else dx * 0.3f) - width
    }
    val edgeY = if (towardMode) dy else dy * 0.3f
    val travel = if (next) -dx else dx
    val span = width * CoverStackSpec.DRAG_SPAN_RATIO
    val progress = (travel.coerceIn(0f, span) / span) * CoverStackSpec.DRAG_PROGRESS_LIMIT
    state.drag(edgeX, edgeY, progress)
}
