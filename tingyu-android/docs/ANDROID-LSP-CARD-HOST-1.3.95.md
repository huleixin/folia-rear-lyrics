# 听屿 1.3.95：LSP 系统音乐卡片宿主（预发布）

> **已被 1.3.96 取代。** 本文描述的宿主把「系统音乐卡片必须存在且 MediaController 属于听屿」
> 当成前置，听屿正常播放时小米不一定建卡，导致宿主始终接管失败。1.3.96 改为注入背屏中心
> 自己的 launcher 窗口，见 [`ANDROID-LSP-CENTRE-HOST-1.3.96.md`](ANDROID-LSP-CENTRE-HOST-1.3.96.md)。
> 本文保留用于对照历史实现与回滚。

基线：`f52eed7c`，1.3.94 / versionCode 117。本版为 1.3.95 / 118。

本版落实最新需求：允许在小米背屏中心的**听屿自身音乐卡片**中承载完整歌词舞台。没有接管其他应用的媒体会话，没有替换整个背屏中心。私有宿主的实际手势、AOD、相机行为尚待小米真机验证，不能据自动化通过称为稳定版。

## APK 研究证据与边界

重新用 JADX CLI 分析用户提供的实际 `Folia背屏-0.3.2.apk`，并核对已提取的 DEX、索引、研究资料及 `NativeMusicCard`、`RearCardView`、`CardTapGate`、`EngineView` 调用链。

APK SHA-256：`42e7fa3df4d4edaf3ae98975d58dc4d8bc7e7c46f3de92bd327c8ec8558a244e`。

| 机制 | 字节码/反编译证据 | 听屿处理 |
| --- | --- | --- |
| 注入背屏中心 | `FoliaHook.handleLoadPackage` 限定 `com.xiaomi.subscreencenter`，挂接 `MamlView` 生命周期 | 新增同包、同主进程作用域，原 android framework 路径保留 |
| 定位音乐宿主 | `install(FrameLayout)` 读取 `mRoot`，查找 `music_control`，要求 `MusicControlScreenElement` | 同样做运行时能力检测；只接受背屏和听屿 MediaController 包名 |
| 暂停原卡片绘制 | `NativeMusicCard.setOwned` 暂停 root、断开 VSync、隐藏原子 View、取消视觉回调 | 按当前实例过滤，非接管期间 Hook 全部放行 |
| 恢复原卡片 | 先解除 active，再恢复可见性；检查 root 未替换/结束，恢复 VSync、媒体状态和刷新 | 对称恢复；必须确认释放，才允许独立窗口回退 |
| 触摸 | 被接管 root 的 `onTouch/onHover` 返回 false；`RearCardView` 有点击门控，移动取消点击 | WebView 不接收拖动，不阻止上层拦截；保留宿主导航 |
| 上滑导航的最终执行者 | 参考 APK 中没有足以定位小米外层导航实现的代码；没有系统背屏中心 APK 或运行追踪 | **未确认具体系统方法**。不伪造系统导航；观察上滑后的宿主 pause/隐藏/detach 来结束接管 |
| AOD/宿主暂停 | `sendCommand(enterAod/exitAod)`、`onPause/onResume` | 暂停/恢复同一渲染器，恢复时重新取得当前播放快照 |
| 歌词舞台 | 参考 `EngineView` 使用 WebView | 复用听屿自己的 `rear-lyrics.html`、iframe 舞台与全部现有视觉配置 |
| 其他 App 歌词、系统媒体控制 | 不在本次范围 | 不移植，不注入其他包，不建立播放器/队列 |

结论：可以确认参考方案**保留了外层宿主的触摸/生命周期参与能力**；仅凭此 APK 不能证明所有 HyperOS 版本都通过同一外层方法完成上滑。当前实现是否完全复现原版体验，必须在目标系统验证。未复制参考应用完整源码、资源或依赖。

## 实现与所有权

