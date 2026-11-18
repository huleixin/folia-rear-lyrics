package io.github.huleixin.tingyu.chrome

import androidx.compose.animation.BoundsTransform
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.animateBounds
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
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
import org.json.JSONObject
import kotlin.math.abs

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/DiscoverySettingsControls.kt

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
                color = if (checked) theme.accent.copy(alpha = 0.78f) else theme.muted.copy(alpha = 0.28f),
                cornerRadius = CornerRadius(trackH / 2f),
                size = Size(size.width, trackH),
            )
            val x = 2.dp.toPx() + travel * progress
            drawCircle(
                color = theme.knob.copy(alpha = if (checked) 0.96f else 0.86f),
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
            // Keep live status/weight/enabled synced while preserving active drag permutation.
            val byId = parsed.associateBy { it.id }
            order = order.mapNotNull { byId[it.id] ?: it }
        }
    }

    // Edge auto-scroll when dragging near top or bottom of the settings scroll viewport.
    LaunchedEffect(draggingId) {
        val id = draggingId ?: return@LaunchedEffect
        val scroll = scrollState ?: return@LaunchedEffect
        val edgeZonePx = with(density) { 68.dp.toPx() }
        val maxStepPx = with(density) { 10.dp.toPx() }
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
                if (delta != 0f) {
                    scroll.scrollBy(delta)
                }
            }
            delay(16L)
        }
    }

    fun commitOrder(items: List<DiscoverySourceItem> = order) {
        val arr = JSONArray()
        items.forEach { arr.put(it.id) }
        currentAction(TySettingEvent.action(currentNode.action), arr.toString(), 0.0)
    }

    LookaheadScope {
        Column(Modifier.fillMaxWidth()) {
            if (node.hint.isNotBlank()) {
                Text(
                    node.hint,
                    color = theme.muted,
                    fontSize = 12.sp,
                    lineHeight = 17.sp,
                    modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 8.dp),
                )
            }

            order.forEachIndexed { idx, item ->
                key(item.id) {
                    val isDragging = draggingId == item.id
                    val liftScale by animateFloatAsState(
                        targetValue = if (isDragging && !reduced) 1.015f else 1f,
                        animationSpec = tween(if (reduced) 0 else 180),
                        label = "source-drag-scale",
                    )
                    val liftElevation by animateFloatAsState(
                        targetValue = if (isDragging && !reduced) with(density) { 6.dp.toPx() } else 0f,
                        animationSpec = tween(if (reduced) 0 else 180),
                        label = "source-drag-elevation",
                    )
                    val settleOffset by animateFloatAsState(
                        targetValue = if (isDragging) dragVisualOffset else 0f,
                        animationSpec = if (isDragging || reduced) tween(0) else tween(180),
                        label = "source-drag-offset",
                    )
                    val placement = if (reduced) {
                        Modifier
                    } else {
                        Modifier.animateBounds(
                            this@LookaheadScope,
                            boundsTransform = BoundsTransform { _, _ ->
                                tween(durationMillis = 200, easing = TingYuMotion.Emphasized)
                            },
                        )
                    }

                    if (idx > 0) {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp)
                                .height(0.75.dp)
                                .background(theme.line.copy(alpha = 0.45f)),
                        )
                    }

                    Row(
                        placement
                            .fillMaxWidth()
                            .zIndex(if (isDragging) 2f else 0f)
                            .graphicsLayer {
                                translationY = settleOffset
                                scaleX = liftScale
                                scaleY = liftScale
                                shadowElevation = liftElevation
                            }
                            .clip(RoundedCornerShape(14.dp))
                            .background(if (isDragging) theme.surface.copy(alpha = 0.96f) else androidx.compose.ui.graphics.Color.Transparent)
                            .heightIn(min = 64.dp)
                            .onSizeChanged { heights[item.id] = it.height.toFloat() }
                            .onGloballyPositioned { rowWindowTops[item.id] = it.positionInWindow().y }
                            .padding(start = 16.dp, end = 4.dp, top = 8.dp, bottom = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        // 平台名称及登录状态（上下两行，主副标题间距 4dp）
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
                                Spacer(Modifier.height(4.dp))
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

                        // 右侧控件组：推荐权重 ｜ 开关 ｜ 拖拽手柄（间距 8dp）
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            val weightLabel = node.options.firstOrNull { it.value == item.weight }?.label ?: "${item.weight}×"
                            Box(
                                Modifier
                                    .heightIn(min = 36.dp)
                                    .widthIn(min = 42.dp)
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

                            // 拖拽手柄：20dp 图标，48×48dp 实际触摸区域，支持无障碍上下移动
                            Box(
                                Modifier
                                    .size(48.dp)
                                    .semantics {
                                        contentDescription = "长按拖动排序：${item.label}"
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
                                                } else {
                                                    false
                                                }
                                            }
                                        }
                                    }
                                    .pointerInput(item.id) {
                                        var accumulated = 0f
                                        detectDragGesturesAfterLongPress(
                                            onDragStart = { startOffset ->
                                                draggingId = item.id
                                                accumulated = 0f
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
                                            accumulated += dragAmount.y
                                            if (activeFingerWindowY.isFinite()) {
                                                activeFingerWindowY += dragAmount.y
                                            }
                                            val currentIndex = order.indexOfFirst { it.id == item.id }
                                            if (currentIndex >= 0) {
                                                val targetIndex = currentIndex + if (accumulated > 0f) 1 else -1
                                                val threshold = (order.getOrNull(targetIndex)?.let { heights[it.id] } ?: fallbackHeight) * 0.65f
                                                if (targetIndex in order.indices && abs(accumulated) >= threshold) {
                                                    order = order.toMutableList().apply {
                                                        java.util.Collections.swap(this, currentIndex, targetIndex)
                                                    }
                                                    accumulated -= if (accumulated > 0f) threshold else -threshold
                                                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                                }
                                                dragVisualOffset = accumulated.coerceIn(-fallbackHeight * 0.5f, fallbackHeight * 0.5f)
                                            }
                                        }
                                    },
                                contentAlignment = Alignment.Center,
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

@Composable internal fun DiscoverySourceSetting(theme:TyPanelTheme,node:TySettingNode,action:PageAction) {
    var expanded by remember { mutableStateOf(false) }
    val enabled=node.value=="1"
    SettingsItem(theme,node.title,trailing={
        Row(verticalAlignment=Alignment.CenterVertically) {
            Box(Modifier.heightIn(min=48.dp).widthIn(min=56.dp).semantics{contentDescription=node.title+"推荐权重"}.chromeClickable(enabled=enabled){expanded=true},contentAlignment=Alignment.Center){
                Text(node.options.firstOrNull{it.value==node.detail}?.label?:node.detail,color=if(enabled)theme.accent else theme.muted,fontSize=13.sp)
            }
            Switch(checked=enabled,modifier=Modifier.semantics{contentDescription=node.title},onCheckedChange={action(TySettingEvent.set(node.action),if(it)"1" else "0",0.0)},
                colors=SwitchDefaults.colors(checkedTrackColor=theme.accent,checkedThumbColor=theme.surface))
        }
    })
    SettingsOptionPopup(theme,node.title,node.options,node.detail,visible=expanded,onClose={expanded=false}){
        expanded=false;action(TySettingEvent.action(node.action),"weight:"+it,0.0)
    }
}

/** Drag is local while held; one bridge event persists the final permutation on release. */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable internal fun DiscoveryModuleOrder(theme:TyPanelTheme,node:TySettingNode,action:PageAction) {
    var order by remember { mutableStateOf(node.options) }
    var dragging by remember { mutableStateOf<String?>(null) }
    val density=LocalDensity.current
    val heights=remember { mutableStateMapOf<String,Float>() }
    val fallbackHeight=with(density){58.dp.toPx()}
    val currentNode by rememberUpdatedState(node)
    val currentAction by rememberUpdatedState(action)
    val reduced=LocalLiquidReduced.current
    val hidden=remember(node.value){runCatching{val a=JSONArray(node.value);(0 until a.length()).map{a.getString(it)}.toSet()}.getOrDefault(emptySet())}
    LaunchedEffect(node.options){if(dragging==null)order=node.options}
    fun commit(){currentAction(TySettingEvent.action(currentNode.action),JSONArray(order.map{it.value}).toString(),0.0)}
    LookaheadScope {
    Column {
        Text(node.hint,color=theme.muted,fontSize=12.sp,modifier=Modifier.padding(vertical=8.dp))
        order.forEach { option -> key(option.value) {
            val placement=if(reduced)Modifier else Modifier.animateBounds(this@LookaheadScope,
                boundsTransform=BoundsTransform { _,_->
                    spring(dampingRatio=TingYuMotion.PanelDamping,stiffness=TingYuMotion.PanelStiffness)
                })
            Row(placement.fillMaxWidth().heightIn(min=58.dp).onSizeChanged{heights[option.value]=it.height.toFloat()},verticalAlignment=Alignment.CenterVertically){
                Box(Modifier.size(48.dp).semantics {
                    contentDescription="拖动排序："+option.label
                    customActions=listOf(-1 to "上移",1 to "下移").map{(direction,label)->CustomAccessibilityAction(label){
                        val index=order.indexOfFirst{it.value==option.value};val target=index+direction
                        if(target in order.indices){order=order.toMutableList().apply{java.util.Collections.swap(this,index,target)};commit();true}else false
                    }}
                }.pointerInput(option.value){
                    var distance=0f
                    detectDragGesturesAfterLongPress(onDragStart={dragging=option.value;distance=0f},
                        onDragEnd={dragging=null;commit()},onDragCancel={dragging=null;order=currentNode.options}){change,amount->
                        change.consume();distance+=amount.y
                        val index=order.indexOfFirst{it.value==option.value}
                        val target=index+if(distance>0)1 else -1
                        val threshold=order.getOrNull(target)?.let{heights[it.value]}?:fallbackHeight
                        if(target in order.indices&&abs(distance)>=threshold){
                            order=order.toMutableList().apply{java.util.Collections.swap(this,index,target)}
                            distance-=if(distance>0)threshold else -threshold
                        }
                    }
                },contentAlignment=Alignment.Center){PageIcon("grip-vertical",if(dragging==option.value)theme.accent else theme.muted,Modifier.size(20.dp))}
                Text(option.label,color=theme.text,fontSize=14.sp,modifier=Modifier.weight(1f))
                Switch(checked=option.value !in hidden,modifier=Modifier.semantics{contentDescription="显示"+option.label},onCheckedChange={action(TySettingEvent.action(node.action),"toggle:"+option.value,0.0)},
                    colors=SwitchDefaults.colors(checkedTrackColor=theme.accent,checkedThumbColor=theme.surface))
            }
        }}
    }
    }
}
