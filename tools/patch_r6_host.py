import io

root = r"C:\Users\DELL\WorkBuddy\2026-11-04-00-12-04\repo\tingyu-android"
kt = root + r"\android\app\src\main\java\io\github\huleixin\tingyu"
ok, miss = [], []


def patch(path, pairs):
    s = io.open(path, encoding="utf-8").read()
    for old, new in pairs:
        if old not in s:
            miss.append((path.split("\\")[-1], old[:60].replace("\n", "⏎")))
            continue
        s = s.replace(old, new)
        ok.append(path.split("\\")[-1])
    io.open(path, "w", encoding="utf-8").write(s)


# ---------------- 1. 宿主：队列控制器 + 遮罩层 + detour 让出舞台 ----------------
host = kt + r"\chrome\ComposeChromeHost.kt"
patch(host, [
    # 1a. 队列开合状态与控制器
    ("""    private val stageExit=NativeStageExit()""",
     """    private val stageExit=NativeStageExit()
    /** 原生队列抽屉的开合。它是**宿主**的状态：任何页面都能打开同一张表。 */
    private var queueOpen by mutableStateOf(false)
    /** JS 说抽屉关了（返回键、点击遮罩），宿主跟着收。 */
    fun closeNativeQueue(){queueOpen=false}
    fun openNativeQueue(){
        queueOpen=true
        // 打开时立刻要一份新快照；JS 那边注册过处理器才有数据。
        minimal.requestQueue()
    }"""),

    # 1b. 需要 detour 状态：极简页在顺访舞台时不画，宿主也不该再认为它占着舞台
    ("""        val minimalBound by minimal.bound.collectAsState()""",
     """        val minimalBound by minimal.bound.collectAsState()
        val minimalState by minimal.state.collectAsState()
        val queueState by minimal.queue.collectAsState()"""),

    ("""        val minimalOwns = minimalPlayerEnabled() && destination=="stage" && playerPresentation=="minimal" &&
            !webOverlay && !stageExit.active && minimalBound""",
     """        // `!detour` 不能少：顺访舞台时极简页自己 `return` 不画了，但 presentation 还是 minimal。
        // 少了这一条，舞台 surface 会被这里过滤掉，底栏就再也没人画 —— 截图里舞台没有控制栏正是这个。
        val minimalOwns = minimalPlayerEnabled() && destination=="stage" && playerPresentation=="minimal" &&
            !webOverlay && !stageExit.active && minimalBound && !minimalState.controls.detour"""),

    # 1c. 抽屉层：独立于 minimalOwns，舞台上也画得出来
    ("""            if(stageExit.active)Box(Modifier.fillMaxSize().zIndex(4f).pointerInput(Unit){awaitPointerEventScope{while(true)awaitPointerEvent().changes.forEach{it.consume()}}})""",
     """            // 队列抽屉：宿主级，和哪一页在显示无关 —— 极简页、舞台、首页都开这一张。
            if(queueOpen)Box(Modifier.fillMaxSize().zIndex(6f)){
                MinimalQueueSheet(
                    queue=queueState,
                    light=interfaceLight,
                    onClose={queueOpen=false;minimal.closeQueue()},
                    onPlay={minimal.queuePlay(it)},
                    onRemove={minimal.queueRemove(it)},
                    onMoveNext={minimal.queueMoveNext(it)},
                    onMoveEnd={minimal.queueMoveEnd(it)},
                )
            }
            if(stageExit.active)Box(Modifier.fillMaxSize().zIndex(4f).pointerInput(Unit){awaitPointerEventScope{while(true)awaitPointerEvent().changes.forEach{it.consume()}}})"""),

    # 1d. 把队列与打开动作交给极简页
    ("""                MinimalPlayerSurface(
                    runtime = minimal,
                    commands = minimalCommands,""",
     """                MinimalPlayerSurface(
                    runtime = minimal,
                    commands = minimalCommands,
                    queue = queueState,
                    onOpenQueue = { openNativeQueue() },"""),
])

# ---------------- 2. 极简页表面：把队列传下去 ----------------
page = kt + r"\chrome\MinimalPlayerPage.kt"
patch(page, [
    ("""    MinimalPlayerScreen(
        state = state,
        artwork = artwork,
        commands = commands,""",
     """    MinimalPlayerScreen(
        state = state,
        artwork = artwork,
        commands = commands,
        queue = queue,
        onOpenQueue = onOpenQueue,"""),
])

# ---------------- 3. 屏幕：不再自己管抽屉，用宿主给的 ----------------
screen = kt + r"\minimal\ui\MinimalPlayerScreen.kt"
patch(screen, [
    ("""    /** 队列投影。JS 推来的，抽屉只读。 */
    queue: io.github.huleixin.tingyu.minimal.MinimalQueue = io.github.huleixin.tingyu.minimal.MinimalQueue(),""",
     """    /** 队列投影。JS 推来的，抽屉只读。 */
    queue: io.github.huleixin.tingyu.minimal.MinimalQueue = io.github.huleixin.tingyu.minimal.MinimalQueue(),
    /** 打开宿主的队列抽屉。极简页自己不再持有抽屉状态。 */
    onOpenQueue: () -> Unit = {},"""),

    ("""    // 抽屉的开关是这一页的本地状态；它不改变播放，只是把队列画出来。
    val queueVisible = remember { mutableStateOf(false) }
    val sheetCommands = remember(commands) {
        object : MinimalPlayerCommands by commands {
            override fun openQueue(): Boolean {
                queueVisible.value = true
                return commands.requestQueue()
            }
        }
    }
""",
     """    // 抽屉归宿主所有；这里只把"列表按钮"接到它的开门动作上。
    // 之前这里裸用 `commands`，于是底部的列表按钮走的是另一条路 —— 同一个页面两套行为。
    val sheetCommands = remember(commands, onOpenQueue) {
        object : MinimalPlayerCommands by commands {
            override fun openQueue(): Boolean {
                onOpenQueue()
                return true
            }
        }
    }
"""),

    ("""        // 抽屉盖在整页之上（包括安全区之外）：它自己带 scrim，视觉上是从底边长出来的。
        if (queueVisible.value) {
            MinimalQueueSheet(
                queue = queue,
                // 注意这里是宿主给的界面主题，不是这一页的 dark：队列属于外壳。
                light = light,
                onClose = {
                    queueVisible.value = false
                    commands.closeQueue()
                },
                onPlay = { commands.queuePlay(it) },
                onRemove = { commands.queueRemove(it) },
                onMoveNext = { commands.queueMoveNext(it) },
                onMoveEnd = { commands.queueMoveEnd(it) },
            )
        }
""", ""),

    # 顶栏「更多」菜单里的队列也必须走同一个开门动作
    ("""                                    3 -> commands.openQueue()""",
     """                                    3 -> onOpenQueue()"""),
])

# ---------------- 4. 插件：JS 侧任何入口都能打开这张抽屉 ----------------
plugin = kt + r"\chrome\TingyuChromePlugin.java"
patch(plugin, [
    ("""    @PluginMethod public void minimalQueue(PluginCall call) {""",
     """    @PluginMethod public void openMinimalQueue(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try { if (host != null) host.openNativeQueue(); call.resolve(); }
            catch (Exception error) { call.reject(error.getMessage(), error); }
        });
    }

    @PluginMethod public void minimalQueue(PluginCall call) {"""),
])

print("OK:", sorted(set(ok)))
for f, frag in miss:
    print("MISS:", f, "|", frag)
