@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package io.github.huleixin.tingyu.minimal.immersive.port
import android.os.Build
import android.os.SystemClock
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asAndroidPath
import androidx.compose.ui.graphics.asComposePath
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.font.FontFamily
import kotlin.math.sqrt
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.roundToLong

import io.github.huleixin.tingyu.minimal.immersive.MeloXPlaybackUiState
// SPDX-License-Identifier: GPL-3.0-only
// Adapted from lladlam/MeloX-Android 0.7.3, c04f36b9af540806b3bb185b347572e9ca12d87d.
// Tingyu modifications: shared command bus and timeline; independent permitted icons;
// no upstream playback, accounts, providers, database or Apple font resources.

internal const val MeloXNowPlayingControlsHeight = 279

/**
 * 超宽车机档专用：紧凑控件块高度 = 进度 52 + 间距 14 + 走带 70（[compact] = true）。
 * 去掉了竖屏档 / 平板档那条 42dp 音量条与 22dp 间距 —— 车机高度是瓶颈，控件块必须
 * 压到参考图那种「曲名 + 进度 + 走带」一条窄带，封面才放得下。
 * ⚠ 与 [MeloXIOSNowPlayingScene] 的左列高度预算共用这两个常量，改这里两端同步。
 */
internal const val MeloXCarHeadUnitControlsHeight = 136

/** 车机档 `ScenePageSelector` 一行 + 它前面的 3dp 间距（compact 行高 42dp）。 */
internal const val MeloXCarHeadUnitSelectorHeight = 45

/**
 * 播放器**场景内控件是否可交互**（暂停 / 上一首 / 下一首 / 音量条…）。
 *
 * 由 `MeloXIOSNowPlayingSharedHost` 在**展开/收起过渡进行中**提供 `false`。
 * 背景（2026-10-03 用户报障「下拉返回的缩小播放器里的按钮还是能被点击（如暂停、音量）」）：
 * 过渡期场景半可见地铺在屏幕上，这些控件**看着还在、且能点到**。
 * 根节点的 `pointerInput` 拦截器虽已改用 `PointerEventPass.Initial` 先吞事件，但
 * `Modifier.clickable` / `Slider` 对「已被消费的 down」在部分版本下仍会响应
 * ⇒ 这里再做一层**显式 enabled 门控**兜底，双保险。
 *
 * 默认 `true`：未提供时行为与原来完全一致。
 */
internal val LocalMeloXPlayerControlsEnabled =
    androidx.compose.runtime.compositionLocalOf { true }

@Composable
internal fun MeloXNowPlayingCoreControls(
    state: MeloXPlaybackUiState,
    page: MeloXNowPlayingPage,
    onPageSelected: (MeloXNowPlayingPage) -> Unit,
    onShowQuality: () -> Unit,
    showPageSelector: Boolean = true,
    compact: Boolean = false,
    /**
     * 是否对「喇叭 / AirPlay / 列表」三类字形使用高精度矢量重绘（2026-09-30 用户要求）。
     *
     * 默认跟随 [compact]：横屏(compact=true)与竖屏 iOS 都走矢量；Classic 场景不传
     * （compact 默认 false）⇒ 保留原 SF 字形，逐像素不变。竖屏 iOS 在调用处显式传
     * `useVectorGlyphs = true`，只换字形、不动布局尺寸。
     */
    useVectorGlyphs: Boolean = compact,
    /**
     * 进度条 / 音量条的**左右对称内缩**（dp）。
     *
     * 横屏封面页用：右列其它部件左缘一律与底部三键里最左那颗按钮齐平（基准 =
     * [MeloXCompactPageSelectorHPadding]，见 `MeloXIOSNowPlayingScene` 顶部契约），
     * 但这两条 bar **不许因此偏心** —— 左右同缩 ⇒ 左缘落到基准、中心仍与暂停键同轴
     * （暂停键在满宽走带行里居中；走带行本身不缩，否则暂停键会跟着偏）。
     * 与竖屏结构同理：竖屏两条 bar 也整体在 `padding(horizontal = 32.dp)` 里，
     * 左缘与选择器按钮的 32dp 留白同基准、且中心在容器中心。
     * 竖屏传默认 0.dp ⇒ 逐像素不变。
     */
    barsInset: Dp = 0.dp,
    /**
     * 超宽车机档（2026-11-07 H 轮）：把控件压成参考图那种**紧凑窄带** ——
     * 只保留进度 + 走带（+ 可选三键），跳过音量条与它的间距，并用
     * [MeloXCarHeadUnitControlsHeight] 定高。默认 false ⇒ 竖屏 / 平板 / Classic
     * 全部逐像素不变。
     */
    carHeadUnit: Boolean = false,
    selectorModifier: Modifier = Modifier,
    /**
     * 拖动进度条时向上层广播「预览位置」，供歌词面板在对应进度跟随滚动
     * （Apple Music 原版行为）。不传（null）则维持原行为，调用点（Classic / V2 / 横屏）
     * 都不受影响。
     */
    scrubPreviewState: MeloXScrubPreviewState? = null,
) {
    // 横屏布局把「歌词 / 播放设备 / 列表」三个按钮抽成常驻底栏，
    // 控制区本身只保留进度 + 走带 + 音量，高度相应收窄。
    val controlsHeight = when {
        carHeadUnit -> MeloXCarHeadUnitControlsHeight +
            if (showPageSelector) MeloXCarHeadUnitSelectorHeight else 0
        showPageSelector -> MeloXNowPlayingControlsHeight
        else -> MeloXNowPlayingControlsHeight - 53
    }
    val transportGap = if (compact) 14.dp else 19.dp
    val volumeGap = if (compact) 22.dp else 31.dp
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .height(controlsHeight.dp),
    ) {
        SceneProgressControl(
            state,
            onShowQuality,
            Modifier.padding(horizontal = barsInset),
            scrubPreviewState = scrubPreviewState,
            showQuality = false,
        )
        Spacer(Modifier.height(transportGap))
        SceneTransportControls(state, compact = compact)
        Box(Modifier.fillMaxWidth().height(if (compact) 22.dp else 31.dp), contentAlignment = Alignment.Center) {
            SceneQualityChip(state, onShowQuality)
        }
        // ★ 车机档跳过音量条：高度预算全让给封面（见 [MeloXCarHeadUnitControlsHeight]）。
        if (!carHeadUnit) {

            SceneVolumeControl(
                state,
                Modifier.padding(horizontal = barsInset),
                compact = compact,
                useVectorGlyphs = useVectorGlyphs,
            )
        }
        if (showPageSelector) {
            Spacer(Modifier.height(3.dp))
            ScenePageSelector(
                state = state,
                page = page,
                onPageSelected = onPageSelected,
                compact = compact,
                useVectorGlyphs = useVectorGlyphs,
                modifier = selectorModifier,
            )
        }
    }
}

/**
 * 进度条 / 音量条的**常态**粗细（唯一调参入口，2026-10-18 用户要求「同步增粗」）。
 *
 * ⚠ 两条必须同值 —— 只改一条就会出现「进度条 6dp、音量条 4dp」的粗细不一，
 *   并排放在同一屏上非常明显。旧值是 4dp，在 4x 屏（density=4）上偏细，
 *   与 iOS 那种厚实感的差距肉眼可辨。
 */
internal val MeloXMediaBarThickness = 6.dp

/**
 * 进度条 / 音量条在**拖动/擦洗中**的加粗值（两条共用）。
 * 保持「常态 6 → 拖动 8」的 +2dp 增量，与旧实现（4 → 6）比例一致。
 */
internal val MeloXMediaBarThicknessActive = 8.dp

/** Clock position between media-controller polls, clamped to the known duration. */
internal fun interpolatedPlaybackPositionMs(
    anchorPositionMs: Long,
    anchorRealtimeMs: Long,
    nowRealtimeMs: Long,
    durationMs: Long,
): Long {
    val elapsed = (nowRealtimeMs - anchorRealtimeMs).coerceAtLeast(0L)
    val projected = anchorPositionMs.coerceAtLeast(0L) + elapsed
    return if (durationMs > 0L) projected.coerceAtMost(durationMs) else projected
}

