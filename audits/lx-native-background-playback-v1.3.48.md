# 1.3.48：把洛雪音源搬到 Service 侧执行（阶段一 · 音乐）

分支 `native-bg-playback`，worktree `folia-native`，APK `deliverables/Tingyu-Android-v1.3.48-lx-native.apk`。

## 0. 两条独立结论（先说结论，再说证据）

### 结论 A：lx:tx 这条链路 —— 本轮才第一次被原生真正覆盖

| 项 | 1.3.47 | 1.3.48 |
| --- | --- | --- |
| `provider=qq / kind=lx:tx` 由谁取地址 | WebView Worker（后台被冻结 → 停播） | **Service 进程里的 QuickJS**（`LxScriptEngine`） |
| 洛雪脚本能否被原生执行 | 明确标记 UNSUPPORTED | 能：真实脚本 + 真实网络实测 12/12 |
| 引擎归属 | 无 | 播放进程（`LxRuntimeHost.attach()` 拿 applicationContext） |
| MainActivity 重建 / WebView 冻结的影响 | 致命 | 无（引擎不在 Activity 里） |

**但**：真机未验证。本轮的"通过"全部来自非真机证据（JVM 上的真实 QuickJS + 真实脚本 + 真实网络 + HTTP Range 播放性校验）。**不宣称真机修复。**

### 结论 B：QQ 原生匿名 musicu —— 实测取不到地址，不能作为洛雪的替代

- 请求：`POST https://u.y.qq.com/cgi-bin/musicu.fcg?format=json`，`vkey.GetVkeyServer / CgiGetVkey`。
- 实测（5 个真实 songmid × M500/M800/F000/C400/RS01 × 8 组参数与 comm 变体）：
  **HTTP 200、`code=0`，但 `midurlinfo[0].purl` 恒为空，`result=104003`**（老接口 `fcg_music_express_mobile3.fcg` 同样 104003）。
- 所以"匿名 musicu 能出地址"在本环境不成立。它不能替代洛雪脚本，也不能声称覆盖用户的故障链路。
- 附带修掉的一个真实缺陷：`ResolverRegistry` 的构造器只注册 `LxScriptResolver`，`QqResolver` 只在 `setResolverCredentials()` 里补注册，而正式包 `VITE_QQ_API_BASE=extension` → `readQqNativeResolverConfig()` 返回空 → 该方法**永远不会被调用** → `forProvider("qq")` 恒为 null。也就是说：**即使匿名 musicu 可用，1.3.47 的 QQ 链路在真机上也从来没有生效过。**

## 1. 为什么上一轮没有覆盖故障链路（根因，逐条可复核）

1. `provider=qq kind=lx:tx` 里，`provider=qq` 是歌曲身份，`kind=lx:tx` 只是诊断标签（来自 `lxSource/playback.ts` 的 `kind: 'lx:' + resolved.source`）。真正取地址的是 **用户导入的洛雪脚本**（`LxRuntime` → QuickJS Worker）。
2. 1.3.47 的 `LxScriptResolver.supports("lx-*")` 只对 `lx-` 前缀返回 true；`qq` 落到 `forProvider("qq")` → null（见结论 B 的注册缺陷）→ UNSUPPORTED → `BackgroundContinuation` 走 `FALLBACK_TO_JS` → 回到被冻结的 JS → **停播依旧**。
3. 于是 1.3.47 的"原生续播"只在"用户配置了真实 http(s) QQ 后端"时才可能成立；而正式包是 `extension` 桥，原生侧无法使用。

## 2. 本轮改了什么

### 新增（原生侧，Kotlin）

