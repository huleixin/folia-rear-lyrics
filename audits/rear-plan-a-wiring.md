# 方案 A 最小接线：把背屏控制权收敛到一个控制器

分支 `rear-plan-a`（未合并 main）。版本号、签名、`versionCode` 均未改动（1.3.50 / 74）。
本轮只做方案 A 的接线与隔离验证，不进入方案 B，不改 Media3 / 音源 / 歌词获取 / 锁屏时间 / 歌词舞台 / 背屏布局。

---

## 1. 一句话结论

上一轮新增的 `RearOccupancy` 是"纯逻辑、未接线"，运行时行为没变；本轮把它接进
`RearLyricsCoordinator`，并让**相机让屏不再销毁窗口**——这就是背屏闪烁的直接来源。

| 之前 | 现在（方案 A） |
|---|---|
| 相机到来 → `startCameraRelease` → `closeWindow(CAMERA)` → `finishIfShown()` | 相机到来 → `planYield` → 只 `yieldToCamera()`（隐藏视图 + `moveTaskToBack`），窗口与 WebView 保留 |
| 相机退出 → 新 session → 新建 Activity + 新建 WebView | 相机退出 → `planRestore` → `resumeFromCamera()` + 复用同一任务；只有复用被系统拒绝时才允许重建一次 |
| 3 路相机信号（camera2 / `am stack list` / 主屏 camera 任务）× 两套状态机 | 1 个 witness（后屏前台任务）+ 1 台状态机（`RearOccupancy`）+ 1 个命令闸门（`RearCommandGate`） |
| 唤醒/关闭/恢复从 6 处 call site 发出 | 全部经 `RearCommandGate.submit()`，同一时刻只有一个引擎持有通道 |

---

## 2. 修改文件

### 新增

| 文件 | 作用 |
|---|---|
| `RearPlanA.java` | 引擎开关（`rear_engine` 偏好，默认 `plan-a`）+ **跨组件持久化的"用户主动关闭"标记**（`user_dismissed`） |
| `RearCommandGate.java` | 唯一的命令出口。`install(Source)` 决定当前谁有权发 YIELD/RESTORE/WAKE/CLOSE；另一引擎的 `submit` 一律拒绝并计数 |
| `RearWindowPolicy.java` | 两条窗口规则：`mayFinishForCamera(planA)`（方案 A 下恒 false）、`mayReuseWindow(attached, locked, lsp, preserved, planA)`（锁屏也优先复用） |
| `RearCommandGateTest.java` | 4 项：单引擎发令、回滚即时生效、默认旧引擎、重装幂等 |
| `RearWindowPolicyTest.java` | 5 项：相机不得销毁窗口、锁屏复用、无窗口不可复用、旧引擎仍拒复用、相机心跳 |

### 修改

| 文件 | 改动 |
|---|---|
| `RearOccupancy.java` | `Look` 增加 `deviceBusy` / `unreadableFor`；新增 `unreadable()` 分支（不可读永不改变归属，两条例外均单向）；新增 `EVIDENCE_ESCAPE_MS=12s`；新增 **restore 单飞**（`restoreInFlight` + `inFlightGeneration`） |
| `RearLyricsCoordinator.java` | `evaluateRear` 分派；新增 `evaluatePlanA / planYield / planRestore / finishPlanARestore / planWake / dismiss / engineChanged`；`cameraOwned()` 统一归属判断；`inspectFront` 在方案 A 下重试让屏而非直接 `finishIfShown`；`launch/finishFailure/finishCancelled` 走 generation 校验；诊断新增 engine/gate/occupancy 段 |
| `RearLyricsLauncher.java` | `reuse` 条件改由 `RearWindowPolicy.mayReuseWindow(...)` 决定，方案 A 下锁屏也优先复用已有任务 |
| `FoliaNativePlugin.java` | 新增 `setRearControlEngine`；`getRearLyricsStatus` 增加 `controlEngine` |
| `RearBridgeSettings.tsx` / `rearLyricsControl.ts` / `rearLyricsSettingsModel.ts` / i18n ×2 | 背屏设置里新增"背屏控制引擎"下拉（单控制器 / 旧引擎），一键回滚 |

---

## 3. 旧代码中哪些路径已被替代

