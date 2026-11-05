package io.github.huleixin.tingyu.minimal.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.huleixin.tingyu.minimal.MinimalQueue
import kotlinx.coroutines.delay

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/MinimalQueueSheet.kt
//
// 原生播放队列抽屉。
//
// 只画队列，不拥有队列：内容来自 `MinimalQueue`（JS 推来的只读投影），
// 行内动作用 `commands` 发回 JS，由原来的 onPlaySong / onRemoveSong / onMoveSong 执行。
// 所以两边看到的永远是同一个队列。
//
// 第 9 轮：
//  · 高度分两档（55-60% / 85-90%），把手上下拖在档位间平滑切换，下滑关闭；
//  · 每行只有 × 删除和 ≡ 拖拽手柄；拖拽从手柄长按启动，拖动只更新本地预览，
//    松手一次提交（带快照版本），队列变了会被 JS 拒绝并弹回真身；
//  · 高亮认 currentKey（歌曲身份），不认下标；点歌有按压反馈 + 待确认态；
//  · 顶栏在关闭按钮左边有四态播放模式按钮（图标 + 中文名）。
//
// 第 10 轮（拖拽失效根治）：
//  · 长按"闪一下就拖不动"的根因是 `pointerInput(enabled)`：enabled 随 dragUid 翻转，
//    拖起的那次重组把正在手势中的协程重启，onDrag 从此没人收。现在检测器一律
//    `pointerInput(Unit)` + `rememberUpdatedState`，enabled 只在回调里判断；
//  · 歌曲行本体也支持长按拖动（标题/歌手区域），单击仍然是播放；
//  · 落点判定跳过被拖行自己、按视觉中心算，两端贴边 —— 不再粘在自己槽位上。

/** 两档高度占可用高度的比例。 */
private const val HEIGHT_HALF = 0.575f
private const val HEIGHT_FULL = 0.875f

