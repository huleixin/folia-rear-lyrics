# C2：锁屏自动切到第二首时歌词为空 —— 根因与修复

版本：1.3.50 / versionCode 74（未改版本号）
范围：只动 C2（后台补词）。C1 锁屏时间未触碰；未改背屏、灵动岛渲染、歌单 UI、QuickJS、Media3 队列策略。

---

## 一、先说结论：C2 之前为什么没解决第二首

上一轮（C2 第一次实现）修的是「不要主动清空」和「按 songKey 取词」，但整条链路**只有读者，没有取者**。
把链路拆成四层后，第二首的断点是下面三个，各自独立、缺一个都失败：

| 层 | 事实（改前） | 结论 |
|---|---|---|
| 未获取 | 预取只抓「当前曲之后 2 首」的歌词，且**只写进程内 Map**；`nativeLyricPriming` 的预置只在**换歌那一瞬间**跑一次。那一刻第二首的歌词还在网络上，预置只能跳过它 | 第二首从未进入原生缓存 |
| 未获取 | 预取完成之后**没有任何触发点**再预置一次（`lastSignature` 未变就不会重发、`primed` 只增不减） | 缺口永久存在 |
| 未构建 / 未发布 | 原生发出 `lyric-request` 后，JS 的应答函数只读 **IndexedDB**（`getSongCacheWithLegacyMigration`），而歌词写盘只发生在「它成为当前曲、被播放器页加载」时 —— 预取拿到的词根本不落盘 | 即使预取成功，后台也补不上 |
| 未发布 | 应答函数的监听器只在 `hasLines === true` 时挂载；界面这一首没有词时，原生的询问被整条丢掉 | 询问可能无人接听 |
| 系统未显示 | 原生 `lyricInfo` 缺失时按「留白（pending）」处理，这是对的；但没人补，就一直留白 | 表现为「打开 App 才恢复」 |

一句话：**第二次切歌时，歌词既没有提前交到原生手里，也没有一条能在后台独立取词的路径。**
「增加缓存容量 / 扩大预取窗口」都改不动这一点 —— 缓存里根本没有那条数据。

### 关键代码位置（改前）

- `src/services/nativeLyricPriming.ts`：`readCachedLyrics` → 预取内存 / IndexedDB；`primeNativeLyricsForSongs` 一次性。
- `src/hooks/useColorOsLyricFeed.ts`：`publishCachedLyricFor` 只读 IndexedDB；监听器 `if (!active || !songKey || !hasLines) return;`。
- `src/services/prefetchService.ts`：歌词只进 `prefetchCache`（内存），无落盘、无广播。
- `android/.../NativeAudioEngine.java`：`emit("lyric-request")` 只发一次，无重问。

### 原生侧是否存在更底层的取词能力？

已核查（不是推测）：

- `playback/` 包内没有任何歌词网络客户端，只有发布通道与 `lyric-request` 事件；
- `lx/LxBootstrap.kt` 的 shim 只暴露 `musicUrl` 一类请求，**没有 lyric 接口**；
- 各音源歌词接口（QQ / 网易 / 酷狗 / 洛雪）都在 JS 侧（`omni.getLyrics`）。

所以在当前架构里，**歌词唯一可信的获取点仍是 JS 运行时**。修复的方向因此不是「在原生再写一套取词」，
而是让「原生需要哪一首 → JS 就在后台把那一首取到并交过去」这条路真的存在，且不依赖界面渲染、不依赖用户打开 App。
边界见第四节。

---

## 二、修复内容

### 1. `src/services/nativeLyricPriming.ts`（重写核心，仍复用原有构建/发布代码）

- 新增 `ensureNativeLyric(song, quality, { fetch })`：**预取内存 → IndexedDB → （仅在明确允许时）联网取一次**，
  同一 songKey 合并为一次并发（single-flight），全局并发上限 2，取到即 `saveToCache` 落盘（key 与播放器页完全相同）。
- 新增 `wanted` 记账：`primeNativeLyricsForSongs` 把「应该预置但当时没词」的曲目记下来，
  换歌瞬间的预置不再是一次性赌博。
- 新增 `notifyPrefetchedLyrics(song)` / `installNativeLyricPrimer()`：预取一拿到歌词就广播一次，
  只对 `wanted` 里的曲目补发布 —— 这就是「预置跑在预取前面」这个竞态的出口。
- 明确「确认没有词」与「还没到」：服务端回答无词时 `clearColorOsLyricInfo(key)` 宣告 noLyric（原生随即停止重问），
  抛错（断网/音源拒答）则保持 pending。
- 四层诊断：新增 `native:lyric-answer{source,published,lines,elapsedMs,failure}`，
  能区分 not-cached / prefetch / db / fetch / confirmed-empty / busy / fetch-failed。

### 2. `src/services/prefetchService.ts`

- 歌词落到预取内存后广播 `tingyu-lyrics-prefetched{ song }`（唯一新增一行副作用，不改变预取行为）。

### 3. `src/hooks/useColorOsLyricFeed.ts`

- `publishCachedLyricFor` → `answerFor(key, allowFetch)`：身份取自**原生问的那一首**（歌单里按 songKey 找，
  找不到才退回界面这一首），复用 `ensureNativeLyric`，不再自建一套只读 IndexedDB 的逻辑。
