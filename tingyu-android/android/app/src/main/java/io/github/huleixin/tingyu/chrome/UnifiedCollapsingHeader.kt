package io.github.huleixin.tingyu.chrome

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.util.lerp
import kotlinx.coroutines.flow.distinctUntilChanged

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/UnifiedCollapsingHeader.kt
// 四个一级页面（推荐、资料库、搜索、设置）共享的统一折叠顶部栏系统与平台筛选栏。

internal object UnifiedHeaderTokens {
    val HorizontalPadding = 20.dp
    val ExpandedTopPadding = 12.dp
    val TitleExpandedSp = 32f
    val TitleCollapsedSp = 22f
    val SubtitleSp = 13.sp
    val SubtitleGap = 6.dp
    val HeaderIconSize = 22.dp
    val HeaderTouchSize = 48.dp
    val PlatformBarHeight = 48.dp
    val PlatformVisualHeight = 44.dp
    val PlatformPillHeight = 36.dp
    val PlatformPillPaddingH = 14.dp
    val PlatformPillGap = 8.dp
    val SnapDurationMs = 200
    val SnapEasing = CubicBezierEasing(0.2f, 0f, 0f, 1f)
}

/**
 * 监听 LazyListState 的真实滚动偏移量，计算连续折叠进度 [0f, 1f]，
 * 并在手势结束后以 200ms cubic-bezier(0.2, 0, 0, 1) 自动吸附（短列表不强制吸附）。
 */
@Composable
internal fun rememberCollapsingProgress(
    listState: LazyListState,
    collapseRangeDp: Dp,
    reducedMotion: Boolean = false,
): State<Float> {
    val density = LocalDensity.current
    val rangePx = with(density) { collapseRangeDp.toPx() }.coerceAtLeast(1f)
    val progress = remember(listState, rangePx) {
        derivedStateOf {
            when {
                listState.firstVisibleItemIndex > 0 -> 1f
                else -> (listState.firstVisibleItemScrollOffset / rangePx).coerceIn(0f, 1f)
            }
        }
    }

    LaunchedEffect(listState, rangePx, reducedMotion) {
        var wasScrolling = false
        var lastIndex = 0
        var lastOffset = 0
        var scrollingUp = true
        snapshotFlow {
            Triple(
                listState.isScrollInProgress,
                listState.firstVisibleItemIndex,
                listState.firstVisibleItemScrollOffset
            )
        }.distinctUntilChanged().collect { (scrolling, idx, offset) ->
            if (scrolling) {
                if (idx != lastIndex) scrollingUp = idx > lastIndex
                else if (offset != lastOffset) scrollingUp = offset > lastOffset
                lastIndex = idx
                lastOffset = offset
                wasScrolling = true
            } else if (wasScrolling) {
                wasScrolling = false
                if (idx == 0 && offset > 0 && offset < rangePx) {
                    val p = offset / rangePx
                    // 仅当后续内容足以支撑折叠状态时才向 1f 吸附，避免短列表跳动
                    val canCollapse = listState.canScrollForward || p < 0.5f
                    val target = if (canCollapse && (p >= 0.5f || (scrollingUp && p > 0.35f))) rangePx else 0f
                    val delta = target - offset
                    if (kotlin.math.abs(delta) > 2f) {
                        val anim = Animatable(offset.toFloat())
                        var prev = offset.toFloat()
                        anim.animateTo(
                            targetValue = target,
                            animationSpec = tween(
                                durationMillis = if (reducedMotion) 0 else UnifiedHeaderTokens.SnapDurationMs,
                                easing = UnifiedHeaderTokens.SnapEasing
                            )
                        ) {
                            val step = value - prev
                            prev = value
                            listState.dispatchRawDelta(step)
                        }
                    }
                }
            }
        }
    }
    return progress
}

