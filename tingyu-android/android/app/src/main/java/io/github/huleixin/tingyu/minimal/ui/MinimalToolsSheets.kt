package io.github.huleixin.tingyu.minimal.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.huleixin.tingyu.minimal.MinimalPlayerCommands
import io.github.huleixin.tingyu.minimal.MinimalToolActions
import io.github.huleixin.tingyu.minimal.MinimalTools
import kotlin.math.ln
import kotlin.math.roundToInt

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/MinimalToolsSheets.kt
//
// 原生工具页：音质 / 音频效果器 / 歌曲工具（歌曲·歌词·队列）/ 洛雪音源。第 11 轮。
//
// 与 MinimalQueueSheet 同一架构：状态是 JS store 的只读投影（minimalTools 快照），
// 动作经 `MinimalToolActions` 总线发回 JS 的既有处理器 —— 原生不复制任何业务规则。
//
// 交互约定：
//  · 滑块拖动中只更新本地视觉，拖动中按节流 + 松手终值提交（不打音频线程）；
//  · 拖动中的条目不消费快照更新（否则手指和快照打架）；
//  · 二级跳转（音质 → 效果器/洛雪、歌词工具 → 队列）全部是宿主本地切换，不过 WebView。

// ---- 主题（与队列抽屉同一套听屿墨绿表面色）----

internal data class ToolsTheme(
    val surface: Color,
    val card: Color,
    val text: Color,
    val muted: Color,
    val accent: Color,
    val line: Color,
    val scrim: Float,
)

internal fun toolsTheme(light: Boolean): ToolsTheme = if (light) {
    ToolsTheme(
        surface = Color(0xFFF7FAF8),
        card = Color(0xFFFFFFFF).copy(alpha = 0.62f),
        text = Color(0xFF10231D),
        muted = Color(0xFF5C7268),
        accent = Color(0xFF0F6B4F),
        line = Color(0xFF10231D).copy(alpha = 0.10f),
        scrim = 0.28f,
    )
} else {
    ToolsTheme(
        surface = Color(0xFF0E1A17),
        card = Color(0xFFFFFFFF).copy(alpha = 0.055f),
        text = Color(0xFFECF3EF),
        muted = Color(0xFF8FA69C),
        accent = Color(0xFF7FE3C0),
        line = Color(0xFFFFFFFF).copy(alpha = 0.09f),
        scrim = 0.55f,
    )
}

// ---- 脚手架 ----

@Composable
internal fun ToolsSheetScaffold(
    title: String,
    subtitle: String,
    light: Boolean,
    full: Boolean,
    onClose: () -> Unit,
    headerExtra: @Composable () -> Unit = {},
    content: @Composable () -> Unit,
) {
    val theme = toolsTheme(light)
    BackHandler(enabled = true) { onClose() }
    Box(Modifier.fillMaxSize()) {
        Box(
            Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = theme.scrim))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onClose,
                )
        )
        Column(
            Modifier
                .fillMaxWidth()
                .then(if (full) Modifier.fillMaxHeight(0.92f) else Modifier.fillMaxHeight(0.72f))
                .clip(RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp))
                .background(theme.surface)
                .align(Alignment.BottomCenter),
        ) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(start = 22.dp, end = 12.dp, top = 14.dp, bottom = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(title, color = theme.text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                    if (subtitle.isNotBlank()) {
                        Spacer(Modifier.height(3.dp))
                        Text(subtitle, color = theme.muted, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                }
                headerExtra()
                Box(
                    Modifier
                        .size(40.dp)
                        .semantics { contentDescription = "关闭" }
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = onClose,
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Canvas(Modifier.size(17.dp)) {
                        val u = size.minDimension / 17f
                        val w = 1.8f * u
                        drawLine(theme.text, Offset(3f * u, 3f * u), Offset(14f * u, 14f * u), w, StrokeCap.Round)
                        drawLine(theme.text, Offset(14f * u, 3f * u), Offset(3f * u, 14f * u), w, StrokeCap.Round)
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            content()
        }
    }
}

// ---- 通用小组件 ----

@Composable
internal fun ToolsCard(theme: ToolsTheme, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(theme.card)
            .border(1.dp, theme.line, RoundedCornerShape(16.dp))
            .padding(horizontal = 16.dp, vertical = 13.dp),
    ) {
        content()
    }
}

@Composable
internal fun ToolsEntryRow(
    theme: ToolsTheme,
    title: String,
    hint: String,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                onClick = onClick,
            )
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, color = theme.text, fontSize = 14.5.sp, fontWeight = FontWeight.Medium)
            if (hint.isNotBlank()) {
                Spacer(Modifier.height(2.dp))
                Text(hint, color = theme.muted, fontSize = 11.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Text("›", color = theme.muted, fontSize = 18.sp)
    }
}

