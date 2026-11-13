# Pad 设置播放条、搜索输入与布局修复 1.5.33

基线 5268cc9c，分支 feat/tablet-adaptive，versionCode 248，未合并 main。

## 修改

- ComposeChromeHost.kt：底栏 live 可见性与布局使用同一个原生窗口宽度，避免 WebView viewport 与宿主宽度不一致时只保留无时钟的缓存画面。
- App.tsx / buildHomeSurfacePresentation.ts：Pad 从播放器打开设置时保持既有迷你条发布者挂载，首页像素继续隐藏；设置关闭后恢复原来生命周期，不增加第二个播放器。
- MobileMiniPlayer.tsx：原生设置首页下保持控制发布，原生弹层仍由宿主管理遮挡；点封面返回播放器时关闭设置再执行原动作。
- ChromeMiniPlayer.kt / ChromeModel.kt：同歌曲身份下优先复用 MinimalPlayerRuntime 的现有播放投影，进度、暂停、倍速和 Seek 采用已有 PlaybackPositionClock；兼容通道保留失联冻结上限，旧歌投影不会用于新歌。不增加播放计时器或跨 WebView 高频消息。
- PadWindow.kt / ComposeChromeHost.kt：布局分类使用不含 IME 缩减的当前窗口尺寸。键盘缩短内容区时不把 Pad 搜索页切成手机分支，保留输入节点；真实分屏仍重新分类。
- NativeSearchPage.kt / TopGlassBar.kt：Pad 搜索头部及内容分栏不再重复绘制各自渐变和玻璃色带，使用 NativePageView 整页底色。手机完整搜索页保留原背景和玻璃。
- MinimalLyricsPage.kt：Pad 右侧歌词区顶部的小封面、歌名、歌手整体居中，分隔短线随之居中；左侧大封面及歌词正文对齐不变。

## 验证与限制

前端定向回归 320 项通过，覆盖页面归属、搜索、设置返回、原生控制会话及设置下时钟锚点；类型检查通过。Android 全量测试 1365 项通过，零失败、零跳过；测试/构建证据随包提供。

新增 Android 场景：搜索框聚焦后内容高度 800→380→800、输入和模型回写后焦点保持；窗口分类与真实分屏边界；原生播放投影在倍速、暂停及兼容心跳过期时的位置计算。

当前未连接 Android 真机。Robolectric 通过不等于厂商输入法实测，不宣称用户设备输入法和全部交互已完成验证。需安装复测：设置首页播放/暂停/队列/进度与返回，键盘展开/收起/连续输入/搜索提交/切换来源，右侧头部居中与三主题背景衔接。
