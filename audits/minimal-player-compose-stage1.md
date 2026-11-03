# 极简播放器 Compose 原生化 · 第一阶段

基线：`main` @ `2b15585`（`1.3.131` / versionCode 154）。
本阶段只做**数据链路与控制接口**，不改舞台、不改背屏/LSP、不改播放内核、不重做极简页视觉。

---

## 一、审计：极简页现在是怎么跑起来的

先纠正一个容易搞错的入口。仓库里叫 “player” 的东西有四个，只有最后一个是播放页本体：

| 入口 | 实际职责 |
| --- | --- |
| `src/components/app/PlayerPanel.tsx` → `UnifiedPanel.tsx` → `mobile-player/MobilePlayerSheet.tsx` | 面板里的「歌曲 / 歌词工具 / 队列」抽屉，和全屏播放页无关 |
| `hooks/useAndroidMobilePlayerStage.ts` | 只回答「android + mobile suite + view==='player'」这个布尔 |
| `chrome/ChromeStagePlayer.kt` + `ComposeChromeHost.kt` | Compose 画的**底部控制条**（loop/prev/play/next/queue + seek），位置由 JS 上报的矩形决定 |
| `components/app/overlays/minimal-stage/*` | 极简页本体：WebView/React 渲染，`AppOverlays.tsx` 在 `suite==='mobile' && view==='player' && mode==='minimal'` 时挂载 |

极简页挂在 `AppOverlays`，同一时刻让 `VisualizerRenderer` 卸载（`App.tsx` 的 `shouldMountVisualizer`）——
省电来自「GPU 场景、着色器、逐帧通道彻底不存在」，而不是隐藏 canvas。

### 1.1 与极简页有关的六条通道

| 通道 | 代码 | 事实 |
| --- | --- | --- |
| 播放内核 A | `playback/NativeAudioEngine.java`（Media3 ExoPlayer） | 默认出声；`TINGYU_NATIVE_PLAYBACK` 可整体关闭 |
| 播放内核 B | `services/compatibleSleepOutput.ts` + `SleepTimerController.compatibility()` | 浏览器 `<audio>` 通道。EQ / 自动混音 / ReplayGain / 不支持的地址 / 解码失败都会落到这里 |
| 原生曲目权威 | `RearNativeTrack.java` | `songKey` / `epoch`（`songKey#generation`） / `generation` / 锚点位置 / `playing`。Media3 由引擎回调喂；兼容通道只有身份 |
| 位置外推 | `PlaybackPositionClock.java` | 锚点 + 单调时钟；媒体会话、背屏、后来的 Compose 页共用同一个公式 |
| 歌词权威 | `UnifiedLyricsStore` + `LyricTimelineAuthority` | 三端唯一版本（舞台 / 背屏 / 灵动岛） |
| 歌词行交付 | `RearNativeLyricLines` | LRC → `{startTime,endTime,fullText,words[],translation}` rows，**并在交付点烘焙用户偏移** |
| JS 歌词时钟 | `stores/motionSignals.ts` 的 `lyricCurrentTime` | rAF 每帧写；语义是 `position - offset/1000` |
| 控制条桥 | `TingyuChrome.update/clock/action` + `hooks/useComposeChrome.ts` | Compose 画条，JS 推数据与回动作 |

**两个歌词时钟的坐标不一样，这是本阶段最容易踩的坑：**

- 舞台侧 `lyrics` 是**未烘焙**的原始时间轴，所以它的时钟是 `lyricCurrentTime = position - offset/1000`；
- 背屏（以及本阶段的 Compose 页）读的是 `RearNativeLyricLines` 的 rows，**偏移已经在交付点烘焙过一次**，
  所以它必须和**原始位置**比较（`utils/rearLyricsClock.ts` 里把 `lyricOffsetMs` 置 0 就是这个原因）。

两条链各自只烘焙一次。任何一端「顺手再减一次偏移」，表现就是整首歌的歌词比声音早/晚一个偏移量。

---

## 二、缺陷分类：哪些是 WebView UI，哪些是底层同步

### 2.1 底层播放/歌词同步（影响迁移，已修）

**A1｜歌词时钟在一处分支上分叉（已修）**

`hooks/usePlaybackVisualizerBridge.ts` 的 rAF 循环有五条分支。其中「只有歌词、没有音频」的舞台会话
（`activePlaybackContext==='stage' && stageActiveEntryKind==='lyrics'`）只写了 `currentTime`，
没写 `lyricCurrentTime`：

