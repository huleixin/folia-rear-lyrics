# 听屿品牌开屏与 Android 图标

本次资源以用户提供的「听屿开屏 Demo 素材包」为准。public/brand/logo-symbol.svg 与素材包一致；public/brand/app-icon-1024.png 保留原始图标来源。不使用概念图重新绘制 Logo。

## 启动所有权

1. 原有 Android 启动窗口保留 LaunchSurface / BootSurfaceTint 的定色和首帧交接；其图标使用透明矢量，避免系统图标和网页品牌动画重复出现。
2. MainActivity 在 Capacitor 加载 HTML 前注册 BrandLaunchPlugin。同步接口只返回已保存的外观、系统明暗、减少动画状态和是否首次启动该文档。
3. index.html 在原 WebView 内加载 SVG、brand-splash.css 和极小的 brand-splash.js。波浪、Logo、中文名、英文名、Slogan、副标题按 Demo 节奏出现，初始化同时进行。
4. AppSplashGate 原有调用进入 hideAppSplash。React 就绪且原生目标页面可画出后，等待两个绘制帧，保留的 WebView 淡出 320ms，HTML 遮罩随后移除。两个绘制帧用于交接，不等待品牌动画播完。减少动态效果时取消动画和淡出时长。
5. 若冷启动直接进入 WebView 歌词舞台，则只淡出 HTML 遮罩，保持舞台本体不透明；原生极简页仍按原生页面交接。无需等待不存在的首页。
6. 同一进程第二次创建 Activity、同一 WebView 重新加载文档及正常后台恢复不重播。没有新增 Activity、WebView、视频、播放器或播放服务。主题变化和路由变化不挂载新的品牌动画。

为了在已缓存的原生首页上展示品牌动画，同一个 AndroidView 放在 Compose 根布局的稳定位置；仅启动阶段提升层级，普通页面、舞台、底栏的相对显示关系保持原有规则。无重新创建或按路由移动 WebView。

开场波浪结束时显式隐藏，SVG 自带圆角裁切，外容器再约束溢出。正常启动没有强制等待；12 秒仅是异常时显示重试按钮的兜底。旧启动动画的历史注释归档于 brand-splash-legacy-notes.md。

## 四主题与扩展

| 主题 | 原生/网页共同起始色 | 文案/环境光 |
| --- | --- | --- |
| 经典浅色 | #F4F5EE | 墨绿色文案、浅绿色环境光 |
| 经典深色 | #102D25 | 白色文案、柔和绿色环境光 |
| 冰川浅色 | #E3ECF5 | 蓝黑文案、冷蓝环境光 |
| 冰川深色 | #101A28 | 冰白文案、浅蓝环境光 |

Logo 的冰蓝三段渐变固定。背景环境光从透明淡入，初始背景与原生启动窗口同色。

仍使用 src/theme/interfaceThemeSpec.json。generateInterfaceThemes.mjs 从现有 launch、launchInk、muted 和 accent 生成启动变量，没有单独维护第二份四主题色板。新增主题时填写共享主题配置并执行 npm run theme:generate。Android 偏好优先于可能滞后的网页存储，system 模式使用原生当前明暗状态。

## 图标资源

- drawable/ic_launcher_foreground.xml：仅四条原始海浪路径，补偿 Android 1.5 倍图层放大，保留主体比例；不把带圆角背景的整张 PNG 当作前景。
- drawable/ic_launcher_background.xml：固定冰蓝渐变，背景铺满系统蒙版。
- drawable/ic_tingyu_monochrome.xml：原始两条波浪描边，居中放入安全区域，用于 Android 13 themed icon。
- mipmap-anydpi-v26/ic_launcher.xml 和 ic_launcher_round.xml：分层自适应图标。
- mipmap-{ldpi,mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher{,_round}.png：36、48、72、96、144、192px 传统资源。
- drawable/brand_splash_empty.xml：系统启动图标占位，不修改桌面图标引用。

Manifest 中应用与 roundIcon 的现有资源名不变，系统应用列表和最近任务继续使用应用图标。移除无引用的旧启动图片、旧前景 PNG 和旧 v24 矢量，避免资源限定符覆盖新图标。

重新生成：在工程根目录执行 node dev/build/generateBrandIcons.mjs。使用已有 Playwright；可通过 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH 指定本机 Chrome。没有新增动画或图片运行时依赖。

## 验证与边界

- brandSplash.spec.ts：13 项，四主题、提前结束、无残留、原生外观覆盖、减少动态效果、暖文档跳过、不会重播、超时重试、网页舞台交接、OBS 入口。
- BrandLaunchRenderTest：3 项真实 Compose 帧交接检查，覆盖双端就绪、减少动画、网页舞台不透明。
- BrandIconRenderTest：API 24 传统图标资源选择和解码；API 33 原生 Canvas 绘制 adaptive / circle / rounded / square / monochrome 及透明启动占位。
- 同时检查主题持久化、原生路由、启动底栏、舞台转场和采样策略；这些自动化检查不等同于设备端完整启动。

仍需设备验收：HyperOS 实际图标蒙版/缓存、不同 Android/OEM 的系统启动窗口衔接、四主题连续冷启动与后台恢复、播放中退出再进入、启动耗时与丢帧、系统关闭动画后的实机表现。当前没有连接 Android 设备，不将编译或 Robolectric 结果称为真机通过。
