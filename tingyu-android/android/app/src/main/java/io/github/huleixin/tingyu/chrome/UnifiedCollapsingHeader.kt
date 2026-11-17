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
// 四个一级页面共享的统一折叠顶部栏与平台筛选栏：无硬分界线，单套平台入口平滑交接。

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
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
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
    val palette = LocalInterfacePalette.current
    var open by remember { mutableStateOf(false) }
    val selected = section.items.firstOrNull { it.selected } ?: section.items.first()
    val interactive = alpha >= 0.5f
    Box(Modifier.graphicsLayer { this.alpha = alpha }) {
        Row(
            Modifier
                .heightIn(min = 34.dp)
                .clip(RoundedCornerShape(17.dp))
                .background(palette.directorySelected.copy(alpha = 0.88f))
                .then(
                    if (interactive) Modifier.clickable(role = Role.Button) { open = true }
                    else Modifier
                )
                .padding(horizontal = 10.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(3.dp)
        ) {
            Text(
                selected.title,
                color = palette.accent,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            PageIcon("chevron-down", palette.accent, Modifier.size(14.dp))
        }
        LiquidDropdown(expanded = open && interactive, onDismissRequest = { open = false }) {
            val menuInk = palette.menuInk
            val menuAccent = palette.accent
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
 * 统一平台筛选栏（轻透冰川风格）：
 * 选中项使用柔和 directorySelected 胶囊，未选中项保持透明轻盈，避免深色胶囊反客为主。
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
                        .background(if (selected) palette.directorySelected else Color.Transparent)
                        .padding(horizontal = UnifiedHeaderTokens.PlatformPillPaddingH),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        item.title,
                        color = if (selected) palette.accent else PageMuted,
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
 * 统一折叠顶部栏：同色系自然过渡，无突兀横线；
 * compactPlatformAlpha 仅在下方完整平台栏完全离开顶部视口后（p >= 0.85f）才平滑显示。
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
    headerBackgroundColor: Color = LocalInterfacePalette.current.backgrounds.first(),
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
    val subtitleAlpha = (1f - p / 0.55f).coerceIn(0f, 1f)
    val compactPlatformAlpha = ((p - 0.85f) / 0.15f).coerceIn(0f, 1f)
    val bgAlpha = if (p <= 0.02f) 0f else (0.75f + p * 0.21f).coerceIn(0f, 0.96f)

    Column(
        Modifier
            .fillMaxWidth()
            .background(headerBackgroundColor.copy(alpha = bgAlpha))
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
    }
}
