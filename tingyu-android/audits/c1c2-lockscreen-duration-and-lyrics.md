# C 阶段（C1 锁屏时长 / C2 后台歌词）实施报告

版本号未改（仍 1.3.50 / 74），签名 `CN=Tingyu` 不变，用户数据不受影响。
分支 `native-bg-playback`。**以下全部为代码 + 单元/集成级证据，真机尚未验收。**

---

## 第一部分：C1 —— 锁屏「总时长 00:00、进度条不动」

### 根因（同一个字段，两条路径，两种单位）

| 生产者 | 代码位置 | 实际单位 |
|---|---|---|
| 窗口通道（前 5 首） | `nativeQueueWindow.ts:150` ← `buildNativePlaybackPayload` | **毫秒** |
| 逻辑歌单通道（原生接管用） | `nativePlaylistSync.ts:80` `duration: Math.round(durationMs / 1000)` | **秒** |
| 原生消费方 | `TingyuPlaybackPlugin` → `NativePlaylist.Track.durationMs` | 期望**毫秒** |

于是交给原生接管的曲目走完整条错链：

```
Track.durationMs = 200            (实际 200 秒)
→ adoptContinuation tag["duration"] = 200
→ publishQueuedTrack intent duration = 200
→ cachedDurationMs = 200
→ MediaMetadata.METADATA_KEY_DURATION = 200     → 卡片总时长 00:00
→ PlaybackPositionClock.at(..., 200) 钳位        → 进度条恒在 0
```

这也解释了两个"怪现象"：只有**原生接管的那一首**出问题（前 5 首用的是窗口里的毫秒值），
以及**重开 App 就恢复**（JS 复活后走 `nativePlaybackBridge`（毫秒）重新推送，覆盖错值）。

关于「takeovers=0 的日志与 00:00 截图未必同一链路」：这条缺陷只在
`adoptContinuation` 产出的 tag 上触发（`nativeContinuation=true`），窗口产出的 tag 一直是毫秒。
所以本轮同时做了两件事，而不是只改静态缺陷：**统一契约**（下面 1）＋**让 Media3 成为时长权威**
（下面 3）。后者对两条链路都生效，即使某天又有一条新路径读错单位，卡片也会在 Media3 解析出
容器时长后被纠正（`duration-corrected`）。

### 改动

1. **契约统一为毫秒并改名**：`nativePlaylistSync.ts` 的 `duration` → `durationMs`，
   不再做任何换算（唯一一次转换发生在 `SongResult.durationMs` 本来就是毫秒的地方）。
2. **旧数据兼容**：新增 `playback/PlaylistDuration.java` 作为该字段的唯一读取点。
   `durationMs` 优先；旧字段 `duration`（秒）自动 ×1000；但**已经像毫秒的旧值（≥100000）原样使用**，
   不会被二次放大（判据：100000 秒 ≈ 27 小时的单曲不存在，而 100000ms 很常见）。
3. **Media3 优先**：`NativeAudioEngine.durationMsFor(songKey)` 返回 Media3 真实有效的 duration
   （TIME_UNSET/≤0 → -1）。服务发布时 `media3 > playlist > 0`，并把来源写进
   `cachedDurationSource`；播放中一旦拿到真实值且与已发布值相差 >1s，纠正一次并重建 metadata
   （`duration-corrected`）。不重建 MediaSession，不每秒重设歌曲。
4. **positionMs / 速度 / 时间基准**：`buildPlaybackState` 仍以 `PlaybackPositionClock`
   （位置 + 已播时长，按 duration 钳位）与 `setState(state, position, playing?1f:0f)` 发布，
   时间基准是 `cachedPositionUpdatedAt = SystemClock.elapsedRealtime()`。单位修正后钳位不再
   把进度压在 200ms（见 `PlaybackPositionClockTest` 新增断言）。
5. **Activity 恢复路径**：`FoliaNativePlugin.applyPlaybackState` 的 duration 一直来自
   `buildNativePlaybackPayload`（毫秒），与本次契约一致；恢复时即使 JS 推来旧值，
   也会被第 3 条覆盖。

---

## 第二部分：C2 —— 后台歌词缺失 / 不更新

**结论：与 C1 不是同一根因**，三处独立缺陷：

### C2-a 缓存容量与预置深度矛盾（会稳定掉词）

