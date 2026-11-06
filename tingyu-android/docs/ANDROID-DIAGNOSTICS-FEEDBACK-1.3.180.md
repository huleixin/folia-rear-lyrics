# 听屿 · 故障诊断 / 问题反馈 / 日志导出（实施方案 + 交付说明）

版本基线：1.3.180（versionCode 203）｜本文档随代码一起演进，字段变更必须同步这里。

---

## 1. 现有能力审查（先看清楚有什么，再决定加什么）

听屿不是从零开始：1.3.180 已经有一套相当完整的「只读诊断」，这次是在它上面补
「统一事件流 + 可打包导出 + 用户反馈入口」，而不是另起一套。

| 能力 | 现有实现 | 结论 |
| --- | --- | --- |
| 启动时间线 | `chrome/NavigationTiming.java`（activity-create / webview-available / 首帧 FrameMetrics / main-looper-lag，1 分钟窗口，256 条环形） | **复用**，作为性能证据来源 |
| 崩溃轨迹 | `CrashDiagnostics.java`（UncaughtException 链式挂载不吞异常、20 条 SharedPreferences、ApplicationExitInfo 反射读取、heartbeat 保留上一会话） | **复用**，作为 `errors.txt` 主来源 |
| 播放故障轨迹 | `playback/PlaybackDiagnostics.java` + `DiagnosticLanes`（critical 140 / routine 40，双泳道，`commit()` 抗进程猝死） | **复用**，并镜像进统一事件流 |
| 背屏故障 | `RearFaultDiagnostics.java` + `RearLyricsTrace`（锁屏前后 0/5/60s 采样） | **复用**，事件按模块归类 |
| JS 异常 | `utils/crashDiagnostics.ts`（`window.onerror` / `unhandledrejection`，写 localStorage + 原生 `recordRuntimeDiagnostic`） | **复用**，并镜像进统一事件流 |
| 渲染进程死亡 | `MainActivity.installWebViewRendererGuard()`（60s 内最多重建 3 次，超过才 finish；每次都写轨迹） | **已满足要求**，只补一条统一事件 |
| 帧率/长任务 | `utils/frameTimingDiagnostics.ts` + `frameTimingDemand.ts` | **复用**，进 `performance.json` |
| 报告文本 | `utils/buildDiagnosticReport.ts`（1226 行，30+ 小节） | **复用**，作为 `report.txt` 与「预览」正文 |
| 导出与分享 | `FoliaNativePlugin.shareTextFile`（FileProvider + ACTION_SEND）+ `deleteDiagnosticFiles` | **复用**，新增 ZIP 版本 |
| 设置帮助区 | `SettingsHelpActions.tsx`（复制 / 导出 / 删除 / 启动诊断 / 背屏故障） | **扩展**，加「问题反馈」入口 |

### 缺口（这次要补的）

1. 没有**跨原生/前端统一的事件结构**：原生是 SharedPreferences 里的两条泳道，前端是另一份
   localStorage，时间基准靠报告生成时临时对齐，无法逐条排序。
2. 没有**会话级 JSONL 落盘**：闪退后只能看到 20 条崩溃记录，看不到崩溃前 30 秒发生了什么。
3. 没有 **ZIP 诊断包**：只有一份 txt，用户与开发者都不好按文件归类。
4. 没有**用户反馈入口**：用户只能自己找「导出诊断数据」，还得口头描述问题。
5. 没有**反馈与日志的绑定**：开发者拿到 txt 不知道用户说的是哪个现象。
6. 卡顿只有帧率，没有**关键页面打开耗时**（设置/搜索/资料库/舞台切换）的结构化记录。

### 明确不做（边界）

- 不动播放内核（Media3 初始化、音频焦点、解码、队列推进）；
- 不动歌词同步时钟与舞台渲染；
- 不动背屏/灵动岛/LSP 的窗口与生命周期决策；
- 不引入第三方依赖（ZIP 用 `java.util.zip`，截图压缩用 canvas）；
- 不上传任何数据，全部本地生成、用户主动分享。

---

## 2. 统一事件模型

一行 JSON（JSONL），原生与前端同构：

```json
{"t":1793980620399,"s":"3f1c9a2b","m":"playback","l":"error","e":"resolve-failed","r":"q:4f2a","f":{"provider":"qq","code":-1,"stage":"url","ms":812}}
```

| 字段 | 含义 | 约束 |
| --- | --- | --- |
| `t` | 毫秒时间戳 | 原生 `System.currentTimeMillis()`；前端 `Date.now()`；差值用 `NavigationTiming` 的 `nativeNow/epochNow` 对齐 |
| `s` | 会话 ID（每次进程启动一个 8 位 hex） | 同一份包内可用它区分「崩溃前 / 崩溃后」 |
| `m` | 模块 | `lifecycle` `nav` `ui` `playback` `audio` `source` `lyrics` `rear` `island` `lsp` `shizuku` `webview` `js` `perf` `feedback` `storage` |
| `l` | 级别 | `debug` `info` `warn` `error` `fatal` |
| `e` | 事件名，kebab-case | 白名单式命名，不允许拼用户内容 |
| `r` | 关联 ID（可选） | 手势 ID、匿名歌曲 key（`Integer.toHexString(hash)`）、请求序号 |
| `f` | 字段对象 | 只允许标量；字符串截断 240 字符；敏感键直接丢弃 |

