# C3：原生后台歌曲信息链路（歌词 + 封面）

分支 `native-bg-playback`，版本号 **未改动**（1.3.50 / 74）。C1 的锁屏时间修复一行未动。

---

## 0. 结论先说

| 问题 | 结论 |
| --- | --- |
| 歌词与封面是否同一根因 | **不是同一个 bug**，但同属一个结构性缺口：原生在自动切歌后没有任何自己的信息获取通道。封面另有一个具体缺陷（字段名不一致），歌词是「只有 JS 取词者」。 |
| 歌词原生渠道 | ① 原生内存时间轴（`ColorOsLyricBridge`）② 原生磁盘缓存 ③ LRCLIB `/api/get` → `/api/search` ④ 酷狗公开歌词接口（国内可达性兜底） |
| 封面原生渠道 | 队列项自带的真实封面地址（`artwork`/`coverUrl`）→ 原生 OkHttp 下载 → 内存 LRU + 磁盘缓存 |
| 仍无法原生获取 | 依赖音源账号/加密协议的歌词（QQ QRC、部分洛雪脚本私有歌词接口）；LRCLIB 与酷狗都无同步歌词的冷门/纯音乐曲目；无时长且同名多版本的曲目会被主动判为「不确定」而留白 |
| 系统侧是否显示 | **不可观测**。原生只能证明「已写入 MediaSession 的 metadata 并在当前曲上重建过」，系统是否渲染属于进程外行为 |

---

## 1. 成熟实现调研（实际读源码 / LICENSE）

