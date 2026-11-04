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
import androidx.compose.runtime.mutableIntStateOf
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
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
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
// 三条与旧实现对齐的关键行为（第 17 轮起）：
//   · **只在换行时重组**：行索引由 derivedStateOf 收敛；逐字进度改为**连续值**，
//     在 draw 阶段读时钟 —— 跨字不再重建字符串、不再重组，只有活动行每帧一次重绘。
//   · **高亮是连续渐入的**：双层文本 + 逐行裁剪路径按 sungPosition 推进，
//     一字之内也平滑填入（卡拉OK感），时间基准与行高亮完全同源。
//   · **景深**：距当前行越远越淡，距离在图层属性块里读状态 ——
//     换行时只写透明度属性，不重组任何一行。
//   · **字体大小真的在变**（20 → 30sp），和 CSS 一致；只有当前行一个 Text 重新排版。
//   · **自动滚动是 240–460ms 的缓动**；手动滚动后 4 秒内不抢位置。

private const val ACTIVE_LINE_ANCHOR = 0.32f
private const val MANUAL_HOLD_MS = 4000L
private const val SCROLL_BASE_MS = 240
private const val SCROLL_MAX_MS = 460

/** 锚点抖动吸收窗（秒）：小于它的倒退按抖动忽略，大于它按真实 seek 处理。 */
private const val SEEK_RESET_SEC = 0.35

