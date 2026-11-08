# UI_PAGE_INVENTORY — 听屿页面与源码位置清单

> 基线：commit `1745121`（main，1.3.182）。本清单由 2026-11-08 全源码审计产出。
> 页面归属规则见 `docs/ANDROID-PAGE-OWNERSHIP.md`（页面级权威文档）；本文件是其面向 UI 统一工程的展开。

## 0. 页面归属总模型

听屿是 **Capacitor WebView（React 19）+ Kotlin/Compose 双渲染器**架构：

- **Compose 原生页（NATIVE_FIRST，正式包默认）**：home / collection（歌单·歌手·专辑）/ search / settings（含背屏控制页）。数据经 `NativePageModel` 包从 JS 下发（`src/hooks/useNativePage.ts` → `TingyuChromePlugin.pageUpdate` → `NativePageView.kt` 分发）。
- **WebView 保留页**：经典歌词舞台（stage）、背屏歌词（rear，独立 Activity + `rearLyrics.tsx`）、二级 sheet/弹层、极简页的 WebView 回退形态（`TINGYU_COMPOSE_MINIMAL=false` 或桥未握手）。
- **Compose 极简播放页**：`MinimalPlayerPage.kt` + `minimal/ui/`，桥握手成功后接管；失败自动回退 WebView 版 `overlays/minimal-stage/`。
- **Compose 底栏/迷你条**：`ChromeNavigation.kt` / `ChromeMiniPlayer.kt`，接管时 WebView 底栏被 `composeChrome.css` 强制隐藏防双绘。

## 1. 页面清单

状态图例：`已审计`=本次已确认源码位置与实现方式；`迁移中`/`待迁移`=是否纳入本次统一工程。

