# Android 页面渲染归属表（唯一事实源）

> 本文件是 Android 页面「正式 UI 实现」的唯一权威清单。
> 审计过程见 `docs/ANDROID-PAGE-OWNERSHIP-AUDIT-1.3.165.md`；本文是执行约束，不是历史记录。
> 修改页面视觉前必须先读这里；新增 WebView 页面必须走 §4 的白名单流程。

基线：1.3.165 / versionCode 188

---

## 1. 一条总则

**Android 正式包里，一个页面只有一套正式 UI。**
React 负责数据、路由、业务动作与原生桥接；Compose 负责绘制。
旧 React DOM UI 在 Android 上**不得重新出现**，也不得作为"接管失败时的兜底"使用。

## 2. 页面 → 正式实现

| 页面 | Android 正式 UI | 适配器 / 数据源 | 允许改视觉的目录 |
|---|---|---|---|
| 推荐 / 资料库 | `chrome/NativeHomePage.kt` / `chrome/NativeDirectoryPage.kt` | `library/suites/mobile/native/NativeHomePage.tsx`、`NativeHomeOverview.tsx`、`NativeDirectoryPage.tsx`、`NativeLocalLibrary.tsx` | `chrome/NativeHomePage.kt`、`chrome/NativePageWidgets.kt` |
| 歌单 | `chrome/NativePlaylistPage.kt` | `native/useNativeCollectionPage.ts` | `chrome/NativePlaylistPage.kt`、`chrome/NativePageWidgets.kt` |
| 专辑 | `chrome/NativeDirectoryPage.kt`（intro 分支） | `native/useNativeCollectionPage.ts` | 同上 |
| 歌手 | `chrome/NativeDirectoryPage.kt`（artist 分支） | `native/useNativeArtistPage.ts` | 同上 |
| 搜索 | `chrome/NativeSearchPage.kt` | `components/app/search/useNativeSearchPage.ts` | `chrome/NativeSearchPage.kt`、`chrome/NativePageInput.kt` |
| 设置索引 / 背屏控制 | `chrome/NativeSettingsPage.kt` / `NativeRearControlPage.kt` | `components/modal/settings/useNativeSettingsPage.ts` | 对应 kt |
| 设置二级页（语义化，可选） | `chrome/TySettings.kt`（`TySettingsPageView`，Compose 自己排版） | `hooks/useNativeSettingsDocument.ts` 的 `flow` 参数 | `chrome/TySettings*.kt`；**不消费任何 DOM 矩形** |
| 设置二级页（外观/引导/诊断…，历史路径） | `chrome/NativeSettingsDocumentView.kt`（显示列表复刻） | `services/nativeSettingsDocument.ts`、`hooks/useNativeSettingsDocument.ts` | `chrome/NativeSettingsDocument*.kt`；**DOM 是排版真值源，只改样式不改结构** |
| 二级操作面板（歌曲 ⋯ / 歌单 ⋯ / 音源选择…） | `chrome/TyPanel.kt` + `TyPanelHost.kt` | `library/suites/mobile/native/OperationPanel.tsx`（声明式模型） | `chrome/TyPanel*.kt` |
| 极简播放器 | `minimal/ui/MinimalPlayerScreen.kt` | `hooks/useNativeMinimalPlayer.ts`、`AppOverlays.tsx` | `minimal/ui/`、`minimal/` |
| 迷你播放器 | `chrome/ChromeMiniPlayer.kt` | `MobileMiniPlayer.tsx`（仅发 chrome 帧） | `chrome/ChromeMiniPlayer.kt` |
| 底部导航 | `chrome/ChromeNavigation.kt` | `MobileLibraryStage.tsx`（仅发 chrome 帧） | `chrome/ChromeNavigation.kt` |
| 舞台传输条 | `chrome/ChromeStagePlayer.kt` | `MobileStageChrome.tsx`（仅发 chrome 帧） | `chrome/ChromeStagePlayer.kt` |
| 队列 / 音质 / 音效 / 歌词工具 | `minimal/ui/Minimal*Sheet.kt` | `services/nativeMinimalQueue.ts` | `minimal/ui/` |

