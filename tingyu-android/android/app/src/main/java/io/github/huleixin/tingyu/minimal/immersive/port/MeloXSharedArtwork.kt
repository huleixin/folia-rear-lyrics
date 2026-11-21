package io.github.huleixin.tingyu.minimal.immersive.port
import androidx.activity.compose.BackHandler
import android.content.Context
import android.os.Build
import androidx.compose.ui.platform.testTag
import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.EnterExitState
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.core.Transition
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDp
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.updateTransition
import androidx.compose.foundation.background
import androidx.compose.ui.draw.drawBehind
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.foundation.Image
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.State
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.input.pointer.changedToDown
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.PointerInputScope
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.NestedScrollSource.Companion.UserInput
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.lerp
import com.kyant.backdrop.backdrops.LayerBackdrop
import com.kyant.backdrop.backdrops.layerBackdrop
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.math.sin
import androidx.compose.ui.graphics.asImageBitmap
import io.github.huleixin.tingyu.minimal.immersive.MeloXPlaybackUiState

// SPDX-License-Identifier: GPL-3.0-only
// Adapted from MeloX Android 0.7.3 c04f36b9af540806b3bb185b347572e9ca12d87d.
// Tingyu: runtime-owned bitmap, existing player commands and outer cover anchor.

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
internal fun SharedArtworkDestination(
    state: MeloXPlaybackUiState,
    page: MeloXNowPlayingPage,
    // ⚠ 2026-10-22：与下方 `columnCenterProgress` 同一条纪律 —— **每帧状态一律走 `() -> Float`**。
    //   原来这里是值传参，调用方（1853 行的 SharedHost）为了算出这个 Float 必须每帧重组，
    //   于是整棵播放页跟着重组 32 次。改成 lambda 后：host 只在转场起止重组，
    //   每帧读值发生在**本函数自己的 scope**（它本来就因 `orientTransition` 每帧重组，
    //   范围仅限封面这一块）。
    onArtworkTap: () -> Unit,
    hidden: Boolean = false,
    gesturesEnabled: Boolean = false,
    orientTransition: Transition<Boolean>,
    // 双栏「玩家卡片居中」进度 0→1（0 = 左右分栏，1 = 左列滑到屏幕正中）。
    // ⚠ 由外层 host **单一计算后透传**（见那里的长注释）；手机 / 竖屏恒 0，逐像素不变。
    // ⚠ 用 `() -> Float` 而不是值：这是每帧状态，值传参会把**调用方**（host）每帧重组。
    columnCenterProgress: () -> Float = { 0f },
    playerMotion: io.github.huleixin.tingyu.minimal.immersive.ImmersivePlayerMotion? = null,
    movingArtwork: Modifier = Modifier,
    onArtworkPositioned: (androidx.compose.ui.layout.LayoutCoordinates) -> Unit = {},
) {
    val window = rememberMeloXWindowInfo()
    // ★★ Fix3（时钟同步）：封面本地 `isLandscape` 改走与场景层**完全相同**的
    //   `orientTransition.targetState`，不再用 `window.isLandscape`（即时翻转）。
    //   原因：窗口一旋转，`window.isLandscape` 立刻翻，但场景的几何 `orientProgress`
    //   要等 `ORIENT_SETTLE_FRAMES` 起跑闸才起跑（晚 ~2 帧）；这 2 帧里封面的分页逻辑
    //   （`pageFrameProgress`/`destPageFrame`/padding/手势/天际源）已按横屏算、几何还竖屏
    //   ⇒ "容器已横、进度仍竖" 错位，歌词页还会 "72dp 缩略图硬跳大封面"。
    //   两者共用同一个 `orientTransition` 实例（Scene 与封面同参传入）⇒ targetState 严格同帧，
    //   封面与场景在同一时钟上连续变形 = 真正一镜到底。`twoPane` 仍走 `window`，不受影响。
    val isLandscape = orientTransition.targetState
    // ★ 平板横屏双栏（2026-10-07）：左列封面下方还要放「曲名/艺人行 + 控制条」整块，
    //   封面必须随之上抬（整块在列内居中 ⇒ 封面中心 = 下边距 + 封面高 / 2）。
    //   ⚠ 判据走 `window.supportsPlayerTwoPane`（官方 WindowSizeClass 语义：宽 / 高都「非
    //   Compact」= 宽 ≥ 600dp 且高 ≥ 480dp；2026-10-24 由写死像素门槛升级为尺寸分级），
    //   手机横屏 792×360dp 不满足 ⇒ 恒 false，本文件对其逐像素不变。
    val twoPane = window.supportsPlayerTwoPane
    // Upstream keeps one artwork alive and animates its frame for 0.48s when
    // switching between artwork and alternate pages.
    val headerProgress by animateFloatAsState(
        targetValue = if (page == MeloXNowPlayingPage.Artwork) 0f else 1f,
        animationSpec = tween(
            durationMillis = 480,
            easing = FastOutSlowInEasing,
        ),
        label = "persistent-artwork-page-frame",
    )

    val playbackScale by animateFloatAsState(
        targetValue = if (MeloXSettingsRuntime.reduceMotion || !MeloXSettingsRuntime.artworkMotionEnabled || state.isPlaying) 1f else 0.74f,
        animationSpec = if (state.isPlaying) {
            spring(
                dampingRatio = 0.70f,
                stiffness = 280f,
                visibilityThreshold = 0.001f,
            )
        } else {
            spring(
                dampingRatio = 0.94f,
                stiffness = 360f,
                visibilityThreshold = 0.001f,
            )
        },
        label = "shared-artwork-playback-scale",
    )
    // ★★ 切歌回弹：换歌那一帧，封面从「缩小 + 半透明」弹回原样，取代原来的硬切
    //    （用户反馈「切歌时专辑封面太生硬」）。
    //    ⚠ 三条纪律：
    //    1. 只认 `mediaId`、**不认** `artworkUrl`：封面 url 会被异步回填（Lx 补封面 / 本地扫描），
    //       那是同一首歌的加载，弹一下会被误读成换歌。
    //    2. 「开始播放 / 停止播放」（mediaId 的 null 那一侧）**不弹**：那时播放器本身正在展开
    //       或收起，再叠一层缩放会跟展开动画打架。
    //    3. 「减弱动效」或关闭「封面动效」⇒ 恒 1，原样直切。
    //    ⚠ 读取放在 `graphicsLayer` lambda 里（与 `phaseProvider = { animatable.value }` 同源）：
    //       composition 里直接读 Animatable.value 不订阅快照。
    val switchBounce = remember { Animatable(1f) }
    val switchBounceSeen = remember { ArtworkSwitchBounceSeen() }
    LaunchedEffect(state.mediaId) {
        val previous = switchBounceSeen.mediaId
        val current = state.mediaId
        switchBounceSeen.mediaId = current
        if (previous == null || current == null) return@LaunchedEffect
        if (MeloXSettingsRuntime.reduceMotion || !MeloXSettingsRuntime.artworkMotionEnabled) {
            return@LaunchedEffect
        }
        switchBounce.snapTo(0f)
        switchBounce.animateTo(
            targetValue = 1f,
            animationSpec = spring(
                dampingRatio = MeloXArtworkSwitchBounceDamping,
                stiffness = MeloXArtworkSwitchBounceStiffness,
                visibilityThreshold = 0.001f,
            ),
        )
    }

    // ★★ 横屏封面手势（用户要求）：双击 = 播放/暂停，左滑 = 下一首，右滑 = 上一首。
    //   ⚠ 接管范围收得很紧，三条纪律：
    //    1. **竖屏根本不挂** pointerInput：竖屏封面那块区域属于页面级手势（下拉收起等），
    //       多一层手势会改变命中/消费行为，风险远大于收益。
    //    2. 只消费**水平**位移（`dragging` 判定用 `dx`）：竖直方向不消费 ⇒ 下拉收起不受影响。
    //    3. 未展开 / 转场中 / 覆盖层显示时 `enabled=false` ⇒ 手势直接放行（不消费事件）。
    val latestState = rememberUpdatedState(state)
    val artworkGesturesEnabled = rememberUpdatedState(gesturesEnabled && !hidden)
    val latestArtworkTap = rememberUpdatedState(onArtworkTap)
    val artworkDrag = remember { Animatable(0f) }
    val artworkGestureScope = rememberCoroutineScope()
    var artworkDragJob by remember { mutableStateOf<Job?>(null) }
    val artworkMaxDragPx = with(LocalDensity.current) { MeloXArtworkSwipeMaxDrag.toPx() }
    val artworkThresholdPx = with(LocalDensity.current) { MeloXArtworkSwipeThreshold.toPx() }
    val artworkGestureModifier = if (isLandscape || MeloXSettingsRuntime.artworkTapLyrics || MeloXSettingsRuntime.artworkSwipeTracks) {
        Modifier.pointerInput(artworkMaxDragPx, artworkThresholdPx, isLandscape, MeloXSettingsRuntime.artworkTapLyrics, MeloXSettingsRuntime.artworkSwipeTracks, page) {
            meloXArtworkGestures(
                enabled = { artworkGesturesEnabled.value },
                swipeEnabled = MeloXSettingsRuntime.artworkSwipeTracks && page == MeloXNowPlayingPage.Artwork || isLandscape && !MeloXSettingsRuntime.artworkSwipeTracks,
                thresholdPx = artworkThresholdPx,
                maxDragPx = artworkMaxDragPx,
                onDragDelta = { delta ->
                    artworkDragJob?.cancel()
                    artworkDragJob = artworkGestureScope.launch(start = CoroutineStart.UNDISPATCHED) {
                        artworkDrag.snapTo(
                            (artworkDrag.value + delta * MeloXArtworkSwipeDamping)
                                .coerceIn(-artworkMaxDragPx, artworkMaxDragPx),
                        )
                    }
                },
                onRelease = { dragged ->
                    artworkDragJob?.cancel()
                    artworkDragJob = artworkGestureScope.launch {
                        artworkDrag.animateTo(
                            targetValue = 0f,
                            animationSpec = spring(dampingRatio = 0.72f, stiffness = 420f),
                        )
                    }
                    when {
                        // 左滑（位移为负）→ 下一首；右滑 → 上一首（与 mini 播放器一致）。
                        dragged <= -artworkThresholdPx -> latestState.value.next()
                        dragged >= artworkThresholdPx -> latestState.value.previous()
                    }
                },
                onDoubleTap = { latestState.value.togglePlayPause() },
                onTap = if (MeloXSettingsRuntime.artworkTapLyrics && page != MeloXNowPlayingPage.Queue) {
                    { latestArtworkTap.value() }
                } else null,
            )
        }
    } else {
        Modifier
    }

    // ★ 阴影强度（模糊副本的 alpha）：AM 的阴影会随播放态轻微呼吸 —— 播放中略强、暂停略收。
    //   旧实现这里是 `elevation = 26.dp / 14.dp` 喂给平台 `.shadow()`；平台 elevation 阴影
    //   在 vivo/iQOO 上几乎不可见且不可控（RenderNode 离屏缓存 + 厂商 ambient/spot 差异），
    //   已于 2026-10-07 换成「封面自身的模糊副本」，这个动画保留下来驱动副本的 alpha。
    val artworkShadowStrength by animateFloatAsState(
        targetValue = if (state.isPlaying) 1f else 0.86f,
        animationSpec = spring(
            dampingRatio = 0.92f,
            stiffness = 320f,
        ),
        label = "shared-artwork-shadow",
    )

    val pageFrameProgress = if (isLandscape) 0f else headerProgress
    // Measure the visible cover, including its playback scale, in both directions.
    // The shell transform can then map that same footprint onto the mini artwork.
    val artworkBoxScale = 1f + (playbackScale - 1f) * (1f - pageFrameProgress)

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .padding(bottom = 16.dp)
            .meloXPlayerStatusBarsPadding()
            // 与场景层用**同一份**挖孔内边距，保证封面左列与右侧信息列仍严格对齐。
            .meloXPlayerDisplayCutoutPadding()
            // Reserve the same action bar as the landscape scene, including play-scale artwork.
            .padding(top = if (isLandscape) ImmersiveTopBarHeight else 0.dp)
            .padding(horizontal = if (isLandscape) 20.dp else 32.dp),
    ) {
        val contentTop = 30.dp
        // ⚠ 非封面页（歌词/列表）那枚 72dp 缩略图的纵向落点，必须等于**场景层**内容区
        //   top = `meloXPlayerStatusBarsPadding` + `SceneGrabber` 高（当前 22dp）。
        //   缩略图与场景 header 行同为 72dp ⇒ 同 top 即天然对齐（缩略图与歌名/按钮同一条水平带）。
        //   之前沿用 `contentTop(30dp)` ⇒ 缩略图比 header 行低 8dp（grabber 由 30dp 改到 22dp 的遗留）。
        //   ⚠ 改 `SceneGrabber` 高度时**必须同步这里**。
        // Tingyu adaptation: the original 22dp grabber is now a 44dp action bar.
        val compactFrameTop = ImmersiveTopBarHeight
        val portraitContentHeight = (maxHeight - contentTop - MeloXNowPlayingControlsHeight.dp)
            .coerceAtLeast(1.dp)
        // ★ 统一主时间线：封面尺寸/位置由**同一条 orientation Transition** 驱动
        // （与场景层共用 `orientTransition`）。转屏时封面与场景在同一 spring 上连续变形，
        // 不再是「封面独立 tween + 场景独立 tween」两套时钟。
        // Restore the original large artwork geometry; keep the shared destination at this size.
        val portraitSize = minOf(maxWidth, portraitContentHeight - 92.dp).coerceAtLeast(1.dp)
        // ⚠ 横屏封面边长必须与场景层（主布局 + 天际 clip 源尺寸）**同一份**计算 ⇒ 抽到
        //   `meloXLandscapeArtworkSize` 单点维护（平板双栏要在同一公式里扣掉左列控制区）。
        val landscapeSize = meloXLandscapeArtworkSize(
            maxWidth,
            maxHeight,
            twoPane,
            window.ultrawidePlayer,
        )
        // ⚠ 竖屏几何快照必须**先于**图片请求声明（下面只用它兜底，不在本段写）。
        //   真正的锁存发生在本函数末尾、确认容器已是竖形之后。
        val portraitGeom = remember { PortraitArtworkGeom() }
        // 图片请求尺寸按「目标方向终值」取（不随动画每帧重取，避免转屏途中反复重载）。
        // ⚠⚠ 竖屏侧必须用**已锁存的** `portraitGeom.size`兜底，不能直接用本帧的 `portraitSize`：
        //   转屏起手那一帧 `BoxWithConstraints` 的约束可能**还是横屏的**，
        //   此时 `portraitSize = min(横屏宽, (横屏高 − 30 − 279) − 92)` 是负数 ⇒ 被
        //   `coerceAtLeast(1.dp)` 兜成 **1.dp** ⇒ 会真的发一个 1px 的图片请求，
        //   下一帧约束更新后再发正常尺寸 ⇒ 中途重载一次 = 转屏起手一记闪动。
        //   `portraitGeom.size` 只在「容器确实是竖的」时才被写入（见下方），恒为良好值。
        val fullArtworkSizeTarget = if (orientTransition.targetState) {
            landscapeSize
        } else {
            maxOf(portraitSize, portraitGeom.size)
        }
        // ★ Fix2：图片请求尺寸跨方向恒定（取两方向静止终值的较大者），转屏不再重建 ImageRequest
        //   ⇒ 本体 + 阴影副本两处 AsyncImage 零重载（去掉起手那一记解码 / 状态变更顿挫）。
        //   `baseEdge` 仍用 `fullArtworkSizeTarget`（终点边长）保持逐像素等价，两者用途分开。
        val artworkFooterHeight = 78.dp
        // ★ 竖屏**封面单独**上移量（用户反馈"封面太靠下"）。⚠ 只影响封面：歌名栏保持原位，
        //   所以**不要**在 `ArtworkDetailsWithoutArtwork` 里加等高 Spacer（那会把歌名栏一起顶上去）。
        val portraitY = (
            contentTop +
                (portraitContentHeight - portraitSize - artworkFooterHeight) -
                MeloXPortraitArtworkRaise
            ).coerceAtLeast(0.dp)

        // ★★ 位置改用「容器比例(center fraction)」表达，不用绝对 dp：转屏瞬间容器尺寸会突变，
        //   同一个 x/y 数字进入新容器后含义就变了 ⇒ 封面会先"跳"到错的位置再滑 = "不是直接飞入目标位"。
        //   竖屏封面水平居中(0.5)、横屏在左列中心(0.43÷2 = 0.215)；纵向中心比例实时锁存
        //   （横屏容器里算不出竖屏那一份，必须在竖屏时记下）。
        // ⚠ 竖屏几何用**非 state 快照**保存：在 composition 里写 `mutableStateOf` 会触发反复
        //   重组（弹簧每帧都在动）⇒ 封面抖动。非 state 写入不触发任何失效；Compose 跳过本
        //   scope 时自动保留上一份竖屏值，正是我们要的。
        //   （`portraitGeom` 本身已在图片请求那段声明，此处只做写入。）
        // ⚠⚠ 锁存条件是「**容器真的是竖的**」（`maxHeight > maxWidth`），**不能只看 `!isLandscape`**。
        //   两者不是同一时刻更新的：`isLandscape` 来自 `LocalWindowInfo.containerSize`
        //   （配置变更回调那一刻就翻），而 `BoxWithConstraints` 的 maxWidth/maxHeight 要等
        //   **下一次 measure** 才换成新值 ⇒ 中间存在一个 1 帧窗口：
        //   `isLandscape == false` 但容器约束**还是横屏的**。
        //   那一帧里 `portraitContentHeight = 横屏高 − 30 − 279` 已经是负数 ⇒
        //   `portraitSize = min(横屏宽, 负数 − 92)` 被 `coerceAtLeast(1.dp)` 兜成 **1.dp**，
        //   一旦写进锁存，封面就是**从 1dp 起飞**（整段动画尺寸全错）。
        //   真机上肉眼是否可见取决于「配置回调」与「measure」谁先谁后（不确定），
        //   而修掉它的代价只有半个 if —— 没有理由赌。
        if (maxHeight.value > maxWidth.value) {
            portraitGeom.size = portraitSize
            portraitGeom.centerYFrac = ((portraitY + portraitSize / 2).value / maxHeight.value)
                .coerceIn(0f, 1f)
        }
        // ⚠ 曲线选型（2026-10-09）：
        //   LinearEasing 匀速——无加减速，机械、硬；
        //   FastOutSlowInEasing 两头慢中间快——减速段被误判为卡顿；
        //   LinearOutSlowInEasing 匀速开始→减速结束——前 40% 才入速，飞入感弱；
        //   CubicBezierEasing(0.16,1,0.3,1)——前 16% 时间即冲到 100% 速度，
        //   后 70% 柔和减速落定。既有强启动感（飞），又不硬。
        // ⚠ 曲线选型（2026-10-23 改）：原 `CubicBezierEasing(0.16,1,0.3,1)` 是**强减速**——
        //   起手瞬间冲到满速（弹射感）、之后 70% 的时长慢爬到终点（拖尾），落点虽准但
        //   "前冲后拖"读起来就是生硬 / 不优雅。换成 **对称缓入缓出** `(0.33,0,0.2,1)`：
        //   起步零速度（不起跳）、中段最快、落定零速度（不拖尾）= 丝滑的"滑入滑出"。
        //   ⚠ 仍固定 300ms：与系统旋转动画同时起止，布局淡入淡出也走同一条主轴时钟，
        //     两者融合成一次运动（改时长会脱离系统旋转 ⇒ 封面比窗口晚停 = 更不丝滑）。
        // ★ Fix1（修「转屏封面百分百顿挫」根因）：orientProgress 等纯视觉量**只在绘制期读**，
        //   组合期不订阅 ⇒ BoxWithConstraints 不再每帧 re-subcompose / measure / place / 重录。
        //   曲线与场景层共用（对称缓入缓出 300ms）。
        val orientProgressState = orientTransition.animateFloat(
            transitionSpec = {
                tween(300, easing = CubicBezierEasing(0.33f, 0f, 0.2f, 1f))
            },
            label = "shared-artwork-orient-progress",
        ) { landscape -> if (landscape) 1f else 0f }

        // 横屏左列中心 0.215 随 columnCenterProgress 滑到屏幕中心 0.5（与场景层 Row 同解）。
        // ★ H 轮超宽车机档：恒左对齐，落点 = padding + 边长/2
        //   （[meloXUltrawideArtworkCenterXFrac]），**不再叠加任何居中位移** ——
        //   车机已改成「左列整块播放器 + 右列大字歌词常驻」，没有封面态可居中。
        val landscapeCenterXFracOf = {
            if (twoPane && window.ultrawidePlayer) {
                meloXUltrawideArtworkCenterXFrac(maxWidth, maxHeight)
            } else {
                0.215f + (0.5f - 0.215f) * columnCenterProgress()
            }
        }
        // 横屏纵向目标：手机/竖屏恒 0.5；★ H 轮车机档左列是「封面 + 下方控件块」
        //   整体垂直居中 ⇒ 封面中心不再是 0.5H，走 [meloXUltrawideArtworkCenterYFrac]
        //   （与 Scene 左列 Arrangement.Center 同解，否则封面会压在曲名行上）。
        val landscapeCenterYFracTarget = when {
            twoPane && window.ultrawidePlayer ->
                meloXUltrawideArtworkCenterYFrac(maxWidth, maxHeight)
            twoPane -> meloXTabletLandscapeArtworkCenterYFrac(maxWidth, maxHeight)
            else -> 0.5f
        }

        // ★ 冻结几何：布局只认「目标方向静止终值」，转屏途中恒定 ⇒ 零 measure/place。
        val frozenEdge = fullArtworkSizeTarget
        val endCenterXFrac = if (orientTransition.targetState) landscapeCenterXFracOf() else 0.5f
        val endCenterYFrac =
            if (orientTransition.targetState) landscapeCenterYFracTarget else portraitGeom.centerYFrac
        val frozenX = (maxWidth * endCenterXFrac - frozenEdge / 2f).coerceAtLeast(0.dp)
        val frozenY = (maxHeight * endCenterYFrac - frozenEdge / 2f).coerceAtLeast(0.dp)

        // 转屏进行中 且 不在开合 morph 中 ⇒ 冻结几何 + transform（morph 期 72dp↔全屏真在变，冻了错位）。
        val morphFreeze by remember(playerMotion) { derivedStateOf { playerMotion?.active() == true } }
        val orientationAnimating = orientTransition.currentState != orientTransition.targetState
        val orientationFrozen = orientationAnimating && !morphFreeze

        // ★ 转屏 transform（绘制期）：以 frozenEdge 为基准**关于中心缩放**，位移把中心送到逐帧
        //   目标中心。静止态 p=0/1 ⇒ s=1、translation=0，与旧 layout 逐像素等价。所有逐帧视觉量
        //   （orientProgress / columnCenterProgress / flightIntensity）只在 lambda 内读。
        // ★★ 2026-10-23 修「转屏进竖屏歌词页：封面先画成屏幕正中的大图、转屏结束才跳到左上角 72dp」：
        //   冻结几何这条快路径只插值了「横屏左列大封面 ⇄ 竖屏**居中**大封面」，把
        //   `pageFrameProgress`（竖屏非封面页 = 1 ⇒ 左上角 72dp 缩略图）整段**绕过了**
        //   （见上方 targetSize/targetX/targetY 的 `if (orientationFrozen)` 分支）。
        //   于是转屏那 300ms 里封面一直是"封面页姿态"，等 `orientationFrozen` 翻 false 的
        //   那一帧 layout 才切到 72dp ⇒ 用户看到的就是「中间一个大封面，然后（硬跳）到左上角」。
        //   ⇒ 修法：**竖屏端几何本身**按 pageFrame 混到 72dp 左上角，再与横屏端按 p 插值。
        //   · `pf` 只在绘制期读（`headerProgress` 是 State）⇒ 不触发重组 / 不重录；
        //   · `pf = pfPortrait × (1 − p)`：p=1 是横屏（横屏任何页都是左列大封面，pageFrame 恒 0），
        //     p=0 才是竖屏（取页面对应的终值）⇒ 横→竖 是「左列大封面 → 左上角缩略图」
        //     **一次飞到位**，竖→横 是反向，全程只有一段运动；
        //   · p 落到 0/1 时与静止 layout 的 lerpDp(.., 72.dp, pageFrameProgress) 逐像素等价
        //     ⇒ 落定零跳变。
        // ★ 转屏期封面缩放由下方 `orientTransform` 的 `scaleX/Y = s` 统一驱动；
        //   封面与阴影的 clip 角用固定 `targetRadius`，视觉圆角 = `targetRadius × s`，
        //   与盒子缩放同源（同一个 `s`），无需任何旁路快照 / 补偿字段。
        val orientTransform = Modifier.graphicsLayer {
            val p = orientProgressState.value
            val pfPortrait = if (page == MeloXNowPlayingPage.Artwork) 0f else headerProgress
            val pf = pfPortrait * (1f - p)
            // 竖屏端（p=0 侧）：缩略图落点必须与 layout 静止态同源（top = compactFrameTop、边长 72dp、
            // 水平贴左 ⇒ 中心 x = 36dp），否则收敛点会差几个 dp = 落定一记微跳。
            val portraitEdge = lerpDp(portraitGeom.size, 72.dp, pf)
            val portraitCx = lerpDp(maxWidth * 0.5f, 36.dp, pf)
            val portraitCy = lerpDp(maxHeight * portraitGeom.centerYFrac, compactFrameTop + 36.dp, pf)
            val basePx = frozenEdge.toPx().coerceAtLeast(1f)
            val edgePx = (portraitEdge + (landscapeSize - portraitEdge) * p).toPx()
            val flightIntensity = meloXFlightHump(p) * (1f - pageFrameProgress)
            val flightLiftScale = 1f + 0.09f * flightIntensity
            val s = (edgePx / basePx * flightLiftScale).coerceAtLeast(0.0001f)
            // ★ 2026-11-07 修「转屏中途封面圆角跳变」：旧方案把本帧 s 交给 clip 做 1/s 补偿
            //   （`meloXCompensatedCornerShape`）⇒ 依赖普通字段 `orientationScaleHolder.scale` 与
            //   此处 `scaleX/Y = s` 帧间同步，但嵌套 graphicsLayer 合成时序差导致失步、视觉圆角
            //   中途跳变（k20p 实证）。现改为：clip 用固定 `targetRadius`，缩放完全交给下方
            //   `scaleX/Y = s` 统一驱动 ⇒ 视觉圆角 = `targetRadius × s`，角与盒子缩放同源
            //   （同一个 `s`），严格同步、零跳变。封面与阴影共用此机制、共用固定角。
            scaleX = s
            scaleY = s
            val cxPx = (portraitCx + (maxWidth * landscapeCenterXFracOf() - portraitCx) * p).toPx()
            val cyPx = (portraitCy + (maxHeight * landscapeCenterYFracTarget - portraitCy) * p).toPx()
            translationX = cxPx - maxWidth.toPx() * endCenterXFrac
            translationY = cyPx - maxHeight.toPx() * endCenterYFrac - 6.dp.toPx() * flightIntensity
        }

        // ★ 修「歌词页打开时封面先到正中、展开完才跳左上角」：morph 期间封面必须停在**目标页**
        //   的静止位，而不是无条件钉死全屏居中。
        //   · 封面页（Artwork）：静止位 = 全屏居中 ⇒ destPageFrame = 0；
        //   · 歌词 / 队列页（竖屏）：静止位 = 左上角 72dp 缩略图 ⇒ destPageFrame = 1。
        //   morph 期间用 destPageFrame 取代 live pageFrameProgress，封面直接以目标页姿态进场
        //   （mini → 72dp 左上角 一镜到底）；morph 结束瞬间 live pageFrameProgress 已等于该值
        //   （page 打开前已从 playback_last_page 还原、headerProgress 到位），故无边界跳变。
        //   ⚠ 顺带根治早先「打开瞬间封面变小」：封面页打开时若 headerProgress 残留非 0，旧实现
        //   （morph 期间不钉死）会让封面以 72dp 姿态进场；钉死到目标页位即一并消除。
        //   ⚠ 仅在 morph（expansionProgress ∈ (0.01,0.99)）期间生效；收起 / 页间滑动
        //   （exp >= 0.99）仍走 live pageFrameProgress，切页滑动观感不变。
        //   ⚠ 横屏 / 平板双栏：歌词页仍是左列大封面（pageFrameProgress 恒 0，见本函数 997 行），
        //   destPageFrame 必须随之恒 0，否则会引入横屏「先 72dp 再跳全屏」新跳变。
        val effectivePageFrame = pageFrameProgress
        // ★ live 布局（morph / 静止态）：仅当 orientationFrozen==false 才在组合期读
        //   `orientProgressState.value`；纯转屏期间不读 ⇒ 不触发每帧重组。
        val orientProgressVal = if (orientationFrozen) 0f else orientProgressState.value
        val fullArtworkSize = portraitGeom.size + (landscapeSize - portraitGeom.size) * orientProgressVal
        val centerXFrac = 0.5f + (landscapeCenterXFracOf() - 0.5f) * orientProgressVal
        val centerYFrac =
            portraitGeom.centerYFrac + (landscapeCenterYFracTarget - portraitGeom.centerYFrac) * orientProgressVal
        val fullX = (maxWidth * centerXFrac - fullArtworkSize / 2f).coerceAtLeast(0.dp)
        val fullY = (maxHeight * centerYFrac - fullArtworkSize / 2f).coerceAtLeast(0.dp)
        val targetSize = if (orientationFrozen) frozenEdge else lerpDp(fullArtworkSize, 72.dp, effectivePageFrame)
        val targetX = if (orientationFrozen) frozenX else lerpDp(fullX, 0.dp, effectivePageFrame)
        val targetY = if (orientationFrozen) frozenY else lerpDp(fullY, compactFrameTop, effectivePageFrame)
        val targetRadius = lerpDp(io.github.huleixin.tingyu.chrome.FullPlayerCoverRadiusDp.dp, 12.dp, effectivePageFrame)
        val artworkClipModifier = Modifier.graphicsLayer {
            val radius = io.github.huleixin.tingyu.chrome.playerCoverLocalRadius(
                playerMotion?.fraction() ?: 1f, playerMotion?.cover?.width?.div(density),
                size.minDimension / density, targetRadius.value)
            shape = RoundedCornerShape(radius.dp)
            clip = true
        }
        val sharedArtworkModifier = movingArtwork
        // ★ alpha 必须挂在共享元素节点的**祖先**上（2026-10-06）：overlay 飞行副本只重放
        //   节点自身的绘制——节点自有 `graphicsLayer{alpha=0}` 会把「飞行中的共享元素」
        //   一起变透明（天际 morph 会整段消失）；祖先 alpha 不作用于 overlay 副本 ⇒
        //   「原地隐藏」与「飞行实心」兼得。手势/命中不受 alpha 影响（gesturesEnabled
        //   在调用点已单独门控 skyline）。内层 Box 的 offset/size 仍是共享元素边界，
        //   坐标系与外层 fillMaxSize 同原点 ⇒ 位置不变。

        // ★★★ 封面本体与阴影层**共用**的这一份 transform。
        // 抽出来的唯一理由：阴影层是独立子节点，若本体自己带 layer、阴影不带，
        // 本体一缩/一移/一淡就与阴影脱节 ⇒ 露馅（用户 2026-10-07 报障）。
        // ⚠ 用 `remember` 之外不可缓存 —— 里面读的是每帧变化的 spring 值，必须每帧重算。
        // ★ Fix1：飞行驼峰（flightLiftScale / flightIntensity）已上移到 `orientTransform`
        //   （绘制期，关于中心缩放 + 上抬），由它统一施加到本体与阴影，两者严格同步。
        //   ⚠ 此处绝不可再叠飞行：否则转屏时「内层 flight + 外层 orient」双重缩放，封面会
        //     放大过头 / 上抬错位，与场景层脱节。
        val artworkTransform = Modifier.graphicsLayer {
            val bounce = switchBounce.value
            // 0 → 起点（缩小 + 半透明），1 → 原样；弹簧过冲段 bounce > 1 ⇒ 略微放大。
            val bounceScale = MeloXArtworkSwitchBounceScaleFrom +
                (1f - MeloXArtworkSwitchBounceScaleFrom) * bounce
                // ★ `effectiveScale` 在关闭方向已搬到盒子「测量尺寸」（见 `artworkBoxScale` 注释），
            //   此处内层只乘 `artworkInnerScale`（关闭=1、打开=effectiveScale）⇒ 视觉缩放恒 =
            //   `effectiveScale × bounce`、与改动前逐像素等价；且不与盒子缩放双重叠加。
            val s = bounceScale
            scaleX = s
            scaleY = s
            // alpha 只在前 40% 行程回到 1：把硬切磨柔，不是淡入淡出。
            alpha = MeloXArtworkSwitchBounceAlphaFrom +
                (1f - MeloXArtworkSwitchBounceAlphaFrom) *
                (bounce / MeloXArtworkSwitchBounceAlphaSpan).coerceAtMost(1f)
            translationX = artworkDrag.value
            translationY = 0f
        }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer {
                    alpha = if (hidden) 0f else 1f
                },
        ) {
            // ★★ 2026-10-24（用户报障：从迷你栏打开播放页时，封面外圈套着一大块模糊影，
            //   只在封面页出现、只在开页动画途中，落定后正常）。
            //   根因：下面 `meloXArtworkShadowLayer` 的 `edge`（决定 blur 半径与外扩 pad 的
            //   几何基准）传的是 **`targetSize`**，而开页 morph 期封面本体被 sharedBounds
            //   **`RemeasureToBounds` 重新测量成了小尺寸** ⇒ 本体小、阴影的外扩量/模糊半径
            //   仍是满尺寸 ⇒ 小封面外圈套一大块模糊影（真机录像：模糊块比封面大一圈、上溢
            //   到页面顶部圆角处）。
            //   ⇒ morph 期把**实测布局边长**喂给 `edge`：阴影层的冻结机制（`baseEdge` +
            //     `graphicsLayer{scale}`）会按 `edge/baseEdge` 等比缩放，几何随之对齐，
            //     且**不重栅格**。静止态实测边长 == `targetSize` ⇒ 逐像素等价；
            //     转屏仍走 `frozenEdge`（那条口径不变）。
        // ★ 关闭方向把封面「测量尺寸」钉到视觉尺寸（见上方 `artworkBoxScale` 注释）：
        //   盒子尺寸 × 居中补偿偏移 = 旧 `targetSize` 的**中心**，内层只留 bounce ⇒ 测量矩形
        //   = 视觉小封面，morph 源不再瞬间弹回满尺寸。打开方向 `artworkBoxScale=1` ⇒
        //   偏移为 0、尺寸 = `targetSize`，等同旧行为。
        val artworkBoxSize = targetSize * artworkBoxScale
        val artworkBoxOffset = (targetSize - artworkBoxSize) / 2f
        Box(
            modifier = Modifier
                .offset(x = targetX + artworkBoxOffset, y = targetY + artworkBoxOffset)
                .size(artworkBoxSize)
                .onGloballyPositioned(onArtworkPositioned),
        ) {
            Box(Modifier.matchParentSize()
                .then(sharedArtworkModifier)
                // ★ Fix1：转屏冻结几何时挂 `orientTransform`（在 sharedArtworkModifier **之后**、
                //   内层），由它做逐帧缩放/位移；sharedElement 边界保持冻结尺寸，morph 期
                //   orientationFrozen=false 不挂 ⇒ 飞行/缩放与场景层严格同步、不脱节。
                .then(if (orientationFrozen) orientTransform else Modifier)
                .then(artworkGestureModifier),
            ) {
                // 开合 morph / 下拉手势期把装饰性模糊副本按**进度**淡入淡出（见下方 `strength` 注释）。
                // ★ 2026-10-24 第二版：不再用 `animateFloatAsState`（时间动画），改成**纯进度函数**
                //   在绘制期读（`strengthScale` provider）。原因：时间动画与手指脱钩 ——
                //   下滑跟手时页体立刻缩、模糊影却要等 260ms 才退；松手回弹时同理，
                //   用户报「下滑再松手时，模糊消失和出现也很突兀难看」。
                //   改成 p 的函数后：手到哪模糊就到哪（跟手），且**零重组**。
                //★★★ 阴影与本体**必须共用同一份 transform**（2026-10-07 修「封面下面放缩略图，
                //   一旦封面变小或移动就会露馅」）。
                //   踩过的坑：阴影层原本是**独立子节点**，而本体的
                //   `liftScale`（effectiveScale × flightLiftScale × bounceScale）、切歌 alpha、
                //   `translationX/Y` 全挂在 `Artwork` **内部**的 graphicsLayer 上
                //   ⇒ 切歌回弹 / 转屏主角飞行 / 拖拽时本体动、阴影不动 ⇒ 直接露馅。
                //✅ 正解：抽一份 `artworkTransform`，本体与阴影层**都挂它**。
                //   · 两者尺寸/中心一致（同为 fillMaxSize / matchParentSize）
                //     ⇒ 同一个 layer 变换对二者产生完全相同的位移与缩放。
                //   · `alpha` 也在这份里 ⇒ 切歌淡入时阴影同步淡入，不会残留。
                //   · overlay 飞行副本会重放整个 sharedElement 子树，阴影层与本体一起被重放
                //     ⇒ 相对关系不变、不会重复或错位。
                // ⚠ 阴影层**不再自带 lift**：本体抬起时阴影必须跟着抬，
                //   「阴影留在原地」这种拟物偏移在跟随架构下就是错的（那正是露馅的来源）。
                meloXArtworkShadowLayer(
                    bitmap = state.artworkBitmap,
                    // ★ 2026-10-25：副层**自加载**（与本体同一 `model`，Coil 缓存命中、各自
                    //   持有有效引用）。⚠ 不要传本体抽出的位图 —— 池化位图长期持有会被回收，
                    //   画出来是黑的（详见函数形参注释）。

                    // 稳态 = 1；切页 / 转屏途中按 pageFrameProgress 淡出；
                    // 「播放中」比「暂停」略强，与 AM 的呼吸感一致。
                    //
                    // ★★ 2026-10-24 修「歌词/队列页封面缩到左上角 72dp 后，四角有明显阴影」：
                    //   真机截图复现：缩略图四周一圈暗晕、四角最重（就是本阴影副本）。
                    //   旧系数 `(1 - pageFrameProgress * 0.8f)` 在缩略图态还剩 0.2 强度，而 halo 的
                    //   blur / pad 按 2.5% / 1.6× 随边长**等比**缩小 ⇒ 相对观感与全尺寸封面一样重，
                    //   在深色播放页背景上读作「四角一圈黑影」。AM 口径：这份同色模糊副本是
                    //   **大封面**的立体感；header 行的 72dp 缩略图是平的（ShadowImageView 的
                    //   blurredImageView 只属于大图场景）。
                    //   ⇒ 改为 smoothstep 淡出：pageFrame ≥ 0.95（缩略图落定）强度归零，
                    //     封面缩小过程里平滑消退（非突变）；封面页（pageFrame = 0）淡出系数 = 1
                    //     ⇒ 与旧值逐像素等价；横屏 pageFrameProgress 恒 0 ⇒ 不受影响。
                    // ★★ 2026-10-24（用户报障：从迷你栏**打开**播放页时，小封面外圈铺着
                    //   一大块放大模糊的封面，上溢到页面顶部；只在封面页、只在开页动画途中、
                    //   落定后正常）。
                    //   试过让 `edge` 跟随实测边长（见下方 `edge` 参数），**实测无效**：
                    //   这一层的渲染矩形由自己的 `edge + 2*pad` 决定，而 morph 期封面本体
                    //   是被 sharedBounds 缩放/重测的 —— 两套几何不同源，改 `edge` 拿不到
                    //   那个"当前可见尺寸"。
                    //   ⇒ 改为**在开合 morph 期间淡出这份装饰性副本**（它只是大封面的
                    //     立体感 / AM 的 blurredImageView），落定后再淡回来。
                    //   ⚠⚠ 第一版写成 `if (morphFreeze) 0f` 硬切，用户当场否掉：
                    //     「出现模糊有点突兀，不够优雅」—— 落定那一帧模糊影凭空冒出。
                    //     ⇒ 必须**缓入**：`animateFloatAsState` + 260ms FastOutSlowIn 过渡，
                    //       morph 结束时模糊是从 0 慢慢长回满强度的，读作封面逐渐有了立体感。
                    //   ⚠ 判据仍是**离散** `morphFreeze`（p∈(0.01,0.99)，全程只翻两次）；
                    //     只有动画自身的 260ms 过渡会重组这一小棵子树（开/合各一次），
                    //     不在组合期读逐帧动画值。静止态系数恒 1 ⇒ 与改前逐像素一致。
                    // ★ 上游口径：模糊影强度 = `fullScreenScaleBlend`（≈ expansionProgress 在
                    //   0.30→0.88 的 smoothStep）×（1 − 封面页占比 × 0.8）× 播放/暂停强度。
                    //   `fullScreenScaleBlend` 由本体共用 ⇒ 模糊层与封面**严格同步**缩放/淡入，
                    //   全程跟随 sharedElement 飞行（不冻结、不额外淡出），即上游打开动画
                    //   「同色模糊副本跟手放大」的观感。
                    strength = (1f - pageFrameProgress * 0.8f) *
                        artworkShadowStrength,
                    // ★ 开合 morph 期间提前组合 ⇒ 图像 / 亮度在窗口打开前就绪，消除「进入动画时模糊闪烁」。
                    strengthScale = { io.github.huleixin.tingyu.chrome.playerMotionReveal(playerMotion?.fraction() ?: 1f, .30f, .88f) },
                    preload = morphFreeze,
                    transform = artworkTransform,
                    // ★ Fix1：转屏冻结时阴影几何也钉死在 `frozenEdge`（== fullArtworkSizeTarget），
                    //   由外层 orientTransform 统一缩放；仅 morph 期（orientationFrozen=false）
                    //   走 live `targetSize` 跟踪 72dp↔全屏。
                    // ★ 2026-10-24：morph 期用**实测边长**，否则阴影会比本体大一圈（见上方
                    //   `liveArtworkEdgePx` 注释）。静止态实测边长 == `targetSize` ⇒ 等价。
                    // ★ 2026-10-25（修「进入动画时封面旁模糊闪烁」）：`edge` 原先只在
                    //   `morphFreeze`（p∈(0.01,0.99)）期间用实测边长、p 一过 0.99 就切回
                    //   `targetSize`。而这个「切源」的帧恰好落在 `strengthScale` 刚升满
                    //   （p=0.99 ⇒ 模糊影满强度）那一帧 —— 只要此刻实测边长与 `targetSize`
                    //   还差一点点，满强度的模糊影就会瞬间缩/张一下，肉眼就是「闪烁」。
                    //   ⇒ 只要量到过实测边长就一直用它（静止态实测边长 == `targetSize`，
                    //     逐像素等价），彻底消除这个切源动作。
                    // ★ 上游口径：模糊层几何基准恒为封面静止边长。
                    //   视觉缩放/位移全部走 `artworkTransform`（与本体同一份），
                    //   严格跟随 sharedElement 飞行 morph；不再用实测布局边长
                    //   （会让 morph 期模糊层比封面大很多 —— 用户复报）。
                    // ★ 关闭方向盒子已缩到 `targetSize * artworkBoxScale`，阴影几何须同缩
                    //   否则模糊层会比封面大一圈（关闭瞬间露出大光晕）。打开方向
                    //   `artworkBoxScale=1` ⇒ 等同旧 `targetSize`。
                    edge = (if (orientationFrozen) frozenEdge else targetSize) * artworkBoxScale,
                    // ★ 冻结基准 = **目标方向的静止封面边长**（不随动画每帧变，只在转屏翻向时
                    //   变一次）。静止态 `targetSize == 它` ⇒ s = 1 ⇒ 逐像素等价。
                    baseEdge = fullArtworkSizeTarget,
                    // ★ 冻结判据（2026-10-22 修正）：
                    //   旧 `effectivePageFrame < 0.5f` 只在**封面页**冻结，歌词/队列页
                    //   （pageFrameProgress=1）转屏时 `freezeEligible=false` ⇒ 阴影每帧重栅格 +
                    //   重建 RenderEffect ≈ +1ms/帧 —— 正是「转屏封面移动卡顿」残余来源之一。
                    //   ✅ 新判据：页面处于**稳定态**（不在 morph 中）即冻结（任意方向、任意页，
                    //   含歌词页稳定态与 72dp 缩略图态——缩略图态几何补偿后逐像素等价，见函数体），
                    //   仅「歌词/队列页 morph（72dp↔全屏）」期间放开跟踪（那一段封面尺寸真在变）。
                    //   封面页 morph 仍走旧逻辑冻结（effectivePageFrame<0.5），避免 sharedElement
                    //   飞行与阴影脱节。净效果：转屏全程（无论停在哪一页）阴影恒定，不再逐帧重栅格。
                    freezeEligible = !morphFreeze || effectivePageFrame < 0.5f,
                    cornerRadius = targetRadius,
                    // ★ 阴影圆角不再做 1/s 补偿（同封面）：固定 `targetRadius`，由外层统一缩放，
                    //   视觉角 = `targetRadius × s`，与封面严格同源、零跳变；直角黑边问题已由
                    //   2026-11-06 回退补偿缩放壳解决，与此无关。
                )
                ImmersiveArtwork(
                    bitmap = state.artworkBitmap,

                    modifier = Modifier
                        .fillMaxSize()
                        .then(artworkTransform)
                        .testTag("immersive-artwork")
                        .then(artworkClipModifier),
                )
            }
        }
        }


    }
}
internal val MeloXPortraitArtworkRaise = 30.dp
@Composable
private fun BoxScope.meloXArtworkShadowLayer(
    bitmap: android.graphics.Bitmap?,
    strength: Float,
    strengthScale: () -> Float,
    // ★★ 2026-10-25（修「进入动画时封面旁模糊闪烁」）：开合 morph 期间**提前组合**这份
    //   装饰副本 —— 即使此刻 `strength`（alpha）还是 0。否则它要等 alpha 越过 0.004
    //   （开页 ~p 0.32）才首次组合，其 AsyncImage 与「平均亮度」采样都要到那时才开始，
    //   图像 / 压暗量有可能在模糊影淡入窗口（p∈[0.90,0.99]）**打开之后**才到达 ⇒ 读作
    //   进入动画里的一记闪烁 / 爆闪。提前组合后，图像与亮度在窗口打开前就已就绪。
    //   非 morph 期（静止 / 歌词页 72dp 缩略图）仍按原 `alpha` 门槛跳过组合，零额外开销。
    preload: Boolean = false,
    // ★ 与本体共用的 transform（见调用点）：保证阴影和封面永远同步缩放/位移/淡入。
    //   ⛔ 不要在这里再加任何独立位移或缩放，那会让两者脱节。
    transform: Modifier,
    // ★ 封面边长，**由调用点直接传入**（2026-10-07 修「转屏末帧抖一下」）。
    //
    //   旧实现用 `onSizeChanged` 测：`mutableFloatStateOf` 的写入发生在**布局之后**，
    //   下一次重组才生效 ⇒ 转屏途中每一帧封面都在变尺寸，而阴影的 `edge`/`blurRadius`/
    //   `pad` 永远慢**一帧**。弹簧收尾时相邻两帧的尺寸差本来已经很小，慢一帧等于把
    //   差值放大到肉眼可辨 ⇒ 阴影的模糊半径与外扩量在末帧「跳」一下再归位，
    //   读作封面抖动（本体其实没动，抖的是套在它外面那圈影）。
    //
    //   ⚠ 与本体的尺寸同源（`Box.size(targetSize)` + 副本 `fillMaxSize()`），
    //   且不含自反馈（副本尺寸依赖 edge，但 edge 来自外部常量，不依赖副本自身测量）
    //   ⇒ 直接传值在几何上等价，却把「慢一帧」彻底消除。
    edge: Dp,
    // ★★ 冻结基准边长（2026-10-23，修「转屏封面百分百顿挫」）。
    //
    //   实测（atrace 逐帧，36 帧转屏 / 22 个 drawLayer）：**只有封面这一块方层每帧变尺寸**
    //   （1267→1261→1256→…→1204，步长 1~6px），其余 21 层全程恒定。按「方层是否变化」分组：
    //   变化帧 Drawing 5.85ms / flush 2.31ms，未变帧 4.81ms / 1.75ms
    //   ⇒ 阴影层每帧重栅格 + 重算 RenderEffect ≈ **+1.0ms/帧**（8.33ms 预算的 12%，
    //   正好把一帧推过 60Hz 的 16.67ms 线 ⇒ 滑到 3 个 vsync = 用户看到的顿挫）。
    //
    //   根因：`edge` 由 `fullArtworkSize` 每帧线性插值驱动，而 `blurRadius = edge * 2.5%`
    //   与节点边长 `edge + 2*pad` **同时**每帧改 ⇒ RenderEffect 每帧重建 + 整层重栅格。
    //
    //   修法（数学等价）：模糊半径与节点边长都是 `edge` 的**线性函数** ⇒ 把内层几何钉死在
    //   基准边长 `baseEdge`，外层用 `graphicsLayer{scale}` 缩放补偿：
    //     s·blur(base) = blur(edge) ✓   s·(base+2pad) = edge+2pad ✓   s·base = edge ✓
    //   ⇒ 整个过程阴影层**永不重栅格**，退化成一枚被 GPU 缩放的静态贴图。
    //   ⚠ `baseEdge` 传「目标方向的静止封面边长」（`fullArtworkSizeTarget`，Dp）⇒ 静止态
    //     s 恰好 = 1，**逐像素等价**（不只是近似）。
    //   ⚠ 转屏途中 `baseEdge` 会随方向翻一次（1 次重栅格，落在系统重配置那一帧上）。
    //   ⚠ 开合 morph 阶段收益为 0 —— 那里 `strength`（alpha）本身每帧在动，父层无论如何
    //     都要重算模糊。本条只针对「alpha 恒定」的转屏。
    baseEdge: Dp,
    // ★★ 是否允许冻结（2026-10-23 修「冻结实测没生效」）。
    //   旧门限 `edge >= restEdge*0.72` 依赖 `restEdge`（= `fullArtworkSizeTarget`，又依赖
    //   `portraitGeom.size` 这份快照）。若转屏起手那帧容器还是横屏、或 App 从横屏冷启，
    //   `portraitGeom.size` 没锁存好（甚至还是初值 0.dp）⇒ `restEdge` 退化 ⇒ 门限判错 ⇒
    //   冻结整段失效 ⇒ 阴影层每帧重栅格（atrace 实测 1382→1322→…，+1ms/帧 = 顿挫）。
    //   改用**直接判据**：封面接近全尺寸（`effectivePageFrame` 小）时必冻结；缩略图态
    //   （歌词/队列页 72dp，`effectivePageFrame→1`）必不冻结（否则大模糊层缩到 17.6%，
    //   栅格面积 ~20× = 性能倒退）。这个值不依赖任何快照，恒正确。
    freezeEligible: Boolean,
    cornerRadius: Dp,
) {
    val alpha = strength.coerceIn(0f, 1f)
    // ⚠ `Modifier.blur` 走 RenderEffect，只在 API 31+ 生效；本机 minSdk 26。
    //   低版本上模糊是 no-op ⇒ 副本会退化成一圈**生硬的封面边**（比没有更丑），
    //   所以那种情况下整个阴影层直接不画。
    val supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    if ((alpha <= 0.004f && !preload) || !supported) return

    // ★ 裁剪：固定 `cornerRadius`，缩放由外层统一驱动 ⇒ 本体与阴影的视觉圆角恒同源同值。
    val clipModifier = Modifier.clip(RoundedCornerShape(cornerRadius))

    // ★★ 2026-11-06：**回到上游几何** —— 不做「冻结基准 + 外层缩放补偿」。
    //
    //   为什么必须去掉（真机取证，arc=81 把模糊半径放大 8 倍仍**完全看不见**）：
    //   补偿缩放壳是一层 `graphicsLayer{scale}` ⇒ 一个尺寸=父约束（封面边长）的
    //   离屏 RenderNode；而 blur 节点（`base + 2*pad`，比封面大一圈）是它的子节点。
    //   子节点画到 RenderNode 边界之外的部分，**在合成时被直接丢弃**
    //   ⇒ 整圈模糊溢出 100% 被裁掉，只剩被封面本体完全盖住的中心 ⇒ 立体感彻底消失。
    //   （这正是本文件 §「graphicsLayer{alpha} 不能挂最外层」同一条铁律。）
    //
    //   上游没有这层：blur 节点自己就是 `edge + 2*pad` 尺寸的 RenderEffect 层，
    //   `Unbounded` 让它把模糊画在自己的边界内 ⇒ 溢出完整可见。
    //
    //   ⚠ 转屏冻结（`baseEdge` / `freezeEligible`）因此失效：那是纯性能优化
    //     （省 ~1ms/帧），与「看得见立体感」冲突时以后者为准。
    val base = edge

    val blurRadius = base * MeloXArtworkShadowBlurRatio
    // blur 的渲染结果会被**裁到 blur 所在节点自身的边界**（RenderEffect 是 layer 级），
    // 所以承载 blur 的节点必须比本体大出 pad，否则溢出部分会被裁成硬边。
    val pad = blurRadius * MeloXArtworkShadowPadFactor

    // ★ 封面平均亮度（0=纯黑 1=纯白），由副本的 `onState` 异步采样写入。
    //   切歌时必须重置，否则会用上一张封面的亮度去压暗新封面。
    //   ⚠ 只以 `url` 为 key：`model` 是 `ImageRequest` 实例，转屏期尺寸快照逐帧变 ⇒
    //     `remember(model, url)` 会**每帧重置成 0f**（压暗量跟着抖），而这跟封面本身无关。
    var coverLuma by remember(bitmap) { mutableFloatStateOf(0f) }
    // ★ 亮度来源：[ArtworkDynamicPalette.luma]（封面软件位图的面积平均，与从 Coil 位图
    //   采样数学等价）。2026-11-06 按用户要求**回到上游口径**：压暗锚点 = 封面自身亮度，
    //   不再锚「封面背后的背景亮度」。
    //   ⚠ 不要改回 `onState` 里读 `result.image.bitmap`：Coil 交来的是 HARDWARE 位图，
    //     读像素要 `copy(ARGB_8888)` ⇒ 一次同步 GPU→CPU 回读（实测 12.7ms + 抢 RT 10.85ms）。
    val shadowContext = LocalContext.current
    LaunchedEffect(bitmap) {
        if (bitmap == null || bitmap.isRecycled) return@LaunchedEffect
        val palette = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Default) { ArtworkDynamicPaletteProvider.makePalette(bitmap) }
        if (abs(palette.luma - coverLuma) > 0.02f) coverLuma = palette.luma
    }
    // ★ 压暗 colorFilter 按值缓存（2026-10-15 性能排查）：
    //   `graphicsLayer` 的 lambda **每帧**都会执行，而压暗系数 `dim` 只随 `coverLuma`
    //   （切歌时异步写入，一首歌最多几跳）变化 ⇒ 每帧重建 `ColorMatrix`（FloatArray(20)）
    //   + `ColorFilter` 是纯浪费。dim 不变即复用**同一实例** ⇒ 零分配，数学逐值相同。
    val dimFilterCache = remember { MeloXDimColorFilterCache() }
    // 亮度 → 压暗系数（**上游口径**）：暗封面完全不压（保持「其他颜色还行」），
    // 白封面压到 [MeloXArtworkShadowWhiteDim] ⇒ 读成「影」而不是一圈发光白环。
    fun coverDimFactor(luma: Float): Float =
        1f - (1f - MeloXArtworkShadowWhiteDim) *
            smoothStep(luma, MeloXArtworkShadowDimStartLuma, MeloXArtworkShadowDimFullLuma)

    Box(
        modifier = Modifier
            // ★ 上游机制：承载层 `fillMaxSize()` 跟随封面 Box（cover Box 尺寸=封面边长），
            //   模糊节点 (`edge + 2*pad`) 比它大一圈的溢出由 `Unbounded` 画满自身层边界
            //   ⇒ 完整可见。视觉缩放/位移全部走 `transform`（与本体同一份）⇒ 严格跟随 morph。
            //   ⚠ 不要用 `requiredSize` 自定尺寸：那会脱离封面 Box、不再跟随，且 `edge` 在
            //     morph 期被实测布局边长扰乱 ⇒ 模糊层比封面大很多（用户复报，2026-11-06）。
            .fillMaxSize()
            .then(transform),
        contentAlignment = Alignment.Center,
    ) {
        // ★ 2026-11-06：上游结构 —— blur 节点自己就是最外层（尺寸 `edge + 2*pad`）。
        //   `Unbounded` 让模糊画满自己的层边界，溢出（pad）随后在父层完整可见。
        //   ⚠ 不要再往它外面套带 `graphicsLayer` 的壳：那会创建一层尺寸=封面边长的
        //     RenderNode，把 pad 那圈溢出裁掉（真机实测：整圈模糊会 100% 消失）。
        Box(
            modifier = Modifier
                .size(width = edge + pad * 2f, height = edge + pad * 2f)
                .blur(blurRadius, BlurredEdgeTreatment.Unbounded),
            contentAlignment = Alignment.Center,
        ) {
                // ★★ 2026-10-25（修「封面外圈光晕变黑」）：**回到自加载**。上一版改成复用本体
                //   传下来的 Coil `result.image.bitmap` —— 那是**池化位图**，被抽出来长期持有
                //   后会被回收 ⇒ 画出来是黑的。改回副层自己 AsyncImage：本层这份 painter
                //   持有的引用在显示期间有效。
                //   ⚠ 这段原注释写着「Coil 按 request 缓存命中同一份解码（与本体不重复算）」，
                //     2026-10-26 atrace 实测**该说法不成立** ⇒ 已按实测改写（见下条）。
                // ★★ 2026-11-06：**回到上游取图** —— 副层直接用本体同一个 `model`
                //   （同一个 Coil 请求，缓存命中，不另造 `ImageRequest`）。
                //   历史：2026-10-26 为省解码曾改成 384px 的独立请求；用户 2026-11-06
                //   反馈打开动画的立体模糊"效果不好"，而真机显影测试（模糊半径 ×8）
                //   却完全看不到这层 —— 独立请求是首要嫌疑，一并回退。
                ImmersiveArtwork(
                    bitmap = bitmap,
                    contentScale = ContentScale.Crop,
                    // ★★ 2026-10-26（修「预取后第一帧反而更长」）：**不再从这个位图采样亮度**。
                    //   Coil 交来的是 **HARDWARE** 位图（像素在 GPU 里），要读它必须
                    //   `copy(ARGB_8888)` ⇒ `RenderProxy#copyHWBitmapInto readback`：
                    //   一次**同步 GPU→CPU 回读**，实测 12.69ms，同时 RenderThread 侧
                    //   `copyImageInto` 再抢 10.85ms 同一块 GPU。而且这笔开销**与像素量无关**
                    //   —— 384×384 一样要 ~12ms（等一次 GPU 往返的固定代价）。
                    //   预取把封面提前到第一帧 Success 后，回读正好砸在点击帧上 ⇒
                    //   doFrame 16.3 → 26.1ms（比不预取还糟），这就是它的来源。
                    //   亮度改由 [ArtworkDynamicPalette.luma] 白送（同一张封面的软件位图，
                    //   面积平均 ⇒ 与原来 1216px 采样数学等价），见上方 `LaunchedEffect(url)`。
                    modifier = Modifier
                        // ★ 副本**原尺寸**，和本体一样大（源码里先缩到 20% 模糊、再放大 5 倍，
                        //   净尺寸不变 ⇒ `blurredImageView` 里那张图和本体同尺寸居中）。
                        //   ⛔ 别再乘任何 scale：缩到比本体小会被本体完全盖住 ⇒ 一点影都看不见。
                        // ★ 上游：副本与封面**同尺寸** `size(edge)`（preferred，居中于模糊节点）。
                        //   外层 `matchParentSize` 跟随封面，模糊节点 = `edge + 2*pad`，故 `size(edge)`
                        //   取满模糊节点 ⇒ 副本与封面严格同尺寸、随 morph 同步缩放。
                        .size(edge)
                        .graphicsLayer {
                            // ⚠ 这里**只放副本自身的 alpha**（强度），位移/缩放一律走外层
                            //   `transform` —— 与本体同一份 ⇒ 永远同步。
                            this.alpha = alpha * strengthScale()
                            // ★★ 2026-10-25：压暗系数 = 背景亮度 / 封面亮度（锚背景，不锚封面）。
                            //   背景是封面派生色时 ≈1 ⇒ 白封面出白环（AM 同色副本观感）；
                            //   背景远暗于封面时锚不动，退到下限 [MeloXArtworkShadowWhiteDim]
                            //   ⇒ 仍是「影」而不是眩光白环。取动画值避免就绪帧硬跳。
                            val dim = coverDimFactor(coverLuma)
                            if (dim < 0.999f) {
                                // ⚠ 只压亮度、**不降饱和**：RGB 同乘一个正数在 HSL 里只改 L、
                                //   不改 H/S ⇒ 色相与饱和度比例**天然完整保留**。
                                //   所以不需要饱和度矩阵（也不需要 `postConcat`/`timesAssign`，
                                //   纯对角阵一步到位）。上一版额外降饱和纯属多余，纯灰反而显脏。
                                // ★ 矩阵经 [MeloXDimColorFilterCache] 按 dim 缓存：dim 不变时
                                //   复用同一实例，不再每帧分配（零观感变化，见上方声明处）。
                                colorFilter = dimFilterCache.forDim(dim)
                            }
                        }
                        .then(clipModifier),
                )
        }
    }
}

