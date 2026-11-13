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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.huleixin.tingyu.minimal.MinimalArtwork
import io.github.huleixin.tingyu.minimal.MinimalGraphemeTimeline
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
//   · **两级亮度**（第 19 轮）：当前行的未唱是柔和灰白、已唱是满亮度白；浅色页面同理
//     用深灰与近黑。之前两者都接近纯白，逐字高亮几乎没有对比。
//   · **填充按显示行独立算**（第 19 轮）：换行后的每一行都用自己的 getLineStart /
//     getLineEnd / getLineRight 换算，第一行唱完就锁死在满格，不再跟着后面的行重算。

private const val ACTIVE_LINE_ANCHOR = 0.32f
private const val MANUAL_HOLD_MS = 4000L
private const val SCROLL_BASE_MS = 240
private const val SCROLL_MAX_MS = 460

/** 锚点抖动吸收窗（秒）：小于它的倒退按抖动忽略，大于它按真实 seek 处理。 */
private const val SEEK_RESET_SEC = 0.35

// 歌词的两级亮度。当前行分成「已唱」与「未唱」两种颜色，两者必须**一眼能分开**：
// 之前未唱用的是 84% 的白，已唱是纯白 —— 深色页面上两者只差 16% 不透明度，
// 逐字高亮等于没有。现在未唱压到 58%（白）／72%（墨色），已唱保持满亮度。
//
// 只换颜色，不动字号、不做描边、不加阴影：这就是同一套版式里的两个层级。
private const val UNSUNG_ALPHA_DARK = 0.58f
private const val UNSUNG_ALPHA_LIGHT = 0.72f

/**
 * 当前行**未唱**部分的颜色：柔和的灰白（深色页面）／同层级的深灰（浅色页面）。
 *
 * 页面是深是浅由 ink 自己的亮度判断，不额外传主题 —— 浅色页面里 ink 是深色，
 * 用白字会直接糊在背景上。
 */
