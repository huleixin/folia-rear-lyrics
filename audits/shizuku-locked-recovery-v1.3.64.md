# 听屿 Android 1.3.64：Shizuku 锁屏背屏恢复的判定修复与系统限制结论

基线 1.3.63（versionCode 86）。本轮 versionCode 87。
证据：`folia-diagnostics-20261031-180939.txt`（Shizuku，本轮主证据）。
**本轮没有改动任何 LSP Hook、系统框架注入、AOD 拦截或 LSP 电源租约逻辑**（`git diff` 可核对：
`lsp/` 目录零改动）。

> 结论先说：**Shizuku（shell uid）在主屏锁定、设备处于 sleep 时，无法把第三方背屏 Activity
> 恢复到前台。** 这一轮修的是围绕它的判定与浪费行为，并把「系统拒绝」变成可验证的证据；
> 真机没验证的部分不宣称修复。

---

## 1. 这份日志证明的四个代码问题

### 1.1 解析失败被当成「任务不存在」

```
covered-recover   SHELL_REFRONT ...
rear-refront      exit=0  listing[before]=exit=0 ok
                  before=task-not-listed  front=-1 unknown  note=task-not-found-in-listing
```

`am stack list` 退出码 0，但 1.3.62 内置在 `ShellUserService` 里的那套正则**一行都没匹配上**
（`rows=0`）。代码把「一行都没解析出来」直接写成了 `task-not-found`，
于是恢复路径从「换机制」滑向「任务没了」。这是六种失败类型被压成一种的根源。

### 1.2 第三种「机制」根本不存在

1.3.62 的 `SHELL_REFRONT` 实际动作是「读表 → `am display move-stack`（仅跨屏时）→
`am stack move-task` → `am start`」，而 `RELAUNCH` 本来就是 `am start`。两者是同一件事，
各占一次额度，且都不会置顶任何东西 —— 真机上三次尝试里有两次是同一条命令。

### 1.3 `recovered=true` 与 `visible=false` 同时出现

```
covered-detected ... recovered=true  (attempts=0/3, tried=[])
Window: display=1, task=56964, visible=false, rendered=true
```

`recovered` 只会被置真、永远不会被置假：只要窗口曾经可见过一次（例如锁屏前正常显示），
之后哪怕它被 `onStop`，这个标志仍然为真。诊断因此自相矛盾。

### 1.4 恢复已经失败，却还在反复点亮背屏

```
covered-blocked  不再抢前台：attempt-cap
panel-relight  ×4   state=4 -> 2 (recovered)
relights=4 recovered=4
```

四次点亮，四次「成功」，屏幕上一直是系统背屏桌面。
点亮一块只会显示 SystemUI/背屏桌面的面板，是纯粹的耗电，不是修复。

## 2. 改了什么

### 2.1 新的三态解析：`RearTaskTable`（可 JVM 断言）

| 状态 | 含义 | 下一步 |
| --- | --- | --- |
| `OK` | 表可读，且目标任务在表里 | 比较前台身份 |
| `TASK_ABSENT` | 表可读，但**确实没有**这个任务 | 允许一次安全重建 |
| `UNREADABLE` | 一行都没解析出来（命令不支持 / 输出为空 / 格式不认识） | **停手**，绝不当作「任务没了」 |

解析器接受四种已知形状：`RootTask/Stack/Task id=… displayId=…` 头、
`* Task{hash #id}`、`Task{hash #id displayId=N}`、旧式 `taskId=N: pkg/cls`；
组件可以从 `ActivityRecord{… tN}` 或 `mResumedActivity` 补。7 项单测覆盖。

`TRANSACTION_REFRONT` 被删除，替换成只读的 `TRANSACTION_FRONT_PROBE`：
它不再搬任何任务，只回答「表可读吗 / 任务还在吗 / 背屏前台是谁」。

### 2.2 只剩两条真正不同的机制

| 机制 | 动作 | 副作用 |
| --- | --- | --- |
| `IN_APP_MOVE_TO_FRONT` | `ActivityManager.moveTaskToFront(taskId, 0)` | 无（不重建、不点亮） |
| `RELAUNCH` | `am start --display 1` | 重新投递 Intent |
| `REBUILD` | 仅当 `attached==null`（窗口真没了） | 重建 WebView |

`MAX_ATTEMPTS = 2` 不是「重试两次」，而是「两个不同手段各一次」；同一手段永不下发两次。

### 2.3 六种失败类型分开记

`RECOVERED / NOT_FRONTED / COMMAND_UNSUPPORTED / TASK_NOT_FOUND /
PERMISSION_DENIED / SYSTEM_RETAKEN`。每次结算都做一次显式前台探针：

```
窗口可见            -> RECOVERED          （唯一成功判据）
表不可读            -> COMMAND_UNSUPPORTED
表可读但任务缺失    -> TASK_NOT_FOUND
前台 = 背屏中心     -> SYSTEM_RETAKEN      （让开之后系统又抢回去）
前台 = 我们但窗口停 -> NOT_FRONTED
活动抛 SecurityException -> PERMISSION_DENIED
```