```
currentTime.set(nextTime);          // 走了
lyricCurrentTime.set(nextTime);     // ← 缺这一行
```

现象：那条路径上舞台自己的行索引在走（它用 `nextTime` 直接算），而所有订阅 `lyricCurrentTime` 的
读端（极简歌词页、封面上的实时歌词）停在最后一个值上不动。这不是「极简页的 bug」，是**两条本该相同的时钟
在一条路径上分叉**——任何读端都会中招，包括迁移后的 Compose 页（如果它照搬这个时钟）。
修复：补上写入，循环重播时同步复位。共 2 处、4 行。

**A2｜进程内读者拿不到「语义变了」的通知（已补）**

- `RearHostUpdates.changed()` 只在**存在背屏会话**时通过 ContentProvider 通知外部页面；进程内的读者
  没有任何入口，只能自己轮询。
- 补：`RearHostUpdates.Listener`（`observe/unobserve`），`changed()` 里先通知进程内监听再走原路径；
  监听器实现只做「排一次重算」，不做重活。
- `UnifiedLyricsStore` 同理补 `Observer`，只在**接受**了一次写入后触发（被 `UnifiedLyricPolicy` 拒绝的写不触发）。

**A3｜歌词行结构没有给 Compose 的只读入口（已补）**

`RearNativeLyricLines` 原来只有 `json(context, songKey, epoch)` 给背屏页用。给 Compose 加
`rowsJson(context, songKey)` 与 `versionOf(context, songKey)`——**复用同一条取词/选版/烘焙链**，
不新增第二条。语义与背屏一致：`null` = 还在等，`state:none` = 确认无词，`state:ready` = 可渲染。

**A4｜兼容播放通道没有原生可读的位置（未修，改用桥锚点）**

`RearNativeTrack.onPlayback()` 第一行就是 `if (!"media3".equals(engine)) return;`，而
`compatiblePlayback` 消息不携带 `position`，且只在 play/pause/ended/换歌时发。也就是说：
**浏览器 `<audio>` 出声时，原生侧没有任何位置事实**。

本阶段没有给它新开一条通道，理由是两个候选方案都超出「只修迁移所依赖的底层问题」：

- 让兼容通道每秒上报位置 = 给同一个音频再加一条位置流；
- 让原生自己轮询 `<audio>` = 原生无法访问 WebView 的媒体元素。

采用的折中写在明处：Compose 页在该通道下以**桥锚点**为时钟（JS 每秒一帧，`controls.currentTime`，
也就是平台唯一的那个位置 MotionValue），并且**外推上限 4 s**——桥停了三帧以上，位置就冻结在最后已知处，
不假装还在走。代价是该通道下原生进度依赖 WebView 存活；Media3 通道不受影响。

### 2.2 WebView UI（本阶段不修）

| 现象 | 归因 | 处置 |
| --- | --- | --- |
| 氛围色偏暖偏灰 | `minimalPalette` 的取色约束结果 | 不属于数据链路；第二阶段做原生取色时一并处理 |
| 英文界面歌词页多一行译文 | 数据差异（跟随全应用字幕设置） | 不修 |
| `minimalStage.css` 用 `@property` | 旧 Chromium 上颜色直跳，不影响布局 | 不修 |
| 「顺访」状态不持久 | 有意为之 | 不修 |
| 默认进极简页 | 产品决策 | 不修 |
| 极简页作用域是 mobile suite 而非 Android | 已知 | 不修 |

### 2.3 明确没有动的东西

`VisualizerRenderer` 与全部舞台模式、`ChromeStagePlayer.kt`、LSP / Shizuku 背屏与 AOD、
Media3 播放与缓存、队列推进与自动混音、媒体会话、歌词解析与版本仲裁。

---

## 三、数据流

```
                         ┌──────────────────────── WebView / JS ────────────────────────┐
 Media3 引擎 ──► RearNativeTrack ─┐   (songKey / epoch / anchor / playing / duration)     │
 (NativeAudioEngine)             │                                                        │
                                 │        controls.currentTime   ← 平台唯一位置 MotionValue│
 浏览器 <audio> ──(兼容通道)──────┘        playerState / loopMode / trackNavigation       │
                                           store.lyrics（未烘焙，舞台用）                    │
                                            │                                            │
                                            └── 每秒一帧（session/trackKey/mode/canNext/…）│
                                                          │                              │
 UnifiedLyricsStore ──► LyricTimelineAuthority            │                              │
        │                （三端唯一版本）                   │                              │
        ▼                                                 │                              │
 RearNativeLyricLines.rows（已烘焙偏移的行结构）             │                              │
        │                                                 ▼                              │
        └────────────────► MinimalPlayerRuntime ◄─────────┘                              │
                            │  StateFlow<MinimalPlayerState>                            │
                            ├── MinimalPlayback（歌 + 锚点 + 通道来源 + epoch）           │
                            ├── MinimalLyrics（行 / 逐字 / 状态 / 版本）                  │
                            └── MinimalControls（模式 / canPrev / canNext / 绑定）        │
                                         │                                             │
                                         ▼                                             │
                              Compose 极简页（MinimalPlayerPage）                       │
                                         │                                             │
                                         │ action("minimal", session, action, value)    │
                                         ▼                                             │
                          TingyuChrome.action ──► dispatchMinimalAction ──► 既有命令 ────┘
```

