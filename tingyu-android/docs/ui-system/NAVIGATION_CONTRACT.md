# NAVIGATION_CONTRACT — 导航、返回、手势与浮层规则

> 基线：commit `1745121`。听屿没有路由库；导航是「store 快照 + 浏览器 history 双写」+ 集合栈 + 覆盖层的分层设计。本契约固化现行规则并指出必须收敛的点。

## 1. 层级模型（自上而下）

```
L0  一级 view：home / player(stage)        —— useAppViewStore（setView 仅 useAppNavigation 可写）
L1  集合栈：歌单/专辑/歌手详情              —— useCollectionNavigationStore.snapshot{origin, stack[]}
L2  覆盖层：搜索（isSearchOpen）、设置（弹窗）
L3  浮层：队列 sheet、睡眠菜单、音源 sheet、工具页、确认弹窗（modalBackStack 注册）
L4  沉浸：极简播放页（Compose 接管，独立所有权握手）、背屏（独立 Activity）
```

## 2. 返回优先级（Android 硬件/手势返回的实际分发链）

1. **Compose 局部 BackHandler**（组合内注册者）：MiniSleepMenu → MinimalToolsSheets/MinimalQueueSheet → PlaylistPage/DirectoryPage 的 `searchExpanded` 收起。
2. **Activity 兜底 OnBackPressedCallback**（MainActivity.java:178-197）：询问 `nativeShell.requiresWebBack()`，需要则经 `FoliaNativePlugin.emitBackPressed` 转发给 JS；JS 未就绪且不需要 → `moveTaskToBack`（保后台播放，不退出）。
3. **JS 链**（`useNativeBackButton.ts`）：`runTopModalBack()`（modalBackStack 栈顶）→ 合成 Escape → `navigateBackInApp()`：
   播放页 detour → 播放页退出（极简走 `runMinimalStageExit`）→ lattice（死代码路径）→ 集合栈 `popCollectionLayer` → 关搜索 → false。
4. 无人消费 → `moveTaskToBack`。

**规则**：返回永远作用于当前最高层；JS 意愿经 `setBackHandlerState(handledInWeb, revision)` 上报，revision 单调。

## 3. 浮层返回的一致性要求

- 一切模态浮层必须注册进 `src/services/modalBackStack.ts`（经 `ThemedDialog` 自动注册），**禁止**自建 window capture 级 Escape 拦截。
- 例外（2026-11-08 收敛后）：页面级窗口监听器**只允许**在先咨询返回栈后使用——
  - `MobileSettingsLanding.tsx`：capture 级 Escape 现先 `runTopModalBack()`，栈顶模态存在时由它消费（修复 68599 同类问题的键盘 Escape 面）；
  - `MobileHome.tsx`：资料库页 Escape 现检查 `hasRegisteredModal()`，有已注册模态时页面不参与返回；
  - 歌单内搜索（WebView 接管时）经 `registerModalBack` 注册，与 Compose 侧 `BackHandler(enabled=searchExpanded)` 同语义。
- 浮层关闭动画期间必须吞触摸（参照 Compose 侧 `stageExit` 期间全屏吞触摸，ComposeChromeHost.kt:956）。

## 4. 手势边界（不得互相触发）

| 手势 | 归属 | 冲突防护现状 |
|---|---|---|
| 系统返回（手势区） | 上表分发链 | NativeRouteFence 防迟到 VisualStateCallback 复活旧路由 |
| 歌单内搜索展开态返回 | NativePlaylistPage BackHandler | 先收搜索再退页 ✓ |
| 极简页「收起」 | MinimalPlayerCommands → collapseStage() | 无下滑关闭手势（有意，避免与歌词滚动冲突） |
| 队列抽屉下滑关闭 | MinimalQueueSheet | ✓ |
| 舞台横滑/进度拖动 | WebView stage | 与返回无关，不受影响 |

## 5. 状态恢复义务

- 集合返回必须恢复：原入口（origin）、滚动位置、筛选/排序、歌单内搜索状态。
- 顶层 view 经 `restoreHistoryState`（useAppNavigation.ts:214-223）从 history state 恢复；启动经 `resolveStartupView`（受 `open_player_on_launch`、播放落点偏好、FM、队列影响）。
- 极简页退出必须恢复原播放器呈现且**不重建**（Compose 侧 `minimalBase` 判定 + WebView 侧握手所有权，播放不中断）。

## 6. 已知收敛点（阶段 D 处理）

1. ~~Escape/返回处理 5 条路径中 2 条绕过 modalBackStack~~ **已收敛**（见 §3 例外规则，2026-11-08）。
2. Lattice 死代码接线（useAppNavigation.ts:152,382-390,430-437）应摘除，避免返回链多一层无效分支（待做：需先确认零动态引用）。
3. `modalBackStack.ts` 栈顶优先与 capture 级拦截的哲学冲突必须以 modalBackStack 为准——已通过 §3 例外规则落实。
