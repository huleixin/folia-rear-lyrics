package io.github.huleixin.tingyu.minimal.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.huleixin.tingyu.minimal.MinimalArtwork
import io.github.huleixin.tingyu.minimal.MinimalLyricLine
import io.github.huleixin.tingyu.minimal.MinimalLyricsStatus
import io.github.huleixin.tingyu.minimal.MinimalPalette
import io.github.huleixin.tingyu.minimal.MinimalPlayback
import io.github.huleixin.tingyu.minimal.MinimalPlayerState
import io.github.huleixin.tingyu.minimal.graphemeTimeline
import io.github.huleixin.tingyu.minimal.isProductionCreditLine
import kotlin.math.abs
import kotlin.math.min

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/MinimalLyricsPage.kt
//
// 极简歌词页：左对齐、逐字高亮、翻译行、点击跳转、自动平滑滚动。
//
// 三条与旧实现对齐的关键行为：
//   · **只在换行时重组**：行索引由 derivedStateOf 收敛；逐字进度再收敛成"已唱字数"这个整数，
//     所以每帧的位置变化不会重建整列，只有一个 Text 换一次字符串。
//   · **自动滚动是 240–460ms 的缓动**，不是平台平滑滚动（旧页面换掉它的理由：平台速度不可设，
//     远距离跳转会滑一秒多）。手动滚动后 4 秒内不抢位置。
//   · **字体大小真的在变**（20 → 30sp），和 CSS 一致；只有当前行一个 Text 重新排版。

private const val ACTIVE_LINE_ANCHOR = 0.32f
private const val MANUAL_HOLD_MS = 4000L
private const val SCROLL_BASE_MS = 240
private const val SCROLL_MAX_MS = 460

@Composable
fun MinimalLyricsPage(
    state: MinimalPlayerState,
    artwork: MinimalArtwork,
    palette: MinimalPalette,
    ink: MinimalInk,
    clock: State<Long>,
    active: Boolean,
    onSeek: (Double) -> Unit,
    modifier: Modifier = Modifier,
) {
    val playback = state.playback
    val lyrics = state.lyrics
    Column(modifier.fillMaxSize()) {
        Header(playback, artwork, ink)
        Box(Modifier.fillMaxWidth().weight(1f)) {
            when {
                lyrics.status == MinimalLyricsStatus.NONE -> CenteredHint("这首歌没有同步歌词", ink)
                lyrics.lines.isEmpty() -> CenteredHint("正在取词", ink)
                else -> LyricColumn(
                    lyrics = lyrics.lines,
                    playback = playback,
                    clock = clock,
                    ink = ink,
                    lyricAccent = Color(palette.lyricAccent),
                    active = active,
                    onSeek = onSeek,
                )
            }
        }
    }
}

@Composable
private fun CenteredHint(text: String, ink: MinimalInk) {
    Box(Modifier.fillMaxSize().padding(bottom = 60.dp), contentAlignment = Alignment.Center) {
        Text(text, color = ink.muted, fontSize = 13.5.sp, letterSpacing = 0.54.sp)
    }
}

