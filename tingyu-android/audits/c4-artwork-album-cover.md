# C4：封面加载不出来（歌词已恢复）—— 根因与修复

版本：1.3.50 / 74（未改版本号）。分支 `native-bg-playback`。

## 一、现象

- 歌词已正常（原生取词链路工作）。
- 封面"还是加载不出来"。
- 打开听屿后可能恢复。

歌词与封面共用同一个 `SongInfo`（身份、标题、歌手、时长、封面地址都从 MediaItem 的 tag 读）。
歌词能取到，说明这条身份链在跑；封面单独缺失，只可能是**地址在传递过程中丢了**，而不是
"取不到图"。

## 二、根因：交给原生的 `artwork` 恒为空串

`SongResult` 里没有顶层 `coverUrl` 字段。封面只有一处：**`album.coverUrl`**。

```
src/types.ts:1225  export interface SongResult { ... }
                   // 没有 coverUrl
src/types.ts:1186  export interface Album { id; name; coverUrl?: string; ... }
```

而把逻辑歌单交给原生时，封面是这样取的（修复前）：

```ts
// src/services/nativePlaylistSync.ts
const artworkOf = (song: SongResult): string => {
    const cover = (song as { coverUrl?: unknown; cover?: unknown }).coverUrl
        ?? (song as { cover?: unknown }).cover;   // 两个字段都不存在
    return typeof cover === 'string' ? cover : '';
};
```

于是 `NativePlaylistTrackPayload.artwork` **永远是空串**，一路传到：

```
JS artwork='' → NativePlaylist.Track.artwork='' → adopt 时 MediaItem tag.artwork=''
→ 服务 cachedCoverUrl='' → refreshArtwork() 第一行 `currentArtworkUrl.isEmpty()` 直接返回
→ metadata 既无 ART 也无 ART_URI → 锁屏 / 通知只剩占位图
```

为什么第一首（前台）看起来正常：当前曲由 JS `prepare/load` 推入，那条路径走的是
`buildNativePlaybackPayload` → `createProviderSongMetadata` → `getSongAlbumCoverUrl(song)`，
**读的是正确的 `album.coverUrl`**。所以只有"Media3 自己切歌、由原生接管"的那一项没封面 ——
与真机"切到第二首封面丢失"完全吻合。

这也解释了为什么歌词不受影响：歌词来源是原生 LRCLIB / 酷狗，只需要 title / artist /
duration，这三项在 tag 里一直是对的。

## 三、修复

### 1. 字段来源（根因）

`src/services/nativePlaylistSync.ts`

```ts
const artworkOf = (song) => {
    const albumCover = getSongAlbumCoverUrl(song);   // album.coverUrl
    if (albumCover) return albumCover;
    // 兼容历史字段，但不再作为唯一来源
    const legacy = song.coverUrl ?? song.cover;
    return typeof legacy === 'string' ? legacy : '';
};
```

### 2. 两个字段名在原生侧归一（防再犯）

同一个 MediaItem 的封面，队列窗口写 `coverUrl`，逻辑歌单写 `artwork`，而读它的人有三处
（服务、歌曲信息调度器、诊断）。`NativeAudioEngine` 现在：

- `applyQueue`：入队时把有值的那个字段复制给另一个，任何后续读取方都不会读到空；
- `adoptContinuation`：接管项同时写 `artwork` 与 `coverUrl`。

### 3. 已在队列里的项也能追上修正后的数据

`NativePlaylist.artworkFor(songKey)`（新增）+ `SongInfo.withArtwork(url)`（新增）：
队列项的 tag 是**入队那一刻**的快照，旧版本同步交上来的封面是空的，即使之后 JS 重新同步，
那一项也不会自己变好。`NativeAudioEngine.scheduleSongInfo` 在 tag 没有封面时按 songKey
回查**当前**逻辑歌单补一次，补不到就保持空（不猜图）。

### 4. 三个时序 / 网络加固

