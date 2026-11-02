# 听屿 Android 1.3.92：背屏设置控制中心

日期：2026-11-02。基线：`origin/main` 的 `7e0716d`（1.3.91 / versionCode 114）。开始和发布前均核对远端；前轮 Media3 原生优先、Blob 缓存桥、双通道定时关闭已在主分支，完整保留。本版版本 1.3.92 / versionCode 115。

## 改版前后

| 位置 | 旧实现 | 本版 |
| --- | --- | --- |
| 设置首页 | 装饰图、重复标题、长说明、适配/状态、模式、引擎、锁屏路线和教程集中在大卡 | 单个最小高度 68dp 的入口；背屏歌词 + 模式与一行真实状态 + 箭头，无快捷启停与导航点击冲突 |
| 背屏控制 | 首页内展开混合内容 | 独立原生控制中心，主启停、双选模式、连接与运行事实、刷新、说明/高级/诊断入口 |
| LSP | 与 Shizuku 技术选项混排 | 模块连接、歌词开关、实际背屏显示分别呈现；模块配置教程优先 |
| Shizuku | 授权与显示容易混淆 | 服务、授权、歌词开关、实际显示分别呈现；授权/故障帮助优先 |
| 高级 | 占用首页，LSP 下仍显示禁用的锁屏路线 | Plan A / Legacy、可用的遮盖息屏、只在 Shizuku 出现的 Auto / Reuse / Migrate、当前配置 |
| 诊断 | 教程内展开 | 保留原路径，同时控制中心提供直接入口；完整报告仍异步生成、脱敏并调用既有导出服务 |

## 实际实现与保留的能力

Android 的设置首页原本即由 `NativeSettingsPage.kt` 渲染，并非纯 React。新控制中心通过 `NativePageView.kt` 分派至真正的 `NativeRearControlPage.kt`，使用 Compose `LazyColumn`、原生 Switch、原生点击区域和既有 `PageAction`。Web 备用界面使用同一 `buildRearControlPage` 模型及 `rearControlActions`，不另立后端状态。

| 功能 | LSP | Shizuku | 原有约束 |
| --- | --- | --- | --- |
| 开启、关闭、状态刷新 | 保留 | 保留 | 启动以原生 verified 结果及后续状态为准；失败不提前显示成功 |
| 连接事实 | 模块是否连接 | 服务是否启动、听屿是否授权 | 均不等同于窗口已活跃 |
| 显示事实 | active / starting / sleeping / returnedToSystem / camera yield | 同左 | 没有实时状态时显示检测中；查询失败明确提示 |
| 后端切换 | 双选 | 双选 | enabled / active / starting / sleeping / 操作中禁止切换，提示先停止；原生安全校验保留 |
| 控制引擎 | Plan A / Legacy | Plan A / Legacy | 原有持久化、默认值和 Legacy 回滚不变；运行时禁止切换 |
| 锁屏启动路线 | 不显示 | Auto / Reuse / Migrate | 完全复用原 setter；说明仍有系统限制，不宣称解决锁屏限制 |
| 遮盖息屏偏好 | 按设备真实能力 | 按设备真实能力 | 复用 sensorAvailable / sleepUnsupported；无能力时不可新开，已有偏好仍可关 |
| 教程 | 安装、系统框架作用域、重启、版本/模块更新、启用 | 服务启动、授权、实际显示确认、故障帮助 | 原有同步、恢复、兼容与 LyricInfo 说明保留 |
| 完整诊断导出 | 保留 | 保留 | buildDiagnosticReport → redactDiagnosticReport → exportDiagnosticReport，三个模块仍点击时异步加载 |

未新增控制系统所有权、恢复算法等不存在的开关。未修改 LSP Hook/Binder、Shizuku 启动/锁屏/相机策略、Media3/兼容播放、缓存、定时关闭、歌词时钟、舞台、首页/资料库/搜索、全局 Liquid Glass、四个底栏图标或页面动画。

## 代码确认的问题及修复

