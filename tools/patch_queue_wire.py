import io

root = r"C:\Users\DELL\WorkBuddy\2026-11-04-00-12-04\repo\tingyu-android"
kt = root + r"\android\app\src\main\java\io\github\huleixin\tingyu"

# ---------- 1. 屏幕：接队列状态 + 抽屉 ----------
p = kt + r"\minimal\ui\MinimalPlayerScreen.kt"
s = io.open(p, encoding="utf-8").read()
s = s.replace("""fun MinimalPlayerScreen(
    state: MinimalPlayerState,
    artwork: MinimalArtwork,
    commands: MinimalPlayerCommands,""",
"""fun MinimalPlayerScreen(
    state: MinimalPlayerState,
    artwork: MinimalArtwork,
    commands: MinimalPlayerCommands,
    /** 队列投影。JS 推来的，抽屉只读。 */
    queue: io.github.huleixin.tingyu.minimal.MinimalQueue = io.github.huleixin.tingyu.minimal.MinimalQueue(),""")

s = s.replace("""    val savedPage = rememberSaveable { mutableIntStateOf(0) }""",
"""    // 抽屉的开关是这一页的本地状态；它不改变播放，只是把队列画出来。
    val queueVisible = remember { mutableStateOf(false) }
    val sheetCommands = remember(commands) {
        object : MinimalPlayerCommands by commands {
            override fun openQueue(): Boolean {
                queueVisible.value = true
                return commands.requestQueue()
            }
        }
    }

    val savedPage = rememberSaveable { mutableIntStateOf(0) }""")

s = s.replace("""            MinimalTransport(
                playback = playback,
                controls = state.controls,
                clock = clock,
                ink = ink,
                accent = Color(palette.accent),
                commands = commands,""",
"""            MinimalTransport(
                playback = playback,
                controls = state.controls,
                clock = clock,
                ink = ink,
                accent = Color(palette.accent),
                commands = sheetCommands,""")

s = s.replace("""                onSelect = { target -> scope.launch { pagerState.animateScrollToPage(target) } },
                modifier = Modifier.padding(top = 6.dp),
            )
        }
    }
}""",
"""                onSelect = { target -> scope.launch { pagerState.animateScrollToPage(target) } },
                modifier = Modifier.padding(top = 6.dp),
            )
        }

        // 抽屉盖在整页之上（包括安全区之外）：它自己带 scrim，视觉上是从底边长出来的。
        if (queueVisible.value) {
            MinimalQueueSheet(
                queue = queue,
                ink = ink,
                base = Color(palette.base),
                accent = Color(palette.accent),
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
    }
}""")
io.open(p, "w", encoding="utf-8").write(s)

# ---------- 2. 宿主：把队列快照转给运行时 ----------
p = kt + r"\chrome\ComposeChromeHost.kt"
s = io.open(p, encoding="utf-8").read()
marker = "    fun minimalFrame(value: JSONObject): Boolean"
if marker in s:
    s = s.replace(marker, """    fun minimalQueue(value: JSONObject) {
        minimal.onQueueSnapshot(value)
    }

""" + marker)
else:
    s = s.replace("""    fun suspend() {""", """    fun minimalQueue(value: JSONObject) {
        minimal.onQueueSnapshot(value)
    }

    fun suspend() {""")
io.open(p, "w", encoding="utf-8").write(s)

# ---------- 3. 插件：新方法 ----------
p = kt + r"\chrome\TingyuChromePlugin.java"
s = io.open(p, encoding="utf-8").read()
anchor = "    @PluginMethod public void minimalPlayerFrame(PluginCall call) {"
assert anchor in s, "plugin anchor missing"
s = s.replace(anchor, """    @PluginMethod public void minimalQueue(PluginCall call) {
        final org.json.JSONObject snapshot = call.getData();
        getActivity().runOnUiThread(() -> {
            try { if (host != null) host.minimalQueue(snapshot); call.resolve(); }
            catch (Exception error) { call.reject(error.getMessage(), error); }
        });
    }

""" + anchor)
io.open(p, "w", encoding="utf-8").write(s)
print("wired into host + plugin")