- 监听器挂载条件从 `active && songKey && hasLines` 降为 `active && songKey`：界面这一首没词时也接得住询问。
- 界面这一首有词 → 仍用带 `timelineOffsetMs` 的本地 payload 作答（最贴近舞台）；没词 → 走 `answerFor` 补词。
- 挂载 `installNativeLyricPrimer()`（预取完成 → 补发布）。

### 4. `android/.../NativeAudioEngine.java` + 新 `playback/LyricRetryPolicy.java`

- `lyric-request` 之后有界重问：3s、12s 各一次（共 3 次询问），条件是「仍是同一首」且「仍是 pending」。
  换歌 / 已 ready / 已确认 none 立即失效；不引入轮询，不唤醒 WebView。
- 判据抽成纯函数 `LyricRetryPolicy`，可单测（这是「有界」这条承诺唯一可信的证据）。

未改动：`ColorOsLyricBridge` 的缓存键/容量/发布路径、`FoliaPlaybackService` 的 metadata 与 PlaybackState 发布、
C1 的 `durationMsFor` / `PlaylistDuration`、QuickJS、洛雪路由、背屏与灵动岛。

---

## 三、测试（先写失败用例，再改代码）

### 前端（vitest）

`test/unit/services/nativeLyricPriming.test.ts`（新增 6 项，改前 6/6 失败）

1. 预置时没有词 → 预取晚到 → **自动补发布**，且绑定的是第二首自己的 songKey；
2. 不在队列窗口里的曲目即使歌词到达也不进原生缓存（不做无谓占用）；
3. 两处缓存都没有 → **联网取一次**并发布，同时落盘（`lyric_<songKey>`）；
4. 同一首并发两次请求只取一次（single-flight）；
5. 已有缓存时不联网；
6. 服务端确认无词 → 不发布时间轴、只宣告 noLyric，且不再重复取词。

`test/unit/hooks/colorOsLyricFeed.test.ts`（新增 3 项，改前 3/3 失败）

1. 界面仍停在第一首，原生请求第二首 → 用第二首的身份发布**第二首**的时间轴（不串词、不绑错）；
2. 两处缓存都没有 → 联网取到后仍按第二首发布（旧实现此时整场留白）；
3. 界面这一首自己没词时，监听器仍在，询问仍被接住。

### 原生（JUnit）

`android/app/src/test/java/.../playback/LyricRetryPolicyTest.java`（3 项，通过）
同一首才重问、ready/none 不重问、换歌作废、预算封顶 3 次询问、每个间隔有值。

### 回归

- 新增 11 项前端用例 + 3 项 JVM 用例全绿；`tsc --noEmit` 无输出。
- 受影响面：`prefetchService`、`nativeQueuedPlayback`、`nativeQueueWindow`、`lyrics/*`、`onlinePlayback`、`playback/*`
  共 81 个文件 1131 项通过。
- 全量前端套件：6792 通过 / 15 失败。这 15 项在**未改动的干净树**上同样失败（command-palette、
  library layerBoundaries、mobilePlaylistDetail、onlinePlaybackStop blob 释放、settingsAnchorCoverage、
  videoLayerPersistence、storeContract、playbackTestDeckIsolation），与本次改动无关。

### 候选包

`deliverables/Tingyu-Android-v1.3.50-c2-background-lyric.apk`
版本 1.3.50 / 74，sha256 `2a741ec8674b751174884b6a2029d2356c428e82ed79247bff383d734a760c5a`，38,597,316 B。
包内已确认包含新链路（`tingyu-lyrics-prefetched`、`native:lyric-answer`）。

---

## 四、尚未解决的限制（必须如实说明）

1. **没有原生取词客户端。** 后台补词仍然发生在 JS 运行时里（`omni.getLyrics`）。
   只要 WebView 进程还活着（锁屏播放期间通常如此，队列监督、洛雪请求都在跑），补词就不需要打开 App；
   一旦系统冻结/回收渲染进程，这三次询问都会落空，结果是「留白」而不是「错词」。
   要彻底摆脱这一依赖，必须在原生实现各音源歌词协议（QQ/网易/酷狗/LX），属于另一件事，本轮未做。
2. **系统端是否真的显示**进程外不可观测。本轮只证明到「已写入 MediaSession metadata（`lyric-session` 读回校验）」，
   灵动岛/锁屏的最终渲染仍需真机确认。
3. 真机未验证（本机无设备）。已完成的证据是：单测层面的「无 Activity、无 React 更新」场景 + 打包产物包含新代码。

## 五、真机请重点看这几条诊断

锁屏连播到第 2 首时，诊断报告里应出现：

- `lyric-request{state=pending,retry=…}`：原生确实在问（第一次 + 两次重问，最多 3 条）；
- `native:lyric-answer{source=prefetch|db|fetch, published=true, lines=N}`：JS 真的把词交上去了；
- `lyric-metadata{state=ready,written=timeline}`：构建进 metadata 的是真实时间轴（不是 stub）；
- `lyric-session{written=timeline,songMatches=true}`：MediaSession 读回来的确实属于当前这首。

若只有 `lyric-request` 没有 `native:lyric-answer`，说明 JS 运行时此时已被冻结（第四节第 1 条）；
若 `native:lyric-answer{source=confirmed-empty}`，则是该音源确实没有这首歌的歌词。