/**
 * 压暗 colorFilter 的**按值缓存**（draw 期安全：纯字段读写，不触发重组/重绘调度）。
 *
 * 为什么需要：阴影副本的 `graphicsLayer` lambda 每帧执行，但压暗系数 `dim` 只随
 * 封面平均亮度（切歌时异步采样，一首歌最多几跳）变化。原实现每帧
 * `ColorMatrix()` + `ColorFilter.colorMatrix()` 各分配一次 —— 打开动画
 * 360ms × 120Hz ≈ 43 次无谓分配，且新实例还会让 RenderNode 每帧重设 paint。
 * 缓存后 dim 不变即复用同一实例：数学逐值相同 ⇒ **零观感变化**，纯省分配。
 *
 * ⚠ 之所以不走 `remember(dim)`：调用点在 `graphicsLayer` lambda（draw 期）里，
 *   不能调 composable API；且按值比较比按 key 重组更便宜（ dim 不变时连
 *   recomposition 都不触发）。
 */
private class MeloXDimColorFilterCache {
    private var key: Float = Float.NaN
    private var cached: ColorFilter? = null

    fun forDim(dim: Float): ColorFilter {
        val existing = cached
        if (existing != null && key == dim) return existing
        val created = ColorFilter.colorMatrix(
            ColorMatrix().apply { setToScale(dim, dim, dim, 1f) },
        )
        key = dim
        cached = created
        return created
    }
}

