# 听屿 Android 1.2.6：正面底部字幕避让播放控件

## 原因与调整

原共享底距按旧控制条预留：默认基线 32px 加净空 80px，即 112px。当前手机舞台的独立播放控件更高，多行译文会与控件重叠。

正面 MobileStageChrome 现在发布实际控件顶边与舞台底边之间的距离，再增加 24 CSS px 间距。共享字幕底距只在 PlayerBottomBarLayoutContext 为正面播放页时取原底距与实测净空的较大值；因此只会上移被控件遮挡的底部字幕，不移动中央歌词、背景或控件。

测量在布局阶段进行；ResizeObserver 与窗口/visualViewport resize 负责大小变化，RAF 仅合并尺寸事件，不增加持续循环，不用 React state 推进字幕位置。控件隐藏、关闭或卸载时清理信号与监听器。

## 背屏保护

- 没有修改任何 `src/components/rear/` 文件、背屏原生实现、摄像头避让、右侧视觉重心、歌词时序、逐字动画。
- 背屏/预览没有正面底栏 Provider，新的净空被忽略。背屏 VisualizerSubtitleOverlay 原有 `18%` 定位分支完全保留，没有修改任何 visualizer 文件。
- 原有字号、文字、透明度、播放控件尺寸与手势不变；多行字幕按自身高度向上展开。

## 验证与限制

- 11 个测试文件、75 项针对性测试通过：360/393/430 CSS px 的控件边界与多行字幕几何、隐藏/卸载清理、真实共享 hook 在正面与非正面宿主的隔离，以及现有背屏 viewport、时钟、同步、睡眠与共享状态测试。
- TypeScript 类型检查通过，32 项 Android 原生单测通过，正式前端构建、Capacitor 同步与 assembleRelease 成功。
- 版本 `1.2.6` / versionCode `9`；原包名 `io.github.huleixin.tingyu` 与原签名保持不变，可覆盖安装。
- 没有连接 Android 真机或可用模拟器，浏览器预览受环境策略限制。本轮没有实际设备截图，几何测试不是 WebView 视觉验收；请安装 APK 后用多行译文确认实机间距。

## 修改文件

- `package-lock.json`
- `package.json`
- `src/components/app/overlays/mobile-stage/MobileStageChrome.tsx`
- `src/hooks/usePlayerBottomBarBottomPx.ts`
- `src/utils/mobileStageSubtitleClearance.ts`
- `src/components/app/overlays/mobile-stage/useMobileStageSubtitleClearance.ts`
- `test/unit/hooks/mobileStageSubtitleClearance.test.ts`

源码分支 `tingyu/subtitle-clearance-v1.2.6`；标签 `tingyu-v1.2.6-subtitle-clearance`。