/** 内页署名：46dp 小封面 + 标题/歌手 + 一道 22×1.5 的短线。 */
@Composable
private fun Header(playback: MinimalPlayback, artwork: MinimalArtwork, ink: MinimalInk) {
    val track = playback.track
    Column(Modifier.fillMaxWidth().padding(start = 26.dp, end = 26.dp, top = 2.dp, bottom = 6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            val bitmap = artwork.bitmap
            Box(
                Modifier
                    .size(46.dp)
                    .clip(RoundedCornerShape(11.dp))
                    .background(ink.ink.copy(alpha = 0.05f)),
            ) {
                if (bitmap != null && !bitmap.isRecycled) {
                    Image(
                        bitmap = bitmap.asImageBitmap(),
                        contentDescription = null,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop,
                    )
                }
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    text = track.title.ifBlank { "未在播放" },
                    color = ink.ink,
                    fontSize = 19.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = (-0.19).sp,
                    lineHeight = 24.7.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                if (track.artist.isNotBlank()) {
                    Spacer(Modifier.height(3.dp))
                    Text(
                        text = track.artist,
                        color = ink.muted,
                        fontSize = 12.5.sp,
                        letterSpacing = 0.125.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        Box(
            Modifier
                .padding(top = 11.dp)
                .width(22.dp)
                .height(1.5.dp)
                .background(ink.inkAlpha(36), RoundedCornerShape(1.dp))
        )
    }
}

@Composable
private fun LyricColumn(
    lyrics: List<MinimalLyricLine>,
    playback: MinimalPlayback,
    clock: State<Long>,
    ink: MinimalInk,
    lyricAccent: Color,
    active: Boolean,
    onSeek: (Double) -> Unit,
) {
    val scroll = rememberScrollState()
    val offsets = remember(lyrics) { FloatArray(lyrics.size) }
    val heights = remember(lyrics) { FloatArray(lyrics.size) }
    var viewport by remember { mutableFloatStateOf(0f) }
    var manualUntil by remember { mutableLongStateOf(0L) }
    var autoScrolling by remember { mutableStateOf(false) }

    val latestPlayback by rememberUpdatedState(playback)
    val index by remember(lyrics) {
        derivedStateOf {
            val time = latestPlayback.lyricSecAt(clock.value)
            if (lyrics.isEmpty() || time < lyrics[0].startSec) {
                -1
            } else {
                var low = 0
                var high = lyrics.lastIndex
                var found = 0
                while (low <= high) {
                    val mid = (low + high) shr 1
                    if (lyrics[mid].startSec <= time) {
                        found = mid
                        low = mid + 1
                    } else {
                        high = mid - 1
                    }
                }
                found
            }
        }
    }

    // 手动滚动后 4 秒内不抢位置；自动滚动自己不算"手动"。
    LaunchedEffect(scroll) {
        snapshotFlow { scroll.isScrollInProgress }.collect { moving ->
            if (moving && !autoScrolling) manualUntil = System.currentTimeMillis() + MANUAL_HOLD_MS
        }
    }

    LaunchedEffect(index, lyrics, active) {
        if (!active || viewport <= 0f) return@LaunchedEffect
        val target = index
        if (target < 0 || target >= lyrics.size) return@LaunchedEffect
        val lineTop = offsets[target]
        val lineHeight = heights[target]
        if (lineTop <= 0f || lineHeight <= 0f) return@LaunchedEffect
        if (System.currentTimeMillis() < manualUntil) return@LaunchedEffect
        val destination = (lineTop + lineHeight / 2f - viewport * ACTIVE_LINE_ANCHOR)
            .coerceIn(0f, scroll.maxValue.toFloat())
        val distance = abs(destination - scroll.value)
        if (distance < 2f) return@LaunchedEffect
        val duration = min(SCROLL_MAX_MS, SCROLL_BASE_MS + (distance / 1000f * 130f).toInt())
        autoScrolling = true
        try {
            scroll.animateScrollTo(
                destination.toInt(),
                tween(duration, easing = CubicBezierEasing(0.2f, 0.7f, 0.2f, 1f)),
            )
        } finally {
            autoScrolling = false
        }
    }

    Box(
        Modifier
            .fillMaxSize()
            .onSizeChanged { viewport = it.height.toFloat() }
            // 渐变遮罩必须画在离屏图层里：DstIn 是对**这一层**求交，没有图层就会和窗口背景混，
            // 上下会各留一条灰带（这就是第一次渲染里那条带子的来源）。
            .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
            .drawWithContent {
                drawContent()
                // 上下渐隐：内容滚动时不会在硬边上被切断。
                val fade = (34.dp.toPx() / size.height.coerceAtLeast(1f)).coerceIn(0f, 0.4f)
                drawRect(
                    brush = Brush.verticalGradient(
                        0f to Color.Transparent,
                        fade to Color.Black,
                        0.82f to Color.Black,
                        1f to Color.Transparent,
                    ),
                    blendMode = BlendMode.DstIn,
                )
            }
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(scroll)
                .padding(start = 26.dp, end = 26.dp)
                .padding(top = 20.dp, bottom = 240.dp),
        ) {
            lyrics.forEachIndexed { lineIndex, line ->
                val credit = remember(line, lineIndex) { isProductionCreditLine(line, lineIndex) }
                LyricLineRow(
                    line = line,
                    active = lineIndex == index,
                    past = lineIndex < index,
                    credit = credit,
                    playback = playback,
                    clock = clock,
                    ink = ink,
                    lyricAccent = lyricAccent,
                    onSeek = onSeek,
                    onMeasured = { top, height ->
                        if (lineIndex in offsets.indices) {
                            offsets[lineIndex] = top
                            heights[lineIndex] = height
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun LyricLineRow(
    line: MinimalLyricLine,
    active: Boolean,
    past: Boolean,
    credit: Boolean,
    playback: MinimalPlayback,
    clock: State<Long>,
    ink: MinimalInk,
    lyricAccent: Color,
    onSeek: (Double) -> Unit,
    onMeasured: (Float, Float) -> Unit,
) {
    val baseSize = if (credit) 12.5f else 20f
    val activeSize = if (credit) 14f else 30f
    val sizeState by animateFloatAsState(
        targetValue = if (active) activeSize else baseSize,
        animationSpec = tween(
            durationMillis = if (active) 280 else 240,
            easing = CubicBezierEasing(0.2f, 0.7f, 0.2f, 1f),
        ),
        label = "minimal-line-size",
    )
    // 已唱过去的行退后一点（CSS 的 [data-past] opacity .62）。用文字透明度而不是图层透明度：
    // 每行一个离屏图层在长歌词里就是几十个图层，而颜色本身是免费的。
    val fade = if (past && !active) 0.62f else 1f
    val baseColor = (if (credit) ink.mutedAlpha(78) else ink.muted).let { it.copy(alpha = it.alpha * fade) }
    // 当前行不是纯白：被封面色染一点点，这一行才像印在这张纸上而不是贴上去的。
    val currentColor = (if (credit) ink.mutedAlpha(88) else ink.brightAlpha(84)).let { it.copy(alpha = it.alpha * fade) }
    val colorState by animateColorAsState(
        targetValue = if (active) currentColor else baseColor,
        animationSpec = tween(300),
        label = "minimal-line-color",
    )

    // 只有当前行读时钟。derivedStateOf 把逐字进度收敛成整数，重组只发生在跨字时。
    val latestPlayback by rememberUpdatedState(playback)
    val sung by remember(line) {
        derivedStateOf { line.graphemeTimeline.sungCount(latestPlayback.lyricSecAt(clock.value)) }
    }
    val annotated: AnnotatedString? = if (active) {
        remember(line, sung, lyricAccent) { line.sungAnnotated(sung, lyricAccent) }
    } else null

    val interaction = remember { MutableInteractionSource() }
    Column(
        Modifier
            .fillMaxWidth()
            .onGloballyPositioned { coordinates ->
                onMeasured(
                    coordinates.positionInParent().y,
                    coordinates.size.height.toFloat(),
                )
            }
            .clickable(
                interactionSource = interaction,
                indication = null,
                onClick = { onSeek(line.startSec) },
            )
            .padding(top = if (credit) 2.dp else 5.dp, bottom = if (credit) 2.dp else 5.dp),
    ) {
        if (annotated != null) {
            Text(
                text = annotated,
                color = colorState,
                fontSize = sizeState.sp,
                fontWeight = FontWeight.SemiBold,
                lineHeight = sizeState.sp * 1.22f,
                letterSpacing = (sizeState * -0.008f).sp,
            )
        } else {
            Text(
                text = line.text,
                color = colorState,
                fontSize = sizeState.sp,
                fontWeight = FontWeight.Medium,
                lineHeight = sizeState.sp * (if (credit) 1.4f else 1.34f),
                letterSpacing = (sizeState * if (credit) 0.02f else 0.008f).sp,
            )
        }
        val translation = line.translation
        if (!translation.isNullOrBlank() && !credit) {
            Spacer(Modifier.height(2.dp))
            Text(
                text = translation,
                color = ink.mutedAlpha(72).copy(alpha = ink.mutedAlpha(72).alpha * fade),
                fontSize = 12.sp,
                lineHeight = 18.sp,
            )
        }
    }
}

/** 已唱部分染上封面高亮色，其余保持行色。只在"已唱字数"变化时重建。 */
private fun MinimalLyricLine.sungAnnotated(sung: Int, accent: Color): AnnotatedString {
    val timeline = graphemeTimeline
    return buildAnnotatedString {
        timeline.graphemes.forEachIndexed { index, grapheme ->
            if (index < sung) {
                withStyle(SpanStyle(color = accent)) { append(grapheme.text) }
            } else {
                append(grapheme.text)
            }
        }
    }
}
