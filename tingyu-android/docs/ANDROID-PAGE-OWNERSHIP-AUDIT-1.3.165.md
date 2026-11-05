# Android 页面渲染归属审计（第一阶段）

版本基线：1.3.165 / versionCode 188
审计日期：2026-11-05
性质：**只读审计**。本文不含任何删除建议的落地动作，第二阶段才会动代码。

---

## 0. 判定基准：先搞清楚"Android 上到底谁在画"

三个事实决定了后面所有结论，必须先钉住：

### 0.1 `NATIVE_FIRST` 是编译期常量，Android 正式包恒为 true

```ts
// src/services/nativeChrome.ts:7
export const PREHIDE_COMPOSE_CHROME = COMPOSE_CHROME && isAndroidNativeRuntime();
// src/services/nativePages.ts:5
export const NATIVE_FIRST = PREHIDE_COMPOSE_CHROME;
```

`build:capacitor` 写死 `VITE_TINGYU_COMPOSE_CHROME=true`，Android WebView 内 `isAndroidNativeRuntime()` 为真。
→ 桌面/Electron 构建为 false（它们仍依赖 React UI），Android 为 true。

### 0.2 `useNativePage` 的 ready 在 Android 上**恒为 true**（关键机理）

```ts
// src/hooks/useNativePage.ts:58
const owned = NATIVE_FIRST || value;   // value=false 时仍为 true
```

后果有三条，必须写进结论：

1. `ready` 与原生是否 ack、是否拒收、`enabled` 是否为 false **全都无关**；
2. "拒收 → 80ms 重试 → 三连败回退 WebView" 的阶梯在**绘制决策上是死代码**，只影响原生侧 `presented`；
3. 旧 DOM 之所以不可见，靠的是 **CSS 强制**而不是 React 卸载：

```css
/* src/styles/nativePages.css:2-10 */
[data-native-page='true']:not([data-native-document-root]):not([data-native-settings-portal]) {
    content-visibility: hidden !important;
    pointer-events: none !important;
    clip-path: inset(50%) !important;
```

### 0.3 chrome（迷你条/底栏/舞台传输条）用的是"预隐藏"而非握手

`useComposeChrome` 的 `ready` 初值即 `PREHIDE_COMPOSE_CHROME`，几何改由路由常量决定
（`NativeFooterLayout.kt:14-26`），`!compose` 分支在 Android 上**任何时刻都不成立**，
包括 active=false、探针失败、React 卸载之后。只有极简播放页是真正的握手式所有权
（`owns` 初值 false，`useNativeMinimalPlayer.ts:115`）。

---

## 1. 逐页归属

| 页面 | Android 现行绘制者 | 旧 DOM 分支位置 | Android 可达性 |
|---|---|---|---|
| 推荐 / 资料库首页 | Compose `NativeHomePage.kt` | `MobileHome.tsx:65-110`（`!nativeReady`） | **不可达**（ready 恒真） |
| 歌单页 | Compose `NativePlaylistPage.kt`（`sections` 含 `playlistIntro`） | `MobileCollection.tsx:69-194`（`!native`） | **不可达** |
| 专辑页 | Compose `NativeDirectoryPage.kt`（intro 分支） | 同上 | **不可达** |
| 歌手页 | Compose `NativeDirectoryPage.kt:65-85`（`key.contains("artist:")`） | `MobileArtist.tsx:62-156`（`!native`） | **不可达** |
| 搜索 | Compose `NativeSearchPage.kt` | `SearchWorkspace.tsx:246-428`（`!native`） | **不可达** |
| 设置索引 / 背屏控制 | Compose `NativeSettingsPage.kt` / `NativeRearControlPage.kt` | — | 无 DOM UI |
| 设置二级页（外观/引导/诊断…） | Compose 复刻显示列表 `NativeSettingsDocumentView.kt` | `SettingsModal.tsx` 整棵 DOM | **挂载但不绘制**（排版真值源） |
| 极简播放器 | Compose `MinimalPlayerScreen.kt` | `MinimalStage.tsx` | **可达（5 种真实回退场景）** |
| 迷你播放器 | Compose `ChromeMiniPlayer.kt` | `MobileMiniPlayer.tsx:75-112` | **不可达**（PREHIDE） |
| 底部导航 | Compose `ChromeNavigation.kt` | `MobileLibraryStage.tsx:73-105` | **不可达** |
| 舞台传输条 | Compose `ChromeStagePlayer.kt` | `MobileStageChrome.tsx:178-247` | **不可达** |
| 舞台顶栏 + 菜单 | **WebView** | `MobileStageChrome.tsx:109-175` | **可达（唯一实现）** |
| 歌词 / 可视化舞台 | **WebView** `VisualizerRenderer` | `App.tsx:2959-2971` | **可达（唯一实现）** |
| 背屏歌词 | **WebView（独立 Activity）** | `rearLyrics.tsx` / `RearLyricsActivity.java` | **可达（唯一实现）** |
| 队列 / 音质 / 音效 / 歌词工具 | Compose | 无 DOM | — |
| 各类二级 sheet（加歌单/排序/来源/登录） | **WebView** `MobileSheet` | 见 §3 | **可达（唯一实现）** |