| 文件 | 作用 |
| --- | --- |
| `lx/LxBootstrap.kt` | 宿主环境 shim（JS 侧）：`lx.on/send/request/utils.buffer/utils.crypto`、`setTimeout`、`btoa/atob`、`console` |
| `lx/LxUtility.kt` | `md5 / AES-128(256)-CBC(ECB)+PKCS7 / randomBytes / buffer↔string(utf8,hex,base64)` |
| `lx/LxHttp.kt` | `lx.request` 的 OkHttp 实现，规则与 `lxSource/http.ts` 对齐（禁 cookie/host/origin 头、公网 http(s) 白名单、≤5 跳重定向且跨域剥授权头、请求 ≤1MB / 响应 ≤2MB、超时 1–30s） |
| `lx/LxScriptEngine.kt` | QuickJS 引擎封装：单线程守护线程、内存 64MB / 栈 256KB、evaluate 超时、按 id 认领结果 |
| `lx/LxPlatform.kt` | provider→平台映射（qq→tx 等）、音质降级、`musicInfo` 构造（与 `buildLxMusicInfo` 同字段）、能力表校验 |
| `lx/LxRuntimeHost.kt` | 进程级宿主：脚本落盘 `filesDir/lx-source/active.json`、引擎懒启动/换脚本作废/停止播放释放、诊断埋点 |
| `resolver/LxNativeResolver.java` | 真解析器：拼 musicInfo → 调脚本 → 校验公网 URL → `SourceResolution.ok` |

### 关键设计取舍（与 WebView Worker 版的差异）

- **HTTP 不再走"脚本发消息 → 宿主回投"**，而是把 `lx.request` 实现为原生 async 函数，直接返回 Promise。原因：后台线程里无法安全重入 QuickJS；引擎在 `evaluate` 内部等 Promise 落地即可。
- `setTimeout` 走同一个 async 函数；`clearTimeout` 仍按 id 取消。
- 结果不靠 `evaluate` 的返回值，而由脚本在 `.then` 里 `emit`，宿主按 id 认领 —— 与洛雪协议一致。
- 脚本**不接触**：文件系统、进程、Android Context、反射、任意算法名、本应用任何凭据。

### 接入点

- `FoliaPlaybackService.onCreate()` → `LxRuntimeHost.attach()`（applicationContext，Activity 无关）。
- `TingyuPlaybackPlugin.setLxScript()` ← `src/services/lxNativeScriptSync.ts`（store 变化即同步，不等播放）。
- `NativeAudioEngine`：stop / release 时 `LxRuntimeHost.release()`；快照新增 `songSourceType / songLxSource / songResolver / lx*`；新增 `continuation-ready`（Media3 真的 READY）与 `continuation-completed`（位置播到时长）两条"真播放"证据。
- `ResolverRegistry`：默认注册 `LxNativeResolver`；`forProvider` 两轮（真支持 → 值得试一次），避免"引擎还没起来"被误判成"音源不支持"。

## 3. 证据

### 真实脚本 + 真实网络 + 真实引擎（`tools/lx-probe`）

引擎源码**与 APK 共用同一份**（probe 的 `build.gradle` 直接把 `android/app/src/main/java/.../lx` 当 sourceDir，排除 `LxRuntimeHost.kt`），QuickJS 换成 JVM 变体。

脚本：`1010-mobile.js`（公开的真实洛雪**手机版**音源，声明 `wy/tx/kw/kg/mg`；用户自己的脚本不在仓库内）。

```
capabilities: {wy=[flac,320k,128k], tx=[flac,320k,128k], mg=[320k,128k], kw=[...], kg=[...]}
== musicUrl: source=tx type=320k ==
#1..#12 OK host=ws.stream.qqmusic.qq.com / api.liuyunidc.cn
        probe=206 type=audio/mpeg range=bytes 0-0/960887
== summary: 12/12 playable ==
```

每条都用 1 字节 Range 请求验证过：HTTP 206、`audio/mpeg`、有确定长度 —— **不是"拿到一个字符串就算成功"**。

### 单元测试

