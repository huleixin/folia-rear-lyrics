# 听屿 Android 1.3.65：Shizuku 锁屏显示的 1.3.39 回归定位与迁移路径移植

基线 1.3.64（versionCode 87）。本轮 versionCode 88。
证据：
- `folia-diagnostics-20261031-180939.txt`（Shizuku，1.3.64）
- 1.3.39 真实源码（`tingyu-layout-1.3.39` 的 `RearLyricsLauncher.java` / `ShellUserService.java`）

> **本轮没有修改 `lsp/` 目录的任何一行**（`git status --short -- .../lsp` 为空）。
> 所有新行为都以 `LspRearBridge.selected(context)` 为门，LSP 分支的判定表达式一字未改。

---

## 1. 1.3.39 与 1.3.64 的锁屏路径差异表

| 项 | 1.3.39 | 1.3.64（本轮之前） |
| --- | --- | --- |
| reuse 计算 | `(!locked \|\| lsp \|\| preserve) && attached` | `mayReuseWindow(…)` = `!locked \|\| lsp \|\| preserve \|\| **planA**` |
| Plan A | **不存在**（源码里搜不到 `planA`/`RearPlanA`） | 默认 `plan-a`，即 `planA == true` |
| 锁屏 + Shizuku | `reuse = false` | `reuse = true` |
| 进入哪个分支 | `if (!locked \|\| reuse \|\| lsp)` 为假 → **跳过直接启动** | 条件为真 → `am start --display 1` |
| 失败后 | 落到迁移代码 | `if (reuse) { callback.covered(…); return; }` → **迁移代码不可达** |
| 会话 | `finishIfShown()` + `prepareLaunch()` → **新 session** | `currentSession()` → 沿用旧 session |
| Activity | 先销毁再重建 | 保留原 Activity（`onStop` 状态） |
| 任务对象 | 在 Display 0 **新建**的任务，即它自己的 root task | 被 `SubScreenLauncher` 压在下面的旧任务（task=56964） |
| 命令 | `am start --display 0` → `am display move-stack <task> 1` → `input -d 1 keyevent KEYCODE_WAKEUP` | `am start --display 1` / `ActivityManager.moveTaskToFront` |
| 成功判据 | `awaitWindow(requireRear=true)`：窗口真的在背屏可见且已绘制 | 同一判据，但扫描路径根本没被执行 |
| 相机处理 | 当时尚未解决（用户报告的冲突） | 已有完整的让位/恢复状态机 |

## 2. 造成回归的实际条件（一行代码）

`RearWindowPolicy.mayReuseWindow()`：

```java
if (!attached) return false;
return !locked || lspSelected || preservedSleepSession || planA;   // ← planA 默认 true
```

`RearPlanA` 的默认引擎是 `plan-a`，所以 `planA == true` 恒成立，
`mayReuseWindow` 在锁屏时也返回 `true`。随后：

```java
boolean reuse = …;                       // true
if (!shown) {
    if (reuse) { callback.covered(…); return; }   // ← 迁移路径在这里被截断
    … am start --display 0 → move-stack …        // 永远执行不到
}
```

1.3.39 的真机验证证明「新建任务 + 搬屏」能穿锁屏；1.3.64 的真机日志证明
「让旧任务回前台」不能。**这是两个不同层级的操作**，前者搬的是 root task，
后者只是把一个被压在下面的子任务提为前台 —— 前者失效不能推出后者失效，反之亦然。
之前把两者混为一谈、并据此断言「Shizuku 在锁屏下不可能」，是错的。

真机日志里的直接证据（1.3.64）：

```
launch-route  locked=true  shizuku=true  reuse-locked
covered-recover  IN_APP_MOVE_TO_FRONT → NOT_FRONTED
covered-recover  SHELL_REFRONT       → NOT_FRONTED
covered-recover  RELAUNCH            → NOT_FRONTED
covered-blocked  attempt-cap
```

`reuse-locked` 这个标签本身就说明：锁屏时进的是复用分支，迁移代码一次都没跑过。

