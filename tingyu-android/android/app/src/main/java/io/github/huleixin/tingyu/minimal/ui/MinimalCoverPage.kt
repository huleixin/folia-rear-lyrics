package io.github.huleixin.tingyu.minimal.ui

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.huleixin.tingyu.minimal.MinimalArtwork
import io.github.huleixin.tingyu.minimal.MinimalLyricLine
import io.github.huleixin.tingyu.minimal.MinimalPalette
import io.github.huleixin.tingyu.minimal.MinimalPlayback
import io.github.huleixin.tingyu.minimal.MinimalPlayerState
import kotlin.math.PI
import kotlin.math.sin

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/MinimalCoverPage.kt
//
// 极简封面页：大封面（含层叠）、紧凑歌曲信息、一行实时歌词。
//
// 版式来自 `minimalStage.css` 的 `.min-cover`：整列靠下对齐，封面宽度 min(90%, 39vh) 左对齐，
// 下面的标题、歌手、角标、歌词与（页外的）进度条共用同一条左边缘。上一版把这几行居中，
// 才让整页看起来像模板 —— 没有一条对齐关系，也就没有构图。

/** `.min-cover` 的左内边距：标题、歌手、角标、歌词都对齐到这条线。 */
private val HORIZONTAL_PADDING = 26.dp

/**
 * 宽度的百分比项。`@media (min-height: 900px)` 时是 `min(100%, 42vh)`；其余档位都是 90%。
 */
private fun stageWidthFraction(screenHeight: androidx.compose.ui.unit.Dp): Float =
    if (screenHeight >= 900.dp) 1f else 0.90f

/**
 * 高度上限（vh 档位），对应 CSS 的四段媒体查询：
 * ≥900 → 42vh，761..899 → 39vh，701..760 → 35vh，≤700 → 31vh。
 * 短屏上整组一起缩，而不是图片缩在框里。
 */
private fun stageCap(screenHeight: androidx.compose.ui.unit.Dp): Float = when {
    screenHeight >= 900.dp -> 0.42f
    screenHeight <= 700.dp -> 0.31f
    screenHeight <= 760.dp -> 0.35f
    else -> 0.39f
}

/** 波形的四根柱子，高度是相对高度的比例。 */
private val WAVE_BARS = floatArrayOf(0.44f, 0.8f, 1f, 0.56f)

