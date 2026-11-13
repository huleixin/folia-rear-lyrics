# Pad 输入、系统 AOD 与歌词设置 1.5.35

基线 9e37adb2（1.5.34）；分支 feat/tablet-adaptive；versionCode 250；未合并 main。

## 本次修改

- Pad 极简播放器：大封面容器在左侧播放区内水平居中，不移动整页、不改手机对齐。封面拖动、切歌与展开动画继续使用同一 artwork anchor。1280dp 截图和真实 Compose 布局断言验证封面中心落在左侧分栏中心。
- Pad 输入法：原先 IME 可见性规则同时隐藏 mini 与 nav。现在宽度至少 840dp 时保留垂直 nav；手机底栏和底部 mini 仍隐藏。目标可见性、透明度、禁用态和动作入口共用同一规则，沿用原窗口尺寸与键盘补偿，不因 IME 重建播放器。
- 搜索等待：歌曲首屏与分页、歌手/专辑/歌单分类增加 15 秒预算；联想增加 5 秒预算，支持的音源收到 AbortSignal。取消联想会清理超时。保留 requestId/generation 校验，超时不缓存为成功，迟到响应不能覆盖后续结果；分类独立失败。原有可见错误与重试继续使用。不接触登录凭据或绕过 Omni。
- 桌面歌词、车载歌词、请作者喝杯咖啡、加入交流群四页：复用现有设置背景、顶栏与控件，改成全屏页面和返回按钮，保留系统栏安全区、滚动、原有动作与配置。桌面/车载继续使用现有 ComponentDialog 生命周期；内容铺满窗口并去除半屏遮罩。支持页屏蔽空白点击穿透，点击空白不再关闭。
- 车载歌词：五种元数据投影（标题；标题+原歌名/歌手；标题当前句+歌手栏下一句；歌手栏；专辑栏），三种内容（原文、翻译优先、原文+翻译）。间隔下限 1.5 秒，可选 2/3/5 秒；每栏上限可选 32/64/120/180，避免拆开 UTF-16 代理对。无翻译回退原文。原始 metadata 不变；关闭、断连、失配、无歌词或切歌沿用既有恢复；单一现有媒体会话，无第二播放核心。显示策略持久化到原生功能配置并接入命令面板及三种语言，不混入桌面视觉样式导出。已保存但断连的设备显示友好名称，不展示原始设备哈希。

## 系统 AOD 诊断与修复范围

215017 诊断来自 1.5.29、SDK37，系统原生卡片方案，非 Shizuku。当前歌曲有 38 行歌词，发送、内容准备和绘制栅栏均有记录；这只能证明应用侧交付，不证明背屏物理可见。隐藏状态同时出现 aodCommand=true、rear power=ON、主屏 ON 且未锁、follow AOD disabled，原因为 aod-disabled。进入 AOD 命令未见相应退出。另有真实 doze 状态，不能一律当作失效命令。

新增 RearAodCommandGate：仅在命令超过 1500ms，背屏确实 ON、主屏交互且未锁、当前媒体会话/中心卡/归属及附着可见均验证通过时，清理失效 enterAod 命令。重复 enter 不延长命令有效期；显式 exit 立即生效。主屏 DisplayListener 和一次性截止检查触发重核，恢复 NORMAL 时重新同步当前歌词与绘制状态，退出释放回调。

真实 DOZE、锁屏、非当前卡仍遵守原策略；未开启“跟随系统 AOD”时不强制点亮、不越过用户开关。原始用户日志未放入公开源码或证据包。

## 自动化与构建

- 前端定向回归：554 项、60 文件通过；包括页面归属、设置、命令注册/三语言、搜索及原生搜索适配。
- 类型检查与主题生成校验通过；Capacitor 网页重建与同步通过。
- 原生全量 1377 项通过，零失败、零跳过。Release 构建及签名结果见交付证据 summary.json 与日志。
- 原生截图覆盖四个全屏页 × 经典浅色/冰川浅色/冰川深色，以及 Pad 播放器。验证返回触摸、全屏边界、滚动、原设置入口与底层防穿透。
- JVM 软件 Canvas 无法创建 Haze 的 RenderScript Surface；全屏设置视觉/滚动测试使用 SDK30 的既有非模糊降级路径。桌面悬浮歌词其他用例继续 SDK34。此结果不代表真实设备 GPU 模糊效果已验收。

