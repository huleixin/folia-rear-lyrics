package io.github.huleixin.tingyu.chrome

import androidx.activity.compose.BackHandler
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.util.lerp

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeSearchPage.kt
// 搜索页：展开态 72dp大标题 + 8dp + 48dp全宽搜索框；激活/折叠态 64dp紧凑搜索框模式。

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun NativeSearchPage(
    page: NativePage,
    modifier: Modifier,
    action: PageAction,
    pane: Boolean = false,
    headerOnly: Boolean = false,
) {
    val menu = page.leading == "back"
    if (LocalPadWindow.current.expanded && !pane && !headerOnly && !menu) {
        PadSearchPage(page, modifier, action)
        return
    }
    val bottomClearance = with(LocalDensity.current) { LocalNativePageBottomPx.current.toDp() }
    val reduced = LocalLiquidReduced.current
    val padGrid = LocalPadWindow.current.expanded
    val focusManager = LocalFocusManager.current
    val querySection = page.sections.firstOrNull { it.id == "query" }
    val hasQuery = !querySection?.value.isNullOrBlank()
    var inputFocused by remember { mutableStateOf(false) }
    var historyExpanded by remember { mutableStateOf(false) }
    var confirmClearHistory by remember { mutableStateOf(false) }

    // 返回键：若处于输入聚焦且无菜单，先退出输入态恢复展开大标题
    BackHandler(enabled = !menu && inputFocused && !hasQuery) {
        focusManager.clearFocus()
    }

    val caches = page.sections.filter { it.layout == "rows" }.associate { it.id to key(it.id) { rememberNativeRows(page.key, it) } }
    val colors = page.surfaceColors()
    val hasTabs = page.sections.any { it.id == "tabs" }
    val list = rememberLazyListState()
    val scrollCollapse by if (!menu && !pane && !hasQuery && !inputFocused) {
        rememberCollapsingProgress(list, 64.dp, reduced)
    } else {
        remember { mutableFloatStateOf(if (hasQuery || inputFocused) 1f else 0f) }
    }
    val targetCollapse = if (menu || pane) 0f else if (headerOnly || hasQuery || inputFocused) 1f else scrollCollapse
    val collapse by animateFloatAsState(
        targetValue = targetCollapse,
        animationSpec = tween(
            durationMillis = if (reduced || headerOnly) 0 else UnifiedHeaderTokens.SnapDurationMs,
            easing = UnifiedHeaderTokens.SnapEasing
        ),
        label = "search-collapse"
    )

    // 展开态顶部：72dp(标题) + 8dp + 48dp(搜索框) + 8dp(底部缓冲) = 136dp；折叠态：64dp(+44dp tabs)
    val expandedHeaderHeight = 132f
    val collapsedHeaderHeight = 64f + if (hasTabs) 44f else 0f
    val currentHeaderHeight = if (menu) 64f else lerp(expandedHeaderHeight, collapsedHeaderHeight, collapse)
    val horizontalPad = if (padGrid) 20.dp else UnifiedHeaderTokens.HorizontalPadding
    val glass = rememberTyTopGlassState(estimateHeaderBottomDp = if (pane) 0f else page.safeTop + currentHeaderHeight)

    Box(modifier) {
        TyTopGlassContentLayer(
            glass,
            colors,
            ambientImage = null,
            ambientViewportHeight = null,
            modifier = Modifier.fillMaxSize(),
            paintBackground = !pane && !headerOnly
        ) {
            LazyColumn(
                Modifier.fillMaxSize().imePadding(),
                state = list,
                contentPadding = PaddingValues(
                    start = horizontalPad,
                    end = horizontalPad,
                    top = if (pane) 12.dp else if (hasQuery || inputFocused || menu) (page.safeTop + currentHeaderHeight + 8f).dp else (page.safeTop + expandedHeaderHeight + 16f + if (hasTabs) 44f else 0f).dp,
                    bottom = maxOf((page.safeBottom + 18).dp, bottomClearance)
                )
            ) {
                page.sections.filter { it.id !in setOf("query", "sources", "tabs") }.forEach { section ->
                    val history = section.id == "history"
                    val hot = section.id == "hot"
                    if (section.title.isNotBlank()) {
                        item(key = "${section.id}:heading") {
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .padding(top = if (history) 0.dp else 8.dp, bottom = 12.dp)
                                    .heightIn(min = 32.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                if (hot) PageIcon("flame", PageMuted, Modifier.padding(end = 8.dp).size(20.dp))
                                Text(
                                    section.title,
                                    color = PageInk,
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight(650),
                                    modifier = Modifier.weight(1f)
                                )
                                if (history) {
                                    ChromeButton(section.moreLabel.ifBlank { "清空历史" }, size = 48.dp, onClick = { confirmClearHistory = true }) {
                                        PageIcon("trash2", PageMuted, Modifier.size(20.dp))
                                    }
                                }
                                if (hot && section.more.isNotBlank()) {
                                    val rotation by animateFloatAsState(if (section.expanded) 180f else 0f, tween(if (reduced) 0 else 220), label = "hot-toggle")
                                    Row(
                                        Modifier
                                            .heightIn(min = 48.dp)
                                            .chromeClickable(role = Role.Button, corner = 10.dp) { action(section.more, "", 0.0) }
                                            .semantics { stateDescription = section.moreLabel }
                                            .padding(horizontal = 6.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        Text(section.moreLabel, color = PageMuted, fontSize = 13.sp)
                                        PageIcon("chevron-down", PageMuted, Modifier.size(15.dp).rotate(rotation))
                                    }
                                }
                            }
                        }
                    }

                    when {
                        section.id == "bestMatch" -> item(key = section.id) {
                            Column(
                                Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(LocalInterfacePalette.current.subtle)
                                    .padding(12.dp)
                            ) {
                                section.items.forEach { item ->
                                    NativePageRow(item, height = 76.dp, art = 60.dp, titleSize = 15, alwaysArt = true) { action(it, "", 0.0) }
                                }
                            }
                            Spacer(Modifier.height(16.dp))
                        }

                        section.id == "sourceStatus" -> item(key = section.id) {
                            FlowRow(
                                Modifier.fillMaxWidth().padding(bottom = 12.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                section.items.forEach { item ->
                                    Text(
                                        item.title,
                                        color = PageMuted,
                                        fontSize = 12.sp,
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(LocalInterfacePalette.current.subtle)
                                            .padding(horizontal = 8.dp, vertical = 6.dp)
                                    )
                                }
                            }
                        }

                        hot -> item(key = section.id) {
                            val palette = LocalInterfacePalette.current
                            Column(Modifier.animateContentSize(tween(if (reduced) 0 else 220))) {
                                section.items.chunked(2).forEachIndexed { row, items ->
                                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                        items.forEachIndexed { column, item ->
                                            val rank = row * 2 + column + 1
                                            Row(
                                                Modifier
                                                    .weight(1f)
                                                    .heightIn(min = 44.dp)
                                                    .chromeClickable(corner = 10.dp) { action(item.action, "", 0.0) }
                                                    .padding(vertical = 8.dp),
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                                            ) {
                                                Text(
                                                    rank.toString(),
                                                    color = if (rank <= 3) palette.accent else PageMuted,
                                                    fontSize = 12.sp,
                                                    fontWeight = if (rank <= 3) FontWeight.SemiBold else FontWeight.Normal,
                                                    modifier = Modifier.width(18.dp)
                                                )
                                                Text(
                                                    item.title,
                                                    color = if (rank <= 3) PageInk else PageInk.copy(alpha = 0.88f),
                                                    fontSize = 14.sp,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis,
                                                    modifier = Modifier.weight(1f)
                                                )
                                            }
                                        }
                                        if (items.size == 1) Spacer(Modifier.weight(1f))
                                    }
                                }
                            }
                        }

                        history -> item(key = section.id) {
                            val palette = LocalInterfacePalette.current
                            val maxVisible = if (historyExpanded) section.items.size else 6
                            val shown = section.items.take(maxVisible)
                            Column(Modifier.fillMaxWidth()) {
                                FlowRow(
                                    Modifier.fillMaxWidth().animateContentSize(tween(if (reduced) 0 else 180)),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    shown.forEach { item ->
                                        Row(
                                            Modifier
                                                .height(32.dp)
                                                .clip(RoundedCornerShape(16.dp))
                                                .background(palette.subtle)
                                                .padding(start = 12.dp, end = if (item.secondary.isNotBlank()) 4.dp else 12.dp),
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Text(
                                                item.title,
                                                color = PageInk,
                                                fontSize = 13.sp,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis,
                                                modifier = Modifier
                                                    .clickable { action(item.action, "", 0.0) }
                                                    .padding(vertical = 4.dp)
                                            )
                                            if (item.secondary.isNotBlank()) {
                                                Box(
                                                    Modifier
                                                        .size(28.dp)
                                                        .clip(RoundedCornerShape(14.dp))
                                                        .clickable(role = Role.Button) { action(item.secondary, "", 0.0) }
                                                        .semantics { contentDescription = "删除" + item.title },
                                                    contentAlignment = Alignment.Center
                                                ) {
                                                    PageIcon("x", PageMuted, Modifier.size(14.dp))
                                                }
                                            }
                                        }
                                    }
                                    if (section.items.size > 6) {
                                        Box(
                                            Modifier
                                                .height(32.dp)
                                                .clip(RoundedCornerShape(16.dp))
                                                .background(palette.subtle.copy(alpha = 0.6f))
                                                .clickable { historyExpanded = !historyExpanded }
                                                .padding(horizontal = 12.dp),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Text(
                                                if (historyExpanded) "收起" else "展开全部",
                                                color = PageMuted,
                                                fontSize = 12.sp
                                            )
                                        }
                                    }
                                }
                                Spacer(Modifier.height(24.dp))
                            }
                        }

                        section.layout == "chips" && section.id == "discovery" -> item(key = section.id) {
                            FlowRow(
                                Modifier.fillMaxWidth().padding(bottom = 24.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                section.items.forEach { item ->
                                    Box(
                                        Modifier
                                            .height(32.dp)
                                            .clip(RoundedCornerShape(16.dp))
                                            .background(LocalInterfacePalette.current.subtle)
                                            .clickable { action(item.action, "", 0.0) }
                                            .padding(horizontal = 12.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(item.title, color = PageInk, fontSize = 13.sp, maxLines = 1)
                                    }
                                }
                            }
                        }

                        section.layout == "rows" && padGrid && section.id in setOf("artist", "album", "playlist") ->
                            padSearchGrid(page, section, caches.getValue(section.id), action)

                        section.layout == "rows" ->
                            pagedNativeRows(page, section, caches.getValue(section.id), 60, action)

                        section.layout == "chips" -> item(key = section.id) {
                            Column {
                                section.items.forEach { item ->
                                    Row(
                                        Modifier
                                            .fillMaxWidth()
                                            .height(52.dp)
                                            .chromeClickable(corner = 12.dp) { action(item.action, "", 0.0) },
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                                    ) {
                                        PageIcon("search", PageMuted, Modifier.size(18.dp))
                                        Text(item.title, color = PageInk, fontSize = 14.sp)
                                    }
                                }
                            }
                        }

                        section.text.isNotBlank() -> item(key = section.id) {
                            Text(section.text, color = PageMuted, fontSize = 13.sp, modifier = Modifier.padding(vertical = 12.dp))
                        }
                    }

                    if (section.busy) item(key = "${section.id}:busy") {
                        Box(Modifier.fillMaxWidth().heightIn(min = 48.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(Modifier.size(20.dp), color = PageAccent, strokeWidth = 2.dp)
                        }
                    }

                    if (!hot && !history && !section.busy && (section.more.isNotBlank() || section.layout == "rows" && section.text.isNotBlank())) {
                        item(key = "${section.id}:more") {
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 48.dp)
                                    .then(if (section.more.isNotBlank()) Modifier.chromeClickable(role = Role.Button, corner = 10.dp) { action(section.more, "", 0.0) } else Modifier)
                                    .padding(horizontal = 8.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                if (section.layout == "rows" && section.text.isNotBlank()) {
                                    Text(section.text, color = PageMuted, fontSize = 12.sp, modifier = Modifier.weight(1f))
                                } else {
                                    Spacer(Modifier.weight(1f))
                                }
                                if (section.more.isNotBlank()) {
                                    Text(section.moreLabel, color = PageAccent, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                                    if (section.text.isBlank()) {
                                        PageIcon(if (section.more == "allSongs" || section.more.startsWith("all:")) "chevron-right" else "chevron-down", PageAccent, Modifier.size(15.dp))
                                    }
                                }
                                if (section.text.isBlank()) Spacer(Modifier.weight(1f))
                            }
                        }
                    }
                }
            }
        }

        if (!pane && !headerOnly) TyTopGlassSurface(glass, colors)
        if (!pane) TyTopGlassForeground {
            val palette = LocalInterfacePalette.current
            val headerBgAlpha = if (collapse <= 0.02f) 0f else (0.75f + collapse * 0.21f).coerceIn(0f, 0.96f)
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(colors.first().copy(alpha = headerBgAlpha))
                    .padding(top = page.safeTop.dp)
                    .onGloballyPositioned { glass.reportHeader(it.positionInWindow().y, it.size.height) }
            ) {
                if (menu) {
                    PageHeading(page, Modifier.padding(horizontal = horizontalPad, vertical = 10.dp), action = action)
                } else {
                    // 展开态 72dp 大标题区随 collapse 平滑收起至 0dp；始终保留节点以维持下方输入框焦点稳定
                    val titleAreaHeight = lerp(72f, 0f, collapse)
                    val titleAlpha = (1f - collapse / 0.65f).coerceIn(0f, 1f)
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .height(titleAreaHeight.dp)
                            .graphicsLayer { alpha = titleAlpha }
                    ) {
                        if (titleAreaHeight > 2f) {
                            Row(
                                Modifier
                                    .fillMaxSize()
                                    .padding(start = horizontalPad, end = (horizontalPad - 12.dp).coerceAtLeast(4.dp), top = UnifiedHeaderTokens.ExpandedTopPadding * (1f - collapse)),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    page.title,
                                    color = PageInk,
                                    fontSize = UnifiedHeaderTokens.TitleExpandedSp.sp,
                                    fontWeight = FontWeight.Bold,
                                    letterSpacing = (-0.8).sp,
                                    modifier = Modifier.weight(1f)
                                )
                                if (page.trailing.isNotBlank() && collapse < 0.5f) {
                                    UnifiedHeaderIconButton(
                                        description = page.trailingLabel.ifBlank { "搜索设置" },
                                        icon = page.trailingIcon.ifBlank { "settings" },
                                        tint = PageInk,
                                        onClick = { action(page.trailing, "", 0.0) }
                                    )
                                }
                            }
                        }
                    }

                    // 搜索框区：展开时间距 8dp，折叠/激活时总高 64dp (8 + 48 + 8) 并右侧并入设置图标
                    val focusRequester = remember { FocusRequester() }
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(
                                start = horizontalPad,
                                end = if (collapse >= 0.5f && page.trailing.isNotBlank()) (horizontalPad - 12.dp).coerceAtLeast(4.dp) else horizontalPad,
                                top = 8.dp,
                                bottom = 8.dp
                            ),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        if (querySection != null) {
                            BoxWithConstraints(Modifier.weight(1f)) {
                                val compact = maxWidth < 240.dp || LocalDensity.current.fontScale > 1.3f
                                val sources = page.sections.firstOrNull { it.id == "sources" }
                                NativePageInput(
                                    section = querySection,
                                    action = action,
                                    search = true,
                                    focusRequester = focusRequester,
                                    onFocusChanged = { inputFocused = it },
                                    trailing = { if (sources != null) SearchSourceMenu(sources, compact, action) }
                                )
                            }
                        }
                        if (collapse >= 0.5f && page.trailing.isNotBlank()) {
                            UnifiedHeaderIconButton(
                                description = page.trailingLabel.ifBlank { "搜索设置" },
                                icon = page.trailingIcon.ifBlank { "settings" },
                                tint = PageInk,
                                onClick = { action(page.trailing, "", 0.0) }
                            )
                        }
                    }

                    page.sections.firstOrNull { it.id == "tabs" }?.let { section ->
                        NativeSourceTabs(section, Modifier.height(44.dp).padding(horizontal = horizontalPad), underline = true, action = action)
                    }
                }
            }
        }
    }

    if (confirmClearHistory) {
        val historySection = page.sections.firstOrNull { it.id == "history" }
        AlertDialog(
            onDismissRequest = { confirmClearHistory = false },
            title = { Text("清空搜索历史") },
            text = { Text("确定清空当前来源的全部搜索历史记录吗？") },
            confirmButton = {
                TextButton(onClick = {
                    confirmClearHistory = false
                    historySection?.more?.takeIf { it.isNotBlank() }?.let { action(it, "", 0.0) }
                }) { Text("清空") }
            },
            dismissButton = {
                TextButton(onClick = { confirmClearHistory = false }) { Text("取消") }
            }
        )
    }
}

