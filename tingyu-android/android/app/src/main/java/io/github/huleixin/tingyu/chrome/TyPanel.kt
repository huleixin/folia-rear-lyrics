package io.github.huleixin.tingyu.chrome

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import io.github.huleixin.tingyu.minimal.ui.CheckGlyph
import kotlin.math.roundToInt

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/TyPanel.kt
//
// 统一二级面板渲染层：Sheet / Dialog / Menu 三种容器 + 六种内容块。
//
// 这一层只做三件事：
//   1. 把 TyPanel 画出来（视觉全部取自 TyPanelTheme，没有页面自定义色）；
//   2. 命中后把动作 id 原样回传（不解释语义，不做业务判断）；
//   3. 处理返回、遮罩、键盘、焦点与深浅色。
//
// 因此"新增一个二级操作面板"= React 侧拼一个 TyPanelModel，Kotlin 一行不改。

// ---------------------------------------------------------------------------
// 容器
// ---------------------------------------------------------------------------

/** 底部上滑面板容器：圆角 22dp、内容超高才滚动、键盘避让、返回键关闭。 */
@Composable
internal fun TySheetFrame(
    theme: TyPanelTheme,
    title: String,
    subtitle: String,
    heightFraction: Float,
    onClose: () -> Unit,
    headerExtra: @Composable () -> Unit = {},
    footer: (@Composable () -> Unit)? = null,
    /**
     * 内容是否由本容器滚动。true（默认）适合普通动作列表；false 用于内容自己就是
     * 一个 LazyColumn / 自带拖拽排序的长列表（队列抽屉、效果器页）—— 外面再套一层
     * verticalScroll 会和内层滚动抢手势。
     */
    scrollContent: Boolean = true,
    content: @Composable ColumnScope.() -> Unit,
) {
    BackHandler(enabled = true) { onClose() }
    // 遮罩由宿主统一画（TyPanelScrim），面板本体只滑自己。
    BoxWithConstraints(Modifier.fillMaxSize().imePadding()) {
        val maxSheetHeight = maxHeight * heightFraction
        Column(
            Modifier
                .fillMaxWidth()
                .heightIn(max = maxSheetHeight)
                .clip(RoundedCornerShape(topStart = TyPanelDims.TopRadius.dp, topEnd = TyPanelDims.TopRadius.dp))
                .background(theme.surface)
                .align(Alignment.BottomCenter),
        ) {
            TyPanelHeader(theme, title, subtitle, onClose, headerExtra)
            Column(
                Modifier
                    .fillMaxWidth()
                    .weight(1f, fill = false)
                    .then(if (scrollContent) Modifier.verticalScroll(rememberScrollState()) else Modifier)
                    .padding(horizontal = TyPanelDims.HorizontalPadding.dp),
                content = content,
            )
            if (footer != null) {
                Box(Modifier.fillMaxWidth().padding(horizontal = TyPanelDims.HorizontalPadding.dp)) { footer() }
            }
            Spacer(Modifier.height(TyPanelDims.BottomPadding.dp))
        }
    }
}

/** 居中卡片容器：宽不超过 400dp，内容超高才滚动。 */
@Composable
internal fun TyDialogFrame(
    theme: TyPanelTheme,
    title: String,
    subtitle: String,
    onClose: () -> Unit,
    settingsLayout: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    BackHandler(enabled = true) { onClose() }
    BoxWithConstraints(Modifier.fillMaxSize().imePadding(), contentAlignment = Alignment.Center) {
        val maxCardHeight = maxHeight * 0.82f
        Column(
            Modifier
                .widthIn(max = 400.dp)
                .fillMaxWidth(0.92f)
                .heightIn(max = maxCardHeight)
                .clip(RoundedCornerShape(TyPanelDims.DialogRadius.dp))
                .background(theme.surface)
                .padding(horizontal = if(settingsLayout)24.dp else TyPanelDims.HorizontalPadding.dp),
        ) {
            if (title.isNotBlank()) {
                Spacer(Modifier.height(20.dp))
                Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) {
                    Text(title, color=theme.text,fontSize=if(settingsLayout)20.sp else 17.sp,lineHeight=if(settingsLayout)28.sp else 23.sp,
                        fontWeight=if(settingsLayout)FontWeight.Bold else FontWeight.SemiBold,modifier=Modifier.weight(1f))
                    if(settingsLayout)Box(Modifier.size(32.dp).clip(RoundedCornerShape(999.dp)).semantics{contentDescription="关闭"}
                        .chromeClickable(role=Role.Button){onClose()},contentAlignment=Alignment.Center){PageIcon("x",theme.muted,Modifier.size(18.dp))}
                }
                if (subtitle.isNotBlank()) {
                    Spacer(Modifier.height(6.dp))
                    Text(subtitle, color = theme.muted, fontSize = 12.5.sp, lineHeight = 18.sp)
                }
                Spacer(Modifier.height(12.dp))
            } else Spacer(Modifier.height(16.dp))
            Column(Modifier.fillMaxWidth().weight(1f, fill = false).verticalScroll(rememberScrollState()), content = content)
            Spacer(Modifier.height(18.dp))
        }
    }
}

