# 听屿 Android 1.3.63：LSP 背屏接管路径的重新定位与 Hook 修复

基线 1.3.62（versionCode 85）。本轮 versionCode 86。
证据：`folia-diagnostics-20261031-171530.txt`（Shizuku）与
`folia-diagnostics-20261031-172648.txt`（LSP，本报告的主证据）。

> 本轮没有连接真机。第 3 节只写「代码做了什么、日志会输出什么」，
> 不把「钩子装上」写成「已经拦住」，也不把 JVM 测试通过写成真机修复。
>
> 自动化验证：`:app:testDebugUnitTest` **715 项、0 失败、0 错误**（105 个测试类），
> 本轮新增 `RearFrontGuardPolicyTest` 5 项（710 → 715）；`lsp` 包用
> `android.jar + de.robv.android.xposed:api:82` 独立编译通过。
> `assembleRelease` 成功，官方密钥签名 `a36ef2a5…`，`versionCode=86 / versionName=1.3.63`。

---

## 1. 这份 LSP 日志证明了什么

### 1.1 锁屏瞬间发生了什么（时间轴，取自 `Lock history`）

```
99943982 lock-probe  lsp: window-visible, display=1, state=2,
                     window=display=1, task=56942, visible=true, rendered=true
                     front=rear=56942 io.github.huleixin.tingyu/.RearLyricsActivity
99943983 power-event android.intent.action.SCREEN_OFF
99944060 stop        display=1
99944432 rear-front  rear=3 com.xiaomi.subscreencenter/.SubScreenLauncher, main=-1 ?
```

锁屏前一刻**歌词是全屏可见的**（`window-visible`），租约也在（`holding=true`）。
142 ms 后背屏前台变成 `task=3` 的 SubScreenLauncher，我们的窗口被 `onStop`。

### 1.2 接管走的不是「启动请求」

| 计数器 | 值 | 含义 |
| --- | --- | --- |
| `startHooks` / `startSigs` | 1 / `executeRequest(Request):int` | 钩子装上了 |
| `startConsulted` | 13 → 19 | 被调用 19 次 |
| `rearHomeStartBlocked` | 0 | 一次都没判成「背屏桌面接管」 |
| `startOtherDisplay` | 2（全程不变） | 只有 2 次落在**别的**显示，且发生在锁屏之前 |
| `lastDecision` | `allow start pkg=…/RearLyricsActivity, home=false, display=1, held=true` | 看到的是**我们自己**的重建 |

13 → 19 的 6 次增量，正好对应日志里 5 次「正在直接启动背屏歌词…」加上 1 次其它请求 ——
也就是说 **SubScreenLauncher 抢前台根本没有经过 `executeRequest`**。
`moveConsulted=0`、`rootMoveConsulted=0`，说明也不是迁移路径。

而它抢到的是 **task=3**：一个**早就存在**的任务。一个已存在的任务被拿到前台，只有两条系统入口：
`ActivityTaskManagerService.moveTaskToFront(...)` 与 `TaskDisplayArea.resumeHomeActivity(...)`。
1.3.61 一条都没挂 —— 这就是「钩子都装上了却从不命中」的确切原因。

### 1.3 面板没有被关掉

```
directLast=display=1, requested=0, effective=0, result=false
Current rear power: 2      ← Display.STATE_ON
```

系统在锁屏时**请求**把背屏关掉（`requested=0`），但这次请求被拒绝（`result=false`），
面板一直是 ON。所以本故障不是「物理熄灭」，也不是「AOD/Dream 切换」——
是**内容被背屏桌面盖住**。这与「关掉背屏息屏设置就能用」的观察一致：那个开关决定的是
锁屏时是否让背屏中心接管内容，而不是背屏的电源。

### 1.4 续租链在 LSP 下从未观测过

```
windowRenewals=0  probePresent=0  probeAbsent=0  probeUnknown=0
lastProbe=not probed   lastRenew=not consulted   sleepConsulted=0
```

