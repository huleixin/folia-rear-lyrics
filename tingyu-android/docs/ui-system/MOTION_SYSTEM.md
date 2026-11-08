# MOTION_SYSTEM — 听屿动效规范与动画矩阵

> 基线：commit `1745121`。三处单一事实源：`src/components/shared/motionTokens.ts`（framer-motion）、`src/styles/tingyuTokens.css`（CSS）、`android/.../chrome/TingYuMotion.kt`（Compose）。改曲线必须三处同步。

## 1. Motion Tokens

### Easing
| Token | 值 | 用途 |
|---|---|---|
| `Emphasized` / `--ty-ease-standard` | cubic-bezier(0.2, 0.8, 0.2, 1) | 位移类通用（页面推进/返回、底栏、卡片） |
| `enter` / `--ty-ease-enter` | cubic-bezier(0.22, 1, 0.36, 1) | 进入：减速收尾（覆盖层托起、sheet 上滑的渐入） |
| `exit` / `--ty-ease-exit` | cubic-bezier(0.42, 0, 0.74, 0.3) | 退出：加速离场（极简页滑出、sheet 下滑） |
| `SheetIn`（Compose） | cubic-bezier(0.2, 0.7, 0.2, 1) | 底部 sheet 上滑进场 |
| `Collapse`（Compose） | cubic-bezier(0.4, 0, 0.7, 0.3) | 舞台收起（stageExit 极简档） |
| `StageEnter`（Compose） | cubic-bezier(0.2, 0.72, 0.16, 1) | 极简页自底部上滑入场 |

### Duration
| Token | 值 | 用途 |
|---|---|---|
| fast / `--ty-duration-fast` | 120ms | 微反馈 |
| base / `--ty-duration-base` | 180ms | 颜色/透明度 |
| slow / `--ty-duration-slow` | 280ms | 覆盖层/页面级 |
| stage / `--ty-duration-stage` | 360ms | 极简页 ↔ 舞台 |
| PushMs 240 / TabIn 200 / TabOut 180 / MinimalEnter 360 / MinimalExit 300 / SheetIn 260 | | Compose 侧 |

### Spring
`stiffness 520 / dampingRatio 1.0`（临界阻尼，无过冲）——底栏选中指示、chrome y 位移。

## 2. 动效语义矩阵（空间层级）

| 层级变化 | 进场 | 退场 | 实现 |
|---|---|---|---|
| 一级页签切换 | 8dp 横移 + 200ms 淡入 | 180ms 反向 | `NativeMotionKind.TAB` |
| 二级推进（PUSH） | 左进 28dp + 240ms | 右退 travel/3 + 淡出 | `NativeMotionKind.PUSH` |
| 返回（POP） | 右进 travel/3 | 右出 28dp，zIndex 置底 | `NativeMotionKind.POP` |
| 舞台进出 | 全窗淡入 140ms | 收起动画（stageExit 280/360ms） | `NativeMotionKind.STAGE` |
| 极简页进入 | 自底部上滑 360ms，只滑不淡 | 下滑 300ms + 淡出 200ms | `AnimatedVisibility`（ComposeChromeHost） |
| 底部 sheet | 上滑 260ms + 渐入 200ms | 下滑 200ms + 渐隐 140ms | `MinimalSheetMotion` |
| 覆盖层（WebView） | y18+scale0.985 托起 280ms | y12 退出 | `overlayEntranceMotion.ts` |
| 列表状态变化 | 原位置连续变化（layout 动画），不整段重播 | | |

**规则**：一级导航不大幅位移；返回方向必须与进入相反；列表变化保持空间连续性。

## 3. 极简歌词页专项（强制）

1. 进入：自屏幕底部上滑展开（唯一一套上滑，WebView 侧同名位移已由 `composeOwnsMinimalEntry` 关闭，防双重动画）。
2. 退出：下滑消失；**恢复原播放器，不重建**（所有权握手：桥 `minimalPlayerFrame` accepted 才接管；WebView 回退形态自动生效）。
3. 退出期间 `stageExit` 保持舞台挂载、全屏吞触摸，防止返回中途误触底层。
4. 收起 → 集合页时 `minimalCoverHold` 原地举牌（≤1200ms，超时放手）防止二次入场闪跳。
5. 播放不断、进度不跳、歌词时钟不重置：桥面只传 1fps 展示帧，歌曲身份/歌词/Media3 时钟原生直读，**禁止**为转场创建第二套播放器实例。

## 4. 动画状态机与中断

现状：极简页由布尔组合表达（`minimalBase`/`minimalOwns`/`minimalCoverHold`/`pendingStageEntry`/`stageExit`），stageExit 是显式的小状态机（active/completed/returning）。规则：

- 快速连续操作：路由提交经 `NativeRouteFence` + `ChromeFrameOrder` 幂等闸门丢弃迟到帧；延迟任务用代际令牌作废。
- **禁止**用无条件延时假装动画完成（现存 900ms grace / 520ms 延迟等魔法数均有录屏专项注释，改动前必须复现对应专项）。
- `reducedMotion`（`useMotionSettingsStore` → `data-reduce-motion`；Compose 侧 `NativeMotionPolicy.kind(...,reduced)`）下全部转场退化为 NONE/纯淡。

## 5. WebView 侧散乱参数收敛计划

存量：20+ 种 duration、9 种 easing 散落 148 文件（审计数据）。策略：**只收编跨页面共享语义**（已收编：覆盖层进出），页面内部角色动画（可视化器 15 模式、歌词逐字）保留自有节奏。新增代码一律从 `motionTokens.ts` 取用。
