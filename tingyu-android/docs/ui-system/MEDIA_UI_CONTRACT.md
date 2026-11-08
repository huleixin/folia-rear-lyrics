# MEDIA_UI_CONTRACT — 跨音源展示与操作能力规范

> 基线：commit `1745121`。本契约描述「同类型媒体数据无论来自哪个音源，如何共用同一套展示层」的现行架构与约束。

## 1. 现行架构事实（审计结论）

- 音源实现位于 `src/services/onlineMusic/`：`neteaseProvider` / `qqProvider` / `kugouProvider` / `bodianProvider` / `qishuiProvider`，动态 LX（`lxProviders.ts`，wy/tx/kg/kw/mg）。注册于 `providerRegistry.ts:83-89`，统一门面 `omni.ts`。
- 能力接口按可选项拆分（`src/types/onlineMusic.ts:534-554`）：Search / Playback / Lyrics / Auth / Library / Catalog / Recommendation / Mutation。**方法缺失 = 不提供该分类**。
- 展示层统一：`library/core` 的 `CollectionResource`（`createCollectionResource.ts`：online / navidrome / static 三装配）→ `MobileCollection.tsx`（WebView）与 `useNativeCollectionPage.ts` → `MediaDetailScaffold`（Compose，`chrome/MediaDetail.kt`；原 NativePlaylistPage 已并入）。**已无按音源复制的页面。**

### 1.1 原生集合详情统一模板（阶段 E）

- **路由**：`NativePageView` 按 `page.id=='collection'` 进 `MediaDetailScaffold`；`collection:artist:` 前缀保留歌手独立结构（NativeDirectoryPage artist 分支）。**禁止**按 intro/playlistIntro 分流标记路由。
- **数据契约**（useNativeCollectionPage，所有非歌手集合一致）：`toolbar`（back/filterToggle/menu/locateCurrent）+ `intro`（封面/标题/trackCount/creator 或来源/简介）+ `controls`（playAll/enqueue/subscribe 按能力）+ `songHeading`（歌单专属）+ `filter`（仅展开或有词时下发）+ `tracks`。
- **歌曲行契约**：歌名一律原始名；序号为独立 `number` 字段（`String(index+1).padStart(2,'0')`），由 `MediaDetailTrack` 决定展示——**禁止把序号拼进歌名**。
- **回归测试**：`test/unit/ui/nativeCollectionDetailContract.test.ts`（歌单/专辑同构、序号独立、heading 专属、筛选区按需）。

## 2. 媒体身份（必须遵守）

1. 歌曲跨音源唯一键 = `getPlaybackSongKey`（`src/utils/appPlaybackGuards.ts:90-96`）：`online:{providerId}:{mediaId}` / `{kind}:{mediaId}`。比较一律用 `isSamePlaybackSong`，禁止直接比较 `song.id`。
2. 集合唯一键 = `collectionKey`（`src/library/core/model/collectionIdentity.ts:21-27`）：`online:{providerId}:{type}:{id}`。**不同音源相同数字 id 不得混淆**（云盘魔法 id `-100` 已在该文件特判）。
3. 任何新代码不得对缺 `sourceRef` 的歌曲假设为 netease（`getPlaybackSourceRef` 的兜底仅服务旧持久化数据，新数据必须显式携带 `sourceRef`）。
4. stage 外部播放请求（`StageExternalPlayRequest.songId: number`）当前只支持网易数字 id——跨音源歌曲禁止走该通道（已知边界，待后续版本扩展）。

## 3. 操作能力（capability-driven）

- UI 侧一切来源差异必须经能力对象表达：
  - 集合层：`collectionCapabilities.ts` + `mutations.capabilities.subscribe` 等（`MobileCollection.tsx:131-141` 按能力渲染收藏按钮）。
  - provider 层：`ProviderCapabilities` 布尔自报 + 「方法存在性推导」（`resolveSearchCapabilities`）。
- **禁止**在歌曲行/页面组件内散落 `providerId === 'xxx'` 分支。现有合理例外（QQ 歌单可编辑曲目、网易云盘）应收敛到能力对象，不得新增同类特判。
- 差异示例的正确表达：
  - 本地音乐 → `staticCollectionResource` + 本地管理 sheet（LocalPlaylistManageSheet）；
  - 只读/每日推荐 → capabilities 中无 reorder/edit；
  - 无损/Hi-Res 标签 → `catalogAudioSpecs`（取最高档）。

## 4. 展示字段最小集（SongRow 契约）

统一歌曲行必须支持的可配置字段：封面、序号（可选）、标题、副标题（歌手·专辑）、时长、音质标签（`catalogAudioSpecs` 最高档，可选）、不可播置灰（`isSongUnavailable`）、正在播放指示、操作菜单（按能力）。

> 当前更正（2026-11-08 双端逐行核实，见 PLAYLIST_DETAIL_PARITY.md）：WebView 侧歌曲行**有**音质标签（`MobileSongSubtitle` 的 `.ml-quality-text`，9px/600，按档配色），与原生侧 `MinimalQualityBadgeText` 同源；真实差异是配色混合比（CSS 各档 52%~58% vs Kotlin 统一 50%），属低风险微调项而非缺失。歌曲行的其余字段（序号/封面/标题/副标题/时长/菜单/置灰/正在播放）两侧均已具备。

## 5. 双投影纪律（WebView ↔ Compose）

每个集合页存在两份投影：DOM 组件与 `NativePageModel` 序列化。修改展示字段时**必须同时改**：

1. `library/suites/mobile/MobileCollection.tsx`（及其子组件）
2. `library/suites/mobile/native/useNativeCollectionPage.ts`

并跑 `npm run check:android-ui`（页面归属门禁）。字段新增漏投影一侧是本架构最高频的回归源。

## 6. 已知债务（记录，不阻塞统一工程）

| 债务 | 位置 | 处理策略 |
|---|---|---|
| `SongResult` 是网易超集（t/fee/privilege 等网易专有字段） | `src/types.ts:1228-1255` | 长期：收敛到 `sourceRef.providerData`；短期不动，避免大规模类型迁移 |
| 每音源一套曲库 hook（useNeteaseLibrary 等 5 套同构） | `src/hooks/` | 待统一为共享曲库会话原语 + 音源适配器；属阶段 E |
| 最近播放两套模型（本地 IndexedDB / 在线 localStorage 24 条） | `localPlayHistory.ts`、`useMobileLibraryStore.ts` | 互不混写是有意设计（文件头注释）；UI 层统一取数入口即可 |
| normalize 无共享 schema（`normalizeSong(raw: unknown)`） | onlineMusic.ts:540 | 记录；TypeScript 层收益有限，暂缓 |
| 本地排序双 store（文件夹/歌单语义不同） | `useLocalTrackSortStore` / `useLocalPlaylistSortStore` | 保留（语义确实不同），UI 层封装统一 API |