@Composable
fun MinimalQueueSheet(
    queue: MinimalQueue,
    light: Boolean,
    /** 播放模式（off | all | one | shuffle），来自权威 store 的投影。 */
    mode: String,
    onClose: () -> Unit,
    onPlay: (Int) -> Unit,
    onRemove: (Int) -> Unit,
    onReorder: (from: Int, to: Int) -> Unit,
    onToggleMode: () -> Unit,
) {
    val theme = queueTheme(light)
    val listState = rememberLazyListState()
    val density = LocalDensity.current

    // ---- 高度：两档 + 平滑动画 + 把手拖拽 ----
    var expanded by remember { mutableStateOf(false) }
    var dragY by remember { mutableFloatStateOf(0f) }
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val fullHeight = maxHeight
        val targetHeight = if (expanded) fullHeight * HEIGHT_FULL else fullHeight * HEIGHT_HALF
        val animatedHeight by animateDpAsState(
            // 拖动中让高度跟手（拖上变高），松手后动画吸附到档位。
            targetValue = if (dragY != 0f) (targetHeight - with(density) { dragY.toDp() }).coerceIn(fullHeight * 0.35f, fullHeight * 0.95f)
            else targetHeight,
            animationSpec = spring(stiffness = 380f),
            label = "queue-height",
        )
        fun handleSheetDragEnd() {
            val closePx = with(density) { 110.dp.toPx() }
            val swapPx = with(density) { 56.dp.toPx() }
            when {
                dragY > closePx -> onClose()
                dragY < -swapPx -> expanded = true
                dragY > swapPx && expanded -> expanded = false
            }
            dragY = 0f
        }
        BackHandler(enabled = true) { onClose() }

        // 打开就把当前曲滚进视野，只做这一次：之后高亮更新绝不抢用户正在浏览的位置。
        LaunchedEffect(Unit) {
            if (queue.currentIndex >= 0) {
                listState.scrollToItem((queue.currentIndex - 2).coerceAtLeast(0))
            }
        }

        // ---- 拖拽排序状态（本地预览，松手才提交）----
        // **手势生命周期红线**：启动拖拽会改下面这些状态，行与手柄因此重组。凡是把手势
        // 检测器的 key 挂在这些状态上（比如 `pointerInput(enabled)`），拖起的那一次重组
        // 就会把手势协程重启 —— 长按刚生效就被取消，表现正是"闪一下就拖不动"。
        // 检测器一律用稳定 key，状态判断放进 rememberUpdatedState 的回调里。
        var dragUid by remember { mutableStateOf<String?>(null) }
        var dragFrom by remember { mutableIntStateOf(-1) }
        var dragTo by remember { mutableIntStateOf(-1) }
        // dragOffset 是手指累计位移；dragBase 是拖起瞬间该行在视口里的位置。
        // 行的布局位置会随预览让位而移动，`跟随手指的平移 = dragOffset + dragBase - 当前布局位`，
        // 视觉中心（判定落点用）= dragBase + dragOffset + 半行高，与让位无关。
        var dragOffset by remember { mutableFloatStateOf(0f) }
        var dragBase by remember { mutableFloatStateOf(0f) }
        var pointerY by remember { mutableFloatStateOf(-1f) }
        // 待删除集合：× 点击后到下一包快照之间，同一行不允许再点（防连点误删）。
        var removing by remember { mutableStateOf(emptySet<String>()) }
        // 待确认切歌：点了谁，谁进入待确认态；当前曲身份追上或超时就清除。
        var pendingKey by remember { mutableStateOf<String?>(null) }

        LaunchedEffect(queue.version) {
            removing = emptySet() // 新快照 = JS 已确认所有在途删除。
        }
        LaunchedEffect(queue.currentKey, pendingKey) {
            if (pendingKey != null && queue.currentKey == pendingKey) pendingKey = null
        }
        LaunchedEffect(pendingKey) {
            if (pendingKey != null) {
                delay(4000) // 切歌没成（失败/被拒）也不永远挂着待确认态。
                pendingKey = null
            }
        }
        // 拖拽期间的边缘自动滚动：中心点停在上下 72dp 内就持续滚，出圈即停。
        LaunchedEffect(dragUid) {
            if (dragUid == null) return@LaunchedEffect
            val edge = with(density) { 72.dp.toPx() }
            val step = with(density) { 14.dp.toPx() }
            while (true) {
                val viewportEnd = listState.layoutInfo.viewportEndOffset
                when {
                    pointerY in 0f..edge -> listState.scrollBy(-step)
                    pointerY >= viewportEnd - edge -> listState.scrollBy(step)
                }
                delay(16)
            }
        }

        // 本地预览顺序：拖拽中把 from 那条挪到 to，其余不动。松手提交后由新快照接管。
        val dragging = dragUid != null && dragFrom >= 0 && dragTo >= 0
        val previewItems = remember(queue.items, dragging, dragFrom, dragTo) {
            val base = queue.items
            if (!dragging || dragFrom >= base.size || dragTo >= base.size) base
            else buildList {
                addAll(base.filterIndexed { i, _ -> i != dragFrom })
                add(dragTo, base[dragFrom])
            }
        }
        // 预览顺序与真身顺序不同（拖拽中），行下标要按预览列表算；提交时也用预览下标。
        val displayItems = previewItems

        // 遮罩已上收到宿主（MinimalSheetScrim，只渐显不滑移）；这里只画底部面板本体。
        Column(
            Modifier
                .fillMaxWidth()
                .height(animatedHeight)
                .clip(RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp))
                .background(theme.surface)
                .align(Alignment.BottomCenter),
        ) {
                // 把手：上下拖在两档高度间切换；半档再往下拖即关闭。
                // 只让把手/标题栏吃手势，LazyColumn 的滚动不受影响。
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(28.dp)
                        .pointerInput(Unit) {
                            detectVerticalDragGestures(
                                onDragEnd = { handleSheetDragEnd() },
                                onDragCancel = { dragY = 0f },
                            ) { _, delta -> dragY += delta }
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Box(
                        Modifier
                            .width(38.dp)
                            .height(4.dp)
                            .background(theme.muted.copy(alpha = 0.35f), RoundedCornerShape(999.dp))
                    )
                }
                Row(
                    Modifier
                        .fillMaxWidth()
                        .pointerInput(Unit) {
                            // 标题栏也能拖：和把手同一套语义。
                            detectVerticalDragGestures(
                                onDragEnd = { handleSheetDragEnd() },
                                onDragCancel = { dragY = 0f },
                            ) { _, delta -> dragY += delta }
                        }
                        .padding(start = 22.dp, end = 12.dp, top = 2.dp, bottom = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("播放队列", color = theme.text, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.width(8.dp))
                    Text("${queue.total} 首", color = theme.muted, fontSize = 12.sp)
                    Spacer(Modifier.weight(1f))
                    QueueModeButton(theme = theme, mode = mode, light = light, onClick = onToggleMode)
                    Spacer(Modifier.width(6.dp))
                    Box(
                        Modifier
                            .size(40.dp)
                            .semantics { contentDescription = "关闭" }
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                                onClick = onClose,
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Canvas(Modifier.size(17.dp)) {
                            val u = size.minDimension / 17f
                            val w = 1.8f * u
                            drawLine(theme.text, Offset(3f * u, 3f * u), Offset(14f * u, 14f * u), w, StrokeCap.Round)
                            drawLine(theme.text, Offset(14f * u, 3f * u), Offset(3f * u, 14f * u), w, StrokeCap.Round)
                        }
                    }
                }
                if (queue.isEmpty) {
                    Box(Modifier.fillMaxWidth().height(160.dp), contentAlignment = Alignment.Center) {
                        Text("队列是空的", color = theme.muted, fontSize = 13.sp)
                    }
                } else {
                    LazyColumn(state = listState, modifier = Modifier.fillMaxWidth()) {
                        itemsIndexed(displayItems, key = { _, item -> item.uid }) { index, item ->
                            val dragged = item.uid == dragUid
                            val isCurrent = !dragged && queue.currentKey.isNotEmpty() && item.songKey == queue.currentKey
                            // 拖拽进行中锁行内动作：此刻的 index 是预览下标，不是真身下标，
                            // 点歌/删除会命中错的那首。拖完再点。
                            val rowLocked = dragUid != null && !dragged
                            // 拖拽回调，手柄与行长按共用同一份。
                            val startDrag: () -> Unit = {
                                dragUid = item.uid
                                dragFrom = index
                                dragTo = index
                                dragOffset = 0f
                                val info = listState.layoutInfo.visibleItemsInfo
                                    .firstOrNull { it.key == item.uid }
                                dragBase = info?.offset?.toFloat() ?: 0f
                                pointerY = dragBase + (info?.size ?: 0) / 2f
                            }
                            val moveDrag: (Float) -> Unit = { amount ->
                                dragOffset += amount
                                val info = listState.layoutInfo.visibleItemsInfo
                                    .firstOrNull { it.key == item.uid }
                                // 跟随手指的行的视觉中心（视口坐标）：自动滚动与落点判定都用它。
                                // info.offset 在预览让位时会变，但 dragBase+dragOffset 不随它变。
                                pointerY = dragBase + dragOffset + (info?.size ?: 0) / 2f
                                dragTo = dropTargetIndex(listState, item.uid, pointerY) ?: dragTo
                            }
                            val endDrag: () -> Unit = {
                                val from = dragFrom
                                val to = dragTo
                                dragUid = null
                                dragFrom = -1
                                dragTo = -1
                                dragOffset = 0f
                                dragBase = 0f
                                pointerY = -1f
                                if (from >= 0 && to >= 0 && from != to) onReorder(from, to)
                            }
                            QueueRow(
                                // 被拖的行自己跟手指，不让 animateItem 抢；其余行让位时自然滑过去。
                                modifier = if (dragged) Modifier else Modifier.animateItem(),
                                item = item,
                                position = index + 1,
                                current = isCurrent,
                                pending = pendingKey != null && item.songKey == pendingKey && !isCurrent,
                                removing = item.uid in removing,
                                lifted = dragged,
                                locked = rowLocked,
                                rowTranslationY = if (dragged) {
                                    val info = listState.layoutInfo.visibleItemsInfo.firstOrNull { it.key == item.uid }
                                    if (info != null) dragOffset + dragBase - info.offset else 0f
                                } else 0f,
                                theme = theme,
                                onPlay = {
                                    if (!rowLocked) {
                                        pendingKey = item.songKey
                                        onPlay(index)
                                    }
                                },
                                onRemove = {
                                    if (!rowLocked && item.uid !in removing) {
                                        removing = removing + item.uid
                                        onRemove(index)
                                    }
                                },
                                onRowDragStart = startDrag,
                                onRowDrag = moveDrag,
                                onRowDragEnd = endDrag,
                                dragHandle = {
                                    QueueDragHandle(
                                        theme = theme,
                                        enabled = dragUid == null || dragged,
                                        onStart = startDrag,
                                        onDrag = moveDrag,
                                        onEnd = endDrag,
                                    )
                                },
                            )
                        }
                        item { Spacer(Modifier.height(18.dp)) }
                    }
                }
            }
    }
}

