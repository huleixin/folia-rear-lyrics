# 听屿：设置精简、入口迁移与胶囊开关修正

## 最新要求

- 将原设置首页的「播放界面自动隐藏」移入「外观 → 视觉设置」，复用 AndroidImmersiveSetting 和原 folia_android_immersive_mode 持久化状态。首页移除该独立卡片；没有重写自动隐藏计时器、系统栏逻辑或歌词舞台。
- 修复开启时白点越界。原滑块同时带 Tailwind translate-x-6（生成 CSS 使用 translate 属性）和移动端 transform: translateX(20px)，两种位移叠加。紧凑开关现在仅使用独立 thumb 类和一套 transform：44×24px 轨道、18px 白点、上下左右端点留白 3px、开启位移 20px。支持减少动画偏好，没有用 overflow:hidden 掩盖位置错误。

## 按前轮确认继续完成的清理

截图中的列表是真实的通用命令面板，不是失效按钮；但手机端的播放、队列、搜索与设置已有直接入口。按用户确认移除 Android 通用命令列表入口、播放舞台「快捷命令」、底部通用命令按钮及对应开关/固定命令/打开列表快捷键配置。根列表事件和 Ctrl+K 不再打开；专用队列、音量等操作面板和命令执行基础设施继续保留，外接键盘的直接动作快捷键保留。网页/桌面通用列表继续使用原行为。

本轮隐藏或去重的设置：

| 项目 | 代码检查结果与处理 |
| --- | --- |
| 自适应屏幕分辨率旧开关 | Android 主窗口原生路径不使用该标志；隐藏旧 UI，保留原生兼容代码与存储值。有效的手机适配、保持亮屏继续保留。 |
| 记住主页卡片位置 | 未发现恢复 hook 接入页面；Android 隐藏入口，保留偏好和实现。 |
| 3D 卡片风格 | 状态有存储/同步，但未找到实际渲染消费者；Android 隐藏入口，不清除用户数据。 |
| 背屏与自动隐藏重复入口 | 背屏只在首页卡片保留；自动隐藏移到视觉设置。 |
| 经典控制栏自动隐藏、隐藏鼠标 | Android 手机使用既有统一主开关；隐藏不适用的经典附加项，保留旧值和非 Android 行为。 |
| 日志文件与内存监控 | 按真实 debug.available 能力显示，Android 不再显示无桥接支持的控件；会话内控制台日志保留。 |
| 始终显示主窗口标题控件 | 限 Electron，手机实验室隐藏；命令也限相同平台。 |
| 底部界面命名 | 改成「播放页控制栏」，避免与主页导航混淆；只改展示名。 |

导航搜索及设置锚点命令同步过滤 Android 隐藏入口。没有新增存储键，没有删除或迁移用户设置、收藏或歌单。四个资料库分类、音频能力检测、有效快捷键等保留。

## 修改文件

- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh-CN.ts`
- `src/components/command-palette/commandFactories.ts`
- `src/components/command-palette/CommandPalette.tsx`
- `src/components/command-palette/useCommandPalette.ts`
- `src/components/modal/settings/AndroidImmersiveSetting.tsx`
- `src/components/modal/settings/AppearanceSettingsSubview.tsx`
- `src/components/modal/settings/DeveloperSettingsSubview.tsx`
- `src/components/modal/settings/GeneralSettingsSubview.tsx`
- `src/components/modal/settings/InteractionSettingsSubview.tsx`
- `src/components/modal/settings/LabSettingsModal.tsx`
- `src/components/modal/settings/mobileSettings.css`
- `src/components/modal/settings/navigation/MobileSettingsNavigation.tsx`
- `src/components/modal/settings/navigation/settingsAnchorModel.ts`
- `src/components/modal/settings/navigation/settingsNavModel.ts`
- `src/components/command-palette/commands/settingsCommands.ts`
- `src/components/app/overlays/AppOverlays.tsx`
- `src/components/app/overlays/mobile-stage/MobileStageMenu.tsx`
- `test/unit/command-palette/commandRegistry.test.ts`
- `test/unit/settings/mobileSettings.test.ts`
- `test/unit/command-palette/__snapshots__/commandRegistryContract.test.ts.snap`
- `test/unit/command-palette/androidCommandRoot.test.ts`
- `test/unit/settings/androidSettingsCleanup.test.ts`

共 21 个现有源码/测试文件和 2 个新增测试文件，另附本说明。原生源码、播放器/歌词渲染器、镜头避让、背屏同步、推荐/资料库/搜索布局、Liquid Glass 与导航图标未修改。背屏装饰图及已校正的装饰 CSS 保留原状；移动端 CSS 仅更改此开关。

## 测试与构建

- 相关回归：18 个测试文件、231 项测试通过，包含设置检测与启停、设置导航、自动隐藏计时器和状态、命令根入口阻断、专用操作保留、歌单详情和 footer 切页逻辑。
- 完整命令面板单元测试：25 个文件、250 项测试通过（与上一组有重叠，不相加）。
- TypeScript 检查、Web 生产构建、Capacitor Android 同步通过。
- Android assembleRelease 成功；apksigner 验证通过，与上一版签名一致。
- 包名 io.github.huleixin.tingyu；版本 1.2.2 / versionCode 5；发布配置未变。
- 源码变化按基线逐文件检查，未发现上述范围之外的源码变化。519 个选定保护文件（含原生、visualizer、相关资源）哈希与基线一致；source ZIP 与当前源码逐文件比对，并排除私有签名文件、密码、实际环境配置、构建输出及依赖。

DOM/计时器测试使用 jsdom 与桥接替身；它不测真实 WebView 几何。当前 adb devices 无设备，浏览器本地预览仍受已有访问策略阻断，本轮没有新实机/模拟器截图，也未完成 360/393/430px 真实渲染、背屏逐字高亮和设备系统栏实测。未以构建成功代替这些验收。开关尺寸与位移关系已检查，仍需手机上确认实际观感。

## 安装与 GitHub

源码分支 tingyu/settings-cleanup；保留 main 下载说明分支。Release 以新提交为目标并发布为预发布，不改稳定版本。附件包含本报告、完整源码 ZIP、局部补丁、APK 和 SHA256 校验和。

请覆盖安装 Tingyu-Android-v1.2.2-settings-cleanup.apk；无需卸载或清除数据。此次前端改动已打进 APK，已有安装需要更新后才会生效。
