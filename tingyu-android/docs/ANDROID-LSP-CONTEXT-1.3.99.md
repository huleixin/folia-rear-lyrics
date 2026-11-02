# 1.3.99：背屏宿主 Context 生命周期修复

基线为 WorkBuddy 最新主分支 ce4fe57，保留 a1cddee 起的专属背屏中心 launcher 宿主、握手诊断和 PING 探针全部提交。原工作分支通过 fast-forward 接入，无 reset、覆盖或 force push。

## 确认根因

真机报告 1.3.98 在 Application.attach 后 Controller 构造时保存了 application.getApplicationContext()。这个阶段 LoadedApk 尚可能没有登记 Application，返回 null；对象本身已经 attach，具有有效 base context。原注册函数捕获错误后继续构造完成，导致 controller=yes，但 Receiver 与 Provider 均对 null 调用。

## 最小修复

- RearHostContext：优先使用非空 Application Context；早期返回 null 时使用已 attach 的 Application 本身。字段 final，不在后续回调覆盖成 null，不保存 Activity。
- RearHostHooks：唯一 Controller 创建串行化；初始化与构造分开；同一实例在 onCreate 或有界重试中重试 Receiver。注册成功后才置 receiverReady，成功后不重复注册。
- PING：使用局部候选 Receiver，成功注册才赋值；失败不锁死重试。回复带 context 类型、receiver 状态及异常。
- Provider 发布：单飞，避免重复排队；检查返回活 Binder 与有效 appUid，先完成 death recipient 注册才保存 lifeline。保留原有一次失败重试及所有 UID、协议、会话校验。
- RearHostUpdates：Provider.onCreate 时也可能尚无 Application Context，改用相同非空选择逻辑。
- RearHostProvider：增加 host-register-accepted 可导出事件，记录真实连接状态与初始化 profile。

Receiver 的已有权限回退政策保持原样；未为修复放宽 Provider UID、Binder 或会话安全边界。未修改舞台、播放内核、设置 UI、LSP/Shizuku 显示策略或媒体控制协议。

## 可观察调用链

LSPosed 安装日志 → Application attach/onCreate → context ready → Receiver 注册 → CONNECT received → provider register begin → host-register-attempt → UID/协议校验 → host/register → host-register-accepted → registered with app → created → ready。

Provider 无法访问时仍可从原有 PING 导出 registerError、receiverError、context 和 build；hostConnected 仍取实际 Binder.isBinderAlive，hostActive 仍需真实 ready，不用初始化成功冒充接管。

## 验证范围

新增 JVM 测试覆盖早期 null Application Context 回退、正常 Application 优先、无有效上下文立即失败。新增 Android 仪器测试通过 ContextWrapper 模拟 getApplicationContext=null，实际调用 ContentResolver、注册及注销 Receiver；无设备时仅编译，不宣称运行通过。

发布说明记录 TypeScript、相关前端单测、Android JVM、仪器测试编译与 Release 的最终结果。没有小米设备时无法证明私有 launcher 宿主接管、Android 17 锁屏/AOD/相机行为已通过。

## 手机验证

1. 覆盖安装同签名 1.3.99 / versionCode 122。重启背屏中心宿主（建议重启手机），核对 LSPosed Android 与 com.xiaomi.subscreencenter 两个作用域。
2. 诊断应显示新构建标识、非空 context 类型、receiver=ready；不再出现 registerReceiver/getContentResolver 两个 NPE。
3. 核对 host-register-attempt/accepted、handshakeSeen=true 与真实 hostConnected=true。播放并开启背屏后继续核对 created、ready、hostActive=true；有连接无首帧仍不算接管成功。
4. 不等待原生音乐卡片，验证专属宿主歌词和逐字高亮；切歌、Seek、暂停恢复与前屏一致。
5. 上滑退出不停止音乐、不立即自动抢回；重新显示、锁屏、AOD、相机让位及恢复分别测试。
6. 未启用宿主作用域或宿主失败时原独立 LSP 窗口可用；Shizuku 不回归，不出现并发窗口。

若握手恢复后有新的 View/私有系统兼容故障，导出本版诊断按 created/ready 等真实阶段继续定位，不能把尚未执行的真机流程标为完成。

回滚可 revert 本次独立修复提交，以更高 versionCode 重建，保留 WorkBuddy 历史、用户数据和独立窗口回退。不要卸载清数据来降级。