@Composable
fun MinimalCoverPage(
    state: MinimalPlayerState,
    artwork: MinimalArtwork,
    palette: MinimalPalette,
    ink: MinimalInk,
    light: Boolean,
    clock: State<Long>,
    active: Boolean,
    still: Boolean,
    onOpenLyrics: () -> Unit,
    /** 波形（音质音效入口）：打开原版音质 / 音效面板。 */
    onAudioTools: () -> Unit = {},
    /** 封面的横向漂移（px）：由 pager 的拖动位置给出，0 表示静止。 */
    parallax: () -> Float = { 0f },
    modifier: Modifier = Modifier,
) {
    val playback = state.playback
    BoxWithConstraints(modifier.fillMaxSize()) {
        val pageWidth = maxWidth
        // 这一页在 pager 里，`maxHeight` 是分页容器的高度（顶栏、传输条、分页点都已经扣掉），
        // 而 CSS 的 `vh` 指的是**视口**高度。第一版拿 maxHeight 算 39vh，封面因此小了近三成 ——
        // 屏幕越矮差得越多。所有 vh 一律用屏幕高度。
        val vh = LocalConfiguration.current.screenHeightDp.dp
        val contentWidth = pageWidth - HORIZONTAL_PADDING * 2
        val titleSize = clampSp(23f, pageWidth.value * 0.074f, if (vh >= 900.dp) 29f else 30f)
        val lyricSize = clampSp(17f, pageWidth.value * 0.046f, 19f)
        // `.min-cover__stage { width: min(90%, 39vh) }`，并按媒体查询换档（见 stageCap）。
        val stageWidth = minOf(contentWidth * stageWidthFraction(vh), vh * stageCap(vh))

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(start = HORIZONTAL_PADDING, end = HORIZONTAL_PADDING, top = clampDp(12f, vh.value * 0.024f, 22f), bottom = 2.dp),
            verticalArrangement = Arrangement.Bottom,
        ) {
            MinimalArtworkView(
                artwork = artwork,
                bloom = Color(palette.bloom),
                ink = ink,
                floating = active,
                still = still,
                modifier = Modifier
                    .size(stageWidth)
                    .graphicsLayer { translationX = parallax() },
            )
            Spacer(Modifier.height(clampDp(15f, vh.value * 0.020f, 19f)))

            // 标题与歌手跟着 playback.track 一起切换：两者是同一个身份，不能各自淡入。
            Crossfade(
                targetState = playback.track,
                animationSpec = tween(260),
                label = "minimal-cover-meta",
            ) { track ->
                Column(Modifier.fillMaxWidth()) {
                    Text(
                        text = track.title.ifBlank { "未在播放" },
                        color = ink.ink,
                        fontSize = titleSize,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = (titleSize.value * -0.014f).sp,
                        lineHeight = titleSize * 1.26f,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    if (track.artist.isNotBlank()) {
                        Spacer(Modifier.height(clampDp(4f, vh.value * 0.006f, 6f)))
                        ArtistLine(track.artist, ink)
                    }
                }
            }

            Spacer(Modifier.height(clampDp(6f, vh.value * 0.009f, 8f)))
            Row(Modifier.fillMaxWidth().height(24.dp), verticalAlignment = Alignment.CenterVertically) {
                val quality = state.controls.quality
                if (quality.isNotBlank()) {
                    QualityChip(quality, state.controls.qualityGold, light, ink)
                }
                Spacer(Modifier.width(12.dp))
                Box(Modifier.weight(1f))
                // 波形是音质音效的入口。视觉与原页面完全一致，只是补了 44dp 命中区 ——
                // 参考图里它不可点，但需求明确要求这个入口能打开音质/音效。
                Box(
                    Modifier
                        .size(44.dp)
                        .semantics { contentDescription = "音质音效" }
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = onAudioTools,
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    PlayingWave(playing = playback.playing && active, still = still, ink = ink)
                }
            }

            Spacer(Modifier.height(clampDp(16f, vh.value * 0.022f, 20f)))
            LiveLyric(
                playback = playback,
                state = state,
                clock = clock,
                ink = ink,
                bloom = Color(palette.bloom),
                fontSize = lyricSize,
                height = (lyricSize.value * 3f).coerceAtLeast(54f).dp,
                active = active,
                onOpenLyrics = onOpenLyrics,
            )
        }
    }
}

/** 歌手行：文案 + 一个装饰性 chevron（与原页面一致；它属于"内页署名"，不是控件）。 */
@Composable
private fun ArtistLine(artist: String, ink: MinimalInk) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = artist,
            color = ink.muted,
            fontSize = 13.5.sp,
            letterSpacing = 0.135.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
        Spacer(Modifier.width(2.dp))
        ChevronRight(ink.muted.copy(alpha = 0.55f), Modifier.size(13.dp))
    }
}

@Composable
private fun ChevronRight(color: Color, modifier: Modifier) {
    androidx.compose.foundation.Canvas(modifier) {
        val u = size.minDimension / 13f
        val w = 1.6f * u
        drawLine(color, Offset(4.5f * u, 3.5f * u), Offset(9f * u, 6.5f * u), w)
        drawLine(color, Offset(9f * u, 6.5f * u), Offset(4.5f * u, 9.5f * u), w)
    }
}

