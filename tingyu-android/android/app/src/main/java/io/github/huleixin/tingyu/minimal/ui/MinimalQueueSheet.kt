package io.github.huleixin.tingyu.minimal.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.huleixin.tingyu.minimal.MinimalQueue

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/MinimalQueueSheet.kt
//
// 原生播放队列抽屉。
//
// 只画队列，不拥有队列：内容来自 `MinimalQueue`（JS 推来的只读投影），
// 行内动作用 `commands` 发回 JS，由原来的 `onPlaySong` / `onRemoveSong` /
// `onMoveSongToNext` / `onMoveSongToEnd` 执行。所以两边看到的永远是同一个队列。

@Composable
fun MinimalQueueSheet(
    queue: MinimalQueue,
    ink: MinimalInk,
    base: Color,
    accent: Color,
    onClose: () -> Unit,
    onPlay: (Int) -> Unit,
    onRemove: (Int) -> Unit,
    onMoveNext: (Int) -> Unit,
    onMoveEnd: (Int) -> Unit,
) {
    var drag by remember { mutableFloatStateOf(0f) }
    val listState = rememberLazyListState()

    BackHandler(enabled = true) { onClose() }

    // 打开就把当前曲滚进视野。放在一次性的 key 上：翻列表时不抢。
    LaunchedEffect(queue.version, queue.currentIndex) {
        if (queue.currentIndex >= 0) {
            listState.scrollToItem((queue.currentIndex - 2).coerceAtLeast(0))
        }
    }

    Box(Modifier.fillMaxSize()) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.44f))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onClose,
                )
        )
        Column(
            Modifier
                .fillMaxWidth()
                .heightIn(max = 640.dp)
                .graphicsLayer { translationY = drag }
                .clip(RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp))
                .background(base)
                .align(Alignment.BottomCenter)
                .pointerInput(Unit) {
                    detectVerticalDragGestures(
                        onDragEnd = {
                            if (drag > size.height * 0.22f) onClose()
                            drag = 0f
                        },
                        onDragCancel = { drag = 0f },
                    ) { _, delta -> drag = (drag + delta).coerceAtLeast(0f) }
                },
        ) {
            // 拖动把手：命中区 28dp，视觉仍是 4dp 的横条。
            // 只让把手吃下滑手势：整块都吃会抢走 LazyColumn 的滚动。
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
            ) {
                Box(
                    Modifier
                        .width(38.dp)
                        .height(4.dp)
                        .background(ink.inkAlpha(28), RoundedCornerShape(999.dp))
                )
            }
            Row(
                Modifier.fillMaxWidth().padding(start = 22.dp, end = 12.dp, top = 2.dp, bottom = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("播放队列", color = ink.ink, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.width(8.dp))
                Text("${queue.total} 首", color = ink.muted, fontSize = 12.sp)
                Spacer(Modifier.weight(1f))
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
                        drawLine(ink.ink, Offset(3f * u, 3f * u), Offset(14f * u, 14f * u), w, StrokeCap.Round)
                        drawLine(ink.ink, Offset(14f * u, 3f * u), Offset(3f * u, 14f * u), w, StrokeCap.Round)
                    }
                }
            }
            if (queue.isEmpty) {
                Box(Modifier.fillMaxWidth().height(160.dp), contentAlignment = Alignment.Center) {
                    Text("队列是空的", color = ink.muted, fontSize = 13.sp)
                }
            } else {
                LazyColumn(state = listState, modifier = Modifier.fillMaxWidth()) {
                    itemsIndexed(queue.items, key = { _, item -> item.key }) { index, item ->
                        QueueRow(
                            item = item,
                            position = index + 1,
                            current = index == queue.currentIndex,
                            ink = ink,
                            accent = accent,
                            onPlay = { onPlay(index) },
                            onRemove = { onRemove(index) },
                            onMoveNext = { onMoveNext(index) },
                            onMoveEnd = { onMoveEnd(index) },
                        )
                    }
                    item { Spacer(Modifier.height(18.dp)) }
                }
            }
        }
    }
}

@Composable
private fun QueueRow(
    item: io.github.huleixin.tingyu.minimal.MinimalQueueItem,
    position: Int,
    current: Boolean,
    ink: MinimalInk,
    accent: Color,
    onPlay: () -> Unit,
    onRemove: () -> Unit,
    onMoveNext: () -> Unit,
    onMoveEnd: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(if (current) accent.copy(alpha = 0.10f) else Color.Transparent)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onPlay,
            )
            .padding(start = 22.dp, end = 10.dp, top = 9.dp, bottom = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = position.toString().padStart(2, '0'),
            color = ink.muted.copy(alpha = 0.55f),
            fontSize = 11.sp,
            modifier = Modifier.width(24.dp),
        )
        Column(Modifier.weight(1f)) {
            Text(
                text = item.title.ifBlank { "未知曲目" },
                color = if (current) accent else ink.ink,
                fontSize = 14.5.sp,
                fontWeight = if (current) FontWeight.Medium else FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (item.artist.isNotBlank()) {
                Spacer(Modifier.height(2.dp))
                Text(
                    text = item.artist,
                    color = ink.muted,
                    fontSize = 11.5.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        // 每行的三个动作绑在本行的下标上（闭包已捕获 index）。
        RowAction("下一首播放", ink, onMoveNext) { QueueGlyph(ink, "next") }
        RowAction("移到末尾", ink, onMoveEnd) { QueueGlyph(ink, "end") }
        RowAction("从队列移除", ink, onRemove) { QueueGlyph(ink, "remove") }
    }
}

@Composable
private fun RowAction(label: String, ink: MinimalInk, onClick: () -> Unit, content: @Composable () -> Unit) {
    Box(
        Modifier
            .size(34.dp)
            .semantics { contentDescription = label }
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) { content() }
}

@Composable
private fun QueueGlyph(ink: MinimalInk, kind: String) {
    Canvas(Modifier.size(16.dp)) {
        val u = size.minDimension / 16f
        val w = 1.5f * u
        when (kind) {
            "next" -> {
                drawLine(ink.muted, Offset(4f * u, 4f * u), Offset(4f * u, 12f * u), w, StrokeCap.Round)
                drawLine(ink.muted, Offset(4f * u, 8f * u), Offset(12f * u, 8f * u), w, StrokeCap.Round)
                drawLine(ink.muted, Offset(9f * u, 5f * u), Offset(12f * u, 8f * u), w, StrokeCap.Round)
                drawLine(ink.muted, Offset(9f * u, 11f * u), Offset(12f * u, 8f * u), w, StrokeCap.Round)
            }
            "end" -> {
                drawLine(ink.muted, Offset(4f * u, 4f * u), Offset(4f * u, 12f * u), w, StrokeCap.Round)
                drawLine(ink.muted, Offset(11.5f * u, 4f * u), Offset(11.5f * u, 12f * u), w, StrokeCap.Round)
                drawLine(ink.muted, Offset(4f * u, 8f * u), Offset(9f * u, 8f * u), w, StrokeCap.Round)
            }
            else -> {
                drawLine(ink.muted, Offset(4f * u, 5f * u), Offset(12f * u, 5f * u), w, StrokeCap.Round)
                drawLine(ink.muted, Offset(4f * u, 11f * u), Offset(12f * u, 11f * u), w, StrokeCap.Round)
                drawLine(ink.muted, Offset(6.5f * u, 3f * u), Offset(6.5f * u, 13f * u), w, StrokeCap.Round)
            }
        }
    }
}
