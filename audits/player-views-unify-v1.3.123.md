# 极简播放器与歌词舞台 · 交互统一（v1.3.123 / versionCode 146）

基线：`2022418`（v1.3.122 / 145）。本轮五件事：清掉自动 AI 主题提示、四种播放模式合成一个按钮、
舞台顶栏独立返回箭头、极简↔舞台双向淡化转场、歌词制作信息降权。不动播放内核、队列算法、
MediaSession、兼容通道、歌词时间基准、背屏/LSP、灵动岛、舞台特效与极简取色。

---

## 一、自动 AI 主题提示（任务一）

`少女祈祷中…`（`status.generatingTheme`）和 `已应用主题: X`（`status.themeApplied`）是**全局 toast**，
固定在屏幕顶部居中，正好压在第一行歌词上（截图一）。自动生成在切歌后 650ms 自己启动，于是这两条
会在听歌中间弹出来。

**改法**：`useThemeController` 里所有主题提示改走一个 `notifyTheme(quiet, message, detail)`，
`quiet = source !== 'manual'`。四条分支：

| 场景 | 之前 | 现在 |
| --- | --- | --- |
| 自动生成中 / 自动应用 | 两条 toast | 不画，`console.info` 一行 |
| 自动生成失败（网络等） | error toast | 不画，`console.warn`，诊断环里照记 |
| 手动点击生成 | 两条 toast | 保留（等结果的人才需要） |
| 手动失败 | error toast | 保留 |
| 封面取色回退（无 API Key） | info toast | 自动时静默，手动时保留 |

生成、缓存、同步、应用本身**一步没动**：`saveToCache`、`saveSyncedThemeForSong`、
`recordAiThemeAttempt/Skip`（诊断导出）照旧。手动保存自定义主题、应用主题、开关偏好等提示全部保留。
通知系统本身没动。

**页面切换不重放遗留提示**：自动提示本来就不画了；手动提示是 3 秒自动消失、挂在 `document.body`
的 portal 上，不随视图切换重挂。

测试：`test/unit/theme/themeNoticeQuiet.test.ts`，6 条，驱动真实 hook（mock AI/缓存/同步 IO），
断言的是状态通道而不是文案：自动全程 `message === null` 但缓存已写、已同步、已应用；自动失败静默且
主题不变；手动生成中/完成/失败各有提示；封面取色自动路径静默。

## 二、四种播放模式合成一个按钮（任务二）

极简页原来是**随机 + 循环**两个按钮：两个控件回答同一个问题，可以同时亮，而且都不显示当前到底是什么
模式。舞台那边是单按钮，但标签走的是 `handleToggleLoopMode` 的三态循环，永远到不了随机。

**`src/utils/playbackMode.ts`** 是唯一映射：

| 模式 | shuffle | loop | 行为 |
| --- | --- | --- | --- |
| `order` 顺序播放 | false | off | 播完停止 |
| `all` 列表循环 | false | all | 播完回到第一首 |
| `one` 单曲循环 | false | one | 当前歌曲循环 |
| `shuffle` 随机播放 | **true** | **all** | 随机顺序，一轮接一轮 |

循环顺序 `order → all → one → shuffle → order`，正是规格要求的顺序。`shuffle` 恒配 `loop: 'all'`：
随机一轮到尾就停不是"随机播放"的意思，也是这两半唯一不允许漂移的地方。

store 侧新增 `handleSetPlaybackMode(mode)`，一次写两个值；`handleSetLoopMode` / `handleSetShuffleEnabled`
保留原签名（ Folium 宿主、命令面板、快捷键都还在调），内部都落到同一个映射；`handleToggleLoopMode`
现在是同一个四步循环——**桌面悬浮栏和遥控器也因此不再跳过随机**。

两个视图读的是**同一个模型字段**（`controls.shuffleEnabled / loopMode / onToggleLoop`），不再各读各的
store，所以图标和状态不可能不一致。`useAppOverlaysModel` 对 mobile 套件本来就是四态循环，现在两边的
来源也统一了。Media3、兼容通道、会话恢复不碰——它们读同一对值，只是这对值现在只有一个写入口。

**反馈**：store 不再为换模式弹全局 toast（`audioSettingsSetters` / `foliumHostActions` 两条测试改为
断言无 toast）。舞台保留按钮下方常驻的模式名（`顺序播放/列表循环/单曲循环/随机播放`）；极简页按钮
是图标（`Repeat` / `Repeat1` / `Shuffle`，顺序播放是同一图标但不点亮），换模式后在按钮上方弹一个
11px 小胶囊 1.5 秒——在进度条和时间那一行，不碰歌词。队列入口占了原循环按钮的位置，走的是舞台同款
`setPanelTab('queue') + setIsPanelOpen(true)`，不重做队列 UI。

## 三、舞台顶栏返回入口（任务三）