/**
 * 模糊半径 / 封面边长。
 *
 * 源码：`resized(0.2)` 后 `CIGaussianBlur(radius = 3)`，blur 半径作用在**0.2× 尺寸**的图上，
 * 放大 5 倍回到 1.4× 容器 ⇒ 等效到本体边长 = 3 / 0.2 / 1.4 ≈ **1.07%**。
 * 这里取 2.5%：比源码略大一点，让真机上"看得出有影"，但仍属于**窄边**。
 * ⛔ 别调大：AM 的观感是"极窄的一圈淡晕"，一旦放宽就变成明显的彩色光圈（前三版栽在这）。
 */
private const val MeloXArtworkShadowBlurRatio = 0.025f
/**
 * blur 承载节点的每边余量 = blur 半径 × 本系数。
 * RenderEffect 裁到自身 layer 边界 ⇒ 余量不足会把模糊溢出裁成硬边（v87 的教训）。
 */
private const val MeloXArtworkShadowPadFactor = 1.6f

/** 开始压暗的平均亮度（0~1）。低于此值完全不压（上游口径：暗封面保持原样）。 */
private const val MeloXArtworkShadowDimStartLuma = 0.55f
/** 压到满的亮度。白色封面 ≈0.92 ⇒ 完全落在这之上。 */
private const val MeloXArtworkShadowDimFullLuma = 0.88f

