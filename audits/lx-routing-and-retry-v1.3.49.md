# 1.3.49：洛雪脚本交付 / 音源路由 / 有界重试 —— 真机 1.3.48 故障的定点修复

分支 `native-bg-playback`，worktree `folia-native`，未合并 main。
本轮不做架构重构、不重写 QuickJS、不动灵动岛与背屏相机。

## 0. 真机证据（1.3.48，2026-10-30 17:46）

```text
native ledger: size=394 mode=shuffle knowsCurrent=yes
native continuation: last=wait_for_js resolving=no takeovers=0 fallbacks=0 failures=187
native resolvers: lx-native,qq,lx-script
native source: provider=qq lxSource=tx resolver=qq        ← 路由错
lx engine: installed=yes started=no sources= requests=0    ← 引擎从未被拉起
    09:45:41 continuation-failed song=47d37f64 status=failure reason=musicu returned no playable url requestId=168
    …（同一首歌，每 1.5 秒一次，共 187 次）
```

## 1. 为什么 `sources=` 是空的

`LxRuntimeHost.snapshot().sources` 读的是**已启动引擎**的能力表
（`engine?.capabilities?.keys`）。1.3.48 里 `LxNativeResolver` 从没被选中
（见第 2 节），于是 `LxRuntimeHost.resolve()` 一次都没被调用，
`ensureEngine()` 也就永远不会被触发 —— 引擎没起，能力表自然是空字符串。

**空 `sources=` 是"解析器没被选中"的结果，不是"脚本不支持这个平台"。**

## 2. 为什么 `lxSource=tx` 却选了 `resolver=qq`

`ResolverRegistry.forProvider("qq")`（1.3.48 的真实选路）只做一件事：
按注册顺序问 `supports(providerId)`。

| 解析器 | `supports("qq")` 在真机那一刻的取值 | 原因 |
|---|---|---|
| `LxNativeResolver` | **false** | `capabilitiesFor("qq")` 读的是引擎能力表，引擎没起 → null |
| `QqResolver` | **true** | 硬编码 `"qq".equals(providerId)`，与能不能取到地址无关 |

于是 `qq` 被 QQ 匿名 musicu 认领；而上一轮已经实测过
（5 个真实 songmid × M500/M800/F000/C400/RS01 × 8 组参数）：
HTTP 200、`code=0`，`midurlinfo[0].purl` 恒空、`result=104003` —— 取不到地址。
**失败 → `rearmSupervision()` → 1.5 秒后再来一次** → 187 次。

第二层问题（同文件内）：即便路由选中了 lx-native，`resolve()` 的第一件事又是
`capabilitiesFor(providerId)`，为空就直接 UNSUPPORTED ——
**能力表只有引擎起来之后才有，所以原生洛雪链路永远走不到执行脚本那一步。**

## 3. 改动清单（定点，不含重构）

| 文件 | 改动 | 解决什么 |
|---|---|---|
| `resolver/ResolverRegistry.java` | 新增 `forTrack(Track)`：**先看这首歌的链路，再看身份**。平台有对应洛雪源（qq→tx…）→ 由 lx-native 认领；脚本没装且用户也没配可用后端时仍返回 lx-native，让它说出 `SCRIPT_NOT_INSTALLED`，绝不静默换 musicu。`canResolveNatively` 同步改用 forTrack，并要求 lx 真的有脚本、QQ 真的有可用通道 | 第 2 节路由错误 |
| `resolver/LxNativeResolver.java` | `resolve()` 顺序倒过来：先 `LxRuntimeHost.prepare()`（拉起引擎 + 取能力表），再判能力；新增 `SCRIPT_NOT_INSTALLED` / `SOURCE_NOT_READY` 两种明确状态；新增 `isLxTrack` | 第 2 节第二层问题 |
| `lx/LxRuntimeHost.kt` | 新增 `warmUp()`（前台导入脚本即预热）、`prepare()`、`lastInitError()`；`release()` 清失败冷却；诊断与返回原因统一 `redact()`（抹掉 URL/换行） | `started=no` 与敏感信息 |
| `playback/TingyuPlaybackPlugin.java` | `setLxScript` 后在守护线程预热，并记录 `lx-script-sync{installed,started,sources,bytes}`；换脚本时 `resetBudgets()`；回执带 `installed` | 同步可追踪确认 |
| `playback/BackgroundContinuation.java` | 新增按「歌曲+解析器」的有界预算：UNSUPPORTED 一次都不重试；其余最多 3 次，退避 5s/20s/60s；用完即熔断该首并停止排程；`rearmSupervision(delayMs)` 取代固定 1.5s；快照新增 `budgetBlocked/budgetTracked/budgetMax` | 187 次失败风暴 |
| `playback/NativeAudioEngine.java` | `rearmSupervision(long)`；诊断 `songResolver` 改用 `forTrack`，新增 `songResolvable` | 诊断说真话 |
| `resolver/QqResolver.java` | `backendUsable()` / `canAttempt()`；匿名 musicu 连续 3 次空结果熔断 15 分钟（`musicu circuit open`），自建后端不受影响 | 空转流量 |
| `src/services/lxNativeScriptSync.ts` | 记录 `readLxNativeSyncState()`（installed/error），启用却没装上时告警（不记脚本内容） | 同步可追踪确认 |
| `src/hooks/useNativeQueuedPlayback.ts` | 同步依赖加 `lx`（切换脚本立刻下发） | 切换/删除同步 |

