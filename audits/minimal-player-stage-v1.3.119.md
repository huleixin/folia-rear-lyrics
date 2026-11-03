# 听屿极简播放模式（封面页 + 歌词页）1.3.119 交付说明

分支基准：`origin/main` @ `83b6c4b`（`v1.3.118`，`versionCode 141`）。
本版：`versionName 1.3.119`，`versionCode 142`，包名 `io.github.huleixin.tingyu` 不变。

---

## 一、源码审计结论（先看清真实路径，再动手）

审计入口里列出的 `src/components/app/PlayerPanel.tsx`、`UnifiedPanel.tsx` 都不是 Android 播放页本体：

| 入口 | 实际职责 |
| --- | --- |
| `components/app/PlayerPanel.tsx` → `UnifiedPanel.tsx` → `mobile-player/MobilePlayerSheet.tsx` | 面板内「歌曲 / 歌词工具 / 队列」抽屉，与全屏播放页无关 |
| `hooks/useAndroidMobilePlayerStage.ts` | 只回答 `android + mobile suite + view==='player'` 这个布尔 |
| `chrome/ChromeStagePlayer.kt` / `ComposeChromeHost.kt` | Compose 侧只画**播放控制条**（loop/prev/play/next/queue + seek），位置由 JS 上报的 DOM 矩形决定；它不是播放页主体 |
| `components/app/overlays/mobile-stage/MobileStageChrome.tsx` | 播放页的 DOM 顶栏 + 底部控制，通过 `useComposeChrome(...,'stage')` 把控制条交给 Compose 画 |
| `VisualizerRenderer`（`src/components/visualizer/`） | **播放页真正的视觉主体**：歌词舞台、封面舞台、背景，全部由它渲染 |

也就是说 Android 播放页是：WebView 全窗口渲染 visualizer + Compose 在 WebView 之上叠一条原生控制条。
`view === 'player'` 在原生侧对应 route `stage`，`AppOverlays` 在 `suite==='mobile' && view==='player'` 时挂 `MobileStageChrome`。

由此确定三条不可动的边界：

1. **播放页本体在 WebView/React 里**，用 Compose 重写歌词页等于重写舞台，明确禁止。
2. **底部控制条在 Android 上由 Compose 画**，它的顺序与样式是固定的（loop、prev/play/next、queue + seek），无法呈现参考图里「播放条在下、五个图标一行」的版式。极简模式必须让 Compose 那条控制条**退场**，由极简页自己画，否则版式不可能对上。
3. 极简页与歌词舞台**不能同时挂载**：两个都画底部控制，会出现双控制条。

---

## 二、实现方式

### 2.1 挂载点

极简页挂在与 `MobileStageChrome` 同一层（`AppOverlays`），并让 visualizer **卸载**：

```
App.tsx
  shouldMountVisualizer = mainStageActive && !minimalStageActive && (...)

AppOverlays.tsx
  ownsMinimalStage  → <MinimalStage/>
  ownsStageChrome   → <MobileStageChrome/>   // 极简时不再挂载
```

visualizer 卸载是这一模式省电的主要来源：不是隐藏 canvas，而是让它的 GPU 场景、着色器与逐帧通道彻底不存在。播放内核、Media3、歌词解析、MediaSession、背屏/LSP 一条都没动。

### 2.2 两页一套状态

`MinimalStage` 是唯一的状态所有者：

- 顶部栏（收起 / 收藏 / 更多 或 歌词舞台入口）
- 横向 pager（封面页、歌词页）
- 共用底部传输（进度 + 时间 + 随机/上一首/播放/下一首/循环）
- 分页圆点

两页之间切换只改 pager 的滚动位置，不重建任何组件，所以播放、歌词进度、背景颜色、进度条全部连续。

**分页用 CSS scroll-snap，不用手势处理器。** 浏览器负责轴锁定，这是「竖向歌词滚动不吃掉横向翻页、进度条拖动不吃掉两者」的根本保证；滑动过程零 JS 逐帧工作。

### 2.3 播放命令全部复用

