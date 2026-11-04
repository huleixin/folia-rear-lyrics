package io.github.huleixin.tingyu.minimal.ui

import android.os.SystemClock
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.unit.sp
import androidx.compose.ui.draw.clip
import androidx.compose.material3.Text
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.border
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import io.github.huleixin.tingyu.minimal.MinimalArtwork
import io.github.huleixin.tingyu.minimal.MinimalClockSource
import io.github.huleixin.tingyu.minimal.MinimalPlayback
import io.github.huleixin.tingyu.minimal.MinimalPlayerCommands
import io.github.huleixin.tingyu.minimal.MinimalPlayerState
import io.github.huleixin.tingyu.minimal.buildMinimalPalette
import kotlinx.coroutines.launch

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/MinimalPlayerScreen.kt
//
// 极简播放页的外壳：顶栏 + 横向 pager（封面 / 歌词）+ 共用传输 + 分页点。
//
// 结构与 `MinimalStage.tsx` 一一对应：两个页面共用**一条**传输条和**一套**状态，
// 翻页只改 pager 位置，不重建任何组件 —— 所以播放、歌词进度、背景颜色都是连续的。
//
// 时钟：整个页面只有这里持有"现在"这个帧值；两个页面、进度条、逐字高亮读的是同一个数。
// 它不是计时器，是锚点外推的取样时刻。

private const val PAGE_COUNT = 2

@Composable
fun MinimalPlayerScreen(
    state: MinimalPlayerState,
    artwork: MinimalArtwork,
    commands: MinimalPlayerCommands,
    /** 队列投影。JS 推来的，抽屉只读。 */
    queue: io.github.huleixin.tingyu.minimal.MinimalQueue = io.github.huleixin.tingyu.minimal.MinimalQueue(),
    /** 打开宿主的队列抽屉。极简页自己不再持有抽屉状态。 */
    onOpenQueue: () -> Unit = {},
    light: Boolean,
    safeTop: Float,
    safeBottom: Float,
    detour: Boolean,
    onCollapse: () -> Unit,
    onOpenStage: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // 舞台顺访时这一页不画：舞台仍是 WebView，而原生页是整窗图层，盖上去就看不见舞台了。
    if (detour) return

    val playback = state.playback
    // 主题只有一个来源：桥上说的（和 palette 同源）。桥还没说话时才用宿主给的界面主题。
    val dark = !(state.controls.light ?: light)
    val ink = remember(dark) { minimalInk(!dark) }
    // 配色优先用 JS 送来的那一份（`buildMinimalPalette` 的输出，和 WebView 页面逐字节一致）；
    // 只有桥上还没有配色时，才用原生这份移植兜底。
    val local = remember(artwork.colors, artwork.songKey, dark) {
        buildMinimalPalette(artwork.colors, !dark)
    }
    val palette = state.palette ?: local
    val clock = rememberMinimalClock(playback)
    // 系统关闭动画时不跑背景漂移与封面浮动；页面仍然完整可读（与 prefers-reduced-motion 对齐）。
    val context = androidx.compose.ui.platform.LocalContext.current
    val still = remember(context) { reducedMotion(context) }

    // 抽屉归宿主所有；这里只把"列表按钮"接到它的开门动作上。
    // 之前这里裸用 `commands`，于是底部的列表按钮走的是另一条路 —— 同一个页面两套行为。
    val sheetCommands = remember(commands, onOpenQueue) {
        object : MinimalPlayerCommands by commands {
            override fun openQueue(): Boolean {
                onOpenQueue()
                return true
            }
        }
    }

    val savedPage = rememberSaveable { mutableIntStateOf(0) }
    val pagerState = rememberPagerState(initialPage = savedPage.value) { PAGE_COUNT }
    val scope = rememberCoroutineScope()
    val page = pagerState.currentPage

    Box(modifier.fillMaxSize().background(Color(palette.base))) {
        // 渲染来源角标（临时诊断，验收后删）：看到 "Compose" 就说明这一屏是原生画的。
        if (state.controls.diag) {
            Text(
                "Compose",
                color = Color(0xFFB8FFE3),
                fontSize = 11.sp,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(start = 10.dp, top = (safeTop + 6f).dp)
                    .background(Color(0xDD09251C), RoundedCornerShape(999.dp))
                    .padding(horizontal = 8.dp, vertical = 2.dp),
            )
        }
        MinimalAmbience(
            colors = paletteColors(palette),
            light = !dark,
            paused = !playback.playing,
            still = still,
            modifier = Modifier.fillMaxSize(),
        )

        Column(Modifier.fillMaxSize().padding(top = safeTop.dp, bottom = safeBottom.dp)) {
            TopBar(
                ink = ink,
                base = Color(palette.base),
                liked = state.controls.liked,
                qualityMode = state.controls.qualityMode,
                effectsOn = state.controls.effectsOn,
                likeDisabled = state.controls.likeDisabled,
                onLyricsPage = page == 1,
                commands = commands,
                onOpenQueue = onOpenQueue,
                onCollapse = onCollapse,
                onOpenStage = onOpenStage,
            )

            HorizontalPager(
                state = pagerState,
                modifier = Modifier.fillMaxWidth().weight(1f),
                beyondViewportPageCount = 1,
                key = { it },
            ) { index ->
                if (index == 0) {
                    MinimalCoverPage(
                        state = state,
                        artwork = artwork,
                        palette = palette,
                        ink = ink,
                        light = !dark,
                        clock = clock,
                        active = page == 0,
                        still = still,
                        onOpenLyrics = { scope.launch { pagerState.animateScrollToPage(1) } },
                        onAudioTools = { commands.openAudioQuality() },
                        // 拖动时封面向反方向漂一点点（CSS 的 parallax），只动图层不重画。
                        parallax = {
                            if (pagerState.currentPage == 0) -pagerState.currentPageOffsetFraction * 22f else 0f
                        },
                    )
                } else {
                    MinimalLyricsPage(
                        state = state,
                        artwork = artwork,
                        palette = palette,
                        ink = ink,
                        clock = clock,
                        active = page == 1,
                        onSeek = { seconds -> commands.seekTo(seconds) },
                    )
                }
            }

            MinimalTransport(
                playback = playback,
                controls = state.controls,
                clock = clock,
                ink = ink,
                accent = Color(palette.accent),
                commands = sheetCommands,
                modifier = Modifier.padding(top = 2.dp),
            )
            PageDots(
                pageOffset = { pagerState.currentPage + pagerState.currentPageOffsetFraction },
                pageCount = PAGE_COUNT,
                ink = ink,
                onSelect = { target -> scope.launch { pagerState.animateScrollToPage(target) } },
                onLongPress = { commands.toggleDiagBadge() },
                modifier = Modifier.padding(top = 6.dp),
            )
        }

    }
}

