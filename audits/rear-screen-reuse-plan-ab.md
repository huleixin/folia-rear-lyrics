# 听屿小米背屏：成熟开源方案复用评估（方案 A / 方案 B）

- 目标设备：小米 17 Pro / HyperOS 4（Android 16，API 36）
- 审查日期：2026-10-30
- 结论性质：源码级对比 + 现状审计。**所有"可用/通过"判断均未在真机确认**，见第 10 节。
- 本文不含版本号变更建议，不涉及 Media3、音源、歌词获取、主界面。

---

## 0. 结论先行

1. **听屿当前的背屏控制不是"一个决策 + 若干执行"，而是 7 个决策点、4 路相机信号、4 条电源路径、3 条唤醒路径并存。** 相机让屏和相机退出恢复分别由两套计时器串联决定，窗口在相机到来时被 `finish()` 销毁、离开时 `am start` 重建——这是闪烁和"相机反复开关后歌词回不来"的共同工程根因，不是相机监听不够灵敏。
2. **最值得复用的成熟做法来自 Mi Back Screen（MIT）：把"别的应用占用背屏"建模成一次 `Lend`（有 id、可持久化、只允许一个、旧回调不能结束新 lend），并且让屏期间不销毁自己的窗口，只停止覆盖与停止续租；相机退出由"任务列表连续两次未命中"确认，而不是靠设备可用性边沿。** 这一条同时消掉闪烁、消掉相机抢占丢失、消掉"恢复即整窗重建"。
3. **方案 A（独立背屏 Activity + Shizuku 任务控制）风险显著更低、可回滚，推荐先做**；方案 B（LSPosed 系统背屏容器集成）能把相机仲裁放进 `system_server`，但类名/方法/白名单字段全部依赖 HyperOS 私有实现，HyperOS 4 上属于"每次系统升级都要重新适配"的脆弱面，且一旦出错是系统级（背屏整体不可用）。**B 只在 A 被真机证据证否后再考虑。**

---

## 1. 审查对象

| 项目 | 快照 | 许可证 | 规模 |
|---|---|---|---|
| `totallynotkasai/mi-back-screen` | `842d0ca` 2026-10-14 | MIT | 3.6 MB |
| `killerprojecte/REAREye` | `ff0c9ef` 2026-10-28 | GPL-3.0 | 8.9 MB |
| `changyun233/backmone` | `532091b` 2026-08-06 | BSD-3-Clause | 776 KB |
| `wmqc97/folia-android` | `4d86ad2` 2026-10-24 | AGPL-3.0 | 129 MB |

四个仓库已完整克隆到 `refs/bsresearch/`，本文所有引用均为该快照下的真实文件与行号，不采信 README 的功能宣称。

听屿自身为 AGPL-3.0（Folia fork），`THIRD-PARTY-NOTICES.md` 已记录对 `wmqc97/folia-android` 的复用。

---

## 2. 听屿现状审计：谁在决定背屏

### 2.1 现有链路

```
                 ┌────────────── 播放服务 / 播放状态（enabled, playing, manual）
                 │
   CameraManager.AvailabilityCallback ──► RearCameraPolicy（ENTER 900ms / EXIT 2500ms）
                 │                                   │
   am stack list 探测（每 2s） ──► RearLyricsTaskList ─┤
                 │                                   ▼
   LSP 模块内 shouldSleep 里看 top activity ──► RearHandoffState（8 态）── Action{RELEASE, RESTORE}
                 │                                   │
   DisplayListener / SCREEN_ON|OFF / USER_PRESENT ───┤
                 │                                   ▼
   RearLyricsActivity.onStop/onDestroy ──────► RearLyricsCoordinator.checkWindow（2s / nudge 350ms）
                 │                                   │
   SensorEventListener（后置接近）──► changeSleep ───┤
                                                     ▼
              RearLyricsLauncher（am start / move-stack / wake / power）
              ShellUserService（Shizuku 用户服务，VERSION=251）
              LspRearBridge（system_server binder，VERSION=5）
```

### 2.2 重复控制清单（源码证据）

