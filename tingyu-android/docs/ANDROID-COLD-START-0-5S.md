# 冷启动前 5 秒：修复与手机取证

基线：`eb7f91b` / 1.3.84。开发环境未连接 Android 手机。本文没有真机毫秒数、P50/P95 或 GPU 收益结论。

## 已证实的代码问题

1. `NativeShellCache.chrome` 将缓存控件标记 disabled，`ComposeChromeHost` 给启动导航传入空回调。首页可见不代表业务会话已就绪，早期导航触摸会被丢弃。现在只有四个幂等导航目标允许等待：保留最后一次选择并明确提示“就绪后自动打开”，在启用的实时导航 Surface 建立后，使用其新 session 派发一次。后台、销毁或新的实时导航会取消旧意图。缓存中的播放、删除、歌曲卡片等操作没有被解除保护。
2. 原 `uiWarmup` 从第一个可用 idle deadline 就可以开始大型 import，未等待原生页面与控件接管。空闲队列完成一个任务后会立即排下一个，而且相同函数的多次入队没有去重。现在在 Android 等页面和 Chrome 有效 ACK 后才开始推测性工作；按任务去重，成功结果复用，并在交互和上一任务完成后保留空闲间隙。明确点击的导入不经过这个队列。不是全局延迟 5 秒，也没有停用资源预缓存。
3. 上一版诊断需要控制台/adb，JS 缓冲未进入普通日志导出；原生节点只写 logcat。现在同一 navigationTiming 诊断扩展到 Activity、触摸、主线程、FrameMetrics，并汇入现有导出报告。

上述问题与“立即点击慢、等 5 秒正常”一致，但没有设备轨迹不能确定每项对用户延迟的贡献。大型模块开始求值后仍不能由 idle 调度器中断。

## 时间线与证据边界

| 节点 | 日志 | 实测时间 |
|---|---|---|
| Activity 开始 / Capacitor 返回 | activity-create-start / activity-create-capacitor-ready | 待手机导出 |
| WebView 可用 / 原生缓存挂载 | webview-available / cached-shell-attached | 待手机导出 |
| 缓存组合的帧边界 | cached-shell-frame-boundary | 不是物理显示完成 |
| JS 模块图就绪 / Bootstrap / React 提交 | js-module-graph-ready / js-bootstrap-ready / react-first-commit | 待手机导出 |
| 监听器 / 有效 Surface / 首页模型接管 | *-listener-ready / nav-live-surface-accepted / page-native-commit:home | 待手机导出 |
| Android 输入队列延迟 / Compose 判定 / JS 业务开始 | touch-received / compose-click / *-business-start | 待手机导出 |
| 布局、包解析、UI 队列、Compose 提交 | page-layout-capture / page-packet-parse / page-ui-dispatch / page-native-commit:* | 待手机导出 |
| 大型预热及封面处理 | warmup-settings-* / warmup-collection-* / cover-decode-* / native-thumbnail-batch-* / local-cover-migration-* | 待手机导出 |
| 主线程停顿、应用帧和 JS Long Task | main-looper-lag / slow-app-frame / js-long-task | 待手机导出 |

播放恢复和资源缓存沿用原有诊断轨迹，报告同时包含它们；没有改动其执行规则。首页网络初始化、Chromium 内部启动、纹理上传不能仅凭这些应用节点分解，需要设备系统追踪补充。

原生使用启动时 epoch + elapsedRealtime，JS 使用 performance.timeOrigin + performance.now。导出时以桥接调用往返中点估算 nativeMinusJs 偏差，并给出半个往返时间的对齐不确定度。Long Task 记录实际 entry.startTime，不把晚到的 observer 回调时间当作任务起点。touch-received 的 durationOrLagMs 是 MotionEvent 入队到 Activity 处理的等待；touch-dispatch-return 是 Activity 本次派发耗时。

FrameMetrics 是应用帧完成的耗时数据，withFrameNanos 仅为 Compose 帧边界；两者均不证明面板物理呈现。精确的 compositor/GPU 呈现仍需 Perfetto/FrameTimeline，日志不冒充这类证据。

## 无电脑的手机操作

1. 打开设置中的帮助页（“?”），开启 **冷启动诊断（前 10 秒）**。
2. 在 Android 应用信息中真正“强行停止”听屿，再重新打开。
3. 首页出现后立刻点击一个目标。之后返回帮助页，点原有 **导出诊断数据**，通过系统分享保存/发送 txt。
4. 分别重新强停并重复：立刻、约 1 秒、2 秒、3 秒、5 秒、10 秒后第一次点击。优先依次测试设置、搜索、资料库、首页歌单、迷你播放器、队列和返回。每次只选一个首次操作，注明本次目标和等待时间，避免混入热启动。
5. 完成后关闭诊断开关。关闭即断开采样并清空本次专用缓冲。

开关持久化到下次启动；默认关闭。不重启播放器，不清除应用数据。原生主线程脉冲和 FrameMetrics、JS Long Task 仅在启动前 10 秒且开关开启时采样。此后仅按交互事件记录。每端最多 256 条，保留前 128 条和近期 128 条；不记录坐标、输入内容、文件路径、歌词、账号、Cookie、音源 URL 或 Token。关闭时无持续采样任务。

报告直接给出缓存帧边界到导航接管、首页接管，以及首次触摸到业务回调的间隔。用输入/派发/业务回调区分 A 点击响应延迟，用路由/加载/提交区分 B 导航延迟，用帧和 Long Task 区分 C 渲染卡顿。不能凭一次日志宣称因果关系，需同条件重复对比。

## 验证及回滚

自动化覆盖推测预热接管屏障、去重、后台恢复、取消、模块加载复用、会话与导航回归、诊断开关/截止/缓冲和合并导出；JVM 覆盖最后一次启动导航只派发一次、非法目标拒绝和生命周期清理。另运行现有主题、缓存状态、队列和原生转场相关回归。

未执行真机 0/1/2/3/5/10 秒对比、仪器测试或截图验收。原 NativeMotionPolicy、NativeStageExit、舞台、底栏材质、Media3 与睡眠定时器均未更改。

回滚本轮提交即可；关闭新增诊断开关后再回滚，可同时停止诊断采样。没有修改播放队列、缓存或主题数据格式。

本轮执行结果：相关前端测试共 79 项通过，TypeScript 检查通过，Android Release JVM 测试 833 项通过（0 失败），JDK 21 原签名 Release 构建成功。版本 1.3.85 / versionCode 108。未连接真机；没有实测时延或收益百分比。
