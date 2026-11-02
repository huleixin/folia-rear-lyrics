# 听屿 1.3.96：背屏中心宿主（脱离系统音乐卡片）

> 1.3.97 修复了本版的宿主握手链（进程门禁、Application.attach 单点、接收器权限、Provider
> 可见性、缺少主动注册），并加入构建标识与分阶段诊断。见
> [`ANDROID-LSP-HOST-HANDSHAKE-1.3.97.md`](ANDROID-LSP-HOST-HANDSHAKE-1.3.97.md)。
> 本文的注入与生命周期设计不变。

基线：`tingyu-layout-1.3.95-preview`（1.3.95 / versionCode 118）。本版为 1.3.96 / 119。

本版回答一个具体问题：**听屿正常播放时，小米不一定会创建背屏音乐卡片**，而 1.3.95 的宿主
把「存在一张可见、MediaController 包名属于听屿的 MAML 音乐容器」当成硬前置，于是宿主
永远接管失败。本版彻底移除这条前置，改为把听屿歌词舞台注入**背屏中心自己的 launcher
窗口**，由听屿的显示会话直接决定显示与释放。

私有行为（入口类名、生命周期、触摸、AOD）仍需小米真机验证；本文把「代码做了什么」与
「真机上确认了什么」分开写。

---

## 1. 旧实现的边界（1.3.95）

`RearHostHooks.install()` 只挂 `com.miui.maml` 的三类对象：

| 旧前置 | 具体代码 | 失败表现 |
| --- | --- | --- |
| 必须有 MAML 音乐容器 | `mount()` 遍历候选 `FrameLayout`，要求 `mRoot.findElement("music_control")` 返回 `MusicControlScreenElement` | 没有卡片 → `未找到兼容、可见且属于听屿的音乐卡片` |
| 卡片必须属于听屿 | `RearHostedCard.ownMedia()` 读取 `MusicControlScreenElement.mMusicController.getMediaController()`，要求 `getPackageName()==听屿` | 卡片存在但媒体控制权不在听屿 → 立即让出 |
| 卡片必须可见 | `host.isShown()` + `displayId>0` | 卡片在但不可见 → 不接管 |

这三条都不是听屿能控制的：卡片由小米决定何时创建、由系统媒体焦点决定内容。把它们当成
显示前置，等于把「听屿要不要显示歌词」交给了系统 UI 的偶然行为。

1.3.95 另外还依赖 `root.selfPause()/detachFromVsync()/doneRender()` 和隐藏原生子 View 来
「接管卡片」，释放时必须对称恢复，任何一步失败都会留下半接管状态。这也是本版要一起
消除的风险面。

## 2. 参考实现与注入点

`changyun233/backmone` 的做法（`RearScreenTakeoverModule`）是：只 hook
`com.xiaomi.subscreencenter.SubScreenLauncher`，在 `onResume` 之后把自定义 View 用
`addContentView(MATCH_PARENT)` 加到 Activity 窗口顶层，并在 `dispatchTouchEvent` 里按需
消费触摸。它不寻找系统卡片、不暂停 MAML、不修改系统 APK。

本版采用同一注入点，但保留听屿自己的边界：

| 维度 | backmone | 听屿 1.3.96 |
| --- | --- | --- |
| 注入对象 | `RearAodCanvasView`（自绘仪表盘） | `RearHostView`（既有歌词舞台 WebView） |
| 触发条件 | 只要 launcher resume | 只在一个**经过验证的听屿显示会话**存活时 |
| 释放 | 视图随窗口 | 显式 `removeView` + 销毁 WebView + 注销监听；原生视图树从未被修改 |
| 触摸 | 只消费按钮区域 | 点击交给 WebView（舞台的 reveal/控制条），上滑由 `RearInteractionFrame` 识别后**释放会话**，不合成系统导航 |
| 数据 | `content://dev.backmone.state` | 既有 `content://<pkg>.rearhost` 资源桥（UID + session 双检） |

## 3. 所有权：只认听屿自己的会话

宿主所有权仍然只有一条来源：

