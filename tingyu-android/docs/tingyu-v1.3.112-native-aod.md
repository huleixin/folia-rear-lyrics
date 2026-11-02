# 1.3.112：LSP 原生卡片独占显示与系统 AOD

## 源码确认与处理

- Coordinator.begin 原先会因朝下息屏、hostTried 或握手失败启动 LSP 独立 Activity。本轮删除这一分支；失败保留原始原因，15 秒退避重试。现有原生卡片绑定架构保持不变。
- Coordinator.launch、Launcher.start、异步 worker 与 Activity.onCreate 都拒绝 LSP 独立窗口；防止旧异步启动或系统任务恢复绕过入口。迁移遗留窗口仍先走原有电源租约释放、关闭流程，保留已存在的原生卡片租约。
- LSP 心跳在原生卡片路径提前返回，旧保亮续租和锁屏重夺不再执行；不请求亮屏、不把 DOZE 改为 ON。Shizuku 路径保持原样。
- LSP 高级设置移除 Legacy 和旧朝下息屏控件；新增“原生卡片 AOD → 跟随系统背屏 AOD 设置”，默认开启，设备本地持久化。React 与 Compose 共享 NativePage 模型及原生状态源。

## Folia 0.3.2 机制证据

读取用户参考包中 JADX 导出的 RearCardView.setAod/getInAod/checkDisplayPower/updateRunning/recoverSnapshot/syncVisibility、CardRenderPolicy.resolve、EngineView.render/RenderConfig。setAod 更新布尔后 render/updateRunning；getInAod 在 STATE_OFF 时返回 false，其他情况下认 AOD 命令及 DOZE/DOZE_SUSPEND。电源改变会重算策略，恢复时重读媒体快照并 resync；RenderConfig 将 aod 传给渲染器。

参考机制独立实现，没有复制反编译方法。Folia 使用的媒体源及其轮询不移植。听屿仍使用 RearNativeTrack、RearLyricsState、RearNativeLyricLines 和已有 Provider 会话校验。

## 当前渲染

- NORMAL：原 WebView 舞台、原生卡片容器、逐字及背景动效。
- AOD：只在系统 enterAod 或 Display DOZE/DOZE_SUSPEND、真实自有音乐卡片仍可显示且未被相机挂起时进入。暂停普通 WebView，在同一卡片中显示黑底灰字静态当前歌词。复用普通舞台视口尺寸与安全区域计算。
- HIDDEN：OFF/UNKNOWN、相机、卡片收起、身份失效时不显示；停止 AOD 定时回调及普通动画。

AOD 只读既有 Provider 和歌词缓存，串行后台执行，切歌读取后复核 songKey/epoch。无新的权威时钟，只使用当前快照 positionMs/playbackRate；按下一歌词行设置一次回调，至少间隔一秒，仅文字变化才更新 TextView；暂停无定时器，Seek/切歌/歌词更新通过已有 ContentObserver 触发。退出取消过期回调，恢复正常舞台 resync 最新时间轴。无唤醒锁、新 Activity、播放器、MediaSession 或重复网络取词。

## 诊断与验收边界

状态包含 displayImplementation=NATIVE_CARD/SHIZUKU_WINDOW；host/render-mode 记录 NORMAL/AOD/HIDDEN、电源、命令、身份；legacy-lsp-blocked 记录旧入口拒绝。沿用既有歌词身份/代次账本与脱敏日志，不记录歌词内容、账号或 URL。第三方独立 Folia 模块不修改；若仍抢屏需用户通过 LSPosed 作用域隔离验证。

本轮自动化：911 Android JVM 测试通过（含 OFF 优先、DOZE、设置关闭、相机、身份失效与卡片收起策略），仪器 APK 编译通过；相关前端 42 测试通过，TypeScript 检查通过。自动化无法替代系统 Hook 与真实 AOD 渲染验证。

真机必须验证：覆盖安装后重启让模块更新；LSP 开启/失败/朝下息屏偏好均不出现 RearLyricsActivity；正常卡片进入系统 AOD 后真正显示静态歌词，关闭系统 AOD 后不亮；相机、收起再进入、连续切歌、Seek、暂停、恢复正常舞台、其他音乐会话；Shizuku 独立窗口回归。实际显示权限、DOZE 下系统合成与功耗/长时屏幕行为尚待设备确认。hostActive 仅表示普通舞台首帧，不能作为 AOD 完成依据。

本实现不写系统 AOD 开关。系统若在 AOD 中撤销此卡片的可见性，会进入 HIDDEN，不绕过系统限制。

回滚：revert 本轮提交后以更高 versionCode 原签名重建；不要卸载清除用户数据。