@Composable
internal fun CheckGlyph(color: Color, modifier: Modifier = Modifier) {
    Canvas(modifier) {
        val u = size.minDimension / 14f
        val w = 1.9f * u
        drawLine(color, Offset(2.5f * u, 7.5f * u), Offset(5.5f * u, 10.5f * u), w, StrokeCap.Round)
        drawLine(color, Offset(5.5f * u, 10.5f * u), Offset(11.5f * u, 3.5f * u), w, StrokeCap.Round)
    }
}

// ---- 音质页 ----

private val QUALITY_LABELS = listOf("标准", "高品质", "无损", "Hi-Res")

private fun currentLabelOf(current: String): String = when (current) {
    "standard" -> "标准"
    "high" -> "高品质"
    "lossless" -> "无损"
    "hires" -> "Hi-Res"
    else -> ""
}

@Composable
fun MinimalQualitySheet(
    tools: MinimalTools,
    light: Boolean,
    actions: MinimalToolActions,
    onClose: () -> Unit,
    onOpenEffects: () -> Unit,
    onOpenLx: () -> Unit,
) {
    val theme = toolsTheme(light)
    val quality = tools.quality
    ToolsSheetScaffold(
        title = "音质",
        subtitle = "切换后保留播放位置；可用音质由音源和账号决定",
        light = light,
        full = false,
        onClose = onClose,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            val currentLabel = currentLabelOf(quality.current)
            listOf(0 to 1, 2 to 3).forEach { (left, right) ->
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    listOf(left, right).forEach { index ->
                        val label = QUALITY_LABELS[index]
                        val selected = label == currentLabel
                        Box(
                            Modifier
                                .weight(1f)
                                .height(46.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(if (selected) theme.accent.copy(alpha = 0.12f) else theme.card)
                                .border(
                                    1.dp,
                                    if (selected) theme.accent.copy(alpha = 0.55f) else theme.line,
                                    RoundedCornerShape(12.dp),
                                )
                                .clickable(
                                    interactionSource = remember { MutableInteractionSource() },
                                    indication = null,
                                    enabled = !quality.local && !quality.switching && !selected,
                                    onClick = { actions.send("qualityPick", index.toDouble()) },
                                ),
                            contentAlignment = Alignment.Center,
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(
                                    label,
                                    color = if (selected) theme.accent else theme.text,
                                    fontSize = 14.sp,
                                    fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
                                )
                                if (selected) CheckGlyph(theme.accent, Modifier.size(14.dp))
                            }
                        }
                    }
                }
            }
            Text(
                text = "首选：" + quality.currentLabel.ifBlank { "未选择" } +
                    " · 当前：" + quality.actual.ifBlank { "未确认（可能来自缓存）" },
                color = theme.muted,
                fontSize = 12.sp,
            )
            if (quality.error.isNotBlank()) {
                Text(quality.error, color = Color(0xFFD06A5A), fontSize = 12.sp)
            }
            if (quality.switching) {
                Text("正在切换音质…", color = theme.muted, fontSize = 12.sp)
            }
            ToolsCard(theme) {
                ToolsEntryRow(theme, "音效调节器", "均衡器与音频效果", onClick = onOpenEffects)
            }
            ToolsCard(theme) {
                ToolsEntryRow(theme, "洛雪自定义音源", "导入 .js 脚本，替换在线音源", onClick = onOpenLx)
            }
            Spacer(Modifier.height(10.dp))
        }
    }
}

// ---- 效果器页 ----

private val PRESET_LABELS = listOf("水平", "Lo-Fi", "收音机", "大厅", "人声", "低音增强", "自定义 1", "自定义 2")
private val EFFECT_LABELS = listOf(
    "低频截止", "高频截止", "饱和失真", "比特破碎", "抖晃", "噪声", "声场宽度", "空间感", "冲击力",
)
private val BAND_LABELS = listOf("31", "62", "125", "250", "500", "1k", "2k", "4k", "8k", "16k")

/** 与 JS `AUDIO_EFFECT_CONTROLS` 同一套取值域；norm 0..1 ↔ 实际值。 */
internal fun normToEffectValue(index: Int, norm: Float): Float = when (index) {
    0 -> 20f * Math.pow(2000.0 / 20.0, norm.toDouble()).toFloat()
    1 -> 500f * Math.pow(20000.0 / 500.0, norm.toDouble()).toFloat()
    6 -> norm * 2f
    else -> norm
}