| # | 决策 | 参与方 | 重复/冲突事实 |
|---|---|---|---|
| 1 | "相机是否占用背屏" | ① `RearCameraPolicy`（设备可用性，900/2500ms）② `RearLyricsTaskList` + `RearCameraPolicy.isCameraTask`（任务名含 camera）③ `lsp/RearWindowLease` 内部 `cameraOnTopAt`（system_server 里看 top activity，10s grace）④ `RearLspPowerControl` 里的 `presentationAllowed()` 前置校验 | **同一条事实在 4 个地方各自判定**，三种数据源（camera2 设备、任务列表、窗口管理器）。任一源抖动即翻转；且 ③ 只在 LSP 后端存在，Shizuku 后端只有 ①②。 |
| 2 | "相机走了没有" | `RearCameraPolicy.EXIT_SETTLE_MS=2500` → `RearHandoffState.EXIT_CONFIRM_MS=800`（任务可读）/`EXIT_CONFIRM_UNVERIFIED_MS=4000`（不可读）→ coordinator `schedule(700)` | **三段计时串联**，最坏 ~7.2s 才可能恢复，期间每 600–3000ms 重复 `evaluate()`。 |
| 3 | "谁拥有背屏" | `RearHandoffState`（8 态机）与 `RearOwnershipState`（6 态纯派生） | 两套状态模型、两套命名（`CAMERA_OWNED` vs `CAMERA_OWNED`、`RELEASING` vs `RELEASING`、`WAITING_CAMERA_EXIT` 无对应），诊断同时输出两份。 |
| 4 | "让屏怎么做" | `RearLyricsActivity.yieldToCamera()`（隐藏 + moveTaskToBack）**和** `RearLyricsCoordinator.closeWindow(CAMERA)` → `finishClosing()` → `RearLyricsLauncher.close()` → `finishIfShown()` | 两条语义冲突的路径同时存在。`startCameraRelease()` 第 191 行：`if (RearLyricsActivity.isEnabled() || lspHolding || sleeping || powerBusy || closing) closeWindow(CAMERA);` —— **相机一来就销毁窗口**，`yieldToCamera()` 的"保窗"白做。 |
| 5 | "恢复怎么做" | `begin()` → `RearLyricsLauncher.start()`（直启 → 主屏占位 → move-stack → 8s awaitWindow） | 由 6 个入口触发：`checkWindow` 心跳、`nudge()`（350ms）、`ServiceConnection.onServiceConnected`、`lspConnected`、`backendChanged`、`onDisplayAdded/onDisplayChanged`、`SCREEN_OFF` 分支。`pending`/`attemptToken` 只保护装载中，不保护"本轮已经恢复过"。 |
| 6 | 电源 | ① `ShellUserService` `TRANSACTION_SLEEP/RESTORE_POWER`（`power-off` / SDK≥36 用 `power-reset`）② `RearLspPowerControl` HOLD/RELEASE + 60s lease + 20s 续租 ③ `lsp/RearDisplayPower` 拦 `requestPowerState` 改 `POLICY_BRIGHT` ④ `lsp/RearDirectPower` 拦 `requestDisplayPower` 并回放 ⑤ `FLAG_KEEP_SCREEN_ON` | 5 条路径写同一块面板；②③④ 在 LSP 模式下同时生效，相机期间靠 `cameraOnTopRecently` 各自打补丁。 |
| 7 | 唤醒 | `wake()`、`wakeMissing()`（每 5s、最多 8 次）、`changeSleep(false)`、封面感应恢复 | 无统一节流；Mi Back Screen 用单一 `WakeThrottle`（10s，面亮则不唤醒）。 |
| 8 | 被覆盖后的反应 | `inspectFront()` → `covered=true` → `nudge()` → `begin()` | 与小米官方背屏中心 `SubScreenLauncher` 抢前台：官方在背屏 dim/主屏切换后会把 launcher 拉回前台盖住第三方窗口（folia-android 真机注释已记录该行为）。我们以"检测被覆盖→再启动"对抗，形成互相抢占。 |
| 9 | 用户关闭语义 | `disable()` 落盘 `auto_enabled=false` | 但**从最近任务划掉 / 系统返回关闭歌词窗口**走的是 `onDestroy → windowChanged → begin()`，只要还在播放就立即重建。"用户主动关闭"与"窗口被杀"没有区分。 |

### 2.3 闪烁的直接来源（按贡献排序）

1. **相机 → 销毁窗口 → 相机离开 → 整窗重建**：`finishIfShown()` 后 `am start` 新建 Activity + 新建 WebView（`installRenderer`），首帧到内容就绪之间是黑屏。这是最明显的一次闪。
2. **主屏透明占位迁屏**：直启失败时先 `am start --display 0` 起透明 Activity，再 `move-stack` 到背屏。主屏可见期内会出现一帧半透明窗口（我们无首帧保持，Mi Back Screen 用 `holdFirstDraw` 规避）。
3. **双 settle + 350ms 心跳**：相机镜头切换（一关一开，间隔 <900ms）会触发一次 RELEASE，随后 EXIT 计时又开始；两个 settle 串联导致"释放—等待—重建"在几秒内重复。
4. **与官方背屏中心互相抢占**：`covered` 抖动直接 `nudge()` 触发 launch。
5. **电源跳变**：`RESTORE_POWER`（`power-reset`）后紧跟 `WAKE`/`HOLD`，面板在几十毫秒内经历 off→on；LSP 的 `replay()` 还会把原始 request 再打一次。
6. **WebView 重建**：`onConfigurationChanged`/迁屏后 `installRenderer` 重挂 Chromium，动画从 0 开始。

---

## 3. 四个项目的源码核查

### 3.1 Mi Back Screen（MIT）

真实存在的关键文件：`core/RearCommands.kt`(271) `core/LendWatchdog.kt`(134) `core/RearState.kt`(245) `core/KeeperService.kt`(1295) `core/DisplayKeeper.kt`(178) `core/RearTweaks.kt` `core/WakeThrottle.kt`(30) `camera/XiaomiCamera.kt`(211) `rear/BackCover.kt`(90) `rear/RearHostActivity.kt`(991)。

