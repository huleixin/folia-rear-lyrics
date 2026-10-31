# 听屿 Android 1.3.62：Shizuku 锁屏背屏「被系统背屏桌面覆盖」的恢复修复

基线 1.3.61（versionCode 84）。本轮 versionCode 85。
证据来源：`folia-diagnostics-20261031-171530.txt`（真机 1.3.61，Android 17 / HyperOS，Shizuku 后端）。

> 这份报告只描述「已经改掉的代码」，以及「改完之后下一次真机运行会产生什么可判读的证据」。
> 当前环境没有连接真机，**本轮没有任何一项被真机证明已修复**，第 6 节逐条列出待验证项。

---

## 1. 诊断文件里的事实（逐行引用）

```
Window: display=1, task=56938, visible=false, rendered=true, safe viewport=904x572
Current rear power: 2                     ← Display.STATE_ON
last wake: Restore rear power display=1 doze-suspend->on lit=true exit=0
frontTask=rear=4 com.xiaomi.subscreencenter/.SubScreenLauncher
launcher: 背屏启动失败：原背屏歌词窗口未能恢复到前台，已保留原窗口与播放状态   （出现 5 次）
takeover-exhausted ... attempts=3/12, consecutiveFailures=3/3, exhausted=true
```

四条结论，全部可以从这七行直接推出：

1. **窗口没被销毁。** `rendered=true` 说明它画过帧；`visible` 只在
   `RearLyricsActivity.onStart/onStop`（`RearLyricsActivity.java:177/181`）里翻转，
   所以 `visible=false` 的含义是「Activity 被 `onStop`」，不是「窗口不存在」。
   把它当销毁 → 会去重建 Activity/WebView，方向正好相反。
2. **不是电源问题。** 面板 `STATE_ON`，唤醒 `lit=true exit=0`，而且
   `relights=4 recovered=4 failed=0`。`KEYCODE_WAKEUP` 一直是成功的。
3. **不是相机问题。** `cameraEpisode=0`、`deviceBusy=false`、`owned=owner=SYSTEM`。
4. **是任务栈问题。** 背屏前台是 `task=4 SubScreenLauncher`（背屏桌面的 root 任务），
   我们的 `task=56938` 仍然存在、仍然 attached、只是退到了后面。

## 2. 为什么 1.3.61 修不好（四个代码缺陷，全部已在代码里确认）

### 2.1 `reuse` 分支是一条死路（`RearLyricsLauncher.java:102`）

```java
if (!shown) {
    if (reuse) throw new IllegalStateException("原背屏歌词窗口未能恢复到前台，已保留原窗口与播放状态");
    ... 后面还有「主屏建任务 → move-stack → 再唤醒」的完整迁移路径，但永远不会执行
}
```

窗口存在 → `reuse=true` → 抛异常。异常被 `catch` 转成 `callback.failure`，上层
`finishFailure` 记一次失败、退避、再来一遍。**唯一的替代路径（任务迁移）被自己的异常挡住了。**

### 2.2 `am start` 是唯一被尝试的机制

`launch()` 在 `reuse` 时直接走 `TRANSACTION_START`（`am start --display 1 …`），
而它在真机上 exit=0、任务却从未回到前台。`am start` 被 `ActivityStarter` 静默取消时
**不打印任何错误**，所以代码只能等满 8 秒超时，然后再发同一条命令。

### 2.3 心跳本身在重复失败操作

`checkWindow()`（每 2 秒）看到 `visible=false` 就调用 `begin()`，`begin()` 只会执行
`am start`。也就是说「重复同一种失败操作」不是重试策略，而是心跳 —— 三次之后
`consecutiveFailures=3/3`、`exhausted=true`，整场锁屏结束。

### 2.4 唤醒与启动的顺序是反的

旧顺序：`am start` → `WAKE`。锁屏时背屏处于 `DOZE / DOZE_SUSPEND`
（诊断里 `rearPower` 在 2↔4 之间反复），ATMS 对睡眠显示上的启动请求会静默丢弃；
等面板被点亮时，请求已经过去了。

## 3. 本轮的修改

### 3.1 新增 `RearCoveredRecovery`（纯逻辑，可 JVM 断言）

把「被系统背屏桌面覆盖」从「重建」里彻底分出来，按**机制**而不是次数记账：

