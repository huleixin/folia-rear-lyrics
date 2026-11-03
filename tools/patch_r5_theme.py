import io

root = r"C:\Users\DELL\WorkBuddy\2026-11-04-00-12-04\repo\tingyu-android"
ui = root + r"\android\app\src\main\java\io\github\huleixin\tingyu\minimal\ui"

# ---------- 抽屉主题：跟随应用界面，不跟随封面 ----------
p = ui + r"\MinimalQueueSheet.kt"
s = io.open(p, encoding="utf-8").read()

s = s.replace("""fun MinimalQueueSheet(
    queue: MinimalQueue,
    ink: MinimalInk,
    base: Color,
    accent: Color,""",
"""fun MinimalQueueSheet(
    queue: MinimalQueue,
    /**
     * **应用界面**的深浅，不是这一页的主题，也不是封面取色。
     *
     * 队列属于应用外壳（首页、舞台、极简页共用的那张表），它该跟界面走：
     * 浅色界面弹出一张深绿的队列，正是因为它之前拿的是封面调色板。
     */
    light: Boolean,""")

s = s.replace("""    var drag by remember { mutableFloatStateOf(0f) }""",
"""    val theme = queueTheme(light)
    var drag by remember { mutableFloatStateOf(0f) }""")

s = s.replace("""                .background(Color.Black.copy(alpha = 0.44f))""",
"""                .background(Color.Black.copy(alpha = theme.scrim))""")

s = s.replace("""                .background(base)""", """                .background(theme.surface)""")

s = s.replace("""                        .background(ink.inkAlpha(28), RoundedCornerShape(999.dp))""",
"""                        .background(theme.muted.copy(alpha = 0.35f), RoundedCornerShape(999.dp))""")

s = s.replace("""                Text("播放队列", color = ink.ink, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.width(8.dp))
                Text("${queue.total} 首", color = ink.muted, fontSize = 12.sp)""",
"""                Text("播放队列", color = theme.text, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.width(8.dp))
                Text("${queue.total} 首", color = theme.muted, fontSize = 12.sp)""")

s = s.replace("""                        drawLine(ink.ink, Offset(3f * u, 3f * u), Offset(14f * u, 14f * u), w, StrokeCap.Round)
                        drawLine(ink.ink, Offset(14f * u, 3f * u), Offset(3f * u, 14f * u), w, StrokeCap.Round)""",
"""                        drawLine(theme.text, Offset(3f * u, 3f * u), Offset(14f * u, 14f * u), w, StrokeCap.Round)
                        drawLine(theme.text, Offset(14f * u, 3f * u), Offset(3f * u, 14f * u), w, StrokeCap.Round)""")

s = s.replace("""                    Text("队列是空的", color = ink.muted, fontSize = 13.sp)""",
"""                    Text("队列是空的", color = theme.muted, fontSize = 13.sp)""")

s = s.replace("""                            item = item,
                            position = index + 1,
                            current = index == queue.currentIndex,
                            ink = ink,
                            accent = accent,""",
"""                            item = item,
                            position = index + 1,
                            current = index == queue.currentIndex,
                            theme = theme,""")

s = s.replace("""private fun QueueRow(
    item: io.github.huleixin.tingyu.minimal.MinimalQueueItem,
    position: Int,
    current: Boolean,
    ink: MinimalInk,
    accent: Color,""",
"""private fun QueueRow(
    item: io.github.huleixin.tingyu.minimal.MinimalQueueItem,
    position: Int,
    current: Boolean,
    theme: QueueTheme,""")

s = s.replace("""            .background(if (current) accent.copy(alpha = 0.10f) else Color.Transparent)""",
"""            .background(if (current) theme.highlight else Color.Transparent)""")

s = s.replace("""            color = ink.muted.copy(alpha = 0.55f),""", """            color = theme.muted.copy(alpha = 0.6f),""")
s = s.replace("""                color = if (current) accent else ink.ink,""", """                color = if (current) theme.accent else theme.text,""")
s = s.replace("""                    color = ink.muted,
                    fontSize = 11.5.sp,""", """                    color = theme.muted,
                    fontSize = 11.5.sp,""")

s = s.replace("""        RowAction("下一首播放", ink, onMoveNext) { QueueGlyph(ink, "next") }
        RowAction("移到末尾", ink, onMoveEnd) { QueueGlyph(ink, "end") }
        RowAction("从队列移除", ink, onRemove) { QueueGlyph(ink, "remove") }""",
"""        RowAction("下一首播放", theme, onMoveNext) { QueueGlyph(theme, "next") }
        RowAction("移到末尾", theme, onMoveEnd) { QueueGlyph(theme, "end") }
        RowAction("从队列移除", theme, onRemove) { QueueGlyph(theme, "remove") }""")

s = s.replace("""private fun RowAction(label: String, ink: MinimalInk, onClick: () -> Unit, content: @Composable () -> Unit) {""",
"""private fun RowAction(label: String, theme: QueueTheme, onClick: () -> Unit, content: @Composable () -> Unit) {""")