internal fun effectValueToNorm(index: Int, value: Float): Float = when (index) {
    0 -> (ln(value.coerceAtLeast(20f).toDouble() / 20.0) / ln(2000.0 / 20.0)).toFloat().coerceIn(0f, 1f)
    1 -> (ln(value.coerceAtLeast(500f).toDouble() / 500.0) / ln(20000.0 / 500.0)).toFloat().coerceIn(0f, 1f)
    6 -> (value / 2f).coerceIn(0f, 1f)
    else -> value.coerceIn(0f, 1f)
}

internal fun formatEffectValue(index: Int, value: Float): String = when (index) {
    0, 1 -> if (value >= 1000f) String.format("%.1f kHz", value / 1000f) else "${value.roundToInt()} Hz"
    6 -> String.format("%.1f×", value)
    else -> "${(value * 100).roundToInt()}%"
}

@Composable
fun MinimalEffectsSheet(
    tools: MinimalTools,
    light: Boolean,
    actions: MinimalToolActions,
    onClose: () -> Unit,
) {
    val theme = toolsTheme(light)
    val effects = tools.effects
    // 拖动中的条目用本地值，不消费快照（快照和手指会打架）。
    val localGains = remember { mutableStateListOf<Int>().apply { addAll(effects.gains.take(10)) } }
    val localParams = remember { mutableStateListOf<Float>().apply { addAll(effects.effectValues.take(9)) } }
    var draggingBand by remember { mutableIntStateOf(-1) }
    var draggingParam by remember { mutableIntStateOf(-1) }
    // 快照 → 本地：只同步没有被拖的条目。version 相同时 gains 内容可能仍变（对比自身）。
    LaunchedEffect(tools) {
        effects.gains.forEachIndexed { index, gain -> if (index < 10 && index != draggingBand) localGains[index] = gain }
        effects.effectValues.forEachIndexed { index, value -> if (index < 9 && index != draggingParam) localParams[index] = value }
    }
    ToolsSheetScaffold(
        title = "音频效果器",
        subtitle = "频段均衡与音频效果",
        light = light,
        full = true,
        onClose = onClose,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // 总开关胶囊。
            Box(
                Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(theme.card)
                    .border(1.dp, if (effects.enabled) theme.accent.copy(alpha = 0.55f) else theme.line, RoundedCornerShape(999.dp))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = { actions.send("effectsToggle", 0.0) },
                    )
                    .padding(horizontal = 16.dp, vertical = 9.dp),
            ) {
                Text(
                    if (effects.enabled) "音频处理已开启" else "音频处理已关闭",
                    color = if (effects.enabled) theme.accent else theme.muted,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
            // 预设 chips。
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                listOf("flat", "lofi", "radio", "hall", "vocal", "bass", "custom1", "custom2").forEachIndexed { index, id ->
                    val selected = effects.preset == id
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(if (selected) theme.accent.copy(alpha = 0.14f) else theme.card)
                            .border(1.dp, if (selected) theme.accent.copy(alpha = 0.5f) else theme.line, RoundedCornerShape(999.dp))
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                            ) { actions.send("effectsPreset", index.toDouble()) }
                            .padding(horizontal = 13.dp, vertical = 7.dp),
                    ) {
                        Text(
                            PRESET_LABELS[index],
                            color = if (selected) theme.accent else theme.text,
                            fontSize = 12.5.sp,
                        )
                    }
                }
                // 重置自定义槽：清当前自定义槽（内置预设不可编辑）。
                Box(
                    Modifier
                        .size(34.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(theme.card)
                        .border(1.dp, theme.line, RoundedCornerShape(999.dp))
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                        ) { actions.send("effectsResetCustom", 0.0) },
                    contentAlignment = Alignment.Center,
                ) {
                    Canvas(Modifier.size(15.dp)) {
                        val u = size.minDimension / 15f
                        val w = 1.6f * u
                        drawArc(theme.muted, -70f, 290f, false, style = Stroke(w, cap = StrokeCap.Round))
                        drawLine(theme.muted, Offset(12.2f * u, 2.2f * u), Offset(12.2f * u, 6f * u), w, StrokeCap.Round)
                        drawLine(theme.muted, Offset(12.2f * u, 2.2f * u), Offset(8.6f * u, 2.2f * u), w, StrokeCap.Round)
                    }
                }
            }
            // 频段增益：两行 × 五列的竖向 fader。
            ToolsCard(theme) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("频段增益", color = theme.muted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.weight(1f))
                    Text("+12 dB · 0 · −12 dB", color = theme.muted, fontSize = 10.5.sp)
                }
                Spacer(Modifier.height(12.dp))
                listOf(0 until 5, 5 until 10).forEach { range ->
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly,
                    ) {
                        range.forEach { index ->
                            BandFader(
                                theme = theme,
                                label = BAND_LABELS[index],
                                gain = localGains[index],
                                dragging = draggingBand == index,
                                onChange = { gain ->
                                    localGains[index] = gain
                                    actions.send("effectsBand", (index * 100 + gain + 12).toDouble())
                                },
                                onDragStart = { draggingBand = index },
                                onDragEnd = {
                                    draggingBand = -1
                                    actions.send("effectsBand", (index * 100 + localGains[index] + 12).toDouble())
                                },
                            )
                        }
                    }
                    if (range.first == 0) Spacer(Modifier.height(16.dp))
                }
                Spacer(Modifier.height(2.dp))
                Text("HZ", color = theme.muted.copy(alpha = 0.7f), fontSize = 9.5.sp, modifier = Modifier.align(Alignment.CenterHorizontally))
            }
            // 效果链。
            ToolsCard(theme) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("效果链", color = theme.text, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                    Spacer(Modifier.weight(1f))
                    Text("在频段之后处理", color = theme.muted, fontSize = 11.sp)
                }
                Spacer(Modifier.height(6.dp))
                EFFECT_LABELS.forEachIndexed { index, label ->
                    EffectParamSlider(
                        theme = theme,
                        label = label,
                        index = index,
                        value = localParams[index],
                        dragging = draggingParam == index,
                        onChangeNorm = { norm ->
                            localParams[index] = normToEffectValue(index, norm)
                            actions.send("effectsParam", (index * 10000 + (norm * 1000).roundToInt()).toDouble())
                        },
                        onDragStart = { draggingParam = index },
                        onDragEnd = {
                            draggingParam = -1
                            actions.send("effectsParam", (index * 10000 + (effectValueToNorm(index, localParams[index]) * 1000).roundToInt()).toDouble())
                        },
                    )
                }
            }
            Spacer(Modifier.height(10.dp))
        }
    }
}

