# 现有诊断审计与性能边界

审计基线：1.5.40 / versionCode 255，fe7cf399d110cde368387c928b85ee197562fa1f。
本专项在此基线上未提交施工；构建会标记 dirty，不能把基线 commit 当作本次全部源码。

| 领域 | 现有能力及本次复用 | 云端范围与限制 |
|---|---|---|
| 前端事件 | diagnosticLog.ts，400条环形、160KB本机持久化、同类1秒节流、批量原生转发 | 只传有限结构化事件；不传完整手动报告 |
| 原生事件 | diagnostics/DiagnosticLog.java，背景单线程有界队列，512KiB分卷、3会话/2MiB磁盘上限 | 后台读取前一会话160K字符及当前环形，合并去重后只取500条 |
| 原生播放 | PlaybackDiagnostics、NativeAudioEngine.onPlayerError 的Media3错误、重试、状态轨迹 | 保留错误码、位置、重试、HTTP状态、通道；丢弃host、URL、歌曲标识、授权数据 |
| 兼容播放与音源 | onlinePlaybackDiagnostics、统一source/playback事件、加载失败与通道切换 | 白名单过滤；不包含完整请求/响应、平台账号或鉴权URL |
| 闪退 | CrashDiagnostics JVM处理器、JS错误/拒绝、renderer故障、API30+退出历史 | 本次增加持久化版本/code/commit、代码帧脱敏和递归保护；本机20条/栈12K，云端10条/256帧 |
| 启动失败 | 既有heartbeat、启动阶段和StartupFailurePolicy、安全启动页 | 下次稳定启动提示检查反馈；独立安全页保留手动导出，不依赖WebView/Compose/Media3 |
| 歌词同步 | lyricsDiagnostics独立轨迹和统一lyrics事件 | 仅统一白名单事件；独立轨迹含歌曲/歌词标识，不能原样上传；不能保证每个同步问题证据充分 |
| 背屏/AOD | 既有rear/island/lsp/shizuku事件、生命周期和舞台状态 | 只留状态、错误码等标量，不加帧级记录；Pad反馈类别隐藏背屏 |
| 界面/Pad/桥接 | nav/ui/webview、原生页面接管、启动阶段、现有frameTiming计数 | 设备/WebView/屏幕/Pad环境、帧及卡顿计数；不能代替车机或厂商实机验证 |
| 手动导出 | diagnosticPackage、错误/事件/环境报告及现有截图选择 | 能力保留，手动包不进入云端上传路径 |

不存在通用的全异常捕获保证：JVM未捕获异常、JS错误和退出历史都是尽力记录。原生信号崩溃、
ANR、系统强杀、断电、磁盘故障可能没有栈或未能落盘；安全页本身启动失败也不能通过UI反馈。
本次没有加入native tombstone/独立ANR watchdog，也没有宣称实现这些能力。

版本来自现有构建常量、原生diagnosticSession和BUILD_ID。buildId解析version@commit-dirty；
云端分别保存commit及buildDirty。崩溃保留事发版本，环境表反映提交时设备/版本，两者可能不同。

性能：解析、白名单过滤、预览JSON、IndexedDB、PoW和XHR在懒加载Web Worker；原生日志文件
读取在最大1线程/队列2的专用执行器；成功后清除本机上传正文；本机最多20条/30天。
PoW使用已安装crypto-js，2ms工作片段后让出约6ms；次数8M、90秒上限，网络45/60秒超时。
无周期后台上传、无限重试、逐帧新日志、音频压缩或播放内核改动；进度最多约4次/秒。
既有原生error/fatal日志会同步落盘，这是原有最后证据策略，不是本专项新增高频写盘。

桌面浏览器实际编译Worker测试能证明主线程仍可响应、响应丢失后重试幂等；不能证明手机耗电、
峰值内存或播放零卡顿。低端车机/手机在真实播放时上传、弱网、后台/息屏切换仍需实机测试。
日志截断或字段过滤造成的证据不足应列明，后续只补必要低频白名单字段，禁止猜测式重构。