- Android JVM：新增 `LxEngineTest`（12 项：md5 基准向量、buffer/string 互转、AES 往返、平台映射 `qq→tx`、音质降级、能力表过滤 `192k`、`musicInfo` 身份字段、HTTP 边界拒绝 `127.0.0.1/localhost/内网/file/userinfo`）。全量 `testDebugUnitTest` 通过（含既有 295 项）。
- 前端：`test/unit/services/lxNativeScriptSync.test.ts` 6 项通过；`tsc --noEmit` 无错。

### 构建与签名

- `assembleRelease` 成功（不是只 compileJavaWithJavac）；`versionName=1.3.48 / versionCode=72`。
- 签名：CN=Tingyu, SHA1 `9D:F0:3C:FB:...`，与既有版本一致 → 可覆盖安装，不清数据。
- `lib/arm64-v8a/libquickjs.so` 已在 APK 内；APK 36.8MB（较 1.3.47 +3.3MB，即四个 ABI 的 QuickJS）。

## 4. 支持 / 不支持

**支持**：`lx.EVENT_NAMES`、`lx.on('request')`、`lx.send`、`lx.request(url, options, callback)`（回调式与 await 式都可用）、`lx.utils.buffer.from/bufToString`、`lx.utils.crypto.md5/randomBytes/aesEncrypt(aes-128-cbc/ecb, aes-256-cbc/ecb)`、`setTimeout/clearTimeout/setInterval`、`btoa/atob`、`JSON/Promise/async/await`。

**不支持（与洛雪移动版一致地抛错，不静默）**：`rsaEncrypt`、`multipart/form-data`、Node `fs/net/child_process`、`fetch`、`TextEncoder`、`Buffer`、DOM。脚本若用到这些，初始化或取链会失败，诊断里会出现 `lx-init-failed` 或 `lx-failed` 并带 `reason`。

**资源边界**：内存 64MB（24MB 时真实脚本第 5 首 OOM，已实测并上调）、栈 256KB、单次 evaluate 超时（init 20s / 取链 45s）、HTTP 单请求 ≤1MB 响应 ≤2MB、并发由引擎串行化、无定时器/唤醒锁/心跳。

**已知功耗注意**：1010 脚本自身会对取到的直链做"可播放性预检"，等于**每首额外下载约 1.5MB**。这是脚本行为，不是本轮引入的后台机制；若用户脚本同样如此，后台连续播放的流量与电量会高于纯播放器直连。真机验证时需实测。

## 5. 真机取证步骤（最短）

1. 覆盖安装 `Tingyu-Android-v1.3.48-lx-native.apk`（签名一致，数据保留）。
2. 前台：设置里确认洛雪音源处于启用状态 → 播放若干首 QQ 歌曲（等待出现 `lx-install` 事件）。
3. 锁屏，连续播放到第 3 首之后（跨越原生预存 URI 耗尽点）。
4. 导出诊断报告，只看这几行：
   - `native source: provider=qq lxSource=tx resolver=lx-native`
   - `lx engine: installed=yes started=yes sources=... requests=N ok=N failed=0 lastHost=... lastError=none`
   - `native continuation: last=take_over takeovers=N fallbacks=0 failures=0`
   - 存在 `continuation-adopt` → `continuation-ready` → `continuation-completed`（证明 Media3 真的播完了原生给的那一首）
5. 若 `resolver=lx-native` 却 `lx-failed`，看 `reason`（缺宿主 API / 超时 / 脚本内部错误）与 `lx-init-failed`。

## 6. 本轮没有做的事

- **灵动岛（阶段二）未开始**，一行歌词逻辑都没改。
- **真机未验证**：没有小米 17 Pro，也没有用户的那份脚本。12/12 是在开发机上用真实 QuickJS + 真实公开脚本 + 真实网络跑出来的，不是真机 Media3 播放证据。
- 未修改：背屏相机、Shizuku、LSP、背屏电源状态机、Folia 歌词舞台、无关 UI。
- 未合并到 main；分支 `native-bg-playback` 保留。
