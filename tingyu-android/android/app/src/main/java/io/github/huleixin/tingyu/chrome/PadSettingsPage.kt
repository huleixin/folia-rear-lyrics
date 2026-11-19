package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
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

// Tablet master-detail settings: left global nav + middle full settings list + right live subpage detail.
@Composable
internal fun PadSettingsPage(
    page: NativePage,
    modifier: Modifier,
    action: PageAction,
    activeAction: String = "",
    detailContent: (@Composable () -> Unit)? = null,
) {
    val window = LocalPadWindow.current
    val palette = LocalInterfacePalette.current
    val groups = remember(page.sections) { page.sections.filter { it.id != "rear" } }
    val hostBottom = with(LocalDensity.current) { LocalNativePageBottomPx.current.toDp() }
    val bottomPadding = maxOf(hostBottom, (page.safeBottom + if (window.expanded) 96 else 36).dp)
    val startInset = if (window.expanded) 114.dp else window.pageHorizontalMargin.dp
    val endInset = window.pageHorizontalMargin.dp
    val topInset = (page.safeTop + if (window.shortWindow) 14 else 24).dp
    val directoryWidth = (window.settingsDirectoryWidth + 24f).coerceIn(260f, 320f).dp

    Row(modifier.fillMaxSize().padding(start = startInset)) {
        Column(
            Modifier
                .width(directoryWidth)
                .fillMaxHeight()
                .padding(top = topInset)
        ) {
            Text(
                page.title,
                color = PageInk,
                fontSize = if (window.shortWindow) 26.sp else 32.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(if (window.shortWindow) 12.dp else 18.dp))
            LazyColumn(
                Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .testTag("pad-settings-directory"),
                contentPadding = PaddingValues(top = 4.dp, bottom = bottomPadding),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                items(groups, key = { it.id }) { section ->
                    Column {
                        if (section.title.isNotBlank()) {
                            Row(
                                Modifier.padding(start = 4.dp, end = 4.dp, bottom = 6.dp).heightIn(min = 20.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                PageIcon(
                                    SettingsGroupIcons[section.id] ?: "settings2",
                                    palette.settingsGroup,
                                    Modifier.size(15.dp),
                                )
                                Text(
                                    section.title,
                                    color = palette.settingsGroup,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    lineHeight = 16.sp,
                                )
                            }
                        }
                        if (section.layout == "rows" && section.items.isNotEmpty()) {
                            SettingsCard {
                                section.items.forEachIndexed { index, item ->
                                    if (index > 0) {
                                        Box(
                                            Modifier
                                                .fillMaxWidth()
                                                .padding(start = 54.dp, end = 12.dp)
                                                .height(0.8.dp)
                                                .background(palette.settingsDivider)
                                        )
                                    }
                                    val selected = activeAction.isNotBlank() && item.action == activeAction
                                    val rowModifier = if (selected) {
                                        Modifier
                                            .background(palette.settingsAccentSurface.copy(alpha = 0.13f))
                                            .border(1.dp, palette.settingsAccentSurface.copy(alpha = 0.28f), RoundedCornerShape(12.dp))
                                    } else Modifier
                                    NativeSettingsRow(item, modifier = rowModifier, inset = 12.dp, action = action)
                                }
                            }
                        } else if (section.text.isNotBlank()) {
                            SettingsCard {
                                Text(
                                    section.text,
                                    color = PageMuted,
                                    fontSize = 12.sp,
                                    modifier = Modifier.padding(14.dp),
                                )
                            }
                        }
                    }
                }
            }
        }

        Box(
            Modifier
                .weight(1f)
                .fillMaxHeight()
                .padding(end = endInset)
                .testTag("pad-settings-detail"),
            contentAlignment = Alignment.TopCenter,
        ) {
            if (detailContent != null) {
                detailContent()
            } else {
                Box(Modifier.fillMaxSize().padding(top = topInset), contentAlignment = Alignment.Center) {
                    Text("从左侧选择设置项", color = PageMuted, fontSize = 14.sp)
                }
            }
        }
    }
}