@Composable
internal fun UnifiedHeaderIconButton(
    description: String,
    icon: String,
    tint: Color,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Box(
        Modifier
            .size(UnifiedHeaderTokens.HeaderTouchSize)
            .clip(RoundedCornerShape(24.dp))
            .clickable(
                enabled = enabled,
                role = Role.Button,
                onClick = onClick
            )
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center
    ) {
        PageIcon(icon, tint, Modifier.size(UnifiedHeaderTokens.HeaderIconSize))
    }
}

@Composable
internal fun CompactPlatformDropdown(
    section: NativePageSection,
    alpha: Float,
    action: PageAction,
) {
    if (alpha <= 0.02f || section.items.isEmpty()) return
    var open by remember { mutableStateOf(false) }
    val selected = section.items.firstOrNull { it.selected } ?: section.items.first()
    val interactive = alpha >= 0.5f
    Box(Modifier.graphicsLayer { this.alpha = alpha }) {
        Row(
            Modifier
                .heightIn(min = 36.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(LocalInterfacePalette.current.subtle.copy(alpha = 0.85f))
                .then(
                    if (interactive) Modifier.clickable(role = Role.Button) { open = true }
                    else Modifier
                )
                .padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(
                selected.title,
                color = PageInk,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            PageIcon("chevron-down", PageMuted, Modifier.size(14.dp))
        }
        LiquidDropdown(expanded = open && interactive, onDismissRequest = { open = false }) {
            val menuInk = LocalInterfacePalette.current.menuInk
            val menuAccent = LocalInterfacePalette.current.accent
            section.items.forEach { item ->
                DropdownMenuItem(
                    text = {
                        Text(
                            item.title,
                            color = if (item.selected) menuAccent else menuInk,
                            fontSize = 14.sp,
                            fontWeight = if (item.selected) FontWeight.SemiBold else FontWeight.Normal
                        )
                    },
                    enabled = !item.disabled,
                    trailingIcon = if (item.selected) {
                        { PageIcon("check", menuAccent, Modifier.size(16.dp)) }
                    } else null,
                    onClick = {
                        open = false
                        action(item.action, "", 0.0)
                    }
                )
            }
        }
    }
}

/**
 * 统一平台筛选栏（推荐页与资料库共享）：
 * 布局高度 48dp（满足最小触摸区），视觉高度 44dp，选中胶囊 36dp，14sp，字重 600，左右内边距 14dp，间距 8dp。
 * 选中项切换时自动滚动至可见区。
 */
@Composable
internal fun UnifiedPlatformFilterBar(
    section: NativePageSection,
    modifier: Modifier = Modifier,
    horizontalPadding: Dp = UnifiedHeaderTokens.HorizontalPadding,
    action: PageAction,
) {
    val palette = LocalInterfacePalette.current
    val rowState = rememberLazyListState()
    val selectedIndex = section.items.indexOfFirst { it.selected }.coerceAtLeast(0)
    LaunchedEffect(selectedIndex, section.items.size) {
        if (section.items.isNotEmpty() && selectedIndex in section.items.indices) {
            rowState.animateScrollToItem(selectedIndex)
        }
    }
    LazyRow(
        state = rowState,
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = UnifiedHeaderTokens.PlatformBarHeight),
        contentPadding = PaddingValues(horizontal = horizontalPadding),
        horizontalArrangement = Arrangement.spacedBy(UnifiedHeaderTokens.PlatformPillGap),
        verticalAlignment = Alignment.CenterVertically
    ) {
        itemsIndexed(section.items, key = { _, item -> item.id }) { _, item ->
            val selected = item.selected
            Box(
                Modifier
                    .height(UnifiedHeaderTokens.PlatformBarHeight)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        enabled = !item.disabled,
                        role = Role.Tab
                    ) { action(item.action, "", 0.0) },
                contentAlignment = Alignment.Center
            ) {
                Box(
                    Modifier
                        .height(UnifiedHeaderTokens.PlatformPillHeight)
                        .clip(RoundedCornerShape(18.dp))
                        .background(if (selected) palette.selected else palette.subtle.copy(alpha = 0.65f))
                        .padding(horizontal = UnifiedHeaderTokens.PlatformPillPaddingH),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        item.title,
                        color = if (selected) palette.accent else PageInk.copy(alpha = 0.86f),
                        fontSize = 14.sp,
                        lineHeight = 18.sp,
                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                        maxLines = 1,
                        overflow = TextOverflow.Clip
                    )
                }
            }
        }
    }
}

