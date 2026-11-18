package io.github.huleixin.tingyu.chrome

import androidx.compose.animation.BoundsTransform
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.animateBounds
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.LookaheadScope
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import kotlinx.coroutines.delay
import org.json.JSONArray
import kotlin.math.abs

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/DiscoverySettingsControls.kt
// 推荐设置来源排序与页面模块排序：统一右侧拖拽手柄、1:1 跟手位移、自动让位动画与防文字误选。

private data class DiscoverySourceItem(
    val id: String,
    val label: String,
    val status: String,
    val enabled: Boolean,
    val weight: String,
)

private fun parseDiscoverySourceItems(raw: String): List<DiscoverySourceItem> = runCatching {
    val arr = JSONArray(raw)
    (0 until arr.length()).mapNotNull { idx ->
        val obj = arr.optJSONObject(idx) ?: return@mapNotNull null
        val id = obj.optString("id").trim()
        if (id.isEmpty()) return@mapNotNull null
        DiscoverySourceItem(
            id = id,
            label = obj.optString("label", id),
            status = obj.optString("status", ""),
            enabled = obj.optBoolean("enabled", true),
            weight = obj.optString("weight", "1"),
        )
    }
}.getOrDefault(emptyList())

@Composable
private fun CompactSourceSwitch(
    theme: TyPanelTheme,
    checked: Boolean,
    contentDesc: String,
    onToggle: (Boolean) -> Unit,
) {
    val reduced = LocalLiquidReduced.current
    val progress by animateFloatAsState(
        targetValue = if (checked) 1f else 0f,
        animationSpec = tween(if (reduced) 0 else 160),
        label = "source-switch",
    )
    Box(
        Modifier
            .size(width = 44.dp, height = 48.dp)
            .semantics {
                role = Role.Switch
                contentDescription = contentDesc
            }
            .chromeClickable(role = Role.Switch, corner = 999.dp) { onToggle(!checked) },
        contentAlignment = Alignment.Center,
    ) {
        val knob = 22.dp
        Canvas(Modifier.size(width = 44.dp, height = 26.dp)) {
            val trackH = size.height
            val travel = size.width - knob.toPx() - 4.dp.toPx()
            drawRoundRect(
                color = if (checked) theme.accent.copy(alpha = 0.82f) else theme.muted.copy(alpha = 0.28f),
                cornerRadius = CornerRadius(trackH / 2f),
                size = Size(size.width, trackH),
            )
            val x = 2.dp.toPx() + travel * progress
            drawCircle(
                color = theme.knob.copy(alpha = if (checked) 0.98f else 0.88f),
                radius = knob.toPx() / 2f,
                center = Offset(x + knob.toPx() / 2f, size.height / 2f),
            )
        }
    }
}

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
internal fun DiscoverySourceOrder(theme: TyPanelTheme, node: TySettingNode, action: PageAction) {
    val parsed = remember(node.value) { parseDiscoverySourceItems(node.value) }
    var order by remember { mutableStateOf(parsed) }
    var draggingId by remember { mutableStateOf<String?>(null) }
    var dragVisualOffset by remember { mutableFloatStateOf(0f) }
    var activeFingerWindowY by remember { mutableFloatStateOf(Float.NaN) }
    var weightTarget by remember { mutableStateOf<DiscoverySourceItem?>(null) }

    val density = LocalDensity.current
    val haptics = LocalHapticFeedback.current
    val scrollState = LocalSettingsScrollState.current
    val viewport = LocalSettingsPreviewViewport.current
    val reduced = LocalLiquidReduced.current

    val heights = remember { mutableStateMapOf<String, Float>() }
    val rowWindowTops = remember { mutableStateMapOf<String, Float>() }
    val fallbackHeight = with(density) { 64.dp.toPx() }
    val currentNode by rememberUpdatedState(node)
    val currentAction by rememberUpdatedState(action)

    LaunchedEffect(parsed) {
        if (draggingId == null) {
            order = parsed
        } else {
            val byId = parsed.associateBy { it.id }
            order = order.mapNotNull { byId[it.id] ?: it }
        }
    }

    LaunchedEffect(draggingId) {
        val id = draggingId ?: return@LaunchedEffect
        val scroll = scrollState ?: return@LaunchedEffect
        val edgeZonePx = with(density) { 72.dp.toPx() }
        val maxStepPx = with(density) { 12.dp.toPx() }
        while (draggingId == id) {
            val fingerY = activeFingerWindowY
            if (fingerY.isFinite() && viewport.height > 0f) {
                val topDist = fingerY - viewport.top
                val botDist = viewport.bottom - fingerY
                val delta = when {
                    topDist < edgeZonePx && scroll.value > 0 ->
                        -maxStepPx * ((edgeZonePx - topDist) / edgeZonePx).coerceIn(0.15f, 1f)
                    botDist < edgeZonePx && scroll.value < scroll.maxValue ->
                        maxStepPx * ((edgeZonePx - botDist) / edgeZonePx).coerceIn(0.15f, 1f)
                    else -> 0f
                }
                if (delta != 0f) scroll.scrollBy(delta)
            }
            delay(16L)
        }
    }

    fun commitOrder(items: List<DiscoverySourceItem> = order) {
        val arr = JSONArray()
        items.forEach { arr.put(it.id) }
        currentAction(TySettingEvent.action(currentNode.action), arr.toString(), 0.0)
    }

    fun onStepDrag(itemId: String, dy: Float, accumulatedRef: FloatArray) {
        accumulatedRef[0] += dy
        if (activeFingerWindowY.isFinite()) activeFingerWindowY += dy
        while (true) {
            val currentIndex = order.indexOfFirst { it.id == itemId }
            if (currentIndex < 0) break
            val dir = if (accumulatedRef[0] > 0f) 1 else -1
            val targetIndex = currentIndex + dir
            val neighborHeight = order.getOrNull(targetIndex)?.let { heights[it.id] } ?: fallbackHeight
            if (targetIndex in order.indices && abs(accumulatedRef[0]) >= neighborHeight * 0.52f) {
                order = order.toMutableList().apply {
                    java.util.Collections.swap(this, currentIndex, targetIndex)
                }
                accumulatedRef[0] -= dir * neighborHeight
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            } else {
                break
            }
        }
        dragVisualOffset = accumulatedRef[0]
    }

    LookaheadScope {
        Column(Modifier.fillMaxWidth()) {
            if (node.hint.isNotBlank()) {
                Text(
                    node.hint,
                    color = theme.muted,
                    fontSize = 12.sp,
                    lineHeight = 17.sp,
                    modifier = Modifier.padding(top = 6.dp, bottom = 8.dp),
                )
            }

            order.forEachIndexed { idx, item ->
                key(item.id) {
                    val isDragging = draggingId == item.id
                    val liftScale by animateFloatAsState(
                        targetValue = if (isDragging && !reduced) 1.02f else 1f,
                        animationSpec = tween(if (reduced) 0 else 150),
                        label = "source-drag-scale",
                    )
                    val liftElevation by animateFloatAsState(
                        targetValue = if (isDragging && !reduced) with(density) { 8.dp.toPx() } else 0f,
                        animationSpec = tween(if (reduced) 0 else 150),
                        label = "source-drag-elevation",
                    )
                    val settleOffset by animateFloatAsState(
                        targetValue = if (isDragging) dragVisualOffset else 0f,
                        animationSpec = if (isDragging || reduced) tween(0) else tween(160),
                        label = "source-drag-offset",
                    )
                    val placement = if (reduced || isDragging) {
                        Modifier
                    } else {
                        Modifier.animateBounds(
                            this@LookaheadScope,
                            boundsTransform = BoundsTransform { _, _ ->
                                tween(durationMillis = 190, easing = TingYuMotion.Emphasized)
                            },
                        )
                    }

                    if (idx > 0) {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .height(0.75.dp)
                                .background(theme.line.copy(alpha = 0.45f)),
                        )
                    }

                    Row(
                        placement
                            .fillMaxWidth()
                            .zIndex(if (isDragging) 4f else 0f)
                            .graphicsLayer {
                                translationY = settleOffset
                                scaleX = liftScale
                                scaleY = liftScale
                                shadowElevation = liftElevation
                            }
                            .clip(RoundedCornerShape(12.dp))
                            .background(if (isDragging) theme.surface.copy(alpha = 0.98f) else Color.Transparent)
                            .heightIn(min = 62.dp)
                            .onSizeChanged { heights[item.id] = it.height.toFloat() }
                            .onGloballyPositioned { rowWindowTops[item.id] = it.positionInWindow().y }
                            .pointerInput(item.id) {
                                val acc = floatArrayOf(0f)
                                detectDragGesturesAfterLongPress(
                                    onDragStart = { startOffset ->
                                        draggingId = item.id
                                        acc[0] = 0f
                                        dragVisualOffset = 0f
                                        val rowTop = rowWindowTops[item.id] ?: Float.NaN
                                        activeFingerWindowY = if (rowTop.isFinite()) rowTop + startOffset.y else Float.NaN
                                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                    },
                                    onDragEnd = {
                                        draggingId = null
                                        dragVisualOffset = 0f
                                        activeFingerWindowY = Float.NaN
                                        commitOrder()
                                    },
                                    onDragCancel = {
                                        draggingId = null
                                        dragVisualOffset = 0f
                                        activeFingerWindowY = Float.NaN
                                        order = parseDiscoverySourceItems(currentNode.value)
                                    },
                                ) { change, dragAmount ->
                                    change.consume()
                                    onStepDrag(item.id, dragAmount.y, acc)
                                }
                            }
                            .padding(top = 8.dp, bottom = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f).padding(end = 8.dp)) {
                            Text(
                                item.label,
                                color = theme.text,
                                fontSize = 15.sp,
                                fontWeight = FontWeight(600),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            if (item.status.isNotBlank()) {
                                Spacer(Modifier.height(3.dp))
                                Text(
                                    item.status,
                                    color = when {
                                        !item.enabled -> theme.muted.copy(alpha = 0.78f)
                                        item.status == "已登录" -> theme.accent
                                        else -> theme.muted
                                    },
                                    fontSize = 12.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }

                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            val weightLabel = node.options.firstOrNull { it.value == item.weight }?.label ?: "${item.weight}×"
                            Box(
                                Modifier
                                    .heightIn(min = 36.dp)
                                    .widthIn(min = 40.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .semantics { contentDescription = "${item.label}推荐权重 $weightLabel" }
                                    .chromeClickable(enabled = item.enabled, corner = 8.dp) {
                                        weightTarget = item
                                    }
                                    .padding(horizontal = 6.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    weightLabel,
                                    color = if (item.enabled) theme.accent else theme.muted.copy(alpha = 0.55f),
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Medium,
                                )
                            }

                            CompactSourceSwitch(
                                theme = theme,
                                checked = item.enabled,
                                contentDesc = "${item.label}推荐开关",
                            ) {
                                currentAction(TySettingEvent.action(currentNode.action), "toggle:${item.id}", 0.0)
                            }

                            // 右侧专属拖拽手柄：按住拖动立即 1:1 跟手响应，无长按迟滞、无文字误选
                            Box(
                                Modifier
                                    .size(width = 40.dp, height = 48.dp)
                                    .semantics {
                                        contentDescription = "拖动排序：${item.label}"
                                        customActions = listOf(-1 to "上移", 1 to "下移").map { (direction, moveLabel) ->
                                            CustomAccessibilityAction(moveLabel) {
                                                val currentIndex = order.indexOfFirst { it.id == item.id }
                                                val targetIndex = currentIndex + direction
                                                if (currentIndex >= 0 && targetIndex in order.indices) {
                                                    val next = order.toMutableList().apply {
                                                        java.util.Collections.swap(this, currentIndex, targetIndex)
                                                    }
                                                    order = next
                                                    commitOrder(next)
                                                    true
                                                } else false
                                            }
                                        }
                                    }
                                    .pointerInput(item.id) {
                                        val acc = floatArrayOf(0f)
                                        detectDragGestures(
                                            onDragStart = { startOffset ->
                                                draggingId = item.id
                                                acc[0] = 0f
                                                dragVisualOffset = 0f
                                                val rowTop = rowWindowTops[item.id] ?: Float.NaN
                                                activeFingerWindowY = if (rowTop.isFinite()) rowTop + startOffset.y else Float.NaN
                                                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                            },
                                            onDragEnd = {
                                                draggingId = null
                                                dragVisualOffset = 0f
                                                activeFingerWindowY = Float.NaN
                                                commitOrder()
                                            },
                                            onDragCancel = {
                                                draggingId = null
                                                dragVisualOffset = 0f
                                                activeFingerWindowY = Float.NaN
                                                order = parseDiscoverySourceItems(currentNode.value)
                                            },
                                        ) { change, dragAmount ->
                                            change.consume()
                                            onStepDrag(item.id, dragAmount.y, acc)
                                        }
                                    },
                                contentAlignment = Alignment.CenterEnd,
                            ) {
                                PageIcon(
                                    "grip-vertical",
                                    if (isDragging) theme.accent else theme.muted,
                                    Modifier.size(20.dp),
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    val currentWeightTarget = weightTarget
    SettingsOptionPopup(
        theme = theme,
        label = currentWeightTarget?.let { "${it.label} · 推荐权重" } ?: "推荐权重",
        options = node.options,
        value = currentWeightTarget?.weight ?: "1",
        visible = currentWeightTarget != null,
        onClose = { weightTarget = null },
    ) { picked ->
        val id = currentWeightTarget?.id
        weightTarget = null
        if (!id.isNullOrEmpty()) {
            currentAction(TySettingEvent.action(currentNode.action), "weight:$id:$picked", 0.0)
        }
    }
}

@Composable
internal fun DiscoverySourceSetting(theme: TyPanelTheme, node: TySettingNode, action: PageAction) {
    var expanded by remember { mutableStateOf(false) }
    val enabled = node.value == "1"
    SettingsItem(theme, node.title, trailing = {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .heightIn(min = 48.dp)
                    .widthIn(min = 56.dp)
                    .semantics { contentDescription = node.title + "推荐权重" }
                    .chromeClickable(enabled = enabled) { expanded = true },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    node.options.firstOrNull { it.value == node.detail }?.label ?: node.detail,
                    color = if (enabled) theme.accent else theme.muted,
                    fontSize = 13.sp,
                )
            }
            Switch(
                checked = enabled,
                modifier = Modifier.semantics { contentDescription = node.title },
                onCheckedChange = { action(TySettingEvent.set(node.action), if (it) "1" else "0", 0.0) },
                colors = SwitchDefaults.colors(checkedTrackColor = theme.accent, checkedThumbColor = theme.surface),
            )
        }
    })
    SettingsOptionPopup(theme, node.title, node.options, node.detail, visible = expanded, onClose = { expanded = false }) {
        expanded = false
        action(TySettingEvent.action(node.action), "weight:" + it, 0.0)
    }
}

/** 页面管理模块排序：统一右侧「开关 + 拖拽手柄」，支持 1:1 跟手位移与邻居平滑让位。 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
internal fun DiscoveryModuleOrder(theme: TyPanelTheme, node: TySettingNode, action: PageAction) {
    var order by remember { mutableStateOf(node.options) }
    var draggingId by remember { mutableStateOf<String?>(null) }
    var dragVisualOffset by remember { mutableFloatStateOf(0f) }
    var activeFingerWindowY by remember { mutableFloatStateOf(Float.NaN) }

    val density = LocalDensity.current
    val haptics = LocalHapticFeedback.current
    val scrollState = LocalSettingsScrollState.current
    val viewport = LocalSettingsPreviewViewport.current
    val reduced = LocalLiquidReduced.current

    val heights = remember { mutableStateMapOf<String, Float>() }
    val rowWindowTops = remember { mutableStateMapOf<String, Float>() }
    val fallbackHeight = with(density) { 58.dp.toPx() }
    val currentNode by rememberUpdatedState(node)
    val currentAction by rememberUpdatedState(action)

    val hidden = remember(node.value) {
        runCatching {
            val a = JSONArray(node.value)
            (0 until a.length()).map { a.getString(it) }.toSet()
        }.getOrDefault(emptySet())
    }

    LaunchedEffect(node.options) {
        if (draggingId == null) order = node.options
    }

    LaunchedEffect(draggingId) {
        val id = draggingId ?: return@LaunchedEffect
        val scroll = scrollState ?: return@LaunchedEffect
        val edgeZonePx = with(density) { 72.dp.toPx() }
        val maxStepPx = with(density) { 12.dp.toPx() }
        while (draggingId == id) {
            val fingerY = activeFingerWindowY
            if (fingerY.isFinite() && viewport.height > 0f) {
                val topDist = fingerY - viewport.top
                val botDist = viewport.bottom - fingerY
                val delta = when {
                    topDist < edgeZonePx && scroll.value > 0 ->
                        -maxStepPx * ((edgeZonePx - topDist) / edgeZonePx).coerceIn(0.15f, 1f)
                    botDist < edgeZonePx && scroll.value < scroll.maxValue ->
                        maxStepPx * ((edgeZonePx - botDist) / edgeZonePx).coerceIn(0.15f, 1f)
                    else -> 0f
                }
                if (delta != 0f) scroll.scrollBy(delta)
            }
            delay(16L)
        }
    }

    fun commit(items: List<TySettingOption> = order) {
        currentAction(
            TySettingEvent.action(currentNode.action),
            JSONArray(items.map { it.value }).toString(),
            0.0,
        )
    }

    fun onStepModuleDrag(moduleId: String, dy: Float, accRef: FloatArray) {
        accRef[0] += dy
        if (activeFingerWindowY.isFinite()) activeFingerWindowY += dy
        while (true) {
            val index = order.indexOfFirst { it.value == moduleId }
            if (index < 0) break
            val dir = if (accRef[0] > 0f) 1 else -1
            val target = index + dir
            val neighborHeight = order.getOrNull(target)?.let { heights[it.value] } ?: fallbackHeight
            if (target in order.indices && abs(accRef[0]) >= neighborHeight * 0.52f) {
                order = order.toMutableList().apply {
                    java.util.Collections.swap(this, index, target)
                }
                accRef[0] -= dir * neighborHeight
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            } else {
                break
            }
        }
        dragVisualOffset = accRef[0]
    }

    LookaheadScope {
        Column(Modifier.fillMaxWidth()) {
            if (node.hint.isNotBlank()) {
                Text(
                    node.hint,
                    color = theme.muted,
                    fontSize = 12.sp,
                    lineHeight = 17.sp,
                    modifier = Modifier.padding(top = 6.dp, bottom = 8.dp),
                )
            }

            order.forEachIndexed { idx, option ->
                key(option.value) {
                    val isDragging = draggingId == option.value
                    val liftScale by animateFloatAsState(
                        targetValue = if (isDragging && !reduced) 1.02f else 1f,
                        animationSpec = tween(if (reduced) 0 else 150),
                        label = "module-drag-scale",
                    )
                    val liftElevation by animateFloatAsState(
                        targetValue = if (isDragging && !reduced) with(density) { 8.dp.toPx() } else 0f,
                        animationSpec = tween(if (reduced) 0 else 150),
                        label = "module-drag-elevation",
                    )
                    val settleOffset by animateFloatAsState(
                        targetValue = if (isDragging) dragVisualOffset else 0f,
                        animationSpec = if (isDragging || reduced) tween(0) else tween(160),
                        label = "module-drag-offset",
                    )
                    val placement = if (reduced || isDragging) {
                        Modifier
                    } else {
                        Modifier.animateBounds(
                            this@LookaheadScope,
                            boundsTransform = BoundsTransform { _, _ ->
                                tween(durationMillis = 190, easing = TingYuMotion.Emphasized)
                            },
                        )
                    }

                    if (idx > 0) {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .height(0.75.dp)
                                .background(theme.line.copy(alpha = 0.45f)),
                        )
                    }

                    Row(
                        placement
                            .fillMaxWidth()
                            .zIndex(if (isDragging) 4f else 0f)
                            .graphicsLayer {
                                translationY = settleOffset
                                scaleX = liftScale
                                scaleY = liftScale
                                shadowElevation = liftElevation
                            }
                            .clip(RoundedCornerShape(12.dp))
                            .background(if (isDragging) theme.surface.copy(alpha = 0.98f) else Color.Transparent)
                            .heightIn(min = 58.dp)
                            .onSizeChanged { heights[option.value] = it.height.toFloat() }
                            .onGloballyPositioned { rowWindowTops[option.value] = it.positionInWindow().y }
                            .pointerInput(option.value) {
                                val acc = floatArrayOf(0f)
                                detectDragGesturesAfterLongPress(
                                    onDragStart = { startOffset ->
                                        draggingId = option.value
                                        acc[0] = 0f
                                        dragVisualOffset = 0f
                                        val rowTop = rowWindowTops[option.value] ?: Float.NaN
                                        activeFingerWindowY = if (rowTop.isFinite()) rowTop + startOffset.y else Float.NaN
                                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                    },
                                    onDragEnd = {
                                        draggingId = null
                                        dragVisualOffset = 0f
                                        activeFingerWindowY = Float.NaN
                                        commit()
                                    },
                                    onDragCancel = {
                                        draggingId = null
                                        dragVisualOffset = 0f
                                        activeFingerWindowY = Float.NaN
                                        order = currentNode.options
                                    },
                                ) { change, dragAmount ->
                                    change.consume()
                                    onStepModuleDrag(option.value, dragAmount.y, acc)
                                }
                            }
                            .padding(vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        // 左侧：模块标题
                        Text(
                            option.label,
                            color = theme.text,
                            fontSize = 15.sp,
                            fontWeight = FontWeight(600),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f).padding(end = 8.dp),
                        )

                        // 右侧：统一开关 + 拖拽手柄（与推荐来源列表完全对齐）
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            CompactSourceSwitch(
                                theme = theme,
                                checked = option.value !in hidden,
                                contentDesc = "显示${option.label}",
                            ) {
                                currentAction(TySettingEvent.action(currentNode.action), "toggle:" + option.value, 0.0)
                            }

                            Box(
                                Modifier
                                    .size(width = 40.dp, height = 48.dp)
                                    .semantics {
                                        contentDescription = "拖动排序：${option.label}"
                                        customActions = listOf(-1 to "上移", 1 to "下移").map { (direction, label) ->
                                            CustomAccessibilityAction(label) {
                                                val index = order.indexOfFirst { it.value == option.value }
                                                val target = index + direction
                                                if (index >= 0 && target in order.indices) {
                                                    val next = order.toMutableList().apply {
                                                        java.util.Collections.swap(this, index, target)
                                                    }
                                                    order = next
                                                    commit(next)
                                                    true
                                                } else false
                                            }
                                        }
                                    }
                                    .pointerInput(option.value) {
                                        val acc = floatArrayOf(0f)
                                        detectDragGestures(
                                            onDragStart = { startOffset ->
                                                draggingId = option.value
                                                acc[0] = 0f
                                                dragVisualOffset = 0f
                                                val rowTop = rowWindowTops[option.value] ?: Float.NaN
                                                activeFingerWindowY = if (rowTop.isFinite()) rowTop + startOffset.y else Float.NaN
                                                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                            },
                                            onDragEnd = {
                                                draggingId = null
                                                dragVisualOffset = 0f
                                                activeFingerWindowY = Float.NaN
                                                commit()
                                            },
                                            onDragCancel = {
                                                draggingId = null
                                                dragVisualOffset = 0f
                                                activeFingerWindowY = Float.NaN
                                                order = currentNode.options
                                            },
                                        ) { change, dragAmount ->
                                            change.consume()
                                            onStepModuleDrag(option.value, dragAmount.y, acc)
                                        }
                                    },
                                contentAlignment = Alignment.CenterEnd,
                            ) {
                                PageIcon(
                                    "grip-vertical",
                                    if (isDragging) theme.accent else theme.muted,
                                    Modifier.size(20.dp),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
