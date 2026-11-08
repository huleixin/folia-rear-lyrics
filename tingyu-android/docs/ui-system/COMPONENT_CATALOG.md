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

## 3. 页面模板（跨音源统一的核心）

| 模板 | 路径 | 覆盖 |
|---|---|---|
| MobileCollection | `src/library/suites/mobile/MobileCollection.tsx` | 歌单/专辑/歌手/目录/每日推荐 **唯一** WebView 详情实现（按 collection.source 分支 + 能力配置） |
| MobilePlaylistHeader / MobilePlaylistBackdrop | 同目录 | 详情头/氛围背景 |
| MobileTrackList（TrackRow） | 同目录 | ✔ 统一歌曲行（react-window 虚拟化） |
| MobileHome / MobileHomeOverview / MobileLibraryOnline / MobileLocalFolders | 同目录 | 一级页内容区 |
| NativePlaylistPage / NativeDirectoryPage / NativeHomePage / NativeSearchPage / NativeSettingsPage | `android/.../chrome/*.kt` | ✔ 对应的 Compose 原生实现（由 `useNativeCollectionPage.ts` 等 adapter 投影） |
| MobileArtist | 同目录 | 歌手页 |

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