/**
 * 统一折叠顶部栏：渲染在页面顶部（含 safeTop），展开/折叠高度连续插值，
 * 折叠态提供 92% 表面背景与 <=1dp 底部分割线（与 TyTopGlass 协同工作）。
 */
@Composable
internal fun UnifiedCollapsingHeader(
    title: String,
    subtitle: String = "",
    safeTopDp: Float,
    expandedHeightDp: Float,
    collapsedHeightDp: Float,
    progress: Float,
    horizontalPadding: Dp = UnifiedHeaderTokens.HorizontalPadding,
    platformSection: NativePageSection? = null,
    action: PageAction,
    trailingActions: @Composable RowScope.() -> Unit = {},
    bottomContent: (@Composable ColumnScope.() -> Unit)? = null,
) {
    val palette = LocalInterfacePalette.current
    val p = progress.coerceIn(0f, 1f)
    val currentHeightDp = lerp(expandedHeightDp, collapsedHeightDp, p)
    val titleSize = lerp(UnifiedHeaderTokens.TitleExpandedSp, UnifiedHeaderTokens.TitleCollapsedSp, p).sp
    val titleWeight = if (p < 0.5f) FontWeight.Bold else FontWeight(650)
    val subtitleAlpha = (1f - p / 0.6f).coerceIn(0f, 1f)
    val compactPlatformAlpha = ((p - 0.6f) / 0.4f).coerceIn(0f, 1f)
    val collapsedBgAlpha = ((p - 0.15f) / 0.55f).coerceIn(0f, 1f) * 0.92f

    Column(
        Modifier
            .fillMaxWidth()
            .background(palette.surface.copy(alpha = collapsedBgAlpha))
    ) {
        Spacer(Modifier.height(safeTopDp.dp))
        Box(
            Modifier
                .fillMaxWidth()
                .height(currentHeightDp.dp)
                .padding(horizontal = horizontalPadding)
        ) {
            Row(
                Modifier
                    .fillMaxSize()
                    .padding(top = lerp(UnifiedHeaderTokens.ExpandedTopPadding.value, 0f, p).dp),
                verticalAlignment = if (p < 0.5f) Alignment.Top else Alignment.CenterVertically
            ) {
                Column(
                    Modifier
                        .weight(1f)
                        .padding(end = 8.dp),
                    verticalArrangement = Arrangement.Center
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            title,
                            color = PageInk,
                            fontSize = titleSize,
                            lineHeight = (titleSize.value * 1.2f).sp,
                            fontWeight = titleWeight,
                            letterSpacing = lerp(-0.8f, -0.3f, p).sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        if (platformSection != null) {
                            CompactPlatformDropdown(platformSection, compactPlatformAlpha, action)
                        }
                    }
                    if (subtitle.isNotBlank() && subtitleAlpha > 0.01f) {
                        Text(
                            subtitle,
                            color = palette.muted,
                            fontSize = UnifiedHeaderTokens.SubtitleSp,
                            lineHeight = 18.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier
                                .padding(top = UnifiedHeaderTokens.SubtitleGap * subtitleAlpha)
                                .graphicsLayer { alpha = subtitleAlpha }
                        )
                    }
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(0.dp),
                    content = trailingActions
                )
            }
        }
        bottomContent?.invoke(this)
        if (p > 0.05f) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(0.8.dp)
                    .background(palette.border.copy(alpha = 0.55f * ((p - 0.05f) / 0.4f).coerceIn(0f, 1f)))
            )
        }
    }
}
