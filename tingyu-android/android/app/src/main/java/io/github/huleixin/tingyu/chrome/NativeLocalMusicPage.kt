package io.github.huleixin.tingyu.chrome

import android.graphics.Paint
import android.graphics.Path
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
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

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeLocalMusicPage.kt
// 独立二级「本地音乐」页面：单滚动容器 + 56dp紧凑顶栏 + 曲库概览卡 + 48dp吸顶分类栏 + 68dp高歌曲/分组列表。

private val savedLocalMusicScroll = mutableMapOf<String, Pair<Int, Int>>()

@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun NativeLocalMusicPage(
    page: NativePage,
    modifier: Modifier = Modifier,
    splitPane: Boolean = false,
    action: PageAction,
) {
    val palette = LocalInterfacePalette.current
    val searchSection = page.sections.firstOrNull { it.id == "filter" }
    val overviewSection = page.sections.firstOrNull { it.id == "overview" }
    val categoriesSection = page.sections.firstOrNull { it.id == "categories" }
    val subheaderSection = page.sections.firstOrNull { it.id == "subheader" }
    val folderGroupsSection = page.sections.firstOrNull { it.id == "folder-groups" }
    val localSongsSection = page.sections.firstOrNull { it.id == "local-songs" }
    val localGroupsSection = page.sections.firstOrNull { it.id == "local-groups" }
    val emptySection = page.sections.firstOrNull { it.id == "empty" }

    var searchExpanded by remember { mutableStateOf(searchSection?.value?.isNotEmpty() == true) }
    LaunchedEffect(searchSection?.value) {
        if (!searchSection?.value.isNullOrEmpty()) searchExpanded = true
    }

    BackHandler(enabled = !LocalWebOverlayActive.current && searchExpanded) {
        searchExpanded = false
        if (searchSection != null && searchSection.value.isNotEmpty()) {
            action(searchSection.action, "", 0.0)
        }
    }

    val songsCache = localSongsSection?.let { section ->
        key(section.id) { rememberNativeRows(page.key, section) }
    }

    val activeCategoryId = categoriesSection?.items?.firstOrNull { it.selected }?.id ?: "songs"
    val scrollKey = "local-music:$activeCategoryId"
    val initialScroll = remember(scrollKey) { savedLocalMusicScroll[scrollKey] ?: (0 to 0) }
    val listState = rememberLazyListState(
        initialFirstVisibleItemIndex = initialScroll.first,
        initialFirstVisibleItemScrollOffset = initialScroll.second,
    )
    LaunchedEffect(scrollKey, listState.firstVisibleItemIndex, listState.firstVisibleItemScrollOffset) {
        savedLocalMusicScroll[scrollKey] = listState.firstVisibleItemIndex to listState.firstVisibleItemScrollOffset
    }

    val horizontalMargin = 20.dp
    val topBarHeight = 56.dp
    val headerTotalDp = (if (splitPane) 0f else page.safeTop) + topBarHeight.value
    val bottomClearance = maxOf(
        (page.bottomClearance + page.safeBottom).dp,
        with(LocalDensity.current) { LocalNativePageBottomPx.current.toDp() + 16.dp },
    )
    val bgBrush = remember(palette) { Brush.verticalGradient(palette.backgrounds) }
    val stickyBackdrop = remember(palette) { palette.backgrounds.firstOrNull() ?: palette.surface }

    Box(modifier.fillMaxSize().background(bgBrush)) {
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(top = headerTotalDp.dp, bottom = bottomClearance),
        ) {
            if (overviewSection != null && !searchExpanded) {
                item(key = "local-overview") {
                    LocalMusicOverviewCard(
                        section = overviewSection,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = horizontalMargin, end = horizontalMargin, top = 6.dp, bottom = 10.dp),
                        action = action,
                    )
                }
            }

            if (categoriesSection != null) {
                stickyHeader(key = "local-sticky-categories") {
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .background(stickyBackdrop.copy(alpha = 0.96f)),
                    ) {
                        LocalMusicCategoryBar(
                            section = categoriesSection,
                            horizontalMargin = horizontalMargin,
                            action = action,
                        )
                    }
                }
            }

            if (subheaderSection != null) {
                item(key = "local-subheader") {
                    LocalMusicSubheaderRow(
                        section = subheaderSection,
                        horizontalMargin = horizontalMargin,
                        action = action,
                    )
                }
            }

            if (folderGroupsSection != null && folderGroupsSection.items.isNotEmpty()) {
                items(
                    items = folderGroupsSection.items,
                    key = { "folder-row:${it.id}" },
                ) { item ->
                    LocalMusicEntityRow(
                        item = item,
                        horizontalMargin = horizontalMargin,
                        action = action,
                    )
                }
            }

            if (localSongsSection != null && songsCache != null && localSongsSection.total > 0) {
                if (localSongsSection.title.isNotBlank()) {
                    item(key = "local-folder-songs-heading") {
                        Text(
                            text = localSongsSection.title,
                            color = PageMuted,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(
                                    start = horizontalMargin,
                                    end = horizontalMargin,
                                    top = if (folderGroupsSection?.items?.isNotEmpty() == true) 16.dp else 4.dp,
                                    bottom = 6.dp,
                                ),
                        )
                    }
                }
                items(
                    count = localSongsSection.total,
                    key = { idx -> "local-song-row:${localSongsSection.dataKey}:$idx" },
                ) { index ->
                    val item = songsCache.get(localSongsSection, index)
                    if (item != null) {
                        LocalMusicSongRow(
                            item = item,
                            playing = localSongsSection.playing,
                            horizontalMargin = horizontalMargin,
                            action = action,
                        )
                    } else {
                        Spacer(Modifier.height(68.dp))
                        if (localSongsSection.request.isNotBlank()) {
                            LaunchedEffect(page.key, page.session, localSongsSection.dataKey, index / 100) {
                                if (songsCache.request(index, page.session)) {
                                    action(localSongsSection.request, "", (index / 100 * 100).toDouble())
                                }
                            }
                        }
                    }
                }
            }

            if (localGroupsSection != null && localGroupsSection.items.isNotEmpty()) {
                items(
                    items = localGroupsSection.items,
                    key = { "local-group-row:${it.id}" },
                ) { item ->
                    LocalMusicEntityRow(
                        item = item,
                        horizontalMargin = horizontalMargin,
                        action = action,
                    )
                }
            }

            if (emptySection != null) {
                item(key = "local-empty") {
                    LocalMusicEmptyCard(
                        section = emptySection,
                        horizontalMargin = horizontalMargin,
                        action = action,
                    )
                }
            }
        }

        // Fixed 56dp Compact Top Bar (or Expandable Top Search Bar)
        if (searchExpanded && searchSection != null) {
            LocalMusicTopSearchBar(
                safeTopDp = if (splitPane) 0f else page.safeTop,
                section = searchSection,
                horizontalMargin = horizontalMargin,
                backdrop = stickyBackdrop,
                action = action,
                onClose = {
                    searchExpanded = false
                    if (searchSection.value.isNotEmpty()) {
                        action(searchSection.action, "", 0.0)
                    }
                },
            )
        } else {
            LocalMusicTopBar(
                safeTopDp = if (splitPane) 0f else page.safeTop,
                title = page.title.ifBlank { "本地音乐" },
                horizontalMargin = horizontalMargin,
                backdrop = stickyBackdrop,
                onBack = { action("back", "", 0.0) },
                onSearch = { searchExpanded = true },
                onManage = { action("manage", "", 0.0) },
            )
        }
    }
}

