package io.github.huleixin.tingyu.minimal.ui

import io.github.huleixin.tingyu.chrome.MinimalCoverOverlay
import io.github.huleixin.tingyu.chrome.minimalSection
import io.github.huleixin.tingyu.chrome.minimalBackground
import io.github.huleixin.tingyu.chrome.LiquidIcon
import android.os.SystemClock
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerDefaults
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
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
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import io.github.huleixin.tingyu.chrome.liquidPlayerContent
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
import androidx.compose.ui.zIndex
import io.github.huleixin.tingyu.minimal.MinimalArtwork
import io.github.huleixin.tingyu.minimal.MinimalClockSource
import io.github.huleixin.tingyu.minimal.MinimalPlayback
import io.github.huleixin.tingyu.minimal.MinimalPlayerCommands
import io.github.huleixin.tingyu.minimal.MinimalPlayerState
import io.github.huleixin.tingyu.minimal.buildMinimalPalette
import io.github.huleixin.tingyu.minimal.cover.CoverStackArtwork
import io.github.huleixin.tingyu.minimal.cover.CoverStackController
import io.github.huleixin.tingyu.minimal.cover.CoverStackState
import io.github.huleixin.tingyu.minimal.cover.DragDirection
import io.github.huleixin.tingyu.minimal.cover.StackPhase
import kotlinx.coroutines.launch

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/MinimalPlayerScreen.kt
//
// 极简播放页的外壳：顶栏 + 横向 pager（封面 / 歌词）+ 共用进度、传输与工具栏。
//
// 结构与 `MinimalStage.tsx` 一一对应：两个页面共用**一条**传输条和**一套**状态，
// 翻页只改 pager 位置，不重建任何组件 —— 所以播放、歌词进度、背景颜色都是连续的。
//
// 时钟：整个页面只有这里持有"现在"这个帧值；两个页面、进度条、逐字高亮读的是同一个数。
// 它不是计时器，是锚点外推的取样时刻。

private const val PAGE_COUNT = 2

/**
 * 封面动画跑完、命令也发了，但播放状态还没换歌的宽限期。
 *
 * 在线源要现取地址，几百毫秒到两秒都正常；超过这个时限就认为这次切歌失败，
 * 封面必须退回真实正在播的那一首 —— 绝不能停在错误的歌曲上。
 */
private const val COMMIT_CONFIRM_TIMEOUT_MS = 2_500L