/** 竖向 fader：点按/拖动按绝对位置映射增益（整数 dB），拖动累计不依赖闭包里的旧值。 */
@Composable
private fun BandFader(
    theme: ToolsTheme,
    label: String,
    gain: Int,
    dragging: Boolean,
    onChange: (Int) -> Unit,
    onDragStart: () -> Unit,
    onDragEnd: () -> Unit,
) {
    val density = androidx.compose.ui.platform.LocalDensity.current
    val trackHeight = 110.dp
    val trackPx = with(density) { trackHeight.toPx() }
    val thumbPx = with(density) { 14.dp.toPx() }
    var dragBaseGain by remember { mutableIntStateOf(0) }
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            if (gain > 0) "+$gain" else "$gain",
            color = if (gain == 0) theme.muted else theme.accent,
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(4.dp))
        Box(
            Modifier
                .width(30.dp)
                .height(trackHeight)
                .pointerInput(Unit) {
                    detectVerticalDragGestures(
                        onDragStart = { offset ->
                            onDragStart()
                            val fraction = 1f - (offset.y / trackPx).coerceIn(0f, 1f)
                            dragBaseGain = (fraction * 24f - 12f).roundToInt()
                            onChange(dragBaseGain)
                        },
                        onDragEnd = { onDragEnd() },
                        onDragCancel = { onDragEnd() },
                    ) { change, amount ->
                        change.consume()
                        dragBaseGain = (dragBaseGain - (amount / trackPx * 24f).roundToInt()).coerceIn(-12, 12)
                        onChange(dragBaseGain)
                    }
                }
                .semantics { contentDescription = "$label Hz 增益" },
        ) {
            Box(
                Modifier
                    .width(4.dp)
                    .height(trackHeight)
                    .background(theme.muted.copy(alpha = 0.28f), RoundedCornerShape(999.dp))
                    .align(Alignment.Center),
            )
            val fraction = (gain + 12) / 24f
            Box(
                Modifier
                    .size(14.dp)
                    .align(Alignment.TopCenter)
                    .offset {
                        IntOffset(0, (((1f - fraction) * (trackPx - thumbPx)).roundToInt()))
                    },
            ) {
                Box(
                    Modifier
                        .fillMaxSize()
                        .background(if (dragging || gain != 0) theme.accent else theme.text.copy(alpha = 0.55f), RoundedCornerShape(999.dp)),
                )
            }
        }
        Spacer(Modifier.height(4.dp))
        Text(label, color = theme.muted, fontSize = 10.sp)
    }
}

