# 听屿 Android 1.3.61：锁屏背屏故障定位（LSP / Shizuku）与取证诊断

基线：1.3.60（versionCode 83）。本轮 versionCode 84。
本轮**没有**再增加续租、唤醒重试或任务重夺补丁；只在确认到实现缺陷的地方改代码，
其余部分改为「把判据记录下来」，因为这两条症状的成因只能由真机状态区分。

---

## 0. 先纠正一个前提：「关掉背屏息屏就能显示」不能证明 LSP 生效

这是本轮最重要的判断，也是之前几版一直改错方向的原因。

- 系统「背屏息屏」**关闭**时，锁屏那一刻系统根本不会去动背屏：不熄屏、不起 AOD。
  歌词窗口自然留在原位 —— 这**不需要任何 hook**。
- 也就是说：`背屏息屏=关 → 歌词正常` 只证明「系统没来打扰」，**不能**证明
  `TingyuXposedModule` 被 LSPosed 注入、更不能证明 `shouldSleep` / `requestPowerState`
  这些 hook 命中过。
- 反过来，`背屏息屏=开 → 歌词消失` 才是唯一有信息量的观测，它说明系统确实做了某件事，
  而我们的拦截没生效。

结论：排查顺序必须是「先证明 hook 命中，再谈策略」，而不是继续加保活。这就是本轮先做
诊断埋点的原因。

---

## 1. LSP 侧

### 1.1 加载链路：代码层面能证明的部分（已核对，无需真机）

| 环节 | 现状 | 结论 |
| --- | --- | --- |
| `assets/xposed_init` | `io.github.huleixin.tingyu.lsp.TingyuXposedModule` | ✓ 指向真实类 |
| `AndroidManifest` | `xposedmodule=true`、`xposedminversion=82`、`xposedscope` 资源 | ✓ 声明完整 |
| `handleLoadPackage` | 只接受 `packageName=android` 且 `processName=android` | ✓ 只进 system_server |
| 安装失败可见性 | 每个组件独立 `try/catch`，失败置 `*HookError=true` 并写 `XposedBridge.log` | ✓ 不会静默 |
| 命中计数 | `startHooks/moveHooks/rootMoveHooks/dreamHooks`、`startConsulted/moveConsulted/dreamConsulted`、各自 blocked/allowed | ✓ 已有 |

能证明的到此为止。**「LSPosed 是否真的把模块注入 system_server、用户是否勾选了系统框架作用域」
只能由真机确认**，本轮不宣称。

### 1.2 已确认的实现缺陷：梦境拦截的返回值不安全（本轮已修）

- 文件：`lsp/RearDreamGuard.java`
- 旧代码：命中「背屏 AOD」时无条件 `hook.setResult(null)`。
- 问题：`DreamManagerService.startDream / startDozeDream / requestStartDream` 的返回类型
  在不同 ROM 上分别是 `void` / `boolean`。对非 void 方法设置 `null`，等于让调用方去拆箱一个
  空值；即使不崩，**拦截本身也没有生效**，而旧代码在这种情况下没有任何计数器 ——
  真机上看起来和「hook 没命中」完全一样。
- 修改：按返回类型决定取消方式（`void → null`，`boolean → false`，其它类型放行并计入
  `skipped` + `lastSkip=return=xxx`）。这和 1.3.60 里 `RearHomeGuard` 的返回值处理保持同一口径。
- 影响面：只在「歌词租约持有 + 无相机宽限」时才会走到这段；其它情况仍然 fail-open。

### 1.3 五种故障的判别字段（本轮埋点，真机一次导出即可区分）

| 可能的故障 | 快照里应该看到 |
| --- | --- |
| 物理面板 OFF | `rear=off`，`main=off`，`attached=true`，`lease` 仍有效 |
| AOD 接管（面板亮、内容不是我们） | `rear=doze` 或 `doze-suspend`，`dreamConsulted` 增长 |
| 窗口被背屏桌面覆盖 | `rear=on`，`attached=true`，`showing=false`，`lastDecision`/`frontTask` 指向 `com.xiaomi.subscreencenter` |
| 窗口被销毁 | `window=null` 或 `attached=false` |
| 租约失效 / 从未建立 | `lease=none`，`lastEnd=expired after N renewals` / `release by client …` |

