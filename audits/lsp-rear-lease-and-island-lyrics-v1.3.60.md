# 听屿 Android 1.3.60：LSP 背屏租约与灵动岛歌词稳定性修复（验收报告）

基线：`tingyu-layout-1.3.59`（release 429749083，versionCode 82）
目标版本：`1.3.60`（versionCode 83）
范围：只改「锁屏背屏显示」与「灵动岛歌词交付」两条链路上的已确认缺陷，以及它们共用的恢复状态机。
未改动：Media3 播放引擎、Compose 界面、歌词舞台与逐字歌词、背屏相机避让、音源与预取。

> 结论先说清楚：本报告里所有「已验证」都只指 **JVM 自动化验证**。当前环境未连接任何
> HyperOS 真机，**没有一项 Hook 的真机命中率被证明**。文中逐条标注了「需真机确认」，
> 不把单元测试通过等同于真机修复。

---

## 1. 问题、根因、修改文件与关键差异

### 问题 1（致命，已确认）`RearHomeGuard.topPackageOf()` 把 `List` 强转成 `Object[]`

- 文件：`android/app/src/main/java/io/github/huleixin/tingyu/lsp/RearHomeGuard.java`
- 根因：
  ```java
  Object[] roots = (Object[]) IActivityTaskManager.getAllRootTaskInfos().invoke(atm);
  ```
  `getAllRootTaskInfos()` 的真实返回类型是 `List<RootTaskInfo>`（AOSP 10 起），强转数组抛
  `ClassCastException`；它被 `catch (Throwable ignored)` 吞掉，方法返回 `null`，而判定层把
  `null` 当作「身份未知 → 放行」。于是**迁移拦截在真机上从未生效过一次**，且没有任何计数器
  能暴露它（`moveBlocked` 恒为 0，看起来和「没有发生接管」一模一样）。
- 修改：
  - 新增 `lsp/RootTaskLookup.java`：接受 `List` / `Object[]` 两种容器；用字段 `taskId`、
    `topActivity`（`ComponentName` 或 `pkg/cls` 字符串）解析；返回
    `FOUND / ABSENT / UNREADABLE` 三态。
  - `RearHomeGuard` 改为消费 `RootTaskLookup.Result`，只有 `FOUND` 才可能拦截，并分别计数
    `moveAbsent`（本来就没这个任务）与 `moveUnreadable`（我们读不出来）。
  - `status()` 增加 `rootContainer=` 一项，直接打印容器真实类型、元素数与元素类名。

### 问题 2（已确认，需真机确认命中）`executeRequest` / `moveRootTaskToDisplay` 的签名与放行原因不可观测

- 文件：`lsp/RearHomeGuard.java`（`RearHomeGuardPolicy` 的判定表本身未改，只把 HOME 判别收紧）
- 根因：v1.3.59 只统计「匹配到几个方法」，不记录**挂的是哪个重载**、也不知道某个重载的返回
  类型是否允许「不启动」；一旦固件换了签名，日志里只有 `startHooks=0` 这一个线索。
- 修改：
  - 安装时用 `describe()` 记录真实签名串（`名称(参数类型):返回类型`，多重重载用 `|` 分隔），
    写进 `startSigs=` / `moveSigs=` / `rootMoveSigs=`；
  - 每次放行都写 `lastDecision`，包含 `pkg/cls/home/display/held/camera`；另设
    `startOtherDisplay`（目标显示不是租约背屏）与 `startUnresolved`（取不到 Request）计数；
  - 参数取值改为「先按类型名找 `*Request`，再退回第 0 参，最后读 `mRequest` 字段」；
  - **返回值安全**：`hook.method` 是 `Member`，需转型后再取返回类型 —— 只有 `int` 重载才用
    `START_ABORTED`（依次尝试 `ActivityManager` / `ActivityStarter` 的常量，都取不到退化为
    `-1`，并把实际取值记进 `abort=`）；`void` 重载用 `null` 取消；`boolean` 用 `false`；
    其它返回类型**放行并计入 `moveSkipped`/`startSkipped`**，不在 system_server 里制造无法
    解释的返回。
  - HOME 判定从「`CATEGORY_HOME` 或（`ACTION_MAIN` 且无组件）」收紧为「必须
    `CATEGORY_HOME`」。隐式 MAIN 启动在主屏上完全合法，收紧只减少误伤面。
