# 听屿 1.3.98：证明背屏中心模块是否真的运行（ping 探针）

基线：1.3.97 / versionCode 120。本版为 1.3.98 / 121。

本版不碰歌词渲染、音乐卡片、宿主布局，只解决一个问题：**为什么背屏中心没有调用
`RearHostProvider.register`**。1.3.97 把失败阶段写进了 register 包，但如果 register 根本
没有发生，应用侧拿到的仍然是 `handshakeSeen=false / priority=-1 / process 空 / stage 空`。
需要一个**不经过 ContentProvider、不经过 Binder** 的独立通道来证明模块是否在该进程运行。

---

## 1. 这次真机日志说明了什么

```
host/connect-request        build=1.3.97@86492354, display=1, connected=false, handshakeSeen=false
（902ms 后）
host/connect-miss           handshakeSeen=false, priority=-1, process=, stage=, error=, ping=<none>
host-fallback=宿主未连接
```

- 应用侧**确实发出了** CONNECT 广播（connect-request 有记录）；
- 没有任何 `host/register-attempt` → `RearHostProvider.call()` 从未被调用；
- `priority=-1 / process 空 / stage 空` 说明 `RearHostBridge.connect()` 从未执行，不是「注册被
  拒绝」，是**更早的环节没有发生**。

因此问题只可能在这三段之一：

1. 模块没有被 LSPosed 注入到背屏中心的**真实进程**；
2. 注入了，但 `Application.attach/onCreate` 没有回调，Controller/Receiver 没创建；
3. Receiver 创建了，但广播没送达。

`hostConnected=false` **不能**直接等同于「没有勾选作用域」。

## 2. APK 入口核验（1.3.97 构建，实际执行）

| 检查 | 结果 |
| --- | --- |
| `assets/xposed_init` | 存在，内容 `io.github.huleixin.tingyu.lsp.TingyuXposedModule` |
| `xposedmodule` / `xposedminversion` | `true` / `82` |
| `xposedscope` 资源 | `["android", "com.xiaomi.subscreencenter"]` |
| DEX | `TingyuXposedModule`、`RearHostHooks`、`RearHostProvider` 均存在 |
| 签名 | 官方证书 `a36ef2a5…` |

入口与作用域打包正确，所以 1.3.98 的重点是「运行时到底走到哪一步」，而不是再改入口。

## 3. 新增：有序广播 ping（不经过 Provider）

### 3.1 模块侧

1. **最早入口日志**（`TingyuXposedModule.handleLoadPackage` 第一行）：

   ```
   TingyuRearHost: handleLoadPackage pkg=… process=… build=1.3.98@…
   ```

   同时写 logcat（tag `TingyuRearHost`）和 LSPosed 日志。没有这一行 = 模块没被注入；
   只有 `pkg=android` = 只注入了系统框架。

2. **进程内最早可执行点注册 ping 应答器**（`ensurePing`，在 Controller 之前）：

   ```java
   pingReceiver = new BroadcastReceiver() {
       onReceive: setResultCode(1);
       setResultData("build=…;process=…;stage=…;controller=yes|no;register=<last error>;error=…");
   };
   registerReceiver(pingReceiver, PING, exported);
   ```

   它不依赖 Controller 创建成功，也不依赖 Provider/UID/Binder。即使后面 `register` 抛异常，
   听屿仍能通过 ping 拿到这个进程里的模块构建标识、阶段，以及**最近一次 register 失败的
   异常摘要**——Provider 不可达时这是唯一能读到最后错误的通道。

3. 普通 logcat 与 LSPosed 日志双写，`adb logcat -s TingyuRearHost` 即可取证。

### 3.2 应用侧

`RearHostBridge.probeModule()` 在 CONNECT 之前发一条**有序广播**
`<pkg>.rearhost.PING`，结果接收器读 `getResultCode()/getResultData()`：

- 有回答 → 模块确实运行在该进程，回答里带 `build/process/stage/controller/error`；
- 无回答（`result=0`，数据为空）→ 该进程里没有任何模块代码在监听。

