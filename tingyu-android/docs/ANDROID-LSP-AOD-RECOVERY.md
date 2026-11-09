<!-- docs/ANDROID-LSP-AOD-RECOVERY.md -->
# LSP 原生卡片 AOD：可见度与恢复

基线：GitHub main `23a45130f18fa8bb2c16cd83bdbf299d70db0b0b`，1.3.190 / 213。
只修改 LSP 卡片及其背屏网页模式适配；Shizuku、主屏舞台、Media3、歌词时间轴与共享 graphics scheduler 实现未修改。

## 已确认的代码问题

1. `RearLyricsSurface` 的父级 brightness(.38) 会一起压暗 iframe。现仅背景层使用该滤镜，歌词保留原色、布局和逐字高亮。仅 LSP AOD 文档的既有 DOM 字幕行降至 .72 opacity；Canvas 等模式继续保留原本内部层级，不添加绘图面或发光。
2. `followAod()` 原先把 IPC 异常/空返回当 false。现以 nullable 读取区分成功开、成功关及失败；失败保留最近明确值，新宿主未成功读取前不授权 AOD。明确 false 在现有配置通知到达后立即隐藏并归还原生卡片。
3. 渲染门控混合了业务/媒体身份与 current/shown。已拥有舞台的卡片在 AOD 过渡中暂失 active/shown，会错误进入 HIDDEN；恢复时再次 acquire 又可能因 current 尚未恢复而抛错并终止租约。
4. 外层 HIDDEN 会丢失 AOD 预算；旧 iframe onLoad 只重构 AOD/NORMAL，无法重放 HIDDEN。现在完整模式及递增序号在外层、iframe 间重放，拒绝旧序号和同序号冲突；HIDDEN 保留前次 AOD 预算并停渲染，恢复仅发一次视觉 invalidation 与现有 resync。
5. 旧媒体身份只有包名，无法排除同包不同 session。现同时校验已观察 MediaSession token、destroyed 标记和同一 MAML root；结构关联还要求旧 holder 仍属于真实 holder 列表。
6. 重绑事件过去可能只刷新存活旧舞台，而不重跑选择逻辑。现复用已有有界 attach 路径；活跃有效舞台先快速返回，避免在每个媒体事件做扫描和输出 probe 日志。
7. 应用侧普通首帧等待原先只排除 AOD，HIDDEN 仍可能启动可见 NORMAL 卡片的超时预算。现仅 NORMAL 进入该等待；有效隐藏卡片的准备仍受原有 4500ms 暂停预算约束。
8. 异步业务可用性中的 card-collapsed 不再单独清除一个已有 NORMAL/AOD 原生 draw 的 active 标记。真实隐藏由严格卡片门控下的 render-mode/paused 确认，避免较晚的业务快照覆盖已完成的恢复。

上述是静态及自动化可确认的问题，不代表已经定位用户设备偶发失效的唯一原因。

## 状态与安全边界

- AOD 输入：原生 enterAod/exitAod 命令或真实 Display DOZE(3)/DOZE_SUSPEND(4)。OFF(1)、UNKNOWN(0) 和不支持状态不显示。
- 严格门控：同一有效租约、听屿媒体 session、绑定/父子链、MAML root、附着、中心槽、相机挂起状态和偏好，均不可被过渡窗口跳过。
- 最长 1500ms 的过渡窗口只由真实 AOD 边沿建立，使用 elapsedRealtime；DOZE→DOZE_SUSPEND、反复 visibility 回调不续期。Handler 不唤醒系统；CPU 暂停时不会主动执行或申请 WakeLock。
- 仅已获得所有权且仍在中心槽的卡片可在 active/shown 短暂丢失时保留文档和所有权。此时舞台为 INVISIBLE，**不强显**，也不立即调用 WebView.onPause 或 restore。恢复 current/shown 后重同步并请求绘制；超时进入 HIDDEN、暂停并归还。
- center 丢失、用户切走/收起、媒体/session/root/绑定失效、相机、关闭偏好或真正 OFF 不能使用例外。系统长期保持 active=false 时仍安全隐藏，需 ROM 实机证据才能继续细化。
- 首次 acquire 仍要求 current/ownMedia/附着验证，并要求同 epoch 的 visual-state fence 已到达，再经过一次 super.onDraw。JS 配置就绪或 fence 前的 draw 不授权隐藏系统卡片；旧 epoch 回调不能授权新模式。
- 没有新增 Hook 类型/方法/作用域，没有独立 Activity 接管、强制亮屏、POLICY_BRIGHT、全局亮度修改、轮询或唤醒锁。

