import io

root = r"C:\Users\DELL\WorkBuddy\2026-11-04-00-12-04\repo\tingyu-android"

# ---------- 抽屉：修正行内按钮接线，把手那里才吃拖拽 ----------
p = (root + r"\android\app\src\main\java\io\github\huleixin\tingyu\minimal\ui"
     r"\MinimalQueueSheet.kt")
s = io.open(p, encoding="utf-8").read()
s = s.replace("""                .pointerInput(Unit) {
                    detectVerticalDragGestures(
                        onDragEnd = {
                            if (drag > size.height * 0.22f) onClose()
                            drag = 0f
                        },
                        onDragCancel = { drag = 0f },
                    ) { _, delta -> drag = (drag + delta).coerceAtLeast(0f) }
                }
""", "")
s = s.replace("""            Box(Modifier.fillMaxWidth().height(28.dp), contentAlignment = Alignment.Center) {""",
"""            // 只让把手吃下滑手势：整块都吃会抢走 LazyColumn 的滚动。
            Box(
                Modifier.fillMaxWidth().height(28.dp).pointerInput(Unit) {
                    detectVerticalDragGestures(
                        onDragEnd = {
                            if (drag > size.height * 4f) onClose()
                            drag = 0f
                        },
                        onDragCancel = { drag = 0f },
                    ) { _, delta -> drag = (drag + delta).coerceAtLeast(0f) }
                },
                contentAlignment = Alignment.Center,
            ) {""")
s = s.replace("""        RowAction("下一首播放", ink) { QueueGlyph(ink, "next") }
        RowAction("移到末尾", ink) { QueueGlyph(ink, "end") }
        RowAction("从队列移除", ink) { QueueGlyph(ink, "remove") }
    }

    // 三个动作按钮各自绑在自己的行上：`onMoveNext` 等闭包已经捕获了这一行的下标。
    run { onRemove; onMoveNext; onMoveEnd }""",
"""        // 每行的三个动作绑在本行的下标上（闭包已捕获 index）。
        RowAction("下一首播放", ink, onMoveNext) { QueueGlyph(ink, "next") }
        RowAction("移到末尾", ink, onMoveEnd) { QueueGlyph(ink, "end") }
        RowAction("从队列移除", ink, onRemove) { QueueGlyph(ink, "remove") }
    }""")
io.open(p, "w", encoding="utf-8").write(s)

# ---------- 运行时：队列状态 + 动作 ----------
p = (root + r"\android\app\src\main\java\io\github\huleixin\tingyu\minimal"
     r"\MinimalPlayerRuntime.kt")
s = io.open(p, encoding="utf-8").read()

s = s.replace("""    /** 播放偏好里的音质档位，只出现在「更多」菜单的第二列。 */
    val qualityMode: String = "",""",
"""    /** 队列抽屉正在打开：`true` 时 JS 会持续把快照推过来。 */
    val queueOpen: Boolean = false,
    /** 播放偏好里的音质档位，只出现在「更多」菜单的第二列。 */
    val qualityMode: String = "",""")

s = s.replace("""    private val _artwork = MutableStateFlow(MinimalArtwork())
    val artwork: StateFlow<MinimalArtwork> = _artwork.asStateFlow()""",
"""    private val _artwork = MutableStateFlow(MinimalArtwork())
    val artwork: StateFlow<MinimalArtwork> = _artwork.asStateFlow()

    /** 队列快照。独立一条流：一次打开只变一两次，不该让整页跟着重组。 */
    private val _queue = MutableStateFlow(MinimalQueue())
    val queue: StateFlow<MinimalQueue> = _queue.asStateFlow()

    /**
     * JS 推来的队列投影。版本号倒退的包直接丢 —— 动作是异步的，乱序到达会让列表闪回。
     */
    fun onQueueSnapshot(value: JSONObject) {
        val next = MinimalQueue.parse(value) ?: return
        if (next.version < _queue.value.version) return
        _queue.value = next
    }

    fun clearQueue() {
        _queue.value = MinimalQueue()
    }""")
io.open(p, "w", encoding="utf-8").write(s)

# ---------- 命令：队列动作 ----------
p = (root + r"\android\app\src\main\java\io\github\huleixin\tingyu\minimal"
     r"\MinimalPlayerCommands.kt")
s = io.open(p, encoding="utf-8").read()
s = s.replace("""    const val PLAYBACK_SETTINGS = "playbackSettings"
}""",
"""    const val PLAYBACK_SETTINGS = "playbackSettings"
    const val QUEUE_OPEN = "queueOpen"
    const val QUEUE_CLOSE = "queueClose"
    const val QUEUE_PLAY = "queuePlay"
    const val QUEUE_REMOVE = "queueRemove"
    const val QUEUE_NEXT = "queueNext"
    const val QUEUE_END = "queueEnd"
}""")
s = s.replace("""    fun openPlaybackSettings(): Boolean
}""",
"""    fun openPlaybackSettings(): Boolean

    // 队列抽屉：打开/关闭只影响数据推送，行内动作带行下标。
    fun requestQueue(): Boolean
    fun closeQueue(): Boolean
    fun queuePlay(index: Int): Boolean
    fun queueRemove(index: Int): Boolean
    fun queueMoveNext(index: Int): Boolean
    fun queueMoveEnd(index: Int): Boolean
}""")
s = s.replace("""    override fun openPlaybackSettings(): Boolean = send(MinimalActions.PLAYBACK_SETTINGS, 0.0)""",
"""    override fun openPlaybackSettings(): Boolean = send(MinimalActions.PLAYBACK_SETTINGS, 0.0)
    override fun requestQueue(): Boolean = send(MinimalActions.QUEUE_OPEN, 0.0)
    override fun closeQueue(): Boolean = send(MinimalActions.QUEUE_CLOSE, 0.0)
    override fun queuePlay(index: Int): Boolean = send(MinimalActions.QUEUE_PLAY, index.toDouble())
    override fun queueRemove(index: Int): Boolean = send(MinimalActions.QUEUE_REMOVE, index.toDouble())
    override fun queueMoveNext(index: Int): Boolean = send(MinimalActions.QUEUE_NEXT, index.toDouble())
    override fun queueMoveEnd(index: Int): Boolean = send(MinimalActions.QUEUE_END, index.toDouble())""")
io.open(p, "w", encoding="utf-8").write(s)
print("kotlin model wired")
