# 锁屏歌词与播放器展开修复 1.5.31

分支 `feat/tablet-adaptive`，基线 `f6e4ddbc`（1.5.30），版本代码 246；未合并 main。此包包含该分支已有 Pad 适配。

## 日志证据与原因

用户日志来自 1.5.29 / Android 17（SDK37），背屏 Shizuku Activity 已启动，Media3 正常播放。16:52:13 当前曲的原生备用取词返回缓存 NOT_FOUND，桥写入无词占位；背屏记录 `state=none lines=0`，自愈因 `none-stub-present` 停止。16:54:26 回到前台，平台歌词命中并交付，背屏恢复 36 行。这说明动画仍在运行，歌词供给被错误的无词结论截断。

原生 LRCLIB / 酷狗备用搜索未匹配，不足以证明原歌曲平台没有同步歌词；旧实现却将其缓存为三天的全局无词。另一个断点是 JS 读取共享歌词后直接返回成功，没有重新确保时间轴已交付给原生桥。

播放器展开时，外壳已铺满窗口，裁剪圆角却保持为窗口宽度的 16%，直到 980ms 结束才突然撤销。浅色底页通过圆角外露，形成截图中的白边。

## 修改

- `playback/NativeLyricsRepository.java`：备用目录均未匹配返回 UNRESOLVED；短期 miss 缓存 15 秒；忽略旧 none 缓存，保留成功时间轴。
- `playback/UnifiedLyricsStore.java`：读取内存及磁盘时跳过旧 `native-none` 负记录；用户明确选择和平台确认的无词记录保留。
- `RearNativeLyricLines.java`：未匹配记录不再自动当作无词。
- `playback/SongInfoLoader.java`、`LyricFetchRetryPolicy.java`：UNRESOLVED 保持待补取，沿用 20s / 60s 最多两次的原生重试；仍受当前歌曲、播放代次和已有歌词闸门约束。诊断记录 `backup-miss-pending`。
- `src/services/nativeLyricPriming.ts`：共享歌词重新交付，记录实际发布结果；播放会话重置后迟到的共享读取结果作废。
- `chrome/MinimalPlayerMorph.kt`：圆角随外壳展开通道归零，566ms 铺满窗口后半径为零；反向关闭连续，封面轨迹、原时序和底部导航动画保持原实现。
- `chrome/NativeHomePage.kt`：全量回归发现“查看歌曲”内层文本按钮缺少统一按压反馈，改用现有 `chromeClickable`，不改变布局和点击行为。
- 新增 `BackupLyricCacheTest.java`；补充 `UnifiedLyricsStoreTest.java`、`LyricFetchRetryPolicyTest.java`、`SaltPlayerMotionTest.kt`、`test/unit/services/nativeLyricPriming.test.ts`。版本文件为 `package.json`、`package-lock.json`。

## 验证

- TypeScript、主题一致性检查通过；Vitest 两个测试文件 27 项通过（原生歌词预置和 Android 页面归属）。
- 原生全量 `:app:testDebugUnitTest` 1361 项通过，0 失败、0 错误、0 跳过。覆盖缓存迁移、短期 miss 过期、有限重试、共享时间轴重新交付及会话作废，原有三端歌词一致性、桥并发、逐字时序、Pad 布局和播放控制回归。
- 圆角测试逐毫秒检查 0–980ms 的单调收敛、566ms 后半径为零，以及展开途中反向关闭的连续性；原有封面和外壳轨迹样本测试通过。这是自动化几何验证，没有将其描述为真机录屏验证。
- 首轮 1361 项中两项失败：已有首页按钮缺少统一按压反馈，以及新增缓存测试受单例路径残留影响。按钮改用既有组件，测试以独立仓库实例隔离；定向复测和随后全量重跑通过。
- Capacitor Web 资产同步通过。Release 构建、APK 版本及签名校验结果随发布产物记录。

## 仍需真机验证

当前 adb 无设备，未安装 Android 模拟器。不能声称已在用户的 SDK37 / Shizuku 背屏上完成锁屏复现，也没有用用户账号发起真实平台取词。

本次修复错误无词判定、旧缓存和交付断点；没有新增一套原生平台歌词客户端。WebView 被系统完全冻结且原生备用目录无匹配、也没有预置成功歌词时，仍可能暂时无法显示。有限重试不会保证备用目录最终出现原本没有的歌词，需使用新版诊断记录继续核对真实曲目。

真机建议覆盖：升级后重播原问题歌曲，前后台切换、锁屏连续切歌、暂停/恢复/Seek，观察歌词恢复及旧歌词不串歌；深浅主题下展开、收起及展开中反向关闭，检查四角白边和封面运动。
