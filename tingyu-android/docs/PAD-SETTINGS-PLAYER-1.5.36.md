# Pad 播放器与全屏设置修复 1.5.36

基线 dc03aa70（1.5.35）；分支 feat/tablet-adaptive；versionCode 251；未合并 main。

## 修复

1. 状态栏安全区：MainSystemBars 在根 content 读取 systemBars/displayCutout 后会将 Insets 消费为 0。此前支持页重新读 WindowInsets 得到 0，造成标题覆盖状态栏。四个原生设置页现在从同一宿主传入 SettingsSafeInsets；独立组合场景才读取 safeDrawing。背景仍铺满窗口，内容避开状态栏和底部手势区。
2. 设置动画：桌面歌词、车载歌词、咖啡支持、交流群进入现有 ComposeChromeHost AnimatedContent，使用普通设置页的 PUSH/POP 曲线、时长、方向和尺寸策略。移除歌词设置的独立 ComponentDialog；配置、权限和业务继续复用原实现。退出完成前保留不透明页面层并阻断旧底栏动作；外部导航和销毁释放状态与回调。返回保留原来的设置索引及来源页，不向网页历史插入假页面。
3. Pad 更多菜单：按钮上报当前真实 bounds，转换成播放器局部像素坐标。菜单优先在按钮上方、右边缘对齐，受窗口边缘、顶部/底部安全区限制；短窗口可滚动。继续使用原菜单材质、动作和局部动画，不创建额外 Popup 窗口。手机保持原右下角定位。
4. Pad 横屏歌曲信息：只在横屏合并播放器中隐藏右侧小封面、歌名、歌手和短线；左侧完整歌曲信息继续显示。手机和 Pad 竖屏独立歌词页保留署名。继续使用原歌词引擎、播放时钟和切歌封面，不重建播放核心。

## 验证

前端定向回归 235 项、23 文件通过；类型和主题校验通过；网页构建与 Capacitor 同步通过。原生全量 1382 项通过，零失败、零跳过。Release 构建、签名结果和截图随证据包 summary.json 及日志交付。全屏设置截图覆盖经典、冰川浅色和冰川深色；测试显式提供非零 32dp 顶部、24dp 底部边距，模拟宿主已消费 WindowInsets 的环境。Pad 用真实 Compose 触摸打开更多菜单并验证与按钮的相对位置、工具动作；另测窗口边界，以及手机/Pad 竖屏署名保留。

JVM 软件 Canvas 的全屏 Haze 截图继续使用 SDK30 非模糊降级路径。未连接真实手机或平板；真实状态栏、刘海、系统权限窗口恢复、返回手势与 GPU 转场效果仍需安装验证。自动化截图不能等同实机端到端验收。

## 合并

请先安装预览包复测四页进出、系统返回、蓝牙权限返回、Pad 菜单及旋转。确认后按仓库流程合并，当前不自动合并 main。

## 修改文件

- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeSettingsDestination.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/MinimalMoreMenuPosition.kt`
- `android/app/src/test/java/io/github/huleixin/tingyu/chrome/NativeSettingsDestinationTest.kt`
- `android/app/src/test/java/io/github/huleixin/tingyu/chrome/NativeSettingsHostTest.kt`
- `android/app/src/test/java/io/github/huleixin/tingyu/minimal/ui/MinimalMoreMenuPositionTest.kt`
- `docs/PAD-SETTINGS-PLAYER-1.5.36.md`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/ComposeChromeHost.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/SettingsFullScreenFrame.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/lyrics/TingyuLyricsPlugin.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/MinimalLyricsPage.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/MinimalPlayerScreen.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/MinimalPlayerTools.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/MinimalTransport.kt`
- `android/app/src/test/java/io/github/huleixin/tingyu/chrome/LyricsFullScreenSettingsTest.kt`
- `android/app/src/test/java/io/github/huleixin/tingyu/chrome/PadPagesTest.kt`
- `android/app/src/test/java/io/github/huleixin/tingyu/minimal/ui/MinimalLyricsViewportTest.kt`
- `docs/ANDROID-PAGE-OWNERSHIP.md`
- `package-lock.json`
- `package.json`
