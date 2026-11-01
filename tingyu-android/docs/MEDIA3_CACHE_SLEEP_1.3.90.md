# v1.3.90：Media3 优先、缓存适配与双通道定时关闭

基线：最新主分支 `a04b277`，即 v1.3.89 最终提交。版本 1.3.90 / versionCode 113，包名 `io.github.huleixin.tingyu`。保留此前歌曲身份、播放代次、事件 revision、单调播放锚点和歌词仓库，不创建第二个播放器或播放时钟。

## 已确认的根因

| 源码缺陷 | 本轮处理 |
| --- | --- |
| `useNativeAudioDeck` 的 `compatibility.current` 只会置 true；音效、Blob 或一次失败可以锁住整场会话 | 移除会话锁。用户选择、原生能力、功能限制、实际内核和本次失败分别判断 |
| 解码失败调用 `setSupported(false)`，把单曲失败误当成设备能力消失 | 原生能力只来自 probe；临时失败绑定既有歌曲 key + `playbackGenerationRef`，新播放代次重新尝试 |
| 原生 `onPlayerError` 可以在 JS 收到错误之前降级或跳过歌曲 | 明确解码错误先提供 1.5s 接管机会；JS 必须向原生认领当前 source/song/retry generation，成功后才回退；无人认领则保留原有有界错误处理 |
| 回退错误也会流入普通 React URL 恢复入口，造成两条恢复同时执行 | 对已认领的解码回退使用 capture 阶段消费错误；网络/鉴权错误继续原恢复路径 |
| Blob 只属于 WebView，Media3 的 DefaultDataSource 无法打开 `blob:` | 逐块复制当前选中 Blob 到原生私有 scratch 文件，交给既有 FileDataSource 路线 |
| 有正确 LX source/quality 缓存键，但在线播放入口对选中 LX 时一律不读缓存 | 读取脚本 id、音质、provider-aware song key 对应缓存；该路径禁止 legacy/platform 回退 |
| 定时器 start 要求存在 ExoPlayer 当前项；detach 又直接 cancel | 原生截止时间继续唯一；输出端口可为 Media3 或当前兼容 renderer，内核切换不取消任务 |
| 兼容曲尾会直接触发 JS 下一首，浏览器 repeat 或提前混音还能绕过曲尾 | 曲尾先向原生查询；等待结束时设置 repeat barrier，阻止新混音并撤回已 armed 的提前切换 |
| 原生直接投递暂停无法证明兼容音频已停止 | 原生 pending → JS 原生复核 → 暂停媒体元素和 DSP → 原生 ACK，确认后才 completed |
| 重建 Activity 后旧兼容 lease 仍占用控制器 | 销毁 bridge 时仅退休该 WebView 的 lease，保留进程内定时截止时间，允许新页面重新接管 |

这些是代码和测试能证明的缺陷。真实设备解码覆盖率、锁屏准点程度、系统回收后的音频行为仍属于待验证范围。

## 内核状态迁移

| 条件 | 决策 |
| --- | --- |
| 用户固定兼容 | 保持兼容，不自动 probe/切回 |
| 原生能力可用，无功能限制，本次无失败 | 优先 Media3；http/content/file/可暂存 Blob 均可尝试 |
| 均衡器 / 自动混音 / ReplayGain 开启 | 兼容，并显示具体功能原因；关闭后可以切回原生 |
| 已确认的解析/解码/音频输出错误，原生认领仍有效 | 仅本次播放使用兼容；同曲 URI 刷新不清除本代次失败；重新播放/下一首使用新代次 |
| 普通网络、超时、地址过期、取消 | 不改变原生能力，不改为解码回退 |
| 缓存桥容量/格式/访问失败 | 记录 `cache-bridge-unavailable`，本次安全使用原 Blob 的兼容通道 |
| 旧内核停止未确认 | 阻止启动新内核并提示；不同时播放、不无限互切 |

原生 → 兼容：保存原 source/key、位置、音量和播放意图，移除前台 transport 所有权，等待 native detach 成功，再给浏览器 src。兼容 → 原生：程序化暂停使用现有 pause 标记保留用户意图，暂停所有浏览器 deck、停止混音资源并等待 AudioContext suspend，再确认 lease 释放，最后准备 Media3。初次 probe 晚于 source 时，消费 App 已有 autoplay ref，不额外发明自动播放状态系统。

`requestedPlaying` 是适配器对已发 Play/Pause 意图的镜像，不是实际播放事实或第二个时钟。真实播放、速率、Seek、MediaSession 和背屏仍沿用 v1.3.89 数据流。旧引擎事件、重复 revision 和歌词过期回调的保护未移除。

## 缓存方案与边界