| 旧路径 | 位置 | 方案 A 下 |
|---|---|---|
| `startCameraRelease()` 整段 | 协调器 | 不再调用（仅旧引擎分支可达）。它末尾的 `closeWindow(CloseReason.CAMERA)` 就是"让屏=销毁" |
| `startCameraRestore()` | 协调器 | 同上，由 `planRestore` 取代 |
| `RearHandoffState.evaluate()` | 协调器 `evaluateRear` | 方案 A 下整段跳过，`rear` 对象不再被求值 |
| `RearCameraPolicy.blocked()` 作为归属证据 | 协调器 `observation.deviceBusy` | 降级为"仅当任务列表完全读不到时的单向让屏证据"，不再参与退出判定 |
| 主屏 `mainCameraTask` 参与归属 | `observation` | 方案 A 不再作为独立信号（任务列表里的后屏前台任务已足够；主屏 camera 只在旧引擎使用） |
| `closeWindow(CAMERA)` | 协调器 | 方案 A 下不存在相机路径的调用；`finishClosing` 里 `releaseFinished` 也加了 `!planA()` 守卫 |
| `inspectFront` 的 `camera-yield-hard-release` → `finishIfShown()` | 协调器 | 改为最多 3 次重试 `yieldToCamera()`，仅第 4 次仍被系统拒绝才 finish（并单独记 `camera-yield-fallback`） |
| `RearLyricsLauncher.start` 的 `locked → 拒绝复用` | 启动器 | 改为 `mayReuseWindow`，方案 A 锁屏也复用；复用失败才 `reuse-fallback` 重建一次 |

保留但不再双跑：`RearHandoffState`、`RearOwnershipState`、`RearCameraPolicy`、`RearCameraMonitor`。
前三个仅旧引擎使用；`RearCameraMonitor` 仍常驻（诊断需要 `idleFor/status`），但它的回调在方案 A 下只做 `nudge()`——提前去看一眼任务列表，不改变归属。

---

## 4. 新旧路径如何隔离（四道闸）

1. **命令闸门**：`RearCommandGate` 同时只认一个 `Source`。`install()` 在启动、切引擎时调用。旧引擎的 `startCameraRelease/Restore` 在方案 A 下根本不会被调用；即使将来误调，`submit` 也会拒绝。
2. **单 owner**：`cameraOwned()` 只问当前引擎。旧引擎在方案 A 下停在 `SYSTEM_OWNED`，因此"旧状态说没相机、新状态说有相机"这种自相矛盾不可能被读到。
3. **单恢复单飞**：`RearOccupancy.restoreInFlight` + `inFlightGeneration`。启动器最长要等两个 8s 超时，心跳 700ms 一次；没有这道单飞，每次心跳都会再排一次重建——这正是旧引擎"恢复两次"的成因（本轮新加的测试在未加单飞时实测 FAILED）。
4. **关闭持久化**：`user_dismissed` 写进 `rear_lyrics` 偏好。协调器、背屏 Activity、播放服务是三个独立生命周期，进程被杀后重建时都从偏好恢复"用户已关闭"，任何相机结束或后台恢复都不会唤醒。只有用户点"开启背屏歌词"（`enable()`）才清除。

**电源没有新 Hook。** 让屏时不再新增机制：`syncLspPower()` 的 `desired` 已经是 `!cameraOwned() && ...`，相机一持有背屏它就自动释放既有租约；`changeSleep()` 也已有 `cameraOwned()` 早退。既有 LSP / Shizuku 两条电源路径仍在，只是被同一份归属判断调度。

---

## 5. 测试结果

### Android（JVM，`--offline`，JDK 21）

背屏相关 **100 项全绿**：

| 测试类 | 项数 |
|---|---|
| `RearOccupancyTest` | 18（本轮 +6） |
| `RearHandoffStateTest` | 14 |
| `RearLyricsTaskListTest` | 11 |
| `RearLyricsPolicyTest` | 10 |
| `RearCameraPolicyTest` | 9 |
| `RearOwnershipStateTest` | 9 |
| `RearLyricsCommandResultTest` | 7 |
| `RearPlaybackHandoffTest` | 5 |
| `RearWindowPolicyTest` | 5（新） |
| `RearCommandGateTest` | 4（新） |
| `RearCoverPolicyTest` / `RearLyricsViewportGeometryTest` | 4 / 4 |