| 机制 | 源码事实 | 对我们的价值 |
|---|---|---|
| **Lend（借出）模型** | `RearState.kt`：`data class Lend(reason, taskId, packageName, id=newId())`；`RearOwner = Xiaomi \| Host \| Popover \| Lent(lend)`；`lent()` 只允许"当前无 lend"；`returned(lend)` 只有 `lend == this.lend` 才生效；lend 落盘并带 `BOOT_COUNT`，重启后不"修复" | **核心可复用思想**：单一所有者 + 单调 id + 只允许一个外部应用。直接解决我们 4 路信号各自判定、旧回调结束新会话的问题。 |
| **让屏不毁窗** | `KeeperService.onLent()`：只 `endPopover`；`hostToken = null` 只在真正 `restore/fail` 时清；注释明确 "The host stays underneath if it's up"；`onLendEnded` 才 `scheduleRearCheck()` 或 `restoreXiaomi()` | **闪烁的第一解**：占用期间不销毁自己的窗口。 |
| **退出确认** | `LendWatchdog`：仅在"有 lend"时每 3s 读一次 `am stack list`；`LendMisses` 要求**连续 2 次未命中**才结束，列表读不到返回 `null` 且"不算一次"；若自己的窗口刚回到前台，1 次即可 | 替代我们"设备可用性边沿 + 800/4000ms 双 settle"。不可读≠空闲，方向正确。 |
| **相机启动** | `RearCommands.openXiaomiCamera()`：`am start --display <rear> -n com.android.camera/.Camera -f 0x30a08000`；失败回退标准 `STILL_IMAGE_CAMERA` intent；`XiaomiCamera.opened()` 用 1.5s 内"在背屏前台"验证；**先记 lend 再启动** | 我们是"检测系统相机"，不需要拉起相机；但"1.5s 内确认在背屏前台"的判据可复用。 |
| **相机自动关闭** | `CameraDim`：背屏 5s 内未点亮点 → 关闭；亮过又 dim → 关闭。关闭方式：在亮屏且在前台时发 `KEYCODE_BACK`（让相机自己存盘），3s 后仍在才 `force-stop` | 说明"相机退出"在系统侧并不总会自己发生；我们至少要能识别"相机还在但面板已灭"。 |
| **唤醒节流** | `WakeThrottle`：已亮不唤醒；距上次 <10s 不唤醒 | 我们 3 条唤醒路径都缺这一层。 |
| **官方背屏中心共存** | `TaskList.xiaomiLauncherUnder()` + `RearCommands.restartXiaomiIfUnder()`：若官方 launcher 在自己下面且自己在前台，**重启一次**小米背屏应用（它不再带 launcher 回来）；`restoreXiaomiRearLauncher()` 退出时拉回官方 launcher | 比"被覆盖就再启动自己"温和得多：一次重启，不进入抢占循环。 |
| **Shizuku 用法** | `RearCommands.exec()`：反射 `Shizuku.newProcess` 直接跑命令，5s 超时，双流独立读；**没有常驻 UserService、没有版本握手** | 我们的 `ShellUserService`（VERSION=251、`bindUserService`、`transact` 协议）复杂度高得多，任何一次版本/进程变化都会"服务版本不匹配"。可作为 A 的简化方向。 |
| **背屏设置还原** | `RearTweaks`：改 `subscreen_display_time` / 背屏 density / rotation 前先落盘 original（`commit()` 而非 `apply()`），结束或崩溃后按"当前值仍等于我们写的值"才还原 | 我们目前不改这些系统设置（只改 display power），无需整套；但"只还原自己写过的值"这一条适用于我们的 lease/power。 |
| **直启 opt-in** | `AndroidManifest.xml`：application 与 `RearHostActivity` 都有 `meta-data miui.rear.policy = 1`；锁屏时改为"主屏启动 + move-stack" | 我们已有同样的 meta-data（`AndroidManifest.xml` application 与 `RearLyricsActivity` 各一条），**这条不是差异项**。 |

**不适用/不采纳**：壁纸/时钟/通知/充电动画整套 UI；`Popover`；通知监听；Quick Switch（把任意应用投到背屏，会引入新的争抢面）。

### 3.2 REAREye（GPL-3.0）

仅作为**方案 B 的可行性证据**审查，不复制代码（GPL-3.0 与我们 AGPL-3.0 可组合，但模块内全部是 HyperOS 私有符号 + DexKit 动态解析，复制即等于承诺跟随其版本维护）。

| Hook 目标 | 源码事实 | 含义 |
|---|---|---|
| `com.android.server.wm.ActivityStarterImpl` 的 `isShouldShowOnRearDisplay(ActivityInfo\|ActivityRecord)` | before 里把私有静态集合 `REAR_SCREEN_METADATA_WHITE_LIST` 清空后注入白名单包名；after 里可强制 `true` | 系统用"元数据白名单"决定哪些 Activity 能出现在背屏；第三方应用只能靠 `miui.rear.policy` 元数据进入，且**锁屏时只认系统内置列表**。 |
| `isAllowedToStartOnRearDisplay` | 白名单命中则把 `false` 改 `true` | 这是"被背屏策略拒绝"的兜底开关。 |
| `com.android.server.wm.ActivityTaskSupervisor.isCallerAllowedToLaunchOnDisplay` | 注释明确：HyperOS / Android 16+ 对**非系统调用方（包括 shell / root）一律返回 false**；hook 在 `displayId != 0` 时改 `true` | **方案 A 在 HyperOS 4 上的最大风险点**：`am start --display` 可能直接被拒，只能靠 `miui.rear.policy` 或 move-stack。 |
| `com.android.server.power.DualScreenCoverManager.showCoverView(int)` | 直接在 display 1 上抑制 | 这是"背屏被盖一层"的系统级来源之一（合盖/休眠时的 cover view），**闪烁可能与它有关**，但只能由 B 处理。 |
| `com.xiaomi.subscreencenter` 的音乐控件白名单 | `MusicControlWhitelistModule`：DexKit 动态找 `snapshotMethod`，往 registry map 里塞 `<pkg> → "music"`；再 hook `MusicControlScreenElement$1.onClientMetadataUpdate` 强制 `requestUpdate` | 官方背屏中心的音乐控件只认白名单；**这也解释了"系统端是否显示"不可观测**——那是另一个进程的 MAML 渲染。 |
| LSPosed 兼容处理 | `HookPackageVersion.resolveHookPackageVersionCode()` 用包版本 + DexKit 缓存；`HotReloadPolicy.KEEP`；每次系统/应用升级后 hook 目标可能不存在 | B 的维护成本是"每次 HyperOS 升级重新找符号"。 |