1. LSPosed 同时启用 Android 系统（原独立窗口回退）和小米背屏中心。安装或调整作用域后需重启相应宿主；建议重启手机。框架协议仍为 5，新宿主协议为 1。
2. 宿主仅安装被动 Hook；收到听屿显式连接请求后，才通过 UID 检查的 `RearHostProvider` 注册 Binder。连接成功不等于歌词已显示。
3. 协调器优先尝试宿主：必须先释放原独立窗口；发现可见、已附着、背屏上的听屿音乐容器，才创建渲染器。没有兼容宿主则回退原 LSP 独立窗口。
4. 完整舞台报告 ready、并经过本机 WebView `onDraw` 边界后，才上报接管。这个边界**不是屏幕真实呈现时间的证明**。
5. 原卡片隐藏、VSync 暂停仅限已接管 root/music/InnerView。其他 MAML 场景、主屏、其他音乐包保持原样。媒体包变化后解除当前接管，恢复原卡片。
6. 每次显示使用 UUID；Binder 命令有代次、超时和确认。过期命令不能替换新会话；释放失败保留租约，阻止双窗口并行。关闭沿用协调器的有界重试。
7. Hook 类或必要方法缺失、WebView 无法创建、加载/渲染失败、首帧未确认：恢复原生卡片，确认释放后才能回退。未加入绕过宿主 WebView 权限限制的私有补丁。

开启“遮盖息屏”时，保留原有独立窗口路径，以继续提供既有原生面板电源控制；宿主路线不抢系统电源策略。设置偏好不会被删除或改写。Shizuku 继续使用独立窗口。

## 上滑、退出与恢复

宿主路线不使用 `RearLyricsActivity` 的上滑识别来假装系统卡片退出。只将短点击转发给歌词 WebView，拖动交给系统外层导航；全局 Activity 触摸 Hook 只观察当前背屏宿主，不替换结果。

上滑观测之后，必须同时出现宿主暂停、隐藏或移除，才判定主动退出；AOD、息屏和已知相机占用排除在外。主动退出结束本次显示会话，保存“已返回系统”的状态，不关闭用户的背屏功能偏好，不发送暂停音乐指令。自动恢复不会立即再次接管；设置控制中心提供“重新显示背屏歌词”。

相机占用复用现有监测器，宿主暂停并恢复原生内容；相机离开后仅在仍有显示意图、未主动退出且宿主可见时恢复。宿主隐藏/AOD 作为正常渲染暂停进入既有 LyricSyncLedger，避免误报失联。容器重建复用当前会话与现有快照；失败有界回退，不重启播放器。

系统外层若只做平移而不触发可观察生命周期/可见性变化，本版可能无法确认主动退出；此项必须从真机 `host/*` 日志验证，不能通过推测宣称已覆盖所有 ROM。

## 数据通路与资源

`实际播放内核 → 现有 RearNativeTrack / RearLyricsState → 受限 Provider 管道 → 宿主 WebView → 原舞台`。

- 不建立第二个播放时钟或歌词下载器；Media3 后台权威、兼容通道身份及原有 epoch 校验保留。
- Provider 仅接受背屏中心 UID，注册外的读取/操作还须匹配当前 LSP 显示会话。Binder 控制端只接受听屿 UID。
- 资源通过只读文件描述符管道流式传输；仅 packaged public 资源、现有歌词及 SharedArtworkAccess 支持的素材；不开放任意文件读取或本地 HTTP 服务。
- 状态跨进程校准每秒最多一次，歌曲/播放/Seek/外观变化走合并失效通知。字体和完整外观按 revision 缓存，不随每次时钟读取重复传输；失效期间的旧快照读结果丢弃。
- 渲染恢复清理 iframe 的旧 relay 缓存，废弃恢复前未完成的响应，重新绑定当前权威歌曲。同一 epoch 保留有效歌词和独立外观，不重新播放、重置进度或重复下载。
- 清理逐项隔离异常，移除 ContentObserver、媒体回调、显示监听器、WebView 和容器。没有新增高频 Binder 轮询或唤醒锁。

## 主要文件

