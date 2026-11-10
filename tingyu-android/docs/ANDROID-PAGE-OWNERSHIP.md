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
| 设置二级页（语义化，已迁移分区） | `chrome/SettingsFlowPage.kt`（底色 + 毛玻璃顶栏）+ `chrome/TySettings.kt`（内容） | `components/modal/settings/flow/*`（声明式模型）→ `hooks/useNativeSettingsDocument.ts` 的 `flow` 参数 | `chrome/SettingsFlowPage.kt`、`chrome/TySettings*.kt`；**不消费任何 DOM 矩形** |
| 历史设置显示列表兼容（当前路由不再生产） | `chrome/NativeSettingsDocumentView.kt`（显示列表复刻） | `services/nativeSettingsDocument.ts`、`hooks/useNativeSettingsDocument.ts` | `chrome/NativeSettingsDocument*.kt`；**DOM 是排版真值源，只改样式不改结构** |
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
| 设置表单状态宿主 | `SettingsModal.tsx`、`MobileSettingsLanding.tsx` 的 DOM 树 | 仅提供表单语义、状态及业务处理器，挂载但不绘制；不再提供控件坐标 |
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

## 7. 设置二、三级页：统一原生布局（1.3.190）

所有设置路由均由 `SettingsFlowPage` + `TySettings` 排版和绘制；确认框使用
`TyPanelOverlay` + `TyDialogFrame`。外观、界面、播放、音源与系统歌词、存储、图形、
开发者、关于帮助，以及歌词过滤、全局偏移、主题编辑、歌词/背景/字体编辑、背屏引导、
诊断与独立外观页都走这一条管线。设置首页和背屏控制已原生的实现继续保留。

- `nativeSettingsSemantic.ts` 从已挂载的 React 业务组件读取标题、说明、可访问名称、
  控件类型、当前值与选项，不读取 DOM 矩形、字体测量或滚动偏移。
- `settingsSemanticControls.ts` 将点击、选择、输入、焦点、IME 确认、滑块与取色回传
  原来的处理器。持久化、校验、备份、导入确认、SAF 文件选择不另写一份。
- 所有下发文档只有 `flow`；`paints/controls/areas/live` 均为空。旧显示列表解析器
  仅为历史协议兼容，不再由当前设置路由生产。未在 `flow/*` 登记的分区使用共享
  语义适配器，不能回退到测量路径，也不能缺行后返回空页。
- 全部页面共用现有 TySettings/TyPanel 的色板、字号、间距、圆角和交互；固定顶栏
  保留现有 Haze 及高度保护。二、三级页继续隐藏底栏，返回首页恢复既有过渡。
- 实时 Folia 歌词/背景像素仍在 `data-native-live` 岛内。预览矩形与裁剪范围由
  Compose 发给 WebView，方向为 **原生布局 → 浏览器预览**，不是浏览器测量原生表单。
  岛内的旧暂停/切换按钮也投影为原生控件，DOM 对应按钮隐藏。
- 预览后代动画变化不重新投影表单，不增加轮询/逐帧 React 更新。设置交互、结构变化
  与异步状态更新触发有限批次投影；离开页面时恢复预览原始样式并移除监听。

后续新增设置应使用带明确标题/说明的 `SettingsRow`、原生 select 标记或标准表单语义。
特殊编辑器新增控件种类需补齐 TySettings、语义适配和双端契约测试，不能偷偷画回 DOM。
实时预览依旧属于白名单；实际小米 WebView 合成、键盘/系统返回与预览滚动裁剪需要真机验收。

## 8. 本机构建与测试环境（已知限制）

- 仓库路径含中文 → AGP 拒绝；用 ASCII junction `C:\tingyu-build` 构建（`compileDebugKotlin` 可用）。
- **Gradle 测试 worker 不支持 junction**（argfile 类路径中文乱码 → `ClassNotFoundException`）：
  单测须在 ASCII 镜像 `C:\tb\t182` 跑，同步方式见 `C:\tb\run-ui-checks.sh sync-mirror`。
- **Windows 上 Robolectric NATIVE 图形库会崩测试 JVM**（`EXCEPTION_ACCESS_VIOLATION in RenderNodeNatives.nCreate`，
  与本仓库源码无关，1.3.182 起已知）。完整单测须带绕行：
  `-I C:/tb/exclude-native-graphics.gradle -I C:/tb/fork-per-class.gradle`；
  被排除的 4 个渲染类（`MinimalParityTest` / `MinimalScreenshotTest` / `NativeSettingsTouchTest` /
  `PlayerSurfaceMotionTest`）只能在真机或 CI 上验。

### 2026-11-10 设置排版恢复

当前设置文档的 `flow.layout` 保存源页面显式声明的卡片/行/网格/文本层级，
`SettingsLayoutView` + 行内原生控件按该树排版。不得再只下发扁平控件后自动拼成列表。
声明来自源 JSX 的设计 token；生产适配器不采集浏览器坐标、文字折行或滚动偏移。
既有无 layout 的历史 flow 仍兼容，但当前页面均应生成 layout。实时预览仍是原白名单岛，
其位置由 Compose 提供，原生覆盖按钮不会新增 WebView UI。详见 ANDROID-NATIVE-SETTINGS.md。

### 品牌冷启动画布

index.html / public/brand-splash.* 是启动期 SVG + CSS 画布白名单。复用现有 WebView，在首个原生页面已绘制且 React 提交后淡出并移除；不承载任何业务页面，不允许导航或主题切换重播。原生启动窗口仅显示同色背景。