@Composable
fun MinimalPlayerScreen(
    state: MinimalPlayerState,
    artwork: MinimalArtwork,
    commands: MinimalPlayerCommands,
    /** 队列投影。JS 推来的，抽屉只读。 */
    queue: io.github.huleixin.tingyu.minimal.MinimalQueue = io.github.huleixin.tingyu.minimal.MinimalQueue(),
    /** 打开宿主的队列抽屉。极简页自己不再持有抽屉状态。 */
    onOpenQueue: () -> Unit = {},
    /** 打开宿主的工具页："quality" | "effects" | "lyrics"。不再发 JS 开 WebView 弹窗。 */
    onOpenTools: (String) -> Unit = {},
    /** 打开宿主的原生定时面板；未接入时禁用入口，不发 JS 弹窗动作。 */
    onOpenSleep: (() -> Unit)? = null,
    sleepActive: Boolean = false,
    sleepLabel: String = "定时关闭",
    onSleepAnchor: ((androidx.compose.ui.geometry.Rect) -> Unit)? = null,
    /** 页面重建时恢复的 pager 页。宿主持有这个值，进出设置、后台回来都不丢。 */
    initialPage: Int = 0,
    /** 新会话令牌：每次从浏览页进入播放器 +1。用 key() 包住 pager 状态，
     *  新会话**首次组合**就落在 initialPage，不会先闪出上次的歌词页再滑回来
     *  （只改 initialPage 而不重建状态是无效的：rememberPagerState 只认第一次）。 */
    resetToken: Int = 0,
    /**
     * 封面堆叠的动画器。默认在这一页里 remember；宿主（或诊断页）需要观察/保留同一份动画状态时
     * 可以传进来 —— 动画进度、卡片层位、当前速度都在里面。
     */
    coverStack: CoverStackState? = null,
    /** pager 停留页变化时上报宿主。 */
    onPageChanged: (Int) -> Unit = {},
    light: Boolean,
    safeTop: Float,
    safeBottom: Float,
    detour: Boolean,
    onCollapse: () -> Unit,
    onOpenStage: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // 顺访舞台时保留同一份 pager/封面控制器，由宿主把它放在 WebView 舞台下面。

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
    val clock = rememberMinimalClock(playback,!detour)
    // 系统关闭动画时不跑背景漂移与封面浮动；页面仍然完整可读（与 prefers-reduced-motion 对齐）。
    val context = androidx.compose.ui.platform.LocalContext.current
    val still = remember(context) { reducedMotion(context) }

    // 抽屉与工具页归宿主所有；这里只把入口按钮接到它们的开门动作上。
    // 之前这里裸用 `commands`，于是底部的列表按钮走的是另一条路 —— 同一个页面两套行为。
    // 第 11 轮：菜单的音质/效果器/歌词也改开原生工具页 —— 走 JS 开 WebView 弹窗会把
    // 原生页埋掉，还要触发一次让位/回退的抖动。
    val sheetCommands = remember(commands, onOpenQueue, onOpenTools) {
        object : MinimalPlayerCommands by commands {
            override fun openQueue(): Boolean {
                onOpenQueue()
                return true
            }
            override fun openAudioQuality(): Boolean {
                onOpenTools("quality")
                return true
            }
            override fun openAudioEffects(): Boolean {
                onOpenTools("effects")
                return true
            }
            override fun openLyricsPanel(): Boolean {
                onOpenTools("lyrics")
                return true
            }
        }
    }

    // 停留页由宿主持有（进出设置不丢）；这里只在重建时读一次初值，之后随滑动上报。
    val pagerState = androidx.compose.runtime.key(resetToken) {
        rememberPagerState(initialPage = initialPage.coerceIn(0, PAGE_COUNT - 1)) { PAGE_COUNT }
    }
    LaunchedEffect(pagerState) {
        snapshotFlow { pagerState.currentPage }.collect { page -> onPageChanged(page) }
    }
    val scope = rememberCoroutineScope()
    val page = pagerState.currentPage
    var menuOpen by remember { mutableStateOf(false) }
    // 保留弹窗直到退场动画完成；封面和歌词页共用同一个菜单。
    var menuClosing by remember { mutableStateOf(false) }
    val dismissMenu = { menuClosing = true; menuOpen = false }

    // ---- 封面堆叠：动画器 + 位图缓存 + 唯一的过渡控制器 ----
    //
    // 这一层只做装配。四个切歌入口（左滑 / 右滑 / 上一首 / 下一首）与"播放器自己切歌"
    // 全部走同一个 controller，所以不会出现两套手感，也不会一次切歌发两条命令。
    val coverCaches = remember(context) { CoverStackArtwork(context) }
    DisposableEffect(coverCaches) { onDispose { coverCaches.release() } }
    val coverStackState = remember(coverStack) { coverStack ?: CoverStackState() }
    // 控制器**必须**跨重组保持同一个实例：它持有"这次切歌等的是哪一首"这类动画状态，
    // 一旦被重建就会忘掉，动画跑到终点时找不到该推进哪张卡片。
    // 命令出口用 rememberUpdatedState 转发，所以 commands 换了对象也不用重建控制器。
    val latestCommands = rememberUpdatedState(commands)
    val coverController = remember(coverStackState, coverCaches) {
        CoverStackController(
            state = coverStackState,
            artwork = coverCaches,
            sendNext = { requestId -> latestCommands.value.next(requestId) },
            sendPrevious = { requestId -> latestCommands.value.previous(requestId) },
        )
    }
    // 动画逐帧推进。相位变了才起循环；一帧一次 graphicsLayer 写入，不进重组。
    LaunchedEffect(coverStackState, coverStackState.phase) {
        if (coverStackState.phase == StackPhase.IDLE) return@LaunchedEffect
        var last = 0L
        while (true) {
            val now = withFrameNanos { it }
            val elapsed = if (last == 0L) 16.7f else (now - last) / 1_000_000f
            last = now
            if (!coverStackState.step(elapsed)) break
        }
    }
    // 系统关闭动画时：拖动仍然 1:1 跟手，松手后直接落到终态（不补间、不回弹、无残影）。
    LaunchedEffect(coverStackState, still) { coverStackState.motionEnabled = !still }
    // 切歌事务：封面动画完成到播放状态确认之间，歌曲信息以哪一首为准由它裁定。
    // 读一次就完成订阅（mutableStateOf），事务推进时这一页自动重组。
    val skipTransaction = coverController.transaction
    // 三层预览与真实播放队列对齐：换歌、队列编辑、随机计划推进都会经过这里。
    LaunchedEffect(coverController, playback.track.key, state.revision) {
        coverController.sync(playback.track, queue)
    }
    // 命令发出去了但播放状态没跟上（解析失败、桥断开）：宽限期后如实退回当前曲。
    val topCoverKey = coverStackState.cards.firstOrNull()?.songKey.orEmpty()
    LaunchedEffect(coverController, topCoverKey, playback.track.key) {
        if (topCoverKey.isEmpty() || playback.track.key.isEmpty() || topCoverKey == playback.track.key) {
            return@LaunchedEffect
        }
        kotlinx.coroutines.delay(COMMIT_CONFIRM_TIMEOUT_MS)
        coverController.sync(playback.track, queue, force = true)
    }

    MinimalCoverOverlay {
    Box(modifier.fillMaxSize()) {
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
            // 帧耗时探针：真机验收用。长按底部更多打开 diag 后，这里实时给出
// 最近约 3 秒的帧均值/卡顿帧占比/最差帧，不接 adb 也能读数。
            val frameProbe = rememberFrameProbeText()
            if (frameProbe.isNotEmpty()) {
                Text(
                    frameProbe,
                    color = Color(0xFFB8FFE3),
                    fontSize = 10.sp,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(start = 10.dp, top = (safeTop + 34f).dp)
                        .background(Color(0xDD09251C), RoundedCornerShape(6.dp))
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                )
            }
        }
        MinimalAmbience(
            colors = paletteColors(palette),
            light = !dark,
            paused = !playback.playing || detour,
            still = still,
            modifier = Modifier.fillMaxSize().minimalBackground().background(Color(palette.base)),
        )

        Column(Modifier.fillMaxSize().padding(top = safeTop.dp, bottom = safeBottom.dp)) {
            TopBar(
                ink = ink,
                liked = state.controls.liked,
                likeDisabled = state.controls.likeDisabled,
                onLyricsPage = page == 1,
                commands = commands,
                onCollapse = onCollapse,
                onOpenStage = onOpenStage,
                modifier = Modifier.minimalSection("header"),
            )

            HorizontalPager(
                state = pagerState,
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .then(if(page==1)Modifier.minimalSection("lyrics")else Modifier)
                    // 封面拖动 / 切歌动画期间，把 pager 提到共用底栏之上 ——
                    // 正在移动的封面拖进进度条、播放按钮区域时能自然遮挡它们。
                    // 只影响绘制顺序；pager 内容都在自身边界内，实际越界的只有移动中的封面。
                    .zIndex(if (coverStackState.phase != StackPhase.IDLE) 1f else 0f),
                beyondViewportPageCount = 1,
                key = { it },
                // 固定一版 280ms 的吸附曲线（不再是平台默认弹黄）：拖动跟手不变，
                // 松手后的归位节奏稳定在 260~300ms —— 掉帧的"快慢不一"从根上消掉。
                flingBehavior = PagerDefaults.flingBehavior(
                    pagerState,
                    snapAnimationSpec = tween(280, easing = CubicBezierEasing(0.2f, 0.72f, 0.16f, 1f)),
                ),
            ) { index ->
                if (index == 0) {
                    MinimalCoverPage(
                        state = state,
                        artwork = artwork,
                        palette = palette,
                        ink = ink,
                        light = !dark,
                        clock = clock,
                        active = page == 0 && !detour,
                        still = still,
                        stack = coverStackState,
                        covers = coverCaches,
                        skipTransaction = skipTransaction,
                        onOpenLyrics = { scope.launch { pagerState.animateScrollToPage(1) } },
                        onAudioTools = { onOpenTools("quality") },
                        // 歌手名点击 → 动作总线 artistOpen（value = 歌手串里的序号），由 JS 开歌手页。
                        onOpenArtist = { index -> commands.openArtist(index) },
                        // 拖动时封面向反方向漂一点点（CSS 的 parallax），只动图层不重画。
                        parallax = {
                            if (pagerState.currentPage == 0) -pagerState.currentPageOffsetFraction * 22f else 0f
                        },
                        // 只有这块封面在手势里：从别处开始的滑动仍归 pager。
                        coverGesture = Modifier.coverStackDrag(coverStackState, coverController),
                    )
                } else {
                    MinimalLyricsPage(
                        state = state,
                        artwork = artwork,
                        palette = palette,
                        ink = ink,
                        clock = clock,
                        active = page == 1 && !detour,
                        // 跟手/吸附期间不抢滚动：歌词页的自动平滑滚动等 pager 落定后再启动，
                        // 不和切页动画抢同一根帧预算线（这就是切到歌词页那一下卡顿的主因之一）。
                        pagerBusy = pagerState.isScrollInProgress,
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
                light = !dark,
                onOpenSleep = onOpenSleep,
                sleepActive = sleepActive,
                sleepLabel = sleepLabel,
                onSleepAnchor = onSleepAnchor,
                onOpenMore = { menuOpen = true; menuClosing = false },
                moreMenu = {
                    if (menuOpen || menuClosing) {
                        MoreMenu(
                            qualityMode = state.controls.qualityMode,
                            effectsOn = state.controls.effectsOn,
                            shown = menuOpen,
                            onExited = { menuClosing = false },
                            onDismiss = dismissMenu,
                            onPick = { pick ->
                                dismissMenu()
                                when (pick) {
                                    0 -> sheetCommands.openAudioQuality()
                                    1 -> sheetCommands.openAudioEffects()
                                    2 -> sheetCommands.openLyricsPanel()
                                    3 -> sheetCommands.openQueue()
                                    else -> commands.openPlaybackSettings()
                                }
                            },
                        )
                    }
                },
                // 与手势共用同一个过渡控制器：先跑封面动画，动画里的那一次命令由它发。
                onPrevious = { coverController.skip(DragDirection.PREV) },
                onNext = { coverController.skip(DragDirection.NEXT) },
                modifier = Modifier.padding(top = 2.dp).minimalSection("controls"),
            )
        }

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
private fun rememberMinimalClock(playback: MinimalPlayback,active:Boolean): State<Long> {
    val now = remember { mutableLongStateOf(SystemClock.elapsedRealtime()) }
    LaunchedEffect(playback.source, playback.playing, playback.anchorElapsedMs,active) {
        now.longValue = SystemClock.elapsedRealtime()
        if (active && playback.playing && playback.source != MinimalClockSource.NONE) {
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
    liked: Boolean,
    likeDisabled: Boolean,
    onLyricsPage: Boolean,
    commands: MinimalPlayerCommands,
    onCollapse: () -> Unit,
    onOpenStage: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier.fillMaxWidth().padding(start = 10.dp, end = 10.dp, top = 6.dp, bottom = 2.dp),
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
            ) { LiquidIcon(liked) { shown -> HeartGlyph(shown, if (shown) Color(0xFFFF7B88) else ink.ink, Modifier.size(21.dp)) } }

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
            }
        }
    }
}

/**
 * 更多菜单：条目、名称、图标与动作和 `MobileStageMenu` 完全一致（第 12 轮统一）。
 *
 * 五项名称固定为：音质选择 / 均衡器与音效 / 歌词工具 / 播放队列 / 播放设置，
 * 与 WebView 舞台菜单同一组 i18n 词。几何也照抄 `mobileStageMenu.css`：
 * 210dp 玻璃卡、17dp 圆角、7dp 内衬、47dp 行高、18dp 图标 + 标签 + 右侧淡色值。
 *
 * 不套 MaterialTheme。配色与 WebView 舞台菜单同一套：奶油底卡 + 深墨字 + 淡灰值，
 * 舞台菜单本身就是这一套固定表面（深色舞台上也是奶油卡），这里逐像素对齐。
 *
 * 开合动画（第 15 轮，与 WebView 菜单同一节奏）：打开 160ms 轻微下移 + 淡入 +
 * 0.97→1；关闭 120ms 反向淡出。`shown=false` 时弹窗还挂着，播完退场才由
 * `onExited` 摘除。
 */
@Composable
private fun MoreMenu(
    qualityMode: String,
    effectsOn: Boolean,
    shown: Boolean,
    onExited: () -> Unit,
    onDismiss: () -> Unit,
    onPick: (Int) -> Unit,
) {
    val reduced = io.github.huleixin.tingyu.chrome.LocalLiquidReduced.current
    val progress = remember { Animatable(0f) }
    val menuOffset = with(androidx.compose.ui.platform.LocalDensity.current) { 48.dp.roundToPx() }
    LaunchedEffect(shown, reduced) {
        if (shown) {
            progress.animateTo(1f, tween(if(reduced)0 else 220, easing = CubicBezierEasing(0.2f, 0.7f, 0.2f, 1f)))
        } else {
            progress.animateTo(0f, tween(if(reduced)0 else 160, easing = CubicBezierEasing(0.42f, 0f, 0.74f, 0.3f)))
            onExited()
        }
    }
    androidx.compose.ui.window.Popup(
        alignment = Alignment.BottomEnd,
        offset = androidx.compose.ui.unit.IntOffset(0, -menuOffset),
        onDismissRequest = onDismiss,
        properties = androidx.compose.ui.window.PopupProperties(focusable = true),
    ) {
        // 菜单本体拆成独立面板：测试里可以不经 Popup（独立窗口拍不到 decorView）直接渲染对照。
        // 运动只动这一层 graphicsLayer：位移/缩放/透明度都是渲染线程的图层属性，
        // 不触发面板重绘，更不触发面板重新排版。
        Box(
            Modifier.graphicsLayer {
                val p = progress.value
                alpha = p
                translationY = 8.dp.toPx() * (1f - p)
                val scale = 0.97f + 0.03f * p
                scaleX = scale
                scaleY = scale
                transformOrigin = androidx.compose.ui.graphics.TransformOrigin(1f, 1f)
            }
        ) {
            MoreMenuPanel(qualityMode, effectsOn, onPick)
        }
    }
}

/** 菜单自己的墨色（与 WebView 舞台菜单同一套：奶油底 + 深墨字 + 淡灰值），不随页面取色。 */
// Classic retains those exact menu colors; other styles use the global ordinary-menu roles.
private val MenuSurface @Composable get() = io.github.huleixin.tingyu.chrome.LocalInterfacePalette.current.menuSurface
private val MenuInkColor @Composable get() = io.github.huleixin.tingyu.chrome.LocalInterfacePalette.current.menuInk
private val MenuMutedColor @Composable get() = io.github.huleixin.tingyu.chrome.LocalInterfacePalette.current.menuMuted

/** 更多菜单的可视面板（不含 Popup 外壳）：奶油卡 + 五个带图标条目。 */
@Composable
internal fun MoreMenuPanel(
    qualityMode: String,
    effectsOn: Boolean,
    onPick: (Int) -> Unit,
) {
    val radius = RoundedCornerShape(17.dp)
    Column(
        Modifier
            .width(210.dp)
            .clip(radius)
            .background(MenuSurface.copy(alpha = 0.97f))
            .border(1.dp, MenuInkColor.copy(alpha = 0.10f), radius)
            .padding(7.dp),
    ) {
        listOf(
            Triple("音质选择", qualityMode, MenuGlyph.AudioLines),
            Triple("均衡器与音效", if (effectsOn) "已开启" else "已关闭", MenuGlyph.Sliders),
            Triple("歌词工具", "", MenuGlyph.Captions),
            Triple("播放队列", "", MenuGlyph.Queue),
            Triple("播放设置", "", MenuGlyph.Tune),
        ).forEachIndexed { index, (label, value, glyph) ->
            // 按压反馈（第 15 轮，与 WebView 菜单的 :active 同一语言）：淡墨底 + 微缩 + 微降透明度。
            val interaction = remember { MutableInteractionSource() }
            val pressed by interaction.collectIsPressedAsState()
            Row(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 47.dp)
                    .clip(RoundedCornerShape(11.dp))
                    .background(if (pressed) MenuInkColor.copy(alpha = 0.07f) else Color.Transparent)
                    .clickable(interactionSource = interaction, indication = null) { onPick(index) }
                    .graphicsLayer {
                        val scale = if (pressed) 0.98f else 1f
                        scaleX = scale
                        scaleY = scale
                        alpha = if (pressed) 0.86f else 1f
                    }
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                MenuGlyphIcon(glyph, MenuInkColor, Modifier.size(18.dp))
                Text(label, color = MenuInkColor, fontSize = 14.sp, modifier = Modifier.weight(1f))
                if (value.isNotBlank()) {
                    Text(value, color = MenuMutedColor, fontSize = 12.sp, maxLines = 1)
                }
            }
        }
    }
}

/** 与 `MobileStageMenu` 同一套 lucide 图标的最小手绘等价。 */
private enum class MenuGlyph { AudioLines, Sliders, Captions, Queue, Tune }

@Composable
private fun MenuGlyphIcon(glyph: MenuGlyph, color: Color, modifier: Modifier) {
    Canvas(modifier) {
        val u = size.minDimension / 18f
        val w = 1.7f * u
        when (glyph) {
            // AudioLines：五根高低起伏的竖条。
            MenuGlyph.AudioLines -> {
                val bars = listOf(6f to 12f, 3f to 9f, 8f to 15f, 4f to 10f, 7f to 13f)
                bars.forEachIndexed { index, (top, bottom) ->
                    val x = (2.2f + index * 3.4f) * u
                    drawLine(color, Offset(x, top * u), Offset(x, bottom * u), w, StrokeCap.Round)
                }
            }
            // SlidersHorizontal：三条横轨 + 错位旋钮。
            MenuGlyph.Sliders -> {
                listOf(4.5f, 9f, 13.5f).forEachIndexed { index, y ->
                    drawLine(color, Offset(2f * u, y * u), Offset(16f * u, y * u), w, StrokeCap.Round)
                    val knob = listOf(11.5f, 5.5f, 9f)[index]
                    drawCircle(color, 1.9f * u, Offset(knob * u, y * u), style = Stroke(w))
                }
            }
            // Captions：圆角对话框 + 两短横。
            MenuGlyph.Captions -> {
                drawRoundRect(
                    color,
                    topLeft = Offset(2f * u, 4f * u),
                    size = androidx.compose.ui.geometry.Size(14f * u, 10f * u),
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(3f * u),
                    style = Stroke(w, cap = StrokeCap.Round),
                )
                drawLine(color, Offset(5f * u, 9f * u), Offset(9f * u, 9f * u), w, StrokeCap.Round)
                drawLine(color, Offset(11f * u, 9f * u), Offset(13f * u, 9f * u), w, StrokeCap.Round)
            }
            // ListMusic：三行列表 + 音符。
            MenuGlyph.Queue -> {
                drawLine(color, Offset(3f * u, 5f * u), Offset(10f * u, 5f * u), w, StrokeCap.Round)
                drawLine(color, Offset(3f * u, 9f * u), Offset(10f * u, 9f * u), w, StrokeCap.Round)
                drawLine(color, Offset(3f * u, 13f * u), Offset(7f * u, 13f * u), w, StrokeCap.Round)
                drawCircle(color, 1.8f * u, Offset(13.2f * u, 13.5f * u))
                drawLine(color, Offset(15f * u, 13.5f * u), Offset(15f * u, 5.5f * u), w, StrokeCap.Round)
                drawLine(color, Offset(15f * u, 5.5f * u), Offset(17f * u, 7f * u), w, StrokeCap.Round)
            }
            // Settings2：齿轮 = 外齿 + 内圆。
            // Tune（Settings2 的 lucide 造型）：两根横轨 + 错位旋钮，与舞台菜单"播放设置"同款。
            MenuGlyph.Tune -> {
                drawLine(color, Offset(2f * u, 6f * u), Offset(16f * u, 6f * u), w, StrokeCap.Round)
                drawLine(color, Offset(2f * u, 12f * u), Offset(16f * u, 12f * u), w, StrokeCap.Round)
                drawCircle(color, 1.9f * u, Offset(11.5f * u, 6f * u))
                drawCircle(color, 1.9f * u, Offset(5.5f * u, 12f * u))
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