// ---- 效果参数横向滑条 ----

@Composable
private fun EffectParamSlider(
    theme: ToolsTheme,
    label: String,
    index: Int,
    value: Float,
    dragging: Boolean,
    onChangeNorm: (Float) -> Unit,
    onDragStart: () -> Unit,
    onDragEnd: () -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(top = 8.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(label, color = theme.text, fontSize = 12.5.sp)
            Spacer(Modifier.weight(1f))
            Text(formatEffectValue(index, value), color = theme.muted, fontSize = 12.sp)
        }
        Spacer(Modifier.height(6.dp))
        val fraction = effectValueToNorm(index, value)
        androidx.compose.foundation.layout.BoxWithConstraints(
            Modifier
                .fillMaxWidth()
                .height(22.dp)
                .pointerInput(index) {
                    detectHorizontalDragGestures(
                        onDragStart = { offset -> onDragStart(); onChangeNorm((offset.x / size.width).coerceIn(0f, 1f)) },
                        onDragEnd = { onDragEnd() },
                        onDragCancel = { onDragEnd() },
                    ) { change, _ ->
                        change.consume()
                        onChangeNorm((change.position.x / size.width).coerceIn(0f, 1f))
                    }
                }
                .pointerInput(index) {
                    detectTapGestures { offset -> onChangeNorm((offset.x / size.width).coerceIn(0f, 1f)) }
                }
                .semantics { contentDescription = label },
        ) {
            val trackWidthPx = with(androidx.compose.ui.platform.LocalDensity.current) { maxWidth.toPx() }
            val thumbPx = with(androidx.compose.ui.platform.LocalDensity.current) { 15.dp.toPx() }
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(4.dp)
                    .background(theme.muted.copy(alpha = 0.28f), RoundedCornerShape(999.dp))
                    .align(Alignment.CenterStart),
            )
            Box(
                Modifier
                    .size(15.dp)
                    .offset { IntOffset(((fraction * (trackWidthPx - thumbPx)).roundToInt()), 0) }
                    .background(if (dragging || fraction > 0.001f && index != 6 && index != 0 && index != 1) theme.accent else theme.text.copy(alpha = 0.65f), RoundedCornerShape(999.dp))
                    .align(Alignment.CenterStart),
            )
        }
    }
}

// ---- 歌曲工具页 ----

@Composable
fun MinimalLyricsToolsSheet(
    tools: MinimalTools,
    light: Boolean,
    actions: MinimalToolActions,
    transport: MinimalPlayerCommands,
    onClose: () -> Unit,
    onOpenQueue: () -> Unit,
) {
    val theme = toolsTheme(light)
    val lyrics = tools.lyrics
    // 队列标签直接切到共享队列抽屉：这里不建第二套队列。
    var tab by remember { mutableStateOf("lyrics") }
    ToolsSheetScaffold(
        title = "歌曲工具",
        subtitle = listOf(lyrics.title, lyrics.artist).filter { it.isNotBlank() }.joinToString(" · "),
        light = light,
        full = true,
        onClose = onClose,
    ) {
        Column(Modifier.fillMaxWidth()) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(theme.card)
                    .border(1.dp, theme.line, RoundedCornerShape(12.dp))
                    .padding(4.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                listOf("song" to "歌曲", "lyrics" to "歌词", "queue" to "队列").forEach { (id, label) ->
                    val selected = tab == id
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(9.dp))
                            .background(if (selected) theme.accent.copy(alpha = 0.12f) else Color.Transparent)
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                            ) {
                                if (id == "queue") onOpenQueue() else tab = id
                            }
                            .padding(horizontal = 18.dp, vertical = 8.dp),
                    ) {
                        Text(
                            label,
                            color = if (selected) theme.accent else theme.muted,
                            fontSize = 13.sp,
                            fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
                        )
                    }
                }
            }
            Column(
                Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (tab == "lyrics") {
                    LyricsTab(theme, lyrics, actions)
                } else {
                    SongTab(theme, lyrics, transport)
                }
            }
        }
    }
}