/**
 * 拖拽的落点：中心点压在**别的**行上，就插到那一行的位置；越过两端则贴边。
 * 跳过被拖的那行自己 —— 否则预览让位会把自己的槽位挪到手指下面，目标就粘在自己身上不动了。
 */
private fun dropTargetIndex(listState: LazyListState, dragUid: String?, center: Float): Int? {
    val visible = listState.layoutInfo.visibleItemsInfo
    val others = visible.filter { it.key != dragUid }
    if (others.isEmpty()) return null
    others.forEach { other ->
        if (other.offset <= center && center < other.offset + other.size) return other.index
    }
    return if (center < others.first().offset) others.first().index
    else if (center >= others.last().offset + others.last().size) others.last().index
    else null // 中心点落在被拖行自己的槽位里：保持上一个目标。
}

@Composable
private fun QueueModeButton(theme: QueueTheme, mode: String, light: Boolean, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Row(
        Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(theme.highlight)
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 6.dp)
            .graphicsLayer { alpha = if (pressed) 0.72f else 1f },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        // 模式图标：全局唯一来源 PlayerIcons（第 20 轮听屿图标包几何），与传输条/歌曲工具同一套。
        // 激活态（非顺序）用薄荷绿，顺序播放随主题。
        PlaybackModeIcon(mode, if (modeIsActive(mode)) mintActive(light) else theme.text, Modifier.size(15.dp))
        Text(
            text = when (mode) {
                "one" -> "单曲循环"
                "shuffle" -> "随机播放"
                "all" -> "列表循环"
                else -> "顺序播放"
            },
            color = theme.text,
            fontSize = 12.sp,
            maxLines = 1,
        )
    }
}