- **未验证**：这三个类是否存在于目标固件、`executeRequest` 是否真的在锁屏 home-to-front 路径
  上被调用、`moveRootTaskToDisplay` 的参数顺序是否为 `(taskId, displayId)`。参数顺序仍按
  v1.3.59 的假设实现；若真机 `moveSigs` 显示为 `(int,int)` 之外的形态，日志会立刻暴露，
  但**本次没有证据**。

### 问题 3（致命，已确认）`RearWindowLease.hasOwnWindow()` 只扫窗口树第一层

- 文件：`lsp/RearWindowLease.java` + 新增 `lsp/WindowTreeProbe.java`、`lsp/XposedWindowNode.java`
- 根因：AOSP 11 起的层次是
  `DisplayContent → DisplayArea → Task → TaskFragment → ActivityRecord → WindowState`。
  `DisplayContent.mChildren` 第一层装的是 `DisplayArea`，不是 `WindowState`：每个元素都没有
  `mAttrs`，谓词必然 false，于是「读得到但没有匹配」被判成**确定的 ABSENT**。
  另外 `XposedHelpers.callMethod(display, "getWindow", OWN_WINDOW)` 这条「现代访问器」路径
  也从未生效过：`callMethod` 用实参的运行时类型（lambda 类）去找精确签名，永远找不到
  `getWindow(Predicate)`，异常被吞。
- 修改：
  - `WindowTreeProbe`：迭代式深度遍历（显式栈，不用递归），深度上限 16、节点上限 4096、
    身份集合防环，返回 `PRESENT / ABSENT / UNKNOWN` 三值；
  - `XposedWindowNode`：唯一接触 Xposed 反射的适配器，只读 `mChildren` / `mAttrs.packageName`；
  - 删除那条无效的 `getWindow(Predicate)` 快捷路径，只保留一条被测试覆盖的遍历路径。

### 问题 4（致命，已确认）`RearDisplayPower.runWindowRenew()` 在锁屏后事实上从不续租

- 文件：`lsp/RearDisplayPower.java`、`lsp/RearDisplayLease.java`、新增 `lsp/RearWindowRenewPolicy.java`
- 根因（两层）：
  1. 续租条件是 `Boolean.TRUE.equals(windows.hasOwnWindow(id))`，而探测恒为 false（问题 3），
     所以**一次也没续过**：锁屏 60 秒后租约自然到期，`shouldSleep` 开始放行休眠，背屏熄屏。
  2. 即使探测正确，v1.3.59 的 `renewForWindow` 只接受「距到期不足 15 秒」的续租，而续租循环
     恰好也是每 15 秒一跳 —— 一次 60 秒的租约里**只有一次**续租机会，那一次恰好撞上 Activity
     重排（窗口短暂 detach）就足以让整段锁屏再也亮不起来。
- 修改：
  - 续租闸门改为「每个带正向证据的 tick 都续」，仍受 `MAX_WINDOW_RENEWALS = 240` 硬上限
    （240 × 15 秒 ≈ 60 分钟，与上限原意一致）；过期后**不允许**再被续租回来（`now >= until`
    直接拒绝），过期清理语义与 v1.3.59 完全一致，没有引入任何新的保活通道；
  - 循环重排条件从 `remaining > 0` 保持，另在 `expire()` 里补一条 `stop:expired` 诊断；
  - 新增 `RearWindowLease.resolveDisplay(id)`：续租循环跑在定时器线程，不能依赖
    `shouldSleep` 先把 `DisplayContent` 填进缓存。安装时挂 `ActivityTaskManagerService.systemReady`
    抓一次实例，再经 `mRootWindowContainer.mChildren` 按 `mDisplayId` 反查（找不到就按
    UNKNOWN 处理）。

