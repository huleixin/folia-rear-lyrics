# 极简播放器 · 视觉还原与按钮映射修正（第 3 轮）

> 本轮只做两件事的**已完成部分**：按定稿截图（图 2）修封面页的几何与配色，以及把按错的按钮功能改回来。
> **原生队列没有做**（见第五节），原因写在那一节，不在这份文档里假装完成。

---

## 一、怎么对的标准

以前的做法是"照 CSS 改代码，看一眼像不像"。这一轮换了方法：**同一张封面、同一个视口、同一组数据，两张图直接量。**

1. 从定稿截图里裁出封面原图 → `audits/assets/minimal-compose/ref-art.png`（970×970）
2. 用它作为 `MinimalArtwork`，配上截图里的同一首歌（九万字 / 黄诗扶 / 77s / 232s / FLAC · 无损）
3. 视口取参考图的：1220×2656 @3x = **407×885dp @480dpi**
4. `MinimalParityTest` 渲染出的图是 1221×2655 —— 和参考图同一尺度，可以直接减
5. `tools/measure_player.py` 在两图上跑同一套像素检测（封面框 + 内容行），输出百分比

## 二、逐项对比

比例均以屏幕宽/高为分母，来自两图的实测像素。

| 项 | 图 2（定稿） | 上一版 | 本版 | 结论 |
| --- | --- | --- | --- | --- |
| 封面左边缘 | 4.2% | 4.3% | 4.2% | ✅ |
| 封面宽度 | 80.2% | **60.9%** | 80.7% | ✅ 放大 1.33× |
| 封面顶边 | 20.1% | **32.0%** | 21.1% | ✅ 上移 11% |
| 标题行 | 58.5% | 61.6% | 61.6% | ⚠️ 仍低 3.1% |
| 歌手行 | 64.0% | — | 66.7% | ⚠️ 低 2.7% |
| 音质角标 | 67.2% | **缺失** | 70.2% | ✅ 出现（位置低 3.0%） |
| 单句歌词 | 75.7%（高 1.9%） | **77.6%（高 0.3%，只有省略号）** | 76.5%（高 1.9%） | ✅ |
| 进度条 | 81.2% | 83.0% | 81.5% | ✅ |
| 时间行 | 84.5% | 85.4% | 84.7% | ✅ |
| 传输按钮 | 87.5% | 88.0% | 87.6% | ✅ |
| 分页点 | 93.9% | 93.9% | 93.4% | ✅ |

并排图：`audits/assets/minimal-compose/compare-cover-dark.png`
（左＝定稿截图，右＝本版 Compose 渲染，同一张封面）

### 三个根因

1. **封面小了三成**：CSS 的 `39vh` 是**视口**高度，我拿的是 pager 容器的高度（顶栏、传输条、分页点都扣掉了），
   屏幕越矮差得越多。顺带 `min(90%, …)` 的 90% 也应该作用在**去掉左右内边距**的列宽上。
   现在 `vh` 取 `LocalConfiguration.screenHeightDp`，四段媒体查询（42/39/35/31vh）逐条照搬。
2. **背景是一块平色**：`minimalAuroraGlow`（把封面派生色提亮到 `l=.62`）没有移植；三片光斑画成了
   整屏大小的同心圆，互相盖住，把洗色吃光。现在按 CSS 的 `inset:-20%` + `ellipse rx% ry%` 换算成椭圆，
   颜色走 `auroraGlow()`。背景采样对比（深色，五点平均）：参考 `(47,57,77)`，本版 `(48,61,75)`。
3. **音质角标缺席、歌词只剩省略号**：角标是数据没到位（容器 + 规格都没读到），歌词是没绑到当前行。
   前者现在由 JS 用 `resolveQualityBadges` 判定后经桥送到原生（`quality` / `qualityGold`），
   后者随 `palette` 一并确认（见下）。

### 配色不再移植，直接复用

`buildMinimalPalette` 在 Kotlin 里有一份移植，实测对同一张封面输出
`#152528 / #263951 / #442227 / #2F4974 / #AAC1D5 / #D2CBC1`，
而 JS 原版是 `#152528 / #1F3242 / #442226 / #2F4674 / #AAC1D5 / #C3CADF`。
base / field2 / bloom 一致，fieldPrimary 与 lyricAccent 有偏差 —— 这类偏差在别的封面上会变成色相差。

所以桥帧新增 `palette: [hex ×6]`，由 `useNativeMinimalPlayer` 调用**同一个** `buildMinimalPalette`
算出后下发；原生只在拿不到时才退回本地移植。取色这件事从此只有一份实现。

（`test/unit/probe/paletteProbe.test.ts` 是取色探针，用来把 JS 的真实输出打出来对照。）

## 三、按钮映射

