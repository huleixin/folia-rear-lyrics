# 听屿：设置导航、触摸与舞台预览修复

基线：`24f082f37d2a3b020695b8fc602458b64f80402c`。本次只调整前台设置、导航、触摸、预览与诊断，不修改播放引擎或 LSP/Shizuku 背屏实现。

## 源码已确认的问题与修复

| 问题 | 原因 | 修改位置 |
| --- | --- | --- |
| 可滚动但点击失效 | click 控件只有 semantics；实际点击由根 detectTapGestures 代收，滚动区域与控件是兄弟节点 | `NativeSettingsDocumentView.kt`：每个 click 控件使用 clickable，作为所属 scrollable 的子节点；根只在 Initial pass 观察坐标，不消费或转发点击 |
| 快照仍显示、操作被丢弃 | native 先覆盖 pages，再判断路由归属；保留快照的 session/key 可以与当前输入状态不同；两端均静默过滤 | `ComposeChromeHost.kt`、`NativePageRetention.kt`、`useNativePage.ts`：只提交属于当前路由的完整帧；分别记录拒绝原因；路由改变或过期输入请求重新抓取、重新发布，不重放旧动作 |
| 文档和操作身份错位 | actions ref 独立替换，文档通过 React state 发布；壳层拼六个布尔值，而实际文档包含七个（含 showStageTheme） | `useNativeSettingsDocument.ts`、`nativeShellRouting.ts`：文档和 handlers 成对发布；壳层使用已挂载文档的实际 key；navigation token 改变时重发模型 |
| 返回极简封面先显示歌词 | 原生 pager 的 minimalLastPage 与 JS page store 各自记忆；进入/退出设置没有明确来源，返回还等待 WebView visual-state 握手、重放播放器入场 | `useSettingsModalStore.ts`、`usePlayerViewModeStore.ts`、`useNativeMinimalPlayer.ts`、`ComposeChromeHost.kt`：保存 view/mode/page/detour；原生翻页同步 JS；关闭只提交一次最终路由；原生极简画面就绪时直接恢复，不等待 WebView；只消费本次设置返回的入场抑制 |
| 多级返回跳错层或重复消费 | 设置与播放器可能继续处理同一个 Escape，原生返回事件没有身份 | `SettingsModal.tsx`、`FoliaNativePlugin.java`、`useNativeBackButton.ts`：主题编辑先返回样式页，已消费 Escape 停止后续处理；原生返回编号，JS 每个编号处理一次；不同编号不加时间防抖 |
| 预览歌曲头部重复 | 设置路由不在正式舞台的 CSS 隐藏列表；透明 live 区域可能露出底下正式舞台。旧舞台还持续渲染，预览自己的 chrome 又走原生抓取 | `nativePages.css`、`App.tsx`、`VisPlayground.tsx`、`NativeSettingsDocumentView.kt`：设置期间遮蔽正式舞台及其 chrome；按已有保留机制退休被遮挡的 renderer；整个预览作为唯一 live 岛，包含徽标、按钮和渲染器；contain/isolation/裁剪边界，按滚动区域与 paint clip 清除一次窗口；预览模式切换使用独立实例 |
| 高频抓取与难以定位卡顿 | observer 在排除 live 之前解析 style；每次文档变化重新准备所有 drawing；诊断的主线程和 long-task 采样只覆盖冷启动前十秒 | `useNativeSettingsDocument.ts`、`NativeSettingsDocumentView.kt`、`navigationTiming.ts`、`NavigationTiming.java`：先过滤 live；复用未变的 drawing；诊断启用后采样 60 秒，保留有界事件 |

显式修改“播放器显示方式”偏好时，新选择优先于进入设置时的快照；恢复来源不会撤销用户刚修改的偏好。普通播放器进入/退出和临时舞台访问继续走原有动画。设置关闭不调用播放器 collapseStage，也没有增加用于掩盖状态的等待或超时。

## 诊断与复现

开启“导航与设置诊断（60 秒）”，立即复现问题并导出诊断数据。坐标、控件 ID、route、session、key、navigation token 和具体拒绝原因会进入同一份有界事件记录；不记录输入值、歌曲名称或资源 URL。

可区分 `session-mismatch`、`key-mismatch`、`navigation-mismatch`、`route-mismatch`、`presentation-mismatch`、`disabled-page`、`disabled-control`、`inert-control`、`disconnected-control`、`unknown-control`、`retired-session`、`stage-entry-pending` 等原因。拒绝旧动作不会取消校验，也不会把旧点击转给新页面的同位置控件。

性能测点包括 settings-capture、page-packet-parse、page-ui-dispatch、page-ui-commit、Compose frame boundary、main-looper-lag、slow-app-frame、js-long-task，以及 Android Trace 的 settings-drawings。采样窗口扩大只影响诊断，不影响导航等待时间。

## 验证入口与边界

- Vitest：settingsReturnRoute、nativePage、nativeSettingsDocument hook、nativeSettingsActions、nativeBackOnce、nativeBackButton、nativeStageShellCommit、nativeStagePresentation、nativeMinimalOwnership、nativeStageCommit、nativeShellCommit、nativeSettingsMutations、nativeShellState、nativeStageReturn、startupDiagnosticsControl，以及 minimalStage 与 collectionNavigationHistory。
- 来源恢复用例覆盖完整舞台、极简封面、极简歌词、极简模式下的完整舞台临时访问，各自循环 10 次；覆盖连续关闭、显式偏好修改、同一返回事件重复投递。
- MutationObserver 用例注入 500 轮 live 动画变化，确认不重新抓取设置文档；离散表单变化合并抓取；过期控件可请求刷新。
- 原生 `NativeSettingsTouchTest` 使用 Compose 的实际触摸注入（不是 performClick 无障碍动作），验证按钮点击、从按钮开始的滚动不误点、滚动后另一个按钮仍可点。另有保留页面及路由 fence 测试。
- `nativeSettingsBoundary.spec.ts` 验证 live 绘制岛、正式舞台隔离和 display-list 排除；`frontStageAppearanceUi.spec.ts` 覆盖实际主题编辑与返回。测试会阻断浏览器外网，并启用 FOLIA_OFFLINE_BUILD 关闭 Vite 提交名称查询及歌词代理出站。

具体已执行结果、失败或环境阻塞、APK 哈希以交付报告和日志为准。纯逻辑测试、Robolectric 触摸测试均不能等同于真机系统手势或 WebView GPU 验收。本环境没有连接 Android 设备；不能提供修复后的真机操作录屏，也不能声称已用真机性能轨迹证明录屏中长时间卡住的唯一阻塞位置。
