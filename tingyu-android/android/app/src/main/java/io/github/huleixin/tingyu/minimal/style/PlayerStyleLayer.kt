package io.github.huleixin.tingyu.minimal.style

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import io.github.huleixin.tingyu.chrome.*
import io.github.huleixin.tingyu.minimal.*

// One modal controller serves both player menus and the native settings entry.
@Composable
internal fun PlayerStyleLayer(controller: PlayerStyleController, light: Boolean,
    runtime: MinimalPlayerRuntime, commands: MinimalPlayerCommands, queue: MinimalQueue,
) {
    val panel by controller.panel.collectAsState()
    val style by controller.style.collectAsState()
    var retained by remember { mutableStateOf(PlayerStylePanel.INTRODUCTION) }
    if (panel != PlayerStylePanel.CLOSED) SideEffect { retained = panel }
    val theme = TyPanelTheme.from(LocalInterfacePalette.current)
    TyPanelOverlay(panel != PlayerStylePanel.CLOSED, light,
        modifier = Modifier.fillMaxSize().zIndex(10f), onClose = controller::back) {
        AnimatedContent(if (panel == PlayerStylePanel.CLOSED) retained else panel,
            transitionSpec = { fadeIn(tween(220)) togetherWith fadeOut(tween(160)) }, label = "player-style-panel") { page ->
            if (page == PlayerStylePanel.COFFEE) {
                SupportSheets("coffee", null, controller::back, onReturnAndExperience = controller::experience)
            } else {
                PlayerStyleSheet(theme,
                    if (page == PlayerStylePanel.INTRODUCTION) "更多音乐体验" else "播放器风格",
                    if (page == PlayerStylePanel.INTRODUCTION) "把听见的喜欢，留在身边" else "选择属于你的音乐体验",
                    controller::back) {
                    if (page == PlayerStylePanel.INTRODUCTION) {
                        Text("不同的风格，同样的热爱。", color = theme.text, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(10.dp))
                        Text("听屿正在不断探索更多音乐呈现方式。如果你喜欢这些设计，不妨请作者喝杯咖啡，支持未来更多风格的开发。",
                            color = theme.muted, fontSize = 14.sp, lineHeight = 22.sp)
                    }
                    PlayerStylePreviews(runtime, commands, queue, style,
                        enabled = page == PlayerStylePanel.SELECTION, onSelect = controller::select)
                    if (page == PlayerStylePanel.INTRODUCTION) {
                        Text("金额随心，捐赠自愿，所有风格均可免费使用。", color = theme.muted, fontSize = 13.sp, lineHeight = 20.sp)
                        Spacer(Modifier.height(14.dp))
                        StyleAction("请作者喝杯咖啡", theme, controller::openCoffee)
                        Spacer(Modifier.height(8.dp))
                        StyleAction("直接体验", theme, controller::experience)
                    }
                }
            }
        }
    }
}

@Composable
private fun StyleAction(label: String, theme: TyPanelTheme, action: () -> Unit) {
    Box(Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(RoundedCornerShape(14.dp))
        .background(theme.accent.copy(alpha = .13f)).border(1.dp, theme.line, RoundedCornerShape(14.dp))
        .clickable(onClick = action).padding(14.dp)) {
        Text(label, color = theme.text, fontSize = 15.sp, fontWeight = FontWeight.Medium)
    }
}
