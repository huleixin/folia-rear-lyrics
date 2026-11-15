package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

// Packaged notices remain readable offline; large license texts load off the main thread.
@Composable internal fun ThirdPartyLicensesPage(onClose: () -> Unit) {
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
    SettingsFullScreenFrame(theme, "第三方开源许可证", "版权、来源、修改说明与对应源码", onClose) {
        Text("听屿对应源码", color = theme.accent, fontSize = 15.sp,
            modifier = Modifier.fillMaxWidth().clickable {
                uri.openUri("https://github.com/huleixin/folia-rear-lyrics")
            }.padding(vertical = 14.dp))
        files.forEach { file ->
            Text((if (file == selected) "✓ " else "") + file, color = if (file == selected) theme.accent else theme.text,
                modifier = Modifier.fillMaxWidth().clickable { selected = file }.padding(vertical = 12.dp), fontSize = 13.sp)
        }
        Spacer(Modifier.height(18.dp))
        SelectionContainer { Text(body, color = theme.text, fontSize = 12.sp, lineHeight = 19.sp, fontFamily = FontFamily.Monospace) }
    }
}
