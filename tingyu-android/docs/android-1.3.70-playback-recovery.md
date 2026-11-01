# 听屿 1.3.70：播放队列持久化与恢复

基线：最新已发布的 tingyu-layout-1.3.69（2dd0bc0）。本轮分支 feat/playback-session-recovery。版本提升为 1.3.70 / versionCode 93，未更新依赖。

## 审计结果

- 原 JS persistPlaybackCache 分别保存 last_song / last_queue，主要用于歌曲和队列显示；没有完整的进度、随机计划或原子跨键提交。Android 首次升级只在原生快照真正不存在时迁移这两个键。
- NativePlaylist 已保存进程内逻辑顺序，Media3 已原生推进下一首；本轮没有修改 NativePlaylist 或它的推进算法。
- NativeAudioEngine 已有只接管相同歌曲和地址的 adopt 入口。复用它连接新前台，不新增重建或重播路径。
- FoliaPlaybackService 已有稳定的原生会话和时钟链路，本轮未修改。
- 1.3.69 已有统一歌词和封面仓库。本轮恢复只读取原共享歌词入口、缓存主题及现有封面读取链路，没有增加歌曲资源缓存。

## 恢复和保存规则

1. 运行中以实际 Media3 歌曲、进度、暂停状态和原生模式为准。启动恢复完成前拦住空白 JS 状态及默认队列/模式同步。复用现有 URI 只用于接管当前运行中的实例，不写入持久快照；接管不额外发送 play / pause / seek / detach。
2. 整个进程冷启动、且没有有效运行实例时，恢复完整逻辑队列、当前歌曲、模式和进度显示，默认暂停。即使原实验设置开启启动自动播放，Android 本路径也不自动播放。恢复不会为显示元数据启动前台服务。
3. 用户主动播放才调用原 restorePlaybackSourceForSong / Omni / 本地 / Navidrome 解析入口，重新取得地址。洛雪暂时不可用时保留队列，不因未就绪删除歌曲。当前歌词和封面仍走既有共享资源缓存；缺失资源由原管线按需处理。
4. 队列原始顺序和已确定随机顺序分别保存。恢复时原子提交队列与歌曲，防止暂态空歌曲污染随机历史。保留整轮随机计划，超过原有 256 条 Previous 历史上限仍可恢复确定顺序；正常的随机选择、上一首和下一首算法不变。随机下的循环标志也保留。
5. 相同 songKey 按首次出现去重，源不同的歌曲仍由原 songKey 区分。身份不匹配的损坏条目跳过；当前条目缺失则选首个有效条目并归零，不能把旧进度套给另一首。歌曲已从本地删除或音源无效时，使用原解析器的失败提示，保留其余队列。
6. 主动暂停后仍恢复为暂停。主动 Clear 写入清空标记，保留当前仍在播放的歌曲是原产品语义，但下次冷启动不复活清空前的队列。主动 Stop 另存停止标记，下次冷启动不恢复该停止会话；运行实例尚在时仍按其真实暂停状态显示。
7. 队列、当前歌曲、模式或来源变化时保存完整结构。换歌、暂停、拖动、模式变化及时记录原生位置；持续播放每 20 秒记录小游标。20 秒定时任务不重复序列化或重写未变化的歌单。兼容通道复用 DOM 事件捕获和相同小游标入口。
8. 没有每秒写完整歌单，没有新增 WakeLock、播放器、MediaSession、后台音频启动或高频恢复轮询。正常播放、Folia 舞台视觉、歌词时钟、偏移、灵动岛协议、LSP 和 Shizuku 均沿用原链路。

## 存储、仲裁与故障

私有 files/playback-session 中保存 v1 queue.json、cursor.json、intent.json 及对应备份。队列包括稳定身份、来源引用、必要元数据、原始顺序、确定随机顺序、当前键、模式、歌单描述和版本/修订。游标包括 queueId、当前键、毫秒进度及暂停/停止信息。歌词、封面原始文件、实时歌词行和逐字进度不放入快照。

所有磁盘操作使用一个进程级 IO 线程。临时文件写完并同步文件描述符后替换，保留有效备份；从备份恢复后，不会将损坏主文件反过来覆盖好备份。清空/停止标记防止旧备份复活用户明确结束的会话。游标只对匹配 queueId 且仍属于队列的歌曲生效。写入失败保留旧有效状态，并记录失败，不能中断声音。

JS 保存串行、待处理请求以较新请求为准，并带原生修订号；原生拒绝旧修订及与实际播放歌曲冲突的 JS 当前项。写完整快照时再采一次真实原生位置，防止旧 UI 位置覆盖现状。未知的未来格式不会当成空存储迁移旧缓存，默认空白启动也不自动覆盖它；用户新建会话后才保存新状态。单文件预算 32 MiB，超限记录失败，不无限扩容。