1. 应用侧 `RearHostBridge.show(context, rearDisplay, …)` 生成 UUID 会话；
2. 通过 `content://<pkg>.rearhost` 的 `register` 拿到 UID 校验过的 Binder；
3. `SHOW(session, display)` 的调用方 UID 必须等于听屿（`Binder.getCallingUid()==appUid`，
   `appUid` 来自 Provider 的 `register` 返回值）；
4. session 必须通过 `RearHostPolicy.validSession()`（16–80 位 `[a-zA-Z0-9-]`）；
5. 同一时刻只允许一个 lease：第二个不同 session 的 `SHOW` 直接拒绝。

宿主视图不读取、不校验任何 `MediaController`：媒体归属与本版无关，也不会因为播放器切换
而改变宿主所有权——所有权只跟显示会话走。

## 4. 生命周期与「不抢屏」

宿主在背屏中心进程内的完整状态：

```
SHOW ──► attach ──► created ──► 首帧 onDraw ──► ready
          │             │
          │             └─ launcher pause ──► hide(paused: launcher-paused/camera/aod/display-off)
          │
          └─ launcher 不在前台 ──► requestLauncher（冷启动预算 2 次 / 间隔 6s）
HIDE / 上滑 / 失败 ──► release（移除视图、销毁 WebView、清 lease）
```

规则（全部在 `RearHostPolicy`，JVM 可测）：

| 场景 | 行为 |
| --- | --- |
| 相机（应用侧 `SUSPEND(true)`） | `hide` + `renderer.onPause()`；视图不可见、不接收触摸；相机离开后 `SUSPEND(false)` 再 `attach` |
| AOD（`STATE_DOZE/DOZE_SUSPEND`） | 同上；**不**请求点亮、**不**阻止系统 Dream |
| 背屏熄灭（`STATE_OFF`） | `SHOW` 直接以「背屏当前未点亮」失败，交回应用侧独立窗口的电源策略；已挂载的视图在熄灭时 `hide` |
| launcher 被别的界面盖住 | `hide` + `paused`，**不**再把它拉回前台（`pausedAt>0` 后本次会话禁止 `requestLauncher`） |
| launcher 窗口销毁 | 移除视图、`paused`；下次 `onResume` 重建，重建预算 4 次/会话 |
| 用户上滑 | 视图立即移除 → 原生 launcher 露出 → `user-exit` → 应用侧结束本次显示并写入 dismissed |
| 宿主首帧超时 | 应用侧 4.5s（`created` 后再给 4.5s）→ 释放 → 回退独立窗口 |

「不允许无限重建」由两个硬预算保证：重建 4 次/会话、主动请求 2 次/会话。任何一次预算
耗尽都会留下确切失败原因（`宿主重建次数已达上限`等），而不是继续循环。

## 5. 上滑退出与触摸

宿主视图树只有两层：`RearInteractionFrame`（`stage`）→ `WebView`（renderer）。

- 普通点击：`stage.onInterceptTouchEvent` 返回 false，事件进入 WebView，歌词页的
  `onPointerDownCapture={reveal}` 与控制条照常工作。
- 上滑：`RearSwipeGesture` 判定为单指、向上、速度/距离达标后开始拦截，WebView 收到
  `ACTION_CANCEL`；`ACTION_UP` 时 `actions.exit()`。退出路径先 `removeView` 再上报，
  原生 launcher 立刻可见。
- 首帧之前：`renderer.setOnTouchListener` 消费全部触摸，避免 alpha=0 的舞台把点击
  透传给下面的原生界面。
- 不消费横向滑动、多指、长按；不做 `dispatchTouchEvent` 结果替换，不注入按键。

`RearHostPolicy.userExit(interactive, suspended, sleeping, gestureAt, now)` 是第二道闸门：
只有「宿主当时确实可见可交互」的一次上滑才能结束显示会话；相机/AOD/熄屏期间不会误判。

## 6. 单一承载与回退

应用侧仍是「宿主优先、独立窗口兜底」，但两条路径互斥：

1. `begin()` 先检查 `RearLyricsActivity.isEnabled()/hasWindow()`，有窗口先 `closeWindow(SWITCH)`；
2. 宿主 `ready` 之前 `pending=true`，不会并行启动窗口；
3. 宿主失败/超时 → `RearHostBridge.release()` 确认返回后，`hostTried=true` → 走既有
   `RearLyricsLauncher` 独立窗口；