一句话：**Compose 页是既有播放器与既有歌词交付点的一片投影**。它不持有播放器、队列、歌词解析或计时器。

### 3.1 五类接口（Compose 直接可用）

| 需求 | 类型 | 位置 |
| --- | --- | --- |
| 歌曲信息 | `MinimalTrack`（key/title/artist/album/artwork/durationMs） | `minimal/MinimalPlayback.kt` |
| 播放进度 | `MinimalPlayback.positionMsAt/positionSecAt/progressAt/lyricSecAt` | 同上 |
| 播放状态 | `MinimalPlayback.playing/source/epoch` + `MinimalControls` | 同上 / `minimal/MinimalPlayerRuntime.kt` |
| 歌词数据 | `MinimalLyrics` / `MinimalLyricLine` / `MinimalLyricWord` | `minimal/MinimalLyrics.kt` |
| 播放控制 | `MinimalPlayerCommands`（toggle/play/pause/prev/next/seek/cycleMode/openQueue/collapse） | `minimal/MinimalPlayerCommands.kt` |

入口：`MinimalPlayerRuntime.state: StateFlow<MinimalPlayerState>`（`minimal.start()` 之后自动跟随）。
界面用 `MinimalPlayerSurface(...)` 订阅，**不要在场景层订阅**——否则每秒一帧会让整个 Compose 场景重建。

### 3.2 时钟只有一条公式

`MinimalPlayback.positionMsAt(now)` 直接调 `PlaybackPositionClock.at(...)`，和媒体会话、背屏用的是同一个函数。
Compose 侧用 `withFrameNanos` 每帧读一次 `SystemClock.elapsedRealtime()` 再求值——**没有 Timer、没有 Handler 循环**；
暂停时不调度帧，页面自然静止。

### 3.3 命令只有一条总线

动作名与舞台控制条完全相同（`toggle/previous/next/loop/queue`），走 `TingyuChrome` 的 `action` 事件，
id 固定 `minimal`，其余三个 surface 的监听器按 id 过滤不会误收。

**为什么不直连 `NativeAudioEngine.mediaAction()`**：那会绕过 JS 侧的队列推进、自动混音、过渡淡入淡出和
「这一下暂停是用户按的还是系统抢焦点」的判定，等于给同一个传输意图造第二个主人。代价是 WebView 不在场时
命令发不出去——所以 `commands.available` 为 false 时按钮置灰，而不是发一个没人接的指令。

---

## 四、边界语义

| 场景 | 处理 | 代码 | 测试 |
| --- | --- | --- | --- |
| 切歌 | `epoch = songKey#generation`；歌词异步结果回来时比 `(songKey, epoch)`，不一致直接丢弃 | `Runtime.applyLyrics` | `MinimalLyricsTest.rowsForAnotherSongAreDiscarded` |
| 切歌（桥侧） | 同一 session 内 `trackKey` 变化即 `frameGeneration++`，旧 epoch 的歌词结果作废 | `Runtime.onBridgeFrame` | — |
| Seek（Media3） | 引擎 `onPositionDiscontinuity` 立即重锚 `RearNativeTrack`，位置不会沿用旧锚点 | `NativeAudioEngine.onPositionDiscontinuity` | 既有 `RearNativeTrack` 用例 |
| Seek（桥） | 动作执行后立刻补发一帧，不等 1 s 心跳 | `useNativeMinimalPlayer` | — |
| Seek（旧歌） | 页面显示的歌与已发布帧的歌不一致时丢弃，位置只对测量它的那首歌有意义 | `dispatchMinimalAction` | `nativeMinimalPlayer.test: drops a seek that arrives after the track changed` |
| 暂停 | `playing=false` 位置不外推；`withFrameNanos` 不再调度 | `MinimalPlayback` / `rememberMinimalClock` | `pausedPositionStaysWhereItPaused` |
| 后台恢复 | 引擎侧位置由单调时钟外推，不受挂起影响；宿主 `resume()` 重读一次歌词（后台到达的版本立刻反映） | `ComposeChromeHost.resume()` | — |
| 桥中断 | 位置 4 s 后冻结；20 s 后命令置灰；页面停在最后一首而不是清空 | `MinimalPlayback.maxExtrapolationMs` / `bridgeLive()` | `bridgeClockFreezesAfterItsCapInsteadOfInventingMotion` |
| 歌词尚未到达 | `LOADING` 不等于「无词」；有界重读交付点（1 s × 30 次，换歌即取消） | `Runtime.scheduleLyricRetry` | `missingPayloadIsLoadingNotNone` |
| 交接失败 | JS 只在原生 ack 之后才卸载 WebView 极简页；连续 3 次失败交还 | `useNativeMinimalPlayer` / `ComposeChromeHost.minimalFrame` | — |