`probe*` 三个计数全为 0 且 `lastProbe=not probed`，说明**探测函数一次都没被调用**：
要么续租循环没跑，要么跑了但拿不到 `DisplayContent`。旧代码里这两件事无法区分
（`runWindowRenew` 唯一的痕迹是 `lastRenew`，而它在 `evidence()` 之后才写）。

### 1.5 两个「安装状态」在说谎

| 现象 | 真实原因 |
| --- | --- |
| `rearDreamHook=true, dreamHookError=false, dreamHooks=0` | `hookAllMethods` 对不存在的名字是**静默零命中**；代码无条件 `installed=true`，所以「一个方法都没挂上」被报成安装成功 |
| `rearWindowHook=true, windowHookError=true`（同一行） | 一个 `failed` 布尔量被两条安装路径共用：`installed` 来自 shouldSleep 那一块，`failed` 来自 ATM 的 `systemReady` 那一块 |
| 握手时 `windowHookError=false`、之后 `true` | 交接发生在 `ActivityManagerService.systemReady` 之后，错误出现在**更晚**的 ATM hook 上 —— 时间差正好对上 |

## 2. 改了什么

### 2.1 新的拦截位置：`RearFrontGuard` + `RearFrontGuardPolicy`

挂两处，都在 system_server：

| Hook | 方法 | 作用 |
| --- | --- | --- |
| ATMS | `moveTaskToFront`（全部重载，实测签名会写进诊断） | 背屏中心把自己的已存在任务提为前台 |
| RootWindowContainer | `moveTaskToFront`（若存在） | 同上，部分 ROM 直接走实现层 |
| TaskDisplayArea | `resumeHomeActivity`（若存在） | 系统在租约背屏上恢复桌面 |

判定（纯逻辑，5 项单测）：

```
租约持有 && 该背屏无相机 && 目标显示不是 0
  ├─ moveTaskToFront：任务身份优先 —— 目标任务根 Activity 是背屏中心才拦；
  │                   任务身份读不出来时才退回调用方包名；我们自己的任务永远放行
  └─ resumeHomeActivity：目标显示必须精确等于租约背屏，且我们的窗口确实在该显示的窗口树里
```

- 主屏（display 0）在**第一行**就被排除；
- 我们自己的 `RearTaskRefront`（1.3.62 的 `moveTaskToFront`）走的是同一个钩子，
  因为任务身份是 `io.github.huleixin.tingyu`，永远不会被自己拦掉；
- 租约释放、相机接管、用户关歌词之后，钩子只是透传（连反射都不做）。

### 2.2 让「零命中」不再伪装成「安装成功」

- `RearDreamGuard`：改为按特征扫描（名字含 `dream` 且以 `start`/`request` 开头），
  真正挂上的方法名记进 `dreamHooked=[…]`；`installed = matched > 0`，
  零命中直接 `dreamHookError=true` 并列出该类真实方法名（有上限）。
- `RearHomeGuard`：原来一个 `failed`，现在拆成 `startError` / `moveError` / `rootError`，
  每条都带异常原文；零命中同样带 `declared=[…]`。
- `RearWindowLease`：拆成 `windowHookError`（shouldSleep 那一路）与 `atmHookError`
  （ATM 那一路），并新增 `atmCaptured`。
- `RearFrontGuard` 自身：`frontMoveError` / `frontRootError` / `frontHomeError` 分开记，
  零命中时把类里真实方法名列出来，下一次真机日志可以直接照着改。

### 2.3 续租链第一次真正能跑起来

`resolveDisplay()` 原本只认两处来源：钩子缓存（要 `shouldSleep` 先被调用）和
`ActivityTaskManagerService.systemReady` 钩子。日志证明后者失败了，前者没有发生，
于是 `evidence()` 永远是 UNKNOWN，续租永远不发生。

现在：任何一次 `shouldSleep` 都会顺手从 `DisplayContent.mAtmService` 把 ATM 实例补齐，
把「续租是否观测过」变成可判定的事实：
`renewTicks`（循环第一行就加）、`lastRenewTick=display=1, atm=ok/null, cached=true/false`。

### 2.4 区分「物理熄灭」与「被覆盖」

`DisplayPowerController.requestPowerState` 的 hook 现在会记录租约背屏上**系统请求的 policy**
与我们的覆盖次数：

