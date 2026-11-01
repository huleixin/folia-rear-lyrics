# 1.3.71 歌词与整单缓存修复记录

## 基线及验收边界

开发前通过 git ls-remote origin refs/heads/main 和 tags 核对，最新为 9a19a31 / tingyu-layout-1.3.70。分支 fix/lyrics-cache-management，版本 1.3.71 / code 94。本次没有修改 NativeAudioEngine、NativePlaylist、播放队列恢复、LSP/Shizuku、相机避让或舞台视觉。

这份构建完成了以下有源码证据的局部修复，并非全部真机验收已完成。用户手机的 72/396 唯一现场根因尚未确认，不能用 24×3 代替证据。

## 72/396 的已知事实与代码证据

1. 原 SmartResourceCacheSettings 只有 mount 时读取和手动刷新，没有订阅或定时更新。因此 UI 显示旧的 72 是确定存在的可能路径，但截图不能证明后台也停在 72。
2. ResourceCacheJobService 原本在 drain 完成后 jobFinished(params, remaining)。remaining=true 是待处理任务，不是失败，却被当成失败重调度；JobInfo 又设 30 秒指数退避。这会让正常每 24 条/90 秒批次也进入失败退避。修复为成功结束 Job，再按剩余任务最早 due 安排普通下一轮。完成后替换旧 pending job，避免同 ID 查重吞掉续跑。系统真的停止 Job 时仍返回 true 尊重系统重调度。
3. 原 schedule 遇到任何 pending Job 就返回，状态也没有表达执行、等待 due 与拒绝调度。新增 lastJobStart/End、lastSuccess、nextRunAt、nextDue、jobState、phase、lastError；异常仅记录类型，不含歌词全文、私密 URL、账号或凭据。
4. 原 platformResult 只看 songKey，无歌单 token；旧歌单回调可能改写同键的新任务。本轮桥接携带 playlistId 并核对。
5. 原 state=1 不检查文件是否还在。现在约 30 秒审计实际歌词磁盘记录、时间轴或有限期 none 与封面文件，丢失时只重置对应任务，成功磁盘资源继续复用。状态读取不直接发起下载。
6. 原生 NOT_FOUND 曾只把行标完成，未在统一仓库保存有限期无词结论，后续无从验证。现在沿原 3 天 none 语义保存原生结论；网络/限流仍不当无词。
7. 原目录补齐的空页可能直接标完整。空页且 hasMore=true 现在保留未完整；恢复沿持久 catalogOffset 继续。

只凭源码不能知道用户手机究竟遇到 UI 陈旧、系统配额、网络限制还是目录失败。新包可用原诊断导出中的 resourceCache 区分：目录 discovered/catalogOffset/metadataComplete、基础 pending/completed/failed、platformPending/platformFailed、Job 时间与真实异常。仍需手机现场日志确认。

## 调度与统计

沿用 JobScheduler 和 SQLite，无新下载框架。保留批次上限 24、90 秒和原请求并发限制。正常批次按 due 接续；受网络策略限制时延后，网络变化监听和插件冷启动会再次安排。原省流量、仅 Wi-Fi 策略保留；系统 quota/Doze/厂商限制仍可能延迟，绝不保证每秒持续运行。

SQLite 升级 v2 新增 lyricState/artworkState，不删除旧任务。基础资源 state 与平台增强 platformDone/Attempt 分开保留。重试失败只重置失败计数和 due；继续缓存不清成功文件。clear 暂停标记持久化，不会重启后立即重下；原手动词与当前/近期保护仍生效。drain 入口加 single-flight，防批次重叠。

卡片全局数现在明确标为“全局歌词记录”，不是三端所有资源完整的歌曲数。基础完成要求本地可用时间轴/明确无词和所需封面；高质量歌词确认及临时词另列。平台增强两次失败后可主动重试，不混在基础失败数中。stats 增加 confirmedLyrics/provisionalLyrics/noLyrics。歌词占用沿原仓库和原生低层缓存真实字节之和，封面沿共享仓库真实字节，下方媒体仍是原音频缓存。不是把 455 与 72 相加。

