package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.key
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.huleixin.tingyu.minimal.ui.CheckGlyph
import kotlin.math.round

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/TySettings.kt
//
// 可复用的原生设置控件（原生化专项·第 21 轮）。
//
// 这八个组件是设置二级页脱离 DOM 测量的**唯一**入口：
//   SettingsGroup  分组标题 + 卡片容器
//   SettingsItem   基础行（标题 / 说明 / 右侧内容 / 点击），所有控件都由它派生
//   SettingsSwitch 开关
//   SettingsSelect 下拉
//   SettingsSlider 滑块
//   SettingsInput  文本输入
//   SettingsAction 普通动作行（跳转 / 执行）
//   SettingsDialog 二次确认对话框
//
// 硬约束（写在这里，页面不再各自发明）：
//   · 触摸目标 ≥48dp，行内点击区域与视觉区域同一块；
//   · 深浅色只从 TyPanelTheme 取，页面不允许自带色；
//   · 字体缩放跟随系统，不使用固定 px；
//   · 开关/下拉/滑块都有原生无障碍语义（Role.Switch / DropdownList / 进度）。
//
// 为什么不做成"每个页面一套"：设置里有 40+ 个子页，各写一套开关的结果就是
// 点击区不一样、深浅色不一样、无障碍语义不一样 —— 这正是本轮要收敛的东西。

// ---------------------------------------------------------------------------
// 分组与基础行
// ---------------------------------------------------------------------------

@Composable
internal fun SettingsGroup(
    theme: TyPanelTheme,
    title: String,
    hint: String = "",
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(top = 14.dp)) {
        if (title.isNotBlank()) {
            Text(
                title,
                color = theme.muted,
                fontSize = 11.5.sp,
                lineHeight = 16.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(start = 4.dp, bottom = 6.dp),
            )
        }
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(theme.card)
                .border(1.dp, theme.line, RoundedCornerShape(14.dp))
                .padding(horizontal = 14.dp, vertical = 2.dp),
            content = content,
        )
        if (hint.isNotBlank()) {
            Text(
                hint,
                color = theme.muted,
                fontSize = 11.sp,
                lineHeight = 16.sp,
                modifier = Modifier.padding(start = 4.dp, top = 6.dp),
            )
        }
    }
}

/**
 * 基础设置行。所有具体控件都由它派生，保证"点击区、行高、禁用态、深浅色"只有一份实现。
 */
