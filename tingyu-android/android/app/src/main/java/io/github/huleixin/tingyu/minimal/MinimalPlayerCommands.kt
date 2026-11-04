package io.github.huleixin.tingyu.minimal

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/MinimalPlayerCommands.kt
//
// 极简播放页的播放控制：**动作名与舞台控制条完全相同**，走的也是同一条动作总线。
//
// 为什么不用 NativeAudioEngine.mediaAction 直连引擎：那会绕过 JS 侧的队列推进、自动混音、
// 过渡淡入淡出和「暂停是用户按的还是系统抢焦点」的判定 —— 等于给同一个传输意图造第二个主人。
// 现有链路是「UI → 动作总线 → JS 的命令处理器 → 播放器」，Compose 只是多了一个 UI，
// 不是一个新的命令源。
//
// 代价写在明处：WebView 不在场时（进程被回收后重建、或纯后台）命令发不出去。
// 这时 {@link #available} 为 false，页面把传输按钮置灰，而不是发一个没人接的指令。

/** 命令发送器。返回 false 表示这一条没有可用的接收方（桥未绑定/会话已失效）。 */
fun interface MinimalCommandSender {
    fun send(action: String, value: Double): Boolean
}

/** 动作名。与 {@code src/services/nativeChromeActions.ts} 的 Command 集合一一对应。 */
object MinimalActions {
    const val TOGGLE = "toggle"
    const val PLAY = "play"
    const val PAUSE = "pause"
    const val PREVIOUS = "previous"
    const val NEXT = "next"
    const val SEEK = "seek"
    const val LOOP = "loop"
    const val QUEUE = "queue"
    const val COLLAPSE = "collapse"
    const val LIKE = "like"
    const val OPEN_STAGE = "openStage"
    const val AUDIO_QUALITY = "audioQuality"
    const val AUDIO_EFFECTS = "audioEffects"
    const val LYRICS_PANEL = "lyricsPanel"
    const val PLAYBACK_SETTINGS = "playbackSettings"
    const val QUEUE_OPEN = "queueOpen"
    const val QUEUE_CLOSE = "queueClose"
    const val QUEUE_PLAY = "queuePlay"
    const val QUEUE_REMOVE = "queueRemove"
    const val QUEUE_NEXT = "queueNext"
    const val QUEUE_END = "queueEnd"
    /** 渲染来源诊断角标（临时，验收后删）。长按页面指示点触发。 */
    const val DIAG_BADGE = "diagBadge"
    /** 队列顶栏的四态播放模式循环切换。 */
    const val PLAYBACK_MODE = "playbackMode"
    /** 拖拽排序：value 编码 from:to，第二段在 session 里带不上，改用 action 参数。 */
    const val QUEUE_REORDER = "queueReorder"
}

interface MinimalPlayerCommands {
    /** 桥当前是否可发命令。false 时 UI 应把传输置灰。 */
    val available: Boolean

    fun toggle(): Boolean
    fun play(): Boolean
    fun pause(): Boolean
    fun previous(): Boolean
    fun next(): Boolean

    /** @param seconds 目标位置（秒），会被夹到 [0, 时长] */
    fun seekTo(seconds: Double): Boolean

    /** 顺序 → 列表循环 → 单曲 → 随机，四态循环，与极简页那个按钮同语义。 */
    fun cycleMode(): Boolean

    fun openQueue(): Boolean

    /** 收起播放页（回到资料库）。 */
    fun collapse(): Boolean

    /** 喜欢 / 取消喜欢当前曲。 */
    fun like(): Boolean

    /** 顺访完整歌词舞台（仍由 WebView 渲染）。 */
    fun openStage(): Boolean

    // 「更多」菜单：五项分别打开原版音质、音效、歌词、队列与播放设置。
    fun openAudioQuality(): Boolean
    fun openAudioEffects(): Boolean
    fun openLyricsPanel(): Boolean
    fun openPlaybackSettings(): Boolean

    // 队列抽屉：打开/关闭只影响数据推送，行内动作带行下标。
    fun requestQueue(): Boolean
    fun closeQueue(): Boolean
    fun queuePlay(index: Int): Boolean
    fun queueRemove(index: Int): Boolean
    fun queueMoveNext(index: Int): Boolean
    fun queueMoveEnd(index: Int): Boolean