1. 原缓存仍是 Dexie/IndexedDB `media_cache` 中的 Blob，音频键以 `audio_` 开头；既有 legacy NetEase 按需读取/回写保留。未扫描、清空或迁移整个库。Electron 继续其原有文件缓存。
2. LX 键形如 `audio_lx_<script>_<quality>_<provider-aware-song>`；读取时固定 key 和 legacy 候选列表，显式传递请求音质。不同脚本、平台和音质不交叉命中。
3. Android 播放当前 Blob 时取得 Blob handle，只对每片执行 `slice(...).arrayBuffer()`。单片 **64 KiB**，逐片等待 native ACK；没有完整文件 `arrayBuffer()`，也没有原生向 JS 返回大型 Base64。Capacitor JSON 通道只携带这一片 JS → native 的 Base64 编码，非整文件编码。
4. `AudioCacheStaging` 在专用 I/O executor 写私有 `cacheDir/audio-bridge-v1`，校验 token、顺序 offset、片长、预期总长，`.part` 只有完整写入后才原子改名为 `.audio`。调用者不能指定文件路径。Media3 继续使用现有 DefaultDataSource 的 file URI 读取和 Seek。
5. 最多 3 份租约，每份上限 **256 MiB**，不足 16 KiB/文本报错内容拒绝暂存。容量不足不驱逐正在使用的文件，按本次失败安全回退。原生接受新源后释放旧租约；detach 确认后释放当前租约；新进程清理这个专用目录的旧 scratch。系统清理 scratch 不会删除原 IndexedDB 缓存。
6. 该副本仅是读取适配，不是 SimpleCache，也不是新的持久缓存库。没有网络重下载、HTTP 服务、新权限或公开 ContentProvider。系统缓存目录可被系统回收，原数据仍可再次暂存。
7. 新下载的 206 分段响应，以及未编码但 Content-Length 不匹配的响应，不再作为整首音频入库。已有无完整性元数据的历史 Blob 无法仅靠长度证明无损；格式/解码失败仍由本曲回退和既有 cache distrust + 有界重新取源处理，不能宣称检测出所有旧截断文件。

容量审计：原 browser 缓存按分类清理；设置中的 GB 上限在现有 `audioCache.ts` 只传给 Electron，并非 Android IndexedDB 的硬配额。本轮没有替用户改配额或驱逐数据；新增 scratch 有上述独立硬上限。

离线边界：WebView 已读出当前缓存 Blob 后，Media3 解码/位置/后台输出不依赖持续 JS。纯 IndexedDB 中**尚未读取**的后续歌曲，在 JS 完全冻结时仍不能凭空由原生读取；既有原生资源缓存/解析器和队列路线保留。本轮没有声称把整个 IndexedDB 库变成了原生离线队列。

## 双通道定时可靠性

仍只有 `SleepTimerState` 的 elapsedRealtime deadline、generation、AlarmManager、持久化与发布。`SleepTimerOutput` 仅负责输出所有权和暂停确认，不计时。

| 模式 | Media3 | 兼容通道 |
| --- | --- | --- |
| 时间到立即暂停 | 原生立即 pause，确认 playWhenReady=false | 原生请求当前 renderer 暂停，媒体元素 + DSP 都确认后 completed |
| 当前歌曲结束暂停 | 现有 pauseAtEndOfMediaItems barrier | 原生开启 browser repeat barrier；ended 被捕获，原生裁决后停止，不再交给下一首 |
| 时间到后播完当前歌曲 | 到期原生设置等待 barrier | 到期原生设置相同等待状态，再由兼容曲尾裁决 |

暂停请求以 lease + native generation 校验。JS 先 `pause-check`，再暂停并 suspend DSP，最后 `pause-ack`；旧请求、旧 renderer ACK 和取消后的回包不能完成新任务。确认前状态为 pause-pending；2 秒未确认显示 pause-unconfirmed，最多 3 次事件驱动尝试；回到前台允许受控重试，没有轮询 renderer。未确认不会显示“已暂停音乐”。曲尾 bridge 不通时保守停止自动续播并给出错误。

内核切换不改变 timer deadline/generation，旧输出 ACK 不对新输出生效。Activity 重建仅退休旧 lease，进程内任务保留；**进程死亡**则沿用旧策略，以 interrupted-process 取消旧任务，不在新进程重放旧播放。用户偏好键和定时页面设计未改。

不能保证 renderer 被系统冻结/杀死时，兼容输出能够精确按时暂停。现有 `setAndAllowWhileIdle` 在 Doze 也不是精确闹钟。没有设备，无法给出这类成功率或延迟数据；本轮交付的是原生截止时间、真实确认与明确失败路径，不是后台准点承诺。

