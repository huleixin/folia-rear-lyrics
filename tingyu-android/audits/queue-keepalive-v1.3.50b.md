# 后台续播停播复盘（1.3.50 真机第二轮）

真机现场：11:54:09 adopt → 11:55:10 playlist-sync（generation 5→7）→ 11:55:13 activity-stop
→ 11:55:15 起 `97abc.com` 连续三次 `status=-1 / connection closed` → 11:55:24
`queue-replenish accepted=0 removed=1` → 剩余 1→0 → 11:58:19 当前曲播到 252001/252000 →
`queue-exhausted`。

**一句话结论：停播的主因不是网络，是队列被自己的同步删空了。** 网络失败只是让那次窗口
返回空，而"空窗口"被当成了"清空后面"。B（connection closed）是真实存在的第二个问题，
但它只决定"这一轮能不能取到新地址"，不决定"已经准备好的下一首还在不在"。

---

## A. 已接管歌曲被队列同步移除

### A1（主因）空窗口无条件清空当前曲之后的整个队列

`playback/NativeAudioEngine.java` `applyQueue()`，修复前：

```java
int next = player.getCurrentMediaItemIndex() + 1;
int removed = next < player.getMediaItemCount() ? player.getMediaItemCount() - next : 0;
if (next < player.getMediaItemCount()) player.removeMediaItems(next, player.getMediaItemCount());
if (!items.isEmpty()) player.addMediaItems(items);
```

这一行对**任何**窗口都执行，包括 `items` 为空的那种。于是 JS 一次"一首都没解析出来"的
窗口（备用域名全挂、候选全跳过）会先删掉当前曲之后的所有项，再"加 0 首"。
`accepted=0 removed=1` 就是它，`remaining` 1→0 也是它。

而且这与同工程 `QueueLedger` 自己写下的约定直接矛盾：

```java
/** Nobody offered a successor: a legitimate "nothing to add" answer. */
EMPTY,
// "an empty window is a valid answer ('I resolved nothing'), not a refusal."
```

`reconcile()` 确实把空窗口判成 `EMPTY / accepted=true`，注释也写明它只表示"没什么可加"；
问题出在调用方把 EMPTY 当成了"替换为空"。

**修复**：删除/保留的决策抽成纯函数 `playback/QueuePrune.java`，规则两条——
空窗口 `replace=false`（完全不动队列）；非空窗口替换时，**已接管项（`nativeContinuation=true`）
若新窗口没覆盖，必须保留并重新追加**（覆盖则交给新窗口，避免两份）。

### A2 已 adopt 的下一首被"窗口覆盖不到"的同步顺手带走

同一处：即使窗口非空，只要那首歌这次没解析出来（备用域名对它失败），它也会被删掉——
因为它和 JS 窗口项混在同一个 `removeMediaItems` 里，没人区分"谁保证它有地址"。
已接管项是已经拿到可播放地址的，窗口无权删除。

### A3 generation 换代把已经到手的地址作废，导致同一首被重复解析

`playback/BackgroundContinuation.java` `finish()`，修复前：

```java
boolean stale = requestId != activeRequestId
    || generation != NativePlaylist.get().generation()      // ← 一代次不等就丢弃
    || !track.songKey.equals(activeSongKey);
```

`NativeAudioEngine.adoptContinuation()` 里也有同一条件。generation 表达的是"歌单内容变过一次"，
一次普通同步（内容几乎一样）就会 +1，但**播放地址与歌单重排无关**。真机 11:55:10 的
`generation 5→7` 正好撞在解析在飞的时候：结果回来被判 stale 丢弃 → 同一首重新解析 → 撞上
网络失败 → 三次预算用完 → `continuation-giveup`。

**修复**：过期条件改为「请求号变了 / 歌曲身份变了 / **这首歌真的不在逻辑歌单里了**」，
代次只作为诊断字段记录。新增 `NativePlaylist.contains(songKey)` 承担这个判断。
用户换歌单导致歌真的被移出时依然会拒（有测试）。

### A4 已经排进队列的歌被反复解析

`consider()` 只在 `adoptContinuation()` 那一刻查过一次队列，之后每次 tick 都不查。
队列一旦被动过（同步、跳过、A1 的误删），`queueContains` 就查不到，于是同一首被反复
取地址。真机 11:54:09 之后那条 "同一首又被解析 → duplicate" 就是它。

**修复**：`consider()` 在发起解析前查 `host.queueContains(songKey)`，已入队则记
`continuation-skip{already-queued}` 并直接返回，不动预算。

---

## B. 后台原生 HTTP connection closed

### B1 每一跳请求都新建一个 OkHttpClient（含新的连接池与线程池）

`lx/LxHttp.kt`，修复前：

```kotlin
val call = CLIENT.newBuilder()
    .connectTimeout(timeoutMs, ...).readTimeout(timeoutMs, ...)
    .build()                      // ← 每次请求一个新 client
    .newCall(builder.build())
```