`./gradlew :app:testDebugUnitTest`（全量）通过。

### 用户点名的 8 个集成场景 → 对应测试

| 要求 | 测试 | 断言要点 |
|---|---|---|
| 相机到来时旧窗口没有被错误销毁 | `RearWindowPolicyTest.aCameraArrivalNeverFinishesTheWindowInPlanA` + `RearOccupancyTest.tenCameraEpisodesYieldOnceAndRestoreOnceEach` | 方案 A 下 `mayFinishForCamera(true)==false`；10 次进出恰好 10 次 yield、10 次 restore，多余观测不再产生动作 |
| 连续相机进出只有一个有效恢复任务 | `RearOccupancyTest.onlyOneRestoreIsIssuedPerCameraEpisode` | 发出 RESTORE 后 8 次 700ms 心跳全部 NONE，`restores()==1` |
| 陈旧 generation 的回调无法唤醒背屏 | `aStaleRestoreResultCannotResurrectAWindowDuringANewCameraEpisode` | 旧 attempt 的 `restoreFinished(true)` 返回 false，归属仍是 EXTERNAL |
| 系统相机拥有优先显示和触控权 | `theCameraKeepsThePanelIncludingItsPower` | 相机持有期间即使面灭也只有 NONE，无 WAKE |
| 任务列表不可读时不误判相机退出 | `anUnreadableTaskListNeverEndsTheCameraHold` + `anUnreadableListNeverHandsThePanelBackToALiveCamera` | 6 次不可读、60s 不可读都不 restore |
| 用户主动关闭后不再有后台唤醒 | `theUserDismissalIsNeverUndoneByACameraOrABackgroundTrackChange` | 相机来/走、灭屏、切歌全部 NONE，`restores()==0` |
| 快速切歌不触发窗口重建 | `aFastTrackChangeNeverRebuildsTheWindow` | 12 次普通观测：`episodes()==0`、`restores()==0`、归属保持 TINGYU |
| 新旧控制器不会同时发命令 | `RearCommandGateTest.onlyTheInstalledEngineMayIssueACommand` / `aRollbackStopsTheNewEngineInTheSameInstant` | 非持有方 `submit` 恒 false 并计数；回滚后同一次调用即拒绝新引擎 |

### 前端

- `vitest`：`services/rearLyricsControl.test.ts`、`settings/*`、`i18n/*` 共 218 项，**1 项失败**：`settingsAnchorCoverage.test.ts`（`<section` 缺少锚点，指向图形调试面板，与本轮无关，属既有失败）。
- `tsc --noEmit` 通过。
- 新增前端用例 2 项：引擎开关只在关闭态可切、会话中拒绝切换。

---

## 6. 真机操作说明（小米 17 Pro / HyperOS 4）

### 安装与基本确认

```
adb install -r Tingyu-Android-v1.3.50-rear-plan-a.apk
```
设置 → 小米背屏歌词 → 「背屏控制引擎」应显示 **单控制器（测试中）**（默认值），「背屏控制模式」保持你原来选的那一项；开启背屏歌词，确认能正常显示。

### 主场景：反复开关相机 10 次

1. 播放音乐，背屏显示歌词舞台。
2. 主屏打开系统相机 → 切到后置预览（会占用背屏）→ 退出相机。
3. 重复 10 次，每次记录：
   - 背屏歌词是否**立即回来**（旧引擎是"黑一下再重建"）；
   - 是否出现黑屏 / 白屏 / 闪一下；
   - 歌词是否仍是当前歌曲、当前进度（不是从 0 开始、不是上一首）。
4. 判断"是否复用原窗口"（不用看画面，看日志）：

```
adb logcat -s TingyuRear | grep -E "launch-route|camera-yield|reuse-fallback|camera-restore"
```
- `launch-route: reuse-unlocked` —— 走复用（期望绝大多数）；
- `launch-route: direct` —— 新建任务；
- `reuse-fallback` —— 复用被系统拒绝、退回整窗重建。**若 10 次里 `direct`/`reuse-fallback` 超过 1 次，说明 HyperOS 在锁屏/解锁边界仍拒绝复用，需要把日志带回来。**