结果写入 `RearLyricsTrace` 的 `host/ping`，并进入 `hostDetail` 与诊断字段 `ping`。

### 3.3 怎么读结果

| ping 应答 | register | 结论 | 下一步 |
| --- | --- | --- | --- |
| 无 | 无 | 模块未在背屏中心进程运行：作用域未生效、进程名不符，或**覆盖安装后旧进程仍驻留旧模块** | 重启背屏中心/手机；看 `handleLoadPackage` 日志 |
| 有 | 无 | 模块已运行，register 链路失败 | 看 ping 里的 `stage/error` 与 `host-register-attempt/failed` |
| 有 | 有 | 握手成功 | 进入视图创建/首帧阶段 |
| 无 | 有 | 同进程内不可能 | 视为时钟/进程错乱，保留日志 |

`controller=no` 表示 attach/onCreate 回调没跑到 Controller；`controller=yes` 表示
Controller 已创建，此时 register 失败要看 `stage/error`（`ui-hooks`、Provider 可见性、UID、协议）。

## 4. 覆盖安装与进程重启（必须核实）

LSPosed 只在**进程启动时**把模块代码加载进目标进程。覆盖安装 APK 后：

- 背屏中心如果一直在运行，它仍然执行**旧版本**的模块代码（1.3.95 的旧实现会在 MAML 类
  不兼容时连 Receiver 都不注册，正是本次现象）；
- 必须让 `com.xiaomi.subscreencenter` 进程重启，或直接重启手机，才会载入 1.3.98；
- 重启后 ping 的 `build=` 必须等于当前 APK 的构建标识，否则仍是旧代码。

可选命令（需要 adb/root 环境）：

```bash
adb shell am force-stop com.xiaomi.subscreencenter
# 或直接重启手机
```

本版没有加入「由听屿强制杀死背屏中心」的能力：LSP 模式下没有这个权限，强行做只会引入
新的抢屏/权限问题。

## 5. 其他改动

- `register` 失败只重试一次（1.5s 后），用于覆盖「听屿进程正在启动、Provider 尚未就绪」的
  瞬时失败；不做无限重试。
- 诊断新增 `ping` 字段；`hostDetail` 按 evidence 生成，不再统一显示「请启用作用域」。

## 6. 修改文件

| 文件 | 变化 |
| --- | --- |
| `lsp/TingyuXposedModule.java` | 最早入口记录包名/进程/build |
| `RearHostHooks.java` | `ensurePing` 先于 Controller 注册；logcat+Xposed 双写；register 单次重试 |
| `RearHostContract.java` | `PING` action |
| `RearHostBridge.java` | 有序广播探针、`ping` 证据、断线原因分级 |
| `FoliaNativePlugin.java` | 状态输出 `hostPing` |
| `docs/…1.3.97.md` | 指向本版 |

## 7. 真机验收顺序（本版只到第 4 步）

1. 安装 1.3.98，**重启手机或 force-stop 背屏中心**；
2. `adb logcat -c && adb logcat -s TingyuRearHost`；
3. 观察是否出现 `handleLoadPackage pkg=com.xiaomi.subscreencenter process=… build=1.3.98@…`；
4. 开启背屏歌词，诊断里看 `handshakeSeen`：
   - `ping` 有数据但 `hostConnected=false` → 把 `ping` 的 `stage/error` 与 `host-register-failed`
     一起导出；
   - `ping` 为空 → 模块未在该进程运行，回到第 1 步确认进程重启与构建标识；
5. 只有 `hostConnected=true` 后才继续视图创建、首帧、上滑、相机、AOD 的验收。

## 8. 边界

- 探针只返回构建标识/进程/阶段/异常摘要，不含歌词、播放、账号或文件数据；
- 不修改 Media3、兼容通道、音源、歌词舞台与独立窗口；
- 不通过放宽 UID/session 校验换取连接；Provider 的安全门不变。