@Composable
private fun QueueDragHandle(
    theme: QueueTheme,
    enabled: Boolean,
    onStart: () -> Unit,
    onDrag: (Float) -> Unit,
    onEnd: () -> Unit,
) {
    // 回调经 rememberUpdatedState 转发：拖拽期间行会随预览重组（index 变化），
    // 而 pointerInput(Unit) 不重启 —— 这里保证检测器每次触发拿到的都是最新回调。
    // enabled 只在回调里判断，绝不做 pointerInput 的 key（那会在拖起瞬间重启手势协程，
    // 长按刚生效就被取消 —— 这就是"闪一下就拖不动"的根因）。
    val currentStart by rememberUpdatedState(onStart)
    val currentDrag by rememberUpdatedState(onDrag)
    val currentEnd by rememberUpdatedState(onEnd)
    val currentEnabled by rememberUpdatedState(enabled)
    Box(
        Modifier
            .size(44.dp)
            .semantics { contentDescription = "长按拖动排序" }
            .pointerInput(Unit) {
                detectDragGesturesAfterLongPress(
                    onDragStart = { if (currentEnabled) currentStart() },
                    onDrag = { change, amount ->
                        change.consume()
                        if (currentEnabled) currentDrag(amount.y)
                    },
                    onDragEnd = { if (currentEnabled) currentEnd() },
                    onDragCancel = { if (currentEnabled) currentEnd() },
                )
            },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(18.dp)) {
            val u = size.minDimension / 18f
            val w = 1.6f * u
            val ink = theme.muted
            listOf(5.5f, 9f, 12.5f).forEach { y ->
                drawLine(ink, Offset(4.5f * u, y * u), Offset(13.5f * u, y * u), w, StrokeCap.Round)
            }
        }
    }
}