### 问题 5（已确认）窗口探测的 unknown 与 false 混为一谈

- 文件：`RearDisplayLease`、`RearWindowRenewPolicy`、`RearWindowLease.status()`
- 根因：`holdsWindow` 用 `!Boolean.FALSE.equals(ownWindowPresent)`，语义上是「unknown 也保持」，
  但续租用 `Boolean.TRUE.equals(...)`，两边不一致；加上探测恒 false，实际表现是「既不续租，
  又不压制休眠 → 60 秒后熄屏」。
- 修改：
  - `holdsWindow` 显式接收三值 `WindowTreeProbe.Presence`，并新增第二条正向证据
    `ownActivityOnTop`（来自 `topRunningActivity`）：PRESENT 或本应用在最前 → 保持；
    ABSENT → 允许休眠；UNKNOWN → 本帧保守保持；
  - 续租判定 `RearWindowRenewPolicy`：PRESENT/ownTop → RENEW；ABSENT → STOP；
    **UNKNOWN → HOLD（不续租、继续观测）**，并计数 `probePresent/probeAbsent/probeUnknown`
    与 `lastProbe`，真机日志能一眼区分「确实没有窗口」和「我们读不出来」。

### 问题 6（已确认）`FoliaPlaybackService.ensureLyricPublished()` 的一次性检查

- 文件：`FoliaPlaybackService.java` + 新增 `playback/LyricPublishGuard.java`
- 根因（三个缺陷叠加，正是「连续切歌后灵动岛歌词消失」）：
  1. **先标记后判断**：`lyricSelfHealDoneFor = cachedSongKey` 写在条件判断之前。换歌瞬间歌词
     还是 pending，这一首的自检额度当场被消耗；等歌词 ready，函数第一行就 `return`；
  2. **只看长度不看身份**：`sessionLen >= 0` 就算「会话有词」。上一首的时间轴、或本首的
     `noLyric` 占位桩，长度都 ≥ 0，于是「会话里是错的内容」永远不被纠正；
  3. **没有代次**：判定在异步回调里做，中途换歌会把旧结论套到新歌上。
- 修改：
  - 新增纯状态机 `LyricPublishGuard`：pending → `NONE/FETCH`（**不消耗额度、不标记完成**）；
    ready 时依次校验 ①会话 `MEDIA_ID` 是否本首 ②payload 是否为占位桩 ③会话内容对应的歌词
    版本是否等于桥上当前版本；任一不满足才受控重发；每个 `(songKey, revision)` 最多 3 次，
    用尽即 `EXHAUSTED`；`generation` 不匹配直接丢弃；
  - `FoliaPlaybackService`：新增 `lyricGeneration`（换歌 +1，`restoreFromEngine` 也算换歌），
    延迟回读闭包带代次，代次变了直接作废；
  - 回读一次拿齐三个答案（`MEDIA_ID` / `lyricInfo` 长度 / 是否占位桩），读不到会话单独记为
    `SESSION_UNREADABLE`，与「没有这个字段」分开；
  - 触发点：换歌发布后一次 + 1.5 秒后一次 + 10 秒心跳一次（仅播放中）；每次都被状态机判定，
    版本一致时**什么都不做**。
- 与既有路径去重：`publishMetadata()` 是 `applyNativeLyric()`、`ColorOsLyricBridge.requestRefresh()`
  与本自检的公共出口，现在在出口处统一记账 `onPublished(songKey, revision, generation)`，
  三条路径因此天然互斥，不会叠加刷新拖慢播放。
- 诊断：`lyric-self-heal` 一条记录里带 `layer=fetch|session|consumer|stale|exhausted`、`reason`、
  `bridgeRevision`、`sessionSong`、`sessionLen`、`sessionStub`、`generation`、`attempts`；
  `session-sample` 增加 `publishGuard=` 快照。四种失败（取词 / 交付 / 会话发布 / 系统消费端
  未显示）可以分开归因。

