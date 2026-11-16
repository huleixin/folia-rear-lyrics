# S1 测试报告

实际源码 1.5.62 / 277，施工分支 feat/discovery-system-v2。所有数据来自本机命令输出。

## 本次专项

TypeScript typecheck（含主题检查）：通过。Kotlin compileDebugKotlin：通过。Debug APK：通过。Release APK：通过。APK 实测包名 io.github.huleixin.tingyu，versionCode 277，versionName 1.5.62，签名证书 SHA-256 为 a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d。

专项测试：requestCache 3 项、ranking 5 项、preferences 4 项，加原生页面归属与设置页契约，多次复跑通过。酷狗既有歌单测试 96 项通过，证明保留的加载修复未回归。完整单元套件在排除已知基线失败文件后：826 个文件通过、1 个跳过，7658 项通过、2 项跳过，另有 5 个既有 sharedSongResources 环境拆除异常。

## 基线失败（不计入本次通过）

在干净基线 worktree 69f64785 复现：androidSettingsCleanup 2 项、settingsAnchorCoverage 1 项、uiLifecyclePolicy 1 项。完整套件另观察到 layerBoundaries 1 项、audioSourceSwitch 1 项、commandRegistryContract 快照 1 项、interfaceRegistry 1 项、topGlassBarContract 1 项、rearLspAodContract 1 项；其中 commandRegistryContract 与 storeContract 的差异由我新增的入口/设置键触发，前者已撤回多余入口并复测通过，后者按新增持久化键更新了快照。

## 设备验收

adb devices 为空。未执行真机或模拟器安装、逐帧录屏、四主题视觉、真实账号接口、长时漫游和 Android 帧耗时测试。不能把构建或单元测试视为这些验收已完成。Debug 与 Release 均成功构建，可覆盖安装。