`ColorOsLyricBridge.MAX_CACHED_SONGS = 6`，而 JS 预置深度 `PRIMED_LIMIT = 16`。
更糟的是淘汰顺序：预置按"当前曲之后的顺序"写入，于是 LRU 的下一刀永远砍在**最靠前的下一首**
上 —— 也就是换歌那一刻唯一需要的那条时间轴。锁屏连播第 7 首起必然空词。

修复：
- 容量 6 → **16**（= 当前曲 + 一整轮预置窗口），仍是有界的；
- 新增 `protectAhead(nextSongKey)`，与 `pin(currentKey)` 一起免于淘汰
  （下一首由 `onMediaItemTransition` 里的 `player.getNextMediaItemIndex()` 提供）；
- JS 侧 `PRIMED_LIMIT` 16 → **10**：这个列表只是"已交过"的本地记账，必须**小于**原生容量，
  否则被原生淘汰的歌还留在记账里，就再也不会被补交。

### C2-b `lyric-request` 从来没有被转发过（事件链是断的）

原生在切歌时 `emit("lyric-request")` 明确说"这首歌我还没有时间轴"，JS 侧
`useColorOsLyricFeed` 也挂好了 `tingyu-native-lyric-request` 监听器，
但 `nativeAudioElement.ts` 只转发了 `queue-request`/`queue-wait`。**监听器永远不会触发**，
所以这条"原生问、JS 答"的补词通道从未工作过；后台掉词只能等下一次打开 App。

修复：`nativeAudioElement` 转发该事件（携带 `songKey`）。
同时把 JS 的回答扩到"原生当前那一首"：请求的 songKey 与 UI 显示的曲目不同时，
按 songKey 从 `playQueue` 找到歌曲、**只读本地持久缓存**（IndexedDB / 预取内存）构建时间轴，
不联网、不发新取词请求；拿不到就留白，不写假数据。

### C2-c 预置只看窗口 5 首，看不到后面的 10 首

`primeNativeLyricsForSongs` 只被喂 `window.songs`（≤5）。而原生的播放顺序是
`setNativePlaylist` 里那份 `ordered` 列表。现在 `syncNativePlaylist` 成功后按该顺序预置，
上限 `LYRIC_PRIME_AHEAD = 12`（与原生容量对齐），仍然只读缓存、逐首 await、失败静默。

### 四层证据与边界

| 层 | 观测点 | 是否可观测 |
|---|---|---|
| 获取 | `lyric-lookup{cache=ready/pending/none, cached, lastPublishAgeMs}`（切歌瞬间） | ✅ |
| 构建 | `lyric-metadata{written=timeline/absent/stub, len}` | ✅ |
| 发布 | `lyric-session`（用 MediaController 从 MediaSession 读回） | ✅ |
| 系统消费 | 灵动岛/锁屏是否真的渲染 | ❌ **进程外，无法观测**，报告里明确写边界 |

**能力边界（必须说清）**：本轮**没有**新增原生取词客户端。歌词来源仍是 JS 侧的
在线取词 + IndexedDB 持久缓存 + 预取（`PREFETCH_COUNT_NEXT = 2`）。因此：
- 已在本机缓存过的歌（听过/预取过）→ 锁屏连播应当有词；
- 一首**从未在本机出现、且不在预取窗口内**的歌，后台被原生接管时仍然无词可发 ——
  这时 `lyric-lookup` 会记录 `cache=pending`，`lyric-request` 会在 JS 恢复时补。
  要彻底消除，需要在 Service 内实现原生取词（QQ / 洛雪两套协议），那是新系统，本轮不做。

---

## 第三部分：诊断（C1/C2 共用一套）

新增 `session-sample`（routine 泳道，10s 一次 + 切歌 + 每次 JS 推送）：
`song / positionMs / durationMs / durationSource / playing / state / speed / takeover /
lyricState / lyricCached / lyricPublishAgeMs`。
报告新增两段：

```
lock-screen session samples (position / duration / lyric):
  sample at transition: trigger=transition song=xxxxxxxx positionMs=0 durationMs=252000
                        durationSource=media3 playing=true state=3 speed=1.0 takeover=true
                        lyric=ready cached=7 lyricAgeMs=2100
  sample latest      : ...
  last lyric-lookup  : ... cache=ready cached=7 lastPublishAgeMs=2100 takeover=true ahead=yyyy

native playback trail:
  ... duration-source / duration-corrected / lyric-lookup 都在 critical 泳道
```