### 问题 7（已确认）`RearTakeoverPolicy` 的 attempts 被「成功」永久占用

- 文件：`RearTakeoverPolicy.java`
- 根因：`onRecovered()` 只清 `lastAttemptAt`，`attempts` 从不归还。一次长锁屏里
  「被顶掉 → 成功夺回」3 次之后，第 4 次被顶掉时额度已被历史**成功**耗尽，`exhausted` 永久
  置位 —— 表现就是「前几首正常，连播几首后背屏停在系统桌面不动」。
- 修改：拆成两个计数器
  - `consecutiveFailures`（上限 3）：只有「重夺后 8 秒仍被系统占着」才 +1；
    **连续 8 秒回到最前就把额度归还**（只是闪一下不算成功）；
  - `attempts`（上限 12）：本锁屏周期的**总量**安全上限，成功失败都计数，到顶即停；
  - 冷却 `MIN_GAP_MS = 20s` 保留；`observe(oursInFront, now)` 由每次任务列表探测驱动，
    另外用 `attempted` 布尔量替代 `lastAttemptAt != 0` 的哨兵（避免时刻 0 被误判）。
- 结果：成功不再占用失败额度，但仍不可能无限抢占（总量 12 次/锁屏周期）。

### 问题 8（已确认）Shizuku 的 `relightWakesMain` 归因错误、锁存永不解除

- 文件：`RearLyricsCoordinator.java` + 新增 `RearPanelRelightGuard.java`
- 根因：
  1. 归因只看「点亮前主屏不是 ON、点亮后是 ON」。验证窗口内**用户自己解锁**，主屏当然会亮，
     却被算成我们的错 —— 整场会话停止点亮，用户看到「歌词突然再也不亮」；
  2. 锁存是 Coordinator 的实例字段，解锁、重新锁屏、重新关开歌词都不清，一次误判 = 本次进程
     终身失效。
- 修改：
  - 归因必须同时满足「点亮前主屏熄灭」+「验证时**仍然锁屏**」，否则判 `USER_UNLOCK`，不算在
    我们头上、也不消耗额度；
  - 两级锁存：`sessionLatched`（本锁屏周期，解锁即清）与 `disabled`（跨周期累计 2 次确认后
    本次进程不再尝试）；周期切换只在 `locked` 的 false→true 跳变上发生，避免「重开租约」
    把锁存清掉；
  - 新增一条 v1.3.59 完全没有的规则：**主屏亮着时不去点背屏**（`SKIP_MAIN_ON`）。`KEYCODE_WAKEUP`
    在部分 ROM 上同时算「用户活动」，会在主屏已亮时继续给它续命 —— 那正是拿功耗换表面稳定。

---

## 2. 自动化验证 / 必须真机验证

### 2.1 已通过 JVM 自动化验证（决策逻辑）

新增 5 个测试类（45 项）+ 重写/扩充 2 个既有测试类（`RearTakeoverPolicyTest` 7 项、
`RearDisplayLeaseTest` 19 项，原有 11 项语义全部保留并适配三值签名），全部通过：

