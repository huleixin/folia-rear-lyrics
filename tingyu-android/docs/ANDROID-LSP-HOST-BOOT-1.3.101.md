# 1.3.101：专属宿主 WebView 页面就绪追踪

基线 85f1750c（1.3.100），保留既有电源、Binder、Launcher、专属舞台与独立窗口回退。本轮未重复调整这些链路。

## 已知证据及边界

用户日志证明 SHOW 到达、背屏 ON、launcher/resumed 为真、created 成功；没有 page-ready/drawn/ready。旧日志没有资源/JS/state 分段信息，因此不能把具体设备上的最早失败阶段宣布为已确认。

代码确认存在风险：stage 从 alpha=0 开始，直到 iframe onConfigured 发 ready 才解除；onConfigured 等待实际舞台节点和 rAF。透明父层可能使绘制/动画帧受限，形成准备与显示的循环。本版从初始挂载起使用 alpha=1 的真实舞台，仍以原 onConfigured 和可见 onDraw 确认 ready，不换静态 UI、不增加超时时间。

## 实际页面链路

Provider 流式返回 rear-lyrics.html → 模块入口 → React 外层 Surface → state 快照 → relay postMessage（同源/窗口/session 校验）→ iframe Panel → ObsBrowserSourceApp → 原视觉模式实际挂载及 onConfigured → /ready → page-ready → 可见 onDraw → ready/hostActive。

RearHostSnapshotCache 审计及既有测试覆盖完整配置按 revision 回送、后续时钟增量、跨读请求/失效竞态。未证实缓存或 relay 存在新缺陷，不重写。真实双层页面浏览器测试已验证配置能到达 iframe 并由原舞台发送 ready，不能替代 Android 渲染结论。

## 修改与诊断

- RearHostView：初始非零 alpha；固定事件最多 48 条，记录创建/loadUrl、第一次 draw（不伪装 ready）、延迟一次的 shown/attached/visible/alpha/尺寸；Console ERROR 仅记录行号，不输出可能含隐私的原文。
- RearHostWebClient：固定事件去重最多 40 类，追踪 HTML/首个 JS/CSS 的资源流打开、页面 start/commit/finish、一次 JS DOM 探针、state 是否含 config、boot 事件及 /ready。资源流打开不等于 Chromium 已执行，js-entry 才是入口执行证据。关键资源失败维持安全失败回退。
- HTML：模块求值前固定 html-script/js-error/js-rejection 标记，无错误原文或 URL 查询；前端模块为每个文档最多 16 个去重固定 boot 阶段，记录 js-entry、react-mounted、iframe-mounted、state-config、config-received、configured。
- RearHostProgress：最高里程碑单向推进，probe 仅更新等待条件，实际异常单独保存；超时包含 milestone/waiting/error。
- 原播放、主题与舞台代码未替换；新增探针不传歌曲、凭据或图片 URL。

## 测试与手机验收

新增 JVM 回归：created 后 probe/web-error 不抹去最高里程碑，后到旧阶段不回退。新增 Playwright：真实 rear-lyrics.html + 真实 iframe + 原 classic 舞台，在受控配置下验证 relay、onConfigured、ready 和无页面异常。既有缓存、状态与重连单测继续运行；最终结果见 Release。

真机覆盖安装后重启宿主/手机，核对 1.3.101（124）及新 build。打开背屏后应有 webview-created、load-url、page-start、html-ok、html-script、script-ok、js-entry、react-mounted、state-read/config、iframe-mounted、config-received、configured、ready-request、page-ready、drawn、ready。部分异步事件可交错。

- 无 page-start/资源请求：检查创建、loadUrl、渲染进程与 view-state。
- html-ok 无 js-entry：检查 script-ok、js-error、资源错误。
- React 已挂载无 state-config：检查 state-read 的 config/revision、Bridge/Provider 错误。
- state-config 无 config-received：检查 iframe-mounted 与页面异常。
- config-received 无 configured：原模式 lazy 模块/渲染异常或活动状态，需要新日志证据。
- ready-request/page-ready 无 drawn：检查可见性、附着、尺寸及 first-draw。

只有原舞台 onConfigured 后实际可见 onDraw 才激活；onDraw 仍是应用绘制边界，不是硬件屏幕呈现证明。没有小米真机连接时不宣称已恢复显示。失败导出本版日志以确认最早故障阶段；用户日志不上传仓库。可 revert 本轮提交并用更高 versionCode 重建回滚，保留数据。
