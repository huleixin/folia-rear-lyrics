# 第一阶段验证记录 — v1.3.89

基线：v1.3.88 / dffd06b。版本：1.3.89，versionCode 112。包名 `io.github.huleixin.tingyu`；签名配置、持久化格式和用户数据未修改。

## 自动化结果

| 检查 | 实际结果 | 证明范围 |
| --- | --- | --- |
| npm run typecheck | 通过 | TypeScript 类型；不能证明设备性能 |
| 相关前端大回归（services / hooks / playback / lyrics / cache / search / rear clock） | 218 文件通过，1842 测试通过，1 测试跳过 | 事件排序、缓存和恢复、歌词请求、外部来源生命周期、网络模拟、队列控制 |
| 主题 / 冷启动调度 / 原生页面 / 资源迁移等收尾回归 | 12 文件、64 测试通过 | 与上一行部分重叠，不将两者简单相加当成独立测试总数 |
| 背屏缺元数据收尾 | 10 测试通过 | 新曲目没有标题/歌手时，不退回上一首的名称 |
| Android :app:testDebugUnitTest | 848 测试，0 failures，0 errors | 生产纯逻辑、真实仓库/桥缓存；不代表真实解码器、Binder 或窗口注入通过 |
| Android :app:assembleDebugAndroidTest | 编译通过 | 仪器 APK 已生成；未运行 |
| npm run build:android:release | 通过 | 前端构建、Capacitor 资源校验、Kotlin/Java、Release 打包 |

新增回归曾先在未修改代码中复现：前端 4 项失败，JVM 2 项失败。独立基线 worktree 复核了另外两项旧测试假设失效；修改测试以真实解码错误包和现有 blob 安全退休机制验证，未降低生产保护。

## 长时 / 异常模拟

- BackgroundContinuationTest：10、30、50 首连续推进；JS 不提供后续窗口；使用真实 NativePlaylist、ResolverRegistry、BackgroundContinuation，假引擎和确定性网络结果。
- 同一测试覆盖有界网络失败、不支持来源、主线程投递之前取消/换锚点、延迟结果不得接管。
- ThreeEndLyricSyncTest：50 首真实仓库/桥/版本裁决，注入上一首晚到的原生歌词，当前版本不被替换。
- rearLyricsClock.test：两小时虚拟时间、40 首、7200 个一秒样本；包含暂停、速率变化、后退 Seek。没有真实等待两小时，也没有运行真机音频输出。
- rearTrackSwitch.test：同 epoch 新旧版本乱序、前台新鲜旧歌曲、歌词晚到、等待上限、dispose 清理；同源 relay 生命周期测试继续通过。
- nativeAudioElement.test：重复/乱序状态、迟到 seeked、引擎实例更替、墙钟调整、暂停与速率、队列重接管；不会创建第二个播放器。
- playbackRequestGuard / onlinePlaybackStop / nowPlayingLifecycle：不同来源同 ID、同名不同 ID、A→B→A、同曲重播、手动编辑覆盖、旧 host 及旧解析回调。
- LyricSyncLedgerTest：旧歌曲/epoch/版本拒绝、首次 applied 超时、暂停、相机占用、关闭和睡眠分类。
- 既有 LSP 租约 / Binder 协议契约 / camera / ownership / Shizuku 路由 / 队列恢复 / 缓存 / 定时器 JVM 回归随完整 JVM 套件运行。

## 构建与签名

使用 Windows、JDK 21 和现有 Android SDK / Gradle 配置。Release 不重置包名，不使用 debug key，不导出私钥。

原发布证书 SHA-256：`a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d`。

APK：`android/app/build/outputs/apk/release/app-release.apk`。仪器包：`android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk`。最终上传时校验 APK 本地 SHA-256 与 GitHub asset digest 一致。

## 未执行的验证

`adb devices` 没有设备。没有执行 connectedAndroidTest、真实播放 10/30/50 首、小米锁屏、真实 Binder death、相机物理占用、Shizuku 权限撤销或真机功耗测量。没有提供或冒充真机截图、帧率、耗电或连续播放成功率。

验收步骤与诊断导出入口见 [完整报告](PLAYBACK_STABILITY_STAGE1.md)。主要设备风险是 HyperOS 窗口/电源兼容性、真实网络解析时限及灵动岛系统插件消费端；这些不能由 JVM 模型推出。

## 独立提交与回滚

- ec1e193：原生续播投递校验、快照排序、时钟与健康账本。
- eb5d9ca：异步歌词与外部来源生命周期、背屏恢复、诊断导出与对应测试。
- 发布提交：版本元数据、最后的元数据回退修正及研究/验证文档。

撤回整轮功能时按逆序 git revert 相应提交，重新提升 versionCode、使用原签名打包覆盖安装。不要卸载或清空应用数据。仅回滚前端提交仍能接受新增原生可选字段；仅回滚原生提交时前端保留旧协议兼容路径。回滚没有改变平台权限或 Hook 作用域。
