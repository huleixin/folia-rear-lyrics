package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.semantics.*
import androidx.compose.ui.state.ToggleableState
import coil.compose.AsyncImage
import org.json.JSONObject
import kotlin.math.max

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/SettingsRichControls.kt
// Rich form controls share TySettings spacing/palette. Only the existing Folia renderer
// remains a browser island, placed and clipped using native layout evidence.
internal val LocalSettingsPreviewViewport = staticCompositionLocalOf { Rect(0f, 0f, Float.MAX_VALUE, Float.MAX_VALUE) }

@Composable
internal fun SettingsOrder(theme: TyPanelTheme, node: TySettingNode, onAction: PageAction, showTitle: Boolean = true) {
    Column(Modifier.fillMaxWidth()) {
        if(showTitle)Text(node.title, color = theme.text, fontSize = 14.sp, modifier = Modifier.padding(vertical = 10.dp))
        node.options.forEachIndexed { index, option ->
            SettingsItem(theme, "${index + 1}. ${option.label}", trailing = {
                Row {
                    listOf(-1 to node.placeholder, 1 to node.confirmLabel).forEach { (direction, label) ->
                        val target = index + direction
                        val enabled = !node.disabled && target in node.options.indices
                        Box(Modifier.size(44.dp).semantics { contentDescription = "$label ${option.label}" }
                            .chromeClickable(enabled = enabled, role = Role.Button) {
                                val order = node.options.map { it.value }.toMutableList()
                                java.util.Collections.swap(order, index, target)
                                onAction(TySettingEvent.action(node.action), org.json.JSONArray(order).toString(), 0.0)
                            }, contentAlignment = androidx.compose.ui.Alignment.Center) {
                            PageIcon(if (direction < 0) "chevron-up" else "chevron-down", if (enabled) theme.accent else theme.muted.copy(alpha = .3f), Modifier.size(18.dp))
                        }
                    }
                }
            })
        }
    }
}

@Composable
internal fun SettingsCheckbox(theme: TyPanelTheme, node: TySettingNode, onAction: PageAction) {
    val state = when (node.value) { "mixed" -> ToggleableState.Indeterminate; "1" -> ToggleableState.On; else -> ToggleableState.Off }
    Box(Modifier.semantics(mergeDescendants = true) { role = Role.Checkbox; toggleableState = state }) {
        SettingsItem(theme, node.title, node.hint, enabled = !node.disabled,
            onClick = { onAction(TySettingEvent.set(node.action), if (node.value == "1") "0" else "1", 0.0) }, trailing = {
                androidx.compose.material3.TriStateCheckbox(state = state, onClick = null, enabled = !node.disabled,
                    colors = androidx.compose.material3.CheckboxDefaults.colors(checkedColor = theme.accent, uncheckedColor = theme.muted, checkmarkColor = theme.surface))
            })
    }
}

@Composable
internal fun SettingsColor(theme: TyPanelTheme, node: TySettingNode, onAction: PageAction) {
    val hsv = remember(node.value) { FloatArray(3).also { values ->
        try { android.graphics.Color.colorToHSV(android.graphics.Color.parseColor(node.value), values) }
        catch (_: IllegalArgumentException) { android.graphics.Color.colorToHSV(android.graphics.Color.WHITE, values) }
    } }
    fun update(index: Int, value: Float) {
        val next = hsv.copyOf(); next[index] = value
        val hex = String.format("#%06x", android.graphics.Color.HSVToColor(next) and 0xffffff)
        onAction(TySettingEvent.action(node.action), hex, 0.0)
    }
    Column(Modifier.fillMaxWidth().padding(vertical = 12.dp)) {
        SettingsItem(theme, node.title, enabled = !node.disabled, trailing = {
            Box(Modifier.size(28.dp).clip(RoundedCornerShape(8.dp)).background(Color(android.graphics.Color.HSVToColor(hsv))))
        })
        fun label(name: String) = node.options.firstOrNull { it.value == name }?.label ?: name
        SettingsSlider(theme, label("hue"), value = hsv[0], min = 0f, max = 360f, step = 1f, unit = "°", enabled = !node.disabled) { update(0, it) }
        SettingsSlider(theme, label("saturation"), value = hsv[1] * 100, min = 0f, max = 100f, step = 1f, unit = "%", enabled = !node.disabled) { update(1, it / 100) }
        SettingsSlider(theme, label("brightness"), value = hsv[2] * 100, min = 0f, max = 100f, step = 1f, unit = "%", enabled = !node.disabled) { update(2, it / 100) }
        SettingsInput(theme, "HEX", value = node.value, confirmLabel = node.confirmLabel, enabled = !node.disabled) { text ->
            if (Regex("#[0-9a-fA-F]{6}").matches(text)) onAction(TySettingEvent.action(node.action), text, 0.0)
        }
    }
}

@Composable
internal fun SettingsImage(node: TySettingNode) {
    AsyncImage(model = pageImage(node.value), contentDescription = node.title.ifBlank { null },
        modifier = Modifier.fillMaxWidth().heightIn(min = 80.dp, max = 220.dp).padding(vertical = 8.dp).clip(RoundedCornerShape(14.dp)))
}

@Composable
internal fun SettingsPreview(node: TySettingNode, onAction: PageAction) {
    val scale = LocalDensity.current.density
    val liveEnabled = LocalSettingsTraceIdentity.current.liveEnabled
    val viewport = LocalSettingsPreviewViewport.current
    val cutouts = LocalSettingsPreviewCutouts.current
    val lastPacket = remember(node.id) { arrayOf<String?>(null) }
    val lastVisible = remember(node.id) { arrayOf<Boolean?>(null) }
    DisposableEffect(node.id, cutouts) { onDispose { cutouts?.remove(node.id) } }
    val latestAction by rememberUpdatedState(onAction)
    Canvas(Modifier.fillMaxWidth().height(node.min.coerceIn(132f, 460f).dp)
        .onGloballyPositioned { coordinates ->
            val p = coordinates.positionInWindow(); val clipped = coordinates.boundsInWindow()
            val height = coordinates.size.height.toFloat()
            val bounds = Rect(p.x, p.y, p.x + coordinates.size.width, p.y + height)
            val visibleBounds = clipped.intersect(viewport)
            val visible = liveEnabled && visibleBounds.width > 0f && visibleBounds.height > 0f
            if (visible) cutouts?.update(node.id, bounds, visibleBounds)
            else cutouts?.remove(node.id)
            // An offscreen island needs one hide packet, not bridge traffic for every scroll pixel.
            if (!visible && lastVisible[0] == false) return@onGloballyPositioned
            lastVisible[0] = visible
            val packet = JSONObject().put("x", p.x / scale).put("y", p.y / scale)
                .put("w", coordinates.size.width / scale).put("h", height / scale)
                .put("top", (max(clipped.top, viewport.top) - p.y).coerceIn(0f, height) / scale)
                .put("bottom", (p.y + height - minOf(clipped.bottom, viewport.bottom)).coerceIn(0f, height) / scale)
            if (!visible) packet.put("top", height / scale).put("bottom", 0)
            val serialized = packet.toString()
            if (lastPacket[0] != serialized) {
                lastPacket[0] = serialized
                latestAction("preview:${node.id}", serialized, 0.0)
            }
        }.pointerInput(node.id) { detectTapGestures { point ->
            latestAction("preview-tap:${node.id}", JSONObject().put("x", point.x / scale).put("y", point.y / scale).toString(), 0.0)
        } }) {
        // The source background excludes this region; clearing a captured Haze layer can lose frames.
    }
}
