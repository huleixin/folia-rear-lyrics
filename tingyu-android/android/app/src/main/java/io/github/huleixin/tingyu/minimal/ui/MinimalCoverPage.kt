package io.github.huleixin.tingyu.minimal.ui

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
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
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import io.github.huleixin.tingyu.minimal.MinimalArtwork
import io.github.huleixin.tingyu.minimal.MinimalLyricLine
import io.github.huleixin.tingyu.minimal.MinimalPalette
import io.github.huleixin.tingyu.minimal.MinimalPlayback
import io.github.huleixin.tingyu.minimal.MinimalPlayerState
import io.github.huleixin.tingyu.minimal.cover.CoverCard
import io.github.huleixin.tingyu.minimal.cover.CoverStackArtwork
import io.github.huleixin.tingyu.minimal.cover.CoverStackState
import io.github.huleixin.tingyu.minimal.cover.SkipStage
import io.github.huleixin.tingyu.minimal.cover.SkipTransaction
import io.github.huleixin.tingyu.minimal.cover.StackPhase
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

/**
 * 歌手串的分隔符：多歌手拼接的常见写法。切出来的每段各自可点（第 19 轮），
 * 序号与 JS 侧映射一致 —— JS 按同名序号取目录身份，取不到就按名字搜。
 */
private val ARTIST_SEPARATORS = Regex("\\s*[/、，,;；&]\\s*")

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
    /** 三层封面堆叠（动画器 + 卡片表）。 */
    stack: CoverStackState,
    /** 封面位图缓存（与当前曲的 `MinimalArtwork` 共用同一套加载与缓存）。 */
    covers: CoverStackArtwork,
    /**
     * 切歌事务。封面动画完成（ANIMATION_DONE）到播放状态确认之间，歌曲信息以事务的
     * 预期歌曲为准 —— 与顶层封面同源（stack 卡片），文字与封面不会各切各的。
     */
    skipTransaction: SkipTransaction = SkipTransaction(),
    onOpenLyrics: () -> Unit,
    /** 波形（音质音效入口）：打开原版音质 / 音效面板。 */
    onAudioTools: () -> Unit = {},
    /** 歌手名点击：参数是歌手串里的第几个名字（0 起）。 */
    onOpenArtist: (Int) -> Unit = {},
    /** 封面的横向漂移（px）：由 pager 的拖动位置给出，0 表示静止。 */
    parallax: () -> Float = { 0f },
    /** 封面区域的拖动手势。**只**挂在这块封面上，页面其余区域不经过它。 */
    coverGesture: Modifier = Modifier,
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
                stack = stack,
                covers = covers,
                gesture = coverGesture,
                modifier = Modifier
                    .size(stageWidth)
                    // 拖动 / 切歌动画期间把整摞封面提到本页文字之上：只有正在移动的那一张
                    // 会越出封面区域（后两层不越界，视觉上就是"拿起最上面这张盖住文字"），
                    // 松手回弹 / 补位完成（phase 回 IDLE）后立即恢复原层级。zIndex 只改
                    // 绘制顺序，不重建任何节点 —— 不会闪、不会重新淡入、不会重载位图。
                    .zIndex(if (stack.phase != StackPhase.IDLE) 1f else 0f)
                    // 无障碍：整摞封面是一个整体（内部各层图片不带描述），读屏会把这一块读成"专辑封面"。
                    // 顺带也是手势区域的边界 —— 只有在这里按下的滑动才归封面。
                    .semantics { contentDescription = "专辑封面" }
                    .graphicsLayer { translationX = parallax() },
            )
            Spacer(Modifier.height(clampDp(15f, vh.value * 0.020f, 19f)))

            // ---- 歌曲信息：与顶层封面同源的统一显示身份 ----
            //
            // 封面动画完成后、播放状态确认前，顶层封面是预期下一首的视觉预览（事务
            // ANIMATION_DONE）。这段时间标题/歌手跟着**同一张顶层卡片**走 —— 封面与文字
            // 在同一帧落在同一首歌，不再出现"封面已换、歌名还是上一首"的错位。
            // 播放状态确认（或事务失败回退）后，来源自然回到 playback.track。
            //
            // 音频还没真正开始出声（未确认/缓冲中）时补一枚"正在准备"角标：
            // 界面如实反映准备状态，不把没出声的歌画成正在播。
            val topCard = stack.cards.firstOrNull()
            val previewing = skipTransaction.stage == SkipStage.ANIMATION_DONE &&
                topCard != null &&
                topCard.songKey == skipTransaction.expectedSongKey &&
                topCard.songKey != playback.track.key
            val displayMeta = SongMeta(
                key = if (previewing && topCard != null) topCard.key else playback.track.key,
                title = if (previewing && topCard != null) topCard.title else playback.track.title,
                artist = if (previewing && topCard != null) topCard.artist else playback.track.artist,
            )
            val showPreparing = previewing || (playback.buffering && !playback.playing)

            SongMetaSwap(displayMeta, vh, ink, titleSize, onOpenArtist)

            Spacer(Modifier.height(clampDp(6f, vh.value * 0.009f, 8f)))
            Row(Modifier.fillMaxWidth().height(28.dp), verticalAlignment = Alignment.CenterVertically) {
                val quality = state.controls.quality
                // 全局音质标签：桥带可靠层级（真实播放音质，只看正在出声的容器）时用新组件；
                // 没有层级信息时回退旧 plain/gold chip（老版本 JS 或信息不足的歌）。
                val badgeLevel = QualityLevel.fromWire(state.controls.qualityLevel)
                when {
                    badgeLevel != null -> MinimalQualityBadge(badgeLevel, QualityBadgeSize.FULL)
                    quality.isNotBlank() -> QualityChip(quality, state.controls.qualityGold, light, ink)
                }
                if (showPreparing) {
                    Spacer(Modifier.width(8.dp))
                    PreparingChip(ink)
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
                // 未确认的切歌期间不显示歌词预览：它是旧歌的行，和新标题放在一起
                // 就是"歌名、歌词各说各话"。确认后新歌词到位，预览自然回来。
                suppressed = previewing,
                onOpenLyrics = onOpenLyrics,
            )
        }
    }
}