**结论**：REAREye 证明 B 在小米 17 Pro 上**能做**，同时也证明它**脆弱**（KavaRef + DexKit + 私有字段名）。

### 3.3 Backmone（BSD-3-Clause）

| 机制 | 源码事实 | 含义 |
|---|---|---|
| 注入范围 | `RearScreenTakeoverModule`：libxposed API 102，**单一静态作用域 `com.xiaomi.subscreencenter`**，不注入 `system_server`、不改系统 APK | B 的"低风险子集"：只进背屏中心进程，出问题最多是背屏 UI 异常。 |
| 渲染注入 | hook `SubScreenLauncher.onResume()` → `addContentView(RearAodCanvasView)`；hook `dispatchTouchEvent` 让自绘层优先吃触摸 | 与官方 launcher 共存而非替换，AOD 与 active 共用一个 View，DOZE_SUSPEND 时保留最后一帧。 |
| 独立窗口 | 另有 `RearActivity`（singleTask / landscape / excludeFromRecents），与注入层并存 | 证明"独立 Activity + 注入"可以共存，不必二选一。 |
| 状态桥 | `content://dev.backmone.state` 只允许自己 UID 与背屏中心 UID | 进程间传状态的最小面。 |

**结论**：Backmone 是 B 的"最小可行子集"参考（只注入背屏中心、不碰 system_server），但它的目标版本是 **HyperOS 3 / `RELEASE-1.0.2605272226`**，文档自己写了"HyperOS 更新可能重命名 launcher 或改变生命周期，需要重新真机验证"。

### 3.4 Folia 小米背屏适配版（AGPL-3.0，我们的同源兄弟）

| 机制 | 源码事实 | 与我们的差异 |
|---|---|---|
| 直启 + 占位迁屏 | `RearProjectionController.start()`：`am start --display 1` → 失败则主屏占位 + `moveTaskToDisplay()`（三级命令回退：`am task move-task-to-display` → `am display move-stack` → `service call activity_task 50`），**按效果复核**（不看 exit code，轮询 `am stack list` 12×60ms） | 我们只试一次 `move-stack`，且以 `awaitWindow` 判定；效果复核更可靠。 |
| **压掉官方背屏中心** | `suppressOfficialSubscreenCmd()` = `pm disable-user --user 0 com.xiaomi.subscreencenter; am force-stop ...`；落屏成功后压掉并**再 start 一次**自己的页面；退出/`onDestroy` 时 `restoreOfficialSubscreenCmd()`（`pm enable` + `am start` 回背屏） | 我们完全不碰官方中心，改用"被覆盖就重启自己"。这是闪烁结构差异的关键：他们一次性消除争抢源，我们在持续对抗。风险是他们把系统应用禁用了（崩溃/被杀时背屏会空着，只能靠 `onDestroy` 兜底）。 |
| 摄像头避让 | `RearDisplayCommands.SAFE_LEFT_PX = 277`（976×596 实测：摄像头玻璃硬边 277px，系统 cutout 上报 296px），前端以固定值布局 | 我们 `rearCameraSafeArea` 已参考其坐标换算（已记入 NOTICE），属已复用部分。这里"避让"是**构图避让**，不是"相机占用时让出面板"。 |
| 窗口属性 | 独立 `taskAffinity` + `singleInstance`；`onWindowFocusChanged` 重新 `applyImmersive()`；`android:turnScreenOn` | 与我们 `RearLyricsActivity` 同类。 |
| 任务关闭 | `am stack remove <RootTaskId>` 优先，失败再让 Activity 自己 `finish`（`--es folia.rear.cmd finish`） | 我们只有 `finishIfShown()`（同进程），跨进程场景更弱。 |

**结论**：同源项目验证了"直启不可靠、move-stack 才是主路径"，也给出了"压掉官方中心"这一最有效的抗闪烁手段——但它是**全局副作用**（禁用系统应用），与"用户主动关闭后不自行唤醒"的原则冲突，需要谨慎评估；且它没有处理相机。

---

## 4. 许可证矩阵

| 来源 | 许可 | 与听屿（AGPL-3.0）组合 | 本文建议 |
|---|---|---|---|
| mi-back-screen | MIT | 兼容，需保留版权与许可声明 | **可复用实现与结构**，注明来源 |
| backmone | BSD-3-Clause | 兼容，需保留版权、许可与免责声明 | 可复用（仅 B 的注入骨架） |
| REAREye | GPL-3.0 | AGPL-3.0 §13 允许与 GPLv3 组合，理论上兼容 | **不复制代码**；只按"事实性符号"（类名/方法名）重新实现 |
| folia-android | AGPL-3.0 | 同许可，兼容；上游要求保留声明 | 已按 NOTICE 复用；新增复用需补条目 |