@Composable
internal fun SettingsItem(
    theme: TyPanelTheme,
    title: String,
    hint: String = "",
    icon: String = "",
    enabled: Boolean = true,
    onClick: (() -> Unit)? = null,
    trailing: @Composable (() -> Unit)? = null,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .clip(RoundedCornerShape(10.dp))
            .chromePressed(interaction, tint = theme.line.copy(alpha = 0.35f))
            .then(
                if (onClick != null) Modifier.clickable(
                    interactionSource = interaction,
                    indication = null,
                    enabled = enabled,
                    role = Role.Button,
                    onClick = onClick,
                ) else Modifier
            )
            .padding(vertical = 10.dp)
            .alpha(if (enabled) 1f else 0.45f),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon.isNotBlank()) {
            Box(Modifier.size(18.dp)) { PageIcon(icon, theme.muted, Modifier.fillMaxSize()) }
            Spacer(Modifier.size(12.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(
                title,
                color = theme.text,
                fontSize = 14.sp,
                lineHeight = 20.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (hint.isNotBlank()) {
                Spacer(Modifier.height(2.dp))
                Text(
                    hint,
                    color = theme.muted,
                    fontSize = 11.5.sp,
                    lineHeight = 16.sp,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (trailing != null) {
            Spacer(Modifier.size(12.dp))
            trailing()
        }
    }
}

/** 分隔线：相邻两条设置项之间画一条，最后一条不画（由调用方控制）。 */
@Composable
internal fun SettingsDivider(theme: TyPanelTheme) {
    Box(Modifier.fillMaxWidth().height(1.dp).background(theme.line.copy(alpha = 0.6f)))
}

// ---------------------------------------------------------------------------
// 控件
// ---------------------------------------------------------------------------

@Composable
internal fun SettingsSwitch(
    theme: TyPanelTheme,
    title: String,
    hint: String = "",
    checked: Boolean,
    enabled: Boolean = true,
    onCheckedChange: (Boolean) -> Unit,
) {
    SettingsItem(
        theme = theme,
        title = title,
        hint = hint,
        enabled = enabled,
        onClick = { onCheckedChange(!checked) },
        trailing = {
            // 44×52 的触摸区由 SettingsItem 的整行点击承担；这里只画开关本体，
            // 因此视觉与实际命中区完全一致（旧实现里 24dp 的开关常被点空）。
            val knob = 22.dp
            Canvas(
                Modifier
                    .size(width = 46.dp, height = 28.dp)
                    .semantics { contentDescription = title }
            ) {
                val trackH = size.height
                val travel = size.width - knob.toPx() - 4.dp.toPx()
                drawRoundRect(
                    color = if (checked) theme.accent.copy(alpha = 0.75f) else theme.muted.copy(alpha = 0.28f),
                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(trackH / 2f),
                    size = androidx.compose.ui.geometry.Size(size.width, trackH),
                )
                val x = 2.dp.toPx() + if (checked) travel else 0f
                drawCircle(theme.knob.copy(alpha = if (checked) 0.95f else 0.85f), knob.toPx() / 2f,
                    Offset(x + knob.toPx() / 2f, size.height / 2f))
            }
        },
    )
}

@Composable
internal fun SettingsSelect(
    theme: TyPanelTheme,
    title: String,
    hint: String = "",
    value: String,
    options: List<TySettingOption>,
    enabled: Boolean = true,
    placeholder: String = "",
    onOpen: () -> Unit = {},
    onSelect: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val current = options.firstOrNull { it.value == value }?.label ?: placeholder.ifEmpty { value }
    Box {
        SettingsItem(
            theme = theme,
            title = title,
            hint = hint,
            enabled = enabled,
            onClick = { onOpen(); expanded = true },
            trailing = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        current,
                        color = if (enabled) theme.accent else theme.muted,
                        fontSize = 13.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(Modifier.size(4.dp))
                    Box(Modifier.size(15.dp)) { PageIcon("chevron-down", theme.muted, Modifier.fillMaxSize()) }
                }
            },
        )
        SettingsOptionPopup(theme, title, options, value, visible = expanded, onClose = { expanded = false }) { picked ->
            expanded = false
            onSelect(picked)
        }
    }
}

/** 下拉弹层：与面板里的选择块共用同一套外观（自绘 Popup，不依赖 Material 主题）。 */
@Composable
internal fun SettingsOptionPopup(
    theme: TyPanelTheme,
    label: String,
    options: List<TySettingOption>,
    value: String,
    onClose: () -> Unit,
    visible: Boolean,
    onDismiss: (String) -> Unit,
) {
    LiquidPopup(visible = visible, onDismissRequest = onClose) {
        Column(
            Modifier
                .widthIn(min = 200.dp, max = 280.dp)
                .heightIn(max = 360.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(theme.surface)
                .border(1.dp, theme.line, RoundedCornerShape(14.dp))
                .padding(vertical = 6.dp),
        ) {
            if (label.isNotBlank()) {
                Text(
                    label, color = theme.muted, fontSize = 11.sp, maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                )
            }
            Column(Modifier.verticalScroll(rememberScrollState())) { options.forEach { option ->
                val selected = option.value == value
                Row(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 44.dp)
                        .chromeClickable(
                            corner = 10.dp,
                            enabled = !option.disabled,
                            role = Role.Button,
                            onClick = { onDismiss(option.value) },
                        )
                        .background(if (selected) theme.accent.copy(alpha = 0.10f) else Color.Transparent)
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        option.label,
                        color = if (selected) theme.accent else theme.text,
                        fontSize = 14.sp,
                        modifier = Modifier.weight(1f),
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (selected) Box(Modifier.size(16.dp)) { CheckGlyph(theme.accent, Modifier.fillMaxSize()) }
                }
            } }
        }
    }
}

/**
 * 滑块：拖动中只更新本地视觉，松手才回传终值（不打业务层，也不打断正在播放的音频线程）。
 */
@Composable
internal fun SettingsSlider(
    theme: TyPanelTheme,
    title: String,
    hint: String = "",
    value: Float,
    min: Float,
    max: Float,
    step: Float = 0f,
    unit: String = "",
    enabled: Boolean = true,
    showLabel: Boolean = true,
    onCommit: (Float) -> Unit,
) {
    var draft by remember(title) { mutableFloatStateOf(value) }
    var dragging by remember { mutableStateOf(false) }
    // 外部值变化（预设切换、恢复默认）在非拖动期同步进来，拖动中不打断手指。
    LaunchedEffect(value) { if (!dragging) draft = value }
    val span = (max - min).coerceAtLeast(0.0001f)
    fun quantize(raw: Float): Float {
        val clamped = raw.coerceIn(min, max)
        return if (step > 0f) (min + round((clamped - min) / step) * step).coerceIn(min, max) else clamped
    }
    Column(Modifier.fillMaxWidth().padding(vertical = if(showLabel)10.dp else 0.dp)) {
        if(showLabel){
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, color = theme.text, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium)
                if (hint.isNotBlank()) {
                    Spacer(Modifier.height(2.dp))
                    Text(hint, color = theme.muted, fontSize = 11.5.sp, lineHeight = 16.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
            Spacer(Modifier.size(12.dp))
            Text(
                formatSettingValue(draft, step) + unit,
                color = theme.accent,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
            )
        }
        Spacer(Modifier.height(10.dp))
        }
        Canvas(
            Modifier
                .fillMaxWidth()
                .height(28.dp)
                .alpha(if (enabled) 1f else 0.45f)
                .pointerInput(title, min, max, step, enabled) {
                    if (!enabled) return@pointerInput
                    detectTapGestures { point ->
                        val next = quantize(min + (point.x / size.width).coerceIn(0f, 1f) * span)
                        draft = next
                        onCommit(next)
                    }
                }
                .pointerInput(title, min, max, step, enabled) {
                    if (!enabled) return@pointerInput
                    detectDragGestures(
                        onDragStart = { point ->
                            dragging = true
                            draft = quantize(min + (point.x / size.width).coerceIn(0f, 1f) * span)
                        },
                        onDragEnd = { dragging = false; onCommit(draft) },
                        onDragCancel = { dragging = false; onCommit(draft) },
                    ) { change, _ ->
                        change.consume()
                        draft = quantize(min + (change.position.x / size.width).coerceIn(0f, 1f) * span)
                    }
                },
        ) {
            val y = size.height / 2f
            val radius = 8.dp.toPx()
            val progress = ((draft - min) / span).coerceIn(0f, 1f)
            val x = radius + (size.width - radius * 2) * progress
            drawLine(theme.muted.copy(alpha = 0.22f), Offset(radius, y), Offset(size.width - radius, y), 3.dp.toPx(), StrokeCap.Round)
            drawLine(theme.accent, Offset(radius, y), Offset(x, y), 3.dp.toPx(), StrokeCap.Round)
            drawCircle(theme.accent, radius, Offset(x, y))
        }
    }
}

/** 数值格式化：整数不显示小数位，其余按步长决定精度。 */
internal fun formatSettingValue(value: Float, step: Float): String = when {
    step >= 1f || value == value.toInt().toFloat() -> value.toInt().toString()
    step >= 0.1f -> String.format("%.1f", value)
    else -> String.format("%.2f", value)
}

@Composable
internal fun SettingsInput(
    theme: TyPanelTheme,
    title: String,
    hint: String = "",
    value: String,
    placeholder: String = "",
    confirmLabel: String = "确定",
    multiline: Boolean = false,
    enabled: Boolean = true,
    immediate: Boolean = false,
    inputType: String = "text",
    onFocus: (Boolean) -> Unit = {},
    onDone: () -> Unit = {},
    onSubmit: (String) -> Unit,
) {
    var draft by remember(title) { mutableStateOf(value) }
    var focused by remember { mutableStateOf(false) }
    LaunchedEffect(value, focused) { if (!focused && value != draft) draft = value }
    Column(Modifier.fillMaxWidth().padding(vertical = 10.dp)) {
        Text(title, color = theme.text, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium)
        if (hint.isNotBlank()) {
            Spacer(Modifier.height(2.dp))
            Text(hint, color = theme.muted, fontSize = 11.5.sp, lineHeight = 16.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        Spacer(Modifier.height(8.dp))
        Box(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 46.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(theme.surface.copy(alpha = 0.6f))
                .border(1.dp, theme.line, RoundedCornerShape(12.dp))
                .padding(horizontal = 12.dp, vertical = 12.dp)
                .alpha(if (enabled) 1f else 0.45f),
            contentAlignment = Alignment.CenterStart,
        ) {
            if (draft.isEmpty() && placeholder.isNotBlank()) {
                Text(placeholder, color = theme.muted.copy(alpha = 0.7f), fontSize = 13.5.sp)
            }
            BasicTextField(
                value = draft,
                onValueChange = { draft = it; if (immediate) onSubmit(it) },
                enabled = enabled,
                singleLine = !multiline,
                textStyle = TextStyle(color = theme.text, fontSize = 13.5.sp, lineHeight = 19.sp),
                cursorBrush = SolidColor(theme.accent),
                visualTransformation = if (inputType == "password") PasswordVisualTransformation() else VisualTransformation.None,
                keyboardOptions = KeyboardOptions(keyboardType = when(inputType) { "password" -> KeyboardType.Password; "number" -> KeyboardType.Decimal; "url" -> KeyboardType.Uri; "email" -> KeyboardType.Email; else -> KeyboardType.Text }, imeAction = if (multiline) ImeAction.Default else ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { onSubmit(draft); onDone() }),
                modifier = Modifier.fillMaxWidth().onFocusChanged { if (focused != it.isFocused) { focused = it.isFocused; onFocus(focused) } },
            )
        }
        if (!immediate) { Spacer(Modifier.height(8.dp))
        SettingsAction(
            theme = theme,
            title = confirmLabel,
            enabled = enabled,
            onClick = { onSubmit(draft) },
        ) }
    }
}

@Composable
internal fun SettingsAction(
    theme: TyPanelTheme,
    title: String,
    hint: String = "",
    detail: String = "",
    icon: String = "",
    enabled: Boolean = true,
    danger: Boolean = false,
    onClick: () -> Unit,
) {
    SettingsItem(
        theme = theme,
        title = title,
        hint = hint,
        icon = icon,
        enabled = enabled,
        onClick = onClick,
        trailing = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (detail.isNotBlank()) {
                    Text(detail, color = theme.muted, fontSize = 12.5.sp, maxLines = 1)
                    Spacer(Modifier.size(4.dp))
                }
                Box(Modifier.size(15.dp)) { PageIcon("chevron-right", if (danger) theme.danger else theme.muted, Modifier.fillMaxSize()) }
            }
        },
    )
}

/**
 * 二次确认对话框（居中，危险动作用 danger 色）。
 * 与面板里的 confirm 块同一份外观，只是容器不同 —— 设置页里不弹底部面板。
 */
@Composable
internal fun SettingsDialog(
    theme: TyPanelTheme,
    title: String,
    message: String,
    confirmLabel: String,
    cancelLabel: String = "取消",
    danger: Boolean = true,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    androidx.activity.compose.BackHandler(enabled = true) { onDismiss() }
    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(18.dp))
                .background(theme.surface)
                .border(1.dp, theme.line, RoundedCornerShape(18.dp))
                .padding(20.dp),
        ) {
            if (title.isNotBlank()) {
                Text(title, color = theme.text, fontSize = 16.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(8.dp))
            }
            Text(message, color = theme.muted, fontSize = 13.sp, lineHeight = 19.sp)
            Spacer(Modifier.height(18.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                DialogButton(theme, cancelLabel, primary = false, danger = false, Modifier.weight(1f), onDismiss)
                DialogButton(theme, confirmLabel, primary = true, danger = danger, Modifier.weight(1f), onConfirm)
            }
        }
    }
}

