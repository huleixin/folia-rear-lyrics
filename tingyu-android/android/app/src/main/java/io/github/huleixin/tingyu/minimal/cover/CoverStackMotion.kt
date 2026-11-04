package io.github.huleixin.tingyu.minimal.cover

import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.sign
import kotlin.math.sqrt

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/cover/CoverStackMotion.kt
//
// 极小的运动内核：补间 + 弹簧 + 速度估计。只处理标量，不碰 Compose，可以在 JVM 上直接测。
//
// 数值与已验收的 Demo（`src/dev/coverStack/motion.ts`）逐项对齐：
//   · 离场/补位都是 ease-out cubic；
//   · 回弹是阻尼比 0.9 的半隐式欧拉弹簧（只有指尖级过冲，不弹跳）；
//   · 松手速度取最近 100ms 的采样，不是整段拖动的平均值。

/** 缓动曲线。 */
enum class Easing {
    LINEAR,
    OUT_CUBIC;

    fun at(t: Float): Float = when (this) {
        LINEAR -> t
        OUT_CUBIC -> {
            val inv = 1f - t
            1f - inv * inv * inv
        }
    }
}

/** 一次标量补间。到时间后锁在终值，不会过冲。 */
class Tween(
    var from: Float,
    var to: Float,
    durationMs: Float,
    private val easing: Easing = Easing.OUT_CUBIC,
) {
    var duration: Float = durationMs.coerceAtLeast(1f)
    var elapsed: Float = 0f
        private set

    val done: Boolean get() = elapsed >= duration

    fun step(dt: Float): Float {
        elapsed += dt
        val t = (elapsed / duration).coerceIn(0f, 1f)
        return from + (to - from) * easing.at(t)
    }
}

/** 一个弹簧标量。半隐式欧拉，固定 4 个子步 —— 帧率高低不影响手感。 */
class Spring(var value: Float, var velocity: Float = 0f) {
    fun step(target: Float, dt: Float, stiffness: Float = 340f, dampingRatio: Float = 0.9f) {
        val steps = 4
        val h = (min(0.032f, dt / 1000f)) / steps
        val damping = 2f * dampingRatio * sqrt(stiffness)
        repeat(steps) {
            val accel = -stiffness * (value - target) - damping * velocity
            velocity += accel * h
            value += velocity * h
        }
    }

    fun settled(target: Float, epsilon: Float = 0.35f, velocityEpsilon: Float = 6f): Boolean =
        abs(value - target) < epsilon && abs(velocity) < velocityEpsilon
}

/**
 * 禁用方向上的橡皮筋：位移越大越推不动，最多到 [maxDistance] 附近。
 * 队列尽头时用它 —— 封面推得动、但推不远，读起来是"这头没有歌"。
 */
fun rubberBand(distance: Float, maxDistance: Float = 44f, constant: Float = 0.55f): Float {
    val magnitude = abs(distance)
    if (magnitude == 0f) return 0f
    val eased = (1f - 1f / ((magnitude * constant) / 100f + 1f)) * 100f
    return sign(distance) * min(maxDistance, eased)
}

/**
 * 离场目标点 = 松手时的速度方向 × 距离。
 *
 * 只按横向"补足最低横向位移"，**不把封面拉回水平线**：沿左上 / 左下甩出时，封面就沿那条线
 * 继续飞出去，松手那一刻不会突然拐弯。
 */
fun exitTarget(
    direction: DragDirection,
    velocityX: Float,
    velocityY: Float,
    width: Float,
    inertia: Float,
): Pair<Float, Float> {
    // 上一首是"放进最上面"：落点就是正中，不往外飞
    if (direction == DragDirection.PREV) return 0f to 0f
    val speed = hypot(velocityX, velocityY)
    val dirX = if (speed > 1f) velocityX / speed else if (direction == DragDirection.NEXT) -1f else 1f
    val dirY = if (speed > 1f) velocityY / speed else 0f
    val base = width * 1.15f * inertia
    var x = dirX * base
    var y = dirY * base
    if (direction == DragDirection.NEXT) {
        // 保证一定从左 / 右侧离场（偏纵向的甩动也不会停在屏幕里），同时保留原方向
        val minX = width * 0.95f
        if (abs(x) < minX) {
            val k = min(2.2f, minX / maxOf(0.001f, abs(x)))
            x *= k
            y *= k
        }
    }
    return x to y
}

/** 切歌方向。 */
enum class DragDirection { NEXT, PREV }

/**
 * 松手速度采样器：只保留最近 100ms 的采样点。
 *
 * 用整段拖动的平均值会把"很快甩了一下"平均成慢速；用最后一次 pointerMove 的瞬时值又会被
 * 触摸抖动放大。窗口取 100ms 是两者之间唯一稳的点（Demo 实测值）。
 */
class ReleaseVelocity(private val windowMs: Long = 100L) {
    private val times = LongArray(CAPACITY)
    private val xs = FloatArray(CAPACITY)
    private val ys = FloatArray(CAPACITY)

    /** 有效采样数，按时间顺序排在 [0, count)。 */
    private var count = 0

    fun clear() {
        count = 0
    }

    fun add(timeMs: Long, x: Float, y: Float) {
        // 最多 8 个点，整体左移比环形下标好读，代价可以忽略（每次 move 一次 8 元素拷贝）。
        if (count == CAPACITY) {
            for (i in 1 until CAPACITY) {
                times[i - 1] = times[i]
                xs[i - 1] = xs[i]
                ys[i - 1] = ys[i]
            }
            count = CAPACITY - 1
        }
        times[count] = timeMs
        xs[count] = x
        ys[count] = y
        count++
        // 丢掉窗口外的旧点（至少留两个，否则算不出速度）
        while (count > 2 && timeMs - times[0] > windowMs) {
            for (i in 1 until count) {
                times[i - 1] = times[i]
                xs[i - 1] = xs[i]
                ys[i - 1] = ys[i]
            }
            count--
        }
    }

    /**
     * @param nowMs 松手时刻。停手超过 60ms 后按停顿时长线性衰减，避免"停住了还算甩动"。
     * @return vx / vy（px/s）
     */
    fun velocity(nowMs: Long): Pair<Float, Float> {
        if (count < 2) return 0f to 0f
        val last = count - 1
        // 从最后一个点往前收到 110ms 以内
        var start = last
        for (i in last downTo 0) {
            if (times[last] - times[i] > 110L) break
            start = i
        }
        val elapsed = (times[last] - times[start]).toFloat()
        if (elapsed <= 0f) return 0f to 0f
        val idle = (nowMs - times[last]).toFloat()
        val decay = if (idle > 60f) (1f - (idle - 60f) / 220f).coerceAtLeast(0f) else 1f
        val vx = (xs[last] - xs[start]) / elapsed * 1000f * decay
        val vy = (ys[last] - ys[start]) / elapsed * 1000f * decay
        return vx to vy
    }

    private companion object {
        const val CAPACITY = 8
    }
}
