package io.github.huleixin.tingyu.minimal.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.huleixin.tingyu.minimal.MinimalControls
import io.github.huleixin.tingyu.minimal.MinimalPlayback
import io.github.huleixin.tingyu.minimal.MinimalPlayerCommands
import kotlin.math.max
import kotlin.math.min

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/MinimalTransport.kt
//
// 共用底栏：进度条 + 上一首/播放/下一首 + 独立工具行。
//
// 进度是"锚点 + 帧外推"：只重画不重组。时间文字用整秒做派生值，一秒才换一次字符串；
// 轨道、已播部分、拇指、辉光全部在 draw 阶段读时钟。
// 拖动时位置只在本组件内临时持有，松手才发 seek —— 与旧页面的 ProgressBar 同一套所有权。

@Composable
fun MinimalTransport(
    playback: MinimalPlayback,
    controls: MinimalControls,
    clock: State<Long>,
    ink: MinimalInk,
    accent: Color,
    commands: MinimalPlayerCommands,
    light: Boolean = false,
    onOpenSleep: (() -> Unit)? = null,
    sleepActive: Boolean = false,
    sleepLabel: String = "定时关闭",
    onSleepAnchor: ((androidx.compose.ui.geometry.Rect) -> Unit)? = null,
    onOpenMore: () -> Unit = {},
    moreMenu: @Composable () -> Unit = {},
    /**
     * 上一首 / 下一首的封面动画入口。给定时由封面堆叠控制器接管（先跑动画再确认），
     * 没给就仍然直连动作总线 —— 两种情况下发的都是同一条命令，只是有没有过渡。
     */
    onPrevious: (() -> Boolean)? = null,
    onNext: (() -> Boolean)? = null,
    modifier: Modifier = Modifier,
    onMoreAnchor: ((androidx.compose.ui.geometry.Rect) -> Unit)? = null,
) {
    val live = commands.available && !controls.disabled
    Column(modifier.fillMaxWidth().padding(horizontal = 26.dp)) {
        SeekRow(
            playback = playback,
            clock = clock,
            ink = ink,
            accent = accent,
            enabled = live && playback.track.durationMs > 0L,
            playing = playback.playing,
            onSeek = { seconds -> commands.seekTo(seconds) },
        )
        TransportButtons(
            playing = playback.playing,
            controls = controls,
            live = live,
            ink = ink,
            commands = commands,
            onPrevious = onPrevious,
            onNext = onNext,
        )
        MinimalPlayerTools(
            controls = controls,
            live = live,
            ink = ink,
            light = light,
            commands = commands,
            onOpenSleep = onOpenSleep,
            sleepActive = sleepActive,
            sleepLabel = sleepLabel,
            onSleepAnchor = onSleepAnchor,
            onOpenMore = onOpenMore,
            onMoreAnchor = onMoreAnchor,
            moreMenu = moreMenu,
        )
    }
}

