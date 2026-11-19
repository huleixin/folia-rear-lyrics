# 推荐系统 2.0 UI 专项 — 1.5.63 / 278

基线：2527dcd5b8523cc38d91c119d5e24ec0ce471c4c（1.5.62 / 277）。分支：feat/discovery-system-v2。实施日期：2026-11-17。最终源码 SHA 见 v1.5.63 标签与 Release；本报告与代码一起提交。

## 实际修改

- 推荐首页左右留白16dp，标题顶部留白由36降至16dp；保留原标题、副标题、玻璃顶栏及滚动体系。
- 漫游改为独立全宽 Hero，默认高度136dp、圆角20dp；字体放大时按内容自然增长。按钮至少44dp。
- 雷达三列等宽、间距10dp，图片下方独立显示名称及可换行说明；44dp播放触控区与文字分离。
- 每日推荐/心动模式/FM/排行榜按功能合并。每日推荐和FM进入原生来源选择面板；排行榜仅显示已有网易云/QQ新歌榜能力，并标注实际范围，没有扩充未验证全量榜单。
- 导出 calendar、radio、heart、chart-no-axes-column、grip-vertical、refresh-cw 原生图标。协议解析白名单与手机/平板渲染器同时支持 discoveryHero、radarCards、textActions。
- 来源管理移入推荐设置；全部推荐歌曲置于单曲模块；底部保留简洁刷新入口。
- 推荐设置成为现有 settings 原生页面目的地，五组设置复用原生控件。平台开关与权重同排，关闭后权重禁用。
- 三个偏好参数使用0–100%滑块，直接映射既有0–1参数，互不归一化。熟悉音乐是评分强度，不承诺固定队列占比。
- 模块可长按把手拖动、无障碍上下移动、开关显示；最终完整排列一次性提交现有持久化 store。恢复布局、恢复参数和清空偏好有确认面板。
- providerLabel 统一读取 zh/en/in 翻译：筛选短名、设置全名；保留未知源回退，不变更任何身份、账号、路由或缓存键。
- 新增推荐设置命令入口，移除已被替代的推荐设置底部面板。

## 设计对照及限制

已读取附件设计包的 README、HTML 和全部图片，参考首页及设置分组、卡片层级。设计 HTML 中的插画不是独立可复用素材。本版制作了原创静态 Canvas 矢量：漫游海岸、风格声波、时光钟面、探索帆船，颜色由现有主题 token 决定；没有使用整图背景、虚假推荐封面、实时渲染时钟或新依赖。它们并非原设计插画的完整复刻。

本轮当前消息没有可定位的两张“初步施工”实机截图附件，因此没有伪造前后对比。提供的是 Robolectric 使用生产 Compose 组件生成的渲染图，数据为明确的测试夹具，不是在线推荐或实机截图。

## 检查结果

| 检查 | 结果 |
| --- | --- |
| npm run typecheck（含主题一致性） | 通过 |
| Vitest：discovery、commandRegistryContract、androidPageOwnership、hooks/nativeSettingsDocument、services/nativeSettingsDocument、homeProviderIsolation、newReleaseCharts | 10文件，64通过，0失败 |
| Android：DiscoveryPresentationTest | 4通过，0失败 |
| Android：SettingsSemanticPageTest | 7通过，0失败 |
| Android：NativeSettingsDestinationTest | 1通过，0失败 |
| Android：PadHomeDensityTest | 7通过，0失败 |
| compileDebugKotlin / compileReleaseKotlin | 通过 |
| assembleDebug / assembleRelease（含资源、签名、lintVital） | 通过 |
| git diff --check | 通过 |

原生专项共19通过、0失败、0跳过。四套主题×393dp默认字体/320dp的1.3倍字体共8张卡片渲染图；设置四主题顶部/底部8张；禁用来源1张。图片位于 discovery-ui-1.5.63/。已人工查看冰川浅色首页、经典深色小屏首页、冰川浅色设置及深色设置底部，所有组合均有布局断言。

