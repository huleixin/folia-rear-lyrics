# 听屿 1.3.97：宿主握手修复（hostConnected=false）

> 1.3.98 追加了不经过 Provider 的有序广播 ping，用来证明模块是否真的运行在背屏中心进程，
> 并记录 `handleLoadPackage` 的最早入口。见
> [`ANDROID-LSP-HOST-PING-1.3.98.md`](ANDROID-LSP-HOST-PING-1.3.98.md)。

基线：1.3.96 / versionCode 119。本版为 1.3.97 / 120。

1.3.96 把宿主从系统音乐卡片搬到了背屏中心 launcher 窗口，架构不变；本版只修**通信链**。
真机回报：`hostConnected=false`、`hostActive=false`、`hostSession` 为空、
`host-fallback=宿主未连接`，独立窗口正常。本版按阶段拆开初始化并把失败原因送到听屿诊断，
不再用一句「请启用小米背屏中心作用域」覆盖所有情况。

---

## 1. 先确认构建：1.3.96 的 APK 确实含有新宿主

对 `app-release.apk` 的 DEX 直接检索（`dexdump`/二进制符号）：

```
Lio/github/huleixin/tingyu/RearHostView;
Lio/github/huleixin/tingyu/RearHostBridge;
Lio/github/huleixin/tingyu/RearHostHooks;
Lio/github/huleixin/tingyu/RearHostPolicy;
Lio/github/huleixin/tingyu/RearHostWebClient;
rearhost.v2
```

`RearHostedCard`、`MusicControlScreenElement`、`music_control` 均不在 DEX 中。也就是说
1.3.96 的构建**已经不含** MAML 卡片代码；`hostConnected=false` 不是「旧 MAML 类挡住了安装」，
而是通信链在某个更早的环节就断了。1.3.97 起每个包都在 `BuildConfig.BUILD_ID` 里写入
`版本@commit[-dirty]`，并随 register/diagnostics 上报，旧包/新包可以直接核对。

## 2. 1.3.96 通信链上的六个断点

`hostConnected=false` 只说明「听屿进程里没有拿到可用 Binder」。1.3.96 的代码里能造成它的
路径有六条，且全部**静默**：

| # | 断点 | 1.3.96 的行为 | 为什么会导致 hostConnected=false |
| --- | --- | --- | --- |
| 1 | 进程名门禁 | `TingyuXposedModule` 要求 `param.processName == 包名` | launcher 若在 `:subscreen` 等进程，模块根本不安装 |
| 2 | 唯一创建点 | 只 hook 隐藏 API `Application.attach(Context)` | 该签名在 ROM 上不可用时 `install()` 直接抛异常，Controller 从未创建 || 3 | 提前 installed | `install()` 第一行 `installed=true` | 即使后续失败，也不会再尝试；日志只留一行「unsupported」 |
| 4 | 接收器权限 | `registerReceiver(..., 签名权限, ...)` 无兜底 | 权限不可见/注册被拒时抛异常，CONNECT 永远收不到 |
| 5 | 没有主动注册 | 只等听屿发 CONNECT 广播 | 广播丢失、接收器晚注册、进程重启都会永久错过 |
| 6 | Provider 可见性 | `content://…rearhost` 没有 `forceQueryable` | Android 11+ 调用方（背屏中心）可能看不到 Provider，`call()` 直接失败 |

另外，1.3.96 的安装是「UI Hook 成功才 `capabilityReady`」，没有把「通信可用」单独记下来，
应用侧无法区分「模块没加载」「加载了但 UI Hook 不兼容」「加载了但 Provider 不可达」。

## 3. 1.3.97 的修法

### 3.1 通信与 UI Hook 分阶段，互不阻断

`RearHostHooks.install(loader, processName)`：

1. **通信阶段**（只依赖 Android 框架类）
   - `hookAllMethods(Application, "attach")`：能挂就挂（更早）；
   - `hookAllMethods(Application, "onCreate")`：**公开方法，必然存在，作为兜底**；
   - 两者都失败才判定 `communication-failed`，记录异常类型、消息与第一帧堆栈，并允许下次调用重试。
   - 成功即 `communicationReady=true`，与 MAML / 音乐卡片 / launcher 类**完全无关**。
2. **UI Hook 阶段**（可选）
   - 三层尝试：`performResume/performPause/performDestroy` → launcher 类声明的
     `onResume/onPause/onDestroy` → `Instrumentation.callActivityOnResume/Pause/Destroy`
     （公开 API，参数直接是 Activity，不依赖子类是否 `super`）；
   - 失败只把 `priority` 降到 1，**仍然注册**，让应用侧看到 `hostConnected=true` 与
     `stage=ui-hooks-failed`，而不是「未连接」。

`installed` 不再提前置位：只有通信阶段成功才算装上；失败会留下 `stage`/`stageError` 并允许重试。

### 3.2 任意进程安装 + 优先级

`TingyuXposedModule` 改为按**包名**匹配，不再要求主进程：

```java
if (RearHostContract.TARGET.equals(param.packageName)) {
    RearHostHooks.install(param.classLoader, param.processName);
}
```

每个进程都会创建一个 Controller 并主动 register，注册包携带：

```
priority  UI Hook 可用=2，仅通信=1；进程内真正见到 SubScreenLauncher 后升到 3 并重新注册
process   真实进程名
stage     communication / ready / ui-hooks-failed / …
error     该阶段的异常 + 调用点
build     版本@commit[-dirty]
```