@Composable
private fun LocalMusicTopBar(
    safeTopDp: Float,
    title: String,
    horizontalMargin: Dp,
    backdrop: Color,
    onBack: () -> Unit,
    onSearch: () -> Unit,
    onManage: () -> Unit,
) {
    val palette = LocalInterfacePalette.current
    Column(
        Modifier
            .fillMaxWidth()
            .background(backdrop.copy(alpha = 0.94f)),
    ) {
        if (safeTopDp > 0f) Spacer(Modifier.height(safeTopDp.dp))
        Row(
            Modifier
                .fillMaxWidth()
                .height(56.dp)
                .padding(
                    start = (horizontalMargin - 12.dp).coerceAtLeast(4.dp),
                    end = (horizontalMargin - 12.dp).coerceAtLeast(4.dp),
                ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ChromeButton("返回", size = 48.dp, onClick = onBack) {
                PageIcon("arrow-left", PageInk, Modifier.size(22.dp))
            }
            Text(
                text = title,
                color = PageInk,
                fontSize = 22.sp,
                fontWeight = FontWeight(650),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 2.dp),
            )
            ChromeButton("搜索本地音乐", size = 48.dp, onClick = onSearch) {
                PageIcon("search", PageInk, Modifier.size(22.dp))
            }
            ChromeButton("本地音乐与目录管理", size = 48.dp, onClick = onManage) {
                PageIcon("folder-cog", PageInk, Modifier.size(22.dp))
            }
        }
    }
}