| 文件 | 作用 |
| --- | --- |
| `RearHostHooks.java` / `RearHostedCard.java` | 宿主能力、实例过滤、触摸放行、接管与对称恢复 |
| `RearHostBridge.java` / `RearHostContract.java` / `RearHostProvider.java` | 双向 Binder 会话、UID 检查、只读流式资源桥 |
| `RearHostWebClient.java` / `RearHostSnapshotCache.java` / `RearHostUpdates.java` | 原舞台加载、状态校准与按事件失效 |
| `RearLyricsCoordinator.java` / `FoliaNativePlugin.java` | 现有协调器内的显示所有权、回退、诊断与真实状态 |
| `TingyuXposedModule.java` / `AndroidManifest.xml` / `xposed.xml` | 目标作用域与受限 Provider 注册 |
| `RearLyricsActivity.java` / `RearInteractionFrame.java` / `RearSwipeGesture.java` / `RearDisplayPolicy.java` | Shizuku/独立窗口上滑与安全清理；不替代宿主方案 |
| `rearLyricsTransport.ts` / `rearStateRelay.ts` / `RearLyricsSurface.tsx` | 渲染恢复时废弃旧消息并同步现有舞台 |
| `rearControlModel.ts` / `rearControlActions.ts` / 现有 settings hook 与 locale | 实际宿主状态、重新显示入口、双作用域说明；没有重做设置 UI |

## 验证

已通过 TypeScript 检查、237 项相关前端单测、875 项 Android JVM 测试，以及 15 项 Playwright 浏览器回归（320/360/393 宽度、深浅色、放大字体、独立配置与播放控件）。`assembleDebugAndroidTest` 成功，仅证明仪器测试 APK 已编译，未连接设备执行。

JVM 测试覆盖宿主准入、退出分类、旧会话/关闭回调、快照乱序与校准限频；前端测试覆盖歌词重连及设置操作。仪器测试检查独立窗口的触摸取消、退出去重及未授权 Provider 访问，**不能替代真实 MAML/LSPosed 测试**。Release 构建及最终 APK 校验信息见同版 Release 说明。

本环境没有连接小米 Android 设备。未执行真实锁屏、AOD、相机、系统上滑和 1–2 小时功耗测试，也没有用浏览器截图代替这些结论。

真机验收步骤：

1. 覆盖安装，核对两个 LSPosed 作用域并重启。播放听屿歌曲，打开系统背屏音乐卡片；关闭遮盖息屏后启用背屏歌词。检查诊断显示 `hostConnected=true`、`hostActive=true`、`displayMode=system-card`，仅显示连接不能算成功。
2. 背屏上滑：验证系统实际退出，音乐、进度、正面与灵动岛不变；等待 30 秒、切歌及开关相机均不自动抢回。点“重新显示”验证能重新接管。
3. 小距离滑动、横滑、多指、连续上滑及正常点击：不误触播放操作，不重复释放。记录 `host/user-exit` 与原生恢复日志。
4. 锁屏、解锁、AOD、亮灭屏、相机正/反向进入退出：区分正常暂停和主动退出，确认不闪烁、不黑屏、不抢相机。
5. A 未结束直接点 B，再快速 C/D；Media3→兼容→Media3、Seek、后台自动切歌：核对实际歌曲、epoch、歌词与完整舞台。
6. 切换其他音乐 App：恢复其原卡片，不显示听屿歌词、不向其发控制操作。宿主重启、旧容器销毁、渲染进程异常：原卡片恢复或确认释放后独立回退，没有双窗口。
7. LSP/Shizuku 互切前正常停止；独立外观、跟随正面、字体背景、相机避让保持有效。50 首连续播放，锁屏 1–2 小时后导出诊断，比对内存、CPU、唤醒与恢复次数。

## 回滚

实现与测试/发布分开提交，可对照 Release 的提交链接反向 revert；不清空任何用户设置、缓存或播放列表。真机遇到宿主不兼容时，禁用“小米背屏中心”作用域并重启宿主，保留 Android 系统作用域，即回到原 LSP 独立窗口回退；Shizuku 路径不受宿主注入影响。APK 降级受 Android versionCode 限制，建议以更高 code 构建回滚提交，不卸载清数据。