@Composable
private fun LyricsTab(theme: ToolsTheme, lyrics: io.github.huleixin.tingyu.minimal.MinimalLyricsState, actions: MinimalToolActions) {
    if (lyrics.sources.isNotEmpty()) {
        ToolsCard(theme) {
            Text("当前歌词来源", color = theme.text, fontSize = 13.5.sp, fontWeight = FontWeight.Medium)
            Spacer(Modifier.height(8.dp))
            lyrics.sources.forEachIndexed { index, (id, label) ->
                val selected = id == lyrics.selected
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(11.dp))
                        .background(if (selected) theme.accent.copy(alpha = 0.10f) else Color.Transparent)
                        .border(
                            1.dp,
                            if (selected) theme.accent.copy(alpha = 0.5f) else theme.line,
                            RoundedCornerShape(11.dp),
                        )
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            enabled = !lyrics.navi,
                        ) { actions.send("lyricsSource", index.toDouble()) }
                        .padding(horizontal = 13.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(label, color = if (selected) theme.accent else theme.text, fontSize = 13.sp)
                    Spacer(Modifier.weight(1f))
                    if (selected) CheckGlyph(theme.accent, Modifier.size(13.dp))
                }
                if (index != lyrics.sources.lastIndex) Spacer(Modifier.height(6.dp))
            }
        }
    }
    ToolsCard(theme) {
        ToolsEntryRow(theme, "重新匹配歌词", "歌词不对？按歌名和歌手重新选择。", onClick = { actions.send("lyricsMatch", 0.0) })
        ToolsEntryRow(theme, "导入歌词文件", "支持 LRC、TTML、QRC、KRC 等歌词文件。", onClick = { actions.send("lyricsImport", 0.0) })
        if (lyrics.message.isNotBlank()) {
            Text(lyrics.message, color = theme.muted, fontSize = 11.5.sp)
        }
    }
    ToolsCard(theme) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("单曲时间校准", color = theme.text, fontSize = 13.5.sp, fontWeight = FontWeight.Medium)
            Spacer(Modifier.weight(1f))
            Text(
                "重置",
                color = if (lyrics.offsetMs != 0) theme.accent else theme.muted,
                fontSize = 12.sp,
                modifier = Modifier.clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    enabled = lyrics.offsetMs != 0,
                ) { actions.send("lyricsOffset", 0.0) },
            )
        }
        Spacer(Modifier.height(4.dp))
        Text("只调整当前歌曲，播放时可以边听边调。正值使歌词延后。", color = theme.muted, fontSize = 11.5.sp)
        Spacer(Modifier.height(10.dp))
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            OffsetButton(theme, "−", "0.25 s") { actions.send("lyricsOffset", (lyrics.offsetMs - 250).toDouble()) }
            val seconds = lyrics.offsetMs / 1000.0
            Text(
                text = (if (seconds > 0) "+" else "") + String.format("%.2f", seconds),
                color = theme.text,
                fontSize = 26.sp,
                fontWeight = FontWeight.SemiBold,
            )
            OffsetButton(theme, "+", "0.25 s") { actions.send("lyricsOffset", (lyrics.offsetMs + 250).toDouble()) }
        }
        Spacer(Modifier.height(10.dp))
        OffsetField(theme, lyrics.offsetMs) { ms -> actions.send("lyricsOffset", ms.toDouble()) }
    }
}

