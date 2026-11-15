package io.github.huleixin.tingyu.minimal.immersive.port

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.*
import androidx.compose.foundation.interaction.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.*
import androidx.compose.ui.draw.*
import androidx.compose.ui.geometry.*
import androidx.compose.ui.graphics.*
import androidx.compose.ui.input.pointer.*
import androidx.compose.ui.platform.*
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.*
import coil.compose.AsyncImage
import io.github.huleixin.tingyu.minimal.ui.PlaybackModeIcon
import io.github.huleixin.tingyu.chrome.PageIcon
import io.github.huleixin.tingyu.minimal.MinimalQueueItem
import io.github.huleixin.tingyu.minimal.immersive.MeloXPlaybackUiState
import kotlin.math.min
import kotlinx.coroutines.launch

// SPDX-License-Identifier: GPL-3.0-only
// Adapted from MeloX Android 0.7.3, c04f36b9af540806b3bb185b347572e9ca12d87d.
// Original queue dimensions, independent mode header, edge masking and long-press
// reorder are retained. Tingyu owns all queue identity, versions and actions.

@Composable
internal fun MeloXQueuePanel(
    state: MeloXPlaybackUiState, modifier: Modifier = Modifier,
    showSongHeader: Boolean = true, interactive: Boolean = true,
    onInteract: () -> Unit = {}, modeControlsVisible: Boolean = true,
    compact: Boolean = false, fadeTop: Dp = 24.dp, fadeBottom: Dp = 32.dp,
    fadeBottomTerminal: Dp = 0.dp, motionAnimating: Boolean = false,
) {
    val list = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current
    val latest by rememberUpdatedState(state)
    val latestInteract by rememberUpdatedState(onInteract)
    val topPx = with(density) { fadeTop.toPx() }
    val bottomPx = with(density) { fadeBottom.toPx() }
    val terminalPx = with(density) { fadeBottomTerminal.toPx() }
    val visible = remember { MutableTransitionState(modeControlsVisible) }.apply { targetState = modeControlsVisible }
    val currentUid = state.queue.items.getOrNull(state.queue.currentIndex)?.uid
    LaunchedEffect(currentUid) {
        val index = state.queue.currentIndex
        if (index in state.queue.items.indices) list.animateScrollToItem(index + 1)
    }
    Column(modifier.fillMaxSize()) {
        if (showSongHeader) {
            state.queue.items.getOrNull(state.queue.currentIndex)?.let { QueueSongHeaderSurface(it) }
        }
        AnimatedVisibility(visible, enter = expandVertically(tween(220), expandFrom = Alignment.Top) + fadeIn(tween(180)),
            exit = shrinkVertically(tween(220), shrinkTowards = Alignment.Top) + fadeOut(tween(180))) {
            Row(Modifier.padding(top = if (compact) 0.dp else 16.dp).fillMaxWidth()
                .meloXBackdropBlur(CircleShape, if (motionAnimating) 0.dp else 20.dp, Color.Black.copy(alpha=.10f))
                .padding(if (compact) 3.dp else 8.dp), verticalAlignment=Alignment.CenterVertically,
                horizontalArrangement=Arrangement.spacedBy(if (compact) 8.dp else 12.dp)) {
                QueueModeButton(state, interactive, compact, Modifier.weight(1f)) { latestInteract() }
                QueueLocateButton(interactive, compact) {
                    latestInteract()
                    val index=latest.queue.currentIndex
                    if (index in latest.queue.items.indices) scope.launch { list.animateScrollToItem(index+1) }
                }
            }
        }
        Box(Modifier.weight(1f).fillMaxWidth().graphicsLayer { compositingStrategy=CompositingStrategy.Offscreen }
            .queueEdgeFade(topPx,bottomPx,terminalPx).pointerInput(Unit) {
                awaitEachGesture {
                    val down=awaitFirstDown(requireUnconsumed=false, pass=PointerEventPass.Initial)
                    val start=down.position
                    do {
                        val event=awaitPointerEvent(PointerEventPass.Initial)
                        val change=event.changes.firstOrNull { it.id == down.id } ?: break
                        if (change.position.y-start.y > viewConfiguration.touchSlop) { latestInteract(); break }
                    } while(event.changes.any { it.pressed })
                }
            }) {
            LazyColumn(Modifier.fillMaxSize().meloXEdgeOverscrollHaptic(list), state=list,
                contentPadding=PaddingValues(bottom=fadeBottomTerminal), verticalArrangement=Arrangement.spacedBy(4.dp)) {
                item(key="queue-title") { Text("播放队列 · " + state.queue.total, color=Color.White, fontSize=22.sp,
                    fontWeight=FontWeight.Bold, modifier=Modifier.padding(vertical=8.dp)) }
                if (state.queue.version < 0) item { Text("正在读取队列…", color=Color.White.copy(alpha=.62f)) }
                else if (state.queue.isEmpty) item { Text("队列为空", color=Color.White.copy(alpha=.62f)) }
                items(state.queue.items,key={it.uid}) { entry ->
                    QueueRow(entry, state, interactive, entry.uid==currentUid, onInteract, Modifier.animateItem())
                }
            }
        }
    }
}