/**
 * **白封面的压暗系数**（1 = 不压，0.34 = 压到约三分之一亮度）。
 *
 * AM 的阴影是同色模糊副本且 `shadowAlpha = 1`（零 colorFilter），成立前提是
 * **AM 播放页背景是封面的浅色模糊版** ⇒ 白色副本融在同色浅背景里。MeloX 的背景
 * 一旦比封面暗，同一个副本在白色封面上就是一圈**发光的白环**（用户报障「一到白色
 * 就很碍眼」）⇒ 只对亮封面压暗，暗封面完全不压（保持「其他颜色还行」）。
 *
 * ⚠ 2026-11-06 按用户要求**回到上游口径**：压暗只看封面自身亮度，不再锚背景亮度。
 *   （2026-10-25 曾改成「背景亮度 / 封面亮度」，副作用是暗封面的立体感被压到几乎看不见。）
 */
private const val MeloXArtworkShadowWhiteDim = 0.34f

/**
 * 阴影副层的**解码边长**（px），2026-10-26。
 *
 * 副层只做 `blur(边长 × 2.5%)` 后当光晕用 —— 模糊半径是全尺寸封面的 2.5%，
 * 也就是**高频细节在渲染前就被整片抹掉**，源图分辨率再高也换不回一个像素的清晰度。
 * 但实测（atrace，暂停态切歌）：本体 1216×1216 解码 40.6ms、副层**另起一个线程再解一遍
 * 38.2ms**（Coil 没去重，两次 decode 时间戳几乎完全重叠），外加两张 5.9MB 的
 * `CreateImage` Vulkan 纹理 —— 全部白烧在一个"糊到看不清"的图层上。
 *
 * 384 ⇒ 面积是 1216 的 10%，解码落在 3~4ms，纹理 0.6MB。
 * ⚠ 不要再往上调：副层在屏幕上的边长是封面边长（≈1216px），放大 3.2× 全靠 GPU 双线性，
 *   而它**紧接着就被 blur**，放大引入的软化会被模糊吞掉，肉眼不可辨。
 */
