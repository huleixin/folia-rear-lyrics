# COMPONENT_CATALOG — 公共组件目录与调用关系

> 基线：commit `1745121`。范围：WebView 侧 React 组件 + Compose 侧公共件。标注 ✔ 统一 / ⚠ 多实现待收敛。

## 1. 组装层（App.tsx 是唯一装配点）

| 组件 | 路径 | 职责 |
|---|---|---|
| AppShell | `src/components/app/AppShell.tsx` | 窗口/外壳属性 |
| Home | `src/components/app/Home.tsx` | 一级页宿主，所有 suite 共用 |
| PlayerPanel | `src/components/app/PlayerPanel.tsx` | 播放侧面板入口（分流桌面/移动） |
| AppOverlays | `src/components/app/overlays/AppOverlays.tsx` | 搜索/舞台控制条/极简页挂载 |
| AppDialogs | `src/components/app/dialogs/AppDialogs.tsx` | 弹窗集中挂载 |

## 2. 跨页面公共组件

| 组件 | 路径 | 状态 |
|---|---|---|
| UnifiedPanel | `src/components/UnifiedPanel.tsx` | 桌面播放面板（5 tab）；其 props 同时是 mobile 侧契约 |
| FloatingPlayerControls | `src/components/FloatingPlayerControls.tsx` | 舞台控制条（mobile 三态下让位原生） |
| ThemedDialog / ConfirmDialog | `src/components/shared/` | ✔ 弹窗基座 + modalBackStack 自动注册 |
| overlayEntranceMotion | `src/components/shared/overlayEntranceMotion.ts` | ✔ 覆盖层进出场（已接 motionTokens） |
| motionTokens | `src/components/shared/motionTokens.ts` | ✔ 新增：动效 Token |
| CustomSelect / SidePanelList / PlaylistSelectionDialog | `src/components/shared/` | ✔ 通用 |
| MobileArtwork / MobileSongSubtitle / MobilePlayingIndicator | `src/library/suites/mobile/` | ✔ 歌曲行原子件 |
| TopGlassBar（TyTopGlassContentLayer / TyTopGlassSurface / TyTopGlass） | `android/.../chrome/TopGlassBar.kt` | ✔ 沉浸式毛玻璃顶栏公共组件（Compose 侧，全部固定顶栏页面经此接入；契约见 TOP_GLASS_BAR.md，`topGlassBarContract.test.ts` 门禁） |

## 3. 页面模板（跨音源统一的核心）

| 模板 | 路径 | 覆盖 |
|---|---|---|
| MobileCollection | `src/library/suites/mobile/MobileCollection.tsx` | 歌单/专辑/歌手/目录/每日推荐 **唯一** WebView 详情实现（按 collection.source 分支 + 能力配置） |
| MobilePlaylistHeader / MobilePlaylistBackdrop | 同目录 | 详情头/氛围背景 |
| MobileTrackList（TrackRow） | 同目录 | ✔ 统一歌曲行（react-window 虚拟化） |
| MobileHome / MobileHomeOverview / MobileLibraryOnline / MobileLocalFolders | 同目录 | 一级页内容区 |
| MediaDetailScaffold / MediaDetailHeader / MediaDetailActionsRow / MediaDetailTrack（原 NativePlaylistPage 并入，阶段 E） | `android/.../chrome/MediaDetail.kt` | ✔ 所有非歌手集合详情（歌单/专辑/每日推荐/收藏/自建/本地文件夹）统一模板；数据经 `useNativeCollectionPage.ts` 投影 |
| NativeDirectoryPage / NativeHomePage / NativeSearchPage / NativeSettingsPage | `android/.../chrome/*.kt` | ✔ 对应的 Compose 原生实现（由 `useNativeCollectionPage.ts` / `useNativeArtistPage.ts` 等 adapter 投影；DirectoryPage 现服务资料库首页与歌手页） |
| MobileArtist | 同目录 | 歌手页 |

## 3.5 原生二级操作面板与设置控件（第 21 轮新增）