    /** 拖拽排序：把 from 移到 to。value 编码 version/from/to 供 JS 校验（队列变了就拒绝）。 */
    fun queueReorder(from: Int, to: Int, version: Long): Boolean

    /** 四态播放模式循环：顺序 → 列表循环 → 单曲循环 → 随机。复用现有 store 动作。 */
    fun togglePlaybackMode(): Boolean

    /** 翻转渲染来源诊断角标（走桥交给 JS 开关，下一帧带回 diag 状态）。 */
    fun toggleDiagBadge(): Boolean
}

/**
 * 走动作总线的实现。所有命令都封送到 {@code TingyuChrome} 的 {@code action} 事件，
 * id 固定为 {@code minimal} —— 舞台/迷你条/导航各自的监听器按 id 过滤，不会误收。
 *
 * @param availability 由宿主提供：只有桥帧还在有效期内才允许发。**不能**只看"曾经收到过"，
 *                     否则桥断开后按钮仍是亮的，按下去没有任何反应。
 */
class BridgeMinimalCommands(
    private val sender: MinimalCommandSender,
    private val availability: () -> Boolean,
) : MinimalPlayerCommands {

    override val available: Boolean get() = availability()

    override fun toggle(): Boolean = send(MinimalActions.TOGGLE, 0.0)
    override fun play(): Boolean = send(MinimalActions.PLAY, 0.0)
    override fun pause(): Boolean = send(MinimalActions.PAUSE, 0.0)
    override fun previous(): Boolean = send(MinimalActions.PREVIOUS, 0.0)
    override fun next(): Boolean = send(MinimalActions.NEXT, 0.0)

    override fun seekTo(seconds: Double): Boolean {
        if (!seconds.isFinite()) return false
        return send(MinimalActions.SEEK, seconds.coerceAtLeast(0.0))
    }

    override fun cycleMode(): Boolean = send(MinimalActions.LOOP, 0.0)
    override fun openQueue(): Boolean = send(MinimalActions.QUEUE, 0.0)
    override fun collapse(): Boolean = send(MinimalActions.COLLAPSE, 0.0)
    override fun like(): Boolean = send(MinimalActions.LIKE, 0.0)
    override fun openStage(): Boolean = send(MinimalActions.OPEN_STAGE, 0.0)
    override fun openAudioQuality(): Boolean = send(MinimalActions.AUDIO_QUALITY, 0.0)
    override fun openAudioEffects(): Boolean = send(MinimalActions.AUDIO_EFFECTS, 0.0)
    override fun openLyricsPanel(): Boolean = send(MinimalActions.LYRICS_PANEL, 0.0)
    override fun openPlaybackSettings(): Boolean = send(MinimalActions.PLAYBACK_SETTINGS, 0.0)
    override fun requestQueue(): Boolean = send(MinimalActions.QUEUE_OPEN, 0.0)
    override fun closeQueue(): Boolean = send(MinimalActions.QUEUE_CLOSE, 0.0)
    override fun queuePlay(index: Int): Boolean = send(MinimalActions.QUEUE_PLAY, index.toDouble())
    override fun queueRemove(index: Int): Boolean = send(MinimalActions.QUEUE_REMOVE, index.toDouble())
    override fun queueMoveNext(index: Int): Boolean = send(MinimalActions.QUEUE_NEXT, index.toDouble())
    override fun queueMoveEnd(index: Int): Boolean = send(MinimalActions.QUEUE_END, index.toDouble())
    override fun toggleDiagBadge(): Boolean = send(MinimalActions.DIAG_BADGE, 0.0)
    override fun togglePlaybackMode(): Boolean = send(MinimalActions.PLAYBACK_MODE, 0.0)

    override fun queueReorder(from: Int, to: Int, version: Long): Boolean {
        if (from < 0 || to < 0) return false
        // 一个 double 编码三个数：version*1e8 + from*1e4 + to（都在 2^53 精度内）。
        return send(MinimalActions.QUEUE_REORDER, version * 1e8 + from * 10000.0 + to)
    }

    private fun send(action: String, value: Double): Boolean {
        if (!available) return false
        return try {
            sender.send(action, value)
        } catch (_: Throwable) {
            false
        }
    }
}