s = s.replace("""private fun QueueGlyph(ink: MinimalInk, kind: String) {""", """private fun QueueGlyph(theme: QueueTheme, kind: String) {""")
s = s.replace("""                drawLine(ink.muted, Offset(4f * u, 4f * u), Offset(4f * u, 12f * u), w, StrokeCap.Round)
                drawLine(ink.muted, Offset(4f * u, 8f * u), Offset(12f * u, 8f * u), w, StrokeCap.Round)
                drawLine(ink.muted, Offset(9f * u, 5f * u), Offset(12f * u, 8f * u), w, StrokeCap.Round)
                drawLine(ink.muted, Offset(9f * u, 11f * u), Offset(12f * u, 8f * u), w, StrokeCap.Round)""",
"""                drawLine(theme.muted, Offset(4f * u, 4f * u), Offset(4f * u, 12f * u), w, StrokeCap.Round)
                drawLine(theme.muted, Offset(4f * u, 8f * u), Offset(12f * u, 8f * u), w, StrokeCap.Round)
                drawLine(theme.muted, Offset(9f * u, 5f * u), Offset(12f * u, 8f * u), w, StrokeCap.Round)
                drawLine(theme.muted, Offset(9f * u, 11f * u), Offset(12f * u, 8f * u), w, StrokeCap.Round)""")
s = s.replace("""                drawLine(ink.muted, Offset(4f * u, 4f * u), Offset(4f * u, 12f * u), w, StrokeCap.Round)
                drawLine(ink.muted, Offset(11.5f * u, 4f * u), Offset(11.5f * u, 12f * u), w, StrokeCap.Round)
                drawLine(ink.muted, Offset(4f * u, 8f * u), Offset(9f * u, 8f * u), w, StrokeCap.Round)""",
"""                drawLine(theme.muted, Offset(4f * u, 4f * u), Offset(4f * u, 12f * u), w, StrokeCap.Round)
                drawLine(theme.muted, Offset(11.5f * u, 4f * u), Offset(11.5f * u, 12f * u), w, StrokeCap.Round)
                drawLine(theme.muted, Offset(4f * u, 8f * u), Offset(9f * u, 8f * u), w, StrokeCap.Round)""")
s = s.replace("""                drawLine(ink.muted, Offset(4f * u, 5f * u), Offset(12f * u, 5f * u), w, StrokeCap.Round)
                drawLine(ink.muted, Offset(4f * u, 11f * u), Offset(12f * u, 11f * u), w, StrokeCap.Round)
                drawLine(ink.muted, Offset(6.5f * u, 3f * u), Offset(6.5f * u, 13f * u), w, StrokeCap.Round)""",
"""                drawLine(theme.muted, Offset(4f * u, 5f * u), Offset(12f * u, 5f * u), w, StrokeCap.Round)
                drawLine(theme.muted, Offset(4f * u, 11f * u), Offset(12f * u, 11f * u), w, StrokeCap.Round)
                drawLine(theme.muted, Offset(6.5f * u, 3f * u), Offset(6.5f * u, 13f * u), w, StrokeCap.Round)""")

s = s.replace("""@Composable
private fun QueueRow(""",
"""/**
 * 队列的表面色。跟应用界面走，带一点听屿的墨绿：
 * 浅色是柔和的纸白 + 深绿字，深色是墨绿底 + 浅字，和旧版队列（图 3/图 4）一致。
 */
private data class QueueTheme(
    val surface: Color,
    val text: Color,
    val muted: Color,
    val accent: Color,
    val highlight: Color,
    val scrim: Float,
)

private fun queueTheme(light: Boolean): QueueTheme = if (light) {
    QueueTheme(
        surface = Color(0xFFF7FAF8),
        text = Color(0xFF10231D),
        muted = Color(0xFF5C7268),
        accent = Color(0xFF0F6B4F),
        highlight = Color(0xFF10231D).copy(alpha = 0.07f),
        scrim = 0.28f,
    )
} else {
    QueueTheme(
        surface = Color(0xFF0E1A17),
        text = Color(0xFFECF3EF),
        muted = Color(0xFF8FA69C),
        accent = Color(0xFF7FE3C0),
        highlight = Color(0xFFFFFFFF).copy(alpha = 0.08f),
        scrim = 0.55f,
    )
}

@Composable
private fun QueueRow(""")
io.open(p, "w", encoding="utf-8").write(s)

# ---------- 屏幕：把「应用界面主题」传给抽屉 ----------
p = ui + r"\MinimalPlayerScreen.kt"
s = io.open(p, encoding="utf-8").read()
s = s.replace("""            MinimalQueueSheet(
                queue = queue,
                ink = ink,
                base = Color(palette.base),
                accent = Color(palette.accent),""",
"""            MinimalQueueSheet(
                queue = queue,
                // 注意这里是宿主给的界面主题，不是这一页的 dark：队列属于外壳。
                light = light,""")
io.open(p, "w", encoding="utf-8").write(s)
print("queue theme follows app")
