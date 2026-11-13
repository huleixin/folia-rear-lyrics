package io.github.huleixin.tingyu.chrome

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalConfiguration
import io.github.huleixin.tingyu.lyrics.*

// Existing settings controls and sheet frame, including all classic/glacier palette tokens.
@Composable
internal fun LyricsSettingsSheet(activity: Activity, mode: String = "desktop", requestBluetooth: () -> Unit = {}, onClose: () -> Unit) {
    if (mode == "bluetooth") { BluetoothLyricsSettingsSheet(activity, requestBluetooth, onClose); return }
    val preferences = remember { LyricsPreferences.get(activity) }
    val settings by preferences.state.collectAsState()
    val status by DesktopLyricsController.status.collectAsState()
    val zh = LocalConfiguration.current.locales[0].language == "zh"
    fun text(cn: String, en: String) = if (zh) cn else en
    val theme = settingsFlowTheme()
    fun style(change: (DesktopLyricsStyle) -> DesktopLyricsStyle) { preferences.update { it.copy(style = change(it.style)) } }
    TySheetFrame(theme, text("桌面歌词", "Desktop lyrics"), text("复用当前播放时间轴；后台同步，锁屏隐藏。", "Uses the current playback timeline; hides on the lock screen."), .92f, onClose) {
        SettingsGroup(theme, text("显示与权限", "Display and permission")) {
            SettingsSwitch(theme, text("启用桌面歌词", "Enable desktop lyrics"),
                hint = if (Settings.canDrawOverlays(activity)) text("权限已授予", "Permission granted") else text("请授权后再开启", "Grant overlay permission, then enable"), checked = settings.desktop) { enabled ->
                if (enabled && !Settings.canDrawOverlays(activity)) {
                    val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${activity.packageName}"))
                    runCatching { activity.startActivity(intent) }.onFailure { activity.startActivity(Intent(Settings.ACTION_SETTINGS)) }
                } else preferences.update { it.copy(desktop = enabled) }
            }
            SettingsItem(theme, text("当前状态", "Status"), when (status) {
                "visible" -> text("正在显示", "Visible")
                "hidden-in-app" -> text("在听屿内自动隐藏", "Hidden inside Tingyu")
                "permission-required" -> text("需要悬浮窗权限", "Overlay permission required")
                "screen-locked" -> text("锁屏或屏幕关闭", "Screen locked or off")
                "window-error" -> text("悬浮窗加载失败，请查看诊断日志", "Window failed; check diagnostics")
                else -> text("关闭或等待播放服务", "Off or waiting for playback")
            })
            SettingsSwitch(theme, text("在 App 内隐藏", "Hide inside app"), checked = settings.hideInApp) { value -> preferences.update { it.copy(hideInApp = value) } }
            SettingsSwitch(theme, text("锁定并点击穿透", "Lock and pass touches through"),
                text("锁定后从此处解锁；系统可能限制穿透时的透明度。", "Unlock here; Android limits opacity when passing touches through."), settings.locked) { value -> preferences.update { it.copy(locked = value) } }
            SettingsAction(theme, text("重置悬浮窗位置", "Reset position"), onClick = { preferences.update { it.copy(x = .5f, y = .25f) } })
        }
        SettingsGroup(theme, text("歌词样式", "Lyric style")) {
            SettingsSwitch(theme, text("双行模式", "Two lines"), checked = settings.style.doubleLine) { value -> style { it.copy(doubleLine = value) } }
            if (settings.style.doubleLine) SettingsSwitch(theme, text("左右分离", "Alternating left and right"), checked = settings.style.splitLines) { value -> style { it.copy(splitLines = value) } }
            SettingsSwitch(theme, text("逐字平滑高亮", "Smooth word highlight"), checked = settings.style.wordHighlight) { value -> style { it.copy(wordHighlight = value) } }
            SettingsSelect(theme, text("字体", "Font"), value = settings.style.font, options = listOf(
                TySettingOption("sans", text("无衬线", "Sans")), TySettingOption("serif", text("衬线", "Serif")), TySettingOption("mono", text("等宽", "Mono")))) { value -> style { it.copy(font = value) } }
            SettingsSlider(theme, text("字号", "Font size"), value = settings.style.fontSize, min = 14f, max = 40f, step = 1f, onCommit = { value -> style { it.copy(fontSize = value) } })
            SettingsSlider(theme, text("不透明度", "Opacity"), value = settings.style.opacity, min = .2f, max = 1f, step = .05f, onCommit = { value -> style { it.copy(opacity = value) } })
            SettingsSlider(theme, text("描边", "Outline"), value = settings.style.outline, min = 0f, max = 5f, step = .5f, onCommit = { value -> style { it.copy(outline = value) } })
            val colors = listOf("#FFFFFF" to text("白色", "White"), "#8FE6C3" to text("薄荷绿", "Mint"), "#FFD778" to text("暖金", "Gold"),
                "#87CEFA" to text("冰蓝", "Ice blue"), "#F6A8D4" to text("浅粉", "Pink"), "#111111" to text("墨黑", "Ink")).map { TySettingOption(it.first, it.second) }
            SettingsSelect(theme, text("文字颜色", "Text color"), value = settings.style.color, options = colors) { value -> style { it.copy(color = value) } }
            SettingsSelect(theme, text("高亮颜色", "Highlight color"), value = settings.style.highlight, options = colors) { value -> style { it.copy(highlight = value) } }
        }
    }
}