| # | 页面 | 源码位置（Compose 侧 / WebView 侧） | 类型 | 数据来源 | 状态 |
|---|---|---|---|---|---|
| 1 | 推荐首页 | `chrome/NativeHomePage.kt` / `library/suites/mobile/MobileHome.tsx` + `MobileHomeOverview.tsx` | 一级 | 首页卡模型（homeSpecialCards）+ provider 推荐 | 已审计 |
| 2 | 资料库 | `NativeHomePage.kt`（library: 前缀 key）/ `mobileLibrary.css` 作用域组件 | 一级 | 本地库 + provider 收藏 | 已审计 |
| 3 | 搜索 | `chrome/NativeSearchPage.kt` / `components/app/search/SearchWorkspace.tsx`（覆盖层，hash `#search/<q>`） | 一级（覆盖层） | `omni.search` | 已审计 |
| 4 | 设置主页 | `chrome/NativeSettingsPage.kt` / `components/modal/settings/MobileSettingsLanding.tsx`（`SettingsModal.tsx` 为桌面大版） | 一级（弹窗） | `buildSettingsNavGroups` | 已审计 |
| 5 | 设置子页 ×15 | `NativeSettingsDocumentView` / `components/modal/settings/*Subview.tsx` | 设置 | useXxxSettingsStore | 已审计 |
| 6 | 背屏控制页 | `chrome/NativeRearControlPage.kt` | 设置子页 | rear 设置 store | 已审计 |
| 7 | 集合详情：歌单/专辑/每日推荐/收藏·自建/本地文件夹（阶段 E 统一） | `chrome/MediaDetail.kt`（经 `useNativeCollectionPage.ts`） / `library/suites/mobile/MobileCollection.tsx` | 详情 | `CollectionResource`（online/navidrome/static 三装配） | 已实现+已构建+已测试，待真机验证 |
| 8 | 歌手详情（保留独立结构） | `chrome/NativeDirectoryPage.kt` artist 分支（经 `useNativeArtistPage.ts`） / `MobileArtist.tsx` | 详情 | 同上 | 已审计 |
| 9 | 播放队列 | 宿主级浮层 `MinimalQueueSheet.kt` / `components/app/player-panel/MobileQueueSheet.tsx`（复用 `panelTab/QueueTab`）；桌面 `UnifiedPanel.tsx` queue tab | 浮层 | `usePlaybackStore.playQueue` | 已审计 |
| 10 | 迷你播放器 | `chrome/ChromeMiniPlayer.kt` / `styles/mobileGlass.css`（ml-mini） | 常驻 chrome | chrome packet（nav/mini/stage） | 已审计 |
| 11 | 全屏播放（经典舞台） | WebView：`components/app/overlays/mobile-stage/` + `components/visualizer/*`（15 模式） | 沉浸 | 权威 `usePlaybackStore` + motionSignals | 已审计 |
| 12 | 极简播放页 | `chrome/MinimalPlayerPage.kt` + `minimal/ui/MinimalPlayerScreen.kt`（HorizontalPager 封面/歌词）/ WebView 回退 `overlays/minimal-stage/` | 沉浸 | `MinimalPlayerFrame` 每秒 1 帧 + 原生直读歌词/Media3 时钟 | 已审计 |
| 13 | 定时关闭 | `MiniSleepMenu.kt` / `components/modal/SleepTimerSheet.tsx` | 浮层 | `useSleepTimerStore` | 已审计 |
| 14 | 音源选择 | `MobileHomeSources.tsx`（MobileSourceSheet） | 浮层 | providerRegistry | 已审计 |
| 15 | 平台账号/登录 | `library/suites/mobile/account/*`（GridAccountSurface 等） | 浮层/surface | provider auth | 已审计 |
| 16 | LX/音质/音效工具 | `components/audio-tools/*`（AudioToolsHost 挂载） | 浮层 | lxSourceStore 等 | 已审计 |
| 17 | 歌曲操作菜单 | `MobileTrackList` 行内 ⋮ / `MobileCollectionMenu.tsx` / `MobileSongTools.tsx` | 浮层 | 能力配置 | 已审计 |
| 18 | 确认弹窗 | `components/shared/ConfirmDialog.tsx`（另有 Import/DeleteFolder 两套变体） | 浮层 | — | 已审计·待统一 |
| 19 | 歌词匹配弹窗 ×3 + 本地元数据匹配 | `components/modal/`：LyricMatchModal / NaviLyricMatchModal / OnlineLyricMatchModal / LocalSongMetadataMatchDialog | 浮层 | 歌词 provider | 已审计·待统一 |
| 20 | 本地实体编辑 | `components/local-library-entity/*`（EntityEditorWorkspace 等） | 工作区 | 本地库服务 | 已审计 |
| 21 | 最近播放 | 本地：`services/localPlayHistory.ts`（IndexedDB）；在线：`useMobileLibraryStore`（localStorage 24 条） | 列表 | 两套历史模型（已知债务） | 已审计 |
| 22 | Lattice 拼贴 | `view==='lattice'` 残留接线（App.tsx:710）；v2 已移除，`setView` 折叠为 player | — | — | 已审计·死代码 |
| 23 | 背屏歌词 | 根级 `Rear*.java` 40+ 文件 + `src/rearLyrics.tsx` + `components/rear/*` | 独立 | rearLyricsTransport 协议 | 已审计·不套用主界面模板 |

## 2. 覆盖率与一致性结论

- **歌单详情不存在跨音源复制粘贴**：本地/在线/每日推荐统一走 `MobileCollection` + `CollectionResource`，原生侧统一走 `MediaDetailScaffold`（chrome/MediaDetail.kt，阶段 E 起覆盖专辑/每日推荐等全部非歌手集合）。差异由能力配置（`collectionCapabilities`、mutations.capabilities）控制——架构已符合跨音源统一目标。
- **仍需统一的点**：确认弹窗 3 套、匹配弹窗 4 套、播放队列 UI 双渲染器各一套、歌曲行的音质标签只在原生行有（WebView 行缺失）、设置双模板头部。
- **导航入口一致性**：同一集合从任意入口进入均经 `collectionNavigation` 栈 + 同一 collection surface，返回恢复由 `restoreHistoryState` + collection snapshot 保证。