仍有限制：没有把每种 HTTP/解析/不支持的情况全部迁移成独立持久终态；全局歌曲数目前以歌词文件记录数为准，不能当成“每首所有资源完整”；容量淘汰可能使远端条目重新进入待处理，预算内不能保证无限大的歌单永久同时保留。

## 歌词选择与权威版本

新增 resolveAccurateLyrics，Omni provider 结果发布共享仓库之前调用原 autoMatchBestLyric。保留用户 autoUseBest、preferredAlternativeLyricSource、原评分/歌手/时长/专辑规则与同平台候选。无第二套匹配算法。确认版复用，普通平台是 platform 临时层，高质量匹配是 stage，原生兜底是 native，手选最高。关闭自动最佳匹配时按用户偏好确认平台版。renderModel 保存匹配 source/mediaId 元数据，逐字/翻译沿原模型。

原 cacheSongLyrics 将 platform-cache 直接写 stage，并在已有 stage 时无条件返回，阻挡后续质量升级。现在分层，旧 sourceId=platform-cache 且非手选的磁盘记录迁移为 platform；真正 stage 和手选保留。已有确认版无需进入舞台重新匹配；onlinePlayback/prefetch 确认版跳过重复最佳搜索。

统一哈希对顶层键排序并排除 sessionGeneration/capturedAtMs，会话防串歌代次仍照常传输。旧磁盘重新计算内容指纹；v1 offsetUnknown 的同内容刷新允许显式迁移，防止新指纹去重挡住原始时间轴迁移。renderModel 按内容指纹附着，不被会话代次差异挡住。

手选匹配/导入改为直接 publish 新 payload+userChoice，不再先 mark 旧内容。手选保护在 none/positive 规则前执行，自动请求不能解除它。原仓库写线程增加 fsync。没有建立另一个歌词权威仓库。

原 nativeLyricPriming reset 将 activeFetches 归零但在飞 finally 还会递减，可能计数负数；新 reset 保留占用并加 epoch，迟到回调失效，同键 inFlight 只有当前 promise 可移除。空但未确认纯音乐的 JS 结果不写 none；前端歌词发布同样区分加载空和明确纯音乐。

旧 renderModel 缺失时：逐行和具有真实 rawLyric 的记录可原样解析恢复；无法无损还原的逐字旧记录继续走既有迁移，不造字时序。此处没有证明所有旧 TTML 模型均能无损迁移，也没有完成配置变化时的全面选词版本失效机制。

## 时钟审计

沿用 Media3 原生时钟、SessionClockHeartbeat、既有 LyricTimelineOffset、单曲/全局偏移和 LyricSyncLedger。现有 JVM 模拟时钟/暂停/seek/偏移回归随全套原生测试执行。未改动音频核心，不以哈希相同推导实际同步。

明确尚未完成的验收：真实锁屏/解锁、背屏系统覆盖恢复、WebView 冻结、MediaSession 重新订阅及所有播放速度变化的端到端真机验证。RearNativeTrack 的外推仍有按 1x 增量的代码，需要另行实测是否每次原生位置锚点更新已满足变速场景，不能宣称全部倍率时钟已验证或修好。

## UI

SmartResourceCacheSettings 拆出 useResourceCacheStatus hook 和 ResourceCacheCard 展示。可见时每 4 秒真实读取，隐藏停计时、回前台立即读取、卸载废弃回调；epoch 防旧请求覆盖。操作与轮询互斥，手动刷新保留；刷新不调用下载接口。继续/重试会恢复既有平台增强与目录补齐。确认清理说明保留项目。

布局复用 text-primary/text-secondary 等变量、低透明背景、圆角边框和胶囊开关，不增加背景实时模糊层。标题、说明、设置、进度、统计和按钮分区；真实 progress 元素；状态不能确认显示待确认。StorageSettingsSection 的真实缓存详情网格改自适应 230px 最小宽度、窄屏单列、96px 高度及 44px 触控，操作区不压标题和数字。

新增 resourceCache 探针和 Playwright 用例：320/393/588px、24px 根字体、暗色/浅色变量、72/396进度值、无横向溢出、二次确认；3 条通过。Browser plugin not available，使用常规 Playwright。探针的下方详情使用同 CSS 的代表性结构，未把整个真实设置页连安卓桥在真机跑完；页面卡顿、Android 系统字体放大及触控仍待真机。

