package io.github.huleixin.tingyu.minimal.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import io.github.huleixin.tingyu.chrome.ChromeGlyph
import io.github.huleixin.tingyu.minimal.MinimalControls
import io.github.huleixin.tingyu.minimal.MinimalPlayback
import io.github.huleixin.tingyu.minimal.MinimalPlayerCommands
import kotlinx.coroutines.delay
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/MinimalTransport.kt
//
// 进度条 + 五个传输按钮 + 分页点。
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
    modifier: Modifier = Modifier,
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
            accent = accent,
            commands = commands,
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
    accent: Color,
    commands: MinimalPlayerCommands,
) {
    var hint by remember { mutableStateOf<String?>(null) }
    var lastMode by remember { mutableStateOf(controls.mode) }
    LaunchedEffect(controls.mode) {
        if (controls.mode != lastMode) {
            lastMode = controls.mode
            hint = modeLabel(controls.mode)
            delay(1500)
            hint = null
        }
    }

    Box(Modifier.fillMaxWidth().padding(top = 14.dp)) {
        Row(
            Modifier.fillMaxWidth().height(56.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                TransportButton("播放模式：${modeLabel(controls.mode)}", live, ink, 50.dp, { commands.cycleMode() }) {
                    // 播放模式图标：与队列抽屉同一套 QQ 经典几何（顺序双箭头 / 列表环 / 单曲环+1 / 交叉箭头），
                    // 第 17 轮从 ChromeGlyph 换成手绘 —— 两处（队列/播放页）从此同一张脸。
                    QQModeGlyph(controls.mode, if (controls.mode == "off") ink.inkAlpha(74) else accent, Modifier.size(20.dp))
                }
            }
            Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                TransportButton("上一首", live && controls.canPrevious, ink, 50.dp, { commands.previous() }) {
                    ChromeGlyph("previous", ink.ink, Modifier.size(24.dp))
                }
            }
            Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                PlayButton(playing, live, ink) { commands.toggle() }
            }
            Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                TransportButton("下一首", live && controls.canNext, ink, 50.dp, { commands.next() }) {
                    ChromeGlyph("next", ink.ink, Modifier.size(24.dp))
                }
            }
            Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                TransportButton("播放队列", live, ink, 50.dp, { commands.openQueue() }) {
                    ChromeGlyph("queue", ink.ink, Modifier.size(21.dp))
                }
            }
        }
        // 模式名在按钮正上方停 1.5 秒（CSS 的 .min-mode-hint），不落在歌词上。
        AnimatedVisibility(
            visible = hint != null,
            enter = fadeIn(tween(150)),
            exit = fadeOut(tween(220)),
            modifier = Modifier.align(Alignment.TopStart),
        ) {
            Box(
                Modifier
                    .height(22.dp)
                    .background(ink.ink.copy(alpha = 0.04f), RoundedCornerShape(999.dp))
                    .border(1.dp, ink.inkAlpha(12), RoundedCornerShape(999.dp))
                    .padding(horizontal = 9.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = hint ?: "",
                    color = ink.inkAlpha(88),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    letterSpacing = 0.22.sp,
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
private fun TransportButton(
    label: String,
    enabled: Boolean,
    ink: MinimalInk,
    size: Dp,
    onClick: () -> Unit,
    content: @Composable () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed && enabled) 0.9f else 1f,
        animationSpec = tween(150),
        label = "minimal-btn-press",
    )
    Box(
        Modifier
            .size(size)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                alpha = if (enabled) 1f else 0.3f
            }
            .semantics { contentDescription = label }
            .clickable(interactionSource = interaction, indication = null, enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { content() }
}

@Composable
private fun PlayButton(playing: Boolean, enabled: Boolean, ink: MinimalInk, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed && enabled) 0.9f else 1f,
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
        animationSpec = tween(170),
        label = "minimal-play-alpha",
    )
    val pauseAlpha by animateFloatAsState(
        targetValue = if (playing) 1f else 0f,
        animationSpec = tween(170),
        label = "minimal-pause-alpha",
    )
    Box(modifier) {
        Box(Modifier.fillMaxSize().graphicsLayer { alpha = playAlpha }) {
            ChromeGlyph("play", color, Modifier.fillMaxSize())
        }
        Box(Modifier.fillMaxSize().graphicsLayer { alpha = pauseAlpha }) {
            ChromeGlyph("pause", color, Modifier.fillMaxSize())
        }
    }
}