## 绘制证据与诊断

每个可见模式 epoch 只请求一次 WebView.onResume、visual-state fence、invalidate 及 2500ms 绘制超时诊断。
超时只记录证据，不假定是硬件故障，不循环重试或强制兼容回退。现有 renderer process gone 的失败退出仍保留。

模式事件按序号报告外层执行与 iframe 应用；晚加载/重载通过已有 onLoad 重放，不创建重试定时器。
JavaScript 执行、定时回调、WebView VisualStateCallback 与 onDraw 是不同证据，**均不等于真实屏幕已呈现**。
物理呈现统一标记 `presentation=unmeasured`。
VisualStateCallback 只表示内容可供下一次 onDraw 绘制，语义依据 [Android 官方 API](https://developer.android.com/reference/android/webkit/WebView.VisualStateCallback)，不是物理屏幕呈现确认。

日志在 `TingyuRearHost` 及原有有界诊断通道中，新增详细快照按状态去重并限制每 5 秒最多 12 条，溢出计数在后续记录中汇总。功能性的 render-mode 每 epoch 仅发一次，与限频快照分开，避免重复快照把应用 active 标记清掉；ready 仍须等待合格原生 draw。没有逐帧日志或歌词正文、通知内容、媒体 token/歌曲身份。

采集字段：

| 类别 | 字段 |
|---|---|
| 模式 | power 实值、mode、seq、trigger、reason、aodCommand |
| 身份 | lease 有效性、非原始 token 的 leaseTag、own、sameRoot、associated、center、active、bound |
| 可见性 | attached、shown、webShown、camera |
| WebView | webPauseRequested（本应用请求值，非系统内部状态）、nativeResumed、documentHidden、iframeHidden |
| 模式投递 | outerApplied、iframeApplied、对应 seq |
| 绘制 | visualState、draws、native-draw、draw-timeout、presentation=unmeasured |
| 偏好/预算 | enabled/disabled/unknown/unavailable-cached、suppressed、elapsedMs、uptimeMs |

建议复现时保存 `adb logcat -v threadtime -s TingyuRearHost`、背屏 display 的 `adb shell dumpsys display` 状态和必要的系统合成/帧时间证据。
装包后须让 LSPosed 目标进程重新加载模块，并先核对启动/ping 日志中的 build 与本包一致；仅更新 APK 不证明已运行的新 Hook 代码已替换。
若 JS 回调在跑而没有后续 native draw，或 draw 存在但面板无像素，需要设备录像/厂商合成链证据后再评估兼容方案；不能靠 JS 计数宣布 AOD 正常。

## 自动化与真机矩阵

定向 Vitest 覆盖模式序号、HIDDEN 保留/恢复、晚加载 iframe、滤镜隔离、字幕作用域、既有时间轴/低功耗调度/状态 relay、暂停 Seek 及一小时虚拟时间预算。
Java 测试覆盖严格门控、NORMAL→DOZE→DOZE_SUSPEND→NORMAL、过渡截止/不可续期、真实失效、相机、显式偏好关闭、快速切换、session token 和日志限频。
具体执行数量与编译结果以交付报告为准；虚拟时间不是一小时设备稳定性/功耗测量。

浏览器验证使用真实 rear-lyrics.html 与合成诊断歌词（904×572），路径为 NORMAL→AOD→HIDDEN→iframe reload→AOD→NORMAL。Browser plugin 不可用，使用现有 Playwright/Chromium。没有 pageerror 或框架 overlay；Service Worker 被测试上下文禁用、Reduced Motion 提示是预期警告。截图不是 Android AOD 的屏幕证据。

以下全部待真机验收：

1. NORMAL↔AOD；DOZE↔DOZE_SUSPEND，含首次在 AOD 接管。
2. AOD 切歌/暂停/继续/Seek、短时不可见后恢复。
3. 真正媒体/session 失效及其他应用播放，确认不强显。
4. 相机接管/归还、主动收起/切走中心卡片、明确关闭 AOD。
5. WebView 系统暂停后恢复、长期不合成及 renderer process gone。
6. 连续快速锁屏/解锁/充电切换。
7. 连续播放超过一小时，记录温度、帧时和功耗。
8. 原有各歌词模式及深浅/自定义配色的真机可读性；不通过统一改色或强发光掩盖主题本身的低对比度。