约束：

- 不逐帧、不逐进度记录；同一 (m,e) 1 秒内最多 1 条（高频路径用 `DiagnosticLog` 内置节流）。
- 字段值只接受 `String/Number/Boolean`，对象/数组直接丢弃（防止误传整份响应体）。
- 键名命中 `token|cookie|password|secret|authorization|uin|phone|email|lyric|path|file|url` 的值不落盘。

---

## 3. 存储与保留

| 层 | 位置 | 容量 | 生命周期 |
| --- | --- | --- | --- |
| 原生内存环形 | `DiagnosticRing`（400 条） | 约 120 KB | 进程内 |
| 原生会话文件 | `files/diagnostics/events-<sid>.jsonl` | 单文件 512 KB，保留最近 3 个会话 | 跨进程 |
| 原生崩溃轨迹 | `folia_crash_diagnostics` SharedPreferences | 20 条 | 跨进程（已有） |
| 前端环形 | `diagnosticLog`（400 条）+ localStorage | 160 KB 上限，超限丢最旧一半 | 跨进程 |
| 导出产物 | `cache/diagnostics/*.zip` | 最多 20 个 / 20 MB，超限删最旧 | 用户可一键清空 |

写入策略：单线程 + 有界队列（512），满队列丢最旧；每 64 条或 2 秒 flush；`error/fatal`
立即同步追加（频率天然很低），保证闪退前最后一条不丢。

---

## 4. 采集点（模块 × 事件 × 能回答什么问题）

| 模块 | 事件 | 证据 |
| --- | --- | --- |
| lifecycle | `activity-create/resume/pause/stop/destroy`、`renderer-gone`、`process-exit` | 闪退/被杀/后台策略 |
| nav | `route-change`、`sheet-open`、`page-enter`（含耗时） | 用户操作路径、卡在哪个页面 |
| perf | `phase`（settings/search/library/stage 打开耗时）、`long-task`、`frame-drop`、`startup` | 卡顿定位 |
| playback | 镜像 `PlaybackDiagnostics` 非 routine 事件：`blocked` `error` `fallback` `queue-*` | 播放失败原因、音源切换 |
| source | `resolve-start/ok/fail`（provider、code、ms） | 音源解析失败 |
| lyrics | `publish` `apply` `mode-change` `offset` `stale` | 歌词错位/不显示 |
| webview | `renderer-gone` `bridge-detach` `js-silent` | WebView 假死 |
| js | `window-error` `unhandled-rejection` `chunk-load-failed` | 前端崩溃/白屏 |
| rear/island | `rear-state` `aod-change` `camera-yield` `island-empty` | 背屏/灵动岛异常 |
| lsp/shizuku | `lsp-state` `shizuku-state` `permission-denied` | 权限与宿主异常 |
| feedback | `submit` `export` `share`（只记类别与是否含日志，不记描述正文） | 反馈闭环统计 |

---

## 5. 诊断包格式

`tingyu-diagnostic-YYYYMMDD-HHmmss.zip`（DEFLATE，`java.util.zip` 生成）：

```
metadata.json     设备/系统/应用/源码版本/会话/保留策略
events.jsonl      本次会话 + 上一会话（崩溃前）的结构化事件
errors.txt        崩溃与退出原因（原生未捕获、ApplicationExitInfo、JS 异常摘要）
performance.json  启动阶段、页面耗时、帧率与长任务摘要
feedback.txt      用户选择的问题类别 + 描述（用户可见、可编辑）
report.txt        现有文本诊断报告（兼容旧流程）
screenshots/      最多 3 张，长边 ≤1280，JPEG q0.75
README.txt        包内说明与隐私声明
```

`metadata.json` 关键字段：`app.versionName/versionCode/buildType/gitCommit`、
`device.manufacturer/model/sdk/release/abi`、`webview.version`、`session.id/startedAt`、
`process.epoch`、`generatedAt`、`retention`。

---

## 6. 反馈页

入口：设置 → 关于 / 帮助 →「问题反馈」（与「导出诊断数据」同区，放在其上方）。

流程：选类别（6 类）→ 填描述（≤2000 字）→ 可选 3 张截图 → 开关「包含诊断日志」（默认开）
→ 预览诊断信息 → 导出 / 分享。分享走 FileProvider + 系统面板（QQ/微信/邮件）。

视觉：沿用现有玻璃卡（`rounded-2xl` + `border-white/10` + `bg-white/5`），浅色模式由
`html[data-interface-appearance='light']` 现有覆盖规则接管，不新增主题分支。

---

## 7. 性能预算

| 项 | 预算 |
| --- | --- |
| 单条事件入环 | < 20 µs（无 IO，仅 JSON 组装 + 入队） |
| 主线程 IO | 0（写入在 `tingyu-diagnostic-log` 线程） |
| 常驻内存 | < 400 KB（两运行时合计） |
| 磁盘 | 单会话 ≤ 512 KB，总量 ≤ 3 MB |
| 帧影响 | 不注册 Choreographer，不逐帧采样；只复用现有 FrameMetrics/长任务 |

