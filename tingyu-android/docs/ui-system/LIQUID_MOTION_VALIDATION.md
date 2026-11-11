# Liquid Motion 验证记录（历史 motion-test.1）

最新 1.5.6 正式版见 [LIQUID_MOTION_RELEASE_1.5.6.md](LIQUID_MOTION_RELEASE_1.5.6.md)。本页记录的是较早测试包；其主题切换缺陷已在正式版修复。

日期：2026-11-11。本次修改保存于当前工作区，基于提交 029d20237990e5dee13dda491897a74189b341b4；尚未提交/推送远端。完整覆盖清单见 MOTION_SYSTEM.md。

## 安装包

- 文件：outputs/Tingyu-1.5.5-motion-test.1.apk（工作区顶层 outputs 目录）。
- 显示名：听屿动效测试。
- 包名：io.github.huleixin.tingyu.motiontest，与正式版并存、数据独立。
- 版本：1.5.5-motion-test.1，versionCode 22001。
- 大小：51,917,873 字节，约 49.51 MiB。
- BUILD_ID：1.5.5@029d2023-dirty。dirty 表示本次未提交的修改已参与构建；精确文件身份以以下 SHA-256 为准。
- APK SHA-256：e34a019b7964fb9fd7a3614fe1924b3d72bceb8e50acbb2e41a5f1d942050bbb。
- 签名证书 SHA-256：a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d。
- apksigner 验证通过，v2/v3 签名有效；zipalign -c -P 16 4 验证通过。
- minSdk 24，targetSdk 36；包含 arm64-v8a、armeabi-v7a、x86、x86_64。
- COMPOSE_CHROME / COMPOSE_MINIMAL_PLAYER / NATIVE_PLAYBACK 为 true；PLAYBACK_ENGINE_TEST / GRAPHICS_DIAGNOSTICS 为 false。

执行 npm run build:motion-test：完整 Vite 构建、Capacitor 资源验证/同步、反馈面板校验、Android release 编译与打包均通过。最终 APK 构建没有使用 tingyuAllowStaleWebAssets。构建输出明确确认最新源文件 ThemedDialog.tsx 已入包。

额外逐文件比较 APK 与本次 dist 的 2,188 个文件，SHA-256 全部一致；检查了两份 MIT 许可已打包，BUILD_ID 存在于 DEX。独立输出目录内的 APK 与编译产物哈希一致。

## 自动化结果

共 99 项相关检查通过，另有类型检查、主题生成校验及完整打包。

| 检查 | 通过数 | 验证范围 |
| --- | ---: | --- |
| LiquidMotionTest | 8 | 容器边界、进度、减少动态效果、共享封面绑定/嵌套返回等 |
| NativePageRetentionTest | 9 | 页面保留及恢复 |
| NativeRouteFenceTest | 3 | 路由交接及迟到状态 |
| NativeStartupMotionTest | 6 | 初始绘制及启动动效状态 |
| StageSettingsHandoffTest | 5 | 舞台到原生设置绘制完成握手 |
| StageSubtitleLayoutTest | 1 | 主屏/背屏字幕布局分支 |
| TyPanelHostTest | 10 | 面板会话/宿主状态 |
| TyPanelTest | 8 | 面板交互及关闭 |
| Web 舞台/返回单元测试，7 文件 | 23 | modalBackStack、nativeStagePresentation、ShellCommit、SubtitleBottom、Return、Orientation、Commit |
| Android 页面归属检查 | 18 | 普通页面仍由 Compose 拥有 |
| liquidMotion.spec.ts | 6 | 弹簧落定、内外点击、焦点限制/恢复、父层退出保留、快速重开/Escape、一次性操作、父层刷新、减少动态效果/返回 |
| nativeLandscapeSubtitle.spec.ts | 2 | 横屏主屏字幕随控件贴底；背屏间距独立 |

原生 8 个测试类全部 failures/errors/skipped 为 0；最新 Gradle 测试耗时 21 秒。浏览器最新动效组 6 项耗时 36.8 秒；另外 2 项字幕用例在本次较早的联合执行中通过，表中不重复计数。

原生测试使用 Robolectric LEGACY 图形模式，以绕过当前 Windows 环境原生 Skia 崩溃问题；这些结果验证状态、几何和组合行为，不能视作 GPU 截图或真机性能通过。浏览器测试使用本机 Chrome，真实面板截图已人工查看。

最终 npm run typecheck（含 theme:check）和 npm run check:android-ui 通过；git diff --check 无空白错误。没有增加全列表逐帧布局/模糊动画；播放器使用保留画布绘制层变形，列表仍惰性渲染。

## 复现命令

PowerShell 环境设置：

    $env:JAVA_HOME='C:/tb/jdk21/jdk-21.0.13.0.2+1'
    $env:ANDROID_HOME='C:/Users/DELL/AppData/Local/Android/Sdk'
    $env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'

应用目录：

    npm run typecheck
    npm run check:android-ui
    npx playwright test test/component/liquidMotion.spec.ts test/component/nativeLandscapeSubtitle.spec.ts --project=components --workers=1
    npm run build:motion-test

android 目录的原生目标测试：

    ./gradlew.bat :app:testDebugUnitTest --tests '*LiquidMotionTest' --tests '*TyPanelTest' --tests '*TyPanelHostTest' --tests '*StageSettingsHandoffTest' --tests '*NativePageRetentionTest' --tests '*NativeRouteFenceTest' --tests '*StageSubtitleLayoutTest' --tests '*NativeStartupMotionTest' --console=plain

开发阶段仅运行 JVM 测试时曾使用资源时效跳过参数；安装包及上述最终交付检查均使用完整新资源。

## 未具备条件与真机验收

本机没有已连接的 adb 设备，也没有可用 Android 模拟器，未执行真机自动化、帧率/耗电测量或双屏视觉验证。需要在设备上确认：

1. 迷你栏展开、快速返回/重复点击、前后台恢复过程中无残影、白屏或触摸穿透。
2. 歌单封面在滚动、加载失败、重复入口、嵌套返回、非方形封面时的位置与裁剪衔接。
3. 舞台打开设置/舞台外观的 WebView 与 Compose 首帧交接。
4. 系统预测返回手势、软键盘、屏幕旋转和无来源播放器入口。
5. 主屏横屏字幕、背屏与灵动岛原有行为。
6. 不同刷新率/系统动画倍率/减少动态效果下的实际帧率及连续主题切换。

构建保留现有 Gradle/API 弃用提示；浏览器测试有已有插件重复注册与测试环境禁止 Service Worker 的提示，未导致上述目标检查失败。

## 证据文件

工作区顶层 outputs/liquid-motion-verification.json 保存 APK 元信息、修改文件指纹和原生测试统计；outputs/liquid-motion-evidence/ 保存构建/测试日志、JUnit XML、逐资源指纹。outputs/Tingyu-1.5.5-motion-test.1.sha256 可用于下载后核对。