@Composable
private fun QueueSongHeaderSurface(entry: MinimalQueueItem) {
    val shape=RoundedCornerShape(22.dp)
    Row(Modifier.fillMaxWidth().padding(bottom=8.dp).clip(shape)
        .meloXBackdropBlur(shape,20.dp,Color.Black.copy(alpha=.10f)).padding(horizontal=10.dp,vertical=8.dp),
        verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)) {
        QueueArtwork(entry,Modifier.size(56.dp).clip(RoundedCornerShape(10.dp)))
        Column(Modifier.weight(1f)) {
            Text(entry.title,color=Color.White,fontSize=18.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
            Text(entry.artist,color=Color.White.copy(alpha=.62f),fontSize=15.sp,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=2.dp))
        }
    }
}

@Composable
private fun QueueArtwork(entry: MinimalQueueItem, modifier: Modifier) {
    if (entry.artwork.isNotBlank()) AsyncImage(entry.artwork,null,modifier,contentScale=androidx.compose.ui.layout.ContentScale.Crop)
    else Box(modifier.background(Color.White.copy(alpha=.08f)),contentAlignment=Alignment.Center) {
        PageIcon("audio-lines",Color.White.copy(alpha=.5f),Modifier.size(24.dp))
    }
}

/** Resolve each action against the latest snapshot. Await acknowledgement before another move. */
@Composable
private fun QueueRow(entry: MinimalQueueItem,state:MeloXPlaybackUiState,interactive:Boolean,current:Boolean,
    onInteract:()->Unit,modifier:Modifier=Modifier) {
    val latest by rememberUpdatedState(state)
    var overflow by remember(entry.uid) { mutableStateOf(false) }
    var dragOffset by remember(entry.uid) { mutableFloatStateOf(0f) }
    var pendingVersion by remember(entry.uid) { mutableStateOf<Long?>(null) }
    LaunchedEffect(state.queue.version) { if(pendingVersion != state.queue.version) pendingVersion=null }
    LaunchedEffect(pendingVersion) {
        if (pendingVersion != null) {
            kotlinx.coroutines.delay(1500)
            latest.queueCommands?.requestQueue()
            pendingVersion = null
        }
    }
    val enabled=interactive && state.queueCommands?.available==true
    fun index()=latest.queue.items.indexOfFirst { it.uid==entry.uid }
    Row(modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
        .background(if(current) Color.White.copy(alpha=.10f) else Color.Transparent)
        .clickable(enabled=enabled) { onInteract(); index().takeIf { it>=0 }?.let { latest.queueCommands?.queuePlay(it) } }
        .padding(vertical=4.dp), verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)) {
        QueueArtwork(entry,Modifier.size(48.dp).clip(RoundedCornerShape(6.dp)))
        Column(Modifier.weight(1f)) {
            Text(entry.title,color=Color.White,fontSize=16.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
            Text(entry.artist,color=Color.White.copy(alpha=.58f),fontSize=14.sp,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.padding(top=2.dp))
        }
        Box {
            IconButton(onClick={onInteract();overflow=true},enabled=enabled,modifier=Modifier.size(36.dp)) {
                PageIcon("ellipsis-vertical",Color.White.copy(alpha=.58f),Modifier.size(20.dp))
            }
            DropdownMenu(expanded=overflow,onDismissRequest={overflow=false},containerColor=Color(0xFF25252A)) {
                listOf("下一首播放","移到队尾","移出队列").forEachIndexed { operation,label ->
                    DropdownMenuItem(text={Text(label,color=Color.White)},onClick={
                        overflow=false;onInteract()
                        index().takeIf { it>=0 }?.let { i -> when(operation) {
                            0->latest.queueCommands?.queueMoveNext(i)
                            1->latest.queueCommands?.queueMoveEnd(i)
                            else->latest.queueCommands?.queueRemove(i)
                        } }
                    })
                }
            }
        }
        Box(Modifier.size(32.dp,48.dp).semantics { contentDescription="长按调整播放顺序" }
            .pointerInput(enabled,entry.uid) {
                if(!enabled) return@pointerInput
                detectDragGesturesAfterLongPress(onDragStart={onInteract()},onDragEnd={dragOffset=0f},onDragCancel={dragOffset=0f}) { change,amount ->
                    change.consume();dragOffset+=amount.y
                    val rowHeight=52.dp.toPx()
                    val from=index()
                    val to=when { dragOffset>rowHeight->from+1;dragOffset< -rowHeight->from-1;else->from }
                    if(pendingVersion==null && from>=0 && to!=from && to in latest.queue.items.indices) {
                        val version=latest.queue.version
                        if(latest.queueCommands?.queueReorder(from,to,version)==true) pendingVersion=version
                        dragOffset=0f
                    }
                }
            },contentAlignment=Alignment.Center) { PageIcon("grip-vertical",Color.White.copy(alpha=.48f),Modifier.size(22.dp)) }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun QueueModeButton(state:MeloXPlaybackUiState,interactive:Boolean,compact:Boolean,modifier:Modifier,onInteract:()->Unit) {
    val interaction=remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    var hint by remember { mutableStateOf(false) }
    LaunchedEffect(pressed) { if(!pressed) hint=false }
    val mode=state.queue.mode.ifEmpty { state.controls.mode }
    val title=when(mode) { "all"->"列表循环";"one"->"单曲循环";"shuffle"->"随机播放";else->"顺序播放" }
    Row(modifier.height(if(compact) 24.dp else 48.dp).clip(CircleShape)
        .background(Color.White.copy(alpha=if(mode=="off") .12f else .70f))
        .combinedClickable(enabled=interactive && state.queueCommands?.available==true,interactionSource=interaction,indication=LocalIndication.current,
            onClick={onInteract();state.queueCommands?.togglePlaybackMode()},onLongClick={onInteract();hint=true})
        .semantics { contentDescription="播放模式："+title+"，点击切换" },
        horizontalArrangement=Arrangement.spacedBy(8.dp,Alignment.CenterHorizontally),verticalAlignment=Alignment.CenterVertically) {
        PlaybackModeIcon(mode,if(mode=="off")Color.White else Color.Black.copy(alpha=.62f),Modifier.size(if(compact)14.dp else 24.dp))
        Text(if(hint) "点击切换播放模式" else title,color=if(mode=="off")Color.White else Color.Black.copy(alpha=.62f),fontSize=if(compact)12.sp else 14.sp)
    }
}

@Composable
private fun QueueLocateButton(enabled:Boolean,compact:Boolean,onClick:()->Unit) {
    Box(Modifier.size(if(compact)24.dp else 48.dp).clip(CircleShape).background(Color.White.copy(alpha=.12f))
        .clickable(enabled=enabled,onClick=onClick).semantics { contentDescription="定位当前歌曲" },contentAlignment=Alignment.Center) {
        PageIcon("locate-fixed",Color.White,Modifier.size(if(compact)14.dp else 24.dp))
    }
}

private fun Modifier.queueEdgeFade(
    topFadePx: Float,
    bottomFadePx: Float,
    bottomTerminalPx: Float = 0f,
): Modifier = drawWithContent {
    drawContent()
    if (topFadePx <= 0f && bottomFadePx <= 0f && bottomTerminalPx <= 0f) return@drawWithContent
    val h = size.height
    if (h <= 0f) return@drawWithContent
    val topStop = (topFadePx / h).coerceIn(0f, 1f)
    // ⚠ 歌词页那边把 bottomEnd 下限钳在 .52（保证中间留一段不透明）。队列不能照抄这个
    //   下限：归零点最高可以到"控件面板顶沿"，短视口下 1 − terminal/h 本就可能小于 .5，
    //   硬钳成 .52 会把归零点画到比面板顶还高的位置（内容提前消失）。改成只保证色标
    //   单调递增即可。
    val bottomEnd = if (bottomTerminalPx > 0f) {
        (1f - bottomTerminalPx / h).coerceIn(0f, 1f)
    } else {
        1f
    }
    val bottomStop = (bottomEnd - bottomFadePx / h).coerceIn(min(topStop, bottomEnd), bottomEnd)
    drawRect(
        brush = Brush.verticalGradient(
            0f to Color.Transparent,
            topStop to Color.Black,
            bottomStop to Color.Black,
            bottomEnd to Color.Transparent,
            1f to Color.Transparent,
        ),
        blendMode = BlendMode.DstIn,
    )
}
