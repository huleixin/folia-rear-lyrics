package io.github.huleixin.tingyu.chrome

import android.app.Activity
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalConfiguration
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import io.github.huleixin.tingyu.lyrics.*

// Same native settings primitives. Vehicle compatibility is opt-in and always described as unverified.
@Composable internal fun BluetoothLyricsSettingsSheet(activity: Activity, requestPermission: () -> Unit, onClose: () -> Unit) {
    val prefs = remember { LyricsPreferences.get(activity) }
    val settings by prefs.state.collectAsState()
    val monitor = remember { A2dpLyricsDevices(activity) }
    DisposableEffect(monitor) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) monitor.refresh() }
        (activity as? androidx.lifecycle.LifecycleOwner)?.lifecycle?.addObserver(observer)
        onDispose { (activity as? androidx.lifecycle.LifecycleOwner)?.lifecycle?.removeObserver(observer); monitor.close() }
    }
    val devices by monitor.state.collectAsState()
    val status by BluetoothLyricsController.status.collectAsState()
    val zh = LocalConfiguration.current.locales[0].language == "zh"
    fun text(cn: String, en: String) = if (zh) cn else en
    var testStatus by remember { mutableStateOf("") }
    val theme = settingsFlowTheme()
    SettingsFullScreenFrame(theme, text("车载蓝牙歌词", "Bluetooth lyrics"), text("实验功能 · 默认关闭", "Experimental · off by default"), onClose) {
        SettingsGroup(theme, text("兼容性说明", "Compatibility")) {
            SettingsItem(theme, text("仅兼容部分车机", "Some vehicles only"), text(
                "AVRCP 没有通用歌词字段。开启后尝试用当前歌词替换系统媒体标题，锁屏也可能显示歌词；通知按钮和音频不变。请停车后测试。",
                "AVRCP has no universal lyric field. This mode uses the system media title, so the lock screen may also show lyrics. Test while parked."))
            SettingsItem(theme, text("真实信息恢复", "Original metadata"), text("关闭、断开或切歌时恢复原始标题；车机不刷新属于设备兼容限制。", "Off, disconnect and track changes restore the original title. A vehicle may ignore updates."))
        }
        SettingsGroup(theme,text("显示与兼容策略","Display and compatibility")){
            SettingsSelect(theme,text("歌词显示位置","Lyric placement"),value=settings.btMode,options=listOf(
                TySettingOption("title",text("标题显示当前歌词","Current line in title")),
                TySettingOption("title_song",text("标题歌词＋歌曲信息","Lyric title + song info")),
                TySettingOption("two_lines",text("标题当前句＋歌手栏下一句","Current + next line")),
                TySettingOption("artist",text("歌手栏显示歌词（保留歌名）","Lyric artist; retain title")),
                TySettingOption("album",text("专辑栏显示歌词（保留歌名）","Lyric album; retain title")))){value->prefs.update{it.copy(btMode=value)}}
            SettingsSelect(theme,text("歌词内容","Lyric content"),value=settings.btContent,options=listOf(
                TySettingOption("original",text("原文","Original")),TySettingOption("translation",text("优先翻译，无翻译显示原文","Translation, original fallback")),TySettingOption("paired",text("原文＋翻译","Original + translation")))){value->prefs.update{it.copy(btContent=value)}}
            SettingsSelect(theme,text("最短刷新间隔","Minimum refresh interval"),value=settings.btIntervalMs.toString(),options=listOf(1500,2000,3000,5000).map{TySettingOption(it.toString(),"${it/1000f} s")}){value->prefs.update{it.copy(btIntervalMs=value.toIntOrNull()?:1500)}}
            SettingsSelect(theme,text("每栏文字上限","Text limit per field"),value=settings.btMaxChars.toString(),options=listOf(32,64,120,180).map{TySettingOption(it.toString(),it.toString())}){value->prefs.update{it.copy(btMaxChars=value.toIntOrNull()?:180)}}
            SettingsItem(theme,text("按车机逐项测试","Test on each vehicle"),text("部分车机只读取标题，部分还读取歌手或专辑。长句被车机截断时可改为短文本；不刷新时可尝试较慢间隔，不会循环强刷。通知栏、锁屏也可能同步显示所选字段。","Vehicles expose different fields. Try shorter text or a slower interval. Notification and lock-screen metadata can also change; no forced refresh loop."))
        }
        SettingsGroup(theme, text("设备与开关", "Device and switch")) {
            SettingsSwitch(theme, text("启用实验性车载歌词", "Enable experimental lyrics"), checked = settings.bluetooth,
                hint = text("先授权并选择已连接的 A2DP 设备", "Grant access and choose a connected A2DP device")) { enabled ->
                if (enabled && !A2dpLyricsDevices.hasPermission(activity)) requestPermission()
                else prefs.update { it.copy(bluetooth = enabled) }
            }
            if (!A2dpLyricsDevices.hasPermission(activity)) SettingsAction(theme, text("授予蓝牙连接权限", "Grant Bluetooth access"), onClick = requestPermission)
            val rememberedDevice=if(settings.device.isNotBlank()&&devices.devices.none{it.id==settings.device})listOf(TySettingOption(settings.device,text("上次选择的设备（未连接）","Last selected device (disconnected)")))else emptyList()
            val options = listOf(TySettingOption("", text("请选择设备", "Choose a device"))) + rememberedDevice + devices.devices.map { TySettingOption(it.id, it.name + text(" · 待测试", " · unverified")) }
            SettingsSelect(theme, text("A2DP 设备", "A2DP device"), value = settings.device, options = options) { value -> prefs.update { it.copy(device = value) } }
            SettingsAction(theme, text("刷新已连接设备", "Refresh connected devices"), onClick = { monitor.refresh() })
            val current = if (!settings.bluetooth) "disabled" else if (devices.status != "connected") devices.status else status
            SettingsItem(theme, text("当前状态", "Status"), when (current) {
                "disabled" -> text("已关闭", "Off")
                "permission-required" -> text("需要蓝牙连接权限", "Bluetooth access required")
                "bluetooth-off" -> text("系统蓝牙已关闭", "Bluetooth is off")
                "disconnected", "device-disconnected" -> text("所选设备未连接", "Selected device disconnected")
                "select-device" -> text("请选择设备", "Choose a device")
                "waiting-for-route" -> text("等待音频输出到所选设备", "Waiting for audio on selected device")
                "metadata-updated" -> text("Android 媒体信息已更新，车机端待确认", "Android metadata updated; vehicle unverified")
                "test-complete" -> text("测试结束，真实标题已恢复", "Test ended; original title restored")
                "metadata-error" -> text("媒体更新失败，请导出诊断日志", "Metadata failed; export diagnostics")
                "unavailable" -> text("当前设备无法读取 A2DP 状态", "A2DP state unavailable")
                else -> text("等待播放服务或有效歌词", "Waiting for playback or lyrics")
            })
            SettingsAction(theme, text("测试当前歌词（3 秒）", "Test current line (3 seconds)"), onClick = {
                testStatus = if (LyricsFeatureHost.testBluetooth()) text("已提交 Android 媒体标题，请观察车机；3 秒后恢复。", "Android title submitted. Check the vehicle; restores after 3 seconds.")
                else text("暂不可测试：请开启功能、选择设备并播放有歌词的歌曲；频繁点击需稍候。", "Enable, select a device and play lyrics first. Wait before repeated tests.")
            })
            if (testStatus.isNotEmpty()) SettingsItem(theme, text("测试结果", "Test result"), testStatus)
        }
    }
}