private const val MeloXArtworkShadowDecodePx = 384

/**
 * ⋯ 菜单 / 音质浮层关断后，整屏背板捕获（`actionsBackdrop`）延迟摘除的 Grace 时长。
 *
 * 浮层退场动画（ModalBottomSheet / MeloXGlassDialog 自带 ~200-350ms 淡出+缩放）期间
 * 玻璃面板仍在采样这块背板 ⇒ 必须等退场画完再摘，否则退场中的玻璃会 sampled 到
 * 空背板（丢模糊、可见跳变）。
 */
private const val ACTIONS_BACKDROP_EXIT_GRACE_MS = 450L

/**
 * 切歌回弹的**起点缩放**（1 = 不弹）。
 *
 * 观感核算：起点 0.90、弹簧 ζ=0.42 ⇒ 过冲峰值 ≈ 1.023（幅度 10% 的行程上过冲 ~2.3%），
 * stiffness 480 ⇒ 收尾 ≈ 0.45s。想「更弹」就压低这个值或降 ζ（ζ 越小过冲越大），
 * **别动 stiffness**（只影响快慢）。
 */
private const val MeloXArtworkSwitchBounceScaleFrom = 0.90f
/** 回弹期封面的起点透明度：只用来把硬切磨柔，**不是**淡入淡出 ⇒ 取值不宜太低。 */
private const val MeloXArtworkSwitchBounceAlphaFrom = 0.55f
/** alpha 回到 1 所占的行程比例（越小越快恢复不透明）。 */
private const val MeloXArtworkSwitchBounceAlphaSpan = 0.4f
private const val MeloXArtworkSwitchBounceDamping = 0.42f
private const val MeloXArtworkSwitchBounceStiffness = 480f