| 组件 | 路径 | 职责 |
|---|---|---|
| OperationPanel | `src/library/suites/mobile/native/OperationPanel.tsx` | 二级操作面板的**唯一渲染入口**：原生可用 → 推给 Compose；否则用 `.ml-sheet` 画同一份 spec |
| NativePanelModel / NativePanelFrame | `src/types/nativePanels.ts` | 声明式面板契约（6 种内容块：actions / select / toggle / input / confirm / note） |
| nativePanels | `src/services/nativePanels.ts` | 面板通道与动作命名空间解码（`act:` / `set:` / `toggle:` / `submit:` / `confirm:` / `dismiss`） |
| TyPanel / TyPanelHost / TyPanelModel | `android/.../chrome/TyPanel*.kt` | Compose 侧 Sheet / Dialog / Menu 三容器 + 六种块渲染与宿主级状态机 |
| TyPanelStyle | `android/.../chrome/TyPanelStyle.kt` | 面板唯一视觉/运动来源（TyPanelTheme / TyPanelDims / TyPanelMotion / TyPanelScrim） |
| TySettings | `android/.../chrome/TySettings.kt` | 设置控件：SettingsGroup / Item / Switch / Select / Slider / Input / Dialog / Action + TySettingsPageView |
| TySettingsModel | `android/.../chrome/TySettingsModel.kt` | 语义化设置页模型（无 rect，Compose 自己排版） |

> 面板与设置共用同一套主题与动效：`MinimalToolsSheets` 的 `ToolsTheme` 已收编为
> `TyPanelTheme` 的类型别名，`MinimalSheetMotion` 已改为委托 `TyPanelMotion`。
> 新增弹窗时必须复用这两个源，不得再写第三套圆角/遮罩/曲线。

## 4. 浮层/sheet

| 组件 | 路径 | 状态 |
|---|---|---|
| MobileQueueSheet（复用 panelTab/QueueTab） | `src/components/app/player-panel/` | ✔ 移动队列 |
| MinimalQueueSheet / MinimalToolsSheets | `android/.../minimal/ui/` | ✔ Compose 侧队列/工具页（共用 MinimalSheetMotion） |
| SleepTimerSheet / MiniSleepMenu | `src/components/modal/`、`chrome/MiniSleepMenu.kt` | 双端各一（同一 store 驱动） |
| MobileSourceSheet / OnlineProvider* | `library/suites/mobile/` | ✔ 音源与账号 |
| ⚠ 确认弹窗 ×3 | ConfirmDialog / ImportConfirmDialog / DeleteFolderConfirmModal | 待收敛为 ConfirmDialog 变体 |
| ⚠ 匹配弹窗 ×4 | LyricMatch / NaviLyricMatch / OnlineLyricMatch / LocalSongMetadataMatch | 结构高度相似，阶段 E 收敛 |
| ⚠ 设置双模板 | SettingsModal.tsx（3000+ 行）/ MobileSettingsLanding.tsx | 共用 subview 与 navModel，头部/导航待统一 |

## 5. 状态与信号

| 模块 | 路径 | 说明 |
|---|---|---|
| usePlaybackStore | `src/stores/usePlaybackStore.ts` | **播放状态唯一权威源**（raw/display 分层 + selector 导出）；禁止新增第二套 |
| motionSignals | `src/stores/motionSignals.ts` | 每帧信号 MotionValue 单例（进度/歌词时钟/频谱），UI 用 useTransform 订阅 |
| modalBackStack | `src/services/modalBackStack.ts` | 浮层返回优先级栈（ThemedDialog 自动注册） |
| androidMainInsets | `src/services/androidMainInsets.ts` | 进程级 Insets 单例（owner 计数 + revision 防旧包） |
| nativeChrome / nativeMinimalPlayer / nativePages | `src/services/` | 三条 JS↔Compose 通道（chrome 包 / 极简页握手 / 页面模型包） |

## 6. 禁止事项

1. 新页面禁止复制 MobileCollection/TrackRow 的变体；差异走能力配置与插槽。
2. 新浮层禁止绕过 ThemedDialog/modalBackStack。
3. 新组件禁止直接读播放器内部（只经 usePlaybackStore selector / motionSignals）。
4. 组件必须支持深浅色（经 token）、超长文本截断、禁用/加载态。
