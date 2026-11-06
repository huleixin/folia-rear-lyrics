# 听屿诊断包：格式说明与排障提示词

适用版本：1.3.180+（`docs/ANDROID-DIAGNOSTICS-FEEDBACK-1.3.180.md` 的配套文档）

---

## 1. 用户怎么拿到包

设置 → 关于 / 帮助 → **问题反馈** → 选类别、写描述、可加 3 张截图 → **导出并分享报告**。

包落在 `cache/diagnostics/tingyu-diagnostic-YYYYMMDD-HHmmss.zip`，通过 FileProvider +
系统分享面板发出（QQ / 微信 / 邮件均可）。导出目录最多保留 20 个包 / 20 MB，超出自动删最旧。

也可以直接在帮助页用「导出诊断数据」拿旧的 txt；新流程的包内容更全。

---

## 2. 包结构

```
tingyu-diagnostic-20261107-002530.zip
├── metadata.json     设备、系统、应用与源码版本、会话、隐私边界
├── events.jsonl      结构化事件流（上一次会话 + 本次会话），一行一条 JSON
├── errors.txt        崩溃与异常退出记录（含堆栈、ApplicationExitInfo）
├── performance.json  启动阶段、页面耗时、帧率与长任务摘要
├── feedback.txt      用户填写的类别与描述
├── report.txt        原有文本诊断报告（30+ 小节，兼容旧流程）
├── screenshots/      最多 3 张，长边 ≤1280，JPEG q0.75
└── README.txt        包内说明与隐私声明
```

### metadata.json

```jsonc
{
  "schema": "tingyu-diagnostic/1",
  "generatedAt": "2026-11-07T00:25:30.123+08:00",
  "app": { "versionName": "1.3.180", "buildType": "release",
           "buildId": "1.3.180@77ea97bd-dirty", "packageName": "io.github.huleixin.tingyu",
           "runtime": "capacitor-android" },
  "device": { "manufacturer": "Xiaomi", "model": "25098PN5AC", "androidRelease": "17",
              "sdk": 37, "webview": "com.google.android.webview/156.0.8078.47",
              "chromeVersion": "156.0.8078.47", "screen": {...}, "cores": 8 },
  "session": { "id": "3f1c9a2b", "startedAt": "...", "processEpoch": 444, "eventCount": 187 },
  "retention": { "eventsInMemory": 400, "sessionFileBytes": 48213, "policy": "..." },
  "privacy": { "included": [...], "excluded": [...] }
}
```

**`app.buildId` 是最关键的一行**：它等于 `版本@git短哈希`。报告与源码对不上时先看它。

### events.jsonl

一行一条，字段固定：

```json
{"t":1793980620399,"s":"3f1c9a2b","m":"playback","l":"error","e":"resolve-failed","r":"q:4f2a","f":{"provider":"qq","code":-1,"stage":"url","ms":812}}
```

| 字段 | 含义 | 取值 |
| --- | --- | --- |
| `t` | 毫秒时间戳 | 与原生同一时钟 |
| `s` | 会话 ID | 每次进程启动一个；崩溃前后可用它分界 |
| `m` | 模块 | lifecycle / nav / ui / playback / audio / source / lyrics / rear / island / lsp / shizuku / webview / js / perf / feedback / storage |
| `l` | 级别 | debug / info / warn / error / fatal |
| `e` | 事件名 | kebab-case；`page-enter:<page>` 会带页面 id |
| `r` | 关联 ID | 手势、匿名歌曲 key、请求序号 |
| `f` | 字段 | 只含标量；字符串 ≤240 字符；敏感键已丢弃 |

时间线是「事件流」，不是「全量轨迹」：同一 (m,e) 一秒最多一条，不逐帧、不逐进度。
崩溃前的上下文最多保留 400 条（约 2~5 分钟的正常操作）。

### errors.txt

按时间倒序（最新在最后）列出 `CrashDiagnostics` 与前端 `crashDiagnostics` 合并后的记录：
原生未捕获异常、`onRenderProcessGone`、`ApplicationExitInfo`（CRASH / ANR / LOW_MEMORY /
FREEZER…）、JS `window.onerror` 与 `unhandledrejection`。每条带来源、线程、类型、消息与最多
40 行堆栈。

### performance.json

