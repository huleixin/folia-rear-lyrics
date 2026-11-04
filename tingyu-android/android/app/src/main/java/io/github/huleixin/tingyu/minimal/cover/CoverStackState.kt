package io.github.huleixin.tingyu.minimal.cover

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/cover/CoverStackState.kt
//
// 相册堆叠的动画器：只认两个标量驱动 + 一张卡片表。
//
//   progress —— 堆叠推进进度（0 = 三层静止，1 = 下一首已接替当前）
//   edgeX/Y  —— 被抽走 / 被放入那一张的二维位移（跟手时由指针直接写入）
//
// 拖动期间**不缓动、不追帧**：指针写多少就是多少，所以是 1:1 跟手；松手后从当前值继续
// （补间或弹簧），不存在"从起点重播"。残影是同图的三份低透明度偏移副本，偏移方向 = 速度
// 反方向，全程没有任何 blur 滤镜。
//
// 所有输出都只落在 graphicsLayer 的 translation/rotation/scale/alpha 上 —— 纯合成层属性，
// 不触发重排版、不重新解码图片、也不进重组。逐帧读的是 Compose 的快照状态，
// 因此只有这几层会被失效，页面其余部分一帧都不会重画。

/** 一层封面的身份。key 与歌曲有关，换层不会重建图层（图片也就不会重新解码）。 */
data class CoverCard(
    /** 稳定身份：`songKey#出现序号`。同一首歌在队列里出现多次时必须是两个条目。 */
    val key: String,
    val songKey: String,
    val title: String,
    val artist: String,
    val artwork: String,
    /** p=0 时的层位 */
    val from: Float,
    /** p=1 时的层位 */
    val to: Float,
    /** 正在被抽走或放入的那一张：二维位移由 edgeX / edgeY 驱动 */
    val moving: Boolean = false,
    /** 补位延迟：越深的层起步越晚一点，避免几张封面完全同步移动 */
    val lag: Float = 0f,
)

enum class StackPhase { IDLE, DRAG, COMMIT, SPRING }

class CoverStackState(spec: CoverStackSpec = CoverStackSpec()) {

    var spec: CoverStackSpec = spec
        private set

    var pxPerDp: Float = 1f
        private set

    /** 封面边长（px）。布局完成后才知道，之前是 0（此时不画、也不接手势）。 */
    var width: Float = 0f
        private set

    var phase by mutableStateOf(StackPhase.IDLE)
        private set

    var cards by mutableStateOf<List<CoverCard>>(emptyList())
        private set

    var progress by mutableFloatStateOf(0f)
        private set

    var edgeX by mutableFloatStateOf(0f)
        private set

    var edgeY by mutableFloatStateOf(0f)
        private set

    /**
     * 系统关闭动画时的降级：位移仍是 1:1 跟手（那是交互本身，不是动画），
     * 但松手后不再补间/回弹，而是直接落到终态 —— 与 prefers-reduced-motion 的语义一致。
     */
    var motionEnabled: Boolean = true

    /** 残影透明度（已含档位与强度倍率），只由速度决定。 */
    var trailAlpha by mutableFloatStateOf(0f)
        private set

    var velocityX: Float = 0f
        private set
    var velocityY: Float = 0f
        private set

    private var frames: List<SlotFrame> = buildSlotFrames(spec, 1f)
    private val scratch = FloatArray(4)
    private var lastEdgeX = 0f
    private var lastEdgeY = 0f

    private var tweenP: Tween? = null
    private var tweenX: Tween? = null
    private var tweenY: Tween? = null
    private var springP: Spring? = null
    private var springX: Spring? = null
    private var springY: Spring? = null
    private var leaving = false

    /** 提交动画跑完（此时 progress=1，卡片已在新层位上）。 */
    var onCommitDone: (() -> Unit)? = null

    /** 回弹跑完（三层已回到静止姿态）。 */
    var onSpringDone: (() -> Unit)? = null

    /** 帧循环用：动画阶段是否还需要下一帧。 */
    val animating: Boolean get() = phase != StackPhase.IDLE

    fun updateSpec(next: CoverStackSpec) {
        if (next == spec) return
        spec = next
        frames = buildSlotFrames(spec, pxPerDp)
    }

    fun setSize(widthPx: Float, density: Float) {
        val densityChanged = abs(density - pxPerDp) > 0.001f
        if (abs(widthPx - width) < 0.5f && !densityChanged) return
        width = widthPx
        pxPerDp = density
        frames = buildSlotFrames(spec, pxPerDp)
    }

    fun applyCards(next: List<CoverCard>) {
        cards = next
    }

    // ---- 拖动（指针直接写入，1:1）----