| 入口 | 原版行为 | 上一版 | 本版 |
| --- | --- | --- | --- |
| 底部最右列表 | 播放队列 | 播放队列 | 播放队列（未变，仍是 WebView） |
| 歌词页右上 | 完整歌词舞台 | 完整歌词舞台 | ✅ 未变 |
| 顶栏「更多」 | **菜单**：音质音效 / 音效 / 歌词 / 队列 / 播放设置 | ❌ **直接打开队列** | ✅ 五项原生菜单，调原版同一批 store 方法 |
| 封面右侧波形 | 播放指示（装饰） | 装饰 | ✅ 视觉不变 + 44dp 命中区，打开音质音效 |

「更多」菜单的每一项都走 `MobileStageMenu` 里的同一个入口：
`useAudioToolsStore.show()`、`openAudioEqualizer()`、面板 `onlineLyrics` / `queue`、`openSettings('options','playback')`。
没有新建面板，也没有把音质入口替换成队列。

## 四、验证

| 项 | 命令 | 结果 |
| --- | --- | --- |
| Android 单测 | `./gradlew :app:testDebugUnitTest` | **146 文件 / 976 用例 / 0 失败** |
| 新增渲染对照 | `MinimalParityTest`（2 例） | 通过，产出 1221×2655 对照图 |
| 前端类型 | `npx tsc --noEmit` | 通过 |
| 前端单测 | `vitest nativeMinimalPlayer.test.ts` | 7 例通过（含新增四项菜单动作） |
| 打包 | `assembleRelease`（`TINGYU_COMPOSE_MINIMAL=true`） | 成功，`COMPOSE_MINIMAL_PLAYER=true` 已核对 |

APK（**原签名**，可覆盖已装正式版）：`tingyu-android/out/tingyu-1.3.131-compose-minimal-release.apk`
51.7 MB，sha256 前缀 `338460d9`，证书 `A3:6E:F2:…:9D`（与 1.3.110/1.3.123 同）。

## 五、**没做完的：原生队列**

队列抽屉仍然是 WebView（点底部列表按钮弹出的是旧 `MobileQueueSheet`）。
这一项本轮**没有交付**，原因不是设计没想清楚，而是剩下的时间不够把它做完并验证：

- 需要新增一条"队列快照 + 队列动作"的桥（当前动作总线只带 `(action, number)`，装不下 396 条曲目和行内索引）；
- 需要在 Compose 里做 `ModalBottomSheet`（把手、可扩展、下滑关闭、返回手势、自动定位到当前曲）；
- 最麻烦的是**动作必须落到现有的 `onPlaySong` / `onRemoveSong` / `onMoveSongToNext` / `onMoveSongToEnd`**，
  这些处理器由 `usePlayerPanelModel` 组装，塞进 bridge hook 里要处理它在两处同时构建的问题。

按你给的验收标准，做到一半就宣称完成是不可接受的，所以这一轮明确留空。

## 六、旧 WebView 极简页：暂不清理

**清理依赖队列先原生化。** 现在点队列仍走 WebView 面板，`minimal-stage/` 里的组件
（`MinimalStage`、`MinimalTransport`、`MinimalCoverPage`、`MinimalLiveLyric`、`MinimalLyricsPage` 及其 CSS）
仍是**回滚路径**：`TINGYU_COMPOSE_MINIMAL` 关闭时整套 WebView 极简页要能原样接管。
在 Compose 侧（封面 + 歌词 + 队列 + 入口 + 返回）全部验证通过之前删除任何一件，
都会让"关掉开关就能回滚"这条承诺失效。所以本轮只做了调用关系审计，没有删文件：

- `minimal-stage/MinimalStage.tsx` 只被 `AppOverlays` 在 `ownsMinimalStage` 时挂载；
- 其 CSS（`minimalStage.css` / `minimalAmbience.css` / `minimalProgressGlow.css`）只被该目录引用；
- `minimalQuality.ts`、`minimalPalette.ts`、`useCoverPalette.ts`、`graphemeTiming` 相关**被原生侧复用**
  （配色与音质角标现在直接从这些模块取值），属于"仍被依赖"，不能删。

## 七、下一步（顺序明确）

1. 队列桥：`MinimalPlayerFrame.queue`（仅抽屉打开时带，变化才重发）+ 动作 `queueOpen/queueClose/queuePlay/queueNext/queueEnd/queueRemove`（`value` 当行索引）；
2. Compose `ModalBottomSheet`：把手 / 标题（曲名 + 总数）/ 关闭 / 列表（曲名、歌手、当前标记、三枚行内动作）/ 自动定位；
3. 队列内切歌、删除、排序走现有处理器，跑通后再动 `minimal-stage/` 的删除；
4. 真机验证帧率、手势竞争、与 WebView 的层级衔接。
