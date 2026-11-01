# 1.3.69 三端资源缓存与整单预缓存

基线为 GitHub 最新发布标签 tingyu-layout-1.3.68，提交 aec35f3。本机原分支为 1.3.39，新分支从最新发布建立。远端 main 落后于发布标签，因此没有用旧 main 覆盖新代码。GitHub 基线 package-lock 顶层仍为 1.3.50，本次先对齐 1.3.68，再通过原发布脚本提升至 1.3.69 / versionCode 92，未更新依赖版本。

## 原有能力与扩展

| 模块 | 已有能力 | 本次扩展 |
|---|---|---|
| NativeAudioEngine / NativePlaylist | Media3、原生逻辑队列、实际顺序 | 两个模块未修改 |
| SongInfoLoader | 当前曲独立取词、后两首预取、发布代次检查 | 实际后十首；当前封面独立通道；冷却表随窗口清理 |
| NativeLyricsRepository | 原生 LRCLIB / 酷狗兜底、原始时间轴、3 天负缓存，失败不写负缓存 | 同曲请求合并、原生两路上限且后台最多占一路、Retry-After 冷却、16 MiB 字节预算 |
| UnifiedLyricsStore / UnifiedLyricPolicy / LyricTimelineAuthority | 唯一持久权威、native / stage / userChoice 仲裁、F5/F6 原始时间轴 | 原子仲裁、32 MiB 自动缓存预算、保留手动记录、none 有限期；同一记录附着可选无损显示模型 |
| NativeArtworkRepository | 12 MiB 内存 LRU、768px JPEG、单响应 6 MiB、按歌曲键保留 60 张 | 按资源身份共享文件、single-flight、两路下载且后台最多占一路、192 MiB 磁盘预算、当前及近期保护 |
| ColorOsLyricBridge / FoliaPlaybackService | 既有单个 MediaSession、元数据与原生封面发布 | 服务未改；增强当前曲时请求既有刷新 |
| RearNativeLyricLines / RearLyricsWebClient | 权威仓库读取、代次检查、原有背屏状态链 | 读取同一记录的完整逐字模型，交付点应用一次原有偏移；图片复用同一文件仓库 |

没有第二个歌词权威仓库。原 NativeLyricsRepository 文件仍是可重新取得的低层取词缓存，不能裁决 stage / userChoice。媒体时钟、当前位置、当前歌词行和逐字进度不持久化到资源缓存。

## 三端读取

- 正面：sharedSongResources 经既有 TingyuPlayback 插件读取 UnifiedLyricsStore；Omni 和歌曲资源入口先查共享记录。资源增强按 songKey 核对，仍经过 App 原有歌词过滤、简繁转换入口。旧 stage 记录缺少无损模型时，从原 UI 缓存/provider 迁移，避免 TTML、部分逐字模型降成逐行 LRC。
- 背屏：版本仍由 LyricTimelineAuthority 选择；RearNativeLyricLines 优先读取相同记录的完整行、词、翻译模型，只在交付点平移一次原有用户偏移。未修改布局、动画、相机避让及窗口启动。
- 灵动岛：继续使用既有 MediaSession / HyperLyric / LyricInfo 发布；协议可表达的逐字 lane 保持原规则，未改协议。FoliaPlaybackService 使用扩展后的原生封面仓库。原生读取不依赖主 Activity 或 WebView。
- 无损显示模型在同一个 UnifiedLyricsStore 记录内，并校验原始 payload。缓存读回的 native 兜底不会因为显示到舞台就错误升级为 stage。自动任务不覆盖用户选定版本。

## 完整歌单与调度

playlistResourceSnapshot 分页发送完整逻辑队列，不使用 Media3 的已解析播放地址窗口或当前曲之后的尾段。单页最多 50 条。手机歌单未加载完便播放时，collectionResourcePrecache 使用现有 Omni 集合分页取得其余曲目。manifest 持久化集合身份、分页 offset、预期数量和目录完整标记；重建后可续抓缺页。

SQLite 持久任务表按 P0 当前曲、P1 实际后十首、P2 其余全部曲目排序。每次只读一条任务，不为整单创建数百个 Future 或 Bitmap。随机顺序和跳歌沿用 NativePlaylist.lookahead。切换歌单使旧 manifest 失效；旧任务只能留下自己歌曲的缓存，不能修改新任务进度或当前歌曲发布。

Android JobScheduler / JobService 提供持久、带网络条件的延后执行。一个执行片段最多处理 24 首或约 90 秒，再交还系统；正在进行的有超时网络调用可能稍晚结束。当前歌曲保留原 SongInfoLoader 的独立通道。原生歌词、图片各最多两路，后台各最多占一路。

前台空闲时，platformResourcePrecache 从同一任务表一次取一首，经现有 Omni 歌词接口补充平台逐字、翻译等高保真版本。仅一个串行增强循环；普通 Omni 同曲请求也合并。WebView 暂停时，原生 Job 继续处理已取得目录的任务。

