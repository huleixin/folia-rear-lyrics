package io.github.huleixin.tingyu.chrome

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/SettingsFlowPage.kt
//
// 设置二级页的原生外框（原生化专项·第 22 轮）。
//
// 背景：设置二级页此前由 NativeSettingsDocumentView 用「DOM 测量 + Canvas 复刻」绘制，
// 整页（含顶栏、分组卡、每一行文字）都是 WebView 里量出来的绝对坐标。语义化设置页
// （TySettingsPageView）只负责内容，页面级的三件事必须另有人管：
//
//   1. 顶部固定栏 —— 返回 + 标题，并让内容滚到玻璃后方（复用 TopGlassBar，与设置索引页、
//      集合详情页同一套沉浸式顶栏，不再各页手写模糊）；
//   2. 系统返回手势 —— BackHandler 先交给面板/弹层，再退设置分区；
//   3. 页面底色 —— 深色是三段墨绿渐变，浅色取界面浅色底（与设置索引页完全一致）。
//
// 于是所有设置二级页共享同一套：顶栏、底色、滚动、间距、深浅色、返回与动画。
// 本文件是这套外框的唯一实现，任何设置页都不允许再自己画一份标题栏。

/** 设置页表面色：取自设计系统既有 token（与 NativeSettingsPage 的 SettingsCard 一致）。 */
@Composable
internal fun settingsFlowTheme(): TyPanelTheme {
    val light = LocalInterfacePalette.current.light
    return TyPanelTheme.of(light).copy(
        surface = interfaceColor(Color(0xFF061D16), LightInterfaceColors.Sheet),
        card = interfaceColor(Color(0x3323493B), LightInterfaceColors.Card),
        text = interfaceColor(Color(0xFFE8F4ED), LightInterfaceColors.Ink),
        muted = interfaceColor(Color(0xFF9EB3AA), LightInterfaceColors.Muted),
        accent = interfaceColor(Color(0xFF74D9BA), LightInterfaceColors.Accent),
        line = interfaceColor(Color(0x1FA5CDB9), LightInterfaceColors.Border),
    )
}

/**
 * 一张语义化设置二级页的完整呈现：底色 + 毛玻璃固定顶栏（返回 / 标题）+ 原生内容。
 *
 * `action` 的动作命名与语义化节点一致（见 TySettingEvent）；返回统一发 `back`。
 */
@Composable
internal fun SettingsFlowPage(
    flow: TySettingsPage,
    page: NativePage,
    modifier: Modifier = Modifier,
    action: PageAction,
) {
    val theme = settingsFlowTheme()
    val colors = page.surfaceColors()
    // 返回：更内层的面板/弹层各自有 BackHandler，会先吃掉；到这里才是退设置分区。
    BackHandler(enabled = true) { action("back", "", 0.0) }
    BoxWithConstraints(modifier) {
        val inset = if (maxWidth < 374.dp) 18.dp else 22.dp
        val glass = rememberTyTopGlassState(estimateHeaderBottomDp = page.safeTop + 72f)
        Box(Modifier.fillMaxSize()) {
            TyTopGlassContentLayer(
                glass, colors, ambientImage = null, ambientViewportHeight = null,
                modifier = Modifier.fillMaxSize(),
            ) {
                TySettingsPageView(
                    page = flow,
                    theme = theme,
                    modifier = Modifier.fillMaxSize(),
                    contentTop = glass.contentTop,
                    bottomPadding = (24 + page.safeBottom).dp,
                    onAction = action,
                )
            }
            TyTopGlassSurface(glass, colors)
            // 顶栏清晰层：返回 + 标题。绘制在玻璃之上，只吃自己的点击。
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(start = inset - 8.dp, end = inset, top = (page.safeTop + 14).dp, bottom = 12.dp)
                    .heightIn(min = 44.dp)
                    .onGloballyPositioned { glass.reportHeader(it.positionInWindow().y, it.size.height) },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier
                        .size(44.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .semantics { contentDescription = "返回" }
                        .chromeClickable(role = Role.Button, scaleTo = .94f) { action("back", "", 0.0) },
                    contentAlignment = Alignment.Center,
                ) {
                    PageIcon("chevron-left", theme.text, Modifier.size(24.dp))
                }
                Text(
                    flow.title.ifBlank { page.title },
                    color = theme.text,
                    fontSize = 19.sp,
                    lineHeight = 25.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(start = 4.dp).weight(1f),
                )
            }
        }
    }
}