/** 一屏显示的歌曲信息（身份 + 文案）。key 变化触发淡切；同 key 的文案修正直接落。 */
private data class SongMeta(val key: String, val title: String, val artist: String)

/**
 * 歌曲信息的单槽淡切。
 *
 * 之前这里是 `Crossfade(targetState = playback.track)`：退出/进入两层同时在场，
 * 新旧标题在淡出的两百多毫秒里肉眼可见地叠在一起；而且它只认 playback.track，
 * 封面已确认换歌时文字还在等旧状态。
 *
 * 现在单一内容槽 + alpha 先降后升（110ms 出 / 150ms 入，与原 260ms 同节奏）：
 * 同一帧永远只有一份文案，永远不会交叠；切歌瞬间与封面事务协同（见调用处）。
 * 同一首歌内的文案修正（元数据补齐）不触发淡切，直接落。
 */
@Composable
private fun SongMetaSwap(
    meta: SongMeta,
    vh: androidx.compose.ui.unit.Dp,
    ink: MinimalInk,
    titleSize: androidx.compose.ui.unit.TextUnit,
    onOpenArtist: (Int) -> Unit,
) {
    var shown by remember { mutableStateOf(meta) }
    val alpha = remember { Animatable(1f) }
    LaunchedEffect(meta) {
        if (meta == shown) return@LaunchedEffect
        if (meta.key == shown.key) {
            // 同一首歌：只是文案被补齐/修正，直接换，不闪。
            shown = meta
            return@LaunchedEffect
        }
        if (alpha.value < 1f) {
            // 上一次淡切还没完又来一次（快速连切）：直接落到最新身份，不排队。
            shown = meta
            alpha.snapTo(1f)
            return@LaunchedEffect
        }
        alpha.animateTo(0f, tween(110, easing = LinearEasing))
        shown = meta
        alpha.animateTo(1f, tween(150, easing = LinearEasing))
    }
    Column(
        Modifier
            .fillMaxWidth()
            .graphicsLayer { this.alpha = alpha.value },
    ) {
        Text(
            text = shown.title.ifBlank { "未在播放" },
            color = ink.ink,
            fontSize = titleSize,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = (titleSize.value * -0.014f).sp,
            lineHeight = titleSize * 1.26f,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.fillMaxWidth(),
        )
        if (shown.artist.isNotBlank()) {
            Spacer(Modifier.height(clampDp(4f, vh.value * 0.006f, 6f)))
            ArtistLine(shown.artist, ink, onOpenArtist)
        }
    }
}

/** "正在准备"角标：音频未就绪（未确认的切歌 / 缓冲中）时如实呈现，不假装正在播。 */
@Composable
private fun PreparingChip(ink: MinimalInk) {
    Row(
        Modifier
            .height(27.dp)
            .background(ink.ink.copy(alpha = 0.06f), RoundedCornerShape(999.dp))
            .border(1.dp, ink.ink.copy(alpha = 0.12f), RoundedCornerShape(999.dp))
            .padding(horizontal = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "正在准备",
            color = ink.muted,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            letterSpacing = 0.605.sp,
            maxLines = 1,
        )
    }
}