/** 切歌回弹的「上一首」记录。**非 state**：写它不该触发重组。 */
private class ArtworkSwitchBounceSeen {
    var mediaId: String? = null
}

/** 横屏封面横滑的**跟手阻尼**（1 = 完全跟手；<1 让封面比手指慢一点，手感更"重"）。 */
private const val MeloXArtworkSwipeDamping = 0.55f
/** 横滑跟手位移的上限（封面最多被拖走多少）。 */
private val MeloXArtworkSwipeMaxDrag = 88.dp
/** 判定「切歌」的横滑阈值：低于它只回弹归位，不切歌。 */
private val MeloXArtworkSwipeThreshold = 44.dp
/** 双击判定窗口（ms）。 */
private const val MeloXArtworkDoubleTapTimeoutMillis = 320L

private fun meloXFlightHump(orientProgress: Float): Float =
    sin(PI * orientProgress.toDouble()).toFloat()

private class PortraitArtworkGeom {
    var size: androidx.compose.ui.unit.Dp = 0.dp
    var centerYFrac: Float = 0.5f
}


private fun lerpDp(start: androidx.compose.ui.unit.Dp, end: androidx.compose.ui.unit.Dp, fraction: Float) =
    start + (end - start) * fraction.coerceIn(0f, 1f)

private fun smoothStep(value: Float, start: Float, end: Float): Float {
    if (end <= start) return if (value >= end) 1f else 0f
    val t = ((value - start) / (end - start)).coerceIn(0f, 1f)
    return t * t * (3f - 2f * t)
}


@Composable
private fun ImmersiveArtwork(bitmap: android.graphics.Bitmap?, modifier: Modifier = Modifier, contentScale: ContentScale = ContentScale.Crop) {
    if (bitmap != null && !bitmap.isRecycled) Image(bitmap.asImageBitmap(), null, modifier, contentScale = contentScale)
    else Box(modifier.background(Color.White.copy(alpha = .08f)))
}
