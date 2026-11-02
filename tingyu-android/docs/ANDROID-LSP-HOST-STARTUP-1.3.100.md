# 听屿 1.3.100：宿主启动时序与 LSP 回退探针

基线 ad3ba177（1.3.99），原仓库 main。真机日志显示 Context 修复有效，Binder 已连接，但 priority=2、宿主未激活；首次请求 rearPower=1。以下是源码可证缺陷，不等同于已在目标 ROM 测得每个缺陷的耗时或占比。

## 原链路与缺陷

begin 优先 SHOW，未准备背屏电源；attach 在没有 launcher 时先请求 launcher，而 mayLaunch 要求 ON。OFF 时请求被拒又返回 PENDING，只等到首帧超时。独立窗口分支之后才唤醒，因此不能为先前宿主准备电源。

performResume Hook 注册数量足够就不装 Instrumentation 兜底，不能证明 OEM 真正执行过目标方法；没有公开 Application lifecycle callback。日志 priority=2 只能证明未记录 launcherSeen，不能证明 launcher 没有在前台。

RearHostView 在 shown=true 时提前返回，页面 ready 后未主动 invalidate；父 stage 长期 alpha=0，还可能在子 WebView onDraw 前被剔除。恢复可见曾直接重发 ready，没有等待恢复后的绘制。

回退 probeFront 发 FIRST_CALL_TRANSACTION+9，但 SystemRearBinder 只接受到 +8；错误统一称 Shizuku 版本不匹配。LSP 无法提供正确只读 Lookup，阻断 COVERED 的有界恢复。

## 修改

- Coordinator / Launcher：没有独立窗口、当前意图有效、未关闭、未相机占用、未遮盖、非睡眠/电源操作时，复用现有 LSP WAKE。一轮只尝试一次，工作线程执行前再次核对代次/意图/相机/睡眠；250ms 后核对实际 ON 才 SHOW。未点亮保留明确失败证据，使用已有回退，未延长 4.5s。
- Hooks：Application lifecycle callback 加 Instrumentation 始终观察；重复回调复用已有实例，不重复建 View。实际 resumed 才记录 Launcher 和升级 priority。保持既有暂停/销毁及用户退出策略。
- 阶段：新增 show-received / attaching / waiting-launcher / launcher / page-ready / drawn；原 created / ready 保留。attach 记录 launcher、resumed、suspended、显示电源；拒绝记录 blocked。超时包含最近阶段与原因。
- View：页面 ready 时恢复非零透明度，请求下一次绘制；只有 ready + shown + 实际 isShown/尺寸有效的 onDraw 边界才报告 ready。恢复也重新等待绘制，不直接宣称激活。onDraw 是应用绘制边界，不等于屏幕硬件呈现或已有逐字歌词的证明。
- WebClient：关键脚本、主文档、state 管道异常保留资源路径与真实异常并失败回退，避免只留下空白和泛化超时。没有伪造资源成功。
- LSP v6：实现 +9 只读探针，沿用 getAllRootTaskInfosOnDisplay 与任务元数据；只返回当前用户听屿 RearLyricsActivity 的匹配项，未知/反射失败仍为失败。保持 UID、显示尺寸、会话校验；不搬其他应用、不引入命令执行或无界置顶。旧模块需重启加载 v6。

## 验证与边界

新增 JVM 覆盖唤醒被取消、睡眠、busy、遮盖、相机阻止，以及只读任务探针的命中、任务缺失、跨用户拒绝。最终检查和 APK SHA 见 Release。用户真机日志仅作为取证，不上传仓库或 Release。

无小米连接时不能证明生命周期漏收的具体 OEM 原因或宿主已显示。锁屏、AOD、相机、上滑、字体背景、连续切歌都需真实设备。改动保留原舞台、播放引擎、宿主/独立窗口互斥与安全释放。

手机覆盖安装后重启，核对 1.3.100、versionCode 123、LSP v6。息屏后开启背屏，期望 wake-begin → wake记录 → show-received → launcher → created → page-ready → drawn → ready。只有最后 ready 后才应 hostActive=true。若失败导出新诊断，查看最后阶段和 blocked/资源错误；不要把 priority=2 或 Binder 连接当成显示成功。

专项回归：相机开启/遮盖/主动退出时不唤醒；上滑后不抢回；相机退出仅按意图恢复；重复开启不双窗口；宿主失败后独立窗口 COVERED 能取得真实 LSP 只读探针结果，再按既有策略恢复；Shizuku 路径仍单独验收。回滚通过 revert 本次提交并提高 versionCode 重建，不清用户数据。