`rear=doze` 与 `rear=off` 必须分开记录，这一点有专门的单测
（`RearFaultDiagnosticsTest.offAndDozeAreNeverTheSameAnswer`）：把 DOZE 记成 off，
报告会把「内容被接管」误判成「电源没保住」，两条链路的修法完全不同。

### 1.4 拿到真机样本后的分支（明确写出，不含猜测）

- `dreamConsulted` 增长但 `rearAodBlocked=0` → Dream 包名没解析对；日志里的
  `args=[…]` 会给出真实参数类型，据此改 `dreamPackageFrom` 的解析，不扩大拦截面。
- `dreamConsulted=0` 且 `rear=doze` → 这条 ROM 的背屏 AOD 不是 DreamManagerService 的 Dream，
  需要改拦 `DisplayPowerController` 的 doze 转换（下一步再动，本轮不动）。
- `startHooks=0` / `dreamHooks=0` → 模块没注入或方法名不同，属于作用域/兼容问题。

### 1.5 PowerManagerService / DisplayPowerController / DisplayContent / 背屏中心：检查了哪些、为什么不 hook 哪一个

| 组件 | 现状 | 判断依据 |
| --- | --- | --- |
| `DisplayPowerController.requestPowerState` | 已 hook：租约持有且无相机时把 policy 改成 `POLICY_BRIGHT` | 副屏亮度/点亮的最终决策点 |
| `DisplayContent.shouldSleep` / `isScreenSleeping` | 已 hook：租约持有 + 窗口证据时不放行休眠 | 「面板要睡了吗」的唯一入口 |
| `DisplayManagerService.requestDisplayPower` | 已 hook：可直连面板的旁路 | 绕过 controller 的直接调用 |
| `DreamManagerService.startDream / startDozeDream / requestStartDream` | 已 hook，本轮修好返回值安全 | 「背屏息屏」开启后 AOD 接管内容的入口 |
| `PowerManagerService` | **不 hook** | 它管的是整机 wakefulness；对副屏它只下发 display group 的休眠/唤醒，最终仍落到 `DisplayPowerController`。在 PowerManagerService 上拦截等于改整机电源行为，违反「禁止全局禁止设备休眠」 |
| `com.xiaomi.subscreencenter` 本体 | **不 hook** | 它是第三方 App 进程，进程内 hook 需要额外作用域；我们只在 system_server 侧拦它触发的系统调用，命中面更小、可回退 |

「背屏息屏」这个开关本身从未被读取或改写；`subscreen_display_time` 仍只读（`lockSetting`）。

---

## 2. Shizuku 侧

### 2.1 旧代码无法回答的三个问题（本轮补上）

| 问题 | 旧状态 | 现在 |
| --- | --- | --- |
| 锁屏后歌词窗口是否仍附着 | 只有 `relights=0` 一个数字 | 快照里 `attached` / `showing` / `window=display=…,task=…,visible=…` |
| `observe()` 为什么放弃恢复 | `!windowAttached` 直接 `return NONE`，无痕迹 | `lastSkip`：`no-lease / guarding-off / panel-on / no-window / backoff / verify-wait / session-cap` |
| 唤醒到底有没有点亮 | 命令结果被丢弃 | `lastWake`：`before→after`、`lit=true/false`、`exit=`、`out=` |

### 2.2 「命令成功 ≠ 背屏点亮」的落点

`RearLyricsLauncher.wakeNumber()` 现在在**同一次调用里**记录：

```
Restore rear power display=1 off->off lit=false exit=0 out=…
```

`exit=0` 只说明 `input` 把事件写进了输入队列；判据是 `Display.getState()` 的前后变化。
如果真机上反复出现 `exit=0` + `lit=false`，那就是 **shell 权限无法覆盖 HyperOS 锁屏电源策略**
的直接证据，本轮会据此给出「无权限」的结论，而不是继续加重试。

### 2.3 两条启动路径在代码上本来就不一样（锁屏前已显示 / 锁屏后启动）

`RearLyricsLauncher.launch()` 里有一处**后端相关**的分支，这是第二个症状的结构性原因之一：

```java
if (!locked || reuse || LspRearBridge.selected(context)) {
    // 直接 am start --display <rear> + WAKE
} else {
    // 锁屏 + Shizuku + 没有可复用窗口：故意不发 START/WAKE，
    // 改走「主屏透明任务 → moveRootTaskToDisplay → WAKE」
}
```