| 机制 | 动作 | 副作用 |
| --- | --- | --- |
| `IN_APP_MOVE_TO_FRONT` | 进程内 `ActivityManager.moveTaskToFront(taskId, 0)` | 无（不重建、不点亮、不重启 WebView） |
| `SHELL_REFRONT` | Shizuku：读 root task/display → `am display move-stack`（仅跨屏时）→ `am stack move-task … true` → `am start` → 回读真实前台 | 一次 IPC，三条命令 |
| `RELAUNCH` | 旧的 `begin()`（`am start`），**只在上面两条之后试一次** | 同 1.3.61 |
| `REBUILD` | 只有 `attached==null`（窗口真的没了）才允许，走既有安全重建 | 重建 WebView |

规则（全部有单测）：
- 每个机制一个锁屏周期内**最多一次**，同一机制不会被下发第二次；
- 相邻两次尝试至少间隔 5 秒（`MIN_GAP_MS`），总量上限 3（三个机制各一次）；
- **`FRONTED_BUT_HIDDEN`（前台已经是我们、窗口仍没 `onStart`）立即停手** ——
  这说明挡住内容的是显示层而不是任务栈，换命令没有意义；
- `REFUSED`（系统/权限拒绝）也立即停手，并保留原始异常文本；
- 成功判据只有一个：`isShowingOnDisplay(rear)` 为真（`visible && drawn && 宽高>0`），
  不是命令退出码，不是 `STATE_ON`。

### 3.2 新增 `RearTaskRefront`

`ActivityManager.moveTaskToFront(taskId, 0)`，需要 `android.permission.REORDER_TASKS`
（normal 级，安装即授予，本轮已加进清单）。它与 `am start` 走的是**不同的 ATMS 入口**：
后者是 `ActivityStarter.executeRequest`（会被「睡眠显示 / 后台启动」判定取消），
前者是 `ActivityTaskManagerService.moveTaskToFront → RootTask.moveToFront`，不经过那段判定。
异常不吞：`SecurityException` / `IllegalStateException` 原样作为结论返回。

### 3.3 `ShellUserService` 新增 `TRANSACTION_REFRONT`（VERSION 253 → 254）

一次 IPC 内完成，并把每一步的 `exit` 与输出带回：

```
listing[before]=exit=0 ok
before=root=1, display=1, task=56938, component=io.github.huleixin.tingyu/.RearLyricsActivity
step[move-task]=exit=0 ok out=…            ← 只在本 ROM 支持时才有 ok
step[start]=exit=0 ok out=Starting: Intent { … }
listing[after]=exit=0 ok
front=56938 io.github.huleixin.tingyu/.RearLyricsActivity
after=root=1, display=1, task=56938
```

- `am display move-stack <rootTask> <display>` **只在任务确实不在目标 display 时**使用，
  语义是「把整个 root task 搬到该 display」，**不当作置顶命令**；
- 置顶用 `am stack move-task <task> <root> true`（栈内重新排序），
  与「搬屏幕」是两件事，各自单独记录结果；
- 最后**回读真实前台**，所以成功由系统自己的回答判定；
- 每条命令的 `exit` + 第一行输出都保留：ROM 没有这个命令时会显示
  `rejected out=Error: Unknown command …`，不会再被当成成功。

### 3.4 修掉 `reuse` 死路与心跳重试

- `RearLyricsLauncher`：`reuse && !shown` 不再抛异常，改为
  `callback.covered(...)`，把控制权交给 `RearCoveredRecovery`；**不 `finishIfShown()`**，
  窗口、WebView、会话 token 全部保留。
- `RearLyricsCoordinator.checkWindow()`：新增
  `coveredNow = 窗口仍 attached && 不可见 && 背屏前台是背屏中心`，
  成立时**禁止** `begin()`。心跳不再能绕过去重去重复 `am start`。
- `exhausted` 不再被「同一条命令的三次失败」烧光：置顶失败不消耗
  `RearTakeoverPolicy` 的重建额度，重建额度只留给「窗口真的消失」。
- 解锁后仍然处理：真机里解锁 60 秒后背屏前台依旧是 `SubScreenLauncher`
  （`unlock+0s` 快照），所以 `RearCoveredRecovery` 不限定锁屏态；
  周期边界（解锁时 `reset()`）由协调器负责。

### 3.5 唤醒 → 启动的顺序

`launch()` 里改为：面板不是 `STATE_ON` 时先 `RESET_POWER` + `WAKE`，
用 `getState()` 等到真的 `ON`（最多 1.2 秒），**再**发启动请求。
唤醒次数没有增加（仍是每个恢复周期一次 `WAKE`），只是把它挪到了请求之前。