4. 宿主会话存续期间 `checkWindow()` 只做 `suspend/pulse`，不评估窗口重建；
5. 宿主会话真实承载过一次后（`hostReady()`），关闭时重置 `hostTried`，下一次播放仍优先
   宿主，而不是被一次暂停回退永久钉在独立窗口。

`RearHostBridge` 仍然只在收到 `ready` 时才把 `active` 置真；`created` 只是诊断事件。

## 7. 协议 v2

| 项 | v1（1.3.95） | v2（1.3.96） |
| --- | --- | --- |
| descriptor | `<pkg>.rearhost.v1` | `<pkg>.rearhost.v2` |
| 事务载荷 | session + int | session + int + **display id** |
| 事件 | ready/paused/failed/user-exit | + created/launch/released |
| 宿主对象 | MAML 音乐卡片 | 背屏中心 launcher 窗口 |

协议号与 descriptor 一起升级：更新 APK 后若背屏中心进程仍驻留旧模块，握手被
`RearHostProvider`/`RearHostBridge.connect` 拒绝，应用侧按「宿主不可用」回退独立窗口，
不会把 v1 的语义当 v2 使用。

## 8. 日志与诊断

三层记录，全部可直接导出：

| 层 | 位置 | 内容 |
| --- | --- | --- |
| 模块 logcat | tag `TingyuRearHost` | `install capability=…`、`view created display=…`、`launcher requested …`、`released …`、`view create failed: …` |
| 应用 trace | `RearLyricsTrace`（设置里的 Lock history / 诊断） | `host/created`、`host/launch`、`host/ready`、`host/paused`、`host/failed`、`host/user-exit`、`host/released`、`host-fallback`、`host-disconnected` |
| 诊断行 | `FoliaNativePlugin.rearStatus` | `hostConnected`、`hostActive`、`hostSession`、`hostDetail`、`displayMode` |

`hostDetail` 会保留最后一条失败原因（hook 未加载、launcher 不在前台、背屏未点亮、重建
预算耗尽、WebView 创建失败、首帧未确认……），不需要靠「没反应」猜。

## 9. 没有改什么

- 不修改 Media3 播放、兼容通道、音源、歌词获取与 epoch 校验。
- 不修改正面 UI 的结构、交互与设置项；只把「显示承载」的状态文案从「系统音乐卡片宿主」
  改为「背屏中心宿主」，并把教程里「先打开音乐卡片」这一步删掉（旧文案在新架构下是错的）。
- 不修改歌词舞台页面、外观、字体、背景与动效：同一个 `rear-lyrics.html`、同一个
  `RearHostWebClient`、同一组 `folia-rear-power` / `folia-rear-resync` 事件。
- 不接管系统音乐卡片，不修改其他播放器的 MediaSession，不注入除
  `com.xiaomi.subscreencenter` 之外的任何进程。
- 不通过「全局禁用背屏中心」换取成功：宿主只在一个窗口上增加一个子 View。

### 9.1 两处明确的行为边界

1. **背屏电源与 AOD 仍归系统。** 宿主不调用 `HOLD_POWER`、不注入 `requestDisplayPower`、
   不阻止 `subscreencenter` 的 AOD Dream。面板进入 `DOZE/DOZE_SUSPEND` 时宿主隐藏并停
   渲染，回到 `STATE_ON` 后重新显示 —— 这是「不抢屏」，代价是系统 AOD 期间不显示歌词。
   需要 AOD 常亮歌词时仍可用独立窗口路径（它保留原有的电源租约与 Dream 拦截）。
2. **上滑由宿主自己识别，不伪造系统导航。** 宿主视图覆盖在 launcher 上，系统级上滑若被
   launcher 内部消费，听屿无法在不拦截的情况下同时保证「退出歌词」。因此
   `RearInteractionFrame` 识别到上滑后直接释放会话并移除视图，露出的就是未被修改过的
   原生 launcher；没有调用 `finish()`、没有注入按键、没有替换 `dispatchTouchEvent` 结果。