## 4. 路由规则（修复后）

1. `lxSource` 非空的歌（qq/netease/kugou/kuwo/migu 以及 `lx-*`）→ **lx-native**。
2. 没装脚本 + 用户配了可用的 QQ 自建后端 → QqResolver（后端通道，不走匿名 musicu）。
3. 没装脚本 + 没可用后端 → lx-native 返回 `SCRIPT_NOT_INSTALLED` → **FALLBACK_TO_JS**，
   不重试、不静默换解析器。
4. 装了脚本但脚本没声明这个平台 → `SOURCE_NOT_READY`（UNSUPPORTED）。
5. 本地 / Navidrome / 舞台来源完全不受影响。

## 5. 测试（新增 12 项，全量 317/317 通过）

`android/app/src/test/.../resolver/ResolverRoutingTest.java`（7 项）

- A：`provider=qq` + 脚本已装 → `forTrack == lx-native`，`canResolveNatively == true`
- A′：`providerId=lx-tx` → lx-native
- B：脚本未装 → `UNSUPPORTED`，reason 含 `SCRIPT_NOT_INSTALLED`，且 `canResolveNatively == false`
- F：配了真实 http 后端 + 没装脚本 → 仍是 `qq`（不回归）
- F：`base=extension` 不算可用后端 → 回到 lx-native
- F：`navidrome` 仍走自己的解析器
- musicu 熔断：3 次空结果后 `canAttempt()==false`，期间连请求都不发

`BackgroundContinuationTest`（新增 3 项）

- D：JS 全程沉默（600s）、预存 2 首 → 第 3、4、5 首由原生逐个解析并采纳（每个边界 1 次，不靠加大预取）
- E：永久失败的解析器 → 同一首最多 3 次（实测 ≤3），之后熔断，不再排程
- E′：UNSUPPORTED 一次都不重试（`engine.rearms == 0`）

`test/unit/services/lxNativeScriptSync.test.ts`（新增 2 项，共 8）

- 同步结果可查（`installed=true`）；桥失败时记录 `installed=false + error`，不静默

回归：317 项 JVM 单测全绿；`tsc` 无错；`lx-probe` 用真实公开脚本 + 真实网络 12/12
（`206 audio/mpeg`，1 字节 Range 校验）。

## 6. 仍然没有做的事

- **真机 Media3 接管未验证。** 我没有小米 17 Pro，也没有你导入的那份脚本。
  上面的"通过"是路由/预算/引擎三层的自动化测试，**不是真机续播证据**。
- **灵动岛（阶段 C）一行未改。**
- 若你的脚本用了 `rsaEncrypt` / `fetch` / `TextEncoder` / multipart，原生仍会明确报
  `SOURCE_NOT_READY` 或不兼容，而不是假装成功 —— 真机诊断里 `lx engine: lastError=` 会写出来。

## 7. 真机最短取证

1. 覆盖安装 1.3.49（签名不变），前台确认洛雪源已启用 → 立刻导出一次报告，应看到
   `lx engine: installed=yes started=yes sources=tx,...`
   （若 `started=no`，看 `lx engine: lastError=` 与 `lx-warmup` 记录）。
2. 锁屏连播跨过第 3 首。
3. 导出报告，只看四行：
   - `native source: provider=qq lxSource=tx resolver=lx-native nativeReady=yes`
   - `lx engine: ... requests>0 ok>0 failed=0`
   - `native continuation: last=take_over takeovers>0 failures=0 blocked=0/3`
   - 是否存在 `continuation-adopt → continuation-ready → continuation-completed`
4. 若出现 `blocked>=1` 或 `last=fallback_to_js`，说明路由到了但脚本侧取不到 ——
   需要你提供脚本名/来源（不要提供脚本内容），我再对具体脚本做兼容层。