### 4.1 交接（谁能画这一页）

```
JS: mode==='minimal' && view==='player' && 没有打开 JS 面板
  └─► 每 1 s 发一帧 minimalPlayerFrame(session, trackKey, mode, position, …)
        └─► 原生回 accepted = (COMPOSE_MINIMAL_PLAYER && 路由是 stage && 呈现是 minimal && 没有 webOverlay)
              ├─ true  → JS 卸载 WebView 极简页；原生 MinimalPlayerSurface 开始画
              └─ false → WebView 极简页保持挂载（什么都不变）

JS 需要 WebView 画自己的面板（队列）时：
  └─► minimalPlayerRelease(session) → 原生 bound=false，立刻停画 → WebView 极简页重新挂载
```

两侧都不会「自己先走一步」：原生只有在收到帧（`controls.bound`）之后才画，JS 只有在被 ack 之后才让出。
所以不会出现两块极简页叠在一起，也不会出现一块空白。`release` 按 session 校验，晚到的旧 release
拆不掉新会话。

---

## 五、回滚

`COMPOSE_MINIMAL_PLAYER` **默认关闭**：第一阶段没有真机验证（界面观感、交接衔接、兼容通道下的进度都还没在
设备上跑过），所以它和仓库里 `TINGYU_GLASS_LAB` / `GRAPHICS_DIAGNOSTICS` 一样，是一个显式打开的开关。

| 层 | 开关 | 效果 |
| --- | --- | --- |
| 构建期 | `TINGYU_COMPOSE_MINIMAL=true` 打开（缺省关闭） | `probe().minimalPlayer` 决定 JS 是否让出极简页；关闭时永远走 WebView 极简页 |
| 运行期 | `probe()` 失败 / 帧连续 3 次被拒 / 需要显示 JS 面板 | `useNativeMinimalPlayer` 返回 `owns=false`，WebView 极简页重新挂载 |

WebView 极简页本身**一行没改**，`minimalStage` 全套组件、样式、单测都保持原样。

要评估原生页，用 `TINGYU_COMPOSE_MINIMAL=true npm run build:android:debug`；把环境变量去掉即回到现状。

---

## 六、测试结果

### 已执行

| 项 | 命令 | 结果 |
| --- | --- | --- |
| Kotlin 编译 | `./gradlew :app:compileDebugKotlin` | 通过，0 警告 |
| Java 编译 | `./gradlew :app:compileDebugJavaWithJavac` | 通过 |
| Android 单测 | `./gradlew :app:testDebugUnitTest` | **142 文件 / 951 用例 / 0 失败**（新增 28 项） |
| 前端类型 | `npx tsc --noEmit` | 通过 |
| 前端单测（新增） | `npx vitest run test/unit/nativeMinimalPlayer.test.ts` | 6/6 通过 |
| 前端单测（全量） | `npx vitest run` | 732 文件 / 7130 用例，**12 失败**；见下 |

新增 Android 用例：

- `MinimalLyricsTest`（13）：rows 解析、行索引边界、逐字进度、无词/等词、旧歌丢弃、坏时间钳制、版本透传；
- `MinimalPlaybackTest`（10）：播放/暂停外推、钟不倒退、时长钳制、无通道、桥上限冻结、歌词时钟=原始位置；
- `MinimalBridgeFrameTest`（5）：字段解析、未知模式回落、非法时间钳制、缺 session、文本截断。

新增前端用例：`nativeMinimalPlayer.test.ts`（6）——命令路由、不盲目反转、同曲 seek 生效、旧曲 seek 丢弃、
非法 seek、未知动作。