/** A single compact dropdown; title and chevron share one touch target, including icon-only layouts. */
@Composable
internal fun SearchSourceMenu(section: NativePageSection, compact: Boolean, action: PageAction) {
    var open by remember { mutableStateOf(false) }
    val selected = section.items.firstOrNull { it.selected }
    Box {
        Row(
            Modifier
                .height(40.dp)
                .widthIn(min = 40.dp, max = 112.dp)
                .chromeClickable(role = Role.Button, corner = 16.dp) { open = true }
                .semantics(mergeDescendants = true) {
                    val label = section.title.ifBlank { "搜索音源" }
                    val sel = selected?.title.orEmpty()
                    contentDescription = if (sel.isBlank()) label else "$label：$sel"
                }
                .padding(horizontal = if (compact) 10.dp else 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            if (!compact) {
                Text(
                    selected?.title.orEmpty(),
                    color = PageInk,
                    fontSize = 13.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, false)
                )
            }
            PageIcon("chevron-down", PageMuted, Modifier.size(14.dp))
        }
        LiquidDropdown(expanded = open, onDismissRequest = { open = false }) {
            val menuInk = LocalInterfacePalette.current.menuInk
            val menuAccent = LocalInterfacePalette.current.accent
            section.items.forEach { item ->
                DropdownMenuItem(
                    text = { Text(item.title, color = menuInk) },
                    enabled = !item.disabled,
                    trailingIcon = { if (item.selected) PageIcon("check", menuAccent, Modifier.size(17.dp)) },
                    onClick = { open = false; action(item.action, "", 0.0) }
                )
            }
        }
    }
}
