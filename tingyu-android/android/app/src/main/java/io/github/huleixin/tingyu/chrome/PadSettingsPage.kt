package io.github.huleixin.tingyu.chrome

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.huleixin.tingyu.RearLyricsCoordinator

internal fun isRearItemSupportedOnTablet(item: NativePageItem, rearHardwareSupported: Boolean): Boolean {
    if (item.id != "rear-entry" && item.action != "rear:open" && !item.action.startsWith("rear:")) return true
    if (rearHardwareSupported) return true
    val sub = item.subtitle.trim()
    if (sub.isEmpty()) return false
    val supportedCapabilityMarkers = listOf(
        "已检测到背屏",
        "等待授权",
        "请授予",
        "背屏已活跃",
        "等待背屏",
        "已退回系统",
        "休眠中",
        "相机占用",
    )
    return supportedCapabilityMarkers.any { sub.contains(it, ignoreCase = true) }
}

internal fun filterSettingsSectionsForDevice(
    sections: List<NativePageSection>,
    tablet: Boolean,
    rearHardwareSupported: Boolean = false,
): List<NativePageSection> {
    if (!tablet) return sections
    return sections.mapNotNull { section ->
        if (section.id == "rear" && !rearHardwareSupported) {
            return@mapNotNull null
        }
        val filteredItems = section.items.filter { isRearItemSupportedOnTablet(it, rearHardwareSupported) }
        if (filteredItems.isEmpty() && section.items.isNotEmpty() && section.text.isBlank()) {
            null
        } else if (filteredItems.size == section.items.size) {
            section
        } else {
            section.copy(items = filteredItems)
        }
    }
}

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
    val context = LocalContext.current
    val rearSupported = remember(context) { RearLyricsCoordinator.hasRearDisplayHardware(context) }
    val groups = remember(page.sections, rearSupported) {
        filterSettingsSectionsForDevice(page.sections, tablet = true, rearHardwareSupported = rearSupported)
    }
    val hostBottom = with(LocalDensity.current) { LocalNativePageBottomPx.current.toDp() }
    val bottomPadding = maxOf(hostBottom, (page.safeBottom + if (window.expanded) 96 else 36).dp)
    val startInset = if (window.expanded) 114.dp else window.pageHorizontalMargin.dp
    val topInset = (page.safeTop + if (window.shortWindow) 14 else 24).dp
    val directoryWidth = (window.settingsDirectoryWidth + 24f).coerceIn(260f, 320f).dp
    val surfaceBrush = Brush.verticalGradient(page.surfaceColors())

    // Always paint an opaque surface behind the left nav gutter and middle settings list so
    // layerBackdrop(backdrop) and HWUI never composite liquid-glass shadows or scrolled rows
    // onto transparent/uncleared framebuffer pixels when the right detail pane is a document page.
    Row(modifier.fillMaxSize()) {
        Box(
            Modifier
                .width(startInset + directoryWidth)
                .fillMaxHeight()
                .background(surfaceBrush)
                .clipToBounds()
        ) {
            Column(
                Modifier
                    .fillMaxSize()
                    .padding(start = startInset, top = topInset)
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
                        .clipToBounds()
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
                                        val rowBg by animateColorAsState(
                                            targetValue = if (selected) palette.settingsAccentSurface.copy(alpha = 0.14f) else Color.Transparent,
                                            animationSpec = tween(durationMillis = 200),
                                            label = "pad-settings-row-bg",
                                        )
                                        val rowModifier = Modifier
                                            .padding(horizontal = 4.dp, vertical = 3.dp)
                                            .clip(RoundedCornerShape(12.dp))
                                            .background(rowBg)
                                            .let { if (selected) it.testTag("pad-settings-row-selected") else it }
                                        NativeSettingsRow(item, modifier = rowModifier, inset = 10.dp, selectedAccent = selected, action = action)
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
        }

        Box(
            Modifier
                .weight(1f)
                .fillMaxHeight()
                .clipToBounds()
                .testTag("pad-settings-detail"),
            contentAlignment = Alignment.TopCenter,
        ) {
            if (detailContent != null) {
                detailContent()
            } else {
                Box(
                    Modifier
                        .fillMaxSize()
                        .background(surfaceBrush)
                        .padding(top = topInset),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("从左侧选择设置项", color = PageMuted, fontSize = 14.sp)
                }
            }
        }
    }
}
