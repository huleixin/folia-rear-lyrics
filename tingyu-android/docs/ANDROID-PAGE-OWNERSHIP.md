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
| 设置二级页（外观/引导/诊断…） | `chrome/NativeSettingsDocumentView.kt`（显示列表复刻） | `services/nativeSettingsDocument.ts`、`hooks/useNativeSettingsDocument.ts` | `chrome/NativeSettingsDocument*.kt`；**DOM 是排版真值源，只改样式不改结构** |
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
| 二级操作 sheet | `MobileSheet.tsx`、`MobileCollectionMenu.tsx`、`MobileCollectionSourceActions.tsx`、`MobileHomeSources.tsx`、`account/*` | 加歌单/建歌单/排序/重命名/重扫/导出/来源切换/登录，Compose 零覆盖 |
| 设置实时预览岛 | `VisPlayground`、`ThemePark`、`GlobalLyricOffsetPreview` 的 `data-native-live` 节点 | 设置页唯一的真实像素预览 |
| 设置文档排版源 | `SettingsModal.tsx`、`MobileSettingsLanding.tsx` 的 DOM 树 | 逐元素测量来源，挂载但不绘制 |
| 极简页回退 | `MinimalStage.tsx` | 握手未完成/弹层打开时的短期承载 |

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
