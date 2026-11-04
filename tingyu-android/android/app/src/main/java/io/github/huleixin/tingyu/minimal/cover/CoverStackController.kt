package io.github.huleixin.tingyu.minimal.cover

import android.os.SystemClock
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import io.github.huleixin.tingyu.minimal.MinimalQueue
import io.github.huleixin.tingyu.minimal.MinimalTrack

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/cover/CoverStackController.kt
//
// 封面堆叠的**唯一**过渡控制器。四个入口共用它：左滑、右滑、上一首按钮、下一首按钮，
// 外加"播放器自己切了歌"（自动续播、通知栏、队列点播）。
//
// 三条规矩：
//   1. 一次切歌只发一条播放命令，命令在 JS 侧推进队列；这里绝不自己改播放状态。
//   2. 动画先按"我们期望的那一首"走，真实播放状态回来后再确认；确认不了就退回真实那一首。
//   3. 拖动期间不接受新手势；提交期间也不接受 —— 连点两次只切一首。

/** 一次我们发起的切歌，等待真实播放状态确认。 */
private data class Pending(val direction: DragDirection, val expected: String)

class CoverStackController(
    val state: CoverStackState,
    private val artwork: CoverStackArtwork,
    /** 发"下一首"命令；返回 false 表示这一条没有接收方（桥断了）。 */
    private val sendNext: () -> Boolean,
    /** 发"上一首"命令。 */
    private val sendPrevious: () -> Boolean,
) {
    /** 三层封面当前对应的真实曲目（来自播放状态 + 逻辑歌单）。 */
    var window by mutableStateOf(CoverWindow())
        private set

    private var pending: Pending? = null
    private var committedDirection: DragDirection? = null

    /** 拖动开始前的静止三层：回弹结束后精确恢复它，不从窗口重算。 */
    private var restBeforeDrag: List<CoverCard>? = null

    /** 提交结束后等真实播放状态的宽限时刻（uptimeMillis）。 */
    private var graceUntil = 0L

    init {
        state.onCommitDone = { onCommitDone() }
        state.onSpringDone = { onSpringDone() }
    }

    // ---- 与播放状态同步 ----

    /**
     * 每次播放状态发布时调用：刷新三层预览、预取封面，并在身份对不上时对齐。
     *
     * @param force 忽略宽限期（宽限到点后的兜底检查）
     */
    fun sync(track: MinimalTrack, queue: MinimalQueue, force: Boolean = false) {
        val resolved = resolveCoverWindow(track, queue = queue)
        window = resolved
        artwork.prime(listOf(resolved.current, resolved.next, resolved.next2, resolved.next3, resolved.previous))
        if (state.phase != StackPhase.IDLE) return

        val topKey = state.cards.firstOrNull()?.songKey.orEmpty()
        val liveKey = resolved.current?.songKey.orEmpty()

        // 身份一致：只在"后两层真的变了"时换表（队列被编辑 / 随机计划推进）
        if (topKey == liveKey) {
            val rest = restCards(resolved)
            if (rest.map { it.key } != state.cards.map { it.key }) state.rest(rest)
            if (pending?.expected == liveKey) pending = null
            return
        }

        if (!force) {
            // 我们刚切过去、播放状态还没追上：给它一点时间，不要立刻把封面拽回去
            val wait = pending
            if (wait != null && topKey == wait.expected && SystemClock.uptimeMillis() < graceUntil) return
        }

        // 真的没歌了：一层都不画
        if (liveKey.isEmpty()) {
            state.rest(emptyList())
            pending = null
            return
        }

        // 真实播放状态已经换到"屏幕上第二张"那一首：这就是一次切歌，补一段动画
        if (state.cards.getOrNull(1)?.songKey == liveKey) {
            animateExternalNext(resolved)
            return
        }

        // 外部跳转（队列点播、通知栏上一首）：不硬凑动画，直接换静止三层
        state.rest(restCards(resolved))
        pending = null
    }

    // ---- 按钮入口 ----

    /**
     * 底部上一首 / 下一首。没有手指轨迹，走默认路径（不产生残影）。
     *
     * @return 是否由这里接管了这次点击。false 时调用方应该退回原来的命令入口 ——
     *         比如逻辑歌单还没同步、这里判断不出下一首，但 JS 侧其实能切。
     */
    fun skip(direction: DragDirection): Boolean {
        if (state.phase != StackPhase.IDLE) return true
        if (!canGo(direction)) return false
        val list = transitionCards(direction, window)
        if (list.size < 2) return false
        val sent = if (direction == DragDirection.NEXT) sendNext() else sendPrevious()
        if (!sent) return false
        restBeforeDrag = state.cards
        state.applyCards(list)
        pending = Pending(direction, expectedKey(direction))
        committedDirection = direction
        state.beginCommit(
            direction = direction,
            fromProgress = 0f,
            fromX = if (direction == DragDirection.NEXT) 0f else -state.width,
            fromY = 0f,
            velocityX = 0f,
            velocityY = 0f,
        )
        return true
    }

    // ---- 手势入口 ----

    fun canGo(direction: DragDirection): Boolean =
        if (direction == DragDirection.NEXT) window.canGoNext else window.canGoPrev

    /** 方向锁定：立刻换成过渡卡片表（否则 edge 没有作用对象，封面不会跟手）。 */
    fun onGestureLocked(direction: DragDirection, blocked: Boolean) {
        if (state.phase == StackPhase.COMMIT) return
        restBeforeDrag = state.cards
        if (blocked) {
            // 这一头没有歌：只让最上面那张推一下再弹回来
            val nudge = buildCards(
                window.restEntries(),
                listOf(
                    CardSlot(0f, 0f, moving = true),
                    CardSlot(1f, 1f, moving = false),
                    CardSlot(2f, 2f, moving = false),
                ),
            )
            state.applyCards(nudge)
            return
        }
        state.applyCards(transitionCards(direction, window))
    }

    /**
     * 松手确认：从松手时的位置与速度继续，不回到起点。
     *
     * @return 命令是否发出；false 时调用方应回弹
     */
    fun onGestureCommit(
        direction: DragDirection,
        velocityX: Float,
        velocityY: Float,
    ): Boolean {
        if (state.phase == StackPhase.COMMIT) return false
        val sent = if (direction == DragDirection.NEXT) sendNext() else sendPrevious()
        if (!sent) return false
        pending = Pending(direction, expectedKey(direction))
        committedDirection = direction
        state.beginCommit(
            direction = direction,
            fromProgress = state.progress,
            fromX = state.edgeX,
            fromY = state.edgeY,
            velocityX = velocityX,
            velocityY = velocityY,
        )
        return true
    }

    /** 手势取消（系统收回指针 / 多指）：已锁定就柔和回弹。 */
    fun onGestureCancel() {
        if (state.phase != StackPhase.DRAG) return
        guillotineSpring()
    }

    /** 未达阈值：柔和回弹。 */
    fun onGestureSpring() {
        if (state.phase == StackPhase.COMMIT) return
        guillotineSpring()
    }

    private fun guillotineSpring() {
        state.springBack()
    }

    // ---- 动画收尾 ----

    private fun onCommitDone() {
        val direction = committedDirection ?: return
        committedDirection = null
        val cards = state.cards
        val nextCards = when (direction) {
            // 抽走的那张已经离场；其余各上移一层
            DragDirection.NEXT -> cards.drop(1)
            // 放进来的那张落在最上面；最后那张已经退到看不见的层位
            DragDirection.PREV -> cards.dropLast(1)
        }
        val rest = nextCards.mapIndexed { index, card ->
            card.copy(from = index.toFloat(), to = index.toFloat(), moving = false, lag = 0f)
        }
        state.rest(rest)
        graceUntil = SystemClock.uptimeMillis() + GRACE_MS
        artwork.prime(
            listOf(window.current, window.next, window.next2, window.next3, window.previous),
        )
    }

    private fun onSpringDone() {
        val restore = restBeforeDrag
        restBeforeDrag = null
        // 回弹只恢复姿态，不换身份：拖动没确认，封面就不该换歌。
        // 用拖动前的那张表，而不是从窗口重算 —— 弹簧跑的这一两百毫秒里队列可能刚好变了。
        val rest = restore?.mapIndexed { index, card ->
            card.copy(from = index.toFloat(), to = index.toFloat(), moving = false, lag = 0f)
        } ?: restCards(window)
        state.rest(rest)
    }

    /**
     * 播放器自己切到了下一首（自动续播 / 通知栏 / 队列）：补一段"抽走"动画。
     *
     * 卡片身份沿用屏幕上已有的那三张 + 新的第四张，所以不会因为队列同步慢半拍而跳歌。
     */
    private fun animateExternalNext(resolved: CoverWindow) {
        val moving = state.cards.getOrNull(0) ?: return
        val second = state.cards.getOrNull(1) ?: return
        val third = state.cards.getOrNull(2)
        val fourth = resolved.next2
        val entries = listOf<CoverEntry?>(
            CoverEntry(moving.songKey, moving.title, moving.artist, moving.artwork),
            CoverEntry(second.songKey, second.title, second.artist, second.artwork),
            third?.let { CoverEntry(it.songKey, it.title, it.artist, it.artwork) },
            fourth,
        )
        val list = buildCards(entries, slotsFor(DragDirection.NEXT))
        restBeforeDrag = state.cards
        state.applyCards(list)
        committedDirection = DragDirection.NEXT
        state.beginCommit(DragDirection.NEXT, 0f, 0f, 0f, 0f, 0f)
    }

    private fun expectedKey(direction: DragDirection): String =
        (if (direction == DragDirection.NEXT) window.next else window.previous)?.songKey.orEmpty()

    private companion object {
        /** 提交结束后等真实播放状态的宽限：网络取地址再切歌，几百毫秒到两秒都正常。 */
        const val GRACE_MS = 2_500L
    }
}