原来下拉箭头叠在专辑缩略图上：同一块 48px 既回答"返回"又回答"这是封面"，封面显示不完整。
现在顶栏是**箭头 44×48 / 封面 48 / 歌名歌手** 三件分开的东西，箭头样式与极简页一致（23px
`ChevronDown`、stroke 1.8），触摸区 44dp。

返回行为**本来就分得清**（`leavePlayer` / `navigateBackInApp` 都先看 `detour`）：顺访回极简歌词页，
默认舞台收起播放器——本轮只改视觉，不动这条链。顶栏 top 从 `env(safe-area-inset-top)`（在本 App 恒为 0，
小米长屏上会顶进状态栏）换成原生实测的 `--folia-main-inset-top`，与极简页同一个来源。

## 四、极简 ↔ 舞台双向转场（任务四）

**根因**：从舞台返回时 `MinimalStage` 重新挂载，`phase` 初始为 `enter` → `min-rise`（420ms 从
`translateY(100%)` 升上来）。这个动画是给"迷你播放条 → 播放页"设计的——那两个面的关系确实是上下；
用在两个全屏播放视图之间，就成了截图里"从屏幕下方冲上来"。

三种切换现在明确分开：

| 切换 | 动画 |
| --- | --- |
| 迷你播放条 → 极简播放页 | 保留原有自下而上展开 / 收起（未动） |
| 极简封面 ↔ 极简歌词 | 保留原有跟手水平滑动（未动） |
| 极简歌词 ↔ 完整舞台 | **双向溶解 + 0.6% 缩放，300ms，无位移** |

**机制**：视图模式 store 加一个 `stageTransition: 'idle' | 'to-stage' | 'to-minimal'`，由已有的
`openStage()/closeStage()` 设置（`detour` 机制原样复用，没有新的全局导航状态）。运行期间**两层同时
挂载**：出去的一层让进来的有东西可以溶解，进来的一层在出去的消失前已经画好——视觉上是"盖上"，不是
"交叉到黑"（两层各 50% 叠在黑底上会明显变暗）。App 里 `shouldMountVisualizer` 与 `ownsStageChrome`
用同一个标志把 visualizer 和舞台 chrome 多挂 400ms（动画 300ms），结束后照常卸载，非活动层的动画
和渲染随之停止。

两个细节：

- 页面**等两帧**才开始淡出——舞台 canvas 必须先画过至少一帧，否则极简页会溶解到 WebView 上一帧的
  内容（冷启动时是 App 背景，看起来像闪一下）。两帧是对"已提交 + 已绘制"的观察，不是拍脑袋的延时。
- **原生 Compose 控制栏参加不了 CSS 淡化**（它的 alpha 由原生宿主持有，JS 侧固定发 1）。所以它的
  出现在边界上而不是动画中间：进舞台时等舞台已经上屏再出现，回极简时随舞台卸载而消失。屏幕已经
  换好之后再切换一个小控制栏，比在半透明画面中间切要轻得多。

**快速连点**：转场进行中再点，同方向忽略、反方向**反转同一次过渡**，不会叠两次动画，也不会挂出两个
层（`openStage` 在已 detour 时直接返回，`closeStage` 在未 detour 时直接返回）。

测试：`dev/probes/verifyStageTransition.mjs`，29 条，驱动真实组件 + 真实 store，新 harness
`dev/playerTransitionPreview.tsx`。断言包括：过渡中两层同时挂载；**计算出的 matrix 里 e/f 平移分量为
0**（"没有从底部冲上来"的证据，不是感觉）；进入/返回用的是 `fade` 相位而不是 `enter`；返回落在离开时
的歌词页（pos=1）；连点后每层各只剩一个、停在正确页面；顺访与默认舞台的返回走不同分支；舞台顶栏
避开状态栏、箭头 44×48、不压封面、封面不再是按钮；队列入口打开既有面板。

## 五、歌词制作信息（任务五）

LRC 头部经常把 制作名单 当作普通计时歌词：`红玫瑰 - 陈奕迅 (Eason Chan)`、`词：李焯雄`、`曲：梁翘柏`、
`编曲：梁翘柏`，在极简页按 20/30px 的演唱字号渲染，四行就把第一屏占满。

`isProductionCreditLine(line, index)`（`minimalLyrics.ts`）识别它们，规则刻意收窄，因为**误伤一句真歌词
比漏掉一条制作名单严重**：

- ≤ 24 字符（一条 crowded 的名单也到不了 20）；
- 命中已知制作标签且后面跟分隔符（先剥掉 `（【[` 前缀，`】」』）)` 也算分隔符；裸空格只对中文标签和
  `... by` 类标签开放——`guitar solo` 是歌词，`Produced by Someone` 是名单）；
- 不以歌词标点结尾（`，。！？…、` 等——制作名单以人名结尾）；
- `歌名 - 歌手` 的破折号形式**只认第一行**。