```
rearPolicy=policy=0->bright, leased=1   policyOverrides=37
```

配合 `directLast=display=1, requested=…, result=…` 与 app 侧 `rearPower`，
四种情形可以在同一份日志里分开：

| 情形 | 判据 |
| --- | --- |
| 系统物理关闭背屏 | `rearPolicy=policy=OFF` 且 `result=true` 且 `rearPower=off` |
| 背屏桌面覆盖歌词 | `rearPower=on` + `frontLast=blocked …` 或 `frontMoveBlocked>0` |
| OEM AOD/Dream 切换 | `dreamConsulted>0`（且 `dreamHooked` 非空） |
| 歌词 Activity 被停止 | `stop display=1` + `window visible=false rendered=true` |

### 2.5 共享的前台恢复死路

`reuse=true` 时直接抛异常的分支已在 1.3.62 修掉（`callback.covered(...)` + `RearCoveredRecovery`），
LSP 与 Shizuku 共用同一条路径，本轮未回退。LSP 日志里的
「原背屏歌词窗口未能恢复到前台」来自 1.3.61 的旧代码。

## 3. Hook 的安装 / 命中 / 拦截：现在能读到什么

`profile()` 里新增的字段（下一次真机日志直接可见）：

```
rearFrontHook=true
frontMoveHooks=1,  frontMoveSigs=[moveTaskToFront(IApplicationThread,String,int,int,Bundle):void]
frontRootHooks=0|1, frontRootSigs=[…]
frontHomeHooks=0|1, frontHomeSigs=[resumeHomeActivity(ActivityRecord,String):void]
frontMoveConsulted=N, frontMoveBlocked=N, frontMoveNoTask=N, frontMoveUnresolved=N
frontHomeConsulted=N, frontHomeBlocked=N, frontHomeNoWindow=N
frontLast=blocked rear-centre front task=3 caller=com.xiaomi.subscreencenter top=com.xiaomi.subscreencenter display=1
rearPolicy=policy=0->bright, leased=1, policyOverrides=N
renewTicks=N, lastRenewTick=display=1, atm=ok, cached=true
atmHookError=false|true(原因), atmCaptured=true
dreamHooks=N, dreamHooked=[startDream,…]
```

**这不是证据，只是判读入口**：装没装上由 `*Hooks` 决定，命中由 `*Consulted` 决定，
拦没拦住由 `*Blocked` 决定。三者分离之后，下一次日志可以一句话回答
「是没挂上、没被调用、还是调用了但判定放行」。

## 4. 必须真机验证（本轮未验证）

1. `moveTaskToFront` 在 API 37 的 ATMS 上是否仍是这个名字与签名
   （`frontMoveSigs` 会直接给出，零命中会给 `frontMoveError` + `declared=[…]`）；
2. 锁屏瞬间 `frontMoveConsulted` 是否增长、`frontLast` 是否指向
   `caller=com.xiaomi.subscreencenter`；
3. 若 `frontMoveConsulted` 不增长而 `frontHomeConsulted` 增长 → 走的是恢复桌面那条；
   两条都不增长 → 接管来自第三处（届时 `declared` 列表可以直接定位）；
4. 拦下之后窗口是否真的保持 `visible=true`（`covered` 不应再出现）；
5. `renewTicks` 是否非零、`lastRenewTick` 是否 `atm=ok, cached=true`；
6. 相机打开时 `frontMoveBlocked` 必须不增长（相机宽限优先）；
7. 关闭歌词/停止播放后 `frontMoveBlocked` 停止增长（干预已撤销）。

## 5. 没有做的事

- 没有提高 60 秒租约的续期频率，没有新增唤醒或轮询；
- 没有禁止设备休眠，没有改动 Display 0 的任何电源或焦点行为；
- 没有关闭或改写「背屏息屏」设置（`subscreen_display_time` 仍然只读）；
- 没有改 Media3、Compose、歌词舞台、逐字歌词、灵动岛发布链路；
- 没有拦任何非背屏中心的应用，也没有拦主屏桌面。