/**
 * 歌手行（第 19 轮可点）：文案 + 装饰性 chevron 的视觉结构不变，但每个歌手名
 * 各自可点 —— 点击发 artistOpen（序号），由 JS 打开歌手页。
 *
 * 反馈：按压缩放 0.97 + 透明度 0.72（与传输按钮同一套按压语言），无 ripple
 * （这页的控件都不用 ripple， indication=null + 缩放是既定语言）。
 * 歌手串为空时整行不可点；多歌手按分隔符切段、每段一个点击区。
 */
@Composable
private fun ArtistLine(artist: String, ink: MinimalInk, onOpenArtist: (Int) -> Unit) {
    val segments = remember(artist) {
        ARTIST_SEPARATORS.split(artist).map { it.trim() }.filter { it.isNotEmpty() }
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        if (segments.isEmpty()) {
            Text(
                text = artist,
                color = ink.muted,
                fontSize = 13.5.sp,
                letterSpacing = 0.135.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
        } else {
            // 名字之间补回分隔样式（视觉与原串一致），每段一个独立的点击区。
            segments.forEachIndexed { index, name ->
                if (index > 0) {
                    Text(
                        text = " / ",
                        color = ink.muted.copy(alpha = 0.55f),
                        fontSize = 13.5.sp,
                    )
                }
                ArtistNameButton(name, ink) { onOpenArtist(index) }
            }
        }
        Spacer(Modifier.width(2.dp))
        ChevronRight(ink.muted.copy(alpha = 0.55f), Modifier.size(13.dp))
    }
}

/** 单个可点歌手名：按压缩放 + 变淡，布局权重与原文本一致。 */
@Composable
private fun ArtistNameButton(name: String, ink: MinimalInk, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.97f else 1f,
        animationSpec = tween(140),
        label = "minimal-artist-press",
    )
    Text(
        text = name,
        color = ink.muted,
        fontSize = 13.5.sp,
        letterSpacing = 0.135.sp,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                alpha = if (pressed) 0.72f else 1f
            }
            .clickable(
                interactionSource = interaction,
                indication = null,
                onClick = onClick,
            ),
    )
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

/**
 * 音质角标：一个胶囊装两个事实（"FLAC · 无损"）。
 *
 * 金色规格（第 18 轮，用户给定）：14dp 香槟金三柱图标 #D8B777 + 文字 #E5C995 +
 * 描边 #B8955C 1dp + 极淡暖金底，高 27dp，图标文字间隔 6dp；浅色模式用更深的
 * 香槟金（#A07C33 / #8A6A26）保证对比度。有损格式不进金色分支。
 */
@Composable
private fun QualityChip(text: String, gold: Boolean, light: Boolean, ink: MinimalInk) {
    val iconColor = if (light) Color(0xFFA07C33) else Color(0xFFD8B777)
    val textColor = if (light) Color(0xFF8A6A26) else Color(0xFFE5C995)
    val borderColor = if (light) Color(0xFFA07C33).copy(alpha = 0.55f) else Color(0xFFB8955C)
    val background = if (light) Color(0xFFA07C33).copy(alpha = 0.08f) else Color(0xFFB8955C).copy(alpha = 0.10f)
    val plainBorder = ink.inkAlpha(20)
    val plainText = ink.inkAlpha(72)
    Row(
        Modifier
            .height(27.dp)
            .background(if (gold) background else Color.Transparent, RoundedCornerShape(999.dp))
            .border(1.dp, if (gold) borderColor else plainBorder, RoundedCornerShape(999.dp))
            .padding(horizontal = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (gold) {
            // 香槟金小图标：图标包 control_audio_bars（五根音频柱），第 20 轮起
            // 与播放控制同一来源（PlayerIcons）；金色来自 iconColor，几何不再手绘。
            PlayerControlIcon("audioBars", iconColor, Modifier.size(14.dp))
        }
        Text(
            text = text,
            color = if (gold) textColor else plainText,
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
    /** 切歌未确认期间抑制显示：这一行的行属于旧歌，与新标题放在一起互相矛盾。 */
    suppressed: Boolean,
    onOpenLyrics: () -> Unit,
) {
    val lyrics = state.lyrics
    val index by remember(lyrics, playback) {
        derivedStateOf { lyrics.activeIndex(playback.lyricSecAt(clock.value)) }
    }
    val line: MinimalLyricLine? = if (index >= 0) lyrics.lines.getOrNull(index) else null
    val text = if (suppressed) "" else line?.text?.trim().orEmpty()
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