它们保留原时间戳、原位置、原 Seek 行为，**一行不删、一字不改、不重排**；舞台的原始渲染完全不动。
变的只有绘制权重：12.5px、更弱的颜色、激活时不放大到 30px、已唱高亮按比例调暗。

测试：`test/unit/minimalCredits.test.ts` 8 条，多数是反例：`作词家一样的夜晚`、`吉他上还有你的味道`、
`鼓声一点点消失`、`你是我的制作人。`、非首行的 `红玫瑰 - 陈奕迅`、超长行、歌词标点结尾、行对象未被改动。

## 六、改动文件

| 任务 | 文件 |
| --- | --- |
| 一 | `src/hooks/useThemeController.ts`、`test/unit/theme/themeNoticeQuiet.test.ts` |
| 二 | `src/utils/playbackMode.ts`、`src/stores/useAudioSettingsStore.ts`、`MinimalTransport.tsx`、`minimalStage.css`、`MobileStageChrome.tsx`、`audioSettingsSetters.test.ts`、`foliumHostActions.test.ts` |
| 三 | `MobileStageChrome.tsx`、`mobileStageChrome.css` |
| 四 | `usePlayerViewModeStore.ts`、`AppOverlays.tsx`、`App.tsx`、`MinimalStage.tsx`、`minimalStage.css`、`MobileStageChrome.tsx`、`mobileStageChrome.css`、`dev/playerTransitionPreview.tsx`、`player-transition-preview.html`、`dev/probes/verifyStageTransition.mjs`、`recordStageTransition.mjs` |
| 五 | `minimalLyrics.ts`、`MinimalLyricsPage.tsx`、`minimalStage.css`、`test/unit/minimalCredits.test.ts` |

提交：`2a8c944`（一）、`18db5ee`（三）、`f7731e7`（二）、`e6755bb`（四）、`8d20faa`（五）、`c3dc3b0`（二·测试契约）。

## 七、测试结果

| 项目 | 结果 |
| --- | --- |
| 全量单测 `test/unit` | 7038 通过 / 12 失败，失败与基线同一批 7 个文件（commandRegistry、commandRegistryContract、customShortcut、layerBoundaries、mobilePlaylistDetail、videoLayerPersistence、configSurfaceContract） |
| 极简页浏览器检查 `verifyMinimal.mjs` | 35/35 |
| 转场/队列/顶栏检查 `verifyStageTransition.mjs` | 29/29（新增） |
| 主题提示 `themeNoticeQuiet` | 6/6（新增） |
| 播放模式 `audioSettingsSetters` | 11/11（重写） |
| 制作信息 `minimalCredits` | 8/8（新增） |
| 类型检查 | 通过 |
| 模拟器测试 | **未执行**（本机无 Android 模拟器镜像） |
| 真机测试 | **未执行**（本机无设备） |

## 八、未验证 / 残余风险

- **真机**：Media3 循环/随机同步、后台续播、锁屏恢复、背屏与 LSP、灵动岛、Compose 图层顺序、
  真实安全区数值、手势手感、功耗、切歌中进出舞台，均未在设备上验证。转场与顶栏的所有证据来自
  Chromium harness（注入 40/24 安全区）。
- **原生控制栏的切换**：进舞台时它比 WebView 晚 ~300ms 出现，回极简时随舞台卸载消失。两次都是
  一个小控制栏的整体出现/消失，不是淡入淡出。若真机上这仍显突兀，需要原生侧支持 `alpha` 随
  `ChromeFrame.alpha` 渐变（字段已存在，`ComposeChromeHost` 已在 `graphicsLayer` 里读它，JS 侧
  `useComposeChrome` 目前在原生接管分支固定发 1）。
- **会话恢复**：`useSessionRestoreController` 直接 `setState` 写入 Media3 存下来的那对值，理论上可以
  还原出 shuffle + one 的组合。那是原生会话自己的事实，本口径不重写恢复逻辑；UI 上 `resolvePlaybackMode`
  先看 shuffle，显示仍然一致。
- **极简页队列按钮**：打开的是既有 `PlayerPanel` 的队列页。真实面板在播放页的弹出动画未在真机核对。
- **制作信息识别**：规则偏保守，宁可漏判。若真机上仍见大号制作名单，把那行原文给我，加进标签表即可。

## 九、产物

| | |
| --- | --- |
| APK | `Tingyu-Android-v1.3.123-release.apk`，51,552,199 B |
| versionCode | **146**（versionName 1.3.123） |
| 签名 | 官方发布密钥，证书 SHA-256 `a36ef2a5…02249d`，可直接覆盖 1.3.122 保数据 |
| SHA-256 | `fcaeb1e8b575c9580c69ecb7728f5b0a1d80bc0323cb20ffd0ec5f9396347e02` |