### 1.1 极简播放器 WebView 回退的 5 个真实触发条件

`useNativeMinimalPlayer.ts`：首帧未 ack（数百 ms）／`probe()` 失败（整会话）／
打开 WebView 弹层（`isPanelOpen` 或 `[data-folia-keyboard-window]`）／连续 3 次拒收／
`enabled=false`（离开极简页）。这是**有意的降级梯**，不是死代码。

---

## 2. 清单 A —— 可以清理（Android 永不渲染）

> **前置条件**：确认不再维护浏览器 / Electron 版。仓库若仍要出 Web 构建，
> 这些分支是桌面唯一实现，统一降级为"暂缓"。

| # | 内容 | 位置 | 依据 |
|---|---|---|---|
| A1 | 旧首页 DOM 内容块 | `MobileHome.tsx:65-110` | `!nativeReady` 恒 false |
| A2 | 旧歌单 DOM（backdrop/topbar/tracklist/header/filter/error） | `MobileCollection.tsx:69-194` | `!native` 恒 false |
| A3 | 旧歌手 DOM | `MobileArtist.tsx:62-156` | 同上 |
| A4 | 旧搜索 DOM（header/landing/suggest/results） | `SearchWorkspace.tsx:246-428` | 同上 |
| A5 | 迷你条 DOM 主体 + `MiniPlayerProgress` + `useMiniPlayerSwipe` | `MobileMiniPlayer.tsx:75-112` | `!compose` 恒 false；原生已含滑切/进度环/睡眠 |
| A6 | 底栏 4 键 DOM + `TingyuNavIcon`（若仅 Android） | `MobileLibraryStage.tsx:73-105` | 原生含滑动切 tab |
| A7 | 舞台传输条 DOM | `MobileStageChrome.tsx:178-247` | 原生 `ChromeStagePlayer.kt` |
| A8 | `useNativeGlassNav` 的 `!COMPOSE_CHROME` 分支 | `MobileLibraryStage.tsx:43,50` | Android 恒不启用 |
| A9 | 桌面版设置动画/布局分支 | `SettingsModal.tsx:1417,1436,1470-1505` | Android 不走 |

**清理时必须保留同文件的容器与 hook 调用**（见清单 C），否则原生页失去 ref/几何/路由语义。

---

## 3. 清单 B —— 暂不能清理（有真实依赖或功能缺口）

