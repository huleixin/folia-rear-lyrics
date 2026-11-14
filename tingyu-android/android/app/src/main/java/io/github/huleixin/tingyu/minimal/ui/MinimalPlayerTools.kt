package io.github.huleixin.tingyu.minimal.ui

import io.github.huleixin.tingyu.chrome.LiquidIcon
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.huleixin.tingyu.chrome.SleepAlarm
import io.github.huleixin.tingyu.minimal.MinimalControls
import io.github.huleixin.tingyu.minimal.MinimalPlayerCommands
import kotlinx.coroutines.delay

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/MinimalPlayerTools.kt
// 封面与歌词共用的第二行：模式、原生定时、真实音质、队列、更多。

@Composable
internal fun MinimalPlayerTools(
    controls: MinimalControls,
    live: Boolean,
    ink: MinimalInk,
    light: Boolean,
    commands: MinimalPlayerCommands,
    onOpenSleep: (() -> Unit)?,
    sleepActive: Boolean,
    sleepLabel: String,
    onSleepAnchor: ((Rect) -> Unit)?,
    onOpenMore: () -> Unit,
    moreMenu: @Composable () -> Unit,
    onMoreAnchor: ((Rect) -> Unit)? = null,
) {
    var hint by remember { mutableStateOf<String?>(null) }
    var lastMode by remember { mutableStateOf(controls.mode) }
    LaunchedEffect(controls.mode) {
        if (controls.mode != lastMode) {
            lastMode = controls.mode
            hint = modeLabel(controls.mode)
            delay(1500)
            hint = null
        }
    }
    Box(Modifier.fillMaxWidth().padding(top = 8.dp)) {
        Row(Modifier.fillMaxWidth().height(48.dp), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween) {
            Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                TransportButton("播放模式：${modeLabel(controls.mode)}", live, ink, 48.dp, { commands.cycleMode() }) {
                    // 所有播放器共用 PlayerIcons；非顺序模式保持薄荷绿激活态。
                    LiquidIcon(controls.mode) { mode -> PlaybackModeIcon(mode, if (modeIsActive(mode)) mintActive(light) else ink.inkAlpha(74), Modifier.size(22.dp)) }
                }
            }
            Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                // 定时是原生宿主动作，不依赖 JS 播放动作桥是否可用。
                TransportButton(sleepLabel, onOpenSleep != null, ink, 48.dp, { onOpenSleep?.invoke() },
                    modifier = Modifier.onGloballyPositioned { onSleepAnchor?.invoke(it.boundsInRoot()) }) {
                    SleepAlarm(if (sleepActive) mintActive(light) else ink.ink, Modifier.size(22.dp))
                }
            }
            Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                val quality = currentQualityLabel(controls)
                TransportButton("当前音质：$quality，选择音质", live, ink, 48.dp, { commands.openAudioQuality() },
                    modifier = Modifier.fillMaxWidth()) {
                    PlayerControlIcon("audioBars", ink.ink, Modifier.size(22.dp))
                }
            }
            Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                TransportButton("播放队列", live, ink, 48.dp, { commands.openQueue() }) {
                    PlayerControlIcon("queue", ink.ink, Modifier.size(22.dp))
                }
            }
            Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                TransportButton("更多", live, ink, 48.dp, onOpenMore, onLongClick = { commands.toggleDiagBadge() },
                    modifier=Modifier.onGloballyPositioned{onMoreAnchor?.invoke(it.boundsInRoot())}) {
                    Canvas(Modifier.size(22.dp)) {
                        val u = size.minDimension / 22f
                        listOf(5f, 11f, 17f).forEach { dot -> drawCircle(ink.ink, 1.7f * u, Offset(dot * u, 11f * u)) }
                    }
                }
                moreMenu()
            }
        }
        // 保留模式切换提示，不再为分页点或提示预留底部空隙。
        AnimatedVisibility(hint != null, enter = fadeIn(tween(150)), exit = fadeOut(tween(220)),
            modifier = Modifier.align(Alignment.TopStart).offset(y = (-20).dp)) {
            Text(hint ?: "", color = ink.inkAlpha(88), fontSize = 11.sp, fontWeight = FontWeight.Medium,
                maxLines = 1, modifier = Modifier.background(ink.ink.copy(alpha = .04f), RoundedCornerShape(999.dp))
                    .border(1.dp, ink.inkAlpha(12), RoundedCornerShape(999.dp)).padding(horizontal = 9.dp, vertical = 3.dp))
        }
    }
}

/** 只读真实流信息，偏好档位 qualityMode 不能冒充当前播放音质。 */
internal fun currentQualityLabel(controls: MinimalControls): String = when (QualityLevel.fromWire(controls.qualityLevel)) {
    QualityLevel.STANDARD -> "标准"
    QualityLevel.HQ -> "HQ"
    QualityLevel.FLAC -> controls.qualityLabelOverride.ifBlank { "FLAC" }
    QualityLevel.HIRES -> "Hi-Res"
    QualityLevel.MASTER -> "臻品母带"
    QualityLevel.SPATIAL -> "空间音频"
    null -> controls.quality.ifBlank { "音质" }
}

private fun modeLabel(mode: String): String = when (mode) {
    "all" -> "列表循环"
    "one" -> "单曲循环"
    "shuffle" -> "随机播放"
    else -> "顺序播放"
}