---

## 8. 验收对照（对应需求第六节）

1. JS 异常 → `js` 模块 `window-error`/`unhandled-rejection`，含 stack、文件、行号（前端记录 + 原生冗余）。
2. Android 异常 → `CrashDiagnostics` 落盘，下次启动 `errors.txt` 可见，`events.jsonl` 里能看到崩溃前 30 秒。
3. 解析失败 → `playback`/`source` 事件的 provider、code、stage、ms。
4. 前后台 + 渲染进程终止 → `lifecycle` 事件 + `webview renderer-gone` + 恢复次数。
5. 断网 → 全程本地生成，无网络依赖。
6. 深浅色 → 复用既有 token，`data-interface-appearance='light'` 下逐项检查。
7. 性能 → 见性能预算；关闭反馈页不注册任何监听。
8. 脱敏 → 单测覆盖 `token/cookie/uin/email/path/lyric` 等键。

---

## 9. 给 AI 的标准排障提示词

见 `docs/DIAGNOSTIC-PACKAGE.md` 附带的提示词模板（随包一起交付）。

---

## 10. 实现结果（本次交付）

### 新增文件

| 文件 | 作用 |
| --- | --- |
| `android/.../diagnostics/DiagnosticRing.java` | 有界环形缓冲（纯 JVM，可单测） |
| `android/.../diagnostics/DiagnosticFields.java` | 字段白名单 / 敏感键过滤（纯 JVM） |
| `android/.../diagnostics/DiagnosticLog.java` | 原生事件流：会话、节流、异步 JSONL、分卷、清理 |
| `android/.../diagnostics/DiagnosticPackage.java` | ZIP 生成（java.util.zip）、FileProvider 分享、导出目录清理 |
| `android/app/src/test/.../DiagnosticEventStreamTest.java` | 7 例：环形边界、先进先出、字段脱敏、非标量丢弃、截断 |
| `src/services/diagnostics/diagnosticLog.ts` | 前端事件流：环形、节流、批量过桥、脱敏、交互计时 |
| `src/services/diagnostics/diagnosticPackage.ts` | metadata / errors / performance / feedback 组装与导出 |
| `src/services/diagnostics/screenshotCapture.ts` | 截图压缩（长边 1280 / JPEG 0.75，最多 3 张） |
| `src/components/modal/feedback/FeedbackPanel.tsx` | 反馈面板（类别、描述、截图、开关、预览、导出） |
| `src/i18n/feedbackCopy.ts` | 反馈页文案（zh / en / id） |
| `test/unit/diagnostics/diagnosticLog.test.ts` | 6 例：有界、节流、脱敏、截断、JSONL 合法性 |
| `test/unit/diagnostics/diagnosticPackage.test.ts` | 4 例：metadata 结构、performance JSON、feedback 文本 |
| `docs/DIAGNOSTIC-PACKAGE.md` | 包格式说明 + 标准排障提示词 |

### 修改文件

| 文件 | 改动 |
| --- | --- |
| `FoliaNativePlugin.java` | 新增 `diagnosticEvent` / `diagnosticSession` / `exportDiagnosticPackage` / `recordDiagnosticEvent` / `clearDiagnosticData` |
| `MainActivity.java` | onCreate 安装事件流并记 `activity-create`；渲染进程结束记 `renderer-gone` / `renderer-give-up` |
| `playback/PlaybackDiagnostics.java` | 非 routine 事件镜像进统一事件流（不改变原泳道行为） |
| `src/index.tsx` | 启动时 `initDiagnosticLog()` |
| `src/utils/crashDiagnostics.ts` | JS 异常同时写入事件流（URL 打码） |
| `src/utils/onlinePlaybackDiagnostics.ts` | 音源解析/播放失败写入事件流（provider、阶段、码、耗时） |
| `src/utils/lyricsDiagnostics.ts` | 歌词事件写入事件流（不含歌名与歌词正文） |
| `src/hooks/useNativePage.ts` | 页面进入记 `page-enter:<page>` + `sinceTapMs` |
| `src/components/AppSplashGate.tsx` | 冷启动记 `startup-react-commit` |
| `src/components/modal/SettingsHelpActions.tsx` | 帮助区新增「问题反馈」入口（Android 可见） |
| `src/i18n/locales/{zh-CN,en,in}.ts` | `help.feedback` / `help.feedbackDescription` |

### 不改动

播放内核、歌词同步时钟、舞台渲染、背屏/灵动岛窗口决策、LSP/Shizuku 授权流程均未改动；
`PlaybackDiagnostics` 只多了一次镜像调用，原双泳道与 `commit()` 策略保持不变。

### 验证

- `npx tsc --noEmit`：通过；
- `vitest test/unit/diagnostics`：10 例全过（另含既有 aiThemeDiagnostics 4 例）；
- `gradlew :app:testReleaseUnitTest --tests "*DiagnosticEventStreamTest"`：7 例全过；
- `gradlew :app:assembleRelease`：成功。