| # | 内容 | 原因 |
|---|---|---|
| B1 | 上述 A1-A7 的 DOM（若保留 Web 平台） | 桌面 `NATIVE_FIRST=false` 时是唯一实现 |
| B2 | `MinimalStage.tsx` + `minimal-stage/*` | 极简页握手失败/弹层/顺访的真实回退，且提供 `data-under-stage` 视觉 |
| B3 | `MobileCollectionMenu.tsx` | 加歌单、新建歌单、匹配歌曲、移出歌单、打开专辑/歌手 —— **原生零覆盖** |
| B4 | `MobileCollectionSourceActions.tsx` | 刷新/排序字段/方向/重命名/删除/重扫/导出/编辑信息/整理歌曲信息/每日推荐日期 —— **原生零覆盖（最大缺口）** |
| B5 | `MobileHomeSources.tsx`（来源切换/登录/退出/刷新文件夹/导入） | 首页胶囊"来源"动作的落点 |
| B6 | `MobileSheet.tsx` | 上述所有 sheet 的宿主 |
| B7 | `GridAccountSurface.tsx` + `account/*` | 二维码登录/切号轮询在 WebView 内 |
| B8 | 歌手页 `MobileSheet` 菜单（入队/刷新/编辑/打开专辑歌手） | 原生无等价 |
| B9 | `NativeHomeOverview.tsx:78-86` 的首页曲目/歌单菜单 | 同上 |
| B10 | `useNativePage.ts` 的重试/诊断路径 | 第二阶段接上真实 ack 语义前不能动 |

---

## 4. 清单 C —— 必须保留（删了会坏）

| # | 内容 | 为什么 |
|---|---|---|
| C1 | **`SettingsModal.tsx` 整棵 DOM**（含全部 subview） | `settings:document` 是逐元素测量（`services/nativeSettingsDocument.ts:21-60`）；删 DOM = 所有二级设置页/引导/诊断/背屏外观空白 |
| C2 | `MobileSettingsLanding.tsx:60-68` 的 DOM panel | 同上 |
| C3 | 三个 `data-native-live` 实时岛 | 设置页里唯一的真实像素预览（可视化操场/主题公园/歌词偏移） |
| C4 | `MobileStageChrome.tsx:109-175` 舞台顶栏 + 菜单 | Android 上仍是 DOM 绘制，无 Compose 等价物 |
| C5 | `App.tsx:2959-2971` + `VisualizerRenderer` 全家 | Folia 歌词/可视化舞台唯一渲染器（用户明确要求绝对保留） |
| C6 | `rearLyrics.tsx` + `components/rear/*` + `RearLyricsActivity/RearHostView` | 背屏第二 WebView，独立 bundle |
| C7 | 各页面**根容器**：`MobileHome.tsx:61`、`MobileCollection.tsx:59-68`、`MobileArtist.tsx:52-61`、`SearchWorkspace.tsx:227-245`、`MobileLibraryStage.tsx:61-72`、`MobileMiniPlayer.tsx:74`、`MobileStageChrome.tsx:100-108,177` | 提供 ref/dataset/几何，`useNativePage`/`useComposeChrome` 全部依赖 |
| C8 | `nativePages.css`、`composeChrome.css` | 缺了旧 DOM 会在原生层下面重新露出来（首帧/拒收/退场窗口） |
| C9 | `NativePageWidgets.kt` / `NativeRowsCache` | 全部原生页共用件 |
| C10 | `services/nativeSettingsDocument.ts` + `hooks/useNativeSettingsDocument.ts` + `chrome/NativeSettingsDocument*` | 设置二级页渲染链 |
| C11 | React 业务层：播放状态、音源、队列、`useNative*Page` 适配器、`nativeShellRouting`、`nativeChrome` | 数据与路由唯一来源 |

---

## 5. 关键风险（必须先解决再谈批量清理）

1. **零回退设计**：`mark()` 钉死 `ready=true` + DOM 不挂载 ⇒ `probe` 失败或持续拒收时**整屏空白**，没有 WebView 兜底。当前 SDK≥24 恒报 `pages=true`，属潜在风险而非现存故障。
2. **`probe` 与 `pages` 能力位不一致**：`useNativePagesAvailable` 用 `NATIVE_FIRST||value`，`useNativePage` 内部用 `canUseNativePages()`；任一侧失败的表现都是"静默空白"，不是可见错误。
3. **设置文档的时序依赖**：`settings:index`（active=false）与 `settings:document:*`（enabled=true）共用 page id，靠 48ms debounce + revision 决胜负，属时序保证，非结构保证。
4. **文档复刻契约脆弱**：任何依赖 `position:fixed`/`backdrop-filter`/`<canvas>` 的新设置组件会丢帧或错位；`paints` 上限 14000（`NativeSettingsDocumentModel.kt:21`）超限即抛错 → 该页永久空白。
5. **collection 二级菜单全部单向依赖 WebView**：`B3/B4` 是本次审计发现的最大功能缺口，清理前必须先在 Compose 侧补齐，或明确接受"保留 WebView sheet"。