@Composable
private fun LocalMusicTopSearchBar(
    safeTopDp: Float,
    section: NativePageSection,
    horizontalMargin: Dp,
    backdrop: Color,
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
            .background(backdrop.copy(alpha = 0.96f)),
    ) {
        if (safeTopDp > 0f) Spacer(Modifier.height(safeTopDp.dp))
        Row(
            Modifier
                .fillMaxWidth()
                .height(56.dp)
                .padding(
                    start = (horizontalMargin - 12.dp).coerceAtLeast(4.dp),
                    end = horizontalMargin,
                ),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            ChromeButton("收起搜索", size = 48.dp, onClick = onClose) {
                PageIcon("arrow-left", PageInk, Modifier.size(22.dp))
            }
            Row(
                Modifier
                    .weight(1f)
                    .height(40.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(palette.subtle)
                    .border(1.dp, palette.inputBorder, RoundedCornerShape(14.dp))
                    .padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                PageIcon("search", PageMuted, Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
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
                            Text(
                                text = section.placeholder.ifBlank { "搜索本地音乐" },
                                color = PageMuted,
                                fontSize = 14.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        inner()
                    },
                )
                if (draft.text.isNotEmpty()) {
                    ChromeButton("清空搜索", size = 36.dp, onClick = {
                        draft = TextFieldValue("")
                        action(section.action, "", 0.0)
                    }) {
                        PageIcon("x", PageMuted, Modifier.size(16.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun LocalMusicOverviewCard(
    section: NativePageSection,
    modifier: Modifier = Modifier,
    action: PageAction,
) {
    val palette = LocalInterfacePalette.current
    val playAllItem = section.items.firstOrNull { it.id == "play-all" }
    val shuffleItem = section.items.firstOrNull { it.id == "shuffle-all" }
    val manageItem = section.items.firstOrNull { it.id == "manage" }

    Column(
        modifier,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // 轻量无边框柔和概览条：告别厚重“框套框”
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(palette.subtle)
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(
                Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = "${section.total} 首本机歌曲",
                        color = PageInk,
                        fontSize = 17.sp,
                        fontWeight = FontWeight(650),
                        maxLines = 1,
                    )
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(palette.selected)
                            .padding(horizontal = 8.dp, vertical = 2.dp),
                    ) {
                        Text(
                            text = "离线直连",
                            color = PageAccent,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                }
                if (section.description.isNotBlank()) {
                    Text(
                        text = section.description,
                        color = PageMuted,
                        fontSize = 12.sp,
                        lineHeight = 17.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }

        // 听屿原生统一胶囊主次操作组（与集合详情页 MediaDetailActionsRow 视觉体系完全一致）
        if (section.total > 0 && playAllItem != null && shuffleItem != null) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    Modifier
                        .weight(1f)
                        .height(42.dp)
                        .clip(RoundedCornerShape(24.dp))
                        .background(palette.button)
                        .clickable(enabled = !playAllItem.disabled) { action(playAllItem.action, "", 0.0) }
                        .padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
                ) {
                    ChromeGlyph("play", palette.onAccent, Modifier.size(19.dp))
                    Text(
                        text = playAllItem.title,
                        color = palette.onAccent,
                        fontSize = 15.sp,
                        fontWeight = FontWeight(650),
                        maxLines = 1,
                    )
                }
                Row(
                    Modifier
                        .weight(1f)
                        .height(42.dp)
                        .clip(RoundedCornerShape(24.dp))
                        .background(palette.mediaSubtle)
                        .clickable(enabled = !shuffleItem.disabled) { action(shuffleItem.action, "", 0.0) }
                        .padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
                ) {
                    LocalShuffleIcon(color = PageInk, modifier = Modifier.size(17.dp))
                    Text(
                        text = shuffleItem.title,
                        color = PageInk,
                        fontSize = 14.sp,
                        fontWeight = FontWeight(600),
                        maxLines = 1,
                    )
                }
            }
        } else if (manageItem != null) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .height(42.dp)
                    .clip(RoundedCornerShape(24.dp))
                    .background(palette.button)
                    .clickable { action(manageItem.action, "", 0.0) }
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
            ) {
                PageIcon("folder-cog", palette.onAccent, Modifier.size(18.dp))
                Text(
                    text = "扫描 / 导入本地音乐",
                    color = palette.onAccent,
                    fontSize = 15.sp,
                    fontWeight = FontWeight(650),
                )
            }
        }
    }
}

@Composable
private fun LocalMusicCategoryBar(
    section: NativePageSection,
    horizontalMargin: Dp,
    action: PageAction,
) {
    val palette = LocalInterfacePalette.current
    Row(
        Modifier
            .fillMaxWidth()
            .height(44.dp)
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = horizontalMargin),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        section.items.forEach { item ->
            val pillShape = RoundedCornerShape(18.dp)
            Box(
                Modifier
                    .height(34.dp)
                    .clip(pillShape)
                    .background(if (item.selected) palette.selected else Color.Transparent)
                    .clickable(role = Role.Tab) { action(item.action, "", 0.0) }
                    .padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = item.title,
                    color = if (item.selected) PageInk else PageMuted,
                    fontSize = 14.sp,
                    fontWeight = if (item.selected) FontWeight.SemiBold else FontWeight.Normal,
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
private fun LocalMusicSubheaderRow(
    section: NativePageSection,
    horizontalMargin: Dp,
    action: PageAction,
) {
    val palette = LocalInterfacePalette.current
    var sortMenuOpen by remember { mutableStateOf(false) }
    val selectedSort = section.items.firstOrNull { it.selected }

    Column(
        Modifier
            .fillMaxWidth()
            .padding(start = horizontalMargin, end = horizontalMargin, top = 12.dp, bottom = 6.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (section.more.isNotBlank()) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(palette.subtle)
                    .clickable { action(section.more, "", 0.0) }
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                PageIcon("undo-2", PageAccent, Modifier.size(16.dp))
                Text(
                    text = section.moreLabel.ifBlank { "返回上一级" },
                    color = PageAccent,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                if (section.description.isNotBlank()) {
                    Text(
                        text = section.description,
                        color = PageMuted,
                        fontSize = 12.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }

        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 36.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = section.title,
                color = PageMuted,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            if (section.items.isNotEmpty()) {
                Box {
                    Row(
                        Modifier
                            .height(34.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(palette.subtle)
                            .clickable { sortMenuOpen = true }
                            .padding(horizontal = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        PageIcon("arrow-up-down", PageMuted, Modifier.size(14.dp))
                        Text(
                            text = selectedSort?.title ?: "排序",
                            color = PageInk,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                        )
                    }
                    LiquidDropdown(expanded = sortMenuOpen, onDismissRequest = { sortMenuOpen = false }) {
                        val menuInk = palette.menuInk
                        val menuAccent = palette.accent
                        section.items.forEach { item ->
                            DropdownMenuItem(
                                text = {
                                    Text(
                                        text = item.title,
                                        color = if (item.selected) menuAccent else menuInk,
                                        fontSize = 14.sp,
                                    )
                                },
                                trailingIcon = if (item.selected) {
                                    { PageIcon("check", menuAccent, Modifier.size(16.dp)) }
                                } else null,
                                onClick = {
                                    sortMenuOpen = false
                                    action(item.action, "", 0.0)
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LocalMusicSongRow(
    item: NativePageItem,
    playing: Boolean,
    horizontalMargin: Dp,
    action: PageAction,
) {
    val pressSource = rememberPressSource()
    Box(Modifier.padding(horizontal = horizontalMargin)) {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 68.dp)
                .chromeRowPressed(pressSource)
                .clickable(
                    interactionSource = pressSource,
                    indication = null,
                    enabled = !item.disabled && item.action.isNotBlank(),
                ) { action(item.action, "", 0.0) }
                .padding(vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(52.dp)) {
                PageArtwork(item.image, Modifier.size(52.dp), radius = 10.dp)
                if (item.selected) {
                    Box(
                        Modifier
                            .fillMaxSize()
                            .clip(RoundedCornerShape(10.dp))
                            .background(Color(0x52000000)),
                        contentAlignment = Alignment.Center,
                    ) {
                        LocalNowPlayingEqualizer(playing = playing)
                    }
                }
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    text = item.title,
                    color = if (item.selected) PageAccent else PageInk,
                    fontSize = 15.sp,
                    lineHeight = 20.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (item.subtitle.isNotBlank() || item.audioSpecs.isNotEmpty() || item.audioCached) {
                    NativeSongSubtitle(
                        item = item,
                        size = 12,
                        lineHeight = 18.sp,
                        modifier = Modifier.padding(top = 3.dp),
                    )
                }
            }
            if (item.duration.isNotBlank()) {
                Text(
                    text = item.duration,
                    color = PageMuted,
                    fontSize = 12.sp,
                    maxLines = 1,
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
            if (item.secondary.isNotBlank()) {
                ChromeButton(
                    item.secondaryLabel.ifBlank { item.title },
                    size = 48.dp,
                    onClick = { action(item.secondary, "", 0.0) },
                ) {
                    PageIcon("ellipsis-vertical", PageMuted, Modifier.size(18.dp))
                }
            }
        }
    }
}

@Composable
private fun LocalMusicEntityRow(
    item: NativePageItem,
    horizontalMargin: Dp,
    action: PageAction,
) {
    val palette = LocalInterfacePalette.current
    val pressSource = rememberPressSource()
    val glyphName = if (item.image.startsWith("glyph:")) item.image.removePrefix("glyph:") else ""

    Box(Modifier.padding(horizontal = horizontalMargin)) {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 68.dp)
                .chromeRowPressed(pressSource)
                .clickable(
                    interactionSource = pressSource,
                    indication = null,
                    enabled = item.action.isNotBlank(),
                ) { action(item.action, "", 0.0) }
                .padding(vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (glyphName.isNotBlank()) {
                Box(
                    Modifier
                        .size(52.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(palette.selected),
                    contentAlignment = Alignment.Center,
                ) {
                    PageIcon(glyphName, PageAccent, Modifier.size(22.dp))
                }
            } else {
                PageArtwork(item.image, Modifier.size(52.dp), radius = 10.dp)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    text = item.title,
                    color = PageInk,
                    fontSize = 15.sp,
                    lineHeight = 20.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (item.subtitle.isNotBlank()) {
                    Text(
                        text = item.subtitle,
                        color = PageMuted,
                        fontSize = 12.sp,
                        lineHeight = 17.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 3.dp),
                    )
                }
            }
            Spacer(Modifier.width(8.dp))
            PageIcon("chevron-right", PageMuted, Modifier.size(18.dp))
        }
    }
}

@Composable
private fun LocalMusicEmptyCard(
    section: NativePageSection,
    horizontalMargin: Dp,
    action: PageAction,
) {
    val palette = LocalInterfacePalette.current
    val shape = RoundedCornerShape(20.dp)
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = horizontalMargin, vertical = 16.dp)
            .clip(shape)
            .background(palette.card)
            .border(1.dp, palette.border, shape)
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(palette.selected),
            contentAlignment = Alignment.Center,
        ) {
            PageIcon("music2", PageAccent, Modifier.size(22.dp))
        }
        if (section.title.isNotBlank()) {
            Text(
                text = section.title,
                color = PageInk,
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
        if (section.text.isNotBlank()) {
            Text(
                text = section.text,
                color = PageMuted,
                fontSize = 13.sp,
                lineHeight = 19.sp,
            )
        }
        if (section.more.isNotBlank()) {
            Spacer(Modifier.height(4.dp))
            Row(
                Modifier
                    .height(40.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(palette.button)
                    .clickable { action(section.more, "", 0.0) }
                    .padding(horizontal = 18.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = section.moreLabel.ifBlank { "管理目录" },
                    color = palette.onAccent,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

@Composable
private fun LocalNowPlayingEqualizer(playing: Boolean) {
    if (!playing || LocalLiquidReduced.current) {
        ChromeGlyph(if (playing) "play" else "pause", Color.White, Modifier.size(13.dp))
        return
    }
    val transition = rememberInfiniteTransition(label = "local-now-playing-eq")
    val bars = List(3) { index ->
        transition.animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(420 + index * 90, easing = LinearEasing), RepeatMode.Reverse),
            label = "local-eq-$index",
        )
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        bars.forEach { bar ->
            val value by bar
            Box(
                Modifier
                    .size(3.dp, (5f + 6f * value).dp)
                    .clip(RoundedCornerShape(1.5.dp))
                    .background(LocalInterfacePalette.current.nowPlayingAccent),
            )
        }
    }
}

@Composable
private fun LocalShuffleIcon(color: Color, modifier: Modifier = Modifier) {
    val paint = remember {
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 2f
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
        }
    }
    val paths = remember {
        listOf(
            Path().apply {
                moveTo(16f, 3f); lineTo(21f, 3f); lineTo(21f, 8f)
            },
            Path().apply {
                moveTo(4f, 20f); lineTo(21f, 3f)
            },
            Path().apply {
                moveTo(21f, 16f); lineTo(21f, 21f); lineTo(16f, 21f)
            },
            Path().apply {
                moveTo(15f, 15f); lineTo(21f, 21f)
            },
            Path().apply {
                moveTo(4f, 4f); lineTo(9f, 9f)
            },
        )
    }
    Canvas(modifier) {
        drawIntoCanvas { canvas ->
            paint.color = color.toArgb()
            val native = canvas.nativeCanvas
            native.save()
            native.scale(size.width / 24f, size.height / 24f)
            paths.forEach { native.drawPath(it, paint) }
            native.restore()
        }
    }
}
