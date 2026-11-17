package io.github.huleixin.tingyu.chrome

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.util.lerp

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeDirectoryPage.kt
// 资料库与集合详情页：资料库使用统一折叠顶部栏(72dp->56dp) + 48dp吸顶分类工具栏(总折叠104dp) + 56dp内联搜索。

@Composable
internal fun NativeDirectoryPage(page: NativePage, modifier: Modifier, action: PageAction) {
    val states = rememberSaveableStateHolder()
    val recent = rememberSaveable { mutableListOf<String>() }
    LaunchedEffect(page.key) {
        recent.remove(page.key)
        recent.add(page.key)
        while (recent.size > 12) states.removeState(recent.removeAt(0))
    }
    states.SaveableStateProvider(page.key) { NativeDirectoryContent(page, modifier, action) }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun NativeDirectoryContent(page: NativePage, modifier: Modifier, action: PageAction) {
    val reduced = LocalLiquidReduced.current
    val footprint = page.key.startsWith("library:footprint:")
    val library = page.key.startsWith("library:")
    val isUnifiedLibrary = page.key.startsWith("library:unified:")
    val isLocalLibrary = library && !footprint && !isUnifiedLibrary
    var pageOrigin by remember { mutableStateOf(Offset.Zero) }
    var fieldRect by remember { mutableStateOf<Rect?>(null) }
    var searchExpanded by remember(page.key) { mutableStateOf(false) }
    val searchSection = if (footprint) null else page.sections.firstOrNull { it.layout == "input" }

    BackHandler(enabled = searchExpanded) {
        searchExpanded = false
        if (searchSection != null && searchSection.value.isNotEmpty()) {
            action(searchSection.action, "", 0.0)
        }
    }

    BoxWithConstraints(modifier.pageOrigin { pageOrigin = it }) {
        val width = maxWidth
        val wide = width >= 840.dp
        val start = if (wide) if (maxHeight <= 600.dp) 108.dp else 116.dp else UnifiedHeaderTokens.HorizontalPadding
        val end = if (wide) 32.dp else UnifiedHeaderTokens.HorizontalPadding
        val libraryColumns = if (wide) ((width - start - end + 10.dp).value / 152f).toInt().coerceIn(3, 5) else 3

        val rowSections = page.sections.filter { (it.layout == "rows" || it.layout == "cards") && it.id != "intro" }
        val caches = rowSections.associate { it.id to key(it.id) { rememberNativeRows(page.key, it) } }
        val list = rememberLazyListState()
        val identity = rowSections.map { it.id to it.dataKey }.toString()
        var previous by rememberSaveable { mutableStateOf(identity) }
        LaunchedEffect(identity) {
            if (previous != identity) {
                list.scrollToItem(0)
                previous = identity
            }
        }

        val colors = page.surfaceColors()
        val bottomClearance = maxOf((page.bottomClearance + page.safeBottom).dp, with(LocalDensity.current) { LocalNativePageBottomPx.current.toDp() })
        val collapseProgress by if (isUnifiedLibrary && !searchExpanded) {
            rememberCollapsingProgress(list, 16.dp, reduced)
        } else {
            remember { mutableFloatStateOf(if (searchExpanded) 1f else 0f) }
        }

        val platformSection = page.sections.firstOrNull { it.id == "library-sources" }
        val categoriesSection = page.sections.firstOrNull { it.id == "library-categories" }
        val sortSection = page.sections.firstOrNull { it.id == "sort" || it.id == "song-sort" }
        val viewSection = page.sections.firstOrNull { it.id == "library-view" }
        val shortcutsSection = page.sections.firstOrNull { it.id == "personal-shortcuts" }

        // 计算顶部栏实时高度以定位吸顶工具栏或 LazyColumn 内容起始位置
        val expandedHeaderDp = if (isUnifiedLibrary) 72f else if (isLocalLibrary) 240f else 52f
        val collapsedHeaderDp = if (isUnifiedLibrary) 56f else if (isLocalLibrary) 240f else 52f
        val currentHeaderDp = if (searchExpanded) 56f else lerp(expandedHeaderDp, collapsedHeaderDp, collapseProgress)

        val glass = rememberTyTopGlassState(estimateHeaderBottomDp = page.safeTop + currentHeaderDp)
        val localListTop by animateDpAsState(if (isLocalLibrary && searchExpanded) NativeSearchBarHeight + 16.dp else 0.dp, tween(if (reduced) 0 else 240), label = "dir-list-top")
        val contentTop = if (isUnifiedLibrary) (page.safeTop + expandedHeaderDp).dp else glass.contentTop + localListTop

        Box(Modifier.fillMaxSize()) {
            TyTopGlassContentLayer(glass, colors, ambientImage = null, ambientViewportHeight = null, modifier = Modifier.fillMaxSize()) {
                LazyColumn(
                    Modifier.fillMaxSize(),
                    state = list,
                    contentPadding = PaddingValues(
                        top = if (searchExpanded) (page.safeTop + 56f).dp else contentTop,
                        bottom = bottomClearance
                    )
                ) {
                    if (isUnifiedLibrary && !searchExpanded) {
                        // 第二行：平台筛选（随滚动离开）
                        if (platformSection != null) {
                            item(key = "library-sources") {
                                UnifiedPlatformFilterBar(platformSection, Modifier.padding(top = 8.dp), horizontalPadding = start, action = action)
                            }
                        }
                        // 第三行：三个快捷卡片（我喜欢的音乐、最近播放、本地音乐，随滚动离开）
                        if (shortcutsSection != null) {
                            item(key = "personal-shortcuts") {
                                LibraryShortcutCards(
                                    shortcutsSection,
                                    Modifier.padding(start = start, end = end, top = 12.dp, bottom = 8.dp),
                                    action = action
                                )
                            }
                        }
                        // 第四行：分类及工具栏（滚动后吸顶至折叠标题栏下方，总高 56 + 48 = 104dp）
                        if (categoriesSection != null) {
                            stickyHeader(key = "library-toolbar-sticky") {
                                val palette = LocalInterfacePalette.current
                                Column(
                                    Modifier
                                        .fillMaxWidth()
                                        .background(palette.surface.copy(alpha = 0.94f))
                                ) {
                                    LibraryCategoryToolbar(
                                        categories = categoriesSection,
                                        sortSection = sortSection,
                                        viewSection = viewSection,
                                        compactWidth = width < 360.dp,
                                        horizontalPadding = start,
                                        action = action
                                    )
                                    Box(Modifier.fillMaxWidth().height(0.8.dp).background(palette.border.copy(alpha = 0.45f)))
                                }
                            }
                        }
                    }

                    val skipIds = if (isUnifiedLibrary) {
                        setOf("library-sources", "personal-shortcuts", "library-categories", "sort", "song-sort", "library-view", "filter", "library-tools")
                    } else if (isLocalLibrary) {
                        setOf("library-tools", "filter", "sort", "song-sort")
                    } else {
                        emptySet()
                    }

                    page.sections.filter { it.id !in skipIds }.forEach { section ->
                        if (library && section.title.isNotBlank() && (section.layout == "rows" || section.layout == "cards") && section.id != "directory") {
                            item(key = "${section.id}:heading") {
                                Box(Modifier.padding(start = start, end = end)) { PageSectionHeading(section, action = action) }
                            }
                        }
                        when {
                            section.id == "intro" -> item(key = section.id) {
                                Column(Modifier.padding(start = start, end = end, top = 4.dp, bottom = 13.dp)) {
                                    Text(page.title, color = PageInk, fontSize = 27.sp, lineHeight = 34.sp, fontWeight = FontWeight.Bold)
                                    section.items.firstOrNull()?.let { item ->
                                        var expanded by remember(item.subtitle) { mutableStateOf(false) }
                                        val collapsible = item.subtitle.length > 90 || item.subtitle.contains('\n')
                                        Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
                                            PageArtwork(item.image, Modifier.size(88.dp), 12.dp)
                                            Column(Modifier.weight(1f).animateContentSize(tween(if (reduced) 0 else 220)).then(if (collapsible) Modifier.chromeClickable(corner = 10.dp) { expanded = !expanded } else Modifier)) {
                                                Text(item.subtitle, color = PageMuted, fontSize = 13.sp, lineHeight = 20.sp, maxLines = if (expanded || !collapsible) Int.MAX_VALUE else 3, overflow = TextOverflow.Ellipsis)
                                                if (collapsible) Text(if (expanded) "收起" else "展开简介", color = PageAccent, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
                                            }
                                        }
                                    }
                                }
                            }
                            section.layout == "rows" -> pagedNativeRows(page, section, caches.getValue(section.id), if (library) NativePageDesign.DirectoryRow else 62, action, art = if (library) NativePageDesign.DirectoryArt.dp else null, horizontalPadding = start)
                            library && section.layout == "cards" -> {
                                item(key = "${section.id}:grid-pad") { Spacer(Modifier.height(10.dp)) }
                                libraryGridRows(page, section, caches.getValue(section.id), libraryColumns, action, horizontalPadding = start)
                            }
                            library && (section.layout == "textActions" || section.layout == "quickLinks") -> item(key = section.id) {
                                Box(Modifier.padding(start = start, end = end)) { LibraryQuickActions(section, action) }
                            }
                            library && section.layout == "bars" -> item(key = section.id) {
                                Box(Modifier.padding(start = start, end = end)) { NativeListeningBars(section, action) }
                            }
                            !library && section.id == "play" && page.key.contains("artist:") -> item(key = section.id) {
                                Row(Modifier.fillMaxWidth().padding(start = start, end = end, bottom = 16.dp)) {
                                    section.items.firstOrNull()?.let { item ->
                                        PagePill(item.title, { action(item.action, "", 0.0) }, selected = true, enabled = !item.disabled, height = 36.dp, font = 14, trailing = "play")
                                    }
                                }
                            }
                            (!library || (isLocalLibrary && section.id in setOf("groups", "local-sections")) || section.id == "groups") && section.layout == "chips" -> item(key = section.id) {
                                NativeSourceTabs(section, Modifier.padding(start = start, end = end, top = 6.dp, bottom = 8.dp), action = action)
                            }
                            (!library || footprint) && section.layout == "input" -> item(key = section.id) {
                                Box(Modifier.padding(start = start, end = end, bottom = 10.dp)) { NativePageInput(section, action) }
                            }
                            section.layout == "message" && section.text.isNotBlank() -> item(key = section.id) {
                                Text(section.text, color = PageMuted, fontSize = 13.sp, modifier = Modifier.padding(start = start, end = end, top = 20.dp, bottom = 20.dp))
                            }
                        }
                        if (section.busy) item(key = "${section.id}:busy") {
                            Box(Modifier.padding(start = start, end = end)) { CircularProgressIndicator(Modifier.padding(12.dp).size(20.dp), color = PageAccent, strokeWidth = 2.dp) }
                        }
                        if (section.more.isNotBlank() && section.text.isNotBlank()) item(key = "${section.id}:retry") {
                            Box(Modifier.padding(start = start, end = end)) { PagePill(section.moreLabel, { action(section.more, "", 0.0) }) }
                        }
                    }
                }
            }

            // 顶部栏绘制区
            if (isUnifiedLibrary) {
                TyTopGlassForeground {
                    if (searchExpanded && searchSection != null) {
                        LibraryInlineSearchBar(
                            safeTopDp = page.safeTop.toFloat(),
                            section = searchSection,
                            horizontalPadding = start,
                            action = action,
                            onClose = {
                                searchExpanded = false
                                if (searchSection.value.isNotEmpty()) action(searchSection.action, "", 0.0)
                            }
                        )
                    } else if (isLocalLibrary) {
                TyTopGlassSurface(glass, colors)
                TyTopGlassForeground {
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .padding(top = (page.safeTop + 36).dp)
                            .onGloballyPositioned { glass.reportHeader(it.positionInWindow().y, it.size.height) }
                    ) {
                        AnimatedVisibility(
                            visible = !searchExpanded,
                            enter = expandVertically(tween(if (reduced) 0 else 240)),
                            exit = shrinkVertically(tween(if (reduced) 0 else 240))
                        ) {
                            Column {
                                Row(Modifier.padding(start = start + 4.dp, end = end + 4.dp, bottom = 16.dp).heightIn(min = 44.dp), verticalAlignment = Alignment.CenterVertically) {
                                    PageHeading(page, Modifier.weight(1f), large = true, action = action)
                                    page.sections.firstOrNull { it.id == "library-tools" }?.let { tools ->
                                        ChromeButton(tools.title, size = 40.dp, onClick = { action(tools.action, "", 0.0) }) { PageIcon("ellipsis-vertical", PageInk, Modifier.size(19.dp)) }
                                    }
                                }
                                page.sections.filter { it.layout == "chips" && it.id !in setOf("sort", "song-sort", "groups", "local-sections") }.forEach { section ->
                                    NativeSourceTabs(section, Modifier.padding(start = start, end = end, bottom = 12.dp), action = action)
                                }
                                searchSection?.let { section ->
                                    val songSort = page.sections.firstOrNull { it.id == "song-sort" }
                                    Row(Modifier.padding(start = start, end = end, bottom = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Box(Modifier.weight(1f).pageAnchor(pageOrigin) { fieldRect = it }.chromeClickable(corner = 18.dp) { searchExpanded = true }) {
                                            NativePageInput(section, action, passive = true)
                                        }
                                        if (songSort != null && songSort.items.isNotEmpty()) LibrarySortMenu(songSort, action)
                                    }
                                }
                                val sort = page.sections.firstOrNull { it.id == "sort" }
                                if (sort != null) Row(Modifier.fillMaxWidth().padding(start = start, end = end, bottom = 8.dp).heightIn(min = 34.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Text(sort.title, color = PageInk, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                                    if (sort.items.isNotEmpty()) PageSort(sort, action)
                                }
                            }
                        }
                    }
                }
                if (searchSection != null) NativeSearchOverlay(
                    visible = searchExpanded,
                    section = searchSection,
                    action = action,
                    safeTop = page.safeTop,
                    origin = fieldRect,
                    onRequestClose = { searchExpanded = false }
                )
            } else {
                        Box(Modifier.onGloballyPositioned { glass.reportHeader(it.positionInWindow().y, it.size.height) }) {
                            UnifiedCollapsingHeader(
                                title = page.title,
                                safeTopDp = page.safeTop.toFloat(),
                                expandedHeightDp = expandedHeaderDp,
                                collapsedHeightDp = collapsedHeaderDp,
                                progress = collapseProgress,
                                horizontalPadding = start,
                                platformSection = platformSection,
                                action = action,
                                trailingActions = {
                                    if (searchSection != null) {
                                        UnifiedHeaderIconButton("搜索我的资料库", "search", PageInk) {
                                            searchExpanded = true
                                        }
                                    }
                                    if (page.trailing.isNotBlank()) {
                                        UnifiedHeaderIconButton(
                                            description = page.trailingLabel.ifBlank { "资料库管理" },
                                            icon = page.trailingIcon.ifBlank { "folder-cog" },
                                            tint = PageInk
                                        ) { action(page.trailing, "", 0.0) }
                                    }
                                }
                            )
                        }
                    }
                }
            } else if (isLocalLibrary) {
                TyTopGlassSurface(glass, colors)
                TyTopGlassForeground {
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .padding(top = (page.safeTop + 36).dp)
                            .onGloballyPositioned { glass.reportHeader(it.positionInWindow().y, it.size.height) }
                    ) {
                        AnimatedVisibility(
                            visible = !searchExpanded,
                            enter = expandVertically(tween(if (reduced) 0 else 240)),
                            exit = shrinkVertically(tween(if (reduced) 0 else 240))
                        ) {
                            Column {
                                Row(Modifier.padding(start = start + 4.dp, end = end + 4.dp, bottom = 16.dp).heightIn(min = 44.dp), verticalAlignment = Alignment.CenterVertically) {
                                    PageHeading(page, Modifier.weight(1f), large = true, action = action)
                                    page.sections.firstOrNull { it.id == "library-tools" }?.let { tools ->
                                        ChromeButton(tools.title, size = 40.dp, onClick = { action(tools.action, "", 0.0) }) { PageIcon("ellipsis-vertical", PageInk, Modifier.size(19.dp)) }
                                    }
                                }
                                page.sections.filter { it.layout == "chips" && it.id !in setOf("sort", "song-sort", "groups", "local-sections") }.forEach { section ->
                                    NativeSourceTabs(section, Modifier.padding(start = start, end = end, bottom = 12.dp), action = action)
                                }
                                searchSection?.let { section ->
                                    val songSort = page.sections.firstOrNull { it.id == "song-sort" }
                                    Row(Modifier.padding(start = start, end = end, bottom = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Box(Modifier.weight(1f).pageAnchor(pageOrigin) { fieldRect = it }.chromeClickable(corner = 18.dp) { searchExpanded = true }) {
                                            NativePageInput(section, action, passive = true)
                                        }
                                        if (songSort != null && songSort.items.isNotEmpty()) LibrarySortMenu(songSort, action)
                                    }
                                }
                                val sort = page.sections.firstOrNull { it.id == "sort" }
                                if (sort != null) Row(Modifier.fillMaxWidth().padding(start = start, end = end, bottom = 8.dp).heightIn(min = 34.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Text(sort.title, color = PageInk, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                                    if (sort.items.isNotEmpty()) PageSort(sort, action)
                                }
                            }
                        }
                    }
                }
                if (searchSection != null) NativeSearchOverlay(
                    visible = searchExpanded,
                    section = searchSection,
                    action = action,
                    safeTop = page.safeTop,
                    origin = fieldRect,
                    onRequestClose = { searchExpanded = false }
                )
            } else {
                TyTopGlassSurface(glass, colors)
                TyTopGlassForeground {
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .padding(top = (page.safeTop + 8).dp)
                            .onGloballyPositioned { glass.reportHeader(it.positionInWindow().y, it.size.height) }
                    ) {
                        Row(
                            Modifier.fillMaxWidth().padding(start = start - 8.dp, end = end - 8.dp).height(44.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            ChromeButton("返回", size = 42.dp, onClick = { action(page.leading, "", 0.0) }) { PageIcon("chevron-left", PageInk, Modifier.size(23.dp)) }
                            Spacer(Modifier.weight(1f))
                            if (page.trailing.isNotBlank()) ChromeButton("更多", size = 42.dp, onClick = { action(page.trailing, "", 0.0) }) { PageIcon("ellipsis-vertical", PageInk, Modifier.size(23.dp)) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LibraryShortcutCards(section: NativePageSection, modifier: Modifier = Modifier, action: PageAction) {
    val palette = LocalInterfacePalette.current
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        section.items.forEach { item ->
            val interaction = remember { MutableInteractionSource() }
            val pressed by interaction.collectIsPressedAsState()
            val scale by animateFloatAsState(if (pressed) 0.97f else 1f, tween(120), label = "lib-shortcut")
            Column(
                Modifier
                    .weight(1f)
                    .height(88.dp)
                    .graphicsLayer { scaleX = scale; scaleY = scale; alpha = if (pressed) 0.86f else 1f }
                    .clip(RoundedCornerShape(14.dp))
                    .background(palette.homeQuickCard)
                    .clickable(interactionSource = interaction, indication = null, enabled = !item.disabled) {
                        action(item.action, "", 0.0)
                    }
                    .padding(horizontal = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                PageIcon(item.image.ifBlank { "music2" }, palette.accent, Modifier.size(22.dp))
                Spacer(Modifier.height(6.dp))
                Text(item.title, color = PageInk, fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (item.subtitle.isNotBlank()) {
                    Spacer(Modifier.height(4.dp))
                    Text(item.subtitle, color = PageMuted, fontSize = 12.sp, lineHeight = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

@Composable
private fun LibraryCategoryToolbar(
    categories: NativePageSection,
    sortSection: NativePageSection?,
    viewSection: NativePageSection?,
    compactWidth: Boolean,
    horizontalPadding: Dp,
    action: PageAction,
) {
    val palette = LocalInterfacePalette.current
    var sortOpen by remember { mutableStateOf(false) }
    var moreOpen by remember { mutableStateOf(false) }
    val layoutItem = viewSection?.items?.firstOrNull { it.id == "layout" }
    val refreshItem = viewSection?.items?.firstOrNull { it.id == "refresh" }

    Row(
        Modifier
            .fillMaxWidth()
            .height(48.dp)
            .padding(start = horizontalPadding, end = (horizontalPadding - 8.dp).coerceAtLeast(8.dp)),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            Modifier.weight(1f),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            categories.items.forEach { item ->
                Box(
                    Modifier
                        .height(32.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(if (item.selected) palette.selected else Color.Transparent)
                        .clickable(role = Role.Tab) { action(item.action, "", 0.0) }
                        .padding(horizontal = 12.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        item.title,
                        color = if (item.selected) palette.accent else PageMuted,
                        fontSize = 14.sp,
                        fontWeight = if (item.selected) FontWeight.SemiBold else FontWeight.Normal,
                        maxLines = 1
                    )
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (sortSection != null && sortSection.items.isNotEmpty()) {
                Box {
                    ChromeButton("排序", size = 48.dp, onClick = { sortOpen = true }) {
                        PageIcon("arrow-up-down", PageInk, Modifier.size(20.dp))
                    }
                    LiquidDropdown(expanded = sortOpen, onDismissRequest = { sortOpen = false }) {
                        val menuInk = palette.menuInk
                        val menuAccent = palette.accent
                        sortSection.items.forEach { item ->
                            DropdownMenuItem(
                                text = { Text(item.title, color = if (item.selected) menuAccent else menuInk, fontSize = 14.sp) },
                                trailingIcon = if (item.selected) { { PageIcon("check", menuAccent, Modifier.size(16.dp)) } } else null,
                                onClick = { sortOpen = false; action(item.action, "", 0.0) }
                            )
                        }
                    }
                }
            }
            if (!compactWidth && layoutItem != null) {
                ChromeButton(layoutItem.title, size = 48.dp, onClick = { action(layoutItem.action, "", 0.0) }) {
                    PageIcon(if (layoutItem.title.contains("列表")) "list" else "layout-grid", PageInk, Modifier.size(20.dp))
                }
            }
            Box {
                ChromeButton("更多", size = 48.dp, onClick = { moreOpen = true }) {
                    PageIcon("ellipsis-vertical", PageInk, Modifier.size(20.dp))
                }
                LiquidDropdown(expanded = moreOpen, onDismissRequest = { moreOpen = false }) {
                    val menuInk = palette.menuInk
                    if (compactWidth && layoutItem != null) {
                        DropdownMenuItem(
                            text = { Text(layoutItem.title, color = menuInk, fontSize = 14.sp) },
                            onClick = { moreOpen = false; action(layoutItem.action, "", 0.0) }
                        )
                    }
                    if (refreshItem != null) {
                        DropdownMenuItem(
                            text = { Text(refreshItem.title, color = menuInk, fontSize = 14.sp) },
                            onClick = { moreOpen = false; action(refreshItem.action, "", 0.0) }
                        )
                    }
                    DropdownMenuItem(
                        text = { Text("资料库管理", color = menuInk, fontSize = 14.sp) },
                        onClick = { moreOpen = false; action("manage", "", 0.0) }
                    )
                }
            }
        }
    }
}

@Composable
private fun LibraryInlineSearchBar(
    safeTopDp: Float,
    section: NativePageSection,
    horizontalPadding: Dp,
    action: PageAction,
    onClose: () -> Unit,
) {
    val palette = LocalInterfacePalette.current
    var draft by remember(section.id) { mutableStateOf(TextFieldValue(section.value)) }
    val focusRequester = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        withFrameNanos {}
        runCatching { focusRequester.requestFocus() }
    }
    Column(
        Modifier
            .fillMaxWidth()
            .background(palette.surface.copy(alpha = 0.94f))
    ) {
        Spacer(Modifier.height(safeTopDp.dp))
        Row(
            Modifier
                .fillMaxWidth()
                .height(56.dp)
                .padding(start = (horizontalPadding - 12.dp).coerceAtLeast(4.dp), end = horizontalPadding),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            ChromeButton("返回", size = 48.dp, onClick = onClose) {
                PageIcon("chevron-left", PageInk, Modifier.size(22.dp))
            }
            Row(
                Modifier
                    .weight(1f)
                    .height(40.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(palette.subtle)
                    .padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                BasicTextField(
                    value = draft,
                    onValueChange = {
                        draft = it
                        action(section.action, it.text, if (it.composition != null) 1.0 else 0.0)
                    },
                    modifier = Modifier.weight(1f).focusRequester(focusRequester),
                    textStyle = TextStyle(color = PageInk, fontSize = 14.sp, lineHeight = 20.sp),
                    cursorBrush = SolidColor(PageAccent),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { action(section.action, draft.text, 0.0) }),
                    decorationBox = { inner ->
                        if (draft.text.isBlank()) {
                            Text("搜索我的资料库", color = PageMuted, fontSize = 14.sp, maxLines = 1)
                        }
                        inner()
                    }
                )
                if (draft.text.isNotEmpty()) {
                    ChromeButton("清空", size = 36.dp, onClick = {
                        draft = TextFieldValue("")
                        action(section.action, "", 0.0)
                    }) { PageIcon("x", PageMuted, Modifier.size(16.dp)) }
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(0.8.dp).background(palette.border.copy(alpha = 0.45f)))
    }
}

internal fun LazyListScope.pagedNativeRows(
    page: NativePage,
    section: NativePageSection,
    cache: NativeRowsCache,
    height: Int,
    action: PageAction,
    art: Dp? = null,
    horizontalPadding: Dp = 0.dp,
) {
    val plain = art == null
    items(section.total, key = { index -> "${section.id}:${section.dataKey}:$index" }) { index ->
        val item = cache.get(section, index)
        Box(Modifier.padding(horizontal = horizontalPadding)) {
            if (item != null) NativePageRow(
                if (page.id == "search" && section.id == "songs") item.copy(selected = item.id == section.activeKey) else item,
                height.dp, art ?: 40.dp, if (plain) 14 else 15, if (plain) 11 else 12,
                divider = plain, playing = section.playing, alwaysArt = !plain || section.id == "songs", pending = item.id == section.pendingKey
            ) { action(it, "", 0.0) }
            else {
                Spacer(Modifier.height(height.dp))
                if (section.request.isNotBlank()) LaunchedEffect(page.key, page.session, section.id, section.dataKey, index / 100) {
                    if (cache.request(index, page.session)) action(section.request, "", (index / 100 * 100).toDouble())
                }
            }
        }
    }
}

@Composable
internal fun LibrarySortMenu(section: NativePageSection, action: PageAction) {
    var open by remember { mutableStateOf(false) }
    val selected = section.items.firstOrNull { it.selected }
    Box {
        PagePill(selected?.title ?: section.title, { open = true }, height = 38.dp, font = 13, trailing = "chevron-down")
        LiquidDropdown(expanded = open, onDismissRequest = { open = false }) {
            val menuInk = LocalInterfacePalette.current.menuInk
            val menuAccent = LocalInterfacePalette.current.accent
            section.items.forEach { item ->
                DropdownMenuItem(
                    text = { Text(item.title, color = if (item.selected) menuAccent else menuInk, fontSize = 14.sp) },
                    onClick = { open = false; action(item.action, "", 0.0) },
                    trailingIcon = { if (item.selected) PageIcon("check", menuAccent, Modifier.size(16.dp)) else null }
                )
            }
        }
    }
}