---

## 6. 第二阶段执行方案（建议顺序）

按"收益/风险"排序，每步单独提交、单独真机验收：

1. **首页 + 资料库**（A1 + `MobileSourceDirectories` 死引用）
   - 保留 `<main>` 容器、`NativeHomePage` 适配器、`MobileSourceSheet`；
   - 验证：进入、滚动、hero 横滑、点卡进详情、返回、切来源、切 tab。
2. **歌单/专辑/歌手**（A2 + A3）
   - 保留 `motion.section` 容器、`useNativeCollectionPage/useNativeArtistPage`、所有 sheet；
   - 验证：进入歌单、播放全部、点行播放、⋯菜单（仍走 WebView）、排序、返回、歌手页切 tab。
3. **搜索**（A4）
   - 保留 `motion.section` 外壳、`useNativeSearchPage`、`loadSearchDiscovery`；
   - 验证：唤起、输入法组合字、联想、切来源、历史、热搜展开、结果分页、返回。
4. **设置**（A9 仅动画分支）
   - 不动 DOM 主体（C1/C2）；
   - 验证：索引页、二级页、live 预览、键盘、返回、深链。
5. **chrome 三件套**（A5/A6/A7）
   - 最后做，收益最小、影响面最大；
   - 验证：切歌、滑动切歌、进度环、tab 切换滑动、舞台传输、后台恢复。

每阶段真机验收固定 8 项：**进入 / 返回 / 点击 / 搜索 / 滚动 / 播放 / 切换路由 / 后台恢复**。

---

## 7. 第四阶段防护设计（草案，待落地）

### 7.1 归属表（放 `AGENTS.md` 与本文同步）

形式：

```
页面            正式 UI 实现                        允许修改目录
推荐/资料库     Compose NativeHomePage.kt          android/.../chrome/ + native/NativeHomeOverview.tsx(仅模型)
歌单            Compose NativePlaylistPage.kt      + useNativeCollectionPage.ts(仅模型/动作)
搜索            Compose NativeSearchPage.kt        + useNativeSearchPage.ts
设置索引        Compose NativeSettingsPage.kt      + useNativeSettingsPage.ts
设置二级页      Compose NativeSettingsDocumentView + services/nativeSettingsDocument.ts(排版契约)
极简页          Compose MinimalPlayerScreen.kt     + minimal/ui/
舞台/歌词       WebView（白名单）                  src/components/visualizer + App.tsx 舞台段
背屏            WebView（白名单）                  rearLyrics.tsx + RearLyricsActivity
二级 sheet      WebView（白名单，待原生补齐后移出） MobileCollectionMenu/SourceActions/MobileSheet
```

### 7.2 构建检查（新增脚本，不阻塞开发热更新）

- 脚本扫 `src/**`，若 `NATIVE_FIRST` 门控下的 DOM 块被重新接入（例如把 `!nativeReady` 改成 `true`、或把 `native` 适配器返回值改为常量 false），直接失败并打印期望归属；
- 白名单文件清单化（`scripts/android-webview-allowlist.json`），新增 `MobileSheet` 之外的新 WebView 页面需显式加白并写明理由。

### 7.3 回归测试

- 已有 `test/unit/hooks/nativePage.test.ts`、`composeChrome.test.ts` 作为地基；
- 新增"归属回归"用例：断言各页面适配器在 `NATIVE_FIRST` 下返回值恒为 truthy、且对应 DOM 分支不被挂载（可用 React Testing Library 渲染断言 DOM 不存在）；
- 真机截图基线：首页/歌单/搜索/设置索引各一张，纳入现有截图测试体系。

---

## 8. 本次审计未覆盖

- 桌面/Electron 构建的页面清单（仅确认 `NATIVE_FIRST=false` 时 DOM 全量可达）；
- `GridAccountSurface` 的登录态与原生页的数据一致性（业务层，非渲染归属）；
- 背屏 WebView 与主 WebView 的共享状态边界。
