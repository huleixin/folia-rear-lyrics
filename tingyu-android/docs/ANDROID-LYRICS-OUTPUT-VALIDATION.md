# Android 桌面歌词与车载歌词（实验版）

日期：2026-11-13。基础版本：1.5.24 / 239。

## 11:45 用户诊断反馈修复

用户日志反复出现 `desktop-lyrics-start / UnsupportedOperationException`，发生在控制器构造阶段。原实现从未关联显示屏的播放 Service 直接调用 `createWindowContext(type, options)`，违反 Android API 约束；原 Compose 截图测试没有覆盖服务窗口初始化。

修复：通过 DisplayManager 明确取得 DEFAULT_DISPLAY，再 createDisplayContext，最后创建 overlay WindowContext，保证歌词浮在前屏且不依赖 Activity。新增 API 30/31/34 服务上下文回归测试，模拟未关联显示屏调用必定抛出异常，验证修复路径先绑定显示屏。异常诊断增加前八个代码栈位置和异常类型，不记录异常消息中的用户数据。

诊断设备为 Android API 37；本地仍无连接实机，不能将 JVM 测试通过等同于该手机窗口已显示。需用户安装修复包后复验。

## 实现及修改清单

- `lyrics/LyricsProjection.kt`：复用 MinimalPlayerRuntime、原生歌词缓存、现有单调播放锚点。桌面与车载共享按歌词边界唤醒的任务；未新增播放器、歌词解析器或服务。
- `lyrics/DesktopLyricsController.kt`、`DesktopLyricsView.kt`、`OverlayViewOwner.kt`：WindowManager + ComposeView，单/双行、逐字绘制、渐变、拖动、锁定穿透、关闭、持久化、应用内隐藏及锁屏隐藏；退出释放窗口、Composition、ViewModelStore 和监听器。
- `lyrics/LyricsPreferences.kt`：原生持久化及输入边界校验，两项功能默认关闭；导入外观不启用功能、不导入设备身份。
- `lyrics/A2dpLyricsDevices.kt`、`BluetoothLyricsController.kt`、`BluetoothLyricsMetadata.kt`：检查权限、已连接 A2DP 设备与音频输出，限定设备，至少间隔 1500ms 更新标题，待更新任务按歌曲和 epoch 校验。关闭、断连或数据失配恢复完整原始元数据。没有额外媒体会话。
- `FoliaPlaybackService.java`：既有服务持有功能生命周期；既有系统 MediaSession 统一发布元数据，保留原始通知与队列。新增系统会话回读诊断，日志不包含歌词、设备地址或标题。
- `RearNativeTrack.java`、`minimal/MinimalPlayerRuntime.kt`、`MinimalPlayback.kt`、`playback/SleepTimerController.java`、`src/services/compatibleSleepOutput.ts`：兼容通道复用已确认 lease/request 的音频事件，发送位置、Seek、倍速、暂停和缓冲锚点，无新 JS 定时器；过期请求拒绝，失联外推上限 4 秒。
- `MainActivity.java`、Manifest、`lyrics/TingyuLyricsPlugin.kt`：悬浮权限、蓝牙权限、应用可见性与原生设置桥。
- `chrome/LyricsSettingsSheet.kt`、`BluetoothLyricsSettingsSheet.kt`：复用既有原生设置组件及经典、冰川浅色、冰川深色主题。
- `src/services/nativeLyrics.ts`、`useNativeSettingsPage.ts`、`settingsCommands.ts`、三份语言包：设置入口及命令搜索。
- `AppearanceSettingsSubview.tsx`、`ImportConfirmDialog.tsx`、`appearanceCodec.ts`、`appearanceImportPlan.ts`：桌面歌词样式的视觉配置导入导出。

## 已执行验证

- TypeScript 类型检查通过。
- Vitest 四个定向文件：101 项通过，包含兼容通道、外观导入、命令契约及 Android 页面归属检查。命令快照仅新增两项设置入口。
- Android `testDebugUnitTest`：1339 项，失败 0。包含既有播放、歌词、睡眠计时及本次投影/资源生命周期回归。
- 新测试验证切歌/同曲新 epoch、暂停/缓冲/Seek/倍速、缺失歌词、兼容时钟上限及旧 request 拒绝；元数据完整复制、原始值不变；悬浮 ViewTree owner 释放。
- Robolectric 原生 Compose 截图：桌面/蓝牙三套主题、滚动及大字体，已检查。图片位于本地 `android/app/build/screenshots/lyrics/`。这是 JVM 渲染证据。
- 自动化元数据测试不等于系统会话 IPC 或 AVRCP 测试。曾尝试 MediaController 回读测试，Robolectric 返回 null，因此改为测试真实 MediaMetadata 对象；没有将模拟器限制计为实机成功。

## 尚待真实设备验收

`adb devices` 无连接设备；无真实车机。本次没有声称手机悬浮窗或车机显示已实测通过。

必须在 Android 12–16 手机验证：授权/拒绝/撤销、实际悬浮触摸穿透、横竖屏和异形屏、锁屏、厂商后台限制、进程回收、后台播放与频繁切歌、两种播放通道、通知和本地音乐回归、耗电。

必须使用 A2DP 设备验证：连接/断开/输出路由切换、暂停、限频更新及恢复、通知按钮/锁屏/车机控制。读取会话诊断的 readbackMatches 只能证明 Android 侧会话，不代表车机显示成功。车机不刷新标题属于兼容限制，不无限重试。

兼容播放在 WebView 完全冻结且事件停止时，歌词最多外推 4 秒后冻结，等待新锚点；不会靠独立计时器虚构播放进度。长歌词当前单行省略显示，逐字扫色主要面向从左到右文本，RTL 逐字方向仍待完善与验证。

## 使用

原生设置 → 桌面与车载歌词 → 桌面歌词：授权悬浮窗后启用。默认进入 App 隐藏；锁定后可从设置解除锁定。启用时须有播放服务。

车载蓝牙歌词默认关闭。停车后授权蓝牙、选择连接设备、输出音乐并开启实验模式；测试入口提交当前行后约 3 秒恢复。用户须在车机上确认是否显示；部分锁屏界面也会显示替换后的标题。