Doze、强停、厂商后台限制、系统任务配额和省流量可能延后执行。尚未取得的目录页以及仅在 JS provider 实现的高保真增强，恢复前台后继续；不会为它们持续唤醒 WebView。已缓存资源的原生读取不受这项 JS 执行限制。

## 容量、网络及清理

封面共享覆盖前台 WebView、ServiceWorker、既有原生 HTTP 图片桥、Compose 私有受限 ContentProvider 和媒体会话。已知公共封面 CDN 可以按需下载；其他平台通过明确的原生图片调用入库，WebView 对未知地址只复用已存在的图片文件，不发起任意 GET 图片代理。登录、扫码和任意本地文件路径不进入下载拦截。未知 URL query 保留身份意义，不按歌名去重。同专辑可共享文件。已知 CDN 先选较大封面再降采样，避免首先加载的缩略图限制舞台清晰度。

普通封面预算 192 MiB，统一歌词自动缓存 32 MiB，原低层歌词缓存 16 MiB；活动 manifest 另占 SQLite 空间。原有 Coil 只给其他非共享资产保留 16 MiB；共享封面显式禁用 Coil 磁盘副本。每八次写入检查预算，避免逐首全盘扫描，允许一个检查批次的临时超额。当前及实际近期资源受保护；用户手动歌词不参与普通淘汰，用户主动保存的资源、音频和设置不属于本次清理。

同一封面在飞请求合并，命中直接用文件，批量预取不保留 Bitmap。失败、限流、磁盘写失败和确实无词分别处理。原生任务三次以内退避，429 尊重 Retry-After；平台增强有界尝试并延后。成功资源跳过下载。没有新增音频文件预下载、无限 WakeLock、高频轮询或整屏 GPU 图层。

存储页面增加默认开启的整单预缓存、仅 Wi-Fi、占用和清理动作。默认允许移动数据，后台尊重 Android 省流量。状态在打开/手动刷新时读取，不按每首下载触发整个 Compose 页面更新。

完成数是当前 manifest 已完成任务数；容量不足后，远处自动资源仍可被淘汰。实际读取始终检查真实缓存，不依赖这个完成标志。超大歌单不无限扩容。手动歌词可使占用超过普通自动缓存预算。

## 验证矩阵与边界

| 验收项 | 自动化与真机边界 |
|---|---|
| 30 / 100 / 200 首，额外 1001 首分页 | Vitest 检查完整条目、50 条上限；平台增强 30 / 100 / 200 首全部处理且并发为 1；新增真实 SQLite 仪器用例 |
| 当前曲、后十首、跳歌、实际顺序 | 新增纯策略测试、既有 NativePlaylist 测试、新增 SQLite 优先级仪器用例 |
| 正面、背屏、灵动岛同一版本 | 既有权威/仲裁回归；新增模型绑定与背屏同模型偏移用例；系统端真实呈现仍需真机 |
| 不重复联网、封面串图 | 身份与安全路径单测；新增 Android 20 个同图并发只下载一次、磁盘再读和旧地址拒绝用例 |
| 换歌单、随机和手动跳歌 | 既有原生逻辑队列及新快照测试；端到端 UI、锁屏切歌待真机 |
| 重建、断网使用缓存 | JVM 200 首真实文件重开；SQLite 持久仪器用例；Android 生命周期/断网连播待真机 |
| 偏移、逐字与翻译 | 原有全局/单曲偏移与 offset 标签回归；新增原始词时间往返、背屏只交付时平移测试 |
| 用户选定歌词保护 | 200 首磁盘重开后，手动记录不被后台和清理覆盖 |
| 429、超时、无词、预算不足 | 既有取词/权威策略、新 Retry-After 与字节淘汰保护；真实 CDN/系统省流量待真机 |
| 长时间内存、任务数、磁盘与电量 | 设计有界；没有真机长时间测量，不能给出耗电下降或无增长结论 |

本轮通过 145 项前端相关回归（16 个文件）、TypeScript 检查、798 项 Android Release JVM 单测（114 份测试报告）、4 个 Android 仪器用例源码编译，以及签名 Release 构建和 lintVitalRelease。仪器用例只编译，未连接真机执行；浏览器不能证明 Android GPU、后台任务与三端交付结果。数量及 APK 校验值见交付说明。

## 诊断与锁屏独立风险

播放诊断增加 resourceCache：playlistId、已发现/预期目录、目录是否完整、任务完成/失败数、当前歌曲摘要、权威时间轴是否具备、版本以及封面能否本地读取。任务事件记录优先级、歌词/封面来源、结果、重试次数；原有 LyricSyncLedger 的交付、渲染心跳和 verdict 保留。

资源不存在/下载失败属于供给问题；本地资源完整但 MediaSession、SystemUI 或背屏不显示属于交付/渲染问题，必须对照两组证据。缓存完成不能证明锁屏歌词消失已修复。系统后台政策、显示端生命周期、模块交付仍有独立真机验证风险。

APK：Tingyu-Android-v1.3.69.apk，39,066,271 字节。SHA-256：ED39307A4B848F2767F72DA18D5EB36942C81C0F56A45429B7D6F2292506EA15。原发布签名证书 SHA-256：a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d，APK v2/v3 验签通过。
