package io.github.huleixin.tingyu.minimal.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
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
import androidx.compose.runtime.rememberCoroutineScope
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
        var dragUid by remember { mutableStateOf<String?>(null) }
        var dragFrom by remember { mutableIntStateOf(-1) }
        var dragTo by remember { mutableIntStateOf(-1) }
        // dragOffset 是手指累计位移；dragBase 是拖起瞬间该行在视口里的位置。
        // 行的布局位置会随预览让位而移动，`跟随手指的平移 = dragOffset + dragBase - 当前布局位`，
        // 中心点（判定落点用）= dragBase + 半行高 + dragOffset，与让位无关。
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

        Box(Modifier.fillMaxSize()) {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = theme.scrim))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = onClose,
                    )
            )
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
                    QueueModeButton(theme = theme, mode = mode, onClick = onToggleMode)
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
                            QueueRow(
                                // 被拖的行自己跟手指，不让 animateItem 抢；其余行让位时自然滑过去。
                                modifier = if (dragged) Modifier else Modifier.animateItem(),
                                item = item,
                                position = index + 1,
                                current = isCurrent,
                                pending = pendingKey != null && item.songKey == pendingKey && !isCurrent,
                                removing = item.uid in removing,
                                lifted = dragged,
                                rowTranslationY = if (dragged) {
                                    val info = listState.layoutInfo.visibleItemsInfo.firstOrNull { it.key == item.uid }
                                    if (info != null) dragOffset + dragBase - info.offset else 0f
                                } else 0f,
                                theme = theme,
                                onPlay = {
                                    pendingKey = item.songKey
                                    onPlay(index)
                                },
                                onRemove = {
                                    if (item.uid !in removing) {
                                        removing = removing + item.uid
                                        onRemove(index)
                                    }
                                },
                                dragHandle = {
                                    QueueDragHandle(
                                        theme = theme,
                                        enabled = dragUid == null,
                                        onStart = {
                                            dragUid = item.uid
                                            dragFrom = index
                                            dragTo = index
                                            dragOffset = 0f
                                            dragBase = listState.layoutInfo.visibleItemsInfo
                                                .firstOrNull { it.key == item.uid }?.offset?.toFloat() ?: 0f
                                            pointerY = dragBase + 20f
                                        },
                                        onDrag = { amount ->
                                            dragOffset += amount
                                            val info = listState.layoutInfo.visibleItemsInfo
                                                .firstOrNull { it.key == item.uid }
                                            if (info != null) {
                                                // 跟随手指后的行中心（视口坐标），自动滚动与落点判定都用它。
                                                pointerY = info.offset + info.size / 2f +
                                                    (dragOffset + dragBase - info.offset)
                                            }
                                            dragTo = dropTargetIndex(listState, dragBase, dragOffset) ?: dragTo
                                        },
                                        onEnd = {
                                            val from = dragFrom
                                            val to = dragTo
                                            dragUid = null
                                            dragFrom = -1
                                            dragTo = -1
                                            dragOffset = 0f
                                            dragBase = 0f
                                            pointerY = -1f
                                            if (from >= 0 && to >= 0 && from != to) onReorder(from, to)
                                        },
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
}

/** 拖拽中心点落在哪一项上，就排到哪一项的位置。中心点与让位无关（见 dragBase 注释）。 */
private fun dropTargetIndex(listState: LazyListState, dragBase: Float, dragOffset: Float): Int? {
    val info = listState.layoutInfo
    val dragged = info.visibleItemsInfo.firstOrNull { it.offset <= dragBase + dragOffset && dragBase + dragOffset < it.offset + it.size }
    return dragged?.index
}

@Composable
private fun QueueModeButton(theme: QueueTheme, mode: String, onClick: () -> Unit) {
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
        Canvas(Modifier.size(14.dp)) {
            val u = size.minDimension / 14f
            val w = 1.6f * u
            when (mode) {
                "one" -> { // 单曲循环：环 + 1
                    drawCircle(theme.text, 5f * u, style = Stroke(w))
                    drawLine(theme.text, Offset(7f * u, 4.4f * u), Offset(7f * u, 9.6f * u), w, StrokeCap.Round)
                }
                "shuffle" -> { // 随机：两条交叉带箭头
                    drawLine(theme.text, Offset(2.5f * u, 4f * u), Offset(11.5f * u, 10f * u), w, StrokeCap.Round)
                    drawLine(theme.text, Offset(2.5f * u, 10f * u), Offset(11.5f * u, 4f * u), w, StrokeCap.Round)
                    drawLine(theme.text, Offset(9.6f * u, 2.6f * u), Offset(11.5f * u, 4f * u), w, StrokeCap.Round)
                    drawLine(theme.text, Offset(9.6f * u, 11.4f * u), Offset(11.5f * u, 10f * u), w, StrokeCap.Round)
                }
                "all" -> { // 列表循环：环 + 箭头缺口
                    drawArc(theme.text, -60f, 300f, false, style = Stroke(w))
                    drawLine(theme.text, Offset(11f * u, 2.6f * u), Offset(11f * u, 6.4f * u), w, StrokeCap.Round)
                }
                else -> { // 顺序：向右两横带箭头
                    drawLine(theme.text, Offset(2.5f * u, 4.2f * u), Offset(8.5f * u, 4.2f * u), w, StrokeCap.Round)
                    drawLine(theme.text, Offset(2.5f * u, 9.8f * u), Offset(11.5f * u, 9.8f * u), w, StrokeCap.Round)
                    drawLine(theme.text, Offset(6.6f * u, 2.4f * u), Offset(8.5f * u, 4.2f * u), w, StrokeCap.Round)
                    drawLine(theme.text, Offset(6.6f * u, 6f * u), Offset(8.5f * u, 4.2f * u), w, StrokeCap.Round)
                }
            }
        }
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
    Box(
        Modifier
            .size(40.dp)
            .semantics { contentDescription = "长按拖动排序" }
            .pointerInput(enabled) {
                if (!enabled) return@pointerInput
                detectDragGesturesAfterLongPress(
                    onDragStart = { onStart() },
                    onDrag = { change, amount ->
                        change.consume()
                        onDrag(amount.y)
                    },
                    onDragEnd = { onEnd() },
                    onDragCancel = { onEnd() },
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
    rowTranslationY: Float,
    theme: QueueTheme,
    onPlay: () -> Unit,
    onRemove: () -> Unit,
    dragHandle: @Composable () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (lifted) 1.02f else if (pressed) 0.985f else 1f,
        animationSpec = spring(stiffness = 600f),
        label = "row-scale",
    )
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
                enabled = !removing && !lifted,
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
        Column(Modifier.weight(1f)) {
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
        // 每行只有 × 删除和 ≡ 拖拽手柄（参考截图的操作方式）。
        Box(
            Modifier
                .size(40.dp)
                .semantics { contentDescription = "从队列移除" }
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    enabled = !removing && !lifted,
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