@Composable
private fun SeekRow(
    playback: MinimalPlayback,
    clock: State<Long>,
    ink: MinimalInk,
    accent: Color,
    enabled: Boolean,
    playing: Boolean,
    onSeek: (Double) -> Unit,
) {
    val duration = playback.track.durationMs / 1000.0
    var dragged by remember(playback.track.key) { mutableStateOf<Double?>(null) }
    var seeking by remember { mutableStateOf(false) }

    // 整秒派生：每秒换一次文本，不是每帧。
    val elapsedSeconds by remember(playback) {
        derivedStateOf {
            (dragged ?: playback.positionSecAt(clock.value)).toInt()
        }
    }
    val durationSeconds = duration.toInt()

    Column(Modifier.fillMaxWidth()) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(26.dp)
                .semantics {
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
                }
                .pointerInput(enabled, duration, playback.track.key) {
                    if (!enabled) return@pointerInput
                    detectDragGestures(
                        onDragStart = {
                            seeking = true
                            dragged = (it.x / size.width * duration).coerceIn(0.0, duration)
                        },
                        onDragEnd = {
                            dragged?.let(onSeek)
                            dragged = null
                            seeking = false
                        },
                        onDragCancel = {
                            dragged = null
                            seeking = false
                        },
                    ) { change, _ ->
                        change.consume()
                        dragged = (change.position.x / size.width * duration).coerceIn(0.0, duration)
                    }
                }
                .pointerInput(enabled, duration) {
                    if (enabled) {
                        detectTapGestures {
                            onSeek((it.x / size.width * duration).coerceIn(0.0, duration))
                        }
                    }
                },
            contentAlignment = Alignment.Center,
        ) {
            Canvas(Modifier.fillMaxSize()) {
                val fraction = if (duration > 0) {
                    ((dragged ?: playback.positionSecAt(clock.value)) / duration).toFloat().coerceIn(0f, 1f)
                } else 0f
                val y = size.height / 2f
                val thumbX = size.width * fraction
                val lineHeight = 3.dp.toPx()
                drawLine(ink.track, Offset(0f, y), Offset(size.width, y), lineHeight, StrokeCap.Round)
                drawLine(ink.fill, Offset(0f, y), Offset(thumbX, y), lineHeight, StrokeCap.Round)

                // 拇指前的辉光（CSS 的 min-progress-shine）：播放时呼吸，拖动时全亮。
                val glowWidth = min(76.dp.toPx(), thumbX)
                if (glowWidth > 1f) {
                    drawRoundRect(
                        brush = Brush.horizontalGradient(
                            listOf(Color.Transparent, accent.copy(alpha = 0.58f), accent, ink.fill),
                            startX = thumbX - glowWidth,
                            endX = thumbX,
                        ),
                        topLeft = Offset(thumbX - glowWidth, y - 2.dp.toPx()),
                        size = Size(glowWidth, 4.dp.toPx()),
                        cornerRadius = CornerRadius(999f, 999f),
                        alpha = if (seeking) 1f else if (playing) 0.55f else 0.35f,
                    )
                }
                if (playing || seeking) {
                    drawCircle(accent.copy(alpha = 0.18f), 9.5.dp.toPx(), Offset(thumbX, y))
                    drawCircle(accent.copy(alpha = 0.30f), 7.dp.toPx(), Offset(thumbX, y))
                } else {
                    drawCircle(ink.fill.copy(alpha = 0.16f), 8.5.dp.toPx(), Offset(thumbX, y))
                }
                drawCircle(ink.fill, 4.5.dp.toPx(), Offset(thumbX, y))
            }
        }
        // CSS：track 26 + gap 2 + time 14 —— 中心距 25dp。少了这个间距，时间会贴着轨道，
        // 整个传输条比参考矮一截，上方内容就会跟着往下沉。
        Spacer(Modifier.height(5.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(
                text = timeText(elapsedSeconds),
                color = ink.muted,
                fontSize = 11.5.sp,
                fontWeight = FontWeight.Medium,
                letterSpacing = 0.23.sp,
            )
            Text(
                text = timeText(durationSeconds),
                color = ink.muted,
                fontSize = 11.5.sp,
                fontWeight = FontWeight.Medium,
                letterSpacing = 0.23.sp,
            )
        }
    }
}

