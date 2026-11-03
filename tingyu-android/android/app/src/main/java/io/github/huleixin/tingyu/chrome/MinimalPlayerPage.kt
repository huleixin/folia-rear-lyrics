package io.github.huleixin.tingyu.chrome

import android.os.SystemClock
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import io.github.huleixin.tingyu.minimal.MinimalClockSource
import io.github.huleixin.tingyu.minimal.MinimalLyrics
import io.github.huleixin.tingyu.minimal.MinimalLyricsStatus
import io.github.huleixin.tingyu.minimal.MinimalPlayback
import io.github.huleixin.tingyu.minimal.MinimalPlayerCommands
import io.github.huleixin.tingyu.minimal.MinimalPlayerState

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/MinimalPlayerPage.kt
//
// Compose 原生极简播放页（第一阶段）。
//
// 这一版刻意只做到"能正确读出全部数据"：封面、歌名、歌词（当前行 + 逐字进度）、进度、
// 播放状态、五个传输按钮。它不是极简页的最终视觉设计 —— 版式、氛围取色、翻页动效都还没做，
// 那是第二阶段的事。这里的目的是让数据链路在真机上可被验证，并且随时能退回 WebView 版本。
//
// 三条硬约束：
//   · 没有自己的播放器：状态全部来自 {@code MinimalPlayerState}，命令全部走同一条动作总线；
//   · 没有自己的计时器：位置是锚点 + 帧外推，{@code withFrameNanos} 只在有帧的时候走；
//   · 没有自己的歌词解析：行结构来自统一交付点，这里只决定"第几行、唱到第几个字"。

/**
 * 极简播放页的宿主壳：只有这里订阅运行时，整个场景（WebView、导航、页）不会跟着每秒的状态帧重组。
 */
@Composable
fun MinimalPlayerSurface(
    runtime: io.github.huleixin.tingyu.minimal.MinimalPlayerRuntime,
    commands: MinimalPlayerCommands,
    modifier: Modifier = Modifier,
    safeTop: Float = 0f,
    safeBottom: Float = 0f,
    onCollapse: () -> Unit = {},
) {
    val state by runtime.state.collectAsState()
    MinimalPlayerPage(
        state = state,
        commands = commands,
        modifier = modifier,
        safeTop = safeTop,
        safeBottom = safeBottom,
        onCollapse = onCollapse,
    )
}

@Composable
fun MinimalPlayerPage(
    state: MinimalPlayerState,
    commands: MinimalPlayerCommands,
    modifier: Modifier = Modifier,
    safeTop: Float = 0f,
    safeBottom: Float = 0f,
    onCollapse: () -> Unit = {},
) {
    val palette = LocalInterfacePalette.current
    val playback = state.playback
    val clock = rememberMinimalClock(playback)
    val ink = palette.ink
    val muted = palette.muted
    val accent = palette.accent

    Column(
        modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(
                        palette.backgrounds.first().copy(alpha = 1f),
                        palette.backgrounds.last().copy(alpha = 1f),
                    )
                )
            )
            .padding(top = safeTop.dp, bottom = safeBottom.dp),
    ) {
        // 顶栏只有一件事：回到资料库。不在这里放假数据集、收藏、更多 —— 那些属于第二阶段。
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ChromeButton("收起播放页", size = 44.dp, onClick = onCollapse) {
                Canvas(Modifier.size(22.dp)) {
                    val u = size.minDimension / 22f
                    drawLine(ink, Offset(5 * u, 9 * u), Offset(11 * u, 15 * u), 2 * u, StrokeCap.Round)
                    drawLine(ink, Offset(11 * u, 15 * u), Offset(17 * u, 9 * u), 2 * u, StrokeCap.Round)
                }
            }
            Spacer(Modifier.weight(1f))
        }

        // 封面宽度跟 WebView 极简页同一条规则：占页宽的一部分，但有一个上限（那里是 322px），
        // 否则平板/横屏会把封面撑成一整屏，把歌词和传输挤出可视区。
        Box(Modifier.fillMaxWidth().padding(horizontal = 34.dp), contentAlignment = Alignment.Center) {
            Artwork(playback, Modifier.widthIn(max = 322.dp).aspectRatio(1f))
        }

        Spacer(Modifier.height(18.dp))

        Text(
            text = playback.track.title.ifEmpty { "暂无播放" },
            color = ink,
            fontSize = 21.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp),
        )
        if (playback.track.artist.isNotBlank()) {
            Spacer(Modifier.height(4.dp))
            Text(
                text = playback.track.artist,
                color = muted,
                fontSize = 13.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp),
            )
        }

        Spacer(Modifier.height(10.dp))

        LyricWindow(
            lyrics = state.lyrics,
            playback = playback,
            clock = clock,
            ink = ink,
            muted = muted,
            accent = accent,
            modifier = Modifier.fillMaxWidth().weight(1f).padding(horizontal = 26.dp),
        )

        SeekRow(
            playback = playback,
            clock = clock,
            ink = ink,
            muted = muted,
            accent = accent,
            enabled = commands.available && !state.controls.disabled && playback.track.durationMs > 0L,
            onSeek = { seconds -> commands.seekTo(seconds) },
        )

        Transport(
            state = state,
            commands = commands,
            ink = ink,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 8.dp),
        )
    }
}