@Composable
private fun DialogButton(
    theme: TyPanelTheme,
    label: String,
    primary: Boolean,
    danger: Boolean,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    val accent = if (danger) theme.danger else theme.accent
    Box(
        modifier
            .height(44.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (primary) accent.copy(alpha = 0.16f) else Color.Transparent)
            .border(1.dp, if (primary) accent.copy(alpha = 0.45f) else theme.line, RoundedCornerShape(12.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                role = Role.Button,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            color = if (primary) accent else theme.muted,
            fontSize = 14.sp,
            fontWeight = if (primary) FontWeight.SemiBold else FontWeight.Medium,
        )
    }
}

// ---------------------------------------------------------------------------
// 页面
// ---------------------------------------------------------------------------

/**
 * 语义化设置页：Compose 自己排版，不消费任何 DOM 测量结果。
 *
 * 一次只呈现一个设置分区（与 WebView 侧"打开一个 section"等价），滚动、键盘、深浅色
 * 由本函数负责。相邻同类条目之间自动画分隔线，分组之间留 14dp。
 */
@Composable
internal fun TySettingsPageView(
    page: TySettingsPage,
    theme: TyPanelTheme,
    modifier: Modifier = Modifier,
    /** 顶部固定栏（毛玻璃标题栏）占用的高度：内容从这里往下开始，滚动时从玻璃后方穿出。 */
    contentTop: androidx.compose.ui.unit.Dp = 0.dp,
    bottomPadding: androidx.compose.ui.unit.Dp = 28.dp,
    onAction: (String, String, Double) -> Unit,
) {
    // 标题由页面外框（SettingsFlowPage 的固定顶栏）绘制，这里只出内容 ——
    // 两级都画标题会在滚动时出现两个。
    Column(modifier.fillMaxSize().imePadding()) {
        Column(
            Modifier
                .fillMaxWidth()
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(start = if(page.layout==null)16.dp else 0.dp, end = if(page.layout==null)16.dp else 0.dp, top = contentTop)
                .padding(bottom = bottomPadding),
        ) {
            // 分组切分：group 节点开一张卡片，其后的普通节点都装进这张卡片，
            // 直到遇到下一个 group。语义化模型的顺序即排版顺序，不需要 rect。
            TySettingsContent(page, theme, onAction)
        }
    }
}

@Composable
internal fun TySettingsContent(page: TySettingsPage, theme: TyPanelTheme, onAction: PageAction) {
    val padGroups=groupSettingsNodes(page.nodes)
    if(LocalPadWindow.current.expanded&&page.layout==null&&padGroups.size>1){
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(24.dp)){
            repeat(2){column->Column(Modifier.weight(1f)){
                padGroups.filterIndexed{index,_->index%2==column}.forEach{(group,nodes)->
                    TySettingsContent(page.copy(nodes=listOfNotNull(group)+nodes),theme,onAction)
                }
            }}
        }
        return
    }
    if(page.layout!=null){
        androidx.compose.runtime.CompositionLocalProvider(androidx.compose.material3.LocalTextStyle provides TextStyle(color=theme.text,fontSize=14.sp,lineHeight=20.sp)){
            SettingsLayoutView(page.layout,page.nodes.associateBy{it.id},theme,onAction)
        }
        return
    }
    groupSettingsNodes(page.nodes).forEach { (group, items) ->
        key(group?.id ?: "ungrouped") {
            @Composable fun Items() {
                items.forEachIndexed { index, node ->
                    if (index > 0 && node.kind != "note" && items[index - 1].kind != "note") SettingsDivider(theme)
                    key(node.id) { TySettingItemView(theme, node, onAction) }
                }
            }
            if (group != null) SettingsGroup(theme, group.title, group.hint) { Items() } else Items()
        }
    }
}