`SYSTEM_RETAKEN` / `COMMAND_UNSUPPORTED` / `PERMISSION_DENIED` 一律停止本周期，
不再换命令硬试。

### 2.4 `recovered` 不再粘住

新增 `beginEpisode()`：每次新的「被覆盖」事件都把上一次的判定清掉，
只有窗口真的可见（`onStart` + 已绘制）才能把它置真。
诊断里不会再出现 `recovered=true` 配 `visible=false`。

### 2.5 不再为一块只会显示系统桌面的面板供电

- 判定为 `blocked` 之后，`syncPanelLease` 直接 `end()` 并返回：不再点亮；
- `finishVerify` 一旦 `blocked`，立即交还租约并写 `covered-give-up`；
- 唤醒次数没有增加（仍然是锁屏期间由 `RearPanelLease` 每 16 秒一次），
  但现在会在「不可能恢复」时**归零**。

### 2.6 模式隔离（只做检查与标注，未改 LSP）

审计结果：所有 LSP **行为**路径都以 `LspRearBridge.selected(context)` 为门（30 处），
Shizuku 模式下模块即使被 LSPosed 加载也只是纯观察。诊断里 `lsp=` 现在明确写成
`not-selected (module profile unused)`，避免把它的 profile 误读成「两种模式共享状态」。

## 3. 系统限制：为什么锁屏期间恢复不了

同一份日志里有三组对照：

| 时刻 | 动作 | 结果 |
| --- | --- | --- |
| 锁屏中 | `moveTaskToFront(56964)` | 调用被接受（`MOVED`），前台不变，窗口 `visible=false` |
| 锁屏中 | `am start --display 1 -n …/.RearLyricsActivity` | `exit=0`，前台不变 |
| 解锁后 | `moveTaskToFront(56964)` | 窗口恢复，**同一个任务**，没有重建 |

同一任务、同一调用，只差设备是否 awake。结合面板状态：

```
Current rear power: 2  (STATE_ON)
directLast=display=1, requested=0, effective=0, result=false
```

面板是亮的、系统请求熄灭还被拒绝了，窗口却仍是 `visible=false` ——
说明挡住恢复的不是电源，而是**显示组的 sleep 状态**：
`DisplayContent.applySleepTokens()` 会让该显示上的任务 `goToSleep`，
`RootWindowContainer` 在设备 asleep 时不会恢复任何任务。

shell uid 能做的到此为止：
- `input -d 1 keyevent KEYCODE_WAKEUP` 只改面板电源，不改 sleep token（日志已证：四次点亮，四次无效）；
- 不带 `-d` 的唤醒会点亮主屏 —— 明令禁止；
- 没有任何 shell 命令能清除某个显示的 sleep token（那是 `KeyguardController` /
  `RootWindowContainer` 的内部状态）。

这也解释了为什么 LSP 模式能工作：模块在 system_server 里挂 `DisplayContent.shouldSleep`，
租约有效时让它返回 false，显示根本不会进入 sleep，Activity 也就不会被 `onStop`。
Shizuku 拿不到这个位置。

**因此：在保持系统「背屏息屏」开启的前提下，锁屏期间显示歌词需要 LSP。**
Shizuku 的正确行为是「尝试一次、失败即停、不耗电」，这一轮已经实现。

## 4. 自动化验证

- `:app:testDebugUnitTest`：**723 项、0 失败、0 错误**（106 个测试类）。
  本轮新增 `RearTaskTableTest` 7 项，`RearCoveredRecoveryTest` 由 13 项改写为 14 项；
- `assembleRelease` 成功，官方密钥签名 `a36ef2a5…`，`versionCode=87 / versionName=1.3.64`；
- `lsp/` 目录零改动（`git diff --stat -- .../lsp` 为空）。

## 5. 必须真机验证（本轮未验证）

1. 新的 `front-probe` 是否给出 `status=OK` 且 `rows>0` —— 若仍是 `UNREADABLE`，
   说明这台固件的 `am stack list` 格式是第五种，需要按 `listing-head=` 的实际内容再放宽；
2. 锁屏期间 `covered-outcome` 是否出现 `SYSTEM_RETAKEN`（预期）而不是 `NOT_FRONTED`；
3. 判死之后 `relights` 是否停止增长（这是本轮唯一可量化的行为改善）；
4. 解锁后是否仍像 1.3.63 一样一次 `IN_APP_MOVE_TO_FRONT` 就恢复；
5. 相机打开时 `covered-recover` 不应出现（相机优先）。

## 6. 没有做的事

- 没有新增唤醒、轮询或重试次数，反而删掉了一个重复机制；
- 没有点亮或改动 Display 0；
- 没有关闭或改写「背屏息屏」设置；
- 没有修改任何 LSP 代码；
- 没有改 Media3、Compose、歌词舞台、逐字歌词、灵动岛发布链路。
