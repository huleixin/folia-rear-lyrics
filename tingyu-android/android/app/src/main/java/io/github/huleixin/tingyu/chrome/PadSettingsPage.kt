package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// Tablet master-detail settings: left category directory + right bounded detail pane.
@Composable
internal fun PadSettingsPage(page: NativePage, modifier: Modifier, action: PageAction) {
    val window = LocalPadWindow.current
    val palette = LocalInterfacePalette.current
    val groups = remember(page.sections) { page.sections.filter { it.id != "rear" } }
    var selectedGroupId by rememberSaveable(page.key) { mutableStateOf(groups.firstOrNull()?.id.orEmpty()) }
    LaunchedEffect(groups) {
        if (groups.isNotEmpty() && groups.none { it.id == selectedGroupId }) {
            selectedGroupId = groups.first().id
        }
    }
    val activeGroup = groups.firstOrNull { it.id == selectedGroupId } ?: groups.firstOrNull()
    val hostBottom = with(LocalDensity.current) { LocalNativePageBottomPx.current.toDp() }
    val bottomPadding = maxOf(hostBottom, (page.safeBottom + 28).dp)
    val startInset = if (window.expanded) 114.dp else window.pageHorizontalMargin.dp
    val endInset = window.pageHorizontalMargin.dp
    val topInset = (page.safeTop + if (window.shortWindow) 14 else 24).dp

    Column(
        modifier
            .padding(start = startInset, end = endInset, top = topInset)
    ) {
        Text(
            page.title,
            color = PageInk,
            fontSize = if (window.shortWindow) 26.sp else 32.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(if (window.shortWindow) 16.dp else 22.dp))
        Row(
            Modifier.weight(1f).fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(if (window.sizeClass == PadSizeClass.LARGE) 28.dp else 20.dp),
        ) {
            LazyColumn(
                Modifier
                    .width(window.settingsDirectoryWidth.dp)
                    .fillMaxHeight()
                    .testTag("pad-settings-directory"),
                contentPadding = PaddingValues(bottom = bottomPadding),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                items(groups, key = { it.id }) { section ->
                    val selected = section.id == activeGroup?.id
                    val bg = if (selected) palette.card else Color.Transparent
                    val borderColor = if (selected) palette.settingsAccentSurface.copy(alpha = 0.28f) else Color.Transparent
                    val iconTint = if (selected) palette.settingsAccentSurface else palette.settingsGroup
                    val titleColor = if (selected) palette.settingsInk else palette.settingsMuted
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(bg)
                            .then(if (selected) Modifier.border(1.dp, borderColor, RoundedCornerShape(14.dp)) else Modifier)
                            .chromeClickable(corner = 14.dp) { selectedGroupId = section.id }
                            .padding(horizontal = 14.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(
                            Modifier
                                .size(32.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(
                                    if (selected) palette.settingsAccentSurface.copy(alpha = 0.14f)
                                    else palette.settingsIconSurface
                                ),
                            contentAlignment = Alignment.Center,
                        ) {
                            PageIcon(SettingsGroupIcons[section.id] ?: "settings2", iconTint, Modifier.size(17.dp))
                        }
                        Column(Modifier.weight(1f)) {
                            Text(
                                section.title.ifBlank { section.id },
                                color = titleColor,
                                fontSize = 14.sp,
                                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            if (section.items.isNotEmpty()) {
                                Text(
                                    "${section.items.size} 项",
                                    color = palette.settingsMuted,
                                    fontSize = 11.sp,
                                    maxLines = 1,
                                )
                            }
                        }
                    }
                }
            }

            Box(
                Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .testTag("pad-settings-detail"),
                contentAlignment = Alignment.TopStart,
            ) {
                if (activeGroup != null) {
                    LazyColumn(
                        Modifier
                            .fillMaxSize()
                            .widthIn(max = window.settingsDetailMaxWidth.dp),
                        contentPadding = PaddingValues(bottom = bottomPadding),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        if (activeGroup.title.isNotBlank()) {
                            item(key = "header:${activeGroup.id}") {
                                Row(
                                    Modifier.padding(start = 4.dp, bottom = 2.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    PageIcon(
                                        SettingsGroupIcons[activeGroup.id] ?: "settings2",
                                        palette.settingsGroup,
                                        Modifier.size(16.dp),
                                    )
                                    Text(
                                        activeGroup.title,
                                        color = palette.settingsGroup,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                }
                            }
                        }
                        if (activeGroup.layout == "rows" && activeGroup.items.isNotEmpty()) {
                            item(key = "card:${activeGroup.id}") {
                                SettingsCard {
                                    activeGroup.items.forEachIndexed { index, item ->
                                        if (index > 0) {
                                            Box(
                                                Modifier
                                                    .fillMaxWidth()
                                                    .padding(start = 62.dp, end = 14.dp)
                                                    .height(0.8.dp)
                                                    .background(palette.settingsDivider)
                                            )
                                        }
                                        NativeSettingsRow(item, action = action)
                                    }
                                }
                            }
                        } else if (activeGroup.text.isNotBlank()) {
                            item(key = "text:${activeGroup.id}") {
                                SettingsCard {
                                    Text(
                                        activeGroup.text,
                                        color = PageMuted,
                                        fontSize = 13.sp,
                                        modifier = Modifier.padding(16.dp),
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