| 位置 | 问题 | 处理 |
| --- | --- | --- |
| `applyNativeArtwork` | 缓存命中的封面可能比 `onStartCommand` 先到，`cachedSongKey` 还停在上一首 → 结果被丢弃且永不重试 | 若引擎当前曲就是它，700ms 后重认一次（有界，仍要求服务那时也在这一首，绝不错配） |
| `applyNativeArtwork` | `appliedArtworkUrl = currentArtworkUrl` 可能写入空串，紧接着的发布按"URL 为空"把刚拿到的封面清掉 | 改用 `cachedCoverUrl` 兜底 |
| `refreshArtwork` | 一次网络失败后 30s 冷却闸门挡住同一张图，且之后只有元数据再变才会重入 —— 一首两分钟的歌可能从头到尾没封面 | 失败后 4s 补救一次（同一首歌、同一地址、最多一次），并记 `artwork-retry` |
| `SongInfoLoader.refresh` | 只补歌词、不补封面 | 一并提交封面 |

## 四、测试

新增 / 修改：

- `test/unit/services/nativePlaylistSync.test.ts`（+2）
  - `takes the cover from album.coverUrl, the only place SongResult keeps it`
  - `keeps it empty rather than inventing a cover when the album has none`
  - **这两项在修复前的实现上是失败的**（已实测：`artwork` 得到 `''`）。
- `android/.../playback/ArtworkIdentityTest.java`（新增 7 项）
  - 逻辑歌单路径（`artwork`）与窗口路径（`coverUrl`）都能读到；
  - `artwork=''` 不会遮住 `coverUrl`；
  - 两个都没有时保持空，不编造；
  - `withArtwork` 只换封面，songKey / 标题 / 时长 / 代次都不变；
  - 已在队列里的项能按 songKey 从当前逻辑歌单追回封面，未知 key 返回空。

结果：

- JVM `testDebugUnitTest`：**379 / 379 通过**（新增 7）。
- 前端 `test/unit/services` + `test/unit/hooks`：586 项，2 项失败 —— 均为干净树上既有的
  失败（`playbackTestDeckIsolation`、`videoLayerPersistence`），与本次改动无关。
- `tsc --noEmit`：0 错。

实测：`https://y.gtimg.cn/music/photo_new/T002R300x300M000<albumMid>.jpg` 用本仓库的 UA
可直接 200 返回 JPEG（66KB / 33KB），图床不需要 Referer，UA 也不敏感。网络层不是瓶颈。

## 五、仍未覆盖的边界

1. **完全没有封面地址的曲目**（洛雪自定义脚本不返回封面、或音源没给 albumMid）：
   原生不会按歌名搜图（那会引入错图），保持占位图。
2. **本次修复之前已经入队的项**：若一次都没被重新同步过，tag 里仍是空封面。修好后的
   首次同步（打开 App 触发）会把逻辑歌单补上，之后 `artworkFor` 能追回到队列项上。
3. **系统端是否真的渲染**：进程外不可观测。报告里能看到 `artwork-uri`（地址来源）→
   `artwork-fetch` / `artwork-cache-hit` → `artwork-decoded` → `artwork-published{matched,applied}`
   四层，只有最后一层之后才是系统消费。

## 六、真机怎么看

锁屏切到第二首时，报告里应依次出现：

```
artwork-uri{state=has-uri|from-playlist}
artwork-fetch{status=FETCHED,http=200,bytes>0} 或 artwork-cache-hit
artwork-decoded{width,height}
artwork-published{matched=true,applied=true}
artwork-apply{matched=true}
```

- `artwork-uri{state=missing}` → 这首歌的队列数据里压根没有封面地址（音源没给）。
- `artwork-failure{status=HTTP_ERROR,http=403/404}` → 地址有了但图床拒绝/图不存在。
- `artwork-failure{status=NETWORK}` 紧跟 `artwork-retry{remaining=0}` → 网络失败，已补救一次。
- 四层都有但锁屏仍无图 → 系统侧消费，属于系统边界。