internal fun MinimalInk.lyricUnsung(): Color =
    if (ink.luminance() > 0.5f) inkBright.copy(alpha = UNSUNG_ALPHA_DARK)
    else ink.copy(alpha = UNSUNG_ALPHA_LIGHT)

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
        val pad=io.github.huleixin.tingyu.chrome.LocalPadWindow.current.splitPlayer
        Row(Modifier.then(if(pad)Modifier.align(Alignment.CenterHorizontally).widthIn(max=320.dp)else Modifier),verticalAlignment = Alignment.CenterVertically) {
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
            Column(if(pad)Modifier.widthIn(max=250.dp) else Modifier.weight(1f)) {
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
                .then(if(pad)Modifier.align(Alignment.CenterHorizontally)else Modifier)
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
    val heights = remember(lyrics) { FloatArray(lyrics.size) }
    // 每行**测量时**的字号：行高 ≈ 行数×字号×系数 + 固定内衬，据此把动画中的
    // 测量值换算成落定值 —— 滚动目标在切换瞬间就能算准，不需要事后修正。
    val measuredSizes = remember(lyrics) { FloatArray(lyrics.size) }
    val androidDensity=androidx.compose.ui.platform.LocalDensity.current.density
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
    val scroll = rememberLazyListState(initialFirstVisibleItemIndex=index.coerceAtLeast(0))

    // 手动滚动后 4 秒内不抢位置；自动滚动自己不算"手动"。
    LaunchedEffect(scroll) {
        snapshotFlow { scroll.isScrollInProgress }.collect { moving ->
            if (moving && !autoScrolling) manualUntil = System.currentTimeMillis() + MANUAL_HOLD_MS
        }
    }

    // 切行自动滚动。目标位置按**落定布局**预测：切换瞬间旧活动行还占着放大后的
    // 高度、新活动行还没长起来，直接用测量值会系统性偏移几十像素（长行更甚）；
    // 这里按测量字号比例把两行的落定高度换算出来，一次滚到位，动画结束后不再修正。
    LaunchedEffect(index, lyrics, active, pagerBusy,viewport) {
        val previousActive = lastActiveRef[0]
        lastActiveRef[0] = index
        if (pagerBusy || viewport <= 0f) return@LaunchedEffect
        val target = index
        if (target < 0 || target >= lyrics.size) return@LaunchedEffect
        // 同一目标的滚动已在途（pagerBusy 抖动重进）：不重启，避免中途变向。
        if (autoScrolling && autoScrollTarget[0] == target) return@LaunchedEffect
        if (System.currentTimeMillis() < manualUntil) return@LaunchedEffect
        val targetItem=scroll.layoutInfo.visibleItemsInfo.firstOrNull{it.index==target}

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

        val targetHeight=if(targetSettledHeight>0f)targetSettledHeight else targetItem?.size?.toFloat()?:56f*androidDensity
        val anchorOffset=(targetHeight/2f-viewport*ACTIVE_LINE_ANCHOR).toInt()
        val distance=targetItem?.let{it.offset+shift+targetHeight/2f-viewport*ACTIVE_LINE_ANCHOR}
        if(distance!=null&&abs(distance)<2f)return@LaunchedEffect
        val duration = min(SCROLL_MAX_MS, SCROLL_BASE_MS + ((abs(distance?:viewport)) / 1000f * 130f).toInt())
        autoScrolling = true
        autoScrollTarget[0] = target
        try {
            if(!active)scroll.scrollToItem(target,anchorOffset)
            else if(distance!=null)scroll.animateScrollBy(distance,tween(duration,easing=CubicBezierEasing(0.2f,0.7f,0.2f,1f)))
            else scroll.animateScrollToItem(target,anchorOffset)

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
        LazyColumn(
            state=scroll,
            modifier=Modifier.fillMaxSize(),
            contentPadding=androidx.compose.foundation.layout.PaddingValues(start=26.dp,end=26.dp,top=20.dp,bottom=240.dp),
        ) {
            itemsIndexed(lyrics,key={index,_->index}) { lineIndex, line ->
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
                    onMeasured = { _, height, atSize ->
                        if (lineIndex in heights.indices) {
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
    // 当前行的未唱部分：柔和灰白。已唱部分用满亮度（KaraokeLine 的 sungColor），
    // 两种颜色之间是逐字推进的分界线（第 19 轮）。
    val currentColor = if (credit) ink.mutedAlpha(88) else ink.lyricUnsung()
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
 * 连续卡拉OK行：两层同样的文本叠放，顶层是已唱亮色，用**逐行裁剪路径**按连续进度推进。
 *
 * 换行（第 19 轮）：填充不再是「整句一个 x 摊在某个显示行上」，而是先算出**全文字符游标**
 * （已唱完的字符数 + 正在唱的那个字形簇内的浮点插值），再逐显示行用 TextLayoutResult 的
 * getLineStart / getLineEnd / getLineLeft / getLineRight 独立换算本行的填充宽度：
 *
 *   · 一行唱完（游标越过 getLineEnd）就整行填满，此后不再参与计算 —— 第一行不会因为
 *     第二行开始唱而被重算、变灰或倒退；
 *   · 正在唱的那一行只填到自己该到的地方，字内仍是浮点插值，不会整字跳变；
 *   · 簇恰好跨在换行处（英文长单词被折断）时，本行填到行尾、下一行从行首接上，两边都
 *     单调。getHorizontalPosition 给的是**行内**坐标：跨行时直接拿两行的位置相减，
 *     第二行那个从 0 开始的值会让第一行的填充瞬间缩回行首 —— 这正是之前"第一行回退"
 *     的来源，也是这里必须按行取坐标、按行截断的原因。
 *
 * 时间：draw 阶段读统一播放时钟，并保留一个高水位 —— 正常播放期间只前进；只有真实
 * seek（倒退超过 SEEK_RESET_SEC）或换行/换歌才允许按新位置重算。暂停时时钟停摆，
 * 填充自然冻结；跨字不重建字符串、不重组，只有活动行每帧一次重绘。
 */
@Composable
internal fun KaraokeLine(
    line: MinimalLyricLine,
    playback: MinimalPlayback,
    clock: State<Long>,
    color: Color,
    sungColor: Color,
    fontSize: TextUnit,
) {
    val latestPlayback by rememberUpdatedState(playback)
    var layout by remember(line) { mutableStateOf<TextLayoutResult?>(null) }
    val fillPath = remember(line) { Path() }
    // 高水位只写在 draw 里、从不被组合读取，所以用普通数组而不是快照状态：
    // 它不该触发任何重组，只用来挡住抖动与时钟回退。
    val highWaterSec = remember(line) { doubleArrayOf(Double.NEGATIVE_INFINITY) }
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
                val raw = latestPlayback.lyricSecAt(clock.value)
                if (!raw.isFinite()) return@drawWithContent
                val previous = highWaterSec[0]
                val sec = when {
                    raw >= previous -> raw
                    // 真实 seek / 换歌：按新位置重算。
                    previous - raw > SEEK_RESET_SEC -> raw
                    // 桥帧迟到、锚点插值回退：留在高位，已唱范围不许倒退。
                    else -> previous
                }
                highWaterSec[0] = sec
                val timeline = line.graphemeTimeline
                val cursor = buildKaraokeFill(fillPath, textLayout, timeline, timeline.sungPosition(sec))
                if (cursor <= 0f) return@drawWithContent
                clipPath(fillPath) { this@drawWithContent.drawContent() }
            },
        )
    }
}

/**
 * 把「唱到哪儿了」画成裁剪路径：一条路径里每个显示行一个矩形，互不干扰。
 *
 * @param position 浮点字形数（[MinimalGraphemeTimeline.sungPosition]），整簇 + 簇内进度。
 * @return 换算后的**全文字符游标**，调用方据此判断是否有内容要画；测试也用它断言单调性。
 *
 * 只依赖 TextLayoutResult 的真实排版结果：中文、英文、标点、Emoji、任意字体缩放都走
 * 同一条路径 —— 行的边界来自排版器，不来自对字数的猜测。
 */
internal fun buildKaraokeFill(
    path: Path,
    layout: TextLayoutResult,
    timeline: MinimalGraphemeTimeline,
    position: Float,
): Float {
    path.rewind()
    return forEachKaraokeRect(layout, timeline, position) { path.addRect(it) }
}

/** 同一次计算的只读视图：测试逐行断言用，绘制路径不经过它（不产生每帧分配）。 */
internal fun karaokeRects(
    layout: TextLayoutResult,
    timeline: MinimalGraphemeTimeline,
    position: Float,
): List<Rect> {
    val rects = ArrayList<Rect>(4)
    forEachKaraokeRect(layout, timeline, position) { rects += it }
    return rects
}

private inline fun forEachKaraokeRect(
    layout: TextLayoutResult,
    timeline: MinimalGraphemeTimeline,
    position: Float,
    emit: (Rect) -> Unit,
): Float {
    val length = layout.layoutInput.text.length
    if (length <= 0 || layout.lineCount <= 0 || position <= 0f) return 0f

    // 浮点字形数 → 「已唱完的字符数」+「正在唱的那个簇的字符区间与簇内进度」。
    var sungChars = 0
    var clusterStart = -1
    var clusterEnd = -1
    var clusterProgress = 1f
    var remaining = position
    for (grapheme in timeline.graphemes) {
        val chars = grapheme.text.length
        if (remaining >= 1f) {
            sungChars += chars
            remaining -= 1f
        } else {
            clusterStart = sungChars
            clusterEnd = sungChars + chars
            clusterProgress = remaining.coerceIn(0f, 1f)
            break
        }
    }
    val cursor = if (clusterStart < 0) {
        sungChars.toFloat()
    } else {
        clusterStart + clusterProgress * (clusterEnd - clusterStart).toFloat()
    }
    if (cursor <= 0f) return 0f

    for (lineIndex in 0 until layout.lineCount) {
        val start = layout.getLineStart(lineIndex)
        val end = layout.getLineEnd(lineIndex, visibleEnd = true)
        // 纯换行产生的空行没有文字可填。
        if (end <= start) continue
        // 还没唱到这一行（也不会把后面的行提前点亮）。
        if (cursor <= start) continue
        val top = layout.getLineTop(lineIndex)
        val bottom = layout.getLineBottom(lineIndex)
        if (bottom <= top) continue
        val left = layout.getLineLeft(lineIndex)
        val right = layout.getLineRight(lineIndex)

        val x = if (cursor >= end) {
            // 这一行唱完了：整行填满，且**不再**随后面的行变化。
            right
        } else {
            var segStart = start
            var segEnd = end
            var t = ((cursor - start) / (end - start).toFloat()).coerceIn(0f, 1f)
            if (clusterStart in 0 until length && clusterStart <= end && clusterEnd > start) {
                // 正在唱的这一簇与本行相交：只在本行的这一段里插值（跨行时截断到行边界）。
                segStart = maxOf(clusterStart, start)
                segEnd = minOf(clusterEnd, end)
                val span = (segEnd - segStart).coerceAtLeast(1).toFloat()
                t = ((cursor - segStart) / span).coerceIn(0f, 1f)
            }
            val a = layout.horizontalInLine(segStart, start, end, left, right, length)
            val b = layout.horizontalInLine(segEnd, start, end, left, right, length)
            // 双向文本里 b 可能小于 a：同一个线性插值，方向自然反过来，不会反向跳。
            (a + (b - a) * t).coerceIn(left, right)
        }
        if (x <= left) continue
        emit(Rect(left, top, x, bottom))
    }
    return cursor
}

/**
 * 行内横坐标：getHorizontalPosition 返回的是**这一行内**的位置（每行都从 0 开始），
 * 所以只需要夹进本行的左右边界，绝不能用别的行的坐标去减它。
 */
private fun TextLayoutResult.horizontalInLine(
    offset: Int,
    start: Int,
    end: Int,
    left: Float,
    right: Float,
    length: Int,
): Float = when {
    // 行首：本行的左边界（左对齐时就是 0）。
    offset <= start -> left
    // 行尾：必须用行右边界。getHorizontalPosition 会把"行尾偏移"归到**下一行**，
    // 在折行处返回 0 —— 拿它当本行终点，填充就会瞬间缩回行首（第一行回退的真身）。
    offset >= end -> right
    else -> getHorizontalPosition(offset.coerceIn(0, length), usePrimaryDirection = false)
        .coerceIn(left, right)
}