「见过 launcher」优先于「只是装上了 Hook」：多进程同时加载模块时，听屿要选的是真正在跑
背屏桌面的那个进程，而不是碰巧也装了 Hook 的进程。

应用侧 `RearHostPolicy.acceptRegistration()` 的规则：

- 当前 Binder 已死 → 接受；
- 已有显示会话 → 不换（换 Binder 会让已挂载的宿主视图失去所有者）；
- 否则只接受 `priority >= 当前` 的注册。

### 3.3 主动 register，不再只等广播

Controller 创建后立即 `publish("controller-created")`，CONNECT 广播只是第二次机会。
这样即使广播丢失、接收器晚注册、听屿进程重启，Binder 仍会到达 Provider。

### 3.4 接收器权限兜底

先用签名权限注册（正常路径）；`registerReceiver` 抛异常时，退回**不带权限的导出接收器**，
并记录 warn。安全边界不在广播：广播只触发一次 register，真正的门是 Provider 内的 UID 校验 +
显示会话校验。

### 3.5 Provider 可见性

`RearHostProvider` 增加 `android:forceQueryable="true"`。Android 11+ 的包可见性会拦截
跨应用 `ContentResolver.call`；Provider 内部仍然只接受 `com.xiaomi.subscreencenter` 的 UID。

### 3.6 诊断：真实阶段，而不是统一文案

新增/修改的记录点：

| 位置 | 记录 |
| --- | --- |
| 模块 logcat `TingyuRearHost` | `install begin process=… build=…`、`communication ready attachHooks=… onCreateHooks=…`、`controller created`、`receiver registered …`、`registered with app (…)`、`register failed (why, stage=…)` |
| `RearLyricsTrace` | `host/connect-request`（build、display、connected、handshakeSeen）、`host/register-attempt`（调用 UID、priority、process、stage）、`host/register`、`host/register-ignored`、`host/register-failed`、`host-call-rejected`（UID）、`host/connect-miss` |
| 诊断字段 | `build`、`handshakeSeen`、`hostStage`、`hostProcess`、`hostBuild`，以及原来的 `hostConnected/hostActive/hostSession/hostDetail` |

`hostDetail` 的默认文案改为按证据生成：

- 从没收到 register → `未收到背屏中心宿主 register（build …）：进程未运行、模块未加载到该进程或 Provider 不可达`
- 收到过但 Binder 已死 → `背屏中心宿主连接已断开（build …），等待重新 register`

## 4. 修改文件

| 文件 | 变化 |
| --- | --- |
| `lsp/TingyuXposedModule.java` | 按包名在所有进程安装；传真实进程名 |
| `RearHostHooks.java` | 通信/UI 分阶段；attach+onCreate 双钩；不提前 installed；主动 publish；接收器权限兜底；profile 携带 stage/error/priority/process/build |
| `RearHostBridge.java` | 多进程注册优先级；`handshakeSeen`；按证据生成断线原因；connect-request/miss 记录 |
| `RearHostPolicy.java` | 新增 `acceptRegistration()` |
| `RearHostProvider.java` | register 携带 priority/stage/error/build/process；记录 attempt/rejected/failed 与调用 UID |
| `AndroidManifest.xml` | `RearHostProvider` 增加 `forceQueryable` |
| `app/build.gradle` | `BUILD_ID = 版本@commit[-dirty]` |
| `RearLyricsCoordinator.java` / `FoliaNativePlugin.java` | 诊断输出 build 与 host 阶段 |
| `RearHostPolicyTest.java` | 新增 Binder 选择规则测试 |

## 5. 验证与边界

已执行：

- `:app:testDebugUnitTest`：**880 项、0 失败、0 错误**（`RearHostPolicyTest` 11 项）；
- 宿主子树 `javac`（android.jar + xposed api 82）通过；
- Release APK 用官方密钥（证书 SHA-256 `a36ef2a5…`）签名，versionName 1.3.97 / versionCode 120，
  `BuildConfig.BUILD_ID`（`版本@commit`）在 DEX 中可检索，诊断与 register 上报同一个值；
  具体值以安装包诊断页为准。

未验证（必须真机）：

1. `logcat -s TingyuRearHost` 是否出现 `install begin process=…`。没有 → 模块没有加载到该进程，
   问题在 LSPosed 作用域/进程，不在本版代码。
2. 出现 `controller created` 但听屿仍 `handshakeSeen=false` → 看 `register failed (…, stage=…)`
   的异常：`Unknown authority` 是 Provider 可见性；`Permission Denial` 是 UID/权限；
   `Host protocol mismatch` 是旧模块驻留进程。
3. `hostConnected=true` 但 `hostActive=false` → 看 `hostStage`：`ui-hooks-failed` 表示 launcher
   生命周期 Hook 不兼容（附异常与调用点）；`ready` 则进入视图创建/首帧阶段。
4. 视图创建后仍要验证上滑、相机、AOD、锁屏恢复；这些不在本版握手修复范围内。

## 6. 回滚

本版只动通信初始化与诊断，不触碰 Media3、兼容通道、音源、正面 UI 与歌词舞台。回滚到
1.3.96 只需 revert 本提交；独立窗口回退路径不受影响（握手失败时仍然只走它）。