    fun drag(nextEdgeX: Float, nextEdgeY: Float, nextProgress: Float) {
        if (phase != StackPhase.DRAG) {
            phase = StackPhase.DRAG
            tweenP = null
            tweenX = null
            tweenY = null
            springP = null
            springX = null
            springY = null
            lastEdgeX = nextEdgeX
            lastEdgeY = nextEdgeY
        }
        edgeX = nextEdgeX
        edgeY = nextEdgeY
        progress = nextProgress
        measure(16.7f)
        writeTrail()
    }

    // ---- 松手确认 ----

    fun beginCommit(
        direction: DragDirection,
        fromProgress: Float,
        fromX: Float,
        fromY: Float,
        velocityX: Float,
        velocityY: Float,
    ) {
        if (!motionEnabled) {
            // 关闭动画：一帧内落到终态，由 onCommitDone 去换静止卡片表
            progress = 1f
            edgeX = 0f
            edgeY = 0f
            trailAlpha = 0f
            phase = StackPhase.IDLE
            onCommitDone?.invoke()
            return
        }
        progress = fromProgress
        edgeX = fromX
        edgeY = fromY
        phase = StackPhase.COMMIT
        leaving = direction == DragDirection.NEXT
        val (targetX, targetY) = exitTarget(direction, velocityX, velocityY, width, spec.inertia)
        val duration = if (direction == DragDirection.NEXT) spec.exitDurationMs else spec.exitDurationMs * 1.2f
        val remain = 1f - fromProgress
        tweenP = Tween(fromProgress, 1f, spec.promoteDurationMs * (0.35f + 0.65f * remain))
        tweenX = Tween(fromX, targetX, duration)
        tweenY = Tween(fromY, targetY, duration)
        lastEdgeX = fromX
        lastEdgeY = fromY
    }

    // ---- 未达阈值：柔和回弹 ----

    fun springBack() {
        if (!motionEnabled) {
            progress = 0f
            edgeX = 0f
            edgeY = 0f
            trailAlpha = 0f
            phase = StackPhase.IDLE
            onSpringDone?.invoke()
            return
        }
        phase = StackPhase.SPRING
        springP = Spring(progress)
        springX = Spring(edgeX)
        springY = Spring(edgeY)
        lastEdgeX = edgeX
        lastEdgeY = edgeY
    }

    /** 回到静止：卡片表由调用方给定，progress / edge 归零（与提交结束时的位置精确重合）。 */
    fun rest(nextCards: List<CoverCard>) {
        cards = nextCards
        progress = 0f
        edgeX = 0f
        edgeY = 0f
        velocityX = 0f
        velocityY = 0f
        trailAlpha = 0f
        leaving = false
        tweenP = null
        tweenX = null
        tweenY = null
        springP = null
        springX = null
        springY = null
        phase = StackPhase.IDLE
        lastEdgeX = 0f
        lastEdgeY = 0f
    }

    /** 直接掐断动画（页面切换、队列被外部改写）：不跑回调，落回静止。 */
    fun cancel() {
        tweenP = null
        tweenX = null
        tweenY = null
        springP = null
        springX = null
        springY = null
        phase = StackPhase.IDLE
        trailAlpha = 0f
    }

    /**
     * 推进一帧。
     *
     * @param elapsedMs 与上一帧的真实间隔（未截断，用于测速）；内部步长另按 48ms 截断，
     *                  避免主线程卡一下之后一帧把动画走完。
     * @return 是否还需要下一帧
     */
    fun step(elapsedMs: Float): Boolean {
        val dt = min(48f, elapsedMs)
        when (phase) {
            StackPhase.COMMIT -> {
                tweenP?.let { progress = it.step(dt) }
                tweenX?.let { edgeX = it.step(dt) }
                tweenY?.let { edgeY = it.step(dt) }
                measure(elapsedMs)
                writeTrail()
                val done = (tweenP?.done ?: true) && (tweenX?.done ?: true) && (tweenY?.done ?: true)
                if (done) {
                    progress = 1f
                    phase = StackPhase.IDLE
                    onCommitDone?.invoke()
                    return false
                }
                return true
            }

            StackPhase.SPRING -> {
                springP?.let { it.step(0f, dt); progress = it.value }
                springX?.let { it.step(0f, dt); edgeX = it.value }
                springY?.let { it.step(0f, dt); edgeY = it.value }
                measure(elapsedMs)
                writeTrail()
                val settled = (springP?.settled(0f) ?: true) &&
                    (springX?.settled(0f) ?: true) &&
                    (springY?.settled(0f) ?: true)
                if (settled) {
                    progress = 0f
                    edgeX = 0f
                    edgeY = 0f
                    velocityX = 0f
                    velocityY = 0f
                    trailAlpha = 0f
                    phase = StackPhase.IDLE
                    onSpringDone?.invoke()
                    return false
                }
                return true
            }

            StackPhase.DRAG -> {
                // 位置由指针写入，这里只负责测速，让停手后残影自然消失
                measure(elapsedMs)
                writeTrail()
                return true
            }

            StackPhase.IDLE -> return false
        }
    }