OkHttp 的 `Builder.build()` 在未显式给 `connectionPool` / `dispatcher` 时会**各新建一个**。
结果是：每个请求一条全新连接池、一套新线程池（旧的从不 shutdown），
后台每次解析都要重新 DNS + TCP + TLS，无法复用已经验证过的连接；
在 Doze / 后台网络受限的窗口里，握手正是最容易被掐断的阶段。

**修复**：连接池与调度器提成进程级共享（`ConnectionPool(8, 5min)` + `Dispatcher`），
per-request client 只换超时，不再新建池。

### B2 没有默认 UA，脚本没给就露出 `okhttp/4.x`

已实测排除"UA 风控"这一项：对 `https://www.97abc.com/count.php` 分别用
`okhttp/4.12.0` 与移动 Chrome UA 请求，**都是 200**（0.27s / 0.05s）。所以 UA 不是这次
connection closed 的原因，但仍按"与 WebView 侧同源"的原则补上系统 UA（脚本显式给的一律优先）。

### B3 只有 `status=-1`，看不出是谁关的连接

`LxScriptEngine.http()` 的 catch 只做了 `hooks.http(host, -1, 0)`。本地取消、对端 RST、
DNS 失败、TLS 中断、读超时**全部落到同一个 -1**，真机报告无法区分。这正是你要求
"捕获实际 IOException 类型、请求取消原因"的缺口。

**修复**：新增 `lx-http-error` 事件，记录 `type / cause / message（脱敏）/ method / host /
elapsedMs`；`LxRuntimeHost.snapshot()` 增加 `lastHttpError / lastHttpErrorAgeMs`，
报告里单列 `lx last http failure:` 一行。

### B4 关于"Activity onStop 是否取消请求"——目前**没有**证据

代码层面：`LxHttp.request()` 跑在 `withContext(Dispatchers.IO)` + `Call.execute()`，
不持有 Activity、WebView、Capacitor 插件实例的任何引用；引擎归 `FoliaPlaybackService`
（`LxRuntimeHost.attach(service)`），没有任何 `cancel()` 挂在 Activity 生命周期上。
**因此本轮不认定"Activity onStop 导致请求取消"，也不认定"系统杀后台"** ——
这一点要等 B3 的异常类型真机落地后再判。三种候选（对端 RST / 系统后台网络限制 / 本地
超时）在报告里会被 `type`+`cause`+`elapsedMs` 直接区分开。

---

## 新增诊断（对应你列的五条）

| 要求 | 落点 |
|---|---|
| 队列增删前后的 MediaItem ID、来源、generation | `queue-diff{before,after,removed,preserved,added,droppedFirst,droppedAdopted,addedFirst,generation,source}` |
| 被移除歌曲的明确原因 | `queue-replenish{removed,preserved,emptyWindow}` + `queue-diff.droppedAdopted`；`adoptContinuation` 拒绝时 `reason=dropped-from-playlist` |
| 已 adopt 的歌曲为什么再次 fetch | `continuation-skip{reason=already-queued}` |
| HTTP 取消/断开的异常来源 | `lx-http-error{type,cause,message,elapsedMs}` + 报告 `lx last http failure` |
| 后台已准备好的歌曲是否仍能播 | 报告新增 `native queue: adoptedAhead=` 与 `queueLastPreserved` |

报告新增两行（第一屏可见）：

```
native queue: items=N index=N remaining=N generation=N adoptedAhead=yes|no
native queue last sync: removed=N preserved=N added=N droppedAdopted=<anon> addedFirst=<anon> ageMs=N
```

---

## 测试

新增 `app/src/test/java/.../playback/QueuePreservationTest.java`（8 项）：

1. 空窗口不删队列（对应 `accepted=0 removed=1`）；
2. 窗口覆盖不到时已接管项被保留；
3. 窗口已覆盖时去重，不出现两份；
4. JS 窗口项仍按正常换代替换；
5. 已入队的歌不重复解析；
6. generation 换代不作废已解析地址；
7. 歌真的被移出歌单时仍拒绝；
8. **验收场景**：接管 → 同步换代次 → 网络全失败 → 已备好的下一首仍在且能接着播。

```
JVM 335/335 通过（原 327 + 新增 8）
vitest 12/12；tsc --noEmit 0 错
```

---

## 交付物

`deliverables/Tingyu-Android-v1.3.50-queue-keepalive.apk`
（版本号未改，仍 1.3.50/74；签名 `CN=Tingyu` 不变，可覆盖安装；dex 内已校验
`continuation-skip / already-queued / dropped-from-playlist / lx-http-error /
queueLastPreserved / queue-diff`）

## 仍未完成

- **真机锁屏连播 ≥10 首未验证**：本机 adb 无设备连接，这一步只能由你复现。
- A1 的修复保证"已备好的下一首不会被同步删掉"，但**不保证"下一轮一定能解析出新的"**；
  如果 B 的 connection closed 是系统级后台网络限制，长锁屏仍可能在窗口耗尽后停。
  届时报告里的 `lx last http failure` 会直接给出判定依据。
