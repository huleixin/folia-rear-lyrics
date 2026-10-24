# 听屿 Android：手机设置精简与功能归位

本轮依据真实消费代码审核截图设置，仅调整 Android 设置入口、归属、说明和可用状态。没有清空旧偏好，没有删除兼容数据，也没有改播放器核心。

## 已从 Android 设置界面移除

| 原入口 | 检查结论及处理 |
| --- | --- |
| 明暗模式 | 按用户确认移除切换入口；听屿手机界面保持原深墨绿视觉。 |
| 拼贴墙外观及其性能优先、边缘圆角、海报聚焦、颜色温度 | 服务旧版 Lattice 组件，不控制当前手机版歌单/歌曲列表，移除整组入口。 |
| 网格卡片：全面铺封面、最小尺寸、透明度 | 服务旧版 GridView，当前手机布局不使用，移除整组入口。 |
| 旧版播放中信息卡外观 | 当前手机版使用原版迷你播放器，移除旧卡片设置，不改迷你播放器。 |
| 进度条右侧按钮槽位与偏移 | 手机歌词舞台 MobileStageChrome 自带固定控制布局，不消费这些槽位，移除误导入口。 |
| 自定义键盘快捷键、旧网格命令入口及快捷键帮助 | Android 手机不再展示；移除空的“交互控制”导航。帮助改为已有触控播放、进入歌词舞台和队列的说明。 |
| 实验室的旧隐藏控制条/右侧按钮、信息卡关闭、常驻返回/切歌配置 | 对应旧版播放器控件；手机自己的返回/切歌控件及自动隐藏继续保留。移除旧实验室页入口。 |
| 关闭主页动态背景、Linux 歌词卡死修复、桌面原生模糊 | 不适用于当前 Android 手机主页或属于桌面排障，不再展示手机入口；没有擅自清空底层兼容值。 |
| 旧拼贴、信息提示条、集合变形的减少动画开关 | 当前手机没有对应界面，不再展示。 |

这里的移除是 Android 运行时不创建这些控件、导航和无效命令目的地；共用网页/桌面组件及兼容存储仍保留，避免破坏外观导入和旧配置。

## 确认有效并保留、优化

| 功能 | 真实消费位置和本轮处理 |
| --- | --- |
| 进入应用后自动播放 | useSessionRestoreController 使用 autoPlayOnLaunch；从实验室移到“播放控制 → 启动播放”，沿用原开关和存储。 |
| 隐藏底部字幕层 | App/VisualizerModel 实际消费 hidePlayerTranslationSubtitle；移到“视觉设置 → 播放显示”，注明只影响正面底部字幕，不关闭背屏同步。 |
| AI 主题连接配置 | aiThemeClient/主题生成链路仍可使用；从实验室移到“视觉设置 → AI 主题”，复用原配置与连接测试组件。 |
| 点击歌曲后进入播放页或留在原页 | useAppNavigation 实际消费；改成“点击歌曲后的去向 / 打开歌词舞台”，不改变 player/stay 数据值。 |
| 歌单、电台、专辑、本地分类开关 | useLibraryHomeSources 实际影响资料库分类，改称“资料库分类”；保留所有分类与数据。 |
| 屏幕常亮 | 现有 Android 窗口标志生效，保留。 |
| 手机适配 | 原生方向锁定与紧凑布局生效，保留并说明仅在显示比例/方向异常时使用。 |
| 歌词舞台静态模式 | 真实控制舞台背景，明确命名，保留原实现。 |
| 动画帧率上限 | FrameRateLimiter 实际生效，说明只限制动画刷新，不改变音乐速度，实际帧率受设备限制。 |
| Monet 背景、界面微动效、设置平滑滚动、跟随系统减少动态效果 | 均有实际消费。系统强制减少动态效果时显示实际开启状态并禁用单项开关；关闭跟随系统后恢复个人选择，不覆盖个人值。 |
| 播放界面自动隐藏 | 保持在视觉设置，沿用原状态与逻辑，未重做。 |

## 验证和限制

- TypeScript 类型检查通过；453 项前端自动测试通过（49 个测试文件）。包括新增的真实状态持久化、旧路径防空白、平台隔离、系统减少动态效果状态测试。
- Android 原生测试 32 项通过，Gradle testReleaseUnitTest + assembleRelease 成功；签名沿用原签名，包名和版本配置不变。
- 回归覆盖设置、命令、启动懒加载、蓝牙媒体信息发布、资料库、底栏切换、背屏时钟与视口策略。自动测试不代表已验收实际蓝牙车机或小米背屏硬件。
- 保护文件哈希比较未发现本轮范围外修改；没有改 CSS、原生 Java、首页/资料库/搜索内容、Liquid Glass、歌词渲染/避让、播放器核心和用户存储。
- adb devices 没有连接设备，SDK 未提供可用模拟器；浏览器预览仍受此前保存策略限制。因此本轮没有实际渲染截图，没有 360/393/430px 真机视觉结果，也没有虚构性能提升或功能实测。
- 需要安装本次 APK 才能使用这些更新；原签名支持正常覆盖安装，请保留应用数据。

## 修改文件

- `src/i18n/locales/en.ts`
- `src/i18n/locales/in.ts`
- `src/i18n/locales/zh-CN.ts`
- `src/components/command-palette/commandFactories.ts`
- `src/components/modal/SettingsModal.tsx`
- `src/components/modal/playback-entry-view/PlaybackEntryViewOptions.tsx`
- `src/components/modal/settings/AndroidPhoneFitSetting.tsx`
- `src/components/modal/settings/AppearanceSettingsSubview.tsx`
- `src/components/modal/settings/GeneralSettingsSubview.tsx`
- `src/components/modal/settings/GraphicsSettingsSubview.tsx`
- `src/components/modal/settings/InteractionSettingsSubview.tsx`
- `src/components/modal/settings/LabSettingsModal.tsx`
- `src/components/modal/settings/MotionReductionSettingsSection.tsx`
- `src/components/modal/settings/PlaybackEntryViewSection.tsx`
- `src/components/modal/settings/PlaybackSettingsSubview.tsx`
- `src/components/modal/settings/SettingsSectionHeader.tsx`
- `src/components/modal/settings/navigation/settingsAnchorModel.ts`
- `src/components/modal/settings/navigation/settingsLastSection.ts`
- `src/components/modal/settings/navigation/settingsNavModel.ts`
- `test/unit/settings/androidSettingsCleanup.test.ts`
- `test/unit/settings/mobileSettings.test.ts`
- `test/unit/settings/settingsAnchorCoverage.test.ts`
- `test/unit/settings/settingsNavModel.test.ts`
- `src/components/modal/help/MobilePlaybackHelp.tsx`
- `src/components/modal/settings/MobilePlaybackStartupSetting.tsx`
- `src/components/modal/settings/MobilePlayerDisplaySetting.tsx`
- `test/unit/settings/mobileSettingsCapabilities.test.ts`

## 交付

源码分支 `tingyu/mobile-settings-prune`，Release `tingyu-v1.2.2-mobile-settings-prune`。附 APK、对应完整源码 ZIP、局部补丁、此报告、范围校验与 SHA256 校验和。main 下载入口分支未修改。