@Composable
internal fun SceneProgressControl(
    state: MeloXPlaybackUiState,
    onShowQuality: () -> Unit,
    modifier: Modifier = Modifier,
// 拖动进度条时向上层广播「预览位置」，供歌词面板在对应进度跟随滚动。
    scrubPreviewState: MeloXScrubPreviewState? = null,
    // ★ 2026-10-25 同步上游 0.7.0：上游新增的开关（USB/音频输出面板里传 false）。
    showQuality: Boolean = true,
) {
    val displayedDurationMs = state.durationMs
    var clockPositionMs by remember(state.mediaId, state.playback.epoch) { mutableLongStateOf(state.positionAtNow()) }
    LaunchedEffect(state.playback) {
        while (true) {
            clockPositionMs = state.positionAtNow()
            if (!state.isPlaying) break
            delay(100L)
        }
    }
    val animatedPositionMs = clockPositionMs
    val sourceProgress = if (displayedDurationMs > 0L) {
        (animatedPositionMs.toFloat() / displayedDurationMs.toFloat()).coerceIn(0f, 1f)
    } else {
        0f
    }
    var scrubbing by remember(state.mediaId) { mutableStateOf(false) }
    var localProgress by remember(state.mediaId) { mutableFloatStateOf(sourceProgress) }
    var scrubMediaId by remember(state.mediaId) { mutableStateOf<String?>(null) }
    var scrubDurationMs by remember(state.mediaId) { mutableLongStateOf(0L) }
    // ★ 统一「按压放大 + 相对拖动」：首次按下不跳值，拖动按相对位移增减。
    val sliderGesture = rememberMeloXRelativeSliderGesture()
    val trackHeight by animateDpAsState(
        targetValue = if (scrubbing) MeloXMediaBarThicknessActive else MeloXMediaBarThickness,
        animationSpec = tween(120),
        label = "scene-progress-track-height",
    )

    LaunchedEffect(sourceProgress, scrubbing) {
        if (!scrubbing) localProgress = sourceProgress
    }
    // A Slider gesture can be cancelled when the track changes or when the
    // player enters/exits a transition. Material3 does not always deliver
    // onValueChangeFinished after that cancel; without this reset `scrubbing`
    // stayed true forever and froze the bar at the last drag position.
    LaunchedEffect(state.mediaId) {
        scrubbing = false
        scrubMediaId = null
        sliderGesture.reset()
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .height(52.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Slider(
            enabled = LocalMeloXPlayerControlsEnabled.current && state.durationMs > 0,
            value = localProgress,
            onValueChange = { raw ->
                // 首次按下只锚定、返回 null ⇒ 进度绝不跳到手指位置。
                sliderGesture.onAbsoluteValue(raw, localProgress)?.let { v ->
                    if (!scrubbing) {
                        scrubMediaId = state.mediaId
                        scrubDurationMs = state.durationMs
                    }
                    scrubbing = true
                    localProgress = v.coerceIn(0f, 1f)
                    // 拖动时把预览位置广播给歌词面板，让歌词在对应进度跟随滚动。
                    scrubPreviewState?.update((state.durationMs * localProgress).roundToLong())
                }
            },
            onValueChangeFinished = {
                val end = sliderGesture.finish()
                // ★ 拖动 / 快速点按 / 只按住 三种收尾互斥分流：
                //   · dragged      ⇒ 提交拖动末值（原行为）
                //   · tapValue     ⇒ 快速点一下，松手时跳到该位置（与「按下不跳」共存）
                //   · 都不成立     ⇒ 按住超过点按窗口又没动，什么都不做（不触发无意义 seek）
                val tap = end.tapValue
                if (end.dragged) {
                    if (scrubMediaId == state.mediaId && scrubDurationMs > 0L) {
                        state.seekTo((scrubDurationMs * localProgress).roundToLong())
                    }
                    scrubbing = false
                    scrubMediaId = null
                    // 松手：清除预览，歌词恢复按播放进度跟随。
                    scrubPreviewState?.clear()
                } else if (tap != null && state.durationMs > 0L) {
                    localProgress = tap
                    state.seekTo((state.durationMs * tap).roundToLong())
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(20.dp)
                .meloXRelativeSliderPress(sliderGesture, enabled = LocalMeloXPlayerControlsEnabled.current && state.durationMs > 0),
            thumb = { Spacer(Modifier.size(0.dp)) },
            track = {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(trackHeight)
                        .clip(CircleShape)
                        .background(Color.White.copy(alpha = 0.20f)),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(localProgress)
                            .fillMaxHeight()
                            .background(Color.White.copy(alpha = 0.96f)),
                    )
                }
            },
        )

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(26.dp),
        ) {
            val shownPosition = if (scrubbing) {
                (state.durationMs * localProgress).roundToLong()
            } else {
                animatedPositionMs
            }
            Text(
                text = sceneFormatDuration(shownPosition),
                modifier = Modifier.align(Alignment.CenterStart),
                color = Color.White.copy(alpha = 0.50f),
                fontSize = 11.sp,
                fontFamily = androidx.compose.ui.text.font.FontFamily.Default,
                fontWeight = FontWeight.Medium,
            )

            if (showQuality && true) {
                SceneQualityChip(
                    state = state,
                    onShowQuality = onShowQuality,
                    modifier = Modifier.align(Alignment.Center),
                )
            }

            Text(
                text = "−${sceneFormatDuration((displayedDurationMs - shownPosition).coerceAtLeast(0L))}",
                modifier = Modifier.align(Alignment.CenterEnd),
                color = Color.White.copy(alpha = 0.50f),
                fontSize = 11.sp,
                fontFamily = androidx.compose.ui.text.font.FontFamily.Default,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

@Composable
private fun SceneTransportControls(
    state: MeloXPlaybackUiState,
    compact: Boolean = false,
) {
    val rowHeight = if (compact) 70.dp else 82.dp
    val buttonSize = if (compact) 52.dp else 64.dp
    val sideGlyph = if (compact) 28.dp else 34.dp
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(rowHeight),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Spacer(Modifier.weight(1f))
        SceneTransportButton(
            kind = SceneGlyphKind.Backward,
            visualSize = sideGlyph,
            size = buttonSize,
            onClick = {
                if (state.hasPrevious) state.previous() else state.seekTo(0L)
            },
        )
        Spacer(Modifier.weight(1f))
        ScenePlayPauseButton(state, compact = compact)
        Spacer(Modifier.weight(1f))
        SceneTransportButton(
            kind = SceneGlyphKind.Forward,
            visualSize = sideGlyph,
            size = buttonSize,
            onClick = state::next,
        )
        Spacer(Modifier.weight(1f))
    }
}

@Composable
private fun ScenePlayPauseButton(
    state: MeloXPlaybackUiState,
    compact: Boolean = false,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    // ★ 按压反馈：Apple 是「轻微内收」，不是弹跳。
    //   旧实现 `0.86f` + `DampingRatioMediumBouncy`(ζ=0.5) 会在松手后自己弹一条
    //   ~1.07 的正弦波；它和形变缩放是**相乘**关系 ⇒ 两条弹簧叠加 = 明显抖动，
    //   这是「不够丝滑」的第二个来源。改成小幅 + 过阻尼（ζ=1，无过冲）。
    //
    // ⚠ 2026-10-23：**故意不 `by` 解包**。解包就是在组合作用域读 `.value` ⇒ 整段
    //   按压/形变动画期间**每帧重组**这个按钮（连带 `SceneCupertinoGlyph` 的
    //   Canvas + Paint + 字形度量全重建）。保留 `State<Float>`、只在绘制相位读，
    //   动画全程零重组。同理见下面 `morph.scale`。
    val pressScale = animateFloatAsState(
        targetValue = if (pressed) 0.93f else 1f,
        animationSpec = spring(dampingRatio = 1f, stiffness = 1500f),
        label = "scene-play-pause-press",
    )
    val buttonSize = if (compact) 52.dp else 64.dp
    val glyphSize = if (compact) 40.dp else 48.dp

    // ★ 还原 Apple Music 播放/暂停形变：一次连续的「收缩 → 谷底换字 → 弹簧弹回」。
    //
    //   三条硬约束（数值验证得出，违反任意一条都会看出顿挫）：
    //   ① **收缩必须是一条曲线走到底**。旧实现拆成 1→0.5→0.16 两段 tween，
    //      而 (0.4,0,0.2,1) 这条 Material standard 曲线的**末速度恒为 0**
    //      （B'(1)=3(P3−P2)=(0,0)）⇒ 在 scale=0.5 处动画彻底停住、然后重新加速，
    //      谷底再停一次 ⇒ 一次 500ms 形变里塞进两次死停，观感就是「不丝滑」。
    //      现在换成末速度 ≠ 0 的曲线（末速 −2.1/s），全程单向、无中间站。
    //   ② **换字与缩放在同一帧**。旧实现在 tween 结束后才赋值改字形，而字形是
    //      普通 state、要等下一帧重组 ⇒ 换字比缩放晚一帧。现在改由动画 block
    //      在每帧回写时按当前 scale 触发，同帧生效。
    //   ③ **谷底不停顿**。弹簧 animateTo 默认继承上一段的末速度，掉头因此是
    //      连续的（实测最低点 0.215，不是先停到 0 再起步）。
    //
    //   实测（60fps 采样，115ms 收缩 + k=520 弹簧）：谷底 0.215@119ms →
    //   过冲峰 1.099@285ms → 2% 收敛于 369ms，与 prev/next 的节奏一致。
    // ★★ 2026-10-28：形变状态机已抽到 `MeloXTransportMotion.kt` 的
    //   [MeloXPlayPauseMorphController] —— **迷你栏的播放/暂停与这里共用同一份**
    //   （同一套时序、同一组 `SCENE_MORPH_*` 常数，见上方 ①②③ 三条硬约束），
    //   改一处两边一起变。本按钮只保留"自己的尺寸 / 颜色 / 按压"。
    val morph = rememberMeloXPlayPauseMorph(state.isPlaying)

    // ⚠ 2026-10-23：**不要** `by morph.scale.asState()`。
    //   在组合作用域读动画值 ⇒ 形变的每一帧都重组本按钮（连带 `SceneCupertinoGlyph`
    //   里的 Canvas / Paint / `getTextBounds` 全部重建），而按钮的绘制本身根本不需要
    //   重组 —— 这是「不够丝滑」的第一个来源。控制器把 `scale` 保留成 Animatable，
    //   只在下面的绘制相位读 `.value`。

    Box(
        modifier = Modifier
            .size(buttonSize)
            // ★ 2026-11-07（用户：「pause 放大回退时会被切掉」）：**不要**在这里 clip 圆形。
            //   形变回弹的弹簧会过冲到 ~1.099，字形按画布矩阵放大后墨迹探出这个固定
            //   `buttonSize` 的圆 ⇒ 过冲那一帧的暂停竖条上下外角 / 播放三角尖被裁掉。
            //   而这颗键 `indication = null`、又没有任何背景，clip 除了裁字形之外毫无作用。
            //   ⚠ 命中区由 `.size(buttonSize)` 决定，与 clip 无关 ⇒ 删掉不改变交互。
            .clickable(
                interactionSource = interaction,
                indication = null,
                // ⚠ 过渡期禁用（用户报障「缩小播放器里的暂停还能点」）。
                enabled = LocalMeloXPlayerControlsEnabled.current,
                onClick = {
                    morph.startMorphToggle()
                    state.togglePlayPause()
                },
            )
            // ★ 2026-10-23（用户：「缩小时他们的圆角偏小，不是原来的圆角数值」）：
            //   缩放**必须走绘制期画布变换**，不能走 `graphicsLayer`。
            //   `graphicsLayer{ scaleX/scaleY }` 是把**已经栅格化**的那一层位图降采样：
            //   SF 字形 `play.fill` / `pause.fill` 的倒角只有约 0.045 个字形宽，
            //   缩到谷底（0.22）时只剩 1~2px，再经双线性采样就被抹平成直角
            //   ⇒ 视觉上「圆角比原来的数值小」。
            //   而 `DrawScope.scale` 是**画布矩阵**：文本字形会按变换后的 device 尺寸
            //   重新做矢量光栅化，圆角严格 = 设计值 × scale，全程清晰，不会塌成直角。
            //   ⚠ 顺带把按压压缩也并进来（原来在 graphicsLayer 里）：
            //     两者相乘后一次性变换，避免「先位图缩 0.93 再位图缩 0.22」的两段采样。
            .drawWithContent {
                val s = pressScale.value * morph.scale.value
                if (s == 1f) drawContent() else scale(s) { this@drawWithContent.drawContent() }
            },
        contentAlignment = Alignment.Center,
    ) {
        SceneCupertinoGlyph(
            kind = if (morph.displayIsPlaying) SceneGlyphKind.Pause else SceneGlyphKind.Play,
            modifier = Modifier.size(glyphSize),
            color = Color.White,
        )
    }
}

@Composable
private fun SceneTransportButton(
    kind: SceneGlyphKind,
    visualSize: Dp,
    size: Dp = 64.dp,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    // ⚠ 必须保留 State 本身（不要 `by`）：按压缩放要在**绘制期**读（`graphicsLayer` 里
    //   `pressScale.value`）。用 `by` 会把值在**组合期**展开成 Float ⇒ 按压那 0.2s 里
    //   每帧重组整颗按钮，而它只影响一层 transform，白白多一整套 composition。
    val pressScale = animateFloatAsState(
        targetValue = if (pressed) 0.84f else 1f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = 620f,
        ),
        label = "scene-transport-press-${kind.name}",
    )
    val forward = kind == SceneGlyphKind.Forward
    val scope = rememberCoroutineScope()

    // ★★★ Apple Music 上一首/下一首动画 —— 2026-10-21 对参考视频（5658×1080 @30fps，
    //     390 帧，next 按钮墨迹 ROI x=3962..4442 / y=359..627 = 480×268，缝位实测在
    //     墨迹宽/2 = 240）逐帧取证后重建，下面每个数字都是量出来的，不是猜的。
    //
    // ① 字形真相（**推翻了我第一版"两三角镜像"的错判**）：
    //     `forward.fill` / `backward.fill` 是**两个完全同向的实心圆角三角**（» 两个都朝右、
    //     « 两个都朝左），左三角的尖正好顶在右三角的平边上 ⇒ 整幅就是一台"传送带"，
    //     沿跳过方向每次推进**一个三角的步距**（pitch = 墨迹宽/2，实测 240/480 = 0.5）。
    //     ⇒ 不需要任何"翻转"：后三角平移到隔壁槽、新三角在原槽长大，图案自动复原。
    //
    // ② 三元素的实测时序（sv = 弹簧位置 0→1，下表 t = 帧号/12，30fps 共 12 帧 ≈ 0.4s）：
    //       t=0.00  后三角 dx=0.08 pitch；前三角 scale≈0.65 且 alpha≈0.72（**边缩边淡**）
    //       t=0.08  后三角 dx=0.30；前三角 scale≈0.19 / alpha≈0.36；左下方冒出新三角 0.30
    //       t=0.17  后三角 dx=0.56；前三角已消失；新三角 0.56
    //       t=0.25  后三角 dx=0.81；新三角 0.81
    //       t=0.33  后三角 dx=0.97；新三角 0.98      ← 图案基本复原
    //       t=0.42  后三角 dx=1.08；新三角 1.10      ← 过冲
    //       t=0.50  后三角 dx=1.12；新三角 1.12      ← 过冲峰
    //       t=0.92  后三角 dx=1.00；新三角 1.00      ← 收敛
    //     ⇒ **后三角的 dx/pitch 与新三角的 scale 是同一条曲线**（逐帧误差 <0.03）⇒ 二者
    //       由同一个弹簧驱动即可，不必分两条时间轴。
    //
    // ③ 前三角的收缩锚点：实测 f=335 前三角右缘仍钉在 522（= 它自己的 apex）、左缘退到
    //    364 ⇒ **锚在 apex**（朝跳过方向的那个尖），不是锚中心。淡出与收缩同步。
    //
    // ④ 新三角的生长锚点：实测宽度 = 241·sv、且左缘基本钉在槽的左缘（平边）⇒ **锚在平边**。
    //
    // ⑤ 过冲是**弹簧本身**（后三角 dx 冲到 1.12 pitch、新三角 scale 冲到 1.12），不是额外的
    //    整体缩放 —— 峰值帧两三角仍是各自的大小，只是位置/尺寸各自过冲。
    // ⚠ `spec`（字体度量）现在由 `MeloXChevronConveyorGlyph` 内部按字号量取 —— 本按钮
    //   不再自己持有一份，避免与共享实现里那份量两遍（两遍参数相同，纯浪费）。
    val scroll = remember { Animatable(0f) }
    // ⚠ 不要在这里 `val sv by scroll.asState()` —— 那是**组合期**读动画值，`sv` 每帧变一次
    //   就重组一次整颗按钮（`Canvas` 的 draw lambda 也跟着换新对象，绘制命令每帧重录）。
    //   弹簧只有 0.4s 但挂着 120Hz，等于凭空多跑 48 次 composition；在播放页本来就只有
    //   28~49fps 的底噪上，这点成本正好落在**起手那几帧**，表现就是「点下去先顿一下」。
    //   改为在 `Canvas` 的绘制 lambda 里读 `scroll.value`：只 invalidate 重绘，不重组。

    // ⚠ 必须在 onClick()（= 换歌）**之前**启动：换歌会让上层重组，协程最多"被打断"，
    //   而不会"根本没开始"。
    var pulseJob by remember { mutableStateOf<kotlinx.coroutines.Job?>(null) }
    val triggerPulse: () -> Unit = {
        if (!MeloXSettingsRuntime.reduceMotion) {
            pulseJob?.cancel()
            pulseJob = scope.launch {
                try {
                    scroll.snapTo(0f)
                    scroll.animateTo(1f, SCENE_TRANSPORT_SPRING)
                    scroll.snapTo(0f)
                } catch (e: kotlinx.coroutines.CancellationException) {
                    throw e
                    // 被下一次点击 / 重组取消：下一拍会 snapTo(0) 重新起手，无需补救。
                }
            }
        }
    }

    Box(
        modifier = Modifier
            .size(size)
            .graphicsLayer {
                scaleX = pressScale.value
                scaleY = pressScale.value
            }
            .clip(CircleShape)
            .clickable(
                interactionSource = interaction,
                indication = null,
                // ⚠ 过渡期禁用（上一首 / 下一首）。
                enabled = LocalMeloXPlayerControlsEnabled.current,
                onClick = {
                    triggerPulse()
                    onClick()
                },
            ),
        contentAlignment = Alignment.Center,
    ) {
        // ★★ 2026-10-28：传送带字形已抽到 `MeloXTransportMotion.kt` 的
        //   [MeloXChevronConveyorGlyph] —— **迷你栏的「下一首」与这里共用同一份实现**
        //   （同一套字体度量 / 同一条 `SCENE_TRANSPORT_SPRING` / 逐字相同的 Apple 时序，
        //    上方 ①~⑤ 条实测注释与「传送带模型」的三元素都原样搬过去了）。
        //   本按钮只保留"自己的字号与颜色"：播放页 34.sp + 白色。
        MeloXChevronConveyorGlyph(
            forward = forward,
            color = Color.White,
            // 与 `SceneCupertinoGlyph` 里 Backward/Forward 分支的 34.sp **严格同值**
            // ⇒ 静止态（sv=0）与原静态字形逐像素相同。
            textSizeSp = 34.sp,
            // ★ 绘制期读动画值（唯一正确的读法）：在 draw 阶段被登记为快照依赖
            //   ⇒ 弹簧每帧变化只让那块 Canvas 重绘，不触发上层 composition。
            scrollProvider = { scroll.value },
            fallbackSymbol = if (forward) MeloXSymbol.Forward else MeloXSymbol.Backward,
            fallbackSize = visualSize,
        )
    }
}
/**
 * [SceneVolumeControl] 里那条"音量跟随弹簧"的物理状态：位置 / 速度。
 *
 * ⚠ 存在的唯一理由：这两个量**必须跨 `LaunchedEffect` 重启存活**。
 *   音量跟随动画的 effect key 里带了 `state.volume`，而实体音量键每来一格都会改它 ⇒
 *   effect 每次换档都重启一次。若把 pos/vel 写成 effect 的局部变量，重启即被重置
 *   （速度回到 0）⇒ 每换一档都要"先刹停、再起步" ⇒ 条就"一格一格一顿一顿"。
 *   放在这个对象里，前后相继的多个 effect 实例是在**同一个累加器**上继续推进，只前进不倒退。
 *
 * ⚠ 故意**不是** Compose state：pos/vel 是纯物理量，只在逐帧循环里被读写，
 *   不需要参与快照观察（否则每帧写一次速度就要多触发一次重组）。
 */
private class MeloXVolumeFollowState(start: Float) {
    /** 当前显示位置（0f..1f）。 */
    var position: Float = start

    /** 当前速度（单位/秒）。临界阻尼弹簧下这是**连续性**的载体，绝不能在换档时清零。 */
    var velocity: Float = 0f
}

/**
 * iOS 橡皮筋公式 `b = (1 − 1/(x·c/d + 1))·d` 里的 `c`（Apple / UIScrollView 取 **0.55**）。
 *
 * ⚠ 这里取 **1.1** 而不是 Apple 的 0.55，是为"4dp 细条 + 单按就要看得见"标定的（2026-10-07）。
 *   数值模拟（ω=16 / ζ=0.5 / release=200ms）下的单按峰值 `|position|` 与拉长量：
 *     c=0.7（Apple 量级）→ 0.48 ⇒ 6.2dp，单按几乎看不出"顶到墙"
 *     c=0.9 → 0.55 ⇒ 7.2dp｜**c=1.1 → 0.61 ⇒ 7.9dp（采用）**
 *     c=1.6 → 0.72 ⇒ 9.3dp（偏夸张，且长按时很快就顶满、丢掉"越推越硬"的渐进感）
 *   位移曲线（pull = 越界按次数，上限归一 1.0，c=1.1）：
 *     1 次 → 0.52 ｜ 2 → 0.69 ｜ 3 → 0.76 ｜ 5 → 0.85 ｜ 10 → 0.92 ｜ ∞ → 1.00（**永不到达**）
 *   ⇒ 仍是 iOS 那条"越推越硬但撞不到墙"的凹曲线，只是整体更陡、**第一下就有明确回应**。
 */
private const val IOS_RUBBER_BAND_C = 1.1f

/**
 * 抬手后延迟这么久才真正释放蓄力。
 *
 * ⚠⚠ **不能小于峰值到达时间**，否则"单按一格"根本看不见拉伸（2026-10-07 用户报障）。
 *   解析解实测：ω=16/ζ=0.5 下，从 0 冲到 target≈0.5 的**峰值出现在 ~217ms**；
 *   旧值 90ms 会在动作**爬升途中**就把 target 归零 ⇒ 观感是"顶了一下又缩回"，
 *   人眼判为"没动" ⇒ 表现为**只有一直按着（事件连发累积 pull）才看得出拉伸**。
 *   取 200ms 让峰值刚好落在释放前，单按可见时长 ~317ms（拉长 7.9dp / 变粗 3.1dp）。
 *   仍需**大于**连续快按时"抬起 → 再按下"的几十毫秒间隙，否则蓄力接不上、一抽一抽。
 */
private const val RELEASE_DELAY_MS = 200L

/**
 * 兜底释放：距上次音量键事件超过这么久还没等来 `onKeyUp`，就强制收回。
 *
 * ⚠ 必须大于**长按音量键的初始重复延迟**（系统约为 500ms，之后才每 50ms 连发），
 *   否则长按刚按下的头 0.5s 会被误判成"已抬手" ⇒ 条提前缩回再被连发推开，出现一抽。
 * ⚠ 存在的意义是防呆：万一某个 ROM 压根不投递 `onKeyUp`，条也绝不会永远卡在拉长态。
 */
private const val HOLD_FALLBACK_MS = 700L

/**
 * [SceneVolumeControl] 里"边界过冲拉长"（rubber band）的物理状态。
 *
 * `position`：0 = 常态；+1 = 向**上限侧**拉满（条向右长出去）；-1 = 向**下限侧**拉满（向左长出去）。
 *
 * ⚠ `position` 是 Compose state，这不是笔误 —— 它只在 [drawVolumeTrack] 的 `Canvas` lambda
 *   （**绘制阶段**）里被读，于是每帧只失效绘制层、**不触发重组**。
 *   ⛔⛔ 它**绝不能**在 composable 主体或 `Slider` 的 `track` **组合期插槽**里被读：
 *     那种 lambda 会被 Material3 `Slider` 缓存，绘制时执行的是上一次组合算好的常量
 *     ⇒ 拉伸量恒为首帧的 0（2026-10-07 v74 实测：条高全程 28px、max 处按 11 次宽度 Δ0）。
 *   `velocity` / `direction` 故意**不是** state：前者是纯物理量、只在帧循环里读写；
 *   后者虽是瞬时量，但**绘制期每帧都会重新读取**，不需要靠 state 通知。
 */
private class MeloXVolumeStretchState {
    var position by mutableFloatStateOf(0f)
    var velocity: Float = 0f
    var direction: Int = 1

    /**
     * **原始推力**（未做阻尼），每越界按一次 +1，抬手/超时归零。
     *
     * ⚠ 它和 [position] 的关系就是 iOS 橡皮筋公式（见调用点注释）：
     *   `位移 = pull·c / (1 + pull·c)` —— 凹函数 ⇒ **越推越硬、渐近逼近上限但永远撞不到墙**。
     *   旧实现是"固定冲量 + 硬夹到 1.0"，推两下就死死顶在满量程、速度还被清零，
     *   Apple 在 WWDC18 里把这种手感直接叫做 "hit a wall / feel broken"。
     */
    var pull: Float = 0f

    /** 抬手后的释放时刻（0 = 未排定）。用 `System.nanoTime()` 计，与 `withFrameNanos` 同源。 */
    var releaseAtNanos: Long = 0L

    /** 最近一次音量键事件的时刻：`onKeyUp` 万一不被某些 ROM 投递时，靠它超时兜底释放。 */
    var lastEventNanos: Long = 0L
}

/**
 * 边界"橡皮筋拉长"的**变形量**（单位：dp），在**绘制阶段**由 [drawVolumeTrack] 按 `s` 现算。
 *
 * ⚠⚠ 2026-10-07 用户报障「极限音量下再单点音量键也没有拉伸」——**根因是变形量算错了阶段**
 *   （v74 实测：条高全程恒定 28px、max 处按 11 次宽度 Δ0，而同期音量跟随动画完全正常）：
 *   旧实现把 `val s = abs(volumeStretch.position)` 和 `h`/`extra` 一起算在 Material3 `Slider`
 *   的 `track` **组合期**插槽里。但那个插槽产出的 lambda 会被 Slider **缓存**，绘制时执行的是
 *   「上一次组合算好的常量」⇒ `position` 每帧变化只失效绘制层，而绘制层读到的是**首帧的 0**
 *   ⇒ 拉伸量恒为 0，条永远不动。
 *   （诱因是 [MeloXVolumeStretchState.position] 的注释谎称"只在 graphicsLayer 里被读"——
 *     那是 v73 之前的实现；v74 换成 `Modifier.layout` 后读取点已变成组合期，注释没跟着改。）
 *
 *   ⇒ 正解：**绘制期现算**。`Canvas`/`drawBehind` 的 lambda 每帧重跑、在其中读 `position`
 *     只失效绘制层、不触发重组，同时每帧都能拿到最新位移。
 *
 * ⛔ 圆角必须**在绘制里自己算**（`drawRoundRect` + 半径 = 高/2），不要交给 `clip(CircleShape)`：
 *   任何非均匀缩放（`scaleX`）都会把 `CircleShape` 拉成椭圆（用户实测"圆角不对劲"），
 *   而 `CornerSize.toPx` 只返回**单一半径**、无法表达 X≠Y 的圆角 ⇒ 没有补偿 API 可走。
 *   直接按当前高度算半径 = 真正的胶囊端头，**与缩放完全无关**。
 */
private const val STRETCH_EXTRA_H = 5f
/** 边界拉长时单侧的外鼓量（dp）：`extra = s · STRETCH_EXTRA_W`。 */
private const val STRETCH_EXTRA_W = 13f

@Composable
private fun SceneVolumeControl(
    state: MeloXPlaybackUiState,
    modifier: Modifier = Modifier,
    // compact 仅决定音量条左右喇叭图标的**间距**（横屏 12dp / 竖屏 10dp）；
    // 图标盒尺寸**不再随 compact 变化**（恒为 12 / 15dp）——2026-11-03 修：横屏(compact=true)
    //   曾把喇叭盒放大到 18×24 / 36×24dp，部分机型（如 K20P 横屏走的是手机单栏路径，
    //   非双栏）音量条两侧按钮显得异常巨大；统一回退到竖屏档尺寸即可消除该观感差异。
    // useVectorGlyphs 决定喇叭是否走高精度矢量（左=无弧、右=三弧）。条体始终用**原材质**
    // （轨道 0.20 白 + 当前音量 0.82 白填充、无白边），按用户要求只加粗到与进度条相当(4dp)
    // 并去掉圆球 thumb，这一条对所有形态（竖屏 / 横屏 / Classic）全局一致。
    compact: Boolean = false,
    useVectorGlyphs: Boolean = false,
) {
    var dragging by remember { mutableStateOf(false) }
    // ★ 用于把松手时的系统音量回读丢出主线程（binder 不能挡 UI 帧）。
    val scope = rememberCoroutineScope()
    // ★ 拖动跟手值（连续量，直接来自手指位置，**不加任何动画**）。
    var dragVolume by remember { mutableFloatStateOf(state.volume) }
    // ★ 显示值 = **单一通道**（`dragVolume` 一个变量喂给 Slider）。
    //
    // ⚠⚠ 2026-10-07 用户报障「滑动音量条**偶尔**还会跳变」——根因在旧实现的这一行：
    //     `val shownVolume = if (dragging) dragVolume else easedVolume`
    //   它在**松手那一帧做了一次硬切换**：显示值从「手指的**连续**值」瞬间换成
    //   「`easedVolume` 的**量化**值」。
    //     · System 模式下系统音量是**离散档位**（maxVolume 通常 15 档 ⇒ 每格 ≈ 0.067），
    //       `changeVolume` 会把手指的连续值量化后再回写 `state.volume`；
    //     · 手指停在两档之间时，这一步瞬移最大 ≈ **6.7%** ⇒ 就是那次"跳变"；
    //     · Player 模式是连续量、无量化，永远不出现 ⇒ 也解释了为什么是"**偶尔**"。
    //   （旧注释里「松手时 easedVolume 早已收敛到 state.volume，故切回无跳变」这个推断
    //     是错的：收敛的目标本身就是量化值，跟手指位置差着最多半档。）
    //
    //   修法（已二次迭代，见下）：**不再分出第二条显示通道**，非拖拽期让 `dragVolume` 自己
    //   平滑追到 `state.volume`：
    //     · 拖拽期：`onValueChange` 直接写 `dragVolume`（1:1、零帧滞后，与原来完全一致）；
    //     · 松手：`dragging=false` 只是让下面这个 effect 重启，起点取的就是**手指松开时的
    //       当前值** ⇒ 从那里平滑滑到真实档位，**不存在切换、不可能跳**。
    //
    // ⚠⚠⚠ 2026-10-07 用户报障「**按系统音量键时音量条一格一格一顿一顿**」——
    //   根因就是上一版这里用的 `animate(..., tween(220, FastOutSlowInEasing))`：
    //     · `FastOutSlowInEasing` = cubic-bezier(0.4, 0, 0.2, 1)，**起始斜率为 0**（从静止加速）；
    //     · 音量键每来一格都会改 `state.volume` ⇒ 这个 LaunchedEffect 每格重启一次 ⇒ `animate`
    //       被取消、下一格又从**零速度**起手 ⇒ 每换一档都要「先刹停、再起步」；
    //     · 长按/连按音量键（约每 100ms 一格）时，条永远走不完一程就被打断 ⇒ 停-走-停-走，
    //       观感正是用户说的「一顿一顿」。单按一格时看着反而还行 ⇒ 也解释了这个现象只在
    //       **连续调节**时才明显。
    //   修法：把**速度本身也当作状态**（临界阻尼弹簧 ζ=1，逐帧积分）：
    //     · 换 target 时 `pos` 与 `vel` 都还在 ⇒ **速度连续**，不存在刹停 / 重新起步；
    //     · ζ=1 ⇒ 单调趋近、**无过冲**（不会越过档位再弹回来，也就不存在"弹一下再停"）；
    //     · 弹簧到位时长与距离无关 ⇒ 单按一格与长按连跳的手感一致；
    //     · 仍然只写 `dragVolume` 这一个通道，拖拽分支**一行没动**。
    //
    //   ⚠⚠ 关键细节：弹簧的 `position`/`velocity` 必须**跨 effect 重启存活**。
    //     `state.volume` 是下面 LaunchedEffect 的 key，音量键每来一格都会让 effect 重启一次；
    //     若把 pos/vel 放在 effect 的**局部变量**里，重启就得重新初始化 ⇒ 速度又被清零 ⇒
    //     等于原病没治。所以放到 [MeloXVolumeFollowState]（普通 class，**不是 Compose state**：
    //     这两个量是纯物理量、只被逐帧循环读写，不该参与快照观察，否则每帧多触发一次重组）。
    //     这样多个前后相继的 effect 实例是在**同一个累加器**上继续推进，只会前进、不会倒退。
    val volumeFollow = remember { MeloXVolumeFollowState(state.volume) }
    LaunchedEffect(state.volume, dragging) {
        // 拖拽期绝不介入：任何补间都会让条与手指脱节。
        if (dragging) {
            // 手指说了算：位置贴住手指、速度归零（松手时不该继承拖动前的残余速度）。
            volumeFollow.position = dragVolume
            volumeFollow.velocity = 0f
            return@LaunchedEffect
        }
        // ⚠ 非拖拽期 `dragVolume` 恒等于 `volumeFollow.position` ⇒ 这行是**幂等**的；
        //   真正起作用的只有「拖动 → 松手」那一帧：把起点对齐到**手指最后的位置**
        //   （拖拽期间 `state.volume` 只在跨格时变，手指停在格内时 position 会落后于手指）。
        //   速度已在拖拽分支清零，这里不动它。
        volumeFollow.position = dragVolume
        // ω = 30 rad/s ≈ Compose StiffnessHigh 一档。逐帧数值模拟（60Hz 半隐式欧拉、系统音量
        //   15 档 ⇒ 一格 6.7%）实测的取舍：
        //     ω=20：单格到位 383ms（到亚像素），长按 100ms/格时跟随滞后 0.48 格（约 9px/300px 条宽）；
        //     ω=30：单格到位 283ms，             长按跟随滞后 0.22 格（约 4px）；
        //     ω=40：单格到位 217ms，             跟随滞后 0.12 格 —— 已接近"跳"而不是"滑"。
        //   取 30：单格 ≈ 0.28s 的匀滑行程（贴近 iOS 音量 HUD 的约 0.25s），且长按连跳时
        //   只落后 1/5 格 ⇒ 既"丝滑"又不显拖沓。
        val omega = 30f
        var last = 0L
        while (true) {
            val now = withFrameNanos { it }
            // 每次进入循环的第一帧按 60Hz **名义步长**积分，两个坑一次避开：
            //   · 若改成"首帧 dt=0 直接跳过"⇒ 连按音量键时每格都白丢一帧，又会残留顿挫；
            //   · 若沿用上一轮迭代的陈旧时间戳 ⇒ 从静置被唤醒时 dt 会顶到 50ms 上限，
            //     一步就跨完一整格 = 肉眼可见的"弹一下"。（参数见下一条注释）
            val dt = if (last == 0L) 1f / 60f
            else ((now - last) / 1_000_000_000.0).toFloat().coerceAtMost(0.05f)
            last = now
            val target = state.volume
            // 临界阻尼弹簧（半隐式欧拉）：a = ω²(target − pos) − 2ω·vel
            //   dt 上限 50ms ⇒ ω·dt ≤ 1 < 2，是半隐式欧拉的稳定区，掉帧时不会发散。
            volumeFollow.velocity +=
                (omega * omega * (target - volumeFollow.position) - 2f * omega * volumeFollow.velocity) * dt
            volumeFollow.position += volumeFollow.velocity * dt
            // ⚠ 到位阈值按**亚像素**取：0.001 是全量程的 0.1%，条宽 300px 时只有 0.3px ⇒
            //   最后一帧"补齐吸附"是不可见的。**不要**再收紧到 1e-4 / 1e-3（旧值）：
            //   临界阻尼的尾段是 (1+ωt)e^{-ωt} 的双指数衰减，从 0.1% 收到 0.01% 要多跑
            //   约 180ms 的空转帧 —— 而 `withFrameNanos` 会持续申请新帧，白烧的帧循环会
            //   拖住刷新率（本项目 VRR 静置回落对这点很敏感）。
            if (abs(target - volumeFollow.position) < 1e-3f && abs(volumeFollow.velocity) < 1e-2f) {
                // 到位：吸附到精确档位并**退出循环**。
                // ⚠ 必须退出 —— `withFrameNanos` 会持续申请新帧，常驻循环会钉住刷新率
                //   （本项目 VRR 控制器对"静置回落"极敏感，绝不能让空转的帧循环续期）。
                volumeFollow.position = target
                volumeFollow.velocity = 0f
                dragVolume = target
                break
            }
            // 只写这一个显示通道；coerce 只作用于显示，物理量 pos 不夹（免得撞墙粘住）。
            dragVolume = volumeFollow.position.coerceIn(0f, 1f)
        }
    }
    val shownVolume = dragVolume

    // ══ 实体音量键通道（2026-10-07 用户：「物理音量键调节时播放页音量移动**还是**不平滑」）══
    //
    // 为什么弹簧修完还是不平滑：弹簧只解决"动画本身的顿挫"，**输入侧**还卡着一条 150ms 的延迟。
    //   · vivo 上硬件音量键不发 VOLUME_CHANGED_ACTION（本仓库 2026-10-06 实测）⇒ 播放页唯一
    //     的信息源是 `MeloXPlayerUi` 里那条 150ms 轮询 ⇒ 按键后条最多等 150ms 才起步
    //     ⇒ 观感就是"先顿一下、再滑一下"。
    //   · 实体按键事件是**同步**送到 Activity 的（`MainActivity.onKeyDown` → `MeloXVolumeKeyBridge`），
    //     用它把"该刷新了"推过来，这条延迟就从「≤150ms」压到「≈1 帧」。
    //   · 顺带拿到"越界按"（顶到最大/最小后继续按）：越界按在系统侧**不留痕迹**（音量值不变），
    //     轮询永远看不见它，只有实体按键事件能识别 ⇒ 这也是"过冲拉长"能做到的前提。
    val volumeStretch = remember { MeloXVolumeStretchState() }
    // 手指一碰本条，蓄力立刻作废：否则"顶到头拉长着"的时候去拖滑块，条会一直挂在拉长态
    //   （主 effect 的 key 只有 eventTick，拖拽开始并不会让它重启）。
    //   只清 pull 就够 —— 回弹循环下一帧看到 pull=0 就会把条送回常态并自行退出。
    LaunchedEffect(dragging) {
        if (dragging) {
            volumeStretch.pull = 0f
            volumeStretch.releaseAtNanos = 0L
            volumeStretch.lastEventNanos = 0L
            // ⚠ 必须把拉长位移也清掉：主 effect 在 `dragging` 时直接 return，不会跑回弹循环，
            //   若只清 pull 不复位 position，拖动时条会一直挂在拉长态（用户之前踩过）。
            volumeStretch.position = 0f
            volumeStretch.velocity = 0f
        }
    }
    // ⚠ key **只放 eventTick**，绝不能把 `dragging` 也放进来：
    //   松手那一帧 `dragging` 会 true→false，effect 跟着重启一次；此时若音量恰好停在端点，
    //   那次"并非按键引起"的重启就会被判成越界按 ⇒ 松手瞬间凭空拉长一下。
    //   `dragging` 在块内读即可 —— effect 重启时用的就是当次组合的最新值。
    LaunchedEffect(MeloXVolumeKeyBridge.eventTick) {
        if (MeloXVolumeKeyBridge.eventTick == 0) return@LaunchedEffect
        // ⚠⚠ `dragging` 自愈（2026-10-07 用户报障「极限过冲永无拉伸」的最终根因）：
        //   本地 `dragging` 只由 `onValueChangeFinished` 复位，而那只在**用户手指**抬起时触发。
        //   转场期 `LocalMeloXPlayerControlsEnabled=false` 会让 Slider 忽略手势、手势被父层
        //   （下拉收起）截断等情形下 `onValueChangeFinished` **根本不会来** ⇒ `dragging` 永久卡 true
        //   ⇒ ① 本effect 每拍都进不了越界分支；② `LaunchedEffect(state.volume, dragging)`
        //      也永远走"拖拽期"分支、停止跟随音量 ⇒ 表现为"整体都没有 AM 动效和交互"。
        //   既然收到实体音量键就说明用户没在拖这条 ⇒ 直接自愈复位。
        if (dragging) dragging = false
        // ⚠⚠ 同一记自愈**必须连 state 层那个一起做**（2026-10-18 用户报障「横屏按音量键条
        //   完全没反应」）：`MeloXPlaybackUiState.volumeDragging` 同样只由 `onValueChangeFinished`
        //   复位，一旦手势被取消就永久卡 true ⇒ `syncSystemVolumeNow()` 恒返回 false ⇒
        //   本 effect 下面那次「即时读」读不到新值、`atEnd` 也永远不成立（音量冻在中段）
        //   ⇒ 条既不跟随也不拉伸。收到实体按键就说明手指没在本条上 ⇒ 直接复位。
        //   （`syncSystemVolumeNow()` 内部另有活跃度窗口兜底，这里只是把恢复提前到这一帧。）
        state.endVolumeDrag()
        // 手指正在拖本条 ⇒ 按键交给系统，条不参与（避免与手指位置打架）。
        // ⚠⚠ 用「本次按键是否真的改变了音量」当唯一互斥判据，**不再**用本地 `dragging`：
        //   本地 `dragging` 只由 `onValueChangeFinished` 复位，而那只在**用户手指**抬起时触发；
        //   一旦因任何原因没复位（转场期禁用、手势被父层截断、页面重建…）它会**永久卡 true**，
        //   之后每次按键都在这里 return ⇒ "过冲拉伸永远不发生"（2026-10-07 实测定位）。
        //   而"音量值真的没动"本身就是越界的定义，天然覆盖了拖拽中（拖拽时音量由手指控制，
        //   按键的增删会被下一行的 `changed` 反映出来）。
        // ⚠ 也不因 `volumeControlMode` 提前 return：越界拉长是**纯视觉反馈**，
        //   与"音量写到系统还是播放器内部"无关（两种模式下音量键都会顶住）。
        //   真正需要 System 模式的地方是 `syncSystemVolumeNow()` 内部，它自己会判。

        val bridge = MeloXVolumeKeyBridge
        val dir = bridge.lastDirection
        if (bridge.lastWasRelease) {
            // ── 抬手：排定释放 ──────────────────────────────────────────────────
            //   不立即清零，而是延后 [RELEASE_DELAY_MS] 再释放：连续快按时
            //   "抬起 → 再按下"的间隙远小于这个值 ⇒ 蓄力能接上，不会一次一抽。
            volumeStretch.releaseAtNanos = System.nanoTime() + RELEASE_DELAY_MS * 1_000_000L
        } else {
            // ── 按下 ────────────────────────────────────────────────────────────
            // ① 即时读一次系统档位，把 150ms 轮询的延迟压到 ≈1 帧。
            //    音量键的真正处理在 system_server 的 `interceptKeyBeforeQueueing`，早于事件投递给 App
            //    ⇒ 这里读到的通常就是**调完之后**的值，无需任何乐观预测。
            //    ⚠ 这是一次主线程 binder，但**每次按键仅一次**（≈0.1ms）；被禁掉的是
            //      "拖动期每像素一次 binder"，两者量级完全不同，别混为一谈。
            //    ⚠ 再补读一次兜竞态：`AudioService.adjustStreamVolume` 是 **oneway** 调用
            //      （system_server 不等待落盘就返回），理论上存在"按键事件先到 App、音量还没生效"
            //      的窗口。少了这一步，普通按键会被误判成"越界按"而凭空拉长一下。
            var changed = state.syncSystemVolumeNow()
            if (!changed) {
                withFrameNanos { }
                withFrameNanos { }
                changed = state.syncSystemVolumeNow()
            }
            if (dir != 0) volumeStretch.direction = dir
            // ② 越界按 = 音量值**真的没动**（`!changed`）+ 而且**确实停在那一端**。
            //    越界按在系统侧不留痕迹（音量值不变），只能由实体按键事件识别 ——
            //    这正是必须走 `Activity.onKeyDown` 而不能靠轮询的原因。
            //    ⚠ 端点判据用**归一化后**的 `state.volume`（两种模式都是 0..1），
            //      不要写死 1e-3f 之外的余量：vivo 的 `STREAM_MUSIC` Max 是 150（不是 15），
            //      归一化后正好 1.0，端点命中。
            val atEnd = dir != 0 &&
                (if (dir > 0) state.volume >= 1f - 1e-3f else state.volume <= 1e-3f)
            // ⚠⚠ 长按自动重复**不再累加**蓄力（2026-10-07 用户报障「长按到极限会二次拉伸」）。
            //   `repeatCount > 0` = 同一根手指还没抬，系统在自动重复发 onKeyDown。
            //   iOS 语义是**一次手势 = 一次蓄力脉冲**，与系统重复几次无关；
            //   新的蓄力必须等手指真正抬起后再按下（`repeatCount == 0`）。
            //   ⇒ 这里既不累加、也不清零：保持当前蓄力，让条维持在同一拉伸量。
            val freshPress = bridge.isFreshPress
            if (!changed && atEnd) {
                if (freshPress) {
                    // 新的按压：蓄力**吃满**一整份（不是 +1），保证「单按一格就看得见拉伸」。
                    // 旧实现 `pull += 1f` 依赖"多次累加才够大"，而单按时 iOS 橡皮筋
                    // c=1.1 只给出 0.52target ⇒ 加上释放延迟，视觉上几乎等于没动。
                    volumeStretch.pull = 1f
                }
                // 长按重复：什么都不做（维持既有拉伸量）
            } else {
                // 音量真的动了 ⇒ 不再是"顶住"状态，取消蓄力，让条收回常态。
                volumeStretch.pull = 0f
            }
            // ⚠ 只有"新手势"才取消上一次抬手排定的释放；长按重复期间保持它，
            //   否则长按中途就会因release 超时而把条拉回去（视觉上闪一下）。
            if (freshPress) volumeStretch.releaseAtNanos = 0L
        }
        volumeStretch.lastEventNanos = System.nanoTime()

        // ── 弹性跟随 + 释放判定 ─────────────────────────────────────────────────
        // 跟随**解析解**推进（不是数值积分）：
        // ⚠ 这里绝不能用半隐式欧拉那套 —— 阻尼项 `2ζω·dt` 在 ω=16~18 时已达 0.3，
        //   每帧要削掉 30% 速度，数值阻尼会把幅度吃掉一大半、还会把过程压成硬跳。
        //   （实测：同一组参数半隐式欧拉算出的峰值只有 0.046 量程 ≈ 0.6dp，肉眼完全不可见，
        //     而解析解是 1.000 —— 这是算法问题，调参救不了。）
        // ⚠ 解析解还与**帧率无关**：60Hz / 120Hz 走同一条轨迹。
        // ★ 2026-10-07 用户报障：「原版的拉伸没有这种回弹弹簧」——
        //   旧实现 ζ=0.50 是**欠阻尼**，抬手回位时会越过 0 摆到反侧、再摆回来，
        //   视觉上就是「duang 一下」的多余振荡 —— 那是弹簧玩具，不是 iOS。
        //   iOS 橡皮筋回位是**单调收敛、不越界**：等价于**临界阻尼 ζ=1**。
        val omega = 18f
        val decay = omega                 // ζ=1 ⇒ ζω = ω
        var last = 0L
        while (true) {
            val now = withFrameNanos { it }
            val dt = if (last == 0L) 1f / 60f
            else ((now - last) / 1_000_000_000.0).toFloat().coerceAtMost(0.05f)
            last = now
            // 释放判定（两条路，任一生效即释放）：
            //   ① 抬手后过了 [RELEASE_DELAY_MS]；
            //   ② 兜底：距上次按键事件超过 [HOLD_FALLBACK_MS] 说明这个 ROM 可能压根不投递
            //      `onKeyUp` ⇒ 宁可提前收回，也不能让条永远卡在拉长态。
            if (volumeStretch.releaseAtNanos != 0L && now >= volumeStretch.releaseAtNanos) {
                volumeStretch.pull = 0f
                volumeStretch.releaseAtNanos = 0L
            }
            if (volumeStretch.lastEventNanos != 0L &&
                now - volumeStretch.lastEventNanos > HOLD_FALLBACK_MS * 1_000_000L
            ) {
                volumeStretch.pull = 0f
                volumeStretch.releaseAtNanos = 0L
            }
            // ★ iOS 橡皮筋（UIScrollView 自 iOS 6 起的官方公式，已归一到"上限 = 1"）：
            //     b = (1 − 1/(x·c/d + 1))·d        Apple 取 c = 0.55
            //   把 x 记作 pull、d 归一成 1，公式化简为 b = pull·c/(1 + pull·c)。
            //   ⚠ 这里用 [IOS_RUBBER_BAND_C]=1.1 而非 Apple 的 0.55 —— 见该常量注释：
            //     要保证「**单按一格**就看得见拉伸」，c 必须够大（详见 2026-10-07 模拟数据）。
            //   凹函数 ⇒ **越推越硬、渐近逼近上限但永远撞不到墙**：
            //     单按 → 0.52；连按 8 次 → 0.85；∞ → 1.00（永不到达）。
            val target = volumeStretch.direction * IOS_RUBBER_BAND_C * volumeStretch.pull /
                (1f + IOS_RUBBER_BAND_C * volumeStretch.pull)
            // 带目标位置的阻尼振子：x'' = −ω²(x − target) − 2ζω·x'
            //   令 y = x − target ⇒ y'' = −ω²y − 2ζω·y'（单帧内 target 视为常数，逐帧更新）
            //   ⛔ ζ=1（临界阻尼）专用解：y(t) = (y0 + (v0 + ω·y0)·t)·e^{−ωt}
            //     这是**单调收敛、绝不过冲**的唯一解析形式；
            //     欠阻尼那个 e^{−ζωt}(y·cos ωd t + B·sin ωd t) 在 ζ=1 时 ωd→0（除零），
            //     且它本身就是"会摆回去"的振荡解 —— 与 iOS 手感相反，⛔ 勿再改回。
            val y = volumeStretch.position - target
            val vel = volumeStretch.velocity
            val e = exp(-decay * dt)
            val b = vel + decay * y                       // = v0 + ω·y0（ω=ζω）
            val yNew = (y + b * dt) * e
            val vNew = (b - decay * (y + b * dt)) * e
            volumeStretch.position = target + yNew
            volumeStretch.velocity = vNew
            // 收干净就退出：`withFrameNanos` 会持续申请新帧，常驻循环会钉住刷新率
            //   （本项目 VRR 控制器对"静置回落"极敏感，绝不能让空转的帧循环续期）。
            if (volumeStretch.pull == 0f && volumeStretch.releaseAtNanos == 0L &&
                abs(yNew) < 0.01f && abs(vNew) < 0.08f
            ) {
                volumeStretch.position = 0f
                volumeStretch.velocity = 0f
                break
            }
        }
    }

    // ══ 音量条的"膨胀"（6dp → 8dp）══════════════════════════════════════════════
    //
    // ★ 2026-10-19 用户报障「**横屏**音量条**拖动**时不会膨胀」⇒ 两条根因，两条都堵：
    //
    //  ① **必须感知"手指按上来"**，不能只认 `dragging`。
    //     `dragging` 只由 `onValueChange` 置位；一旦 Slider 的手势被别处吃掉/取消（横屏封面页
    //     外面还挂着竖直 `draggable` 的收起手势、`LocalMeloXPlayerControlsEnabled` 转场期
    //     为 false、页面在 `AnimatedContent` 里刚重建…），`onValueChange` 可能一次都不来
    //     ⇒ 条既不跟手也不膨胀。改为在 Row 上**旁听**按下/抬起（Initial pass、不消费），
    //     只要手指落在音量区上，条就立刻膨胀 —— 这也是 iOS 的语义（碰到控制条就变粗）。
    //  ② **粗细必须在绘制期求值**，不能只在 `Slider` 的 `track` 插槽里读。
    //     Material3 会把 `track` 插槽的产出缓存，插槽里读到的量只在它那次组合时求值
    //     （同 `position` 的老坑，见 `drawVolumeTrack` 的 KDOC）⇒ 动画跑到 8dp、画面还是 6dp。
    //     改成把 0..1 的动画 State 传进 `Canvas`，在**绘制 lambda 里**读 ⇒ 每帧拿最新值，
    //     且只失效绘制层、不触发重组。
    var pressing by remember { mutableStateOf(false) }
    val controlsEnabled = LocalMeloXPlayerControlsEnabled.current && state.volumeAvailable
    // ★ 统一「按压放大 + 相对拖动」（与 SceneProgressControl 同一份交互状态）。
    val sliderGesture = rememberMeloXRelativeSliderGesture()
    val volumeActive = dragging || pressing
    // ★ 整行（滑块 + 左右两个喇叭）**共用一份**按压弹簧：以前只缩放中间的 Slider，
    //   两侧图标纹丝不动 ⇒ 用户报障「音量条的左右两个按钮不跟随的话好怪」。
    //   缩放层挂在 Row 上，三个子元素一起放大、相对间距同步 ⇒ 不会再出现一半大一半小。
    val pressScale = rememberMeloXSliderPressScale(volumeActive)
    val thicknessFraction = animateFloatAsState(
        targetValue = if (volumeActive) 1f else 0f,
        animationSpec = tween(120),
        label = "scene-volume-thickness",
    )

    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(42.dp)
            // ★ 音量区内的**竖直**拖拽必须在本层吃掉，不能冒泡到页面级「下拉收起」
            //   （2026-10-07 用户报障，完整根因见函数注释）。
            .meloXVolumeAreaBlocksPageCollapse()
            // ★ "手指按在音量区上" = 膨胀判据。只**旁听**（Initial pass、不消费任何事件）
            //   ⇒ Slider 照常拿手势、点击/拖动/无障碍全不受影响。
            //   ⚠ key 用 `controlsEnabled`：转场期控件禁用时不该膨胀，且 key 变化会让本
            //      协程重启 —— `finally` 会把 `pressing` 复位，不会卡住。
            .pointerInput(controlsEnabled) {
                if (!controlsEnabled) return@pointerInput
                try {
                    awaitPointerEventScope {
                        while (true) {
                            val down = awaitFirstDown(
                                requireUnconsumed = false,
                                pass = PointerEventPass.Initial,
                            )
                            // 整行都是「按下区」（含两侧喇叭）⇒ 由这一层统一锚定手势起点，
                            // Slider 内部不再重复监听（见下面 `.meloXSliderPressDetector` 的说明）。
                            sliderGesture.reset()
                            pressing = true
                            // 跟踪这根手指直到抬起/取消。
                            while (true) {
                                val event = awaitPointerEvent(PointerEventPass.Initial)
                                val change = event.changes.firstOrNull { it.id == down.id } ?: break
                                if (!change.pressed) break
                            }
                            pressing = false
                        }
                    }
                } finally {
                    // ⚠ `finally` 必须有：组合被取消 / key 变化时协程直接死掉，
                    //   没有它 `pressing` 会永久卡在 true（本项目踩过的布尔卡死坑）。
                    pressing = false
                }
            }
            // ★ 整行一体缩放（滑块 + 左右喇叭）：只改绘制、不动布局与命中测试，
            //   静息 s==1f 直接透传 ⇒ 静止态逐像素不变。
            .meloXSliderPressVisual(pressScale),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(if (compact) 12.dp else 10.dp),
    ) {
        SceneCupertinoGlyph(
            kind = SceneGlyphKind.SpeakerLow,
            useVectorGlyphs = useVectorGlyphs,
            // 喇叭盒尺寸恒定（12dp），不随 compact 放大——横屏 compact=true 时
            // 若放大到 18×24dp 会让音量条两侧按钮显得异常巨大（见本函数顶部注释）。
            modifier = Modifier.size(12.dp),
            color = Color.White.copy(alpha = 0.62f),
        )

        Slider(
            value = shownVolume,
            // ⚠ 过渡期禁用（用户报障「缩小播放器里的音量还能点/拖」）。
            enabled = LocalMeloXPlayerControlsEnabled.current && state.volumeAvailable,
            onValueChange = { raw ->
                // 首次按下只锚定、返回 null ⇒ 音量绝不跳到手指位置。
                sliderGesture.onAbsoluteValue(raw, shownVolume)?.let { v ->
                    // beginVolumeDrag：拖动期间抑制系统音量回灌（广播 + 轮询），
                    // 否则系统回读的**跳格**值会与手指**连续**位置打架 ⇒ 抽搐。
                    state.beginVolumeDrag()
                    dragging = true
                    dragVolume = v.coerceIn(0f, 1f)
                    state.changeVolume(dragVolume)
                }
            },
            onValueChangeFinished = {
                val end = sliderGesture.finish()
                val tap = end.tapValue
                when {
                    // 拖动结束：解除抑制，让轮询/广播重新接管（对齐到系统真实档位）。
                    end.dragged -> {
                        dragging = false
                        state.endVolumeDrag()
                        // 松手瞬间取一次权威值，让滑块精确落在真实系统档位上（不靠估算）。
                        // ⚠ 走 Dispatchers.Default 异步：这里是同步 binder（getStreamVolume），
                        //   跑在主线程会与拖动末帧抢时间 ⇒ 掉帧闪一下。
                        scope.launch(Dispatchers.Default) { state.syncSystemVolume() }
                    }
                    // ★ 快速点一下：直接跳到该音量（与「按下不跳、拖动相对」共存）。
                    //   `changeVolume` 内部自己处理档位量化与「只在跨格时下发」，
                    //   显示侧由下面那条跟随弹簧滑过去，不会瞬移。
                    tap != null -> state.changeVolume(tap.coerceIn(0f, 1f))
                    // 只按住又没动（超过点按窗口）：什么都不做，begin/end 严格成对。
                }
            },
            modifier = Modifier
                .weight(1f)
                .height(32.dp)
                // ⚠ 只旁听、不缩放：缩放已由外层 Row 统一负责，这里再缩放会叠成 1.21 倍。
                .meloXSliderPressDetector(sliderGesture, enabled = controlsEnabled),
            thumb = { Spacer(Modifier.size(0.dp)) },
            track = {
                // ⚠ 绘制节点必须比"最粗的条"**大出 STRETCH_EXTRA_H 的一圈**（上下各留一份），
                //   否则 `barH = baseH + 2·STRETCH_EXTRA_H·s` 会超出本节点边界 ⇒ 被父层裁掉
                //   ⇒ 又变成"拉伸量算对了但看不见"（v76 实测：条高恒定、Δ0）。
                // ★ 2026-10-19：高度改成**常量**（按最粗档取），不再跟着 `dragging` 动画
                //   —— 粗细改由绘制层读 [thicknessFraction] 现算（理由见上面那两条根因）。
                //   节点固定 18dp、条恒居中 ⇒ 变粗不会带动其它元素位移。
                Box(
                    modifier = Modifier
                        // ⚠⚠⚠ 这里**绝对不能**加 `padding(horizontal = STRETCH_EXTRA_W)`。
                        //   2026-10-07 连续两次踩坑：
                        //   ① 加了 padding（为了给拉伸留富余）→ 常态条被硬缩窄 2·13 = 26dp，
                        //      用户报障「AM 的音量条有这么短吗」；
                        //   ② 只在绘制侧把那份 13dp 补回来、padding 留着 → 整条**右移 13dp**，
                        //      用户报障「音量条偏右」。
                        //   正确解：**节点保持 Slider 全宽**（不 padding），富余靠"画到节点外"
                        //   实现 —— 纵向富余必须留（画高会被裁），横向不需要：Canvas / Slider
                        //   都不裁剪超出自身边界的绘制（拉伸一直是这样工作的，见下）。
                        //   常态 `s=0` ⇒ 条 = [0, 节点全宽] = Slider 全宽，与 AM 一致。
                        .fillMaxWidth()
                        .height(MeloXMediaBarThicknessActive + STRETCH_EXTRA_H.dp * 2f),
                    contentAlignment = Alignment.Center,
                ) {
                    Canvas(modifier = Modifier.fillMaxSize()) {
                        // ⚠ 在**绘制 lambda 里**读动画 State（不是组合期）：
                        //   `track` 插槽会被 Slider 缓存，组合期读到的粗细会冻住
                        //   ⇒ 动画跑到 8dp、画面还停在 6dp（用户报的"拖动不膨胀"）。
                        val normalPx = MeloXMediaBarThickness.toPx()
                        val activePx = MeloXMediaBarThicknessActive.toPx()
                        val baseH = normalPx + (activePx - normalPx) * thicknessFraction.value
                        drawVolumeTrack(
                            position = volumeStretch.position,
                            direction = volumeStretch.direction,
                            fillFraction = shownVolume,
                            baseH = baseH,
                            extraH = STRETCH_EXTRA_H.dp,
                            extraW = STRETCH_EXTRA_W.dp,
                        )
                    }
                }
            },
        )

        SceneCupertinoGlyph(
            kind = SceneGlyphKind.SpeakerHigh,
            useVectorGlyphs = useVectorGlyphs,
            // 喇叭盒尺寸恒定（15dp），不随 compact 放大——与左侧 SpeakerLow 同口径。
            modifier = Modifier.size(15.dp),
            color = Color.White.copy(alpha = 0.62f),
        )
    }
}

/**
 * 画音量条本体（轨道底色 + 已填充段），**在绘制阶段**按 [position] 现算"过冲拉伸"的变形。
 *
 * ★ 为什么必须放在绘制阶段（而不是 `Slider` 的 `track` 组合插槽里）：
 *   Material3 `Slider` 会把 `track` 插槽产出的 lambda **缓存**；写在插槽里的量只在
 *   **组合期**求值一次，绘制时用的是那次的结果。`position` 是每帧变化的 state，
 *   在组合期读它 ⇒ 拿到的是**首帧的 0** ⇒ 拉伸永远不发生（v74 实测：条高恒定 28px、
 *   max 处连按 11 次宽度 Δ0）。放进 `Canvas` 的绘制 lambda 后每帧重跑、每帧拿最新值，
 *   且只失效绘制层、不触发重组。
 *
 * ★ 圆角为什么自己算：半径直接取 `高/2`（胶囊形），**与任何缩放无关** ⇒ 永远真圆。
 *   走 `clip(CircleShape)` + 非均匀 `scaleX` 会被拉成椭圆（用户实测"圆角不对劲"），
 *   而 `CornerSize.toPx` 只返回单一半径、无法表达 X≠Y 的圆角，没有补偿 API。
 *
 * @param position 拉伸位移（0=常态，±1=拉满），由橡皮筋公式 damped 得到。
 * @param direction ≥0 顶上限（向右长出去）、<0 顶下限（向左长出去）。
 * @param fillFraction 已填充比例（0..1，单通道显示值）。
 * @param baseH 常态条高（px）。**由调用点在绘制 lambda 内现算**（含拖动膨胀 6→8dp 的插值），
 *   不能再从 `size.height` 反推 —— 布局尺寸会被 `Slider` 的插槽缓存冻住。
 * @param extraH 拉满时的**额外高度**（dp）。
 * @param extraW 拉满时单侧的**额外宽度**（dp）。
 */
private fun DrawScope.drawVolumeTrack(
    position: Float,
    direction: Int,
    fillFraction: Float,
    baseH: Float,
    extraH: Dp,
    extraW: Dp,
) {
    val s = abs(position)
    // 常态高度由**调用点在绘制 lambda 里**算好传进来（含拖动膨胀的 6→8dp 插值）。
    //   ⚠ 不要改回 `size.height - 2·extraH`：那样粗细只能跟着**布局**走，
    //     而 `Slider` 的 `track` 插槽产出会被缓存 ⇒ 拖动时粗细永远停在首帧的 6dp。
    val barBaseH = baseH.coerceAtLeast(1f)
    val extraHPx = extraH.toPx() * s
    val extraWPx = extraW.toPx() * s
    // 变粗：以**中心**为轴上下对称增厚（不改变行的中心线，避免与喇叭图标错位）。
    val barH = barBaseH + extraHPx
    val top = (size.height - barH) / 2f
    val radius = CornerRadius(barH / 2f, barH / 2f)
    // 变长：整条（含底色）单侧外鼓；顶上限向右、顶下限向左。
    //   ⚠⚠⚠ 2026-10-07 连续两次踩坑，务必读注释再改：
    //   ① 调用点**不能**加 `padding(horizontal = STRETCH_EXTRA_W)` 来"留富余"——
    //      常态下那条 padding 生效 ⇒ 条被缩窄 26dp（「AM 的音量条有这么短吗」）。
    //   ② 也**不能**在绘制侧把 padding 补回来（`left = slackW`）——
    //      节点已经窄了 26dp，再右移 13dp 只会让整条偏右（「音量条偏右」）。
    //   ⇒ 正解：节点宽 = Slider 全宽（不padding）；拉伸时单侧外鼓到**节点之外**，
    //      Canvas 与 Slider 都不裁剪越界绘制（纵向同理：上面那圈 extraH 只是布局富余）。
    val left = if (direction >= 0) 0f else -extraWPx
    val totalW = size.width + extraWPx
    // ① 轨道底色（整条拉伸后的胶囊）
    drawRoundRect(
        color = Color.White.copy(alpha = 0.20f),
        topLeft = Offset(left, top),
        size = Size(totalW, barH),
        cornerRadius = radius,
    )
    // ② 已填充段：宽度按同一比例缩放（拉伸时填充也一起变长），左端与底色同侧对齐。
    //   ⚠⚠ 右端**方角**（2026-10-07 用户报障：「白色音量条右边有圆角，
    //   非最大音量时不应该圆」）：iOS/AM 的音量条只有**左端**是半圆（起点），
    //   右端随填充量推进是**平切口**；只有**满格**（fill ≥ 0.999）时右端才变成半圆，
    //   整条成为完整胶囊。实现见下面：非满格走**每角独立半径的单一子路径**。
    val frac = fillFraction.coerceIn(0f, 1f)
    val fillW = (totalW * frac).coerceAtLeast(0f)
    if (fillW > 0f) {
        if (frac >= 0.999f) {
            // 满格：整条胶囊（两端半圆）
            drawRoundRect(
                color = Color.White.copy(alpha = 0.82f),
                topLeft = Offset(left, top),
                size = Size(fillW, barH),
                cornerRadius = radius,
            )
        } else {
            // 非满格：**单个子路径、一次 draw**，左端两角圆、右端两角方。
            // ⚠⚠⚠ 两轮踩坑（2026-10-07，勿退回旧写法）：
            //   ① 分两次 draw（右侧 `drawRect(left+r…)` + 左端 `drawRoundRect(…, 2r)`）
            //      → 两者在 `[left+r, left+2r]` **互压**；填充是 alpha=0.82 的半透明白，
            //      叠一次 0.82、叠两次 `1−(1−0.82)²≈0.97` ⇒ 左端「比白色还白的白斑」。
            //   ② 改成「左圆头子路径 + 右侧 `addRect` 子路径」拼一次 draw 后，两段仍是
            //      **两个子路径**，接缝处抗锯齿各画半边 ⇒ 裂成「一个圆点 + 一段矩形条」。
            //   ⇒ 正解只有一个：**一个子路径 + 每角独立半径**（右=0、左=r）。
            val r2 = minOf(barH / 2f, fillW / 2f)
            val path = Path().apply {
                addRoundRect(
                    RoundRect(
                        rect = Rect(left, top, left + fillW, top + barH),
                        topLeft = CornerRadius(r2, r2),
                        topRight = CornerRadius.Zero,
                        bottomRight = CornerRadius.Zero,
                        bottomLeft = CornerRadius(r2, r2),
                    ),
                )
            }
            drawPath(path, Color.White.copy(alpha = 0.82f))
        }
    }
}

/**
 * ★★ 2026-10-07 用户报障：「播放页音量调节的**上下**区域会触发下滑收起播放页」。
 *
 * 根因是**这次手势没人接**：
 *   ① 音量条本身是**水平** `Slider`（`draggable(orientation = Horizontal)`），对竖直位移
 *      一概不消费；而 Row 高 42dp、Slider 只有 32dp ⇒ 条体**正上方 / 正下方各 5dp**
 *      纯属空白，连 Slider 的命中区都进不去。
 *   ② 整页「下拉收起」的 `draggable(orientation = Vertical)` 挂在**高得多的祖先**上
 *      （`MeloXIOSNowPlayingSharedHost` 的全屏 Box —— 该处注释写的是「竖屏保留整屏下拉收起」）。
 *   ⇒ 手指在这片区域**竖着**划时，位移无人消费，一路冒泡到那个祖先，播放页被收起。
 *
 * 修法：在音量控件这一层就把**竖直**拖拽吃掉，让页面级手势收不到。
 *   ① **不消费 down** —— Slider 要靠 down 才进入拖拽 / 点按设值，吞了它整条就废了。
 *   ② **只消费「已判定为竖直」之后的位移**；且一旦发现这次手势已被**更深的节点**接管
 *      （`isConsumed`，即水平 Slider 已经吃掉位移）就立刻让位 ⇒ 水平调音量逐像素不变。
 *   ③ 本节点是页面级 `draggable` 的**后代**，而 `Main` pass 的派发顺序是**叶 → 根**
 *      （见 `MeloXIOSNowPlayingSharedHost` 里对 `Initial` / `Main` 方向的论述）⇒ 这里先
 *      消费，上层那台 `draggable` 的 slop 判定随即作废，下拉收起根本不会启动。
 *
 * ⚠ 判据用「竖向位移 > touchSlop **且** 竖向 > 横向」，与系统 Slider 的取向锁定同义：
 *   用户想横划调音量时横向占优 ⇒ 本函数永不介入。
 * ⚠ 这不是「干掉下拉手势」——它只覆盖音量控件这一条 42dp 的区域；页面其余部分
 *   （封面 / 空白）照旧下拉即收起。
 */
private fun Modifier.meloXVolumeAreaBlocksPageCollapse(): Modifier = this.pointerInput(Unit) {
    // ⚠ touchSlop 在 PointerInputScope 上取（`AwaitPointerEventScope` 未必暴露它）。
    val slop = viewConfiguration.touchSlop
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false)
        var engaged = false
        while (true) {
            val event = awaitPointerEvent(PointerEventPass.Main)
            val change = event.changes.firstOrNull { it.id == down.id } ?: break
            // 更深的子节点（水平 Slider）已经接管这次手势 ⇒ 让位，一个位移都不消费。
            if (change.isConsumed) return@awaitEachGesture
            if (!engaged) {
                val dy = change.position.y - down.position.y
                val dx = change.position.x - down.position.x
                if (abs(dy) > slop && abs(dy) > abs(dx)) engaged = true
            }
            if (engaged) change.consume()
            if (!change.pressed) break
        }
    }
}

/**
 * 横屏底栏三键（[ScenePageSelector] 的 `compact` 形态）的左右留白。
 *
 * ★ 这一份同时是**横屏右列其它部件的左缘基准**（2026-09-30 用户要求）：除三键外的部件
 *   （曲名栏 / 歌词 / 队列）左缘一律与三键里**最左那颗按钮的左缘**齐平 —— 也就是选中态
 *   那圈圆形底板的左缘。派生差值见 `MeloXIOSNowPlayingScene` 的
 *   `MeloXLandscapeLyricsStartInset`。调用点不要再写死 18.dp。
 */
internal val MeloXCompactPageSelectorHPadding = 18.dp


@Composable
private fun SceneQualityChip(state: MeloXPlaybackUiState, onShowQuality: () -> Unit, modifier: Modifier = Modifier) {
    val label = state.qualityLabel
    if (label.isNotBlank()) Text(label, modifier.clickable(onClick = onShowQuality).padding(horizontal = 12.dp, vertical = 4.dp),
        color = Color.White.copy(alpha = .72f), fontSize = 11.sp, fontWeight = FontWeight.Medium)
}