/**
 * 贴触发元素展开的浮层菜单。
 *
 * 定位策略：以锚点矩形为准，向左下展开；下方空间不足时向上翻；四周各留 12dp 安全边距。
 * 拿不到可用锚点（或屏幕过小）时由调用方退化为 sheet —— 菜单可以变形状，不能消失。
 */
@Composable
internal fun TyMenuFrame(
    theme: TyPanelTheme,
    panel: TyPanel,
    onAction: (String, String, Double) -> Unit,
    onClose: () -> Unit,
) {
    BackHandler(enabled = true) { onClose() }
    val density = LocalDensity.current
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val screenW = maxWidth
        val screenH = maxHeight
        val margin = 12.dp
        val menuWidth = minOf(screenW - margin * 2, 264.dp)
        val anchorLeft = with(density) { panel.anchor.x.toDp() }
        val anchorBottom = with(density) { (panel.anchor.y + panel.anchor.h).toDp() }
        val anchorTop = with(density) { panel.anchor.y.toDp() }
        // 菜单估算高度：标题 44 + 每行 46，上限屏高 60%；用估算值决定向上还是向下。
        val rows = panel.blocks.sumOf { block -> if (block is TyPanelBlock.Actions) block.items.size else 1 }
        val estimated = (52 + rows * 46).dp.coerceAtMost(screenH * 0.6f)
        val openUp = anchorBottom + estimated + margin > screenH && anchorTop - estimated - margin > 0.dp
        val x = anchorLeft.coerceIn(margin, (screenW - menuWidth - margin).coerceAtLeast(margin))
        val y = if (openUp) (anchorTop - estimated - 6.dp) else (anchorBottom + 6.dp)
        Popup(
            offset = IntOffset(with(density) { x.roundToPx() }, with(density) { y.roundToPx() }),
            onDismissRequest = onClose,
            properties = PopupProperties(focusable = true, dismissOnBackPress = true, dismissOnClickOutside = true),
        ) {
            Column(
                Modifier
                    .widthIn(max = menuWidth)
                    .clip(RoundedCornerShape(16.dp))
                    .background(theme.surface)
                    .border(1.dp, theme.line, RoundedCornerShape(16.dp))
                    .padding(vertical = 6.dp),
            ) {
                if (panel.title.isNotBlank()) {
                    Text(
                        panel.title,
                        color = theme.muted,
                        fontSize = 11.5.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                    )
                }
                panel.blocks.forEach { block ->
                    when (block) {
                        is TyPanelBlock.Actions -> block.items.forEach { item ->
                            TyActionRow(theme, item, enabled = !panel.busy) {
                                if (item.selected || item.tone == "danger") onClose()
                                onAction(TyPanelEvent.action(item.id), "", 0.0)
                            }
                        }
                        is TyPanelBlock.Note -> TyNoteLine(theme, block)
                        else -> Unit // menu 只承载动作，其余块类型由 sheet 承担。
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// 标题与通用件
// ---------------------------------------------------------------------------

@Composable
internal fun TyPanelHeader(
    theme: TyPanelTheme,
    title: String,
    subtitle: String,
    onClose: () -> Unit,
    headerExtra: @Composable () -> Unit = {},
) {
    Row(
        Modifier.fillMaxWidth().padding(start = TyPanelDims.HorizontalPadding.dp, end = 12.dp, top = 14.dp, bottom = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, color = theme.text, fontSize = 18.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold,
                maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (subtitle.isNotBlank()) {
                Spacer(Modifier.height(3.dp))
                Text(subtitle, color = theme.muted, fontSize = 12.sp, lineHeight = 17.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        headerExtra()
        TyCloseButton(theme, onClose)
    }
    Spacer(Modifier.height(8.dp))
}

@Composable
internal fun TyCloseButton(theme: TyPanelTheme, onClose: () -> Unit, label: String = "关闭") {
    Box(
        Modifier
            .size(44.dp)
            .semantics { contentDescription = label }
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = onClose),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(17.dp)) {
            val u = size.minDimension / 17f
            val w = 1.8f * u
            drawLine(theme.text, Offset(3f * u, 3f * u), Offset(14f * u, 14f * u), w, androidx.compose.ui.graphics.StrokeCap.Round)
            drawLine(theme.text, Offset(14f * u, 3f * u), Offset(3f * u, 14f * u), w, androidx.compose.ui.graphics.StrokeCap.Round)
        }
    }
}

/** 一行动作。触摸目标 ≥48dp；选中/危险/禁用各有明确视觉，不靠颜色单通道表达。 */
@Composable
internal fun TyActionRow(
    theme: TyPanelTheme,
    item: TyPanelAction,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val active = enabled && !item.disabled
    val ink = when {
        !active -> theme.muted.copy(alpha = 0.45f)
        item.tone == "danger" -> theme.danger
        item.selected -> theme.accent
        else -> theme.text
    }
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = TyPanelDims.ActionRowMinHeight.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (pressed && active) theme.card else Color.Transparent)
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = active,
                role = Role.Button,
                onClick = onClick,
            )
            .padding(horizontal = 4.dp, vertical = 10.dp)
            .alpha(if (item.disabled) 0.55f else 1f),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (item.icon.isNotBlank()) {
            Box(Modifier.size(19.dp)) { PageIcon(item.icon, ink, Modifier.fillMaxSize()) }
            Spacer(Modifier.size(12.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(item.label, color = ink, fontSize = 14.5.sp, lineHeight = 20.sp,
                fontWeight = if (item.selected) FontWeight.SemiBold else FontWeight.Medium,
                maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (item.hint.isNotBlank()) {
                Spacer(Modifier.height(2.dp))
                Text(item.hint, color = theme.muted.copy(alpha = if (active) 1f else 0.5f), fontSize = 11.5.sp,
                    lineHeight = 16.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        if (item.badge.isNotBlank()) {
            Spacer(Modifier.size(8.dp))
            Text(item.badge, color = theme.muted, fontSize = 11.5.sp, maxLines = 1)
        }
        if (item.selected) {
            Spacer(Modifier.size(8.dp))
            Box(Modifier.size(16.dp)) { CheckGlyph(theme.accent, Modifier.fillMaxSize()) }
        }
    }
}

@Composable
private fun TyNoteLine(theme: TyPanelTheme, block: TyPanelBlock.Note) {
    val color = when (block.tone) {
        "error" -> theme.danger
        "accent" -> theme.accent
        else -> theme.muted
    }
    Text(block.text, color = color, fontSize = 12.5.sp, lineHeight = 18.sp,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 8.dp))
}

/** 分区小标题：面板里出现多段动作时给一段说明，避免十几行按钮糊成一片。 */
@Composable
private fun TyBlockLabel(theme: TyPanelTheme, label: String) {
    if (label.isBlank()) return
    Text(
        label,
        color = theme.muted,
        fontSize = 11.5.sp,
        lineHeight = 16.sp,
        fontWeight = FontWeight.Medium,
        modifier = Modifier.padding(start = 4.dp, top = 12.dp, bottom = 4.dp),
    )
}

/** 主按钮（确认/创建）：只在输入与确认块里出现，形状与面板卡片一致。 */
@Composable
private fun TyPrimaryButton(
    theme: TyPanelTheme,
    label: String,
    enabled: Boolean,
    danger: Boolean = false,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed && enabled) 0.985f else 1f, tween(120), label = "ty-primary-press")
    Box(
        Modifier
            .fillMaxWidth()
            .height(46.dp)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clip(RoundedCornerShape(13.dp))
            .background(if (enabled) (if (danger) theme.danger else theme.accent).copy(alpha = 0.16f) else theme.card)
            .border(1.dp, if (enabled) (if (danger) theme.danger else theme.accent).copy(alpha = 0.45f) else theme.line, RoundedCornerShape(13.dp))
            .clickable(interactionSource = interaction, indication = null, enabled = enabled, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            color = if (enabled) (if (danger) theme.danger else theme.accent) else theme.muted.copy(alpha = 0.6f),
            fontSize = 14.5.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun TySecondaryButton(theme: TyPanelTheme, label: String, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    Box(
        Modifier
            .fillMaxWidth()
            .height(44.dp)
            .clip(RoundedCornerShape(13.dp))
            .clickable(interactionSource = interaction, indication = null, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(label, color = theme.muted, fontSize = 14.sp, fontWeight = FontWeight.Medium) }
}

// ---------------------------------------------------------------------------
// 内容块
// ---------------------------------------------------------------------------

/** 把一张面板的内容块按序画出来。所有交互都只回传 id，不做业务判断。 */
@Composable
internal fun TyPanelBlocks(
    theme: TyPanelTheme,
    panel: TyPanel,
    onAction: (String, String, Double) -> Unit,
) {
    val busy = panel.busy
    panel.blocks.forEach { block ->
        when (block) {
            is TyPanelBlock.Actions -> {
                TyBlockLabel(theme, block.label)
                block.items.forEach { item ->
                    TyActionRow(theme, item, enabled = !busy) { onAction(TyPanelEvent.action(item.id), "", 0.0) }
                }
            }
            is TyPanelBlock.Select -> {
                TySelectRow(theme, block, enabled = !busy) { value ->
                    onAction(TyPanelEvent.select(block.id), value, 0.0)
                }
            }
            is TyPanelBlock.Toggle -> TyToggleRow(theme, block, enabled = !busy) { next ->
                onAction(TyPanelEvent.toggle(block.id), if (next) "1" else "0", 0.0)
            }
            is TyPanelBlock.Input -> TyInputRow(theme, block, enabled = !busy) { text ->
                onAction(TyPanelEvent.submit(block.id), text, 0.0)
            }
            is TyPanelBlock.Confirm -> TyConfirmBlock(theme, block, enabled = !busy) {
                onAction(TyPanelEvent.confirm(block.id), "", 0.0)
            }
            is TyPanelBlock.Note -> TyNoteLine(theme, block)
        }
    }
    if (panel.error.isNotBlank()) {
        Spacer(Modifier.height(6.dp))
        Text(panel.error, color = theme.danger, fontSize = 12.5.sp, lineHeight = 18.sp,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp))
    }
    if (busy) {
        Spacer(Modifier.height(10.dp))
        Text("处理中…", color = theme.muted, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 4.dp))
        Spacer(Modifier.height(6.dp))
    }
}

/**
 * 下拉选择行：左侧标题，右侧当前值 + 箭头，点开是贴着行的原生浮层菜单。
 * 这里不依赖 DOM 测量 —— 行高、内边距、菜单宽度全部由 Compose 决定。
 */
@Composable
private fun TySelectRow(
    theme: TyPanelTheme,
    block: TyPanelBlock.Select,
    enabled: Boolean,
    onSelect: (String) -> Unit,
) {
    var expanded by remember(block.id, block.value) { mutableStateOf(false) }
    val current = block.options.firstOrNull { it.value == block.value }?.label
        ?: block.placeholder.ifEmpty { block.value }
    val active = enabled && !block.disabled
    Column(Modifier.fillMaxWidth()) {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 52.dp)
                .clip(RoundedCornerShape(12.dp))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    enabled = active,
                    role = Role.DropdownList,
                    onClick = { expanded = true },
                )
                .padding(horizontal = 4.dp, vertical = 12.dp)
                .alpha(if (block.disabled) 0.55f else 1f),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(block.label, color = theme.text, fontSize = 14.sp, lineHeight = 20.sp,
                modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.size(10.dp))
            Text(current, color = if (active) theme.accent else theme.muted, fontSize = 13.5.sp, maxLines = 1,
                overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.size(4.dp))
            Box(Modifier.size(16.dp)) { PageIcon("chevron-down", theme.muted, Modifier.fillMaxSize()) }
        }
        if (expanded) {
            Popup(
                offset = IntOffset(0, 0),
                onDismissRequest = { expanded = false },
                properties = PopupProperties(focusable = true, dismissOnBackPress = true, dismissOnClickOutside = true),
            ) {
                Column(
                    Modifier
                        .widthIn(min = 200.dp, max = 300.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(theme.surface)
                        .border(1.dp, theme.line, RoundedCornerShape(14.dp))
                        .padding(vertical = 6.dp),
                ) {
                    Text(block.label, color = theme.muted, fontSize = 11.sp,
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp), maxLines = 1,
                        overflow = TextOverflow.Ellipsis)
                    block.options.forEach { option ->
                        val selected = option.value == block.value
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .heightIn(min = 44.dp)
                                .clickable(
                                    interactionSource = remember { MutableInteractionSource() },
                                    indication = null,
                                    role = Role.Button,
                                    onClick = { expanded = false; onSelect(option.value) },
                                )
                                .background(if (selected) theme.accent.copy(alpha = 0.10f) else Color.Transparent)
                                .padding(horizontal = 14.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(option.label, color = if (selected) theme.accent else theme.text, fontSize = 14.sp,
                                modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                            if (selected) Box(Modifier.size(16.dp)) { CheckGlyph(theme.accent, Modifier.fillMaxSize()) }
                        }
                    }
                }
            }
        }
    }
}

/** 开关行：自绘轨道与滑块（不引入 Material Switch，避免在非 Material 组合里的主题错配）。 */
@Composable
private fun TyToggleRow(
    theme: TyPanelTheme,
    block: TyPanelBlock.Toggle,
    enabled: Boolean,
    onChange: (Boolean) -> Unit,
) {
    val active = enabled && !block.disabled
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .clip(RoundedCornerShape(12.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = active,
                role = Role.Switch,
                onClick = { onChange(!block.value) },
            )
            .padding(horizontal = 4.dp, vertical = 12.dp)
            .alpha(if (block.disabled) 0.55f else 1f),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(block.label, color = theme.text, fontSize = 14.sp, lineHeight = 20.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (block.hint.isNotBlank()) {
                Spacer(Modifier.height(2.dp))
                Text(block.hint, color = theme.muted, fontSize = 11.5.sp, lineHeight = 16.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        Spacer(Modifier.size(12.dp))
        val progress by animateFloatAsState(if (block.value) 1f else 0f, tween(180), label = "ty-toggle")
        Canvas(Modifier.size(width = 46.dp, height = 28.dp)) {
            val trackH = 28.dp.toPx()
            val knob = 22.dp.toPx()
            val travel = size.width - knob - 4.dp.toPx()
            drawRoundRect(
                color = if (block.value) theme.accent.copy(alpha = 0.75f) else theme.muted.copy(alpha = 0.28f),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(trackH / 2f),
                size = androidx.compose.ui.geometry.Size(size.width, trackH),
            )
            val x = 2.dp.toPx() + travel * progress
            drawCircle(Color.White.copy(alpha = if (block.value) 0.95f else 0.85f), knob / 2f,
                Offset(x + knob / 2f, size.height / 2f))
        }
    }
}

/** 文本输入块：本地持有草稿（输入法组词不被快照打断），确认时整值回传。 */
@Composable
private fun TyInputRow(
    theme: TyPanelTheme,
    block: TyPanelBlock.Input,
    enabled: Boolean,
    onSubmit: (String) -> Unit,
) {
    var draft by remember(block.id) { mutableStateOf(block.value) }
    val focus = LocalFocusManager.current
    val requester = remember(block.id) { FocusRequester() }
    // 面板重发（业务侧把服务端值规范化了）时才覆盖草稿，用户正在输入时不打断。
    LaunchedEffect(block.value) { if (block.value != draft && draft.isEmpty()) draft = block.value }
    LaunchedEffect(block.id) { runCatching { requester.requestFocus() } }
    fun submit() { if (draft.isNotBlank() && enabled) { focus.clearFocus(); onSubmit(draft) } }
    Column(Modifier.fillMaxWidth().padding(top = 10.dp)) {
        if (block.label.isNotBlank()) {
            Text(block.label, color = theme.muted, fontSize = 11.5.sp,
                modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp))
        }
        Box(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .clip(RoundedCornerShape(13.dp))
                .background(theme.card)
                .border(1.dp, theme.line, RoundedCornerShape(13.dp))
                .padding(horizontal = 14.dp, vertical = 12.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            if (draft.isEmpty() && block.placeholder.isNotBlank()) {
                Text(block.placeholder, color = theme.muted.copy(alpha = 0.7f), fontSize = 14.sp)
            }
            BasicTextField(
                value = draft,
                onValueChange = { draft = it },
                enabled = enabled,
                singleLine = !block.multiline,
                textStyle = TextStyle(color = theme.text, fontSize = 14.sp, lineHeight = 20.sp),
                cursorBrush = SolidColor(theme.accent),
                keyboardOptions = KeyboardOptions(imeAction = if (block.multiline) ImeAction.Default else ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { submit() }),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(requester)
                    .onPreviewKeyEvent { event ->
                        if (event.key == Key.Enter && !block.multiline) { submit(); true } else false
                    },
            )
        }
        Spacer(Modifier.height(12.dp))
        TyPrimaryButton(theme, block.confirmLabel, enabled = enabled && draft.isNotBlank(), danger = block.danger) { submit() }
        Spacer(Modifier.height(4.dp))
    }
}

/** 二次确认块：说明 + 主/次按钮。危险动作走 danger 色。 */
@Composable
private fun TyConfirmBlock(
    theme: TyPanelTheme,
    block: TyPanelBlock.Confirm,
    enabled: Boolean,
    onConfirm: () -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(top = 8.dp)) {
        if (block.label.isNotBlank()) {
            Text(block.label, color = theme.text, fontSize = 14.5.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(horizontal = 4.dp, vertical = 6.dp))
        }
        if (block.message.isNotBlank()) {
            Text(block.message, color = theme.muted, fontSize = 13.sp, lineHeight = 19.sp,
                modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp))
        }
        Spacer(Modifier.height(12.dp))
        TyPrimaryButton(theme, block.confirmLabel, enabled, danger = block.danger, onClick = onConfirm)
        Spacer(Modifier.height(2.dp))
        // 取消在本块内没有独立语义：面板本身可由遮罩/返回/关闭键收起，
        // 单独再画一个"取消"只会让确认框出现两个返回入口。
    }
}

// ---------------------------------------------------------------------------
// 面板总装
// ---------------------------------------------------------------------------

/**
 * 一张面板的完整呈现。宿主只调这一个函数，容器差异（sheet / dialog / menu）全在这里收口。
 * `onAction(action, text, value)` 的三个参数与页面动作总线同形，宿主可直接转发。
 */
@Composable
internal fun TyPanelHostView(
    panel: TyPanel,
    light: Boolean,
    onAction: (String, String, Double) -> Unit,
    onClose: () -> Unit,
) {
    val theme = TyPanelTheme.of(light)
    when (panel.kind) {
        "menu" -> TyMenuFrame(theme, panel, onAction, onClose)
        "dialog" -> TyDialogFrame(theme, panel.title, panel.subtitle, onClose) {
            TyPanelBlocks(theme, panel, onAction)
            Spacer(Modifier.height(6.dp))
        }
        else -> TySheetFrame(
            theme = theme,
            title = panel.title,
            subtitle = panel.subtitle,
            heightFraction = panel.heightFraction,
            onClose = onClose,
        ) {
            TyPanelBlocks(theme, panel, onAction)
        }
    }
}