来源描述复用现有 collection 入口，在线、本地和 Navidrome 保留可用的歌单标识及元数据；没有歌单描述的临时播放队列保留主播放上下文。不会依赖历史临时音频 URL 播放。

## 实际修改文件

| 文件（相对 App 根目录） | 改动 |
|---|---|
| android/app/src/main/java/io/github/huleixin/tingyu/playback/PlaybackSnapshotStore.java | 新增原子版本化快照、独立游标、备份和清空/停止保护、修订仲裁 |
| android/app/src/main/java/io/github/huleixin/tingyu/playback/PlaybackSessionPersistence.java | 新增低频被动观察及单线程写入 |
| android/app/src/main/java/io/github/huleixin/tingyu/playback/NativeAudioEngine.java | 只读会话快照；事件处被动记录；Stop 意图记录；不调整播放推进 |
| android/app/src/main/java/io/github/huleixin/tingyu/playback/TingyuPlaybackPlugin.java | 增加读写/游标桥接及现有原生顺序、模式变更的保存 |
| src/services/playbackRecoverySnapshot.ts | Android 启动门控、轻量歌曲快照、写入去重/顺序和原生修订 |
| src/services/androidSessionRecovery.ts | 恢复计划、一次性进度和显示保护、身份及模式检查 |
| src/hooks/usePlaybackSessionPersistence.ts | 队列/模式/来源事件和 20 秒游标；忽略舞台及默认空启动状态 |
| src/hooks/useSessionRestoreController.ts | Android 冷恢复/运行实例复用；其他平台继续原机制 |
| src/hooks/useNativeAudioDeck.ts | 首次重新解析后的 source 采用恢复位置；复用原 prepare 参数 |
| src/components/app/playback/restorePlaybackSource.ts | 记住解析请求，但冷启动不执行；用户点击后复用原重试入口 |
| src/services/nativePlaybackBridge.ts | 拦住启动空状态，冷恢复没有音频地址时不发布前台服务 |
| src/services/nativePlaylistSync.ts | 启动期间及未变更的运行会话禁止初始化覆盖 |
| src/services/shufflePlayback.ts | 保存/读取完整确定计划，不重新随机 |
| src/services/playlistResourceSnapshot.ts、collectionResourcePrecache.ts | 复用歌单来源描述，资源缓存和调度策略不变 |
| src/App.tsx | 接入保存 hook；恢复元数据到达时不把显示进度归零 |
| test/unit/services/playbackSessionRecovery.test.ts | 新增恢复策略、来源、乱序、去重、版本/修订、清空和轻量写入测试 |
| test/unit/hooks/playbackSessionRecovery.test.ts | 新增冷启动、活动会话、暂停、低频事件和启动竞态测试 |
| test/unit/hooks/nativeAudioDeck.test.ts | 补冷恢复毫秒参数和运行实例安全接管回归 |
| android/app/src/test/java/io/github/huleixin/tingyu/playback/PlaybackSnapshotStoreTest.java | 新增真实临时目录的原子文件、备份、损坏、停止、清空、顺序和进程式重开测试 |
| package.json、package-lock.json | 仅提升版本元数据 |
| docs/android-1.3.70-playback-recovery.md | 本报告 |

## 测试与真机边界

已通过 165 项相关前端测试（17 个文件）、TypeScript 检查、Capacitor 正式资源构建。前端覆盖完整 100 首队列、第 38 首进度、冷恢复不解析/不自动播放、活动实例接管、暂停、启动竞态、随机顺序、超过 256 条历史的 400 首计划、洛雪身份和解析参数保留、缓存和原有播放控制回归。

原生文件测试实际创建文件、写游标、重新构造仓库实例，模拟进程丢失内存；覆盖 100 首第 38 首、随机和循环、坏主文件/坏全部文件、未来格式、缺失格式头、备份修复再次损坏、清空防复活、停止与停止早于队列提交、旧修订、错误当前键及旧 queueId 游标。它不是手机 OS 强杀测试。

未连接手机，未执行 adb。Android 仪器用例只编译，未运行。以下仍需真机验证：

- 真实进程死亡/系统回收后打开 App：100 首歌单第 38 首恢复为暂停，位置误差通常应不超过最后一个 20 秒检查点及未完成 IO；立即断电/强杀可能丢失最后一次尚未提交的事件。
- Media3 后台仍在播放时只重建 Activity：音频持续，不回退，不重播，不重建播放器。自动化已检查接管参数和没有附加传输指令，但无法证明真机听感完全无断音。
- 洛雪脚本和各平台会话真实初始化、重新取流、已删除本地文件或存储授权失效；测试仅证明恢复身份、队列保留和调用时机，不证明外部音源可用性。
- 长时间锁屏通知栏控制、省电/系统冻结、磁盘接近满、系统强杀的实际时序。

没有修改锁屏歌词或渲染生命周期，也不据此宣称锁屏歌词消失问题已修复。本轮未进行功耗实测，不宣称电池收益。