@Composable
fun MinimalLyricsPage(
    state: MinimalPlayerState,
    artwork: MinimalArtwork,
    palette: MinimalPalette,
    ink: MinimalInk,
    clock: State<Long>,
    active: Boolean,
    /** pager 正在跟手/吸附：切页动画未落定，自动滚动等落定后再启动，不与切页抢帧。 */
    pagerBusy: Boolean,
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
                    active = active,
                    pagerBusy = pagerBusy,
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
    active: Boolean,
    pagerBusy: Boolean,
    onSeek: (Double) -> Unit,
) {
    val scroll = rememberScrollState()
    val offsets = remember(lyrics) { FloatArray(lyrics.size) }
    val heights = remember(lyrics) { FloatArray(lyrics.size) }
    // 每行**测量时**的字号：行高 ≈ 行数×字号×系数 + 固定内衬，据此把动画中的
    // 测量值换算成落定值 —— 滚动目标在切换瞬间就能算准，不需要事后修正。
    val measuredSizes = remember(lyrics) { FloatArray(lyrics.size) }
    var viewport by remember { mutableFloatStateOf(0f) }
    var manualUntil by remember { mutableLongStateOf(0L) }
    var autoScrolling by remember { mutableStateOf(false) }
    val autoScrollTarget = remember(lyrics) { intArrayOf(Int.MIN_VALUE) }
    val lastActiveRef = remember(lyrics) { intArrayOf(-1) }

    val latestPlayback by rememberUpdatedState(playback)
    val indexState = remember(lyrics, playback.epoch) {
        var highWater = Double.NEGATIVE_INFINITY
        derivedStateOf {
            val raw = latestPlayback.lyricSecAt(clock.value)
            // 抗抖动高水位：桥帧的到达延迟让位置可能瞬间倒退几十毫秒，行边界
            // 恰好在抖动窗里时索引先翻下去又翻回来（滚动也就先下后上）。
            // 小幅倒退钳在高位不动；大幅倒退是真实 seek/上一首，照实放行。
            highWater = when {
                raw >= highWater -> raw
                highWater - raw > SEEK_RESET_SEC -> raw
                else -> highWater
            }
            val time = highWater
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
    val index by indexState

    // 手动滚动后 4 秒内不抢位置；自动滚动自己不算"手动"。
    LaunchedEffect(scroll) {
        snapshotFlow { scroll.isScrollInProgress }.collect { moving ->
            if (moving && !autoScrolling) manualUntil = System.currentTimeMillis() + MANUAL_HOLD_MS
        }
    }

    // 切行自动滚动。目标位置按**落定布局**预测：切换瞬间旧活动行还占着放大后的
    // 高度、新活动行还没长起来，直接用测量值会系统性偏移几十像素（长行更甚）；
    // 这里按测量字号比例把两行的落定高度换算出来，一次滚到位，动画结束后不再修正。
    LaunchedEffect(index, lyrics, active, pagerBusy) {
        val previousActive = lastActiveRef[0]
        lastActiveRef[0] = index
        if (!active || pagerBusy || viewport <= 0f) return@LaunchedEffect
        val target = index
        if (target < 0 || target >= lyrics.size) return@LaunchedEffect
        // 同一目标的滚动已在途（pagerBusy 抖动重进）：不重启，避免中途变向。
        if (autoScrolling && autoScrollTarget[0] == target) return@LaunchedEffect
        if (System.currentTimeMillis() < manualUntil) return@LaunchedEffect
        if (offsets[target] <= 0f || heights[target] <= 0f) return@LaunchedEffect

        // 行高换算模型：height(字号 s) ≈ height(测量值) × s / 测量字号。
        fun settledHeight(row: Int, targetSize: Float): Float {
            val measured = heights[row]
            val at = measuredSizes[row]
            return if (measured > 0f && at > 1f) measured * (targetSize / at) else measured
        }

        // 目标上方的旧活动行正在缩小：目标行会**上移**，提前把这段算进目标。
        var shift = 0f
        if (previousActive in 0 until target) {
            val wasCredit = isProductionCreditLine(lyrics[previousActive], previousActive)
            val shrinkTo = if (wasCredit) 12.5f else 20f
            shift += settledHeight(previousActive, shrinkTo) - heights[previousActive]
        }
        // 目标行自己的落定高度（活动字号），行中心锚点用它。
        val targetCredit = isProductionCreditLine(lyrics[target], target)
        val targetSettledHeight = settledHeight(target, if (targetCredit) 14f else 30f)

        val destination = (offsets[target] + shift + targetSettledHeight / 2f - viewport * ACTIVE_LINE_ANCHOR)
            .coerceIn(0f, scroll.maxValue.toFloat())
        val distance = abs(destination - scroll.value)
        if (distance < 2f) return@LaunchedEffect
        val duration = min(SCROLL_MAX_MS, SCROLL_BASE_MS + (distance / 1000f * 130f).toInt())
        autoScrolling = true
        autoScrollTarget[0] = target
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
                    lineIndex = lineIndex,
                    indexState = indexState,
                    active = lineIndex == index,
                    credit = credit,
                    playback = playback,
                    clock = clock,
                    ink = ink,
                    onSeek = onSeek,
                    onMeasured = { top, height, atSize ->
                        if (lineIndex in offsets.indices) {
                            offsets[lineIndex] = top
                            heights[lineIndex] = height
                            measuredSizes[lineIndex] = atSize
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
    lineIndex: Int,
    indexState: State<Int>,
    active: Boolean,
    credit: Boolean,
    playback: MinimalPlayback,
    clock: State<Long>,
    ink: MinimalInk,
    onSeek: (Double) -> Unit,
    onMeasured: (Float, Float, Float) -> Unit,
) {
    val baseSize = if (credit) 12.5f else 20f
    val activeSize = if (credit) 14f else 30f
    // 当前行放大 / 上一行缩小：字号动画就是过渡本身（380/340ms 缓出，350-450ms
    // 目标带内）。纯 tween 无弹簧，不会过冲回弹。
    val sizeState by animateFloatAsState(
        targetValue = if (active) activeSize else baseSize,
        animationSpec = tween(
            durationMillis = if (active) 380 else 340,
            easing = CubicBezierEasing(0.2f, 0.7f, 0.2f, 1f),
        ),
        label = "minimal-line-size",
    )
    val baseColor = if (credit) ink.mutedAlpha(78) else ink.muted
    // 当前行不是纯白：被提亮到近白（第 18 轮明确：高亮用白，不用金色）。
    val currentColor = if (credit) ink.mutedAlpha(88) else ink.brightAlpha(84)
    val colorState by animateColorAsState(
        targetValue = if (active) currentColor else baseColor,
        animationSpec = tween(380),
        label = "minimal-line-color",
    )

    val interaction = remember { MutableInteractionSource() }
    Column(
        Modifier
            .fillMaxWidth()
            .onGloballyPositioned { coordinates ->
                onMeasured(
                    coordinates.positionInParent().y,
                    coordinates.size.height.toFloat(),
                    sizeState,
                )
            }
            // 景深：当前行最清晰，相邻稍弱，远处继续淡化。
            // 距离在**图层属性块**里读 indexState —— 换行时只更新每行的透明度属性，
            // 不触发任何一行的重组，也不触发布局。
            .graphicsLayer {
                val distance = abs(lineIndex - indexState.value)
                alpha = when {
                    distance <= 0 -> 1f
                    distance == 1 -> 0.78f
                    distance == 2 -> 0.6f
                    else -> 0.44f
                }
            }
            .clickable(
                interactionSource = interaction,
                indication = null,
                onClick = { onSeek(line.startSec) },
            )
            .padding(top = if (credit) 2.dp else 5.dp, bottom = if (credit) 2.dp else 5.dp),
    ) {
        if (active && !credit) {
            KaraokeLine(
                line = line,
                playback = playback,
                clock = clock,
                color = colorState,
                sungColor = ink.inkBright,
                fontSize = sizeState.sp,
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
                color = ink.mutedAlpha(72),
                fontSize = 12.sp,
                lineHeight = 18.sp,
            )
        }
    }
}

/**
 * 连续卡拉OK行：两层同样的文本叠放，顶层是已唱亮色，用**逐行裁剪路径**按连续
 * 进度推进 —— 字内也按浮点进度插值（第 18 轮修掉了 toInt() 丢小数的断跳）。
 *
 * 填充边界：完全唱完的字形簇之外，正在唱的那个簇按它在 TextLayoutResult 里的
 * 起止光标位置做浮点插值 —— 同一个字唱到 25%/50%/75% 填充宽度不同。簇起止都是
 * 合法光标位置（簇边界或文本末尾），代理对/组合符不会落进簇中间。双向文本里
 * 簇的光标可能右→左，按方向插值，不会反向跳。
 *
 * 进度在 draw 阶段读时钟：跨字不再重建字符串、不再重组，只有活动行每帧一次
 * 重绘；暂停时时钟停摆，填充自然冻结。
 */
@Composable
private fun KaraokeLine(
    line: MinimalLyricLine,
    playback: MinimalPlayback,
    clock: State<Long>,
    color: Color,
    sungColor: Color,
    fontSize: androidx.compose.ui.unit.TextUnit,
) {
    val latestPlayback by rememberUpdatedState(playback)
    var layout by remember(line) { mutableStateOf<androidx.compose.ui.text.TextLayoutResult?>(null) }
    val fillPath = remember(line) { Path() }
    Box {
        Text(
            text = line.text,
            color = color,
            fontSize = fontSize,
            fontWeight = FontWeight.SemiBold,
            lineHeight = fontSize * 1.22f,
            letterSpacing = (fontSize.value * -0.008f).sp,
        )
        Text(
            text = line.text,
            color = sungColor,
            fontSize = fontSize,
            fontWeight = FontWeight.SemiBold,
            lineHeight = fontSize * 1.22f,
            letterSpacing = (fontSize.value * -0.008f).sp,
            onTextLayout = { layout = it },
            modifier = Modifier.drawWithContent {
                val textLayout = layout ?: return@drawWithContent
                val timeline = line.graphemeTimeline
                val position = timeline.sungPosition(latestPlayback.lyricSecAt(clock.value))
                if (position <= 0f) return@drawWithContent
                val textLength = textLayout.layoutInput.text.length

                // 定位正在唱的字形簇：整簇唱完的字符数 + 当前簇的字内进度。
                var sungChars = 0
                var clusterStart = -1
                var clusterEnd = -1
                var clusterProgress = 0f
                var remaining = position
                for (grapheme in timeline.graphemes) {
                    val length = grapheme.text.length
                    if (remaining >= 1f) {
                        sungChars += length
                        remaining -= 1f
                    } else {
                        clusterStart = sungChars
                        clusterEnd = sungChars + length
                        clusterProgress = remaining.coerceIn(0f, 1f)
                        break
                    }
                }
                val allSung = clusterStart < 0 || sungChars >= textLength
                val sungLine = textLayout.getLineForOffset(
                    (if (allSung) textLength else clusterStart).coerceIn(0, textLength),
                )

                fillPath.rewind()
                for (lineIdx in 0 until textLayout.lineCount) {
                    val top = textLayout.getLineTop(lineIdx)
                    val bottom = textLayout.getLineBottom(lineIdx)
                    when {
                        lineIdx < sungLine -> fillPath.addRect(Rect(0f, top, size.width, bottom))
                        lineIdx == sungLine -> {
                            val x = if (allSung) {
                                size.width
                            } else {
                                val lineLeft = textLayout.getLineLeft(sungLine)
                                val lineRight = textLayout.getLineRight(sungLine)
                                val from = textLayout.getHorizontalPosition(
                                    clusterStart.coerceIn(0, textLength), usePrimaryDirection = true,
                                )
                                val to = textLayout.getHorizontalPosition(
                                    clusterEnd.coerceIn(0, textLength), usePrimaryDirection = true,
                                )
                                val a = from.coerceIn(lineLeft, lineRight)
                                val b = to.coerceIn(lineLeft, lineRight)
                                // 双向文本：b < a 说明这一簇从右往左排，反向插值。
                                (if (b >= a) a + (b - a) * clusterProgress else a - (a - b) * clusterProgress)
                                    .coerceIn(0f, size.width)
                            }
                            fillPath.addRect(Rect(0f, top, x, bottom))
                        }
                    }
                }
                clipPath(fillPath) { this@drawWithContent.drawContent() }
            },
        )
    }
}