1. **首页过长与重复内容**：React 与 Compose 均存在完整大卡。两端都改为入口，内容转移至控制中心及高级页，没有隐藏原有功能。
2. **设置状态去重遗漏配置**：`rearSettingsFingerprint` 未覆盖 lockedRoute、coverSleepEnabled、传感器/息屏能力等，保存后可能仍呈现旧状态。补齐可见事实，仍排除诊断时间戳。
3. **配置写入与旧状态查询竞态**：沿用既有请求 revision，写入后的 refresh 使此前读请求失效，等待唯一在途查询后再读取；不新增轮询。新增延迟旧响应测试。
4. **点击互斥**：新的页面控制器在 toggle 与配置写入间共享即时锁；不能同一帧先启用再切后端。后端/引擎二次原生校验保持不变。
5. **原生页面交接**：`settings:rear:control` / `settings:rear:advanced` 使用独立 key，原生 target 必须精确匹配；旧首页和旧子页不能作为新页面已就绪。保留既有 session/generation/revision 和页面保留体系。
6. **可读性证据**：浏览器截图与计算颜色取样发现新选中小字在浅绿叠底上最低约 4.05:1，局部改用既有深墨绿 Ink，Compose 同步。调整后控制/高级页可见且启用的主要文字、说明与选项取样最低为 **5.98:1**；深色最低 **6.37:1**。这是 Web 证据，未冒充 Android Canvas 结果。
7. **大字体**：新 Compose 控制页局部遵循系统 fontScale；Web 新页面文字用 rem，并提高局部选择器优先级，避免旧固定字号覆盖。技术选项短标签保留完整说明，窄屏可换行、纵向滚动。

## 路由、生命周期与性能边界

- 设置首页 → 控制中心 → 高级/说明/诊断；后三者返回控制中心，控制中心返回设置首页。关闭、Escape 及既有 Android 返回链路沿用原机制。
- NativePage 的 shell target、模型 key、操作映射同步更新；诊断/说明继续走既有 NativeSettingsDocument 采集/原生绘制链路，不重建 WebView/宿主。
- 同一次首页/控制/高级/教程访问只用一个 `useRearLyricsSettings`，沿用原 3 秒状态查询；页面隐藏时跳过，卸载时移除。新增诊断只在用户打开时额外读取一次。
- 没有新的高频监听、后台计时器、GPU 模糊层、服务启停副作用。页面挂载、切主题和返回不调用启停/切后端；由自动化测试检查。
- 持久化偏好仍归原生；Activity 重建后通过原查询获取。真实系统返回手势、状态栏、安全区域及重建交接仍需真机复核。

## 主要文件与提交

- UI：`rearControlModel.ts`、`RearControlView.tsx`、`RearLyricsEntry.tsx`、`rearControl.css`、`NativeRearControlPage.kt`、本地化。
- 接线：`MobileSettingsLanding.tsx`、`useNativeSettingsPage.ts`、`rearControlActions.ts`、`useRearSettingsController.ts`、`useRearLyricsSettings.ts`、`rearLyricsSettingsModel.ts`、`useSettingsModalStore.ts`、`nativeShellRouting.ts`、`NativePageView.kt`、`NativeSettingsPage.kt`、`NativePageRetention.kt`。
- 说明/备用：`RearLyricsGuide.tsx`、`RearBridgeSettings.tsx`、`AndroidRearLyricsSetting.tsx`、`MobileSettingsNavigation.tsx`、`SettingsModal.tsx`、设置命令入口。
- 原生状态接口仅补充已有 cameraSuspended / yieldingToCamera 的 TypeScript 类型，没有修改查询或后端控制实现。
- 独立提交：`a56dc80` UI；`9aab7a0` 路由/状态；`52aa004` 测试与验证夹具。后续提交仅发布与验收记录。

## 测试与证据

| 检查 | 结果 | 能证明与不能证明的范围 |
| --- | --- | --- |
| TypeScript | 通过 | 正式源码与测试类型 |
| 设置、命令注册契约、rearLyricsControl | 19 文件、204 测试通过 | 入口、事实分离、禁用条件、互斥、旧请求丢弃、保存回读、导出/脱敏调用链、路由返回、本地化 |
| 原生页面会话、shell、主题、背屏状态/时钟回归 | 9 文件、45 测试通过 | JS 模拟事件与会话保护；不能等同于锁屏真机结果 |
| Playwright | 6 场景通过；额外 2 个大字体顶部可见回归通过 | 393 宽 LSP/Shizuku × 深/浅，320/360 宽 150% 字体，真实 Web 组件和控制器、仅 native 边界模拟 |
| 颜色检查 | 8 组取样均 ≥ 4.5:1 | 实际 Web 截图背景像素 + getComputedStyle + 父级 opacity 合成；不是整屏逐像素审计或真机测量 |
| Android JVM | 125 测试类、859 测试、0 失败 | 最终源码运行；包括原生页面保留、既有播放与背屏单测 |
| Android 仪器测试 | `assembleDebugAndroidTest` 通过 | 新增真实 Compose 渲染测试已编译，**未在设备执行** |
| Release | 正式资源构建、Capacitor 校验、assembleRelease 通过 | v1.3.92 / code115 原签名 APK；无真机安装/运行结论 |