@Composable
private fun Artwork(playback: MinimalPlayback, modifier: Modifier) {
    val palette = LocalInterfacePalette.current
    Box(
        modifier.clip(RoundedCornerShape(26.dp))
            .background(palette.color(Color(0xFF16241F), Color(0xFFDCE7DD))),
        contentAlignment = Alignment.Center,
    ) {
        if (playback.track.artwork.isNotBlank()) {
            AsyncImage(
                model = playback.track.artwork,
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
        } else {
            // 没有封面时不留一个空白方块：一行字比一块纯色更容易被理解成"本来就没有"。
            Text("无封面", color = palette.muted, fontSize = 12.sp)
        }
    }
}

/**
 * 帧时钟：只在**正在出声**时跟着帧走，暂停时立刻停。
 *
 * 这不是一个独立计时器 —— 它读的是 {@link MinimalPlayback} 提供的锚点，自己不持有任何
 * 播放事实。暂停/后台时 {@code withFrameNanos} 不再被调度，页面自然静止。
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
private fun LyricWindow(
    lyrics: MinimalLyrics,
    playback: MinimalPlayback,
    clock: State<Long>,
    ink: Color,
    muted: Color,
    accent: Color,
    modifier: Modifier,
) {
    // 只在**换行**时重组：当前行索引由 derivedStateOf 收敛，时钟读在派生计算里，
    // 于是每帧的位置变化不会把整个歌词块重新组合一遍。
    val active by remember(lyrics, playback) {
        derivedStateOf { lyrics.activeIndex(playback.lyricSecAt(clock.value)) }
    }
    val lines = lyrics.lines
    Column(modifier, verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        when {
            !playback.track.present -> Text("没有正在播放的歌曲", color = muted, fontSize = 13.sp)
            lyrics.status == MinimalLyricsStatus.NONE -> Text("这首没有同步歌词", color = muted, fontSize = 13.sp)
            lines.isEmpty() -> Text("正在取词", color = muted, fontSize = 13.sp)
            else -> {
                val index = active.coerceIn(0, lines.lastIndex)
                val previous = lines.getOrNull(index - 1)
                val current = lines[index]
                val next = lines.getOrNull(index + 1)
                Text(
                    previous?.text ?: " ",
                    color = muted.copy(alpha = .35f),
                    fontSize = 14.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    current.text,
                    color = ink,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
                // 逐字进度：绘制阶段读时钟，只重画不重组。
                Canvas(Modifier.fillMaxWidth().height(3.dp).padding(top = 6.dp)) {
                    val fraction = current.sungFraction(playback.lyricSecAt(clock.value))
                    val width = size.width
                    if (width <= 0f) return@Canvas
                    drawLine(ink.copy(alpha = .14f), Offset(0f, 0f), Offset(width, 0f), 2f, StrokeCap.Round)
                    drawLine(accent, Offset(0f, 0f), Offset(width * fraction, 0f), 2f, StrokeCap.Round)
                }
                val translation = current.translation
                if (!translation.isNullOrBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        translation,
                        color = muted,
                        fontSize = 13.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                Spacer(Modifier.height(10.dp))
                Text(
                    next?.text ?: " ",
                    color = muted.copy(alpha = .35f),
                    fontSize = 14.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun SeekRow(
    playback: MinimalPlayback,
    clock: State<Long>,
    ink: Color,
    muted: Color,
    accent: Color,
    enabled: Boolean,
    onSeek: (Double) -> Unit,
) {
    val duration = playback.track.durationMs / 1000.0
    var dragged by remember(playback.track.key) { mutableStateOf<Double?>(null) }
    val elapsedSeconds by remember(playback) {
        derivedStateOf { (dragged ?: playback.positionSecAt(clock.value)) }
    }
    Column(Modifier.fillMaxWidth().padding(horizontal = 26.dp)) {
        Box(
            Modifier.fillMaxWidth().height(30.dp).semantics {
                contentDescription = "播放进度"
                progressBarRangeInfo = ProgressBarRangeInfo(
                    (dragged ?: playback.positionSecAt(clock.value)).toFloat(),
                    0f..duration.toFloat().coerceAtLeast(1f),
                )
                setProgress {
                    if (enabled) {
                        onSeek(it.toDouble().coerceIn(0.0, duration))
                        true
                    } else {
                        false
                    }
                }
            }.pointerInput(enabled, duration, playback.track.key) {
                if (!enabled) return@pointerInput
                detectDragGestures(
                    onDragStart = { dragged = (it.x / size.width * duration).coerceIn(0.0, duration) },
                    onDragEnd = { dragged?.let { value -> onSeek(value) }; dragged = null },
                    onDragCancel = { dragged = null },
                ) { change, _ ->
                    change.consume()
                    dragged = (change.position.x / size.width * duration).coerceIn(0.0, duration)
                }
            }.pointerInput(enabled, duration) {
                if (enabled) detectTapGestures { onSeek((it.x / size.width * duration).coerceIn(0.0, duration)) }
            },
            contentAlignment = Alignment.Center,
        ) {
            Canvas(Modifier.fillMaxWidth().height(6.dp)) {
                val fraction = if (duration > 0) {
                    ((dragged ?: playback.positionSecAt(clock.value)) / duration).toFloat().coerceIn(0f, 1f)
                } else 0f
                val y = size.height / 2f
                drawLine(ink.copy(alpha = .18f), Offset(0f, y), Offset(size.width, y), 3f, StrokeCap.Round)
                drawLine(accent, Offset(0f, y), Offset(size.width * fraction, y), 3f, StrokeCap.Round)
                drawCircle(ink, 4.5f, Offset(size.width * fraction, y))
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(chromeTime(elapsedSeconds), color = muted, fontSize = 11.sp)
            Text(chromeTime(duration), color = muted, fontSize = 11.sp)
        }
    }
}

@Composable
private fun Transport(
    state: MinimalPlayerState,
    commands: MinimalPlayerCommands,
    ink: Color,
    modifier: Modifier,
) {
    val playback = state.playback
    val controls = state.controls
    val live = commands.available && !controls.disabled
    val playing = playback.playing
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        ChromeButton(
            label = "播放模式：${modeLabel(controls.mode)}",
            enabled = live,
            size = 48.dp,
            onClick = { commands.cycleMode() },
        ) {
            ChromeGlyph(
                when (controls.mode) {
                    "shuffle" -> "shuffle"
                    "one" -> "one"
                    else -> "repeat"
                },
                if (controls.mode == "off") ink.copy(alpha = .55f) else ink,
                Modifier.size(21.dp),
            )
        }
        ChromeButton("上一首", enabled = live && controls.canPrevious, size = 48.dp, onClick = { commands.previous() }) {
            ChromeGlyph("previous", ink, Modifier.size(25.dp))
        }
        ChromeButton(if (playing) "暂停" else "播放", enabled = live, size = 56.dp, onClick = { commands.toggle() }) {
            Canvas(Modifier.fillMaxSize()) { drawCircle(ink.copy(alpha = .13f)) }
            ChromeGlyph(if (playing) "pause" else "play", ink, Modifier.size(28.dp))
        }
        ChromeButton("下一首", enabled = live && controls.canNext, size = 48.dp, onClick = { commands.next() }) {
            ChromeGlyph("next", ink, Modifier.size(25.dp))
        }
        ChromeButton("播放队列", enabled = live, size = 48.dp, onClick = { commands.openQueue() }) {
            ChromeGlyph("queue", ink, Modifier.size(22.dp))
        }
    }
}

private fun modeLabel(mode: String): String = when (mode) {
    "all" -> "列表循环"
    "one" -> "单曲循环"
    "shuffle" -> "随机"
    else -> "顺序"
}