| 需求点 | 测试类 | 关键断言 |
| --- | --- | --- |
| `getAllRootTaskInfos` 返回 List | `RootTaskLookupTest` | `List` 能解析出包名（正是 v1.3.59 的死因）；数组仍兼容；空列表 = ABSENT；元素无 `taskId` = UNREADABLE |
| 窗口树多层嵌套 | `WindowTreeProbeTest` | 4 层嵌套能找到；**断言「只扫第一层必然漏」**；超深树 = UNKNOWN 而不是 ABSENT；环形引用不挂死 |
| 探测 unknown / false | `WindowTreeProbeTest` + `RearWindowRenewPolicyTest` | 容器读不到 = UNKNOWN；UNKNOWN → `HOLD`（不续租）；ABSENT → `STOP`；PRESENT → `RENEW` |
| 背屏租约续租与过期 | `RearDisplayLeaseTest`（19 项，含 v1.3.59 原有 11 项适配保留） | 过期即清理；每个正向 tick 可续；240 次硬上限；过期后不能被续活；三值 `holdsWindow` |
| 连续多次成功恢复后的再次抢占 | `RearTakeoverPolicyTest` | 8 次「夺回并稳定」后仍可再抢、失败额度为 0；连续 3 次无效才停；总量 12 次封顶；闪回 2 秒不算成功 |
| pending → ready → Session 发布 | `LyricPublishGuardTest` | pending 不消耗额度；ready 后仍能发布一次；发布后版本一致即不再刷新 |
| 切歌后的迟到回调 | `LyricPublishGuardTest` | 旧代次结论被丢弃；`onPublished` 拒绝旧歌记账 |
| MediaSession 歌曲身份不匹配 | `LyricPublishGuardTest` | 会话 `MEDIA_ID` 是别的歌 → 重发；占位桩 → 重发；版本不一致 → 重发一次 |
| 主屏亮起但仍未解锁 | `RearPanelRelightGuardTest` | 主屏变亮 + 仍锁屏 → 归因于我们；主屏变亮 + 已解锁 → `USER_UNLOCK`（不锁存） |
| 相机接管背屏 | `RearWindowRenewPolicyTest` | 相机在背屏最前时，即使我们的窗口还在也 `STOP`；`holdsWindow` 对相机恒 false |

### 2.2 只能真机验证（本次**没有**验证，不得视为已修复）

1. `ActivityStarter.executeRequest` / `ActivityTaskManagerService` / `RootWindowContainer`
   在目标固件上是否存在、是否仍叫这个名字；
2. 锁屏 home-to-front 是否真的经过 `executeRequest`，`activityOptions` 里是否带
   `launchDisplayId`（若为 -1，判定会退回「只拦明确背屏桌面组件」这条更保守的路径）；
3. `moveRootTaskToDisplay` 的参数顺序是否仍为 `(taskId, displayId)`、返回类型是否为 `void`；
4. `WindowState.mAttrs` / `WindowContainer.mChildren` 是否仍可反射读取（`probeUnknown` 计数
   会直接回答这一点）；
5. `DisplayPowerController.requestPowerState` 的 `mDisplayId` 字段是否可读；
6. 背屏面板是否真的在租约无效后按系统策略熄灭（功耗）；
7. 灵动岛（ColorOS 消费端）是否真的在会话 metadata 正确后显示歌词 —— 这一层在进程外，
   只能靠 `lyric-self-heal` 的 `layer=consumer` 与真机观察对照。

---

## 3. 执行记录

- `./gradlew :app:testDebugUnitTest`：**685 项、0 失败、0 错误**（102 个测试类）。
  基线 v1.3.59 的 release notes 写的是 637 项；本次净增 48 项，其中
  `RootTaskLookupTest` 9 / `WindowTreeProbeTest` 10 / `RearWindowRenewPolicyTest` 8 /
  `RearPanelRelightGuardTest` 6 / `LyricPublishGuardTest` 12 是新增类，
  `RearDisplayLeaseTest`（11→19）与 `RearTakeoverPolicyTest`（5→7）为改写扩充；
- `./gradlew :app:assembleRelease`：**已用官方发布密钥签名**，证书
  `a36ef2a5…8ece02249d`（`CN=Tingyu, OU=Android, O=huleixin, C=CN`）与 1.3.39 / 1.3.59
  官方包逐位一致，签名方案同为 v2+v3，`versionCode=83 / versionName=1.3.60`；
  APK SHA-256 `909c450e…ee51ca0a`。详见 `BUILD.md`；
- 环境备注：本机项目路径与 SDK/Gradle Home 都含中文，AGP 与 Gradle 测试 worker 在非 ASCII
  路径下会直接失败（`ClassNotFoundException: GradleWorkerMain`）。真实的构建是在 ASCII 路径
  （`C://tb//tingyu`，`node_modules` 用 junction 指回原目录）下完成的，源码逐字节一致。
  这只影响本机验证，不影响仓库内容。

---

## 3.1 改动文件清单

