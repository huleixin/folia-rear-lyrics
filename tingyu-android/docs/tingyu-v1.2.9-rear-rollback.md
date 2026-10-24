# 听屿 Android 1.2.9：回滚 1.2.8 背屏布局改动

1.2.8 把阅读区尺寸、字幕带、宿主高度和多个样式的字号/画布尺寸一起改了，影响到了全部背屏样式，实际效果比 1.2.7 更差。

本版把 1.2.8 涉及的 1.2.8 背屏源码全部恢复到 1.2.7 的状态，仅保留版本号提升。新增的两个测试辅助文件（rear 专用排版模块、运行时夹具）一并移除，避免测试引用不存在模块。

## 回滚范围

- `src/utils/visualizerSurface.ts`、`ObsBrowserSourceApp.tsx`、`VisualizerShell`、`VisualizerRenderer`、`VisualizerSubtitleOverlay`、`VisualizerHarmonyOverlay`
- 各样式：classic、cadenza、partita、cappella、claddagh、monet、fume、still、tilt、pendolo、sonnet、tempera、lumiere、hanabi

因此背屏连同字幕、气泡、环形、莫奈、花火都回到 1.2.7 的布局实现；推荐页、资料库、搜索、设置、播放器与原生代码没有参与本次回滚，也未恢复任何此前精简的功能。

## 验证

- TypeScript 通过。
- `test/unit/visualizer`、背屏状态中继/时钟/传输与发布电源共 111 个文件、1237 项通过、1 项跳过。
- Android `assembleRelease` 成功，34 项原生单测通过。
- 版本 1.2.9 / versionCode 12，原包名 `io.github.huleixin.tingyu`、原签名 SHA-256 `a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d`。

## 限制

当前环境没有连接真机，也没有可用模拟器；我无法看到 1.2.9 安装后的实际背屏画面，无法声称视觉问题已经修复。这次只做恢复，目的是先回到已知可用状态。

如果 1.2.7 的某些样式仍有问题，需要在能拿到实际背屏截图的前提下按样式逐个改，每次只动一个样式，避免再出现全样式回归。