浏览器插件在当前会话不可用，依 skill 采用项目现有 Playwright gallery。截图是实际 Web 渲染，清楚标注 web。新增 debug-only 原生预览 Activity 与仪器测试不进入 Release，测试可生成原生截图，不会连接/启动真实背屏后端。

额外扩大到全部 command-palette 测试时：438 通过，3 失败，涉及旧 playback-equalizer 的桌面面板可用性假设。本次未修改该命令或音频功能，不以改播放逻辑迁就这些断言。相关命令注册契约已通过。本次另外修复测试分类：三个既有 Android-only 卡片不适用桌面 SettingsAnchor 要求，仍保留所有桌面 anchor 唯一性与映射检查；补齐既有 settings-resource-cache 命令的三种语言标签。

### 交付截图（Web 预览，非真机）

Release 附件提供四张控制页、四张高级页及两张小屏大字体 PNG，以及 `contrast-report.json`。以下四张为主要预览：

| LSP 深色 | LSP 浅色 |
| --- | --- |
| ![LSP dark Web](https://github.com/huleixin/folia-rear-lyrics/releases/download/tingyu-layout-1.3.92/rear-lsp-dark-web.png) | ![LSP light Web](https://github.com/huleixin/folia-rear-lyrics/releases/download/tingyu-layout-1.3.92/rear-lsp-light-web.png) |

| Shizuku 深色 | Shizuku 浅色 |
| --- | --- |
| ![Shizuku dark Web](https://github.com/huleixin/folia-rear-lyrics/releases/download/tingyu-layout-1.3.92/rear-shizuku-dark-web.png) | ![Shizuku light Web](https://github.com/huleixin/folia-rear-lyrics/releases/download/tingyu-layout-1.3.92/rear-shizuku-light-web.png) |

### 真机待验证

当前没有可用 Android 设备或模拟器，因此未执行覆盖安装、真实 Compose 截图、实际 LSPosed/Shizuku 启停/授权、锁屏恢复、系统返回手势、状态栏沉浸、后台恢复和 Activity 重建的设备验证。不宣称这些项目已通过。

设备验收：先备份必要数据并直接覆盖安装，不卸载；核对首页入口、一行省略、控制中心模式/事实；分别测试 LSP/ Shizuku 未就绪、授权及实际活跃；运行时模式/引擎不能切；停止后保存高级偏好、退出重进/重启后核对；导出完整诊断；深浅色和大字体；连续返回/前后台/旋转重建；播放中访问设置检查播放、舞台/背屏时钟和定时关闭。

设备连接后的渲染回归：`cd android && gradlew connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=io.github.huleixin.tingyu.chrome.RearSettingsDeviceTest`。该夹具只验呈现/事件映射，不代替真实后端测试；原生 PNG 写入 debug 应用 externalCacheDir。

## APK、签名与回滚

- 包名保持 `io.github.huleixin.tingyu`，版本从 code114 增至 code115，不引入数据迁移、清缓存或账号/队列重置。
- `apksigner verify --print-certs` 成功；证书 SHA-256 与原发布包一致：`a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d`。
- APK SHA-256：`f5a43566cbb89f6e51ae00b818d6c06f509c189cef8c1e760de5c43234ddf209`。
- 发布：[tingyu-layout-1.3.92](https://github.com/huleixin/folia-rear-lyrics/releases/tag/tingyu-layout-1.3.92)；APK：[Tingyu-Android-1.3.92.apk](https://github.com/huleixin/folia-rear-lyrics/releases/download/tingyu-layout-1.3.92/Tingyu-Android-1.3.92.apk)。相同包名/证书及递增 code 满足 Android 覆盖安装条件，数据保留仍待设备实际验证。
- 源码回滚：以 `7e0716d` 为改版前参照；按发布、测试、接线、UI 的逆序 revert 本次提交，重新发布更高 versionCode。不要在用户设备卸载/清数据，也不要要求普通 Android 强制降级 code114；正常签名升级包才是保留数据的回滚方式。