/**
 * 页面时钟：只在正在出声时跟着帧走，暂停时立刻停。
 *
 * 这不是独立计时器 —— 它读的是 {@link MinimalPlayback} 的锚点，自己不持有任何播放事实。
 * 暂停/后台时 `withFrameNanos` 不再被调度，页面自然静止。
 */
@Composable
private fun rememberMinimalClock(playback: MinimalPlayback): State<Long> {
    val now = remember { mutableLongStateOf(SystemClock.elapsedRealtime()) }
    LaunchedEffect(playback.source, playback.playing, playback.anchorElapsedMs) {
        now.longValue = SystemClock.elapsedRealtime()
        if (playback.playing && playback.source != MinimalClockSource.NONE) {
            while (true) {
                withFrameNanos { now.longValue = SystemClock.elapsedRealtime() }
            }
        }
    }
    return now
}

@Composable
private fun TopBar(
    ink: MinimalInk,
    base: Color,
    onOpenQueue: () -> Unit,
    liked: Boolean,
    qualityMode: String,
    effectsOn: Boolean,
    likeDisabled: Boolean,
    onLyricsPage: Boolean,
    commands: MinimalPlayerCommands,
    onCollapse: () -> Unit,
    onOpenStage: () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    Row(
        Modifier.fillMaxWidth().padding(start = 10.dp, end = 10.dp, top = 6.dp, bottom = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        TopIcon("收起播放页", onClick = onCollapse) {
            Canvas(Modifier.size(23.dp)) {
                val u = size.minDimension / 23f
                val w = 1.8f * u
                drawLine(ink.ink, Offset(5f * u, 9.5f * u), Offset(11.5f * u, 16f * u), w, StrokeCap.Round)
                drawLine(ink.ink, Offset(11.5f * u, 16f * u), Offset(18f * u, 9.5f * u), w, StrokeCap.Round)
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            TopIcon(
                label = if (liked) "取消喜欢" else "喜欢",
                enabled = !likeDisabled,
                onClick = { commands.like() },
            ) { HeartGlyph(liked, if (liked) Color(0xFFFF7B88) else ink.ink, Modifier.size(21.dp)) }

            if (onLyricsPage) {
                TopIcon("打开完整歌词舞台", onClick = onOpenStage) {
                    Canvas(Modifier.size(21.dp)) {
                        val u = size.minDimension / 21f
                        val w = 1.7f * u
                        val baseline = 17f * u
                        listOf(0.9f, 0.55f, 0.75f).forEachIndexed { index, height ->
                            val x = (5f + index * 5.5f) * u
                            drawLine(ink.ink, Offset(x, baseline), Offset(x, baseline - 12f * height * u), w, StrokeCap.Round)
                        }
                    }
                }
            } else {
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
                                    3 -> onOpenQueue()
                                    else -> commands.openPlaybackSettings()
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}

/**
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

/** 44dp 命中区 + 44dp 的图标盒；关闭时 0.35 透明度（与 CSS 的 :disabled 一致）。 */
@Composable
private fun TopIcon(
    label: String,
    enabled: Boolean = true,
    onClick: () -> Unit,
    content: @Composable () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    Box(
        Modifier
            .size(44.dp)
            .semantics { contentDescription = label }
            .clickable(interactionSource = interaction, indication = null, enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.graphicsLayer { alpha = if (enabled) 1f else 0.35f }) { content() }
    }
}

@Composable
private fun HeartGlyph(liked: Boolean, color: Color, modifier: Modifier) {
    Canvas(modifier) {
        val u = size.minDimension / 21f
        val path = Path().apply {
            moveTo(10.5f * u, 17.6f * u)
            cubicTo(3.2f * u, 12.4f * u, 2.2f * u, 8.6f * u, 4.4f * u, 6.3f * u)
            cubicTo(6.4f * u, 4.2f * u, 9.6f * u, 4.9f * u, 10.5f * u, 7.1f * u)
            cubicTo(11.4f * u, 4.9f * u, 14.6f * u, 4.2f * u, 16.6f * u, 6.3f * u)
            cubicTo(18.8f * u, 8.6f * u, 17.8f * u, 12.4f * u, 10.5f * u, 17.6f * u)
            close()
        }
        if (liked) drawPath(path, color) else drawPath(path, color, style = Stroke(1.8f * u, cap = StrokeCap.Round))
    }
}
