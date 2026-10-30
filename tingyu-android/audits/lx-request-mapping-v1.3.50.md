# 1.3.50 洛雪音源「原生请求被发成 GET」故障审计

分支 `native-bg-playback`，Worktree `folia-native`，未合并主分支。

---

## 一、结论：同一首歌 WebView 成功而原生失败的具体原因

**服务端要求 POST，原生发成了 GET。**

`musicserver.haitangw.cc/v1/music/resolve-url` 是 **POST-only** 路由：

```
GET  https://musicserver.haitangw.cc/v1/music/resolve-url
 → 404 {"message":"Cannot GET /v1/music/resolve-url","error":"Not Found","statusCode":404}
POST https://musicserver.haitangw.cc/v1/music/resolve-url   （空 body）
 → 400 {"message":["source must be …","rid must be …","level must be …"]}   ← 明确要求 source/rid/level
```

脚本（长青SVIP音源(二改修复版) v1.2.0）发出的确实是 POST + JSON 体，
但**原生侧把整个 options 丢掉了**，于是退化成"默认 GET + 无请求体"。

丢在哪一层（实测，不是推断）：quickjs-kt 把 JS 对象交给 Kotlin 宿主函数时用的是
`com.dokar.quickjs.binding.JsObject`（它实现 `Map`，**不是** `org.json.JSONObject`）；
而 `LxScriptEngine.http()` 只认 `JSONObject`，其余一律 `else -> JSONObject()` 静默变空：

```text
[type probe] arity=2
  [0] java.lang.String  = https://example.invalid/a
  [1] com.dokar.quickjs.binding.JsObject@aaa3c7a8      ← 不是 JSONObject → 整包被丢
```

**为什么上一轮的 1010 脚本没暴露这个问题**：1010 只用 GET + query 参数，
options（method/body）丢了也不影响结果；长青这类 POST+JSON 体的脚本才会立刻炸。

### 修复前后的真实请求对比（同一脚本、同一首歌 `0039MnYb0qxYhV`、tx、320k）

| | 修复前（原生实测） | 修复后（原生实测） | WebView 侧实测 |
|---|---|---|---|
| HTTP 方法 | `GET` | `POST` | `POST` |
| Host / Path | musicserver.haitangw.cc `/v1/music/resolve-url` | 同左 | 同左 |
| query 参数名 | 无 | 无 | 无 |
| Content-Type | （空） | `application/json` | `application/json` |
| 请求体形状 | （空） | `level:str(6), rid:str(14), source:str(2)` | 完全一致 |
| 宿主收到的 options 键 | **空** | `body,headers,method,timeout` | — |
| 服务端响应 | 404 `Cannot GET /v1/music/resolve-url` | 201 | 201 |
| 最终结果 | 失败，giveup | 206 audio/mpeg | 206 audio/mpeg |

（请求体只记键名与值类型，真实取值已脱敏。）

---

## 二、双引擎对照（新工具 `tools/lx-compare`）

同一份 musicInfo（由原生侧导出后喂给两端，保证"同一首歌的同一个身份"），
两端各自跑真实脚本 + 真实网络，逐字段对照：

```
-- 逐字段对照 --
   #1 一致  GET  13413.kstore.vip/lxmusic/changqing.json      （脚本取配置）
   #2 一致  GET  www.97abc.com/count.php                       （脚本计数）
   #3 一致  POST musicserver.haitangw.cc/v1/music/resolve-url  （取播放地址）
   结果一致性：一致（webview ok=true / native ok=true）
== 对照结论：两端一致 ==
```

即：**不是服务端故障，也不是脚本问题，是原生宿主适配层的锅**。
若哪天两端同时 404，那才是脚本服务器的问题——现在这个工具能直接给出答案。

### 端到端（真实脚本 + 真实网络 + 原生引擎，5/5）

