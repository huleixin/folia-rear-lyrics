# 1.5.16 开屏 Logo 修复

基线：`7c9aa0c964296d7be78b97a143bbf3aedc4a3b1d`（1.5.15 / versionCode 230）。
工作分支：`fix/brand-launch-rounded-1.5.16`。交付版本：1.5.16 / versionCode 231。

## 原因与证据

用户提供的 `Screenrecorder-2026-11-12-08-38-41-337.mp4` 长约 2.355 秒。
约 0.5 秒的系统启动窗口直接显示无完整底色、无圆角轮廓的海浪；约 1 秒时，
该系统图尚在退场，原生圆角品牌图已出现，形成两个不同形状的海浪图。

`styles.xml` 的两个 `windowSplashScreenAnimatedIcon` 属性直接引用
`ic_launcher_foreground`。这是为 adaptive launcher icon 拆分的前景层，
其完整背景与轮廓依赖桌面图标的背景层和系统遮罩，不能单独用作品牌图。
原生 `BrandLaunchSurface` 又直接叠加 adaptive 背景与经过缩小补偿的前景，
虽然容器已有圆角，但海浪比例与 `public/brand/logo-symbol.svg` 不一致。

## 修改

- `dev/build/generateBrandIcons.mjs` 增加两个由既有品牌路径生成的完整矢量资源。
- `ic_brand_logo.xml` 自带原渐变背景、完整海浪与半径 28/120 的透明圆角。
- `brand_splash_logo.xml` 使用相同图形，在系统 288dp 容器内显示居中的 112dp 品牌图；
  透明留白使实际图形位于系统安全圆内。
- `styles.xml` 的兼容库与 Android 平台两个启动图标属性均接入完整品牌资源。
- `BrandLaunchSurface.kt` 改用完整图形，尺寸对齐原 HTML 品牌图的 112dp。
- 保持原有启动就绪、淡出及播放、导航、歌词时钟逻辑。

## 验证

- 图标生成脚本通过；原有桌面图标资源未发生变化。
- 类型检查及主题生成一致性检查通过。
- Vitest：`androidPageOwnership` 18 项、`launchSurfaceContract` 5 项，合计 23 项通过。
- Robolectric：`BrandIconRenderTest` 6 项、`BrandLaunchRenderTest` 5 项、
  `ChromeBootSeedTest` 4 项、`ChromeDrawGateTest` 3 项，合计 18 项通过。
- 真实 Android 资源 Canvas 检查覆盖 API 24 的旧图标、API 26/33 的完整圆角图，
  以及 API 31/33 的系统启动资源引用、透明圆角与安全圆边界。
- Compose API 34 原生图形栈检查覆盖经典／冰川的深浅色画面、128/400/800ms 动画帧、
  普通／减少动态效果的启动就绪与淡出、歌词舞台冷链接就绪回归。
- 人工查看生成的系统图标、经典深色、冰川浅色和动画帧截图，确认圆角轮廓和完整海浪。
- 首轮截图断言曾将渐变背景的两个不同位置要求为完全相同的像素值，失败差异为单通道 1；
  改为允许各通道 3 的局部渐变差异后重跑通过。资源自身透明圆角仍要求 alpha 为 0。

截图输出位于 `android/app/build/reports/brand-icons/` 与
`android/app/build/reports/brand-launch/`；构建与验证记录随本版本发布产物保存。

没有连接 Android 真机；小米桌面冷启动的系统转场、不同设备 DPI 和安装后的实际衔接
尚未验证，不能据此宣称真机冷启动测试通过。