| 能力 | 来源 |
| --- | --- |
| seek / play / prev / next / 可用性 | `floatingControls`（与 `MobileStageChrome` 完全同一个对象） |
| 进度时钟 | `controls.currentTime`（`motionSignals` 里的同一个 MotionValue） |
| 进度条 | 复用 `components/ProgressBar.tsx`，仅用其公开的 `data-folium-part` 钩子改版式 |
| 随机 / 循环 | `useAudioSettingsStore.handleSetShuffleEnabled / handleToggleLoopMode`（全应用同一处命令） |
| 收藏 | `controls.slotContext` |
| 队列 | 舞台「更多」菜单新增一项，与原有入口同一目的地 |
| 歌词 | `usePlaybackStore().lyrics` + `lyricCurrentTime`（已含用户时间偏移） |

没有第二个播放器、第二条时间线、第二个队列。

### 2.4 逐字高亮

`buildLineGraphemeTimeline`（舞台现用的同一函数）给出每个字的起止时间。极简页只做两件事：

- 当前行索引：`lyricCurrentTime` 变化时二分查找，**只在换行时 setState**；
- 已唱字数：变化时直接改对应 `<span data-ch>` 的属性，**不触发 React 渲染、不新建计时器**。

当前行已唱字为薄荷绿（`--min-accent`），未唱字为高对比白；非当前行整体低对比。没有绿色圆角遮罩、没有扫光、没有跳字。

### 2.5 背景

- 只在 `coverUrl` 变化时采样一次封面（28×28 离屏 canvas，缓存 12 条）。
- 从直方图取主色、次主色、点缀色，**外加整图均值**——均值才是环境光，取「最饱和色」会得到一圈霓虹。饱和度和亮度分主题夹紧，色相向听屿墨绿（168°）拉 42–72%。
- 五层纯渐变：底面洗色、两片色场、封面后方光晕、上下渐隐。**没有 canvas / Shader / backdrop-filter / blur 滤镜**，动画只动 `transform` 与 `opacity`（合成器层），周期 54s / 63s / 37s。
- 暂停、页面不可见时 `animation-play-state: paused`；系统「减少动态效果」或应用内降级时完全静止（静态渐变即回退方案）。

---

## 三、修改文件清单

新增：

```
src/stores/usePlayerViewModeStore.ts                     播放页样式偏好 + 极简页记忆 + 舞台「顺访」状态
src/components/app/overlays/minimal-stage/
    MinimalStage.tsx                                     外壳：顶栏、pager、分页点、共享传输
    MinimalCoverPage.tsx                                 封面页
    MinimalLyricsPage.tsx                                歌词页（含逐字高亮、手动滚动、点击跳转）
    MinimalArtwork.tsx                                   1:1 封面，双层交叉淡入（不白屏）
    MinimalAmbience.tsx                                  氛围背景层
    MinimalTransport.tsx                                 进度 + 五个控制
    minimalPalette.ts                                    取色与颜色约束（纯函数）
    minimalLyrics.ts                                     行索引 / 已唱字数 / 译文（纯函数）
    minimalQuality.ts                                    音质标签（容器 + 平台规格）
    useCoverPalette.ts                                   封面采样与缓存
    minimalStage.css                                     全部样式
dev/minimalStagePreview.tsx                              本地预览壳（真组件 + 真 store + 模拟播放）
dev/probes/shootMinimal.mjs / verifyMinimal.mjs           截图与行为验证脚本
minimal-stage-preview.html                               预览入口
test/unit/minimalStage.test.ts                           21 项单元测试
```

修改：

```
src/App.tsx                         读取视图偏好；极简时卸载 visualizer；返回键区分「顺访」
src/components/app/overlays/AppOverlays.tsx   挂载极简页并让舞台 chrome 退场
src/hooks/useAppNavigation.ts        返回手势：舞台顺访时回极简页而不是回首页
src/components/app/overlays/mobile-stage/MobileStageMenu.tsx   新增「队列」项
src/components/modal/settings/MobilePlayerDisplaySetting.tsx   新增「播放页样式」分段选择
src/i18n/locales/{zh-CN,en,in}.ts    minimalStage 文案
test/unit/settings/androidSettingsCleanup.test.ts   菜单项 4 → 5，并新增队列项用例
test/unit/stores/__snapshots__/storeContract.test.ts.snap   新增 localStorage 键
package.json / package-lock.json     1.3.119 / versionCode 142
```