```
#1 0039MnYb0qxYhV  晴天/周杰伦      OK host=isure.stream.qqmusic.qq.com 206 audio/mpeg 10,792,943 B
#2 003aAYrm3GE0Ac  稻香/周杰伦      OK 206 audio/mpeg 8,941,053 B
#3 004Z8Ihr0JIu5s  七里香/周杰伦    OK 206 audio/mpeg 11,970,297 B
#4 004Fs2FP1EvZYc  晴天(演唱会)     OK 206 audio/mpeg 9,993,618 B
#5 001398Rf3gykz8  晴天(Live)       OK 206 audio/mpeg 11,976,856 B
== summary: 5/5 playable ==
```

每首用 1 字节 Range 请求确认真的出音频流，不下载整首。**用的就是用户当前脚本本身**
（`长青SVIP音源(二改修复版) v1.2.0`，能力表 `wy,tx,kg,kw`，与真机诊断完全一致），
不是 1010 测试脚本。

---

## 三、改了什么（只碰宿主适配层）

1. `lx/LxBootstrap.kt`：`lx.request` 先把 options `JSON.stringify()` 再交给宿主 ——
   语义与 WebView 侧把 options 交给 CapacitorHttp 时的桥序列化一致。
2. `lx/LxJson.kt`（新增）：JS→Kotlin 的值转换，三条输入都能落地：
   JSON 文本 / `JsObject`(Map) / `JSONObject`，**任何一条都不再静默变空**。
3. `lx/LxScriptEngine.kt`：`http()` 改用 `LxJson.toJsonObject()`；新增 `LxHooks.request()` 观测点
   （在请求发出前回调，给的是解析后的 options）。
4. `lx/LxHttp.kt`：请求体对象走 JSON 序列化（原来是 `raw.toString()`，
   对象会变成 `com.xxx.JsObject@hash`）；把「options→请求」抽成可测的 `LxHttp.plan()`。
5. `lx/LxRuntimeHost.kt` + `buildDiagnosticReport.ts`：诊断新增
   `lastMethod` / `lastStatus` / `lastOptions`。上一轮真机正是因为诊断里只有状态码，
   才把「POST 被发成 GET」看成了「服务端没有这个路由」。

没动：背屏、灵动岛、歌单 UI、Media3 接管编排、有界重试与熔断（1.3.49 的那套原样保留，
`continuation-blocked` / `musicu circuit open` 仍在 dex 内）。

---

## 四、测试

- JVM 全量 **327/327**（新增 `LxHttpMappingTest` 10 项：POST+JSON 体必须保留 method/body/Content-Type、
  JsObject(Map) 不得被丢、对象体必须序列化成 JSON 而非 Java 身份串、shim 必须 `JSON.stringify`
  后再交给宿主）。
- 前端 vitest 相关 16/16；`tsc --noEmit` 0 错（顺带修掉 `lxNativeScriptSync.test.ts` 里
  10 个既有的 `qualitys: string[]` 类型不兼容）。
- 双引擎对照：`tools/lx-compare` 3/3 请求逐字段一致，结果一致（退出码 0）。
- 端到端：`tools/lx-probe` 真实脚本真实网络 5/5（206 audio/mpeg）。

---

## 五、尚未完成（不冒充已验证）

**真机 Media3 接管未验证。** 本机 `adb` 可用但没有任何设备连接，
因此「原生解析出 URL 后真正交给 Media3 播起来」这一步只能由真机给出结论。
上面的 5/5 是**开发机上的引擎证据**，不等于真机 Media3 播放证据。

真机验证要看这几行（设置 → 诊断/导出）：

```
native source: provider=qq lxSource=tx resolver=lx-native nativeReady=yes
lx engine: installed=yes started=yes sources=kg,tx,wy,kw requests=N ok=N failed=0
           lastHost=musicserver.haitangw.cc lastMethod=POST lastStatus=201
           lastOptions=body,headers,method,timeout
native continuation: takeovers>0 failures=0 blocked=0/3
```

以及事件序列 `continuation-adopt → continuation-ready → continuation-completed`。