/**
 * 队列的表面色。跟应用界面走，带一点听屿的墨绿：
 * 浅色是柔和的纸白 + 深绿字，深色是墨绿底 + 浅字。
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
private fun QueueRow(
    modifier: Modifier = Modifier,
    item: io.github.huleixin.tingyu.minimal.MinimalQueueItem,
    position: Int,
    current: Boolean,
    pending: Boolean,
    removing: Boolean,
    lifted: Boolean,
    /** 别的行正在被拖：行内动作全部锁住（预览下标 ≠ 真身下标，点了会命中错的那首）。 */
    locked: Boolean,
    rowTranslationY: Float,
    theme: QueueTheme,
    onPlay: () -> Unit,
    onRemove: () -> Unit,
    /** 长按行本体（标题/歌手区域）也能拖，与 ≡ 手柄同一套回调；单击仍是播放。 */
    onRowDragStart: () -> Unit,
    onRowDrag: (Float) -> Unit,
    onRowDragEnd: () -> Unit,
    dragHandle: @Composable () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (lifted) 1.02f else if (pressed) 0.985f else 1f,
        animationSpec = spring(stiffness = 600f),
        label = "row-scale",
    )
    // 行本体的长按拖动回调同样走 rememberUpdatedState：检测器 key 恒定，状态在回调里读。
    val rowStart by rememberUpdatedState(onRowDragStart)
    val rowDrag by rememberUpdatedState(onRowDrag)
    val rowEnd by rememberUpdatedState(onRowDragEnd)
    val rowEnabled by rememberUpdatedState(!locked)
    Row(
        modifier
            .fillMaxWidth()
            .graphicsLayer {
                translationY = rowTranslationY
                scaleX = scale
                scaleY = scale
                shadowElevation = if (lifted) 18f else 0f
                alpha = if (removing) 0.35f else 1f
            }
            .background(
                when {
                    lifted -> theme.accent.copy(alpha = 0.06f)
                    current -> theme.highlight
                    pending -> theme.accent.copy(alpha = 0.10f)
                    else -> Color.Transparent
                }
            )
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = !removing && !lifted && !locked,
                onClick = onPlay,
            )
            .padding(start = 22.dp, end = 10.dp, top = 9.dp, bottom = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = position.toString().padStart(2, '0'),
            color = theme.muted.copy(alpha = 0.6f),
            fontSize = 11.sp,
            modifier = Modifier.width(24.dp),
        )
        Column(
            Modifier
                .weight(1f)
                // 长按标题/歌手区域进入拖动：手柄之外的第二入口。× 和 ≡ 是兄弟节点，
                // 各自消费自己的触摸，不会误触发。
                .pointerInput(Unit) {
                    detectDragGesturesAfterLongPress(
                        onDragStart = { if (rowEnabled) rowStart() },
                        onDrag = { change, amount ->
                            change.consume()
                            if (rowEnabled) rowDrag(amount.y)
                        },
                        onDragEnd = { if (rowEnabled) rowEnd() },
                        onDragCancel = { if (rowEnabled) rowEnd() },
                    )
                },
        ) {
            Text(
                text = item.title.ifBlank { "未知曲目" },
                color = if (current || pending) theme.accent else theme.text,
                fontSize = 14.5.sp,
                fontWeight = if (current || pending) FontWeight.Medium else FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (item.artist.isNotBlank()) {
                Spacer(Modifier.height(2.dp))
                Text(
                    text = if (pending) "正在切换…" else item.artist,
                    color = theme.muted,
                    fontSize = 11.5.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        // 目录支持的音质层级（紧凑版标签）：目录没说就不画，绝不猜。
        QualityLevel.fromWire(item.qualityLevel)?.let { level ->
            Spacer(Modifier.width(6.dp))
            MinimalQualityBadge(level, QualityBadgeSize.COMPACT)
        }
        // 每行只有 × 删除和 ≡ 拖拽手柄（参考截图的操作方式）。
        Box(
            Modifier
                .size(40.dp)
                .semantics { contentDescription = "从队列移除" }
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    enabled = !removing && !lifted && !locked,
                    onClick = onRemove,
                ),
            contentAlignment = Alignment.Center,
        ) {
            Canvas(Modifier.size(15.dp)) {
                val u = size.minDimension / 15f
                val w = 1.7f * u
                drawLine(theme.muted, Offset(3.5f * u, 3.5f * u), Offset(11.5f * u, 11.5f * u), w, StrokeCap.Round)
                drawLine(theme.muted, Offset(11.5f * u, 3.5f * u), Offset(3.5f * u, 11.5f * u), w, StrokeCap.Round)
            }
        }
        dragHandle()
    }
}