**未修改**：`VisualizerRenderer` 及全部舞台模式、`ChromeStagePlayer.kt`、`ComposeChromeHost.kt`、背屏/LSP/AOD、Media3 播放与缓存、歌词解析与时钟、`ProgressBar.tsx` 本体。

---

## 四、视觉还原

参考图两张手机分别为 393×852 与 360×780 下渲染；截图取自 dev 预览（真实组件、真实 store、真实 CSS），基线数值对照参考图比例：

| 项 | 参考图 | 实现 |
| --- | --- | --- |
| 封面宽度 / 页面宽 | 75% | 75%（上限 322px） |
| 封面圆角 | 约 9% 封边 | `clamp(18px, 7%, 30px)` |
| 封面 1:1 | 是 | 是（`aspect-ratio` + `object-fit: cover`，不拉伸） |
| 当前歌词行位置 | 47.5% 页高 | 46.5% |
| 进度条位置 | 81% 页高 | 81% |
| 控制条位置 | 87.5% 页高 | 87.8% |
| 分页点 | 97.8% 页高 | 94–97% |
| 当前行字号 / 非当前行 | ≈ 1.42× | 27 / 19 px |
| 已唱色 | 薄荷绿 | `--min-accent`（受约束的封面点缀色，拉向墨绿） |

刻意不做的：金色流光、霓虹发光、大面积玻璃按钮、绿色方块遮罩、示例数据。

---

## 五、性能与功耗

| 措施 | 实现 |
| --- | --- |
| 不跑 visualizer | 极简时 `VisualizerRenderer` 卸载 |
| 背景零逐帧 JS | 全部 CSS 渐变 + 合成器动画 |
| 无滤镜 | 全文件无 `blur()` / `backdrop-filter` |
| 取色只在换封面时 | `useEffect([coverUrl])` + 有界缓存 |
| 暂停即停 | `data-paused` → `animation-play-state: paused` |
| 不可见即停 | `visibilitychange` 参与同一开关 |
| 尊重减少动效 | `prefers-reduced-motion` 与 `[data-reduce-motion~="monetBackground"]` |
| 歌词高亮不重渲染 | 当前行索引才 setState；字数变化只改 DOM 属性 |
| 隐藏页不工作 | 歌词页只在 `active` 时订阅时钟；离屏页 `inert` |

未做：真机功耗实测（无设备）。以上均为结构与代码层面的降功耗，不代表已测得的毫安数。

---

## 六、测试

### 已执行

- `npm run typecheck`：通过。
- `npx vitest run test/unit/minimalStage.test.ts`：**21 项通过**（取色约束、行索引、已唱字数、译文模式、音质标签、视图记忆与顺访语义）。
- 全量单测：`715 文件 / 7030 用例`，其中 **14 项失败**。逐项归因见下节。
- `node dev/probes/verifyMinimal.mjs`（Chromium 393×852，真实 CDP 触摸）：**13/13 通过**
  - 封面页首屏恢复
  - 右滑进入歌词页（可信触摸序列，`scrollLeft 0 → 393`）
  - 点击歌词行 seek（`seeks=[9]`）
  - 竖向滑动只滚歌词、不翻页
  - 左滑回封面
  - 右上角进入原歌词舞台（`detour=true`，`mode` 仍为 `minimal`）
  - 离开舞台回到极简歌词页
  - 暂停时背景动画 `paused`，播放时为 `running`（`min-drift-a`，54s）
  - 360px / 393px、深浅色：无横向溢出、封面严格 1:1
  - 无未捕获错误

### 失败项归因

在**未改动的干净检出**上重跑同样 7 个文件，同样 13 项失败（`commandRegistry`、`customShortcut`、`layerBoundaries`×2、`mobilePlaylistDetail`×5、`videoLayerPersistence`、`configSurfaceContract` 快照）。这些与本改动无关，是基线既有问题：