## 未验证及限制

没有连接真实平板、OEM 背屏或车机。搜索“概率性卡住”没有新的可复现日志，已修复可确认的无限等待路径，不能宣称所有卡顿/厂商输入法问题均已复现并消除。请在真实 Pad 上验证反复打开搜索、中文组合输入、键盘收起/旋转/分屏、封面拖动和返回。

系统 AOD 仍需相同系统版本实机验证进入/退出、主屏解锁、背屏唤醒以及跟随开关两种状态，不能把 JVM 策略测试等同 OEM 物理显示成功。

车载测试只验证 Android 元数据构造、原始信息保留、歌曲/代次隔离和设置迁移；无实车 A2DP/AVRCP 端到端测试，未宣称车机已显示歌词。通知与锁屏可能同时显示所选字段；用户需停车后逐项测试。不通过无限刷新、系统协议栈修改或第二媒体会话强制兼容。

## 媒体字段依据

[Android MediaMetadata](https://developer.android.com/reference/android/media/MediaMetadata) 提供 title、artist、album 等媒体字段；[AOSP AVRCP Target](https://android.googlesource.com/platform/packages/modules/Bluetooth/+/c55eb6ca1009267198d679835ecbcbdcc4d11621/android/app/src/com/android/bluetooth/avrcp/AvrcpTargetService.java) 按这些字段向远端返回媒体属性；[AVRCP 1.6.3](https://files.bluetooth.com/wp-content/uploads/dlm_uploads/2024/10/AVRCP_v1.6.3.pdf) 不提供通用同步歌词属性。本实现扩展媒体字段的投影方式，不新增蓝牙协议。

## 建议合并步骤

先在 feat/tablet-adaptive 安装本预览包，完成 Pad/手机/车机和 OEM AOD 实测；确认后审阅与主分支差异，按仓库流程合并。此次不自动合并 main。

## 实际修改文件

- `android/app/src/main/java/io/github/huleixin/tingyu/RearAodCommandGate.java`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/SettingsFullScreenFrame.kt`
- `android/app/src/test/java/io/github/huleixin/tingyu/RearAodCommandGateTest.java`
- `android/app/src/test/java/io/github/huleixin/tingyu/chrome/LyricsFullScreenSettingsTest.kt`
- `src/services/search/searchRequestBudget.ts`
- `test/unit/search/searchRequestBudget.test.ts`
- `android/app/src/main/java/io/github/huleixin/tingyu/RearHostView.java`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/BluetoothLyricsSettingsSheet.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/ComposeChromeHost.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/LyricsSettingsSheet.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeFooterLayout.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/SupportSheets.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/lyrics/BluetoothLyricsController.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/lyrics/BluetoothLyricsMetadata.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/lyrics/LyricsPreferences.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/lyrics/TingyuLyricsPlugin.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/MinimalCoverPage.kt`
- `android/app/src/test/java/io/github/huleixin/tingyu/chrome/NativeFooterLayoutTest.kt`
- `android/app/src/test/java/io/github/huleixin/tingyu/chrome/PadPagesTest.kt`
- `android/app/src/test/java/io/github/huleixin/tingyu/chrome/SupportSheetLayerTest.kt`
- `android/app/src/test/java/io/github/huleixin/tingyu/lyrics/BluetoothLyricsMetadataTest.kt`
- `android/app/src/test/java/io/github/huleixin/tingyu/lyrics/DesktopLyricsRenderTest.kt`
- `docs/PAD-AOD-LYRICS-1.5.35.md`
- `package-lock.json`
- `package.json`
- `src/components/app/search/useSearchSuggestions.ts`
- `src/components/command-palette/commands/settingsCommands.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/in.ts`
- `src/i18n/locales/zh-CN.ts`
- `src/services/onlineMusic/omni.ts`
- `src/stores/useSearchExploreStore.ts`
- `src/stores/useSearchNavigationStore.ts`
- `test/unit/command-palette/__snapshots__/commandRegistryContract.test.ts.snap`