- 本文推荐方案 A 的核心（Lend 模型、连续两次未命中、唤醒节流、让屏不毁窗）来自 MIT 项目，**属于可安全复用区间**；仍建议以"重写实现 + 注释引用"的方式落地，而不是整段搬运 Kotlin。
- 方案 B 的 hook 目标符号（`ActivityStarterImpl#isShouldShowOnRearDisplay`、`REAR_SCREEN_METADATA_WHITE_LIST`、`DualScreenCoverManager#showCoverView`）是**事实性接口信息**，重新实现不构成 GPL 代码复制；但若直接搬运其 KavaRef/DexKit 解析代码，则必须按 GPL-3.0 处理。**本评估建议不搬运。**

---

## 5. 方案 A：独立背屏 Activity + 成熟 Shizuku 任务控制

### 5.1 目标形态

保留现有 `RearLyricsActivity`（歌词舞台、逐字高亮、背屏专属布局全部不动），只重写"谁拥有背屏 / 何时让 / 何时回"这一层：

```
                 ┌─ RearLend（一次外部占用：reason + pkg + taskId + 单调 id）
 单一事实源 ──►  │
 （后屏前台任务）  └─ RearOccupancy（纯逻辑状态机，无 Android API）
                        │  owner ∈ {XIAOMI, TINGYU, CAMERA(lend), USER_DISMISSED}
                        │  Action ∈ {NONE, YIELD, RESTORE, WAKE}
                        ▼
                 Coordinator（执行器，只做三件事）
                   YIELD   → 隐藏视图 + 释放 lease + 恢复面板策略（不 finish、不 destroy WebView）
                   RESTORE → 重新显示同一窗口（resumeFromCamera），必要时才 am start
                   WAKE    → 经统一节流后 input keyevent WAKEUP
```

### 5.2 源码依据（逐条）

| 设计点 | 依据 |
|---|---|
| 单一 owner + 单调 lend id，旧回调不能结束新 lend | `mi-back-screen/core/RearState.kt` `Lend.newId()/returned(lend)` |
| 相机占用判定只认"后屏前台任务" + 连续 2 次未命中，读不到不计 | `core/LendMisses.kt`（`MISSES_TO_END=2`，`null` 不算 miss）+ `core/LendWatchdog.kt`（3s 间隔，仅在有 lend 时） |
| 让屏期间不销毁窗口 | `core/KeeperService.kt#onLent`（host 留在下面，不清 token、不 finish） |
| 唤醒节流 10s、面亮不唤醒 | `core/WakeThrottle.kt` |
| 官方背屏中心：只在"自己在前台且官方 launcher 在下面"时重启一次官方应用；退出时拉回官方 launcher | `core/TaskList.kt#xiaomiLauncherUnder` + `RearCommands.restartXiaomiIfUnder/restoreXiaomiRearLauncher` |
| 迁屏按效果复核（不看 exit code，轮询任务列表） | `folia-android/rear/RearDisplayCommands.moveTaskToDisplay`（12×60ms 复核） |
| Shizuku 直连执行、无常驻服务、无版本握手 | `mi-back-screen/core/RearCommands.exec`（反射 `Shizuku.newProcess`，5s 超时，双流独立读） |
| 直启失败 → 主屏透明占位 + move-stack | 我们已有；`mi-back-screen#launchHost` + `folia-android#tryPlaceholderMove` 提供更稳的验证与首帧保持 |

### 5.3 需要替换的现有实现