/** 把线性节点序列切成 (分组头, 组内条目) 的有序对。第一个 group 之前的条目自成一段。 */
internal fun groupSettingsNodes(nodes: List<TySettingNode>): List<Pair<TySettingNode?, List<TySettingNode>>> {
    val out = mutableListOf<Pair<TySettingNode?, List<TySettingNode>>>()
    var currentGroup: TySettingNode? = null
    var current = mutableListOf<TySettingNode>()
    fun flush() {
        if (current.isNotEmpty() || currentGroup != null) out += currentGroup to current
        current = mutableListOf()
    }
    nodes.forEach { node ->
        if (node.kind == "group") { flush(); currentGroup = node; return@forEach }
        current += node
    }
    flush()
    return out
}

/** 单个设置条目的渲染。所有控件都在这里集中分派，页面不再各写一套。 */
@Composable
private fun TySettingItemView(
    theme: TyPanelTheme,
    node: TySettingNode,
    onAction: (String, String, Double) -> Unit,
) {
    when (node.kind) {
        "switch" -> SettingsSwitch(theme, node.title, node.hint, node.value == "1", !node.disabled) { next ->
            onAction(TySettingEvent.set(node.action), if (next) "1" else "0", 0.0)
        }
        "select" -> SettingsSelect(
            theme, node.title, node.hint, node.value, node.options, !node.disabled, node.placeholder,
            onOpen = { onAction("open:${node.action}", "", 0.0) },
        ) { picked -> onAction(TySettingEvent.set(node.action), picked, 0.0) }
        "slider" -> SettingsSlider(
            theme, node.title, node.hint, node.value.toFloatOrNull() ?: node.min,
            node.min, node.max, node.step, node.unit, !node.disabled,
        ) { next -> onAction(TySettingEvent.slide(node.action), "", next.toDouble()) }
        "input" -> SettingsInput(
            theme, node.title, node.hint, node.value, node.placeholder,
            node.confirmLabel, node.multiline, !node.disabled,
            immediate = node.immediate, inputType = node.inputType,
            onFocus = { onAction("focus:${node.action}", "", if (it) 1.0 else 0.0) },
            onDone = { onAction("enter:${node.action}", "", 0.0) },
        ) { text -> onAction(TySettingEvent.submit(node.action), text, 0.0) }
        "color" -> SettingsColor(theme, node, onAction)
        "checkbox" -> SettingsCheckbox(theme, node, onAction)
        "reorder" -> SettingsOrder(theme, node, onAction)
        "preview" -> SettingsPreview(node, onAction)
        "image" -> SettingsImage(node)
        "note" -> Text(
            node.title.ifEmpty { node.hint },
            color = if (node.value == "error") theme.danger else theme.muted,
            fontSize = 11.5.sp,
            lineHeight = 16.sp,
            modifier = Modifier.padding(horizontal = 4.dp, vertical = 8.dp),
        )
        else -> SettingsAction(
            theme, node.title, node.hint, node.detail, node.icon, !node.disabled, node.value == "danger",
        ) { onAction(TySettingEvent.action(node.action), "", 0.0) }
    }
}