/** 分页点：跟随 pager 的位置，靠近的那个变长变亮。绘制阶段读位置，不触发重组。
 *
 * 长按任意一点：翻转渲染来源诊断角标（临时，验收后删）。角标状态由 JS 的 localStorage 持有，
 * 经动作桥翻转后随下一帧回来 —— 两端（Compose / WebView）看同一个开关。
 */
@Composable
fun PageDots(
    pageOffset: () -> Float,
    pageCount: Int,
    ink: MinimalInk,
    onSelect: (Int) -> Unit,
    onLongPress: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    Row(
        modifier.fillMaxWidth().height(24.dp)
            .pointerInput(onLongPress) { detectTapGestures(onLongPress = { onLongPress() }) },
        horizontalArrangement = Arrangement.spacedBy(7.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        repeat(pageCount) { index ->
            val interaction = remember { MutableInteractionSource() }
            Box(
                Modifier
                    .size(16.dp)
                    .clickable(interactionSource = interaction, indication = null) { onSelect(index) }
                    .semantics { contentDescription = if (index == 0) "封面页" else "歌词页" },
                contentAlignment = Alignment.Center,
            ) {
                Canvas(Modifier.size(width = 8.dp, height = 4.dp)) {
                    val near = (1f - abs(pageOffset() - index)).coerceIn(0f, 1f)
                    drawRoundRect(
                        color = ink.ink.copy(alpha = 0.32f + 0.68f * near * 0.88f),
                        size = Size(size.width * (0.5f + 0.5f * near), size.height),
                        cornerRadius = CornerRadius(999f, 999f),
                    )
                }
            }
        }
    }
}

private fun timeText(seconds: Int): String {
    val value = max(0, seconds)
    return "%02d:%02d".format(value / 60, value % 60)
}

/**
 * QQ 音乐经典风格的播放模式图标，与 MinimalQueueSheet 的 QueueModeButton 同一套几何：
 * 顺序 = 向右双横带箭头；列表循环 = 环 + 箭头缺口；单曲 = 环 + 1；随机 = 交叉带箭头。
 */
@Composable
private fun QQModeGlyph(mode: String, color: Color, modifier: Modifier) {
    Canvas(modifier) {
        val u = size.minDimension / 14f
        val w = 1.6f * u
        when (mode) {
            "one" -> { // 单曲循环：环 + 1
                drawCircle(color, 5f * u, style = Stroke(w))
                drawLine(color, Offset(7f * u, 4.4f * u), Offset(7f * u, 9.6f * u), w, StrokeCap.Round)
            }
            "shuffle" -> { // 随机：两条交叉带箭头
                drawLine(color, Offset(2.5f * u, 4f * u), Offset(11.5f * u, 10f * u), w, StrokeCap.Round)
                drawLine(color, Offset(2.5f * u, 10f * u), Offset(11.5f * u, 4f * u), w, StrokeCap.Round)
                drawLine(color, Offset(9.6f * u, 2.6f * u), Offset(11.5f * u, 4f * u), w, StrokeCap.Round)
                drawLine(color, Offset(9.6f * u, 11.4f * u), Offset(11.5f * u, 10f * u), w, StrokeCap.Round)
            }
            "all" -> { // 列表循环：环 + 箭头缺口
                drawArc(color, -60f, 300f, false, style = Stroke(w))
                drawLine(color, Offset(11f * u, 2.6f * u), Offset(11f * u, 6.4f * u), w, StrokeCap.Round)
            }
            else -> { // 顺序：向右两横带箭头
                drawLine(color, Offset(2.5f * u, 4.2f * u), Offset(8.5f * u, 4.2f * u), w, StrokeCap.Round)
                drawLine(color, Offset(2.5f * u, 9.8f * u), Offset(11.5f * u, 9.8f * u), w, StrokeCap.Round)
                drawLine(color, Offset(6.6f * u, 2.4f * u), Offset(8.5f * u, 4.2f * u), w, StrokeCap.Round)
                drawLine(color, Offset(6.6f * u, 6f * u), Offset(8.5f * u, 4.2f * u), w, StrokeCap.Round)
            }
        }
    }
}

private fun modeLabel(mode: String): String = when (mode) {
    "all" -> "列表循环"
    "one" -> "单曲循环"
    "shuffle" -> "随机播放"
    else -> "顺序播放"
}
