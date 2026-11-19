package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeSettingsPage.kt
// 设置页：统一可折叠顶部栏(72dp->56dp)、16dp圆角分组卡片、64dp最小行高及语义化图标。

private val SettingIcons = mapOf(
    "platform-accounts" to "user-round",
    "desktop-lyrics" to "monitor",
    "bluetooth-lyrics" to "car",
    "rear-entry" to "captions",
    "discovery-settings" to "compass",
    "search-settings" to "search",
    "appearance" to "sparkles",
    "general" to "languages",
    "playback" to "play-circle",
    "interaction" to "keyboard",
    "integration" to "server",
    "storage" to "database",
    "graphics" to "gauge",
    "lab" to "flask-conical",
    "developer" to "terminal",
    "about" to "circle-help",
    "adaptation" to "smartphone",
    "state" to "activity",
    "guide" to "info",
    "coffee" to "coffee",
    "community" to "messages-square",
)

internal val SettingsGroupIcons = mapOf(
    "accounts-service" to "user-round",
    "lyrics-output" to "captions",
    "rear" to "captions",
    "discovery" to "compass",
    "appearance" to "sparkles",
    "controls" to "play-circle",
    "connections" to "database",
    "system" to "settings2",
    "support" to "heart",
)

@Composable
internal fun NativeSettingsPage(page: NativePage, modifier: Modifier, action: PageAction) {
    if (LocalPadWindow.current.settingsDualPane) {
        PadSettingsPage(page, modifier, action)
        return
    }
    val bottomClearance = with(LocalDensity.current) { LocalNativePageBottomPx.current.toDp() }
    val tablet = LocalPadWindow.current.tablet
    val reduced = LocalLiquidReduced.current

    BoxWithConstraints(modifier) {
        val inset = UnifiedHeaderTokens.HorizontalPadding
        val colors = page.surfaceColors()
        val list = rememberLazyListState()
        val collapseProgress by rememberCollapsingProgress(list, 16.dp, reduced)
        val glass = rememberTyTopGlassState(estimateHeaderBottomDp = page.safeTop + 72f)

        Box(Modifier.fillMaxSize()) {
            TyTopGlassContentLayer(glass, colors, ambientImage = null, ambientViewportHeight = null, modifier = Modifier.fillMaxSize()) {
                LazyColumn(
                    Modifier.fillMaxSize(),
                    state = list,
                    contentPadding = PaddingValues(
                        start = inset,
                        end = inset,
                        top = (page.safeTop + 72f + 8f).dp,
                        bottom = maxOf((24 + page.safeBottom).dp, bottomClearance)
                    )
                ) {
                    page.sections.filter { !tablet || it.id != "rear" }.forEach { section ->
                        item(key = section.id) {
                            Column(Modifier.padding(bottom = 20.dp)) {
                                if (section.title.isNotBlank()) {
                                    Row(
                                        Modifier.padding(start = 2.dp, end = 2.dp, bottom = 8.dp).heightIn(min = 20.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        PageIcon(SettingsGroupIcons[section.id] ?: "settings2", LocalInterfacePalette.current.settingsGroup, Modifier.size(16.dp))
                                        Text(
                                            section.title,
                                            color = LocalInterfacePalette.current.settingsGroup,
                                            fontSize = 13.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            lineHeight = 18.sp
                                        )
                                    }
                                }
                                if (section.id == "rear") NativeRearSettings(section, action)
                                else if (section.layout == "rows") SettingsCard {
                                    section.items.forEachIndexed { index, item ->
                                        if (index > 0) {
                                            Box(
                                                Modifier
                                                    .fillMaxWidth()
                                                    .padding(start = 62.dp, end = 14.dp)
                                                    .height(0.8.dp)
                                                    .background(LocalInterfacePalette.current.settingsDivider)
                                            )
                                        }
                                        NativeSettingsRow(item, action = action)
                                    }
                                } else {
                                    Text(section.text, color = PageMuted, fontSize = 12.sp)
                                }
                            }
                        }
                    }
                }
            }
            val scrolled = list.firstVisibleItemIndex > 0 || list.firstVisibleItemScrollOffset > 0
            if (scrolled) TyTopGlassSurface(glass, colors)
            TyTopGlassForeground {
                Box(Modifier.onGloballyPositioned { glass.reportHeader(it.positionInWindow().y, it.size.height) }) {
                    UnifiedCollapsingHeader(
                        title = page.title,
                        safeTopDp = page.safeTop.toFloat(),
                        expandedHeightDp = 72f,
                        collapsedHeightDp = 56f,
                        progress = collapseProgress,
                        horizontalPadding = inset,
                        headerBackgroundColor = if (scrolled) colors.first() else androidx.compose.ui.graphics.Color.Transparent,
                        action = action
                    )
                }
            }
        }
    }
}

@Composable
internal fun SettingsCard(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(LocalInterfacePalette.current.card),
        content = content
    )
}

@Composable
internal fun NativeSettingsRow(item: NativePageItem, modifier: Modifier = Modifier, inset: Dp = 14.dp, action: PageAction) {
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = 64.dp)
            .chromeClickable(enabled=item.action.isNotBlank()&&!item.disabled,corner=12.dp) { action(item.action, "", 0.0) }
            .padding(horizontal = inset, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box(
            Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(LocalInterfacePalette.current.settingsIconSurface),
            contentAlignment = Alignment.Center
        ) {
            PageIcon(SettingIcons[item.id] ?: "settings2", LocalInterfacePalette.current.settingsIcon, Modifier.size(20.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(
                item.title,
                color = LocalInterfacePalette.current.settingsInk,
                fontSize = 15.sp,
                lineHeight = 20.sp,
                fontWeight = FontWeight.SemiBold
            )
            if (item.subtitle.isNotBlank()) {
                Text(
                    item.subtitle,
                    color = if (item.selected) LocalInterfacePalette.current.settingsAccentSurface else LocalInterfacePalette.current.settingsMuted,
                    fontSize = 12.sp,
                    lineHeight = 17.sp,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
        }
        if (item.secondary.isNotBlank()) {
            Text(
                item.secondaryLabel,
                color = LocalInterfacePalette.current.settingsAccentSurface,
                fontSize = 12.sp,
                modifier = Modifier.chromeClickable(corner = 8.dp) { action(item.secondary, "", 0.0) }.padding(vertical = 10.dp)
            )
        } else if (item.action.isNotBlank()) {
            PageIcon("chevron-right", LocalInterfacePalette.current.settingsChevron, Modifier.size(16.dp))
        }
    }
}

@Composable
private fun NativeRearSettings(section: NativePageSection, action: PageAction) {
    val item = section.items.firstOrNull() ?: return
    SettingsCard {
        NativeSettingsRow(item, action = action)
    }
}