| 项目 | 许可证 | 与本次相关的做法 | 能否直接用 |
| --- | --- | --- | --- |
| [cromaguy/Rhythm](https://github.com/cromaguy/Rhythm) | **GPL-3.0**（`docs/LICENSE` 为 GPLv3 全文） | Media3 ExoPlayer + Coil；LRCLib 同步歌词 + 逐字高亮；Room 持久化；Deezer/YT Music 取封面 | **不能复制代码**（copyleft 会传染到本项目）。只能借鉴结构：歌词提供者接口 + 独立缓存表 + 封面由 Coil 统一加载 |
| [devxrohan/SMusic](https://github.com/devxrohan/SMusic) | **GPL-3.0**（README License 段明确 copyleft） | 多来源歌词模块：`lrclib` / `kugou` / `betterlyrics` 各自独立 Gradle module，统一由一个 lyrics 聚合层按优先级回落 | **不能复制代码**。借鉴的是「多来源按优先级回落 + 每源独立失败语义」这一层设计 |
| [LRCLIB API](https://lrclib.net/docs) | 公开 API（无 key，CORS 开放） | `/api/get` 必须给 `track_name`+`artist_name`，建议给 `album_name`+`duration`；**时长差 ±2s 才返回**；`/api/search` 最多 20 条；429 带 `Retry-After`，必须尊重；要求 `User-Agent` 自报身份 | **直接接入**（本次已实现） |
| [kimhabkhun/resonate](https://github.com/kimhabkhun/resonate) | **MIT** | Media3 `MediaSessionService` + Coil；`data/lyrics` 里 LRC 解析 + 内嵌歌词仓库；单一架构规则：UI ↔ MediaController ↔ MediaSessionService ↔ ExoPlayer | 代码可用（MIT），但它是**本地文件播放器**，没有网络歌词源，也没有 `lyricInfo` 这类厂商私有 metadata 契约；本项目已有平台 `MediaSession` 且明确不迁移，故只采用「LRC 解析 + 仓库分层」的思路，未引入任何依赖 |

许可证结论：**没有复制任何 GPL 代码**。本次所有原生实现均为自写（LRC 解析、匹配打分、媒体缓存、调度），接口协议信息（LRCLIB 文档、酷狗公开端点行为）属于协议事实，不是代码。

未新增第三方依赖：沿用项目已有的 OkHttp 4.12（`build.gradle` 已有），未引入 Coil 的新用法（Coil 已在依赖中但服务于 Compose UI，播放服务内直接用 OkHttp + `BitmapFactory` 更可控）。

---

## 2. 根因审计（真机现象 → 代码事实）

### 2.1 封面：一个具体缺陷，不是"下载失败"

原生自动切歌时唯一的信息发布路径是 `NativeAudioEngine.onMediaItemTransition → FoliaPlaybackService.publishQueuedTrack(context, tag, playing)`。
`publishQueuedTrack` 过去只按 `coverUrl` 取值：

```java
for (String key : new String[]{"title","artist","album","coverUrl","songKey"})
    intent.putExtra(key, track.optString(key));   // tag 里没有 coverUrl
```

而队列项的 tag 来自 `nativePlaylistSync` 的轨道对象，封面字段名是 **`artwork`**（同一份 TS 类型里 `durationMs` 也同样不是 `duration`）。
于是每次 Media3 自己换歌：

1. `cover` 取到空串 → `currentArtworkUrl = ""`；
2. `onStartCommand` 里 `if (!currentArtworkUrl.equals(appliedArtworkUrl) || currentArtworkUrl.isEmpty())` 命中 →
   `appliedArtworkUrl = ""`、`appliedArtworkBitmap = null`，**已经正确的封面被主动清掉**；
3. `refreshArtwork()` 因 URL 为空直接 return；
4. `buildMetadata(...)` 既没有 `METADATA_KEY_ART` 也没有 `ART_URI` → 锁屏/通知只剩占位图。

第一首之所以正常：它由 `prepare/load` 推入，走的是 JS 插件那条带 `coverUrl` 的路径。
**所以"切第二首封面也没了"不是网络问题，是换歌那一刻地址就被丢了。**

修复：`publishQueuedTrack` 同时认 `coverUrl` / `artwork`，`duration` / `durationMs`（`FoliaPlaybackService.java`）；并新增「空封面不得覆盖已发布封面」的保护（同一 songKey 上 JS 推空值时保留原生已有封面，记录 `artwork-kept`）。

### 2.2 歌词：整条链路在后台没有"取者"

上一轮（`961ace2`）做到的是「JS 需要哪首就补哪首」，但补词仍然发生在 WebView 里：

- 预取只写进程内 Map；预置只在换歌瞬间跑一次；
- 原生 `lyric-request` 由 JS 回答，WebView 被冻结/回收时无人回答；
- `playback/` 包里没有任何歌词网络客户端，`LxBootstrap` shim 也没有歌词接口。

真机上「打开 App 就恢复」正是这条依赖的直接证据。所以本轮把执行者换成播放服务本身。

---

## 3. 原生实现

新增（全部在 `android/app/src/main/java/io/github/huleixin/tingyu/playback/`）：

| 文件 | 职责 |
| --- | --- |
| `SongInfo.java` | 一首歌在原生侧的身份 + 展示信息。**来源只有 Media3 当前 MediaItem 的 tag**；兼容 `artwork`/`coverUrl`、`durationMs`/`duration` |
| `SongInfoLoader.java` | 调度器：当前曲 + 后 2 首；歌词单线程、封面双线程；按歌曲去重（in-flight）、失败冷却、播放代次 |
| `NativeLyricsRepository.java` | 歌词：磁盘缓存（`filesDir/native-lyrics`，按 songKey SHA-1，上限 240 条）→ LRCLIB `/api/get` → `/api/search` → 酷狗兜底；区分 ok / none / 限流 / 网络失败，**只有两种来源都明确说没有才写负缓存（TTL 3 天）** |
| `NativeArtworkRepository.java` | 封面：内存 LRU 12MB → 磁盘（`cacheDir/native-artwork`，降采样 JPEG，上限 60 张）→ OkHttp 下载（单张 ≤6MB，目标边长 768） |
| `LrcParser.java` | LRC → 行时间轴（纯函数）：`mm:ss` / `.x` / `.xxx`、一行多标签、`[offset:]`、单调不减、同时间戳第二条作翻译 |
| `LyricInfoPayload.java` | 构建与 JS 完全一致的 `lyricInfo` JSON（`lyricType/lyric/noLyric/provider/source/trackKey/sessionGeneration`，翻译 lane），**不伪造逐字 lane**，>200k 字符放弃 |
| `LyricMatch.java` | 同名错词防线（纯函数）：标题归一化（去括号版本后缀）、±2s/+4 分、>10s 淘汰、歌手对不上直接淘汰 |
| `SongInfoPublishPolicy.java` | 发布决策（纯函数）：`storeTimeline`（按 key，与当前曲无关）/ `markNoLyric`（仅确认无词）/ `refreshSession`（仅当前曲且未换代次） |

改动：
- `NativeAudioEngine`：`onMediaItemTransition` 与 `prepare(load)` 后调用 `scheduleSongInfo(item)`；新增 `scheduleSongInfoForCurrent()` 供服务重建时补一次。
- `FoliaPlaybackService`：修正封面/时长字段映射；新增 `applyNativeLyric(songKey, json)` 与 `applyNativeArtwork(songKey, bitmap)`（带 songKey 匹配 + 服务存活 + 位图非空三道闸）；`restoreFromEngine` 后补调度；空封面覆盖保护。
- `DiagnosticLanes`：把高频记账（`songinfo-schedule`、`lyrics-request`、`lyrics-cache-hit`、`lyrics-fetch`、`artwork-uri`、`artwork-cache-hit`、`artwork-fetch`、`lyrics-apply`、`artwork-apply`）移入 routine 泳道，`lyrics-built/published/failure`、`artwork-decoded/published/failure` 留在 critical，避免 10 首连播就把「为什么停播」的证据挤掉。
- `src/utils/buildDiagnosticReport.ts`：报告新增原生取词链条目（request/cache-hit/fetch/built/published/failure/apply）与「native artwork pipeline」段。

**没有做**：不新建播放器、不新建 MediaSession、不改 Media3 续播与队列逻辑、不迁移 `android.media.session.MediaSession`、不改灵动岛/背屏/歌词舞台 UI、不改版本号。

### 3.1 并发与竞态

- 歌词单线程串行（同时只对 1 个来源发请求，符合 LRCLIB 的顺序请求建议）；封面 2 线程。
- 同一首歌在飞时只发一次（`lyricsInFlight` / `artworkInFlight`）。
- 失败冷却：网络类 90s，限流 5min，缺身份 10min。**不做常驻轮询**，不做隐藏 WebView。
- 代次守卫：每个结果写回前核对 `generation` 与 `NativeAudioEngine.currentKey()`；上一首迟到的结果只能留在按 key 索引的缓存里，不能重建 metadata。
- 前台优先：如果 WebView 在这几秒里先答上了（`stateOf==ready`），原生的逐行 LRC **不覆盖** JS 的更全版本（`lyrics-published{wrote=skipped, reason=already-ready}`）。

---

## 4. 诊断（真机上能逐层判定）

统一字段：`song`（songKey 哈希）、`mediaItemId`、`source`、`provider`、`generation`、`currentGeneration`、`matched`、`activityStopped`。

歌词：`lyrics-request` → `lyrics-cache-hit` / `lyrics-fetch{status,provider,http,candidates,score,durationDeltaMs}` → `lyrics-built{chars,translation}` → `lyrics-published{wrote,matched,applied}` / `lyrics-failure{status,reason}` → `lyrics-apply{matched,state,wrote}`。

封面：`artwork-uri{state=missing|has-uri}` → `artwork-cache-hit` / `artwork-fetch{status,http,bytes}` → `artwork-decoded{width,height}` → `artwork-published{matched,applied}` / `artwork-failure{status}`；另有 `artwork-keep`（JS 推空封面被挡）与 `artwork-apply`。

判定表：

| 观察 | 含义 |
| --- | --- |
| 只有 `lyrics-request`，无后续 | 取词仍在飞（或进程被杀） |
| `lyrics-failure{reason=network}` | 两个来源都不可达（网络/被墙），可重试 |
| `lyrics-failure{reason=none}` | 公开源确实没有这首歌的同步歌词（会写负缓存 3 天） |
| `lyrics-published{wrote=skipped,reason=already-ready}` | 前台 JS 抢先，原生让位 |
| `lyrics-published{matched=true,applied=false}` | 属于当前曲但服务没接（未 running / 已换歌） |
| `artwork-uri{state=missing}` | 队列项本身没有封面地址（与下载失败无关） |
| `artwork-failure{status=HTTP_ERROR}` | 地址失效（404/403） |
| `artwork-failure{status=NETWORK}` | 超时/断网，可重试 |
| `artwork-published{matched=false}` | 结果属于别的歌，被拒（防串图） |

**不可观测**：系统（小米 HyperOS / 灵动岛 / 锁屏）是否真的渲染了 `lyricInfo` 与封面。本进程只能证明写入与发布，报告里如实标注为边界。

---

## 5. 测试

新增 JVM 单测 28 项（`android/app/src/test/java/.../playback/`）：

- `LrcParserTest`（8）：两位/三位毫秒、一行多标签、offset 负值钳零、时间单调、同戳作翻译、忽略元信息、无时间轴返回空、控制字符清洗。
- `LyricInfoPayloadTest`（5）：契约字段逐项、`trackKey` 组成、三位毫秒格式、翻译 lane、空/超大拒绝、`noLyric` 明确收尾。
- `LyricMatchTest`（7）：时长优先、差 77s 的现场版淘汰、同名不同歌手淘汰、括号版本后缀归一化、时长未知但标题歌手一致接受、「起风」不得匹配「起风了」、多候选取最佳。
- `NativeLyricPipelineTest`（5）：用 LRCLIB `/api/search` 的真实响应形状（含错歌手、错时长两条干扰）跑完整链：匹配 → 解析 → 构建 → `trackKey` 与 `sessionGeneration` 正确；发布决策与 Activity/WebView 状态无关；网络类失败永不写成「确认无词」；封面不会发布给别的曲目；tag 双字段名兼容。
- 回归：`DiagnosticLanes` 等既有用例。

结果：`testDebugUnitTest` **371 passed / 0 failed**（本轮之前 343，新增 28）。
前端：`tsc --noEmit` 0 错；诊断报告相关 58 个文件 **381 passed**。

端到端实测（本机，证明协议与解析对得上，不作为真机证据）：

```
GET lrclib.net/api/get?track_name=起风了&artist_name=买辣椒也用券&duration=325
→ 200, duration=326.0, syncedLyrics 46 行，首行 "[00:25.94] 這一路上走走停停"
GET krcs.kugou.com/search?keyword=起风了&duration=325000 → 候选含 id/accesskey/song/duration
GET krcs.kugou.com/download?fmt=lrc → base64(2904B) → "[offset:0]\n[00:25.88]这一路上走走停停…"
```

注意一个实测发现：酷狗搜索**给「歌名 歌手」会返回空列表**，只给歌名才有候选 —— 实现里已按此处理，判定改为「歌名一致 + 时长差 ≤2s」。

---

## 6. 能力边界（必须如实告知）

1. **QQ 原版歌词没有原生移植**。QQ 的歌词是 QRC（加密 + 解混淆 + 翻译/音译 lane），整条解密链在 JS 里；搬进原生等于重写一套音源协议，且会把原生歌词绑死在一个可能随客户端版本变化的私有协议上。所以 QQ 曲目的原生词来自 **LRCLIB / 酷狗**（按歌名+歌手+时长精确匹配），可能与传统中文（繁体）或版本差异，但不会再缺词。
2. **洛雪脚本**：脚本只约定 `musicUrl`；歌词接口是各脚本私有实现，原生不接。洛雪曲目同样走公开源兜底。**不要把「原生支持歌词」理解成「支持所有 JS 音源歌词」**。
3. **逐字歌词**：原生兜底只产出逐行 lane（+翻译）。LRCLIB 的字级时间轴在 `lyricsfile` YAML 里，本次未实现，也不伪造均匀扫光。
4. **无同步歌词的曲目**（纯音乐、冷门、长度未知的多版本）会留白并记录 `reason=none`，不猜。
5. **LRCLIB 在国内可能不可达**；此时靠酷狗兜底；两者都不可达时 `lyrics-failure{reason=network}`，可重试，不会把歌写成「无词」。
6. 系统端是否显示，进程内不可验证。

---

## 7. 真机验收关注点

锁屏连播 ≥10 首，导出诊断后先看 `native artwork pipeline`：应当每首都有 `artwork-uri{state=has-uri}` 且 `artwork-published{matched=true,applied=true}`；再看歌词链：`lyrics-request` →（`lyrics-cache-hit` 或 `lyrics-fetch{provider=lrclib|kugou}`）→ `lyrics-built` → `lyrics-published{matched=true}` → `lyrics-apply{matched=true}`。

若某首封面仍然空，看是 `uri=missing`（队列项没地址）还是 `HTTP_ERROR`（地址失效）——这两者以前混在一起，现在能分开。