## 3. WebView 白名单（Android 上允许真实绘制的旧 UI）

| 面 | 文件 | 为什么保留 |
|---|---|---|
| Folia 歌词 / 可视化舞台 | `App.tsx`（`player-visual-surface`）、`components/visualizer/*` | 唯一渲染器 |
| 舞台顶栏 + 更多菜单 | `components/app/overlays/mobile-stage/MobileStageChrome.tsx:109-175` | 无 Compose 等价物 |
| 背屏歌词 | `rearLyrics.tsx`、`components/rear/*`、`RearLyricsActivity.java` | 独立 Activity 与 bundle |
| 二级操作面板的 DOM 兜底 | `library/suites/mobile/native/OperationPanel.tsx` | 面板渲染的唯一入口：原生能力位不可用/包被拒时用 `.ml-sheet` 兜底（桌面与网页版也走它）。**不得**在具体功能里另起一层 `.ml-sheet` |
| 本地导入工具（`MobileLocalTools`） | `library/suites/mobile/native/NativeLocalLibrary.tsx` | 文件选择依赖 HTML `input[type=file]`，原生 SAF 选择器尚未实现 |
| 歌单「管理歌曲」、登录二维码、其它确认框 | `LocalPlaylistManageSheet.tsx`、`account/*`、`components/shared/ConfirmDialog` 等 | 列表型 / 二维码 / 富内容面板，本轮不在统一面板的六种块之内 |
| 设置实时预览岛 | `VisPlayground`、`ThemePark`、`GlobalLyricOffsetPreview` 的 `data-native-live` 节点 | 设置页唯一的真实像素预览 |
| 设置文档排版源 | `SettingsModal.tsx`、`MobileSettingsLanding.tsx` 的 DOM 树 | 未迁移分区仍是逐元素测量来源，挂载但不绘制 |
| 极简页回退 | `MinimalStage.tsx` | 握手未完成/弹层打开时的短期承载 |

> **二级操作面板（原生化专项·第 21 轮）**：所有"从 ⋯ 打开的动作列表"统一走
> `library/suites/mobile/native/OperationPanel.tsx` → `chrome/TyPanel.kt`。React 只拼声明式模型
> （`types/nativePanels.ts`），Compose 负责 Sheet / Dialog / Menu 三种容器与六种内容块；
> 点击只回传动作 id，业务规则一行都没有搬进 Kotlin。新增一个动作 = React 加一行数据，
> 不需要改 Kotlin，也不需要新建弹窗。
>
> **设置语义化（同一轮）**：设置文档协议新增可选 `flow` 字段。给了 `flow` 的分区由
> `chrome/TySettings.kt` 的 `SettingsGroup/Item/Switch/Select/Slider/Input/Dialog/Action`
> 自己排版，**不再消费任何 DOM 矩形**；没给的分区继续走逐元素测量的显示列表。
> 两种模式可按分区并存，迁移是逐页的，互不影响。

> **沉浸式毛玻璃顶栏（Top Glass Bar）**：Compose 侧为唯一正式实现（`TopGlassBar.kt`，
> 所有固定顶栏页面经 `TyTopGlassContentLayer` + `TyTopGlassSurface` 接入，列表全幅滚动
> 进入顶栏玻璃后方）。WebView 侧无固定顶栏全页面（sheet 的 header 随内容滚动、
> 极简页歌词自带 mask 渐隐），不绘制第二层玻璃；第一轮内容侧 scrim 能力已彻底删除。
> 新增可滚页面时按 `docs/ui-system/TOP_GLASS_BAR.md` §4 接入，不得页面手写模糊。

## 4. 白名单变更流程

新增 Android 上的 WebView 绘制面，必须同时：
1. 在 §3 增加一行，写明页面、文件、理由与退出条件；
2. 更新 `dev/build/androidWebUiOwnership.json` 的 `webviewAllowlist`；
3. 若属于"临时缺口"，在 issue/提交信息里写明补齐 Compose 后的删除条件。