## 验证

- TypeScript noEmit 通过。
- 前端 14 文件 167 测试通过，包含原选词、预取、原生歌词补齐、1.3.70恢复及新增4秒可见刷新/旧回调拒绝。
- 原生全套 Release JVM：814 条通过（116报告），涵盖原时钟/偏移、权威词、后台队列和新增内容哈希/分层/批次策略。
- SQLite 仪器用例扩展 396/500 分页、72后剩324和缺文件重排，只编译没有运行。JVM 连续批次策略测试不等于实际 JobScheduler 的30/100/396/500首网络跑完。
- 签名 Release APK 构建与 lintVitalRelease；具体最终校验值在交付记录。
- 没有连接真机；没有实际系统强杀、后台连续整单或变速音频/歌词观测。无功耗收益宣称。

## 回滚

代码从 9a19a31 的独立分支修复，可 cherry-pick/revert 本轮提交，或从 tag tingyu-layout-1.3.70重新构建；若覆盖安装需递增 versionCode，勿卸载丢失用户数据。SQLite仅加列，原旧读取仍可使用；歌词指纹语义变动可能需原入口重新迁移。不自动发布到 GitHub main。

## 实际文件清单

- android/app/src/androidTest/java/io/github/huleixin/tingyu/playback/PlaylistResourceCacheDeviceTest.java
- android/app/src/main/java/io/github/huleixin/tingyu/coloros/FoliaColorOsLyricsPlugin.java
- android/app/src/main/java/io/github/huleixin/tingyu/playback/PlaylistResourceCache.java
- android/app/src/main/java/io/github/huleixin/tingyu/playback/ResourceCacheJobService.java
- android/app/src/main/java/io/github/huleixin/tingyu/playback/ResourceCachePolicy.java
- android/app/src/main/java/io/github/huleixin/tingyu/playback/TingyuPlaybackPlugin.java
- android/app/src/main/java/io/github/huleixin/tingyu/playback/UnifiedLyricPolicy.java
- android/app/src/main/java/io/github/huleixin/tingyu/playback/UnifiedLyricsStore.java
- android/app/src/test/java/io/github/huleixin/tingyu/playback/UnifiedLyricPolicyTest.java
- package-lock.json
- package.json
- src/components/modal/OnlineLyricMatchModal.tsx
- src/components/modal/settings/SmartResourceCacheSettings.tsx
- src/components/modal/settings/StorageSettingsSection.tsx
- src/hooks/useColorOsLyricFeed.ts
- src/hooks/useLibraryPlaybackController.ts
- src/platform/foliaColorOsLyrics.ts
- src/services/collectionResourcePrecache.ts
- src/services/nativeLyricPriming.ts
- src/services/onlineMusic/omni.ts
- src/services/onlinePlayback.ts
- src/services/platformResourcePrecache.ts
- src/services/prefetchService.ts
- src/services/sharedSongResources.ts
- src/types.ts
- test/unit/hooks/colorOsLyricFeed.test.ts
- test/unit/services/nativeLyricPriming.test.ts
- test/unit/services/platformResourcePrecache.test.ts
- test/unit/services/sharedSongResources.test.ts
- android/app/src/test/java/io/github/huleixin/tingyu/playback/LyricResourceUpgradeTest.java
- dev/probes/resourceCache.probe.tsx
- docs/android-1.3.71-lyrics-cache-audit.md
- src/components/modal/settings/resourceCacheSettings.css
- src/components/modal/settings/useResourceCacheStatus.ts
- src/services/resolveAccurateLyrics.ts
- test/component/resourceCache.spec.ts
- test/unit/hooks/resourceCacheStatus.test.ts
- test/unit/services/resolveAccurateLyrics.test.ts

## 构建校验

APK 39,090,906 字节；SHA-256 1CEAF4611B4E5CDD2AE2D589333DA545D162FFF4B7D647F9C0D7322E1BCB45B2。包名 io.github.huleixin.tingyu，versionCode 94，versionName 1.3.71；apksigner 验证通过，原证书 SHA256 a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d。最终 assembleRelease 与 lintVitalRelease 成功，814 JVM 零失败。