判读方法：
- `durationMs` 很小 + `durationSource=playlist` → 我们发布错了（本轮要修的东西）；
- `durationMs=0` + `durationSource=none` → 播放器还没解析出来，不是发布错误；
- `durationMs` 正确但 `state/speed` 不对 → 发布没问题，是系统卡片没刷新（HyperOS 侧）；
- `lyric=ready` + `lyric-metadata written=timeline` + `lyric-session written=timeline songMatches=yes`
  但岛上仍空 → 只剩"系统消费"这一层，属不可观测边界。

---

## 第四部分：测试

| 项 | 结果 |
|---|---|
| JVM 单测（全量） | **343 / 343**（原 335，新增 8：`PlaylistDurationTest` 6、`PlaybackPositionClockTest` 1、`LyricInfoPublicationTest` 1） |
| vitest（相关 3 个文件） | **20 / 20** |
| `tsc --noEmit` | 0 错 |

关键新断言：
- `aDurationPublishedInSecondsFreezesTheProgressBar`：duration=200 时位置被钳在 200ms，
  duration=200000 时正常推进 —— 把真机现象写成断言；
- `a200SecondSongBecomes200000Milliseconds`：JS 载荷与旧数据迁移两条都覆盖；
- `theNextTrackSurvivesTheFollowingPrimingWindow`：25 次写入后，被钉住的当前曲与下一首仍在；
- `theCacheStaysBounded`：20 首后仍有界（16），第 1 首读作 pending 而非"无词"。

修正的错误测试：`nativePlaylistSync.test.ts` 原来断言 `duration === 200`（秒）——
它正是在保护错误契约，也是这个 bug 一路绿灯的原因。

---

## 第五部分：尚未解决的系统侧限制 / 回归风险

**系统侧（不可由本进程解决）**
1. 灵动岛/锁屏是否真的刷新，本进程不可观测（无 hook 进系统 UI）。`state/speed/durationMs`
   都正确而卡片仍不动，只能判定为消费端问题。
2. HyperOS 对第三方 MediaSession 的刷新策略（是否缓存通知模板）无法从应用侧验证。

**回归风险（按影响排序）**
1. 原生歌词缓存 6 → 16，内存上限提高（每条时间轴 ≤200KB，最坏约 3MB 级别的极值；
   实际为一首歌的整条时间轴，通常几十 KB）。已有 `theCacheStaysBounded` 守住上界。
2. `refreshNativePlayback` 里新增的时长纠正会重建一次 metadata（不是每秒）：每次换歌最多一次，
   条件是"与已发布值相差 >1s"。
3. 预置从 5 首扩到 12 首，`setNativePlaylist` 之后会多读几次 IndexedDB（纯本地、顺序、可失败），
   不影响播放；如真机上发现同步耗时上升，可下调 `LYRIC_PRIME_AHEAD`。
4. `session-sample` 每 10s 写一条 routine 诊断（上限 40 条，会挤掉更早的 routine 条目，
   不影响 critical 泳道）。

**明确没做**：不迁移 `MediaSessionService`、不建第二套 Session、不改 Media3 续播/QuickJS/QQ 歌单/
背屏/灵动岛/舞台、不每秒重建 Session、不启 WebView 补词、不改版本号。

---

## 真机验收步骤（QQ 原版与洛雪音源各一遍）

1. 覆盖安装 `Tingyu-Android-v1.3.50-c1c2-session-lyric.apk`（签名不变，不清数据）。
2. 播放 → **直接锁屏**，不要触碰，连播 ≥10 首（重点看第 3、5、10 首）。
3. 观察系统媒体卡片：**总时长应为 mm:ss（不是 00:00）、进度应随时间增长**；灵动岛应显示歌词。
4. 解锁后**先导出诊断**再操作，重点核对：
   - `sample at transition` 的 `durationMs` 与 `durationSource`（应为 `media3` 或合理的 `playlist` 值，
     且不再出现 200 这种秒值）；
   - `duration-corrected` 是否出现（说明先验值被纠正）；
   - `lyric-lookup` 的 `cache=` 与 `cached=`（连播到第 10 首时缓存应仍覆盖当前曲）；
   - `lyric pipeline` 三层的 `written` 与 `songMatches`。