## 3. 移植进来的东西（只复用机制，不回退旧版）

### 3.1 `RearLaunchRoute`（新增，纯逻辑）

锁屏路线判定，把「看得见就复用 / 看不见就迁移」写成可断言的函数：

| 状态 | 路线 |
| --- | --- |
| 未锁屏 | 有窗口 → `REUSE`，否则 `DIRECT` |
| 锁屏 + `planA=false`（旧引擎） | `MIGRATE`（等价 1.3.39） |
| 锁屏 + `AUTO` + 窗口可见 | `REUSE` |
| 锁屏 + `AUTO` + 窗口被盖住 / 不存在 | **`MIGRATE`** ← 回归修复点 |
| 锁屏 + `REUSE`（A 侧） | 有窗口 → `REUSE`，否则 `DIRECT`（永不移） |
| 锁屏 + `MIGRATE`（B 侧） | `MIGRATE` |

`RearLyricsLauncher.start()` 里 LSP 仍然走原来的 `mayReuseWindow(attached, locked, true, …)`，
结果与 1.3.64 完全一致（`lsp=true` 时该函数等价于 `attached`）。

### 3.2 迁移事务按 API 37 的 ID 语义重写（`ShellUserService.stageMove`）

1.3.39 直接执行 `am display move-stack <window.taskId> <rear>`。这条命令的参数是
**stack / root task**，当时成立是因为「Display 0 上 `FLAG_ACTIVITY_NEW_TASK` 新建的任务」
本身就是 root task，`taskId == rootTaskId` 恰好为真。

现在：

1. 先用 `RearTaskTable` 读 `am stack list`，拿到该任务真实的 `root`；
2. 候选命令按顺序执行，每条都记录 `exit` + 首行输出：
   - `am display move-stack <root> <rear>`
   - `am display move-stack <taskId> <rear>`（读到的 root 与任务不同时才试，即 1.3.39 原写法）
3. **每条命令之后都回读任务表**，只有 `task.display == rear` 才算搬成功；
4. 输出 `moved=true/false` 与全过程原文，客户端以此判定，不看退出码。

服务端协议 `VERSION 254 → 255`，Shizuku 会重新加载服务进程（旧进程按保留事务销毁）。

### 3.3 恢复状态机的第二个机制换成真正的迁移

`RearCoveredRecovery.Mechanism`：

| 之前 | 现在 |
| --- | --- |
| `IN_APP_MOVE_TO_FRONT` | `IN_APP_MOVE_TO_FRONT`（不变） |
| `RELAUNCH`（`am start`，与前者重复） | **`MAIN_STAGE_MIGRATE`**（1.3.39 的新建 + 搬屏） |
| `REBUILD`（窗口真没了才用） | `REBUILD`（不变） |

`MAX_ATTEMPTS` 仍是 2，但含义是「两条不同手段各一次」，同一手段永不下发第二次。

### 3.4 A/B 路由（真机可切，无需重编）

设置 → 背屏 → **锁屏启动路线**：

| 选项 | 行为 | 用途 |
| --- | --- | --- |
| 自动（默认） | 可见就复用，否则迁移 | 正式行为 |
| 只复用 / 置顶（A） | 只跑 `moveTaskToFront`，**永不迁移** | 证明 A 单独确实无效 |
| 迁移到背屏（B，1.3.39） | 无条件迁移 | 单独验证迁移是否还成立 |

对应的失败门控也在 `RearCoveredRecovery.evaluate(allowRefront, allowMigrate)` 里：
A 模式下 `MAIN_STAGE_MIGRATE` 根本不会出现在候选里，不会"偷偷跑迁移"。

## 4. 安全边界（逐条对照要求）

