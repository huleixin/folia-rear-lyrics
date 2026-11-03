import io

p = r"C:\Users\DELL\WorkBuddy\2026-11-04-00-12-04\repo\tingyu-android\android\app\src\main\java\io\github\huleixin\tingyu\minimal\ui\MinimalPlayerScreen.kt"
s = io.open(p, encoding="utf-8").read()

s = s.replace(
    """            TopBar(
                ink = ink,
                liked = state.controls.liked,""",
    """            TopBar(
                ink = ink,
                base = Color(palette.base),
                liked = state.controls.liked,
                qualityMode = state.controls.qualityMode,
                effectsOn = state.controls.effectsOn,""")

s = s.replace(
    """private fun TopBar(
    ink: MinimalInk,
    liked: Boolean,
    likeDisabled: Boolean,""",
    """private fun TopBar(
    ink: MinimalInk,
    base: Color,
    liked: Boolean,
    qualityMode: String,
    effectsOn: Boolean,
    likeDisabled: Boolean,""")

old_more = """            } else {
                TopIcon("更多", onClick = { commands.openQueue() }) {
                    Canvas(Modifier.size(22.dp)) {
                        val u = size.minDimension / 22f
                        listOf(5f, 11f, 17f).forEach { dot ->
                            drawCircle(ink.ink, 1.7f * u, Offset(dot * u, 11f * u))
                        }
                    }
                }
            }"""

new_more = """            } else {
                // 更多在原始页面里是一个真菜单（音质音效 / 音效 / 歌词 / 队列 / 播放设置），
                // 不是队列按钮。上一版把它接到了 openQueue，点更多直接弹队列就是这么来的。
                Box {
                    TopIcon("更多", onClick = { menuOpen = !menuOpen }) {
                        Canvas(Modifier.size(22.dp)) {
                            val u = size.minDimension / 22f
                            listOf(5f, 11f, 17f).forEach { dot ->
                                drawCircle(ink.ink, 1.7f * u, Offset(dot * u, 11f * u))
                            }
                        }
                    }
                    if (menuOpen) {
                        MoreMenu(
                            ink = ink,
                            base = base,
                            qualityMode = qualityMode,
                            effectsOn = effectsOn,
                            onDismiss = { menuOpen = false },
                            onPick = { pick ->
                                menuOpen = false
                                when (pick) {
                                    0 -> commands.openAudioQuality()
                                    1 -> commands.openAudioEffects()
                                    2 -> commands.openLyricsPanel()
                                    3 -> commands.openQueue()
                                    else -> commands.openPlaybackSettings()
                                }
                            },
                        )
                    }
                }
            }"""

assert old_more in s, "more button block not found"
s = s.replace(old_more, new_more)

s = s.replace(
    """    Row(
        Modifier.fillMaxWidth().padding(start = 10.dp, end = 10.dp, top = 6.dp, bottom = 2.dp),""",
    """    var menuOpen by remember { mutableStateOf(false) }
    Row(
        Modifier.fillMaxWidth().padding(start = 10.dp, end = 10.dp, top = 6.dp, bottom = 2.dp),""")

menu_function = '''/**
 * 更多菜单：条目与 `MobileStageMenu` 完全一致，动作也调同一批 store 方法。
 *
 * 不套 MaterialTheme：这一页整套颜色来自封面取色，Material 的默认表面色（浅色）会在这里
 * 变成一块白板。用 Popup 自己画，底色跟着页面走。
 */
@Composable
private fun MoreMenu(
    ink: MinimalInk,
    base: Color,
    qualityMode: String,
    effectsOn: Boolean,
    onDismiss: () -> Unit,
    onPick: (Int) -> Unit,
) {
    val radius = RoundedCornerShape(16.dp)
    androidx.compose.ui.window.Popup(
        alignment = Alignment.TopEnd,
        offset = androidx.compose.ui.unit.IntOffset(0, 96),
        onDismissRequest = onDismiss,
        properties = androidx.compose.ui.window.PopupProperties(focusable = true),
    ) {
        Column(
            Modifier
                .padding(end = 10.dp)
                .width(208.dp)
                .clip(radius)
                .background(base.copy(alpha = 0.94f))
                .border(1.dp, ink.inkAlpha(14), radius)
                .padding(vertical = 6.dp),
        ) {
            val entries = listOf(
                "音质音效" to qualityMode,
                "音效" to (if (effectsOn) "已开启" else "已关闭"),
                "歌词" to "",
                "播放队列" to "",
                "播放设置" to "",
            )
            entries.forEachIndexed { index, entry ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable { onPick(index) }
                        .padding(horizontal = 14.dp, vertical = 11.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(entry.first, color = ink.ink, fontSize = 14.sp)
                    if (entry.second.isNotBlank()) {
                        Spacer(Modifier.weight(1f))
                        Text(entry.second, color = ink.muted, fontSize = 12.sp, maxLines = 1)
                    }
                }
            }
        }
    }
}

/** 44dp 命中区 + 44dp 的图标盒；关闭时 0.35 透明度（与 CSS 的 :disabled 一致）。 */'''

s = s.replace("/** 44dp 命中区 + 44dp 的图标盒；关闭时 0.35 透明度（与 CSS 的 :disabled 一致）。 */", menu_function)

for imp in [
    "import androidx.compose.foundation.background",
    "import androidx.compose.foundation.border",
    "import androidx.compose.foundation.layout.Spacer",
    "import androidx.compose.foundation.layout.width",
    "import androidx.compose.foundation.shape.RoundedCornerShape",
    "import androidx.compose.material3.Text",
    "import androidx.compose.ui.draw.clip",
    "import androidx.compose.ui.unit.sp",
    "import androidx.compose.runtime.mutableStateOf",
]:
    if imp not in s:
        s = s.replace("import androidx.compose.runtime.Composable",
                      "import androidx.compose.runtime.Composable\n" + imp)

io.open(p, "w", encoding="utf-8").write(s)
print("topbar menu patched")