| 文件 | 现象 |
| --- | --- |
| `command-palette/commandRegistry.test.ts` | 面板命令 `playback-equalizer` 断言过期 |
| `command-palette/customShortcut.test.ts` | 同上 |
| `library/layerBoundaries.test.ts` | `SearchResultRow` 直连 `MobileSheet` 等越层导入 |
| `library/mobilePlaylistDetail.test.ts` | jsdom 无 `window.matchMedia` |
| `services/videoLayerPersistence.test.ts` | 视频层本地文件用例 |
| `stores/configSurfaceContract.test.ts` | 快照缺 `rearStageAppearance`（早于此改动的漂移） |

本改动引入的唯一新增失败是 `androidSettingsCleanup`（舞台菜单 4 → 5 项），已更新为 5 并补了一条「队列项打开队列」的用例。`storeContract` 快照已更新（含本版两个键，同时吸收了既有漂移 `tingyu_lx_sources_v1`）。

### 未执行（不得视为通过）

- **真机**：无设备、无模拟器镜像。以下全部未验证：Media3 播放、锁屏/后台、背屏与 LSP 同步、灵动岛、Compose 控制条退场后的原生层级、真实系统栏内边距、滑动手感与帧率、实际功耗。
- 50 首连续播放回归、内核自动回退的显示一致性、Activity 重建、在线/本地混合曲库。
- 舞台横竖屏切换。

预览截图用浏览器 393×852 模拟系统栏（上 50 / 下 24），它不是设备截图。

---

## 七、已知问题

1. **背景色偏**：当前氛围色比参考图偏暖、偏灰，参考图边缘的青绿更饱和。受限于「只从封面取色 + 强约束亮度」，同一张夕阳封面很难同时得到参考图那种冷绿边缘；再压青会牺牲「封面取色」的真实性，故停在此处。
2. **界面语言为英文时译文行**：歌词页会显示 `line.translation`（跟随全应用字幕设置），参考图没有这一行；这是数据差异不是版式差异。
3. **顺访状态不持久**：从极简进入舞台属于临时访问，进程被杀后回到用户选择的视图，这是有意为之。
4. **`minimalStage.css` 使用了 `@property`**：Chromium 85+ 支持，缺失时颜色直接跳变（无过渡），不影响布局。
5. **状态栏区域**：`.min` 依赖 `env(safe-area-inset-top)`；系统栏图标颜色由既有 `InterfaceAppearance` 控制，本版未改动。
6. **默认值改了**：未设置过的用户默认进入极简播放页（`readStoredPlayerViewMode` 只有明确存过 `stage` 才回舞台）。这是一次产品决策——本次交付的主体就是这套界面；但它确实改变了老用户打开播放页时看到的东西。想改回「默认舞台、极简可选」，把 `usePlayerViewModeStore.ts` 里两处 `'minimal'` 默认值换成 `'stage'` 即可，其余逻辑不用动。
7. **作用域是「手机版资料库（mobile suite）」而不是「Android 平台」**：极简页挂在 `suite==='mobile' && view==='player'`，桌面端若切到手机版资料库同样会看到它。设置开关本身只在 Android 出现。若希望严格限定 Android，需要给 `minimalStageActive` 再加一层 `isAndroidNativeRuntime()`，代价是浏览器预览壳失效。

---

## 八、构建与签名

见 `BUILD-1.3.119.md`（构建命令、产物、SHA-256、签名状态）。

## 九、提交

已推送到 `main`：

| 提交 | 内容 | 链接 |
| --- | --- | --- |
| `4c8c8b9` | 视图偏好 store + 取色/歌词/音质纯函数 + 21 项单测 | https://github.com/huleixin/folia-rear-lyrics/commit/4c8c8b9 |
| `ed0f41a` | 极简封面页/歌词页、氛围背景、共享传输、舞台入口、设置项、接线 | https://github.com/huleixin/folia-rear-lyrics/commit/ed0f41a |
| `62be122` | 版本 1.3.119 / versionCode 142、预览与验证工具、本审计文档 | https://github.com/huleixin/folia-rear-lyrics/commit/62be122 |

基线为 `83b6c4b`（`v1.3.118`），本次未改写任何既有提交。