官方边界：[WebView.evaluateJavascript](https://developer.android.com/reference/android/webkit/WebView#evaluateJavascript(java.lang.String,%20android.webkit.ValueCallback)) 是异步调用；[AlarmManager](https://developer.android.com/reference/android/app/AlarmManager#setAndAllowWhileIdle(int,%20long,%20android.app.PendingIntent)) 不等于精确执行保证。

## 修改入口

- `useNativeAudioDeck.ts`、`App.tsx`：选择、代次、串行交接、播放意图和 DSP 释放。
- `nativeAudioElement.ts`、`nativeAudioCache.ts`、`AudioCacheStaging.java`、`TingyuPlaybackPlugin.java`：受限缓存读取桥及租约。
- `onlinePlayback.ts`、`resourceCache.ts`、`mediaCacheGuard.ts`：缓存来源/音质与完整响应约束。
- `NativeAudioEngine.java`、`DecoderFallbackOffer.java`：原生错误先认领、过期拒绝、有界回到原错误处理；detach 取消旧在途续播。
- `SleepTimerController.java`、`SleepTimerOutput.java`、`CompatibleSleepOutput.java`、`compatibleSleepOutput.ts`、`nativeSleepTimer.ts`：统一定时和输出确认。
- `useAutomixDecks.ts`：等待曲尾时抑制提前切换。
- `buildDiagnosticReport.ts`、三份既有 locale：准确输出选择/实际内核/原因，更新旧的“会话锁定/缓存必走兼容”说明，无布局变化。

主题、Liquid Glass、导航图标、舞台视觉/动效、LSP/Shizuku 实现、歌词统一仓库、播放列表持久化格式均未修改。播放桥增加的可选字段不替代已有身份与 revision。

## 验证记录

| 检查 | 实际结果 |
| --- | --- |
| TypeScript | 通过 |
| 前端相关大回归 | 268 文件通过、1 跳过；2575 测试通过、1 跳过 |
| 附加混音 / 定时偏好 / 主题回归 | 26 文件、425 测试通过 |
| Android JVM | 858 测试、0 failures、0 errors |
| `assembleDebugAndroidTest` | 编译通过，未运行 |
| Release | 构建通过；最终包上传前再次核对包名、版本与证书 |

首次新增“失败后下一首应回原生”的回归在旧代码实际失败，再进行修复。新增覆盖：50 次混合来源/重复身份/解码失败/网络错误的 Hook 压力、功能限制开关、旧输出 detach 延迟、冷 probe 的 autoplay、native decoder offer 认领、离线 Blob → 私有文件 URI → detach 释放、分片取消/乱序/容量/未完成写入、LX key 隔离、两类输出三模式的同一状态策略、旧 ACK 与错误 lease、曲尾阻断、DSP 未完成不得 ACK。既有 10/30/50 首原生续播、防过期歌词、两小时虚拟时钟、主题/路由相关测试继续在回归集合中运行。

跳过项是默认关闭的真实歌词源网络审计。上述是模拟与纯逻辑/桥接测试，**不是 50 首真实音频输出、真实锁屏或两小时实测**。新增仪器测试覆盖私有文件 DataSource 读取/Seek，以及无 Exo 时兼容 timer 可启动、无 renderer ACK 不得完成；仅证明编译成功。`adb devices` 没有设备。

## 真机验收与诊断

请同签名覆盖安装，不卸载、不清数据。至少分别测：

1. 默认原生：在线和已有缓存、断网缓存、坏缓存、同曲重播、快切、随机/循环；记录实际引擎及原因。
2. 一首解码不兼容歌曲回退后，下一首恢复 Media3；慢/冻结 JS 时原生错误处理有界，不永久等待。
3. 固定兼容以及 EQ/Automix/ReplayGain 开关，核对音效仍有效，进度和歌词不重置、不双响。
4. 两个内核各测三种 timer 模式；期间切内核、Pause/Resume、Seek、重复单曲；到期后不能被自动续播拉起。
5. 锁屏、退后台、Activity 重建、系统 renderer 冻结/回收；对照到期时间和实际声音停止时间，区分 completed 与 pause-unconfirmed。
6. 50 首连续播放，核对正面舞台、背屏及灵动岛当前身份；LSP/Shizuku 路线分别跑，不同时争抢显示。

沿用“设置 → 背屏歌词 → 使用说明 → 展开诊断 → 导出诊断数据”。报告包含 selected/actual/reason；原生轨迹包含 decoder-offer-claimed/timeout、timer output、generation、pausePending 和 attempts，不添加 Token、Cookie 或完整播放地址。

## 提交、回滚与安装兼容

- `e686cc1`：缓存分片桥、来源与完整响应守卫、适配器测试。
- `70d6be9`：原生错误认领、双输出 timer、renderer 租约与回归。
- `3aa0ddc`：按播放代次选择、交接、autoplay、原因和文案。
- 发布提交：版本元数据和本报告。

这些提交按依赖拆分；不要单独撤销原生新协议而保留依赖它的新 Hook。完整回滚时按发布提交 → 3aa0ddc → 70d6be9 → e686cc1 逆序 revert，再以**更高 versionCode、原签名**构建覆盖包。不要卸载或删除缓存。新增持久数据仅 scratch，原账号、缓存库和播放列表不需要迁移。

发布证书 SHA-256：`a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d`。APK 文件哈希及下载入口见对应 GitHub Release。
