# 听屿 Android 1.2.2

本项目是基于 Folia Android r255 建立的独立衍生版本，包名 `io.github.huleixin.tingyu`，可与 Folia 并存。
第二版按照确认的页面清单精简旧界面。应用名称、唱片岛屿图标与双色底栏图标沿用首版。
同一包名与发布签名，versionCode 从 1 升至 2，可直接更新听屿 1.0.0；仍与 Folia 并存。

## 第二版页面调整

- 仅保留 mobile 资料库界面；迁出共用账号登录实现后，移除网格、无限墙与 TUI 旧界面。
- 移除 Lattice 拼贴、教程宿主、桌面窗口/远控、OBS 独立入口和模组导出页面。
- 原播放器标签页合并为手机底部面板的“歌曲 / 歌词 / 队列”。歌词面板提供来源选择、导入、重新匹配与单曲时间校准。
- 在线、本地和 Navidrome 匹配弹窗均改为单栏手机布局：搜索、选结果、按需预览，底部固定确认按钮。
- 保留音源、账号登录、本地音乐、Navidrome、锁屏歌词和 Shizuku / 背屏能力。原“连接与集成”精简为“音源与系统歌词”，不是删除这些功能。
- 原版歌词舞台 14 种模式、6 种背景及其 renderer 源码均保留。背屏复用的渲染组件和协议保留；Stage API 调试文档页继续待定。
- 旧视图偏好回退到 mobile / 正常播放页，旧 panel tab id 由适配层接入新手机工具。
- 歌词导出、批量操作等共用能力继续由现有命令和服务提供。

原作者 chthollyphile 及 Folia 贡献者的署名、AGPL-3.0 许可证和第三方声明保持有效。
上游 Android fork：https://github.com/whycfawa/folia-android
Folia：https://github.com/chthollyphile/folia-major
听屿发布与完整源码：https://github.com/huleixin/folia-rear-lyrics/releases

## 构建

需要 Node.js 24+、JDK 21、Android SDK 36/36.1 与 build-tools 36。
运行 `npm ci`、`npm run cap:sync:android` 后，在 android 目录运行 Gradle。
设置 ANDROID_HOME/JAVA_HOME 或 android/local.properties；勿在可公开文件中写个人目录。
正式签名需自行提供被忽略的 android/keystore.properties；本包不含发布密钥。
实际 Android 设备上的安装更新、播放、后台恢复、锁屏/背屏仍需实机验收；本轮的 UI 截图来自隔离浏览器测试。

## 1.2.0：综合搜索与实时联想

搜索页从「只搜单曲」升级为综合搜索，仍然只使用听屿自己的代码与既有播放 / 资料库 / 集合视图。

- 输入即联想：300ms 防抖、请求序号失效、5 分钟缓存、清空即停；中文输入法组合期间不发请求（compositionstart/end）。
- 提交后分为「综合 / 单曲 / 歌手 / 歌单 / 专辑」；分类只显示当前音源真正实现的能力。
- 综合页展示真实最佳匹配歌手与四个分区，各分区独立加载与失败，一个超时不会清空整页。
- 单曲仍由原有搜索 store 负责播放、入队、收藏、更多操作、分页与缓存；歌手 / 歌单 / 专辑复用资料库集合视图。
- 选择器统一走 `src/components/app/search/searchWorkspace.css`（全部限定在 `.ty-search`），不改公共 `img` / `button` / `.card`。
- 软键盘：Android 原生层已用 IME inset 给内容区留出高度（`MainSystemBars`），搜索页用 `100%` 弹性列 + 内部滚动，不重复实现键盘监听。
- 输入框字体 16px，避免 WebView 聚焦时自动缩放；`type=text` + `enterKeyHint=search` 让输入法显示搜索键且只有一个清除按钮。

## 1.2.1：搜索故障修复

1.2.0 在真机上失效的根因是 Android 内置桥（`src/nativeBridge/api/folia.js`）只放行一份固定的 QQ 操作白名单，
而客户端新增的 `search` / `smartbox` 路由不在其中，于是直接返回 `Folia QQ bridge does not implement search`。
单曲搜索一直正常，是因为它走的是 `qq_raw` / `musicu` 通道。

- 桥里补上 `search`：走 musicu `DoSearchForQQMusicLite`，按 `search_type` 0/1/2/3 查单曲/歌手/专辑/歌单。
  真实请求验证（关键词「许嵩」）：1085 / 11 / 267 / 299 条。
- 桥里补上 `smartbox`：读取 QQ smartbox 分组（歌手 / 单曲 / 专辑）；该端点没有 CORS 头，
  安卓上优先走原生 `httpRequest`，桌面/网页再退回普通 fetch。真实返回：歌手 1、单曲 4、专辑 2。
- 网易云桥的 `/cloudsearch` 过去把 `type` 写死为 1，分类搜索会静默退化成单曲；现在透传 `type`，
  并补上 `/search/suggest`（`/api/search/suggest/keyword`）。
- 搜索页状态改为按输入内容派生：空关键词永远是历史 / 热门页，不再依赖可能残留的 mode。
- 联想请求失败不再显示错误卡片：保留输入，给出「搜索『关键词』」与命中的历史词。
- 分类失败只显示一句中文并可重试；桥接英文原文只进控制台。
- 音源选中态改为柔和强调色底 + 强调色文字。

## 1.2.2：搜索五项 Bug 修复

- **键盘遮挡**：搜索页改为按 `visualViewport` 的可视高度与偏移定位（`useVisualViewport`），不再用布局视口撑满；
  键盘展开时列表在可视区内滚动，不再出现「最后一条被截断 + 下方大片空档」。
- **单曲列表**：单曲页改用 `ty-search-body` 的独立 flex 区（列表自己滚动、加载更多在列表之后），
  实测列表与按钮重叠 0px；按钮不再浮在最后一首歌上。
- **焦点白框**：移除 `input` 的矩形 `outline`，焦点反馈改成搜索框圆角容器的薄荷描边 + 柔和阴影。
- **歌手/歌单/专辑仍失败**：真机上客户端仍在调用桥里「可能不存在」的 REST 操作。现在 QQ 分类搜索直接走
  单曲搜索同一条 musicu 通道（`DoSearchForQQMusicLite`，`search_type` 0/1/2/3），联想走 smartbox：
  配置了真实后端时用其 `/getSmartbox`，安卓无后端时走原生 `httpRequest` 绕开 CORS。
  真实验证（许嵩）：歌手 11、歌单 20、专辑 20，三个详情页都能打开。
- 1.2.2 的安装包以「替换 Web 资源 + 同密钥重签」方式生成（原生未变），内部 versionCode 仍为 4，可直接覆盖 1.2.1。