断言涵盖：Hero可用宽度/默认高度、雷达等宽、标题每行不省略且全部字符可见、独立播放点击、来源开关及权重禁用、滑块实际点击提交数值、完整模块排列、长按拖动仅一次提交、底部动作可达。TS覆盖实际模型和补丁到既有store的数据语义、来源双事件桥接及返回事件。其他设置目的地和平板首页作为公共组件回归。

测试曾揭示新增布局被协议白名单过滤，已修复。整页截图触发 Robolectric 的 Haze RenderScript Surface 空指针；因此设置截图改为生产 TySettingsPageView 内容，标题玻璃层不计入这组视觉证据；已有设置目的地/返回测试单独执行。没有修改生产模糊实现来规避测试。

## 尚未完成的实机验收

adb devices 无设备，未安装模拟器。尚未验证：真实账户的来源管理弹层衔接、页面进退及系统返回手势、整页顶栏模糊、首页底部导航/迷你播放器遮挡、播放中滚动、音频稳定性、真机帧耗时与性能、覆盖安装及旧数据保留。没有把编译或 Robolectric 当作这些项目完成。此次未重跑整个仓库全量套件，也未重新验证第三方在线接口。

算法、统一服务、Media3、队列、极简歌词、歌词舞台、AOD、Melox和底部导航动效源码未改。没有数据库迁移。使用既有底部安全区、152dp首页滚动留白和设置页安全区处理。原包名 io.github.huleixin.tingyu 保持，原签名 SHA256 为 a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d。

## 关键变更文件与回退

- NativeDiscoveryHome.tsx、DiscoveryHistoryPanel.tsx、MobileHome.tsx、MobileHomeSources.tsx：推荐呈现及来源入口。
- DiscoveryCards.kt、NativeHomePage.kt、PadHomePage.kt、NativePageModel.kt：卡片、间距、协议兼容。
- DiscoverySettingsPage.tsx、discoverySettingsModel.ts、DiscoverySettingsControls.kt：新设置目的地及控件。
- TySettings.kt、TySettingsModel.kt、useNativeSettingsDocument.ts、nativeSettingsDocument.ts、nativePages.ts：最小兼容协议扩展。
- providerLabel.ts、omni.ts、三个locale：平台展示文本。
- SettingsDialogHost.tsx、MobileSettingsLanding.tsx、useSettingsModalStore.ts、settingsCommands.ts：现有导航及命令体系接入。
- exportSettingsIcons.mjs、native_page_icons.json：图标映射。
- DiscoveryPresentationTest.kt、settingsPresentation.test.ts、nativeSettingsDocument.test.ts及命令快照：专项验证。

回退时在开发分支 revert 本轮 UI 提交，恢复1.5.62对应布局和面板；新设置沿用原store，没有需要逆向执行的数据迁移。已安装用户若发回退包，应继续增加 versionCode 并用原签名构建，不直接要求降级安装旧APK。未推送 main。


## SectionHeader 统一模块标题栏规范

所有推荐页与资料库同级模块标题栏统一复用 [NativePageWidgets.kt](android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePageWidgets.kt) 中的 `PageSectionHeading`，禁止在页面内联重复实现独立标题栏。

- **标题排版**：颜色 `PageInk`，字重 `FontWeight(650)`，手机端默认 `18.sp`（行高 `23.sp`），平板端 `20.sp`（行高 `25.sp`），标题与内容间距统一 `10.dp`。
- **右侧操作按钮**：透明背景、无胶囊底色、无描边、无阴影，最小触控高度 `48.dp`，保留原生 `chromeClickable` 点击反馈，文字 `13.sp`（`PageMuted`），图标 `16.dp`（`PageMuted`），图文间距 `4.dp`。
- **操作语义**：
  - 跳转完整列表：统一文案「全部」+ 右侧 `chevron-right` 箭头（不再使用「查看更多」）。
  - 刷新 / 换一批（`more == "next" | "refresh"`）：统一左侧 `refresh-cw` 旋转图标 +「换一批」，禁止附加右箭头，点击时图标旋转 360° 后自然停止。