| 现有 | 处置 | 理由 |
|---|---|---|
| `RearHandoffState`（8 态）+ `RearOwnershipState`（6 态） | **合并为一个** `RearOccupancy`（owner + 4 个 Action） | 消除两套状态模型（重复控制 #3） |
| `RearCameraMonitor` + `RearCameraPolicy`（camera2 可用性） | **降级为诊断**，不再参与所有权判定 | 镜头切换会 900ms 抖动，是 (#1) 的主要噪声源；设备占用≠面板被相机使用 |
| 双 settle（2500ms + 800/4000ms） | 删除，改为 `LendMisses` 连续 2 次未命中（约 3s，证据不足则维持） | (#2) 三段计时串联 |
| `startCameraRelease()` 里的 `closeWindow(CAMERA)` | 改为 `YIELD`：隐藏 + 释放 lease + 恢复电源，**不 finish** | 闪烁主因 1 |
| `checkWindow` 每 2s 无条件 `inspectFront` | 只在"我们持有时"探测；lend 期间按 1.5–3s 退避 | 降低 shell 压力与误判 |
| `wake()` / `wakeMissing()` / `changeSleep(false)` 三路唤醒 | 统一走 `WakeThrottle`（10s / 面亮跳过 / 每 episode 上限） | (#7) |
| `ShellUserService` 常驻 binder（VERSION=251, 6 个 transaction） | 可选：改为 `Shizuku.newProcess` 直连（保留旧通道作为回退） | 去掉版本握手与 binder 死亡面；**此项独立评估，不作为 A 的前置** |
| `RearLspPowerControl` 的 60s lease + 20s 续租 | Shizuku 后端下本就不该走这条；A 只保留 `TRANSACTION_SLEEP/RESTORE_POWER` | (#6) 四条电源路径收敛为一条 |
| `RearLyricsLauncher.close()` 无条件 `finishIfShown()` | 区分"用户关闭"（finish）与"让屏"（hide） | 当前 `yieldToCamera()` 被 `close()` 抵消 |
| 最近任务划掉窗口 → 立即重建 | 增加显式 `dismissed`（落盘），只有用户再次开启才清除 | (#9) "用户主动关闭时绝不自行唤醒" |

### 5.4 HyperOS 4 兼容风险（A）

| 风险 | 依据 | 缓解 |
|---|---|---|
| **`am start --display` 被 `isCallerAllowedToLaunchOnDisplay` 拒绝** | REAREye `ExternalDisplayLaunchUnlockModule` 注释明确 Android 16+ 对 shell/root 也返回 false | 依赖 `miui.rear.policy=1`（已具备）+ 主屏透明占位 + move-stack；命中率靠真机日志判定 |
| `am stack list` 输出格式再次变化 | 我们已兼容 `RootTask`/`Task{}`；folia-android 只认 `RootTask` | 保持"解析不出即 `readable=false`，绝不当成空闲" |
| `move-stack` 在 API 36 更名 | folia-android 三级回退，注明 Android 17 上 `am task move-task-to-display` 已不存在 | 保持三级回退 + 效果复核 |
| 官方 `SubScreenLauncher` 再次抢前台 | folia-android 真机注释（dim 后把 launcher 拉回、我们的窗变 `visible=false`） | 先用"重启一次官方应用"（Mi Back Screen 法）；仍不行再评估禁用（副作用大，需要单独开关） |
| 背屏 display 在相机期间从 DisplayManager 消失 | 我们已有 `rememberedRear` + 有界唤醒 | 保留 |
| 锁屏时第三方背屏启动被拒 | `isShouldShowOnRearDisplay` 只认系统列表；我们已有锁屏走主屏占位 | 保留 |

### 5.5 回滚方法

1. 全部改动在一个隔离分支 `rear-plan-a`，**不合并 main**；回滚 = 切回 `native-bg-playback`。
2. 逐提交可回滚：`①Lend 纯逻辑 + 测试（无行为变化）` → `②让屏不毁窗` → `③单 settle 替换` → `④唤醒节流/用户关闭语义` → `⑤（可选）Shizuku 直连`。每一步都能独立 revert。
3. 运行期兜底：新增开关 `rear_engine=legacy|lend`（默认 `legacy`），出问题一键切回旧路径，无需重装旧包。
4. 不触碰的系统面：不改 Media3/音源/歌词/主界面；不新增 Root 模块；不改版本号。

---

## 6. 方案 B：LSPosed 系统背屏容器集成

### 6.1 目标形态

把"背屏上的窗口"从"另一个 Activity"变成"系统背屏容器的内容"，即：

- 在 `system_server` 放行我们的 Activity 到背屏（含锁屏），并抑制 `DualScreenCoverManager` 的 cover view；
- 在 `com.xiaomi.subscreencenter` 进程内，用自绘 View 覆盖官方 MAML 场景（Backmone 方式），或直接替换其内容区；
- 相机仲裁放进 `DisplayContent`（我们 `RearWindowLease` 已经在做），不再需要应用层轮询。

### 6.2 源码依据

| 能力 | 依据 |
|---|---|
| Activity 白名单注入 | REAREye `RearScreenActivityWhitelistModule`（`REAR_SCREEN_METADATA_WHITE_LIST` + `isShouldShowOnRearDisplay` + `isAllowedToStartOnRearDisplay`） |
| 外部显示器启动放行 | REAREye `ExternalDisplayLaunchUnlockModule`（`ActivityTaskSupervisor.isCallerAllowedToLaunchOnDisplay`） |
| 抑制背屏 cover view | REAREye `DisableRearScreenCoverHook`（`DualScreenCoverManager.showCoverView`，display 1） |
| 背屏中心内渲染注入 | Backmone `RearScreenTakeoverModule`（`SubScreenLauncher.onResume` + `dispatchTouchEvent`，单作用域） |
| 相机仲裁已在系统内 | 我们自己的 `lsp/RearWindowLease`（`shouldSleep` 里看 top activity，`cameraOnTopAt` 10s grace） |
| 状态桥 | Backmone `content://dev.backmone.state`（只允许自身 UID + 背屏中心 UID） |

### 6.3 需要替换的现有实现

| 现有 | 处置 |
|---|---|
| `RearLyricsActivity` 作为独立窗口 | **保留**（歌词舞台不能丢），但改为"注入容器内"或"系统放行后直启" |
| `RearCameraMonitor`/任务探测 | 删除，改由 `RearWindowLease` 在 `system_server` 直接告知（新增一个只读回调通道） |
| `ShellUserService` + Shizuku 依赖 | 背屏启动不再需要 shell（系统放行），Shizuku 仅保留给"任务列举/诊断" |
| `RearLspPowerControl` 60s lease | 取消：由白名单放行 + `shouldSleep` 持有，不再需要"伪装 bright policy" |
| `RearDirectPower`（`requestDisplayPower` 回放） | 取消：这是 lease 的补丁，白名单生效后不需要 |
| Xposed 作用域 | 从 `system` 扩到 `system` + `com.xiaomi.subscreencenter` |

### 6.4 HyperOS 4 兼容风险（B）

| 风险 | 说明 |
|---|---|
| 私有类/方法名变化 | `ActivityStarterImpl`、`REAR_SCREEN_METADATA_WHITE_LIST`、`DualScreenCoverManager` 全部是 HyperOS 私有；REAREye 用 KavaRef + DexKit **动态解析**正是为此，代价是每次升级都要跟版本 |
| 白名单语义变化 | 注入的是静态集合，可能被系统在别处重新填充/清空；顺序敏感（REAREye 在 before 里 clear + add） |
| 系统级故障面 | 注入 `system_server` 出错 → 开机异常、背屏整体不可用；`DualScreenCoverManager` 属于电源/休眠路径，抑制错误可能导致合盖不休眠 |
| 背屏中心版本耦合 | Backmone 明确标注只验证过 `RELEASE-1.0.2605272226`（HyperOS 3），HyperOS 4 需重新验证 launcher 与生命周期 |
| 用户环境成本 | 需要 LSPosed 已装且作用域含系统框架；我们现有用户里并非全部满足 |
| 审核/分发 | 系统框架 hook 的发布风险高于普通应用 |

### 6.5 回滚方法

- 关掉模块作用域或停用模块 → 所有 hook 不加载，系统行为回原状（因为**不写系统 APK、不落盘白名单**，这一点 Backmone 与 REAREye 都已验证）。
- 代码层：B 的实现放在独立 `lsp/` 包内，删除即回退；应用层保留 A 的 `RearOccupancy` 作为降级路径。
- 风险兜底：`DualScreenCoverManager` 抑制必须单独开关并默认关闭（先验证合盖休眠正常）。

---

## 7. A / B 对比与推荐

| 维度 | A：独立 Activity + Shizuku | B：LSPosed 容器集成 |
|---|---|---|
| 源码成熟度 | Mi Back Screen（MIT，1295 行 keeper 已处理让屏/恢复/节流）；folia-android 同源验证 move-stack | REAREye（GPL，强但依赖动态解析）；Backmone（BSD，仅 HyperOS 3 验证） |
| 对相机冲突的解决力 | 中：靠任务列表识别 + 让屏不毁窗；系统相机启动瞬间仍可能短暂重叠 | 高：相机 top activity 在 `system_server` 直接可见，可即时让出且不轮询 |
| 闪烁治理 | 高（消除销毁重建、单 settle、统一唤醒） | 最高（无独立窗口切换、无 cover view） |
| HyperOS 4 风险 | 中（`am start --display` 可能被拒、任务列表格式） | **高**（私有符号 + 系统进程 + 背屏中心版本） |
| 故障影响面 | 仅听屿自己的背屏窗口 | 背屏整体 / 系统休眠 |
| 用户前置条件 | Shizuku（现有用户已具备） | LSPosed + 系统框架作用域 |
| 实现成本 | 低-中（纯逻辑替换 + 执行器收敛） | 高（新 hook + 版本适配 + 状态桥） |
| 回滚成本 | 切分支 / 一个开关 | 停用模块（干净），但代码维护成本长期存在 |
| 与"用户主动关闭不唤醒"原则 | 可实现（dismissed 落盘） | 更容易（容器不启动就没有窗口） |
| 与现有歌词舞台/逐字/布局 | 完全保留 | 需把 WebView 塞进他人容器，风险高 |

**推荐：先 A，后 B 仅在 A 被证否时。**

A 的准入门槛（真机证据，任一不满足则升级评估 B）：

1. 连续 10 次"打开相机 → 退出"，每次都能在 ≤5s 内回到歌词，且**不出现整窗重建**（日志中 `launch-route=reuse` 占比 ≥90%）；
2. 相机占用期间 `am start --display` 被拒不影响恢复（占位迁屏路径可用）；
3. 锁屏 + 自动切歌 30 分钟，歌词与时间轴持续更新，面板不熄灭；
4. 用户关闭后 30 分钟内无任何 `am start`/`wake`；
5. 全程无 `release-give-up`、无 `camera-stuck` 持续增长。

---

## 8. 隔离分支当前实现状态

分支：`rear-plan-a`（从 `native-bg-playback` 切出，**不合并 main**）。

本轮只落地"纯逻辑核心 + 单测"，**不改动现有运行时行为**（不接线、不动 `RearLyricsCoordinator`），原因：没有真机就无法验证接线后的相机时序，按"不要堆叠补丁"的要求，接线必须与真机证据同批提交。

新增（纯 Java，无 Android API）：

- `android/app/src/main/java/io/github/huleixin/tingyu/RearLend.java`：一次外部占用（reason / packageName / taskId / 单调 id），id 是唯一可被回调引用的凭证。
- `android/app/src/main/java/io/github/huleixin/tingyu/RearOccupancy.java`：owner 状态机 + Action（`YIELD` / `RESTORE` / `WAKE`），内含
  - 单一证据源（后屏前台任务），`readable=false` 时**不改任何状态**；
  - 连续 2 次可读未命中才结束占用；
  - 让屏幂等（同一 episode 只 YIELD 一次）；
  - 每次占用只允许一次 RESTORE，generation 守卫丢弃陈旧回调；
  - `dismissed` 后永不 RESTORE / WAKE（`setDismissed` 同时使在途恢复失效）；
  - 唤醒节流 10s、面亮不唤醒、无我方窗口不唤醒（首次唤醒不被 `elapsedRealtime=0` 误节流）；
  - 恢复失败按 1.2s/3s/6s/12s→20s 退避，不成环。

对应单测：`android/app/src/test/java/io/github/huleixin/tingyu/RearOccupancyTest.java`（12 项）。

**实测结果**（JVM，JDK 21，`--offline`）：

```
RearOccupancyTest           tests=12 failures=0 errors=0
背屏相关全部（Rear* + lsp.*） tests=117 failures=0 errors=0
```

用例直接对应验收场景：

| 用例 | 对应真机场景 |
|---|---|
| `tenCameraEpisodesYieldOnceAndRestoreOnceEach` | 相机反复开关 10 次：10 次让屏、10 次恢复，无重复 |
| `aLensSwitchThatFlashesTheCameraBackDoesNotYieldTwice` | 镜头切换造成的 1 次抖动不触发第二轮让屏/恢复 |
| `anUnreadableTaskListNeverEndsTheCameraHold` | `am stack list` 读不到时不得判为"相机走了" |
| `aStaleRestoreResultCannotResurrectAWindowDuringANewCameraEpisode` | 恢复回调晚到，不能把窗口重建到新一轮相机之上 |
| `theUserDismissalIsNeverUndoneByACameraOrABackgroundTrackChange` | 用户关闭后，相机/切歌/面板熄灭都不再唤醒 |
| `wakesAreThrottledAndNeverSentAtALitPanel` | 唤醒节流 10s、面亮不唤醒 |
| `playbackStoppingWhileACameraIsUpDoesNotClaimTheCameraLeft` | 相机期间暂停播放不改变占用判定 |
| `aFailedRestoreBacksOffInsteadOfLaunchingInALoop` | 恢复失败退避，不形成启动环 |

**本轮不产出 APK**：分支只新增未接线的纯逻辑类，运行时行为与 `native-bg-playback` 完全一致，打包没有验证价值；接线提交才需要出候选包。

---

## 9. 接线清单（下一提交，需真机同批验证）

| # | 文件 | 改动 |
|---|---|---|
| 1 | `RearLyricsCoordinator.java` | 用 `RearOccupancy` 替换 `RearHandoffState` + `RearOwnershipState` 的判定；`cameraChanged()` 只更新"任务观测"，不再直接决定 RELEASE |
| 2 | 同上 `startCameraRelease()` | 改为 `YIELD`：`yieldToCamera()` + 释放 lease + 恢复电源；删除 `closeWindow(CAMERA)` |
| 3 | 同上 `startCameraRestore()` | 只在 `RearOccupancy` 给出 RESTORE 时执行；先 `resumeFromCamera()`，失败才 `am start` |
| 4 | 同上 `checkWindow()` | 删除"被覆盖即 nudge"的无条件路径；`inspectFront` 仅在 TINGYU 持有时执行 |
| 5 | `RearLyricsLauncher` | `close(quiet)` 拆成 `hide()` 与 `finish()`；新增"官方 launcher 在下面时重启一次官方应用" |
| 6 | `RearCameraMonitor` | 保留为诊断（cameraIdleFor / status），从所有权判定中移除 |
| 7 | `RearLspPowerControl` | 仅在 LSP 后端调用；Shizuku 后端不进入 lease 逻辑 |
| 8 | 新增 `rear_engine` 开关 | 默认 `legacy`，便于 A/B 现场对比与一键回滚 |

---

## 10. 真机验证计划（未执行）

| 场景 | 步骤 | 判据 | 日志 |
|---|---|---|---|
| 相机反复开关 | 锁屏播放 → 背屏相机开/关 ×10 | 每次 ≤5s 回歌词；`launch-route` 以 `reuse-unlocked` 为主；无 `camera-restore-failed` | `rear-trace`（`camera-takeover` / `camera-restore` / `launch-route`） |
| 锁屏 | 播放 + 锁屏 30min，自动切 3 首 | 歌词/封面/时间轴持续；无 `rear-sleep-defeated`；`power-event` 后 ≤2s 恢复 | `rear-trace`, `rear-power-changed` |
| 自动切歌 | 后台连续切到第 5、10 首 | 不错歌不错词（见 C3 报告的双层判据） | `songinfo-*` / `lyrics-*` |
| 用户手动关闭 | 关闭开关后锁屏 30min、切歌 5 次 | 零 `am start`、零 `wake`、零 `rear-display-added` 反应 | `rear-trace` |
| 官方中心争抢 | 背屏 dim 后唤醒 ×10 | 歌词页不黑屏、无 `covered` 抖动风暴 | `rear-front`, `ownership` |

**明确未验证**：以上全部；HyperOS 4 上 `am start --display` 是否被拒；`am stack list` 在 HyperOS 4 的格式；`DualScreenCoverManager` 是否参与闪烁；系统端是否真正渲染（不可观测，只能据 `dumpsys display`/`media_session` 间接判断）。

---

## 11. 不做清单

- 不复制 REAREye（GPL）与 folia-android（AGPL）代码；本文只借用结构结论，新增复用需先补 `THIRD-PARTY-NOTICES.md`。
- 不改 Media3、音源、歌词获取、主界面、播放服务。
- 不新增 Root 模块；不改版本号；不合并 main。
- 不以"加大缓存/扩大预取/增加重试"替代所有权模型的重构。
- 不在 A 未验证前引入 B 的任何 hook。