@Composable
private fun OffsetButton(theme: ToolsTheme, glyph: String, small: String, onClick: () -> Unit) {
    Column(
        Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(theme.card)
            .border(1.dp, theme.line, RoundedCornerShape(12.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            )
            .padding(horizontal = 18.dp, vertical = 9.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(glyph, color = theme.text, fontSize = 20.sp, fontWeight = FontWeight.Medium)
        Text(small, color = theme.muted, fontSize = 10.sp)
    }
}

@Composable
private fun OffsetField(theme: ToolsTheme, offsetMs: Int, onCommit: (Int) -> Unit) {
    var text by remember(offsetMs) { mutableStateOf(offsetMs.toString()) }
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text("精确调整（毫秒）", color = theme.muted, fontSize = 12.sp)
        Spacer(Modifier.weight(1f))
        androidx.compose.foundation.text.BasicTextField(
            value = text,
            onValueChange = { value -> text = value.filter { it.isDigit() || it == '-' } },
            textStyle = TextStyle(color = theme.text, fontSize = 13.sp),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            singleLine = true,
            modifier = Modifier
                .width(110.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(theme.card)
                .border(1.dp, theme.line, RoundedCornerShape(10.dp))
                .padding(horizontal = 12.dp, vertical = 8.dp),
        )
    }
    LaunchedEffect(text) {
        val parsed = text.toIntOrNull()
        if (parsed != null && parsed != offsetMs) onCommit(parsed.coerceIn(-60000, 60000))
    }
}

@Composable
private fun SongTab(theme: ToolsTheme, lyrics: io.github.huleixin.tingyu.minimal.MinimalLyricsState, transport: MinimalPlayerCommands) {
    ToolsCard(theme) {
        Text(lyrics.title.ifBlank { "未知曲目" }, color = theme.text, fontSize = 15.5.sp, fontWeight = FontWeight.SemiBold)
        if (lyrics.artist.isNotBlank()) {
            Spacer(Modifier.height(2.dp))
            Text(lyrics.artist, color = theme.muted, fontSize = 12.5.sp)
        }
    }
    ToolsCard(theme) {
        Text("播放控制", color = theme.text, fontSize = 13.5.sp, fontWeight = FontWeight.Medium)
        Spacer(Modifier.height(10.dp))
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ToolIconButton(theme, "循环模式", { transport.cycleMode() }) {
                Canvas(Modifier.size(20.dp)) {
                    val u = size.minDimension / 20f
                    val w = 1.7f * u
                    drawArc(theme.text, -60f, 300f, false, style = Stroke(w, cap = StrokeCap.Round))
                    drawLine(theme.text, Offset(15.5f * u, 3.5f * u), Offset(15.5f * u, 8f * u), w, StrokeCap.Round)
                }
            }
            ToolIconButton(theme, "上一首", { transport.previous() }) {
                Canvas(Modifier.size(20.dp)) {
                    val u = size.minDimension / 20f
                    val w = 1.9f * u
                    drawLine(theme.text, Offset(6f * u, 4f * u), Offset(6f * u, 16f * u), w, StrokeCap.Round)
                    drawLine(theme.text, Offset(15.5f * u, 4.5f * u), Offset(7.5f * u, 10f * u), w, StrokeCap.Round)
                    drawLine(theme.text, Offset(7.5f * u, 10f * u), Offset(15.5f * u, 15.5f * u), w, StrokeCap.Round)
                }
            }
            ToolIconButton(theme, "播放 / 暂停", { transport.toggle() }) {
                Canvas(Modifier.size(26.dp)) {
                    val u = size.minDimension / 26f
                    drawCircle(theme.text, 11.5f * u, style = Stroke(1.7f * u))
                }
            }
            ToolIconButton(theme, "下一首", { transport.next() }) {
                Canvas(Modifier.size(20.dp)) {
                    val u = size.minDimension / 20f
                    val w = 1.9f * u
                    drawLine(theme.text, Offset(14f * u, 4f * u), Offset(14f * u, 16f * u), w, StrokeCap.Round)
                    drawLine(theme.text, Offset(4.5f * u, 4.5f * u), Offset(12.5f * u, 10f * u), w, StrokeCap.Round)
                    drawLine(theme.text, Offset(12.5f * u, 10f * u), Offset(4.5f * u, 15.5f * u), w, StrokeCap.Round)
                }
            }
        }
    }
    ToolsCard(theme) {
        ToolsEntryRow(theme, "播放设置", "启动播放、播放引擎、队列插入位置", onClick = { transport.openPlaybackSettings() })
    }
}

@Composable
private fun ToolIconButton(theme: ToolsTheme, label: String, onClick: () -> Unit, content: @Composable () -> Unit) {
    Box(
        Modifier
            .size(48.dp)
            .semantics { contentDescription = label }
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) { content() }
}

// ---- 洛雪音源页 ----

@Composable
fun MinimalLxSheet(
    tools: MinimalTools,
    light: Boolean,
    actions: MinimalToolActions,
    onClose: () -> Unit,
) {
    val theme = toolsTheme(light)
    val lx = tools.lx
    var helpOpen by remember { mutableStateOf(false) }
    ToolsSheetScaffold(
        title = "洛雪自定义音源",
        subtitle = "导入自定义脚本，为搜索和已登录平台的歌单选择播放音源。",
        light = light,
        full = true,
        onClose = onClose,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(theme.accent.copy(alpha = if (lx.busy) 0.06f else 0.12f))
                    .border(1.dp, theme.accent.copy(alpha = 0.4f), RoundedCornerShape(14.dp))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        enabled = !lx.busy,
                    ) { actions.send("lxImport", 0.0) }
                    .padding(horizontal = 16.dp, vertical = 13.dp),
            ) {
                Column {
                    Text(if (lx.busy) "正在处理…" else "导入并启用音源", color = theme.accent, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                    Text(".js 文件 · 最大 1 MB", color = theme.muted, fontSize = 11.sp)
                }
            }
            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(theme.card)
                    .border(1.dp, theme.line, RoundedCornerShape(12.dp))
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("当前音源 ", color = theme.muted, fontSize = 12.5.sp)
                Text(lx.activeName, color = theme.text, fontSize = 12.5.sp, fontWeight = FontWeight.Medium)
                Spacer(Modifier.weight(1f))
                Text(
                    "恢复原音源",
                    color = theme.accent,
                    fontSize = 12.sp,
                    modifier = Modifier.clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        enabled = !lx.busy,
                    ) { actions.send("lxRestore", 0.0) },
                )
            }
            if (lx.scripts.isEmpty()) {
                Box(Modifier.fillMaxWidth().padding(vertical = 18.dp), contentAlignment = Alignment.Center) {
                    Text("还没有导入音源", color = theme.muted, fontSize = 12.5.sp)
                }
            }
            lx.scripts.forEachIndexed { index, script ->
                ToolsCard(theme) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(script.name, color = theme.text, fontSize = 13.5.sp, fontWeight = FontWeight.Medium)
                        if (script.active) {
                            Spacer(Modifier.width(6.dp))
                            Text(
                                "使用中",
                                color = theme.accent,
                                fontSize = 10.5.sp,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(999.dp))
                                    .background(theme.accent.copy(alpha = 0.12f))
                                    .padding(horizontal = 7.dp, vertical = 2.dp),
                            )
                        }
                        Spacer(Modifier.weight(1f))
                    }
                    if (script.meta.isNotBlank()) {
                        Text(script.meta, color = theme.muted, fontSize = 11.sp)
                    }
                    if (script.caps.isNotEmpty()) {
                        Spacer(Modifier.height(7.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            script.caps.forEach { (name, qualitys) ->
                                Column(
                                    Modifier
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(theme.surface)
                                        .border(1.dp, theme.line, RoundedCornerShape(8.dp))
                                        .padding(horizontal = 8.dp, vertical = 5.dp),
                                ) {
                                    Text(name, color = theme.text, fontSize = 11.sp)
                                    Text(qualitys, color = theme.muted, fontSize = 9.5.sp)
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(9.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        ScriptAction(theme, if (script.active) "已启用" else "启用", enabled = !lx.busy && !script.active) {
                            actions.send("lxActivate", index.toDouble())
                        }
                        ScriptAction(theme, "检查音源", enabled = !lx.busy) { actions.send("lxTest", index.toDouble()) }
                        ScriptAction(theme, "删除", enabled = !lx.busy, danger = true) { actions.send("lxRemove", index.toDouble()) }
                    }
                }
            }
            if (lx.message.isNotBlank()) {
                Text(lx.message, color = if (lx.failed) Color(0xFFD06A5A) else theme.muted, fontSize = 11.5.sp)
            }
            Text(
                "使用说明与兼容性",
                color = theme.muted,
                fontSize = 12.sp,
                modifier = Modifier.clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                ) { helpOpen = !helpOpen },
            )
            if (helpOpen) {
                Text(
                    "启用后可在搜索页选择脚本支持的平台。已登录平台的歌单和收藏也会使用所选音源播放，收藏和歌单归属不变。切换时保留播放位置。\n" +
                        "跨平台按歌名、歌手和时长匹配；失败会提示，不会自动切回原音源。未启用的脚本不会运行。\n" +
                        "支持 request、Buffer、MD5、AES；暂不支持依赖 RSA、zlib 或 multipart 的脚本。不内置第三方音源。",
                    color = theme.muted,
                    fontSize = 11.sp,
                )
            }
            Spacer(Modifier.height(10.dp))
        }
    }
}

@Composable
private fun ScriptAction(theme: ToolsTheme, label: String, enabled: Boolean, danger: Boolean = false, onClick: () -> Unit) {
    Box(
        Modifier
            .clip(RoundedCornerShape(9.dp))
            .background(theme.card)
            .border(1.dp, if (danger) theme.line else theme.accent.copy(alpha = 0.35f), RoundedCornerShape(9.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled,
                onClick = onClick,
            )
            .padding(horizontal = 12.dp, vertical = 7.dp),
    ) {
        Text(
            label,
            color = when {
                !enabled -> theme.muted.copy(alpha = 0.6f)
                danger -> Color(0xFFD06A5A)
                else -> theme.accent
            },
            fontSize = 12.sp,
        )
    }
}
