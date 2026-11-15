package io.github.huleixin.tingyu.minimal.immersive

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.huleixin.tingyu.chrome.*
import io.github.huleixin.tingyu.minimal.MinimalPlayerCommands

// Tingyu business actions on the immersive player's own translucent surface.
@Composable
internal fun ImmersiveActionsSheet(
    visible: Boolean, light: Boolean, onClose: () -> Unit, onOpenStyle: () -> Unit,
    onSleep: () -> Unit, onTools: (String) -> Unit, commands: MinimalPlayerCommands,
) {
    TyPanelOverlay(visible, light, onClose = onClose) {
        val theme = TyPanelTheme.from(LocalInterfacePalette.current).copy(
            surface = Color(0xF02B2B30), text = Color.White, muted = Color.White.copy(alpha = .62f))
        TySheetFrame(theme, "歌曲操作", "", .74f, onClose) {
            listOf(
                Triple("播放器风格", "当前：沉浸极简", onOpenStyle),
                Triple("定时关闭", "", onSleep),
                Triple("音质与音频信息", "", { onTools("quality") }),
                Triple("均衡器与音效", "", { onTools("effects") }),
                Triple("歌词设置", "", { onTools("lyrics") }),
                Triple("播放设置", "", { commands.openPlaybackSettings(); Unit }),
            ).forEach { (title, subtitle, action) ->
                Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(bottom = 4.dp)
                    .clip(RoundedCornerShape(14.dp)).background(Color.White.copy(alpha = .07f))
                    .clickable { onClose(); action() }.padding(horizontal = 18.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    Text(title, Modifier.weight(1f), color = theme.text, fontSize = 16.sp)
                    if (subtitle.isNotEmpty()) Text(subtitle, color = theme.muted, fontSize = 12.sp)
                }
            }
        }
    }
}