### 失败项归因

`npx vitest run` 的 12 项失败分布在 6 个文件（`commandRegistry`×2、`customShortcut`×1、
`layerBoundaries`×2、`mobilePlaylistDetail`×5、`videoLayerPersistence`×1、`configSurfaceContract`×1）。
在**干净检出**（`git stash -u`）上重跑这 6 个文件，同样是 12 项失败：

```
Test Files  6 failed (6)
     Tests  12 failed | 95 passed (107)
```

即基线既有问题，与本改动无关（`configSurfaceContract` 的快照缺 `rearStageAppearance` 是早于此改动的漂移）。

### 未执行（不得视为通过）

- **真机**：无设备、无模拟器镜像。以下全部未验证：Compose 页在真机上的观感与帧率、Media3/兼容通道下的
  实际进度、EQ 与自动混音开启时的表现、交接时的视觉衔接、系统栏内边距、Activity 重建、后台长时间驻留。
- 滑动/翻页、氛围取色、歌词滚动跟随——本阶段没有实现。
- 构建环境说明：本机只有 JDK 17，而工程 `jvmTarget=21`；验证时临时安装 JDK 21 后编译，
  仓库配置未改动。

---

## 七、已知限制（第二阶段的输入）

1. **这一版是数据验证面，不是最终视觉。** 只有封面、歌名、三行歌词窗口、进度条、五个按钮；
   没有翻页、没有氛围背景取色、没有滚动跟随、没有逐字高亮动画（只有行内进度线）。
2. **WebView 仍然在跑。** 省掉的是极简页那一层 DOM/CSS 与逐帧属性写入；WebView 进程、React 树、
   播放桥都还在。真正的卸载要在第二阶段把「极简模式」从 React 路由里摘出去。
3. **兼容通道的位置依赖桥。** 见 A4。
4. **首次交接最多晚 1 s**：要等原生 shell 路由提交到 stage 并回 ack。
5. **歌词重读是有界轮询**（1 s × 30）。这是交付层的可用性重试，不是播放时钟；换歌立即取消。
6. 极简页的「更多/收藏/歌词舞台入口」三个动作没有接进 Compose——它们需要先有原生设置面，
   属于第二阶段。
7. **队列按钮会让界面交还一次**：队列面板还在 WebView 里，而原生页是整窗图层，两者不能叠。
   点队列 → 交还 → WebView 极简页 + 面板；关面板 → 重新交给原生。会看到一次极简页重建。
   第二阶段把队列面板也原生化后这条限制消失。

---

## 八、文件清单

新增（Kotlin，`android/app/src/main/java/io/github/huleixin/tingyu/`）：

```
minimal/MinimalPlayback.kt           播放投影 + 位置外推（纯逻辑）
minimal/MinimalLyrics.kt             rows → 不可变歌词 + 行/逐字查询（纯逻辑）
minimal/MinimalPlayerRuntime.kt      唯一数据源：读 RearNativeTrack / rows / 桥帧，StateFlow 输出
minimal/MinimalPlayerCommands.kt     命令接口 + 动作总线实现
chrome/MinimalPlayerPage.kt          Compose 极简页（第一阶段数据验证面）
```

新增（前端）：

```
src/services/nativeMinimalPlayer.ts   桥帧发布 / 会话 / 动作分发（纯函数可测）
src/hooks/useNativeMinimalPlayer.ts    交接握手、每秒帧、后台暂停、失败交还
```

修改：

```
PlaybackPositionClock.java       仅可见性（public），供投影复用同一条外推公式
RearHostUpdates.java             增加进程内 Listener
RearNativeLyricLines.java        增加 rowsJson / versionOf（只读入口，复用同一条链）
UnifiedLyricsStore.java          增加 Observer（仅在接受写入后触发）
chrome/ComposeChromeHost.kt      运行时装配、minimalFrame、bound 订阅、画页与退场
chrome/TingyuChromePlugin.java   minimalPlayerFrame 方法
app/build.gradle                 COMPOSE_MINIMAL_PLAYER 开关
src/components/app/overlays/AppOverlays.tsx   交接后不再挂 WebView 极简页
src/hooks/usePlaybackVisualizerBridge.ts      A1 修复
src/services/nativeChrome.ts                 能力位与动作 id 类型
```

新增测试：

```
android/app/src/test/java/io/github/huleixin/tingyu/minimal/{MinimalLyricsTest,MinimalPlaybackTest,MinimalBridgeFrameTest}.kt
test/unit/nativeMinimalPlayer.test.ts
```