## 4. 明确没有做的事

- 没有增加任何新的轮询、唤醒重试或无限抢占：`MIN_GAP_MS=5s`、每机制 1 次、总数 3；
- 没有点亮/解锁主屏：三条机制都不触碰 `Display 0` 的电源，`TRANSACTION_REFRONT` 明确
  拒绝 `displayId==0`；`RearPanelRelightGuard` 的 `SKIP_MAIN_ON` / 归因逻辑未改；
- 没有动相机优先：`recoverCovered` 在 `cameraOwned()` 时直接返回，重建/唤醒仍走原有 gate；
- 没有改 Media3、Compose、歌词舞台、逐字歌词、灵动岛发布链路；
- 没有写 `subscreen_display_time`（仍然只读），没有关闭系统「背屏息屏」。

## 5. 自动化验证

`./gradlew :app:testDebugUnitTest`：**710 项、0 失败、0 错误**（104 个测试类）。
本轮新增 `RearCoveredRecoveryTest` 13 项（697 → 710），既有套件全部保留
（`RearDisplayLeaseTest` 21、`RearPanelLeaseTest` 15 均未改动）。

新增断言逐条对应需求：

| 需求 | 断言 |
| --- | --- |
| `visible=false` 不得判成销毁 | `aCoveredButAliveWindowIsNeverTreatedAsDestroyed`（alive=true 时决策必须是 ATTEMPT，绝不是 REBUILD） |
| 只有真销毁才重建 | `aTrulyDestroyedWindowIsTheOnlyReasonToRebuild` |
| 已存在任务优先、不重建 | `eachMechanismIsTriedExactlyOnceInOrder`（第一顺位是 `IN_APP_MOVE_TO_FRONT`） |
| 不重复完全相同的操作 | `theSameMechanismIsNeverOfferedTwice`（三个机制各一次后必须 `blocked`） |
| 系统拒绝就停手 | `aRefusalFromTheSystemStopsTheFight` |
| 前台是我们却不可见 → 停手 | `frontIsOursButTheWindowIsHiddenStopsImmediately`（且不浪费剩下两个机制） |
| 不高频抢占 | `theCooldownPreventsBackToBackPreemption` |
| 相机优先 | `aCameraAlwaysWinsAndUnlockIsHandledToo` |
| 解锁态也要恢复 | 同上（解锁 + 系统桌面仍在前 → ATTEMPT） |
| 结论只上报一次 | `theVerdictIsReportedOnlyOnce` |

## 6. 必须真机验证（本轮**没有**验证，不得视为已修复）

1. `ActivityManager.moveTaskToFront` 在 HyperOS 锁屏时是否被接受 ——
   若被拒，`covered-outcome… REFUSED(SecurityException: …)` 会带着原文出现；
2. `am stack move-task <task> <root> true` 在 Android 17 上是否存在 ——
   `step[move-task]=rejected out=Error: Unknown command …` 就是「不存在」的证据；
3. `am display move-stack` 在本固件的语义是否仍是「root task → display」；
4. 置顶之后窗口是否真的 `onStart`（`covered-outcome … RECOVERED`）——
   若出现 `FRONTED_BUT_HIDDEN`，结论是**系统把内容层挡住了**，
   Shizuku 侧到此为止，只能靠 LSP 侧拦截 `startDream`；
5. 被系统立刻重新抢占的间隔（若 `RECOVERED` 之后 1~2 秒又回到
   `SubScreenLauncher`，`covered-recover` 会再出现一次，但同一机制不会重复）。

## 7. 下一次真机运行怎么判读（三条命令就够）

1. 保持「背屏息屏」开启，播放 → 锁屏 → 等 60 秒 → 解锁；
2. 设置 → 帮助 → 背屏故障诊断 → 导出；
3. 在 `rear-fault` 记录里找 `covered-*`：
   - `covered-detected` → `covered-recover IN_APP_MOVE_TO_FRONT` → `covered-outcome … RECOVERED`
     ⇒ **修复生效**；
   - `covered-outcome … NOT_FRONTED / REFUSED(…)` ⇒ 换机制失败，看 `step[…]` 的原始输出；
   - `covered-outcome … FRONTED_BUT_HIDDEN` ⇒ 置顶成功但显示层挡住，
     这是 Shizuku 权限的边界，需要 LSP；
   - `covered-blocked … all-mechanisms-refused` ⇒ 三条路都被系统拒绝，**停止抢占**（符合设计）。