    /**
     * 用两帧之间的真实间隔估速。
     *
     * 这里刻意用**未截断**的 elapsed：主线程卡一下再回来时位移很大、间隔也很长，用截断后的 dt
     * 会把慢拖算成甩动、凭空生出拖影（Demo 就是这么踩到的）。
     */
    private fun measure(elapsedMs: Float) {
        if (elapsedMs > 70f) {
            velocityX *= 0.4f
            velocityY *= 0.4f
        } else if (elapsedMs > 0f) {
            val instantX = (edgeX - lastEdgeX) / elapsedMs * 1000f
            val instantY = (edgeY - lastEdgeY) / elapsedMs * 1000f
            velocityX = velocityX * 0.55f + instantX * 0.45f
            velocityY = velocityY * 0.55f + instantY * 0.45f
        }
        lastEdgeX = edgeX
        lastEdgeY = edgeY
    }

    /** 残影强度：只看速度。慢速恒为 0，离场到底立刻归零。 */
    private fun writeTrail() {
        if (!motionEnabled) {
            trailAlpha = 0f
            return
        }
        val multiplier = spec.trail.scale(spec.trailStrength)
        if (multiplier <= 0f) {
            trailAlpha = 0f
            return
        }
        val speed = speed()
        if (speed < TRAIL_START_SPEED) {
            trailAlpha = 0f
            return
        }
        if (leaving && hypot(edgeX, edgeY) > width * TRAIL_CUTOFF) {
            trailAlpha = 0f
            return
        }
        val t = ((speed - TRAIL_START_SPEED) / (TRAIL_FULL_SPEED - TRAIL_START_SPEED)).coerceIn(0f, 1f)
        trailAlpha = TRAIL_BASE_ALPHA * t * multiplier
    }

    fun speed(): Float = hypot(velocityX, velocityY)

    /**
     * 某一层当前的层位（小数）。0 当前 / 1 下一首 / 2 下下首 / 3 藏在后面。
     *
     * 深层用经过延迟重映射的进度：`progress` 到 1 时仍然精确落在目标层，
     * 中途比前一层慢半拍 —— 三张封面因此不会齐步走。
     */
    fun slotFor(card: CoverCard): Float {
        val local = if (card.lag > 0f) {
            max(0f, (progress - card.lag) / (1f - card.lag))
        } else {
            progress
        }
        return card.from + (card.to - card.from) * local
    }

    /**
     * 某一层当前帧的 `[x, y, scale, rot]`。
     *
     * 复用同一个数组：只允许在当帧的 graphicsLayer 块里立即读掉，不要持引用。
     * 读到 progress / edgeX 这些快照状态，因此会把这一个图层标脏，而不会引起重组。
     */
    fun frameFor(card: CoverCard): FloatArray {
        frameAt(frames, slotFor(card), scratch)
        if (card.moving) {
            scratch[0] += edgeX
            scratch[1] += edgeY
            if (spec.dragTilt > 0f && width > 0f) {
                val tilt = (edgeX / (width * 0.5f)).coerceIn(-1f, 1f) * spec.dragTilt
                scratch[3] += tilt
            }
        }
        return scratch
    }

    /** 残影副本：沿速度反方向铺开，越靠后越淡。返回 `[dx, dy, alpha]`。 */
    fun ghostAt(index: Int, count: Int): FloatArray {
        val weight = (index + 1).toFloat() / count
        val speed = speed()
        val ux = if (speed > 0.01f) -velocityX / speed else 0f
        val uy = if (speed > 0.01f) -velocityY / speed else 0f
        val distance = min(30f, speed * 0.01f)
        scratchGhost[0] = ux * distance * weight
        scratchGhost[1] = uy * distance * weight
        scratchGhost[2] = (trailAlpha * weight * 0.9f).coerceIn(0f, 1f)
        return scratchGhost
    }

    private val scratchGhost = FloatArray(3)

    /** 诊断/测试用快照。 */
    fun describe(): String =
        "phase=$phase p=$progress edge=($edgeX,$edgeY) speed=${speed()} trail=$trailAlpha cards=${
            cards.joinToString(",") { "${it.songKey.take(8)}@${it.from}->${it.to}${if (it.moving) "*" else ""}" }
        }"

    private companion object {
        /** 残影起点速度：低于它完全不产生拖影（慢拖必须完全清晰）。 */
        const val TRAIL_START_SPEED = 380f
        /** 残影达到上限的速度。 */
        const val TRAIL_FULL_SPEED = 1600f
        /** 残影基础透明度上限。 */
        const val TRAIL_BASE_ALPHA = 0.2f
        /** 离场超过这个距离（相对封面宽度）立刻结束拖影。 */
        const val TRAIL_CUTOFF = 1.05f
    }
}