@Composable
private fun TransportButtons(
    playing: Boolean,
    controls: MinimalControls,
    live: Boolean,
    ink: MinimalInk,
    commands: MinimalPlayerCommands,
    onPrevious: (() -> Boolean)?,
    onNext: (() -> Boolean)?,
) {
    Box(Modifier.fillMaxWidth().padding(top = 14.dp)) {
        Row(
            Modifier.fillMaxWidth().height(56.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(28.dp, Alignment.CenterHorizontally),
        ) {
                TransportButton(
                    label = "上一首",
                    enabled = live && controls.canPrevious,
                    ink = ink,
                    size = 50.dp,
                    onClick = { if (onPrevious?.invoke() != true) commands.previous() },
                ) {
                    PlayerControlIcon("skipBack", ink.ink, Modifier.size(24.dp))
                }
                PlayButton(playing, live, ink) { commands.toggle() }
                TransportButton(
                    label = "下一首",
                    enabled = live && controls.canNext,
                    ink = ink,
                    size = 50.dp,
                    onClick = { if (onNext?.invoke() != true) commands.next() },
                ) {
                    PlayerControlIcon("skipForward", ink.ink, Modifier.size(24.dp))
                }
        }
    }
}

@Composable
internal fun TransportButton(
    label: String,
    enabled: Boolean,
    ink: MinimalInk,
    size: Dp,
    onClick: () -> Unit,
    onLongClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed && enabled && !io.github.huleixin.tingyu.chrome.LocalLiquidReduced.current) 0.94f else 1f,
        animationSpec = tween(150),
        label = "minimal-btn-press",
    )
    Box(
        modifier
            .size(size)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                alpha = if (enabled) 1f else 0.3f
            }
            .semantics { contentDescription = label }
            .combinedClickable(interactionSource = interaction, indication = null, enabled = enabled,
                onLongClick = onLongClick, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { content() }
}

@Composable
private fun PlayButton(playing: Boolean, enabled: Boolean, ink: MinimalInk, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed && enabled && !io.github.huleixin.tingyu.chrome.LocalLiquidReduced.current) 0.94f else 1f,
        animationSpec = tween(130),
        label = "minimal-play-press",
    )
    Box(
        Modifier
            .size(56.dp)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                alpha = if (enabled) 1f else 0.35f
            }
            .semantics { contentDescription = if (playing) "暂停" else "播放" }
            .clickable(interactionSource = interaction, indication = null, enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val radius = size.minDimension / 2f
            // 玻璃盘：上方一点高光 + 极淡的填充 + 一圈 1.5dp 的边。整页只有它浮在表面之上。
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(ink.ink.copy(alpha = 0.13f), Color.Transparent),
                    center = Offset(size.width / 2f, size.height * 0.18f),
                    radius = radius * 0.9f,
                ),
                radius = radius,
            )
            drawCircle(ink.ink.copy(alpha = 0.05f), radius)
            drawCircle(
                ink.ink.copy(alpha = if (playing) 0.66f else 0.44f),
                radius - 0.75.dp.toPx(),
                style = Stroke(1.5.dp.toPx()),
            )
        }
        PlayPauseGlyph(playing, ink.inkBright, Modifier.size(26.dp))
    }
}

/** 播放/暂停两个字形叠着交叉淡化 —— 换元素会让图标在一帧里闪成另一种形状。 */
@Composable
private fun PlayPauseGlyph(playing: Boolean, color: Color, modifier: Modifier) {
    val playAlpha by animateFloatAsState(
        targetValue = if (playing) 0f else 1f,
        animationSpec = tween(if(io.github.huleixin.tingyu.chrome.LocalLiquidReduced.current)0 else 170),
        label = "minimal-play-alpha",
    )
    val pauseAlpha by animateFloatAsState(
        targetValue = if (playing) 1f else 0f,
        animationSpec = tween(if(io.github.huleixin.tingyu.chrome.LocalLiquidReduced.current)0 else 170),
        label = "minimal-pause-alpha",
    )
    Box(modifier) {
        Box(Modifier.fillMaxSize().graphicsLayer { alpha = playAlpha }) {
            PlayerControlIcon("play", color, Modifier.fillMaxSize())
        }
        Box(Modifier.fillMaxSize().graphicsLayer { alpha = pauseAlpha }) {
            PlayerControlIcon("pause", color, Modifier.fillMaxSize())
        }
    }
}

private fun timeText(seconds: Int): String {
    val value = max(0, seconds)
    return "%02d:%02d".format(value / 60, value % 60)
}