## 10. 代码地图

| 文件 | 变化 |
| --- | --- |
| `RearHostHooks.java` | 重写：`performResume/performPause/performDestroy`（缺方法时退回 launcher 类声明）→ 只认 `SubScreenLauncher`；SHOW/HIDE/SUSPEND/PROBE；重建/请求预算；事件上报 |
| `RearHostView.java` | 新增：launcher 窗口里的宿主视图（`RearInteractionFrame` + WebView），可见性、AOD/相机挂起、首帧、释放 |
| `RearHostedCard.java` | 删除：MAML 卡片接管、`ownMedia()`、原生子 View 隐藏/恢复全部移除 |
| `RearHostPolicy.java` | 重写为无媒体参数的纯逻辑：render/userExit/mayLaunch/mayRebind |
| `RearHostContract.java` / `RearHostProvider.java` / `RearHostBridge.java` | 协议 v2、display 载荷、created/launch/released、`hostReady()` |
| `RearLyricsCoordinator.java` | `show()` 携带背屏 id；宿主成功过就允许下一次会话再试宿主 |
| `RearHostPolicyTest.java` | 重写：无卡片准入、AOD/相机、上滑归因、请求预算、重建预算 |
| `zh-CN.ts` / `en.ts` | 仅显示承载文案与教程「start」一句 |

## 11. 验证

自动化（本机实际执行）：

- 宿主子树（`RearHostHooks/RearHostView/RearHostPolicy/RearHostContract/RearHostWebClient/...`）
  用 `android.jar (API 36) + de.robv.android.xposed:api:82` 独立 `javac` 通过（0 错误）；
- `:app:testDebugUnitTest` **879 项、0 失败、0 错误、128 个测试类**，`BUILD SUCCESSFUL`；
  其中 `RearHostPolicyTest` 10 项覆盖本版全部新规则（无卡片准入、AOD/相机、上滑归因、
  请求预算、重建预算）；
- 前端 `tsc --noEmit` 与相关单测覆盖文案改动。

**没有连接小米真机**：入口类名是否仍是 `com.xiaomi.subscreencenter.SubScreenLauncher`、
`performResume` 是否在 HyperOS 上按预期回调、`addView(decor)` 是否真的出现在背屏、上滑
坐标方向、AOD 下 launcher 是否 pause，都必须在目标设备上确认。自动化通过不等于真机通过。

真机验收清单：

1. 覆盖安装、确认两个 LSPosed 作用域、重启手机；播放听屿歌曲，**不打开系统音乐卡片**，
   开启背屏歌词。诊断应为 `hostConnected=true`、`hostActive=true`，
   `hostDetail=背屏中心宿主已接管歌词舞台`；logcat 出现 `view created display=1`。
2. 背屏上滑：歌词消失、原生背屏界面立即出现、音乐继续；`Lock history` 出现
   `host/user-exit`；点「重新显示背屏歌词」能再次注入。
3. 相机：从背屏进入相机，歌词让位且不闪烁；退出相机后歌词回到背屏，不覆盖相机预览。
4. AOD/锁屏/点亮/主屏解锁：不黑屏、不抢 Dream；`host/aod`、`host/display-off` 与恢复
   的 `host/ready` 成对出现。
5. 打开另一个背屏应用再返回：返回后歌词恢复；期间宿主不把 launcher 拉回前台。
6. 长时间播放 + 反复锁屏：`rebinds` 不超过 4、`launches` 不超过 2；不出现双窗口。
7. 切歌、切播放器身份、Media3↔兼容：舞台内容与外观不变；宿主不因媒体变化重建。
8. 关闭 LSP 作用域：宿主不可用 → 释放 → 独立窗口照常工作（回退可用）。

## 12. 回滚

删除背屏中心作用域并重启即可回到独立窗口，不需要卸载或清数据。代码层面本版与
1.3.95 的差异集中在 `RearHost*` 一组文件与 `RearLyricsCoordinator.begin()` 一处调用，
可直接 revert；`RearHostedCard` 的删除与 `RearHostView` 的新增是同一个提交内的对称改动。
APK 降级受 versionCode 限制，回滚请用更高 versionCode 构建。