```jsonc
{
  "frameTiming": { "stats": {"p50":8.3,"p95":8.4,"p99":16.7}, "sessionJankCount": 0,
                   "worstSecondFps": 117, "longTasks": {...}, "deviceClass": "high" },
  "navigation": { "domContentLoadedMs": 612, "loadEventMs": 834 },
  "paint": [{ "name": "first-contentful-paint", "ms": 588 }],
  "jsHeap": { "usedMb": 84, "totalMb": 120 }
}
```

页面耗时在 `events.jsonl` 里：`m=perf, e=phase:<name>`；页面进入是
`m=nav, e=page-enter:<page>, f.sinceTapMs=<毫秒>`。

---

## 3. 隐私边界（实现了什么）

- 不含密码、Cookie、Token、Authorization、账号 / 昵称 / 邮箱 / 手机号；
- 不含完整歌词、音频内容、音频地址、文件路径；
- 事件字段只接受标量，对象/数组一律丢弃（防止误传整份响应体）；
- 错误消息里的 URL 在进入事件流前打码为 `<url>`；
- 诊断包只在用户点「导出并分享」后通过系统面板离开设备，代码里没有任何上传路径。

---

## 4. 标准排障提示词（直接粘给 AI）

> 你是一名 Android 音乐播放器的高级排障工程师。下面是一份「听屿」诊断包的内容。
> 请严格按照证据推理，不要臆测。
>
> **输入**：`metadata.json`、`events.jsonl`、`errors.txt`、`performance.json`、`feedback.txt`。
>
> **步骤**
> 1. 先读 `metadata.json`：记录 `app.versionName` + `app.buildId`（版本与 git 短哈希）、
>    设备型号、Android 版本、WebView 版本。后续所有结论都必须与这个 buildId 对应。
> 2. 读 `feedback.txt`：确认用户描述的现象、类别、发生时间。
> 3. 在 `events.jsonl` 里按 `t` 排序，**用 `s` 区分崩溃前会话与本次会话**；定位现象发生前后
>    30 秒的窗口，列出该窗口内 `l=warn/error/fatal` 的事件。
> 4. 按模块归因，优先级：`webview`（渲染进程）> `lifecycle`（被杀/重建）> `playback`/`source`
>    （播放与音源）> `lyrics` > `rear`/`island` > `nav`/`perf`（卡顿）。
> 5. 用 `errors.txt` 对齐崩溃时间戳与堆栈首帧；`ApplicationExitInfo` 的 reason 决定是
>    崩溃、ANR、被系统回收还是被用户划掉。
> 6. 用 `performance.json` 判断卡顿是主线程长任务、掉帧还是设备性能边界；区分
>    「应用帧证据」与「物理屏幕呈现」，不要过度解读 FrameMetrics。
> 7. 输出：
>    - **结论一句话**（哪个模块、哪一步失败）
>    - **证据链**：3~6 条，每条带 `t` + `m/e` + 关键字段
>    - **根因假设**：按可能性排序，标注还缺什么证据
>    - **修复建议**：指出应该改哪个文件/函数（若提供源码），并说明如何验证
>    - **无法判断的部分**：明确写出来，不要编造
>
> **约束**：不要根据歌名/歌手推断用户身份；不要把 `s` 相同的两条事件当成因果；
> 事件缺失时先怀疑「没埋点」而不是「没发生」。

---

## 5. 已知无法自动捕获的异常

| 类型 | 原因 | 现有替代证据 |
| --- | --- | --- |
| 系统级 ANR 的完整 traces | 需要 `READ_LOGS` 或 root | `ApplicationExitInfo.getTraceInputStream()`（API 30+） |
| 原生 SIGSEGV 的 tombstone | 系统私有目录 | `ApplicationExitInfo` reason=CRASH_NATIVE + 退出描述 |
| 背屏中心进程内部错误 | 另一个进程，不在本包 | `rear` 模块状态事件 + 背屏故障诊断快照 |
| LSP 模块 / Shizuku 服务端日志 | 第三方进程 | 状态与握手事件、权限拒绝事件 |
| 音频输出设备切换的底层原因 | AudioManager 不暴露 | `audio` 模块焦点/路由事件（能看出「何时切」） |
| 用户侧网络环境 | 隐私与权限 | 请求结果、错误码、耗时 |