新增（6 个源文件 + 5 个测试类）：

| 文件 | 作用 |
| --- | --- |
| `lsp/RootTaskLookup.java` | `getAllRootTaskInfos()` 的 List/数组解析与三态结果 |
| `lsp/WindowTreeProbe.java` | 窗口树深度遍历（PRESENT/ABSENT/UNKNOWN） |
| `lsp/XposedWindowNode.java` | 上述遍历在 system_server 里的反射适配器 |
| `lsp/RearWindowRenewPolicy.java` | 「这一跳该不该续租」的纯判定 |
| `RearPanelRelightGuard.java` | 背屏点亮误伤主屏的归因与两级锁存 |
| `playback/LyricPublishGuard.java` | 会话侧歌词自检状态机 |
| `test/.../RootTaskLookupTest.java` 等 5 个 | 45 项新用例 |

修改（8 个源文件 + 2 个测试类 + 版本号）：

| 文件 | 改动 |
| --- | --- |
| `lsp/RearHomeGuard.java` | `topPackageOf` 改走 `RootTaskLookup`；记录真实签名串、放行原因、返回值安全性 |
| `lsp/RearWindowLease.java` | 第一层扫描 → `WindowTreeProbe`；三值 + `ownActivityOnTop`；`resolveDisplay`；探测分项计数 |
| `lsp/RearDisplayLease.java` | `holdsWindow` 改三值签名；续租闸门从「最后半个窗口」改为「每个正向 tick」；过期不可复活 |
| `lsp/RearDisplayPower.java` | `runWindowRenew` 走纯判定；`expire` 补 `stop:expired` 诊断；循环只在租约有效时重排 |
| `RearTakeoverPolicy.java` | 连续失败与总量两个计数器；稳定恢复归还额度 |
| `RearLyricsCoordinator.java` | 安全阀换成 `RearPanelRelightGuard`；`takeover.observe(...)`；诊断字段 |
| `FoliaPlaybackService.java` | 自检改 `LyricPublishGuard`；`lyricGeneration`；三处触发点；`publishMetadata` 统一记账 |
| `package.json` | version 1.3.59 → 1.3.60，androidVersionCode 82 → 83 |
| `RearDisplayLeaseTest` / `RearTakeoverPolicyTest` | 适配新签名与新区语义 |
| `android/capacitor.settings.gradle` | 生成文件里的绝对相对路径改为 `../node_modules/...`（任何 checkout 可用） |

---

## 4. 明确保留、未改动的部分

- Media3 播放引擎、`NativeAudioEngine`、队列与续播：未改一行；
- Compose 界面、`NativePage*`、歌词舞台与逐字歌词渲染：未改；
- 背屏相机避让（`RearHandoffState` / `RearOccupancy` / `RearCameraPolicy`）：判定与阈值未改，
  只在续租判定里保留「相机优先」这一条既有约束；
- 系统「背屏息屏」设置：仍然只读（`probeLockSetting`），本次没有新增任何 `settings put`；
- 不重构无关业务代码：改动集中在 8 个文件 + 6 个新增文件，其余 200+ 源文件未触碰。

## 5. 不能声称的部分

- 本文所有「修复」均为**代码级根因修复 + JVM 决策逻辑验证**；未连接真机，未做功耗与显示测量；
- 第 2.2 节七项全部**未验证**；
- 若目标固件连 `executeRequest` 都不走这条路径，拦截仍会失效 —— 但那时
  `startConsulted=0` / `moveConsulted=0` 会直接写在诊断里，不再像 v1.3.59 那样「看起来一切正常」；
- 签名这一项已闭环：官方加密备份解密后得到 `tingyu-release.p12`（别名 `tingyu-release`），
  用它重签的 1.3.60 经 `dev/build/verifyApkSignature.mjs` 判定与官方证书**逐位一致**，
  可以覆盖安装官方 1.3.59。但请注意：**签名正确只说明「装得上」**，不代表本节列出的
  任何 Hook 在真机上生效 —— 那七项仍然未验证。