### 用户主动关闭 → 零唤醒

1. 开启背屏歌词 → 在设置里点关闭。
2. 随后**反复开关相机 3 次**、锁屏再解锁、切歌。
3. 期望：背屏**始终**停在系统默认画面，日志里不再出现 `camera-restore` / `camera-wake`，只有 `camera-dismiss` 之后的空转。
4. 杀掉听屿进程后重复一次：仍然不得唤醒（`user_dismissed` 已持久化）。

### 锁屏连续播放

锁屏播放 ≥30 分钟、跨 3 首以上，期间开关相机 2 次。期望：歌词随歌曲更新、进度正确、不中断、锁屏时间正常（C1 行为不变）。

### 诊断导出

设置 → 背屏诊断 → 导出。本轮新增字段：
```
engine=plan-a, commands=N, refused=M, last=yield@PLAN_A
occupied=owner=EXTERNAL, lend=CAMERA(com.android.camera, task=41, id=3), episodes=1, yields=1, restores=0,
         dismissed=false, returnLooks=0, pendingRestore=true, restoreInFlight=false, generation=5
planRestoring=false, reuseBroken=false, hardYieldTries=0, dismissed=false, look={...}
```

### 一键回滚

设置 → 小米背屏歌词 → 「背屏控制引擎」→ **旧引擎（一键回滚）**（需先关闭背屏歌词，与切换 LSP/Shizuku 同一前置条件）。
回滚后 `engine=legacy`，旧 `RearHandoffState` + `RearCameraPolicy` 重新接管，行为与 1.3.50 当前版本一致；同时 `RearCommandGate` 会拒绝方案 A 的任何命令，不存在两套同时控制。

---

## 7. 新增 trace 事件（`RearLyricsTrace`）

| 事件 | 含义 |
|---|---|
| `camera-yield` | 单控制器让出前屏（含 lend id、look、窗口快照） |
| `camera-yield-retry` / `camera-yield-fallback` | `moveTaskToBack` 被拒后的重试 / 第 4 次仍失败才销毁窗口 |
| `camera-restore` | 恢复请求，携带 `attemptGen`（generation 校验用） |
| `camera-restore-stale` | 回调代次已过期，被丢弃（不改变归属） |
| `camera-restore-failed` | 恢复失败，按退避重试 |
| `camera-wake` | 面灭且有我方窗口时的唤醒（10s 节流） |
| `camera-dismiss` | 用户主动关闭，持久化 |
| `reuse-fallback` | 复用失败，退回一次性整窗重建 |
| `engine-changed` | 引擎切换（回滚）发生 |

---

## 8. 未验证与边界（必须如实说明）

1. **真机一条都还没验。** 本机 `adb devices` 为空，无 emulator。上面第 6 节是给你在小米 17 Pro 上跑的脚本，不是已完成的结果。
2. **HyperOS 4 上"锁屏复用已有任务"是否被允许**，是本轮最大的未知。代码里已按"先复用、失败再重建一次"处理，但只有真机能证明 `pm`/`am` 是否会拒绝把一个已存在的任务拉回背屏前台。
3. **`am stack list` 在 HyperOS 4 的格式**：解析器同时支持 `RootTask/Task{...#N}`/`mResumedActivity` 三种形态，读不到时按"不可读"处理（不改变归属）。若 10 次相机测试里出现大量 `look.readable=false`，说明格式又变了，需要补一种形态。
4. **让屏期间窗口留在任务栈里**：理论上"不在前台的窗口收不到触摸事件"，相机可正常显示与触控；但小米的背屏窗口管理是否会在相机运行期间因为存在第二个任务而额外绘制（例如半透明叠加），只能真机确认。
5. **系统端是否真正消费 `lyricInfo`** 不可观测，只能从"背屏上确实出现歌词"反推。
6. `EVIDENCE_ESCAPE_MS=12s` 的取舍：任务列表连续 12s 不可读且相机未占用设备时，才把背屏交回。这条是为了避免"ROM 不给读列表 → 背屏永久黑"。若真机出现"相机还在预览却被抢回"，请把 `camera-evidence-stale` 附近的日志带回来，我会把这条改成需要额外证据（例如后屏 Display 状态）才放行。