| 要求 | 实现 |
| --- | --- |
| 不主动点亮 Display 0 | 迁移只发 `am start --display 0`（不唤醒）；`TRANSACTION_WAKE` 在 `displayId == 0` 时直接抛异常 |
| 不解锁主屏 | 全程没有 `KeyguardManager`/`dismissKeyguard` 调用；Activity 未声明 `showWhenLocked` |
| 不弹出可见界面 | 该 Activity 无 `showWhenLocked`，锁屏时在 Display 0 上不可见，建完即被搬走 |
| 不影响主屏正在运行的应用 | `FLAG_ACTIVITY_NEW_TASK` 新建独立任务，不触碰主屏前台任务；迁移后该任务整体离开 Display 0 |
| 迁移失败能安全撤销 | 失败走 `catch` → `finishIfShown()`（`!reuse` 分支），任务随 Activity 结束被移除 |
| 相机优先 | `runCoveredMechanism` 只在 `cameraOwned()==false` 时被调用；迁移前再查 `isYieldingToCamera()` 与 `cancelled(session)`，相机接管即抛 `Cancelled` |
| 不无限抢占 | 每机制一次、5 秒冷却、一个锁屏周期 2 次；判定 `blocked` 后 `panelLease.end()` 停止点亮 |
| 不改「背屏息屏」设置 | 仍然只读 `subscreen_display_time` |
| 不改 Media3 / Compose / 歌词舞台 / 灵动岛 | 未触碰 |

## 5. 自动化验证

`./gradlew :app:testDebugUnitTest`：**736 项、0 失败、0 错误**（107 个测试类）。
本轮新增/改写：

| 测试类 | 用例 | 覆盖 |
| --- | --- | --- |
| `RearLaunchRouteTest`（新增） | 11 | 未锁屏复用、**锁屏被盖住必须迁移**（回归断言）、旧引擎等价 1.3.39、A/B 三档、null/非法值回落、相机与用户优先 |
| `RearCoveredRecoveryTest`（改写） | 16 | 第二机制必须是迁移而非又一次 `am start`、A 路由不得出现迁移、B 路由直接迁移、表不可读≠任务不存在、只有可见才算 recovered |

既有 723 项全部保留通过（含 `RearTaskTableTest` 7、`RearWindowPolicyTest` 5）。

## 6. 必须真机验证（本轮未验证，不得视为已修复）

按顺序做一次，就能确定迁移在 API 37 / HyperOS 上是否还成立：

1. 保持系统「背屏息屏」**开启**，Shizuku 模式，路线选 **自动**；
2. 播放 → 锁屏 → 等 60 秒 → 解锁；
3. 导出诊断，在轨迹里找：
   - `launch-route … migrate-locked; lockedRoute=auto->MIGRATE(attached=true,visible=false,locked=true)`
     ⇒ 路线判定已生效；
   - `rear-migrate task=…, display 0->1, exit=…, relocated=true/false`
     ⇒ 迁移是否成功（`relocated` 是回读结果，不是退出码）；
   - `covered-migrate-failed …` ⇒ 迁移自己失败，`reason` 里带原文；
   - 成功时 `lastMigrate=RECOVERED(...)`，失败时 `lastMigrate=FAILED(...)`。
4. 若要单独验证迁移：路线切到 **迁移到背屏（B）**，重复一次；
   再切到 **只复用 / 置顶（A）**，确认它单独无效（这样 A/B 两个结论都是实测的）。
5. 相机：打开相机应立刻 `cameraYield=true`、`covered-*` 停止；退出相机后窗口自动回来。
6. 主屏：全程 `mainPower` 不应因为迁移变成 `on`（迁移只发 `am start --display 0`）。

如果 `moved=false` 且 `cmd[1]` 显示 `Unknown command`/`Error`，那就是这台固件不再提供
`am display move-stack`，此时结论是「迁移机制在当前固件不可用」，需要另找 ATMS 入口 ——
但那是**有原文的结论**，不再是"理论上不可能"。

## 7. 没有做的事

- 没有把系统「背屏息屏」关掉，也没有写任何 system 设置；
- 没有点亮或解锁主屏；
- 没有改 `lsp/`（`git diff` 可核对）；
- 没有提高唤醒/轮询频率，反而把重复的 `RELAUNCH` 机制删掉了；
- 没有改 Media3、Compose、歌词舞台、逐字歌词、灵动岛发布链路。