/** 音质角标：一个胶囊装两个事实（"FLAC · 无损"）。 */
@Composable
private fun QualityChip(text: String, gold: Boolean, light: Boolean, ink: MinimalInk) {
    val border = if (gold) {
        if (light) Color(0xFFA07C33).copy(alpha = 0.42f) else Color(0xFFE2C48C).copy(alpha = 0.54f)
    } else ink.inkAlpha(20)
    val content = if (gold) {
        if (light) Color(0xFF8A6A26) else Color(0xFFE2C48C)
    } else ink.inkAlpha(72)
    Box(
        Modifier
            .height(24.dp)
            .background(Color.Transparent, RoundedCornerShape(999.dp))
            .border(1.dp, border, RoundedCornerShape(999.dp))
            .padding(horizontal = 11.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            color = content,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            letterSpacing = 0.605.sp,
            maxLines = 1,
        )
    }
}

/** 播放指示：四根柱子。停止播放时不是消失，而是塌到 0.42 并变淡。 */
@Composable
private fun PlayingWave(playing: Boolean, still: Boolean, ink: MinimalInk) {
    var phase by remember { mutableFloatStateOf(0f) }
    val animate = playing && !still
    LaunchedEffect(animate) {
        if (!animate) return@LaunchedEffect
        var last = 0L
        while (true) {
            withFrameNanos { now ->
                if (last == 0L) last = now
                if (now - last >= 33_000_000L) {
                    last = now
                    phase = (now % 2_100_000_000L).toFloat() / 2_100_000_000f
                }
            }
        }
    }
    Row(
        Modifier.height(15.dp),
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(2.5.dp),
    ) {
        WAVE_BARS.forEachIndexed { index, height ->
            Box(
                Modifier
                    .width(2.dp)
                    .height(15.dp)
                    .graphicsLayer {
                        val scale = if (animate) {
                            val p = (phase - index * 0.219f + 1f) % 1f
                            // 0.32 → 1 → 0.32，正弦足够，和 CSS 的 ease-in-out 差别看不出来。
                            val wave = (sin(2f * PI.toFloat() * p - PI.toFloat() / 2f) + 1f) / 2f
                            0.32f + 0.68f * wave
                        } else 0.42f
                        scaleY = scale * height
                        alpha = if (animate) 1f else 0.72f
                        transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0.5f, 1f)
                    }
                    .background(ink.ink.copy(alpha = 0.62f), RoundedCornerShape(1.dp))
            )
        }
    }
}

/** 封面页的一行实时歌词：点击进入歌词页。 */
@Composable
private fun LiveLyric(
    playback: MinimalPlayback,
    state: MinimalPlayerState,
    clock: State<Long>,
    ink: MinimalInk,
    bloom: Color,
    fontSize: androidx.compose.ui.unit.TextUnit,
    height: androidx.compose.ui.unit.Dp,
    active: Boolean,
    onOpenLyrics: () -> Unit,
) {
    val lyrics = state.lyrics
    val index by remember(lyrics, playback) {
        derivedStateOf { lyrics.activeIndex(playback.lyricSecAt(clock.value)) }
    }
    val line: MinimalLyricLine? = if (index >= 0) lyrics.lines.getOrNull(index) else null
    val text = line?.text?.trim().orEmpty()
    val interaction = remember { MutableInteractionSource() }

    Box(
        Modifier.fillMaxWidth().height(height),
        contentAlignment = Alignment.Center,
    ) {
        if (text.isNotEmpty()) {
            Crossfade(
                targetState = text,
                animationSpec = tween(280),
                label = "minimal-live-lyric",
            ) { shown ->
                Text(
                    text = shown,
                    color = ink.inkAlpha(83),
                    fontSize = fontSize,
                    fontWeight = FontWeight(450),
                    lineHeight = fontSize * 1.42f,
                    letterSpacing = (fontSize.value * 0.005f).sp,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(
                            interactionSource = interaction,
                            indication = null,
                            enabled = active,
                            onClick = onOpenLyrics,
                        ),
                )
            }
        }
    }
}