**不得**为了绕开缺口，把旧 DOM 分支重新接回页面渲染路径（例如把 `!NATIVE_FIRST` 改回 `!nativeReady`、或让适配器返回值恒为 false）。

## 5. 失败行为（不允许静默回退）

- 原生页接管失败（无 `presented` / 持续拒收 / `probe` 失败）→ **原生错误状态 + 重试按钮**（`NativePageFallbackPanel`），不得显示旧 WebView 页面。
- 极简播放器是唯一例外：它有握手式短期回退（`owns=false`），属既定设计。
- 任何"为了让它看起来正常"的 `ready=true` 写死、隐藏错误、跳过 session 校验，都视为回归。

## 6. 检查机制

- `npm run check:android-ui` —— 归属与门控断言（也可由 `npm test` 内的 `androidPageOwnership` 用例覆盖）。
- 断言内容：各页面适配器在 `NATIVE_FIRST` 下必须恒真；页面 DOM 分支必须挂在 `!NATIVE_FIRST` 模块常量门控上；`webviewAllowlist` 之外不得新增 WebView 页面壳。
- 面板契约：`TyPanelTest.kt`（`android/app/src/test/.../chrome/`）锁面板包解析容错、设置页分组切分与动作命名空间。

## 7. 设置二级页：从 DOM 测量迁到语义化（迁移手册）

现状（1.3.188）：`NativeSettingsDocumentView` 仍是默认路径 —— 在 WebView 里逐元素测量，
拍成 paints/controls/areas 的显示列表，Compose 照单绘制。它保证像素 1:1，但排版真值源在 WebView。

已就绪的替代路径（本轮落地）：

1. `hooks/useNativeSettingsDocument(root, enabled, key, title, flow, onFlowAction)`；
2. 传了 `flow` → `NativeSettingsDocumentView` 第一分支改走 `TySettingsPageView`，
   **完全不读 paints/controls 的矩形**，行高/间距/触摸目标/深浅色全由 Compose 决定；
3. 不传 → 行为与本轮之前逐像素一致。

单页迁移步骤（每步可独立提交、可独立回滚）：

1. 新建 `settingsFlow/<section>.ts`，用现有 store 状态生成 `NativeSettingsFlow`：
   `group` 开卡片，`switch/select/slider/input/action` 各一条，`note` 放说明；
2. `onFlowAction(nodeId, event)` 里按 nodeId 写回**原有** store / 业务函数（不新增逻辑）；
3. 在 `SettingsModal` 里按 `activeSettingsSection` 决定是否传 flow；
4. 保留该分区的实时预览（`data-native-live` 节点）走原测量路径 —— 预览本身必须由 WebView 画。

不建议迁移的分区：`appearance` 内的实时预览岛、`lab`（VisPlayground / ThemePark）、
`graphics`（含实时诊断与外部链接特殊交互）。这些页面里"控件"只占少数，"真像素预览"才是主体。

## 8. 本机构建与测试环境（已知限制）

- 仓库路径含中文 → AGP 拒绝；用 ASCII junction `C:\tingyu-build` 构建（`compileDebugKotlin` 可用）。
- **Gradle 测试 worker 不支持 junction**（argfile 类路径中文乱码 → `ClassNotFoundException`）：
  单测须在 ASCII 镜像 `C:\tb\t182` 跑，同步方式见 `C:\tb\run-ui-checks.sh sync-mirror`。
- **Windows 上 Robolectric NATIVE 图形库会崩测试 JVM**（`EXCEPTION_ACCESS_VIOLATION in RenderNodeNatives.nCreate`，
  与本仓库源码无关，1.3.182 起已知）。完整单测须带绕行：
  `-I C:/tb/exclude-native-graphics.gradle -I C:/tb/fork-per-class.gradle`；
  被排除的 4 个渲染类（`MinimalParityTest` / `MinimalScreenshotTest` / `NativeSettingsTouchTest` /
  `PlayerSurfaceMotionTest`）只能在真机或 CI 上验。
