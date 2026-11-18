package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

// Packaged notices remain readable offline; large license texts load off the main thread.
@Composable
internal fun ThirdPartyLicensesPage(onClose: () -> Unit) {
    val context = LocalContext.current
    val theme = TyPanelTheme.from(LocalInterfacePalette.current)
    val uri = LocalUriHandler.current
    var selected by remember { mutableStateOf("NOTICE.txt") }
    val files = remember { context.assets.list("licenses")?.filter { it.endsWith(".txt") }?.sorted().orEmpty() }
    val body by produceState("正在读取…", selected) {
        value = withContext(Dispatchers.IO) {
            try { context.assets.open("licenses/$selected").bufferedReader().use { it.readText() } }
            catch (_: Exception) { "无法读取许可证，请返回后重试。" }
        }
    }

    SettingsFullScreenFrame(theme, "开源声明与第三方许可证", "版权归属、开源衍生说明与完整许可证正文", onClose) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(theme.card)
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = "听屿 (Tingyu) · AGPL-3.0 开源衍生说明",
                color = theme.text,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "听屿基于开源项目 Folia (AGPL-3.0) 独立衍生开发，保留原项目及各贡献者原有版权声明与许可证条款。",
                color = theme.muted,
                fontSize = 13.sp,
                lineHeight = 20.sp,
            )
            Row(
                modifier = Modifier.padding(top = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Text(
                    text = "听屿对应源码 ↗",
                    color = theme.accent,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.clickable {
                        uri.openUri("https://github.com/huleixin/folia-rear-lyrics")
                    }.padding(vertical = 4.dp),
                )
                Text(
                    text = "上游项目 Folia ↗",
                    color = theme.accent,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.clickable {
                        uri.openUri("https://github.com/chthollyphile/folia-major")
                    }.padding(vertical = 4.dp),
                )
            }
        }

        Spacer(Modifier.height(14.dp))

        files.forEach { file ->
            val isSelected = file == selected
            Text(
                text = (if (isSelected) "✓ " else "") + file,
                color = if (isSelected) theme.accent else theme.text,
                fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .clickable { selected = file }
                    .padding(horizontal = 8.dp, vertical = 10.dp),
                fontSize = 13.sp,
            )
        }

        Spacer(Modifier.height(14.dp))

        SelectionContainer {
            Text(
                text = body,
                color = theme.text,
                fontSize = 12.sp,
                lineHeight = 19.sp,
                fontFamily = FontFamily.Monospace,
            )
        }
    }
}