- **LSP 模式**永远走直接路线（模块在 system_server 侧放行），所以 LSP 下「锁屏后启动」是可行的；
- **Shizuku 模式**在锁屏且无窗口可复用时**不会**向后屏发 START，也不会发 WAKE，只能靠
  「先在主屏建任务、再搬到后屏、最后唤醒」。这条链上任何一步被 keyguard 拒绝，最终就是
  「背屏未确认显示」。
- 本轮**没有**改这个分支：它是有意为之的避让（避免直接向后屏发起被 HyperOS 拒绝的启动），
  改成什么样必须看真机上到底是哪一步失败 —— 快照里的 `wake`（`lit=false` 就是这一步）
  与 `window=null`（这一步之前就没建起来）能区分。

### 2.4 本轮**没有**改的判定（刻意的）

`RearPanelLease.observe()` 里 `!windowAttached → 不点亮` 这条约束**保持不变**：
没有我们的窗口时点亮面板只会照亮 OEM 背屏桌面。本轮只把它从「静默跳过」改成
「记下 `no-window`」。是否要放宽（例如区分「窗口已被销毁」与「窗口状态读不到」），
取决于真机上这一项到底是哪一种 —— 先取证，再改判定。

---

## 3. 「背屏故障诊断」入口

### 3.1 怎么用

- **一键入口**：设置 → 帮助 → **背屏故障诊断**。点一下会立即采一条快照，并把整份诊断
  （含历史快照）交给系统分享面板。
- **自动采样**：不需要任何操作。锁屏跳变时按 **+0s / +5s / +60s** 各采一次，解锁时再采一次；
  由前台服务里的协调器驱动，**不依赖主 Activity 是否存活**。
- **不打开界面也能取**：同一份数据会镜像到
  `Android/data/io.github.huleixin.tingyu/files/rear-fault/rear-fault-latest.txt`，
  `adb pull` 即可（>256 KB 自动轮转，不会无限增长）。

### 3.2 一条记录里有什么

```
trigger        lock+0s / lock+5s / lock+60s / unlock+0s / manual
locked         是否仍锁屏
main / rear    Display.getState() 的可读名：on / off / doze / doze-suspend / unknown
rearId         背屏 display id
window         display / task / visible / rendered / viewport
attached       我们的窗口是否仍挂在该显示上
showing        是否真的处于可见绘制状态
session        会话 token 哈希（不含明文）
cameraYield    是否正在给相机让位
wake           最近一次背屏唤醒：before→after、lit、exit、命令输出
trace          最近 4 条锁屏轨迹
detail         协调器全量状态：后端（lsp/shizuku）、LSP profile、Hook 安装与命中计数、
               面板租约（含 lastSkip）、重夺节流、相机状态、lockSetting 只读探针
```

不含歌词正文、不含歌名、不含 Cookie。

---

## 4. 验证

- `:app:testDebugUnitTest`：**697 项、0 失败、0 错误**。本轮新增 12 项：
  `RearFaultDiagnosticsTest` 4（新类）、`RearPanelLeaseTest` 6（9 项原有全部保留，合并为 15）、
  `RearDisplayLeaseTest` 2（19 → 21）。
- 新增/修改的判据都有单测钉住：DOZE 与 OFF 不可混同、锁屏三个采样点、
  「为什么没点亮」的六种原因、租约失效原因（到期续了几次 / 客户端主动释放）。
- **真机未验证**（本轮不宣称）：
  1. 模块是否真的注入 system_server、`dreamHooks` 是否为 0；
  2. 目标固件 `startDream` 的真实返回类型与参数；
  3. 「背屏息屏」开启时面板到底进 `doze` 还是 `off`；
  4. shell 的 `input keyevent` 能否点亮被 HyperOS 压灭的背屏；
  5. LSP 与 Shizuku 两条路径在锁屏 60 秒后是否仍持有租约。

## 5. 下一轮的最短路径

1. 安装 1.3.61（同签名，可覆盖 1.3.60）；
2. 保持系统「背屏息屏」**开启**，播放并锁屏，等 60 秒；
3. 解锁后：设置 → 帮助 → 背屏故障诊断 → 导出；
4. 按 §1.3 的表判读，直接落进 §1.4 的某个分支。
