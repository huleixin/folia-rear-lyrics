package io.github.huleixin.tingyu.chrome

import io.github.huleixin.tingyu.minimal.style.PlayerStyleTransition
import io.github.huleixin.tingyu.minimal.style.PlayerStyle
import io.github.huleixin.tingyu.minimal.immersive.ImmersivePlayerHost
import io.github.huleixin.tingyu.minimal.immersive.ImmersiveActionsSheet
import androidx.compose.runtime.*
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import io.github.huleixin.tingyu.minimal.MinimalPlayerCommands
import io.github.huleixin.tingyu.minimal.MinimalQueue
import io.github.huleixin.tingyu.minimal.MinimalPlayerRuntime
import io.github.huleixin.tingyu.minimal.cover.CoverStackArtwork
import io.github.huleixin.tingyu.minimal.cover.CoverStackState
import io.github.huleixin.tingyu.minimal.ui.MinimalPlayerScreen

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/MinimalPlayerPage.kt
//
// 极简播放页的宿主壳：只在这里订阅运行时，场景（WebView、导航、其他页面）不跟着每秒的状态帧重组。
//
// 页面本体在 `minimal/ui`：第一阶段留下的"数据验证面"已经被真正的封面页 / 歌词页取代。

@Composable
fun MinimalPlayerSurface(
    runtime: MinimalPlayerRuntime,
    commands: MinimalPlayerCommands,
    /** 队列投影由宿主收集后传进来：抽屉归宿主，页面只负责画按钮。 */
    queue: MinimalQueue,
    onOpenQueue: () -> Unit,
    playerStyle: PlayerStyle = PlayerStyle.CLASSIC,
    onOpenStyle: () -> Unit = {},
    /** 打开宿主的工具页（quality / effects / lyrics）。音质/效果器/歌词不再走 WebView 弹窗。 */
    onOpenTools: (String) -> Unit = {},
    /** 定时入口走宿主共享的原生面板，状态由 SleepTimerController 提供。 */
    onOpenSleep: (() -> Unit)? = null,
    sleepActive: Boolean = false,
    sleepLabel: String = "定时关闭",
    onSleepAnchor: ((androidx.compose.ui.geometry.Rect) -> Unit)? = null,
    /** 首次展示的 pager 页（0 封面 / 1 歌词）。 */
    initialPage: Int = 0,
    /** 每次从浏览页进入播放器 +1：pager 状态按它重建，保证"每次打开都是封面"。 */
    resetToken: Int = 0,
    coverStack: CoverStackState? = null,
    coverArtwork: CoverStackArtwork? = null,
    active: Boolean = true,
    /** pager 停留页变化时上报宿主。 */
    onPageChanged: (Int) -> Unit = {},
    light: Boolean,
    safeTop: Float,
    safeBottom: Float,
    onCollapse: () -> Unit,
    onOpenStage: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by runtime.state.collectAsState()
    val artwork by runtime.artwork.collectAsState()
    var retainedPage by remember(resetToken) { mutableIntStateOf(initialPage) }
    val reportPage: (Int) -> Unit = { page -> retainedPage = page; onPageChanged(page) }
    PlayerStyleTransition(playerStyle, modifier) { displayedStyle ->
    // Exclusive visual branches share the same runtime: changing style emits no playback command.
    if (displayedStyle == PlayerStyle.IMMERSIVE) {
        var actions by remember { mutableStateOf(false) }
        ImmersivePlayerHost(state, artwork, commands, queue, active, resetToken,
            onCollapse, reportPage, { actions = true }, { onOpenTools("quality") }, Modifier,
            safeTop = safeTop,
            initialPage = if (retainedPage == 1) io.github.huleixin.tingyu.minimal.immersive.port.MeloXNowPlayingPage.Lyrics else io.github.huleixin.tingyu.minimal.immersive.port.MeloXNowPlayingPage.Artwork)
        ImmersiveActionsSheet(actions, light, { actions = false }, onOpenStyle,
            onOpenSleep ?: {}, onOpenTools, commands)
        return@PlayerStyleTransition
    }
    MinimalPlayerScreen(
        state = state,
        artwork = artwork,
        commands = commands,
        queue = queue,
        onOpenQueue = onOpenQueue,
        onOpenStyle = onOpenStyle,
        onOpenTools = onOpenTools,
        onOpenSleep = onOpenSleep,
        sleepActive = sleepActive,
        sleepLabel = sleepLabel,
        onSleepAnchor = onSleepAnchor,
        initialPage = retainedPage,
        resetToken = resetToken,
        coverStack = coverStack,
        coverArtwork = coverArtwork,
        onPageChanged = reportPage,
        light = light,
        safeTop = safeTop,
        safeBottom = safeBottom,
        detour = state.controls.detour || !active,
        onCollapse = onCollapse,
        onOpenStage = onOpenStage,
        modifier = Modifier,
    )
    }
}
