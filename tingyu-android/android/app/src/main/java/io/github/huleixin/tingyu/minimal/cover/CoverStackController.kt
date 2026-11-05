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
    /** 发"下一首"命令；返回 false 表示这一条没有接收方（桥断了）。requestId 随命令过桥供日志对齐。 */
    private val sendNext: (requestId: Long) -> Boolean,
    /** 发"上一首"命令。 */
    private val sendPrevious: (requestId: Long) -> Boolean,
) {
    /** 三层封面当前对应的真实曲目（来自播放状态 + 逻辑歌单）。 */
    var window by mutableStateOf(CoverWindow())
        private set

    /**
     * 当前（或最近一次）切歌事务。Compose 状态：封面页读它来决定"正式显示的歌曲信息"，
     * 保证文字与顶层封面在同一帧落在同一首歌上（见 MinimalCoverPage）。
     */
    var transaction by mutableStateOf(SkipTransaction())
        private set

    private var pending: Pending? = null
    private var committedDirection: DragDirection? = null
    private var requestCounter = 0L

    /** 最近一次 sync 见到的播放状态：动画收尾时重放对齐用（动画中到达的状态不再被丢掉）。 */
    private var lastTrack: MinimalTrack? = null
    private var lastQueue: MinimalQueue = MinimalQueue()

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
        lastTrack = track
        lastQueue = queue
        val resolved = resolveCoverWindow(track, queue = queue)
        // UI 侧观察到的播放身份切换（自动续播/通知栏/队列点播/命令生效）。记进时间线，
        // 与封面动画完成时刻相减即得"封面领先真实身份多少毫秒"。
        val previousLive = window.current?.songKey.orEmpty()
        val newLive = resolved.current?.songKey.orEmpty()
        if (previousLive.isNotEmpty() && newLive.isNotEmpty() && previousLive != newLive) {
            SkipTxLog.externalTrackChange(previousLive, newLive)
        }
        window = resolved
        artwork.prime(listOf(resolved.current, resolved.next, resolved.next2, resolved.next3, resolved.previous))
        if (state.phase != StackPhase.IDLE) return

        val topKey = state.cards.firstOrNull()?.songKey.orEmpty()
        val liveKey = resolved.current?.songKey.orEmpty()

        // 身份一致：只在"后两层真的变了"时换表（队列被编辑 / 随机计划推进）
        if (topKey == liveKey) {
            val rest = restCards(resolved)
            if (rest.map { it.key } != state.cards.map { it.key }) state.rest(rest)
            confirmPending(liveKey)
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
            if (transaction.active) {
                SkipTxLog.skipFailed(transaction.requestId, transaction.expectedSongKey, liveKey)
                transaction = transaction.copy(stage = SkipStage.FAILED)
            }
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
        if (transaction.active) {
            SkipTxLog.skipFailed(transaction.requestId, transaction.expectedSongKey, liveKey)
            transaction = transaction.copy(stage = SkipStage.FAILED)
        }
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
        val requestId = ++requestCounter
        val sent = if (direction == DragDirection.NEXT) sendNext(requestId) else sendPrevious(requestId)
        if (!sent) return false
        SkipTxLog.skipRequest(requestId, direction, window.current?.songKey ?: "", expectedKey(direction))
        restBeforeDrag = state.cards
        state.applyCards(list)
        pending = Pending(direction, expectedKey(direction))
        committedDirection = direction
        transaction = SkipTransaction(
            requestId = requestId,
            direction = direction,
            fromSongKey = window.current?.songKey ?: "",
            expectedSongKey = expectedKey(direction),
            stage = SkipStage.REQUESTED,
            startedAtUptime = SystemClock.uptimeMillis(),
        )
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
        val requestId = ++requestCounter
        SkipTxLog.gestureRelease(requestId, direction, window.current?.songKey ?: "")
        val sent = if (direction == DragDirection.NEXT) sendNext(requestId) else sendPrevious(requestId)
        if (!sent) return false
        SkipTxLog.skipRequest(requestId, direction, window.current?.songKey ?: "", expectedKey(direction))
        pending = Pending(direction, expectedKey(direction))
        committedDirection = direction
        transaction = SkipTransaction(
            requestId = requestId,
            direction = direction,
            fromSongKey = window.current?.songKey ?: "",
            expectedSongKey = expectedKey(direction),
            stage = SkipStage.REQUESTED,
            startedAtUptime = SystemClock.uptimeMillis(),
        )
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

        // 动画完成 ≠ 切歌完成。这里把事务推进到 ANIMATION_DONE：从现在起到播放状态确认之前，
        // 顶层封面只是视觉预览（MinimalCoverPage 据此同步文字、并按未确认状态呈现）。
        val tx = transaction
        if (tx.stage == SkipStage.REQUESTED) {
            transaction = tx.copy(stage = SkipStage.ANIMATION_DONE)
            SkipTxLog.coverAnimationDone(tx.requestId, tx.expectedSongKey, confirmed = false)
        }

        // 修复（1.3.151）：sync() 在动画期间因 phase != IDLE 提前返回，动画中到达的真实播放状态
        // 从此被丢，只能等下一次桥帧或 2.5s 兜底 —— 连续切歌时三层与真实身份长时间错位。
        // 动画收尾时用最近一次 sync 见到的播放状态立即重放一次对齐（只放行"播放确实动过"的
        // 情形；播放还没动时保持预期封面 + 宽限期，等确认或超时回退）。
        val live = lastTrack
        val liveTx = transaction
        if (live != null && live.key.isNotEmpty() && live.key != liveTx.fromSongKey) {
            sync(live, lastQueue, force = true)
        }

        artwork.prime(
            listOf(window.current, window.next, window.next2, window.next3, window.previous),
        )
    }

    /**
     * 播放状态与顶层封面身份一致时调用：确认（或作废）在途的切歌事务。
     *
     * @param liveKey 真实播放状态里的歌曲 key
     */
    private fun confirmPending(liveKey: String) {
        val wait = pending
        if (liveKey.isEmpty()) return
        if (wait != null && wait.expected == liveKey) {
            pending = null
            val tx = transaction
            if (tx.active && tx.expectedSongKey == liveKey) {
                transaction = tx.copy(stage = SkipStage.CONFIRMED)
                SkipTxLog.uiTrackConfirmed(
                    tx.requestId,
                    liveKey,
                    SystemClock.uptimeMillis() - tx.startedAtUptime,
                )
            }
            return
        }
        if (wait != null && transaction.active && transaction.expectedSongKey == wait.expected) {
            // 播放状态落在了别的歌上（自动续播抢跑 / 上游命令被覆盖）：作废这次事务，
            // 封面已经由 sync() 的对齐分支换到真实身份。
            pending = null
            SkipTxLog.skipFailed(transaction.requestId, transaction.expectedSongKey, liveKey)
            transaction = transaction.copy(stage = SkipStage.FAILED)
        }
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
        // 保险：回弹意味着这次手势没有产生切歌，绝不能留一个在途事务让文字去预览另一首。
        if (transaction.stage == SkipStage.REQUESTED) {
            transaction = transaction.copy(stage = SkipStage.FAILED)
        }
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
        // 播放器自己换的歌（自动续播/通知栏/队列点播）。若还有我们发起的在途事务，
        // 播放身份已经越过它 —— 事务就此作废，绝不能让旧事务再确认一次。
        if (transaction.active) {
            SkipTxLog.skipFailed(transaction.requestId, transaction.expectedSongKey, second.songKey)
            transaction = transaction.copy(stage = SkipStage.FAILED)
        }
        pending = null
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
