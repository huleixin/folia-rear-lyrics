# Android 三档界面外观适配（1.3.73）

## 基线与旧实现审计

基于 `origin/main` 的 `bd6bebf006c7c367cb77c8f5b54d9eff044d17b0`（1.3.72）；开发前再次用 `git ls-remote` 核对远端，未发现更新主线提交。

- `useThemeSettingsStore` 已保存 `isDaylight`、`followSystemTheme`；`useThemeController`、AI/封面主题和舞台渲染共用这些值。直接改这两个字段会改变舞台，不能作为新的普通 Android 界面开关。
- Web 已有 CSS 变量和部分 daylight 分支；移动首页、资料库、歌单和设置 CSS 仍有固定深色。
- Compose 原生页面使用固定深色背景、PageInk/PageMuted 等；ChromeMaterial 已有 light 参数，但移动底栏数据一直使用深色前景。
- NativeSettingsDocumentView 绘制 Web 计算样式快照，需要一次离散的主题刷新。
- MainSystemBars 原来固定浅色系统图标；Manifest 已声明 uiMode 配置变化，适合原地更新，无需重建 Activity。
- 正式版使用 Compose Chrome；旧 GlassNav 实验控制器不在当前正式渲染路径。

## 权威状态与迁移

在原有主题仓库增加 `interfaceAppearance: system | light | dark`，键为 `tingyu_interface_appearance_v1`，不改舞台 isDaylight、followSystemTheme、AI/custom/cover 偏好。

Android 原生 SharedPreferences 只保存同一偏好的启动镜像，由现有 TingyuChrome 桥接写入，不另设一个用户设置入口。Android UI Mode 通过配置事件和桥接查询同步，Web 监听 matchMedia，强制模式忽略系统变化。请求串行，旧模式请求和旧系统状态回包不得覆盖新设置。

老用户未保存过界面外观时默认保留原生浏览页原本的深色，不会根据某个 daylight 舞台突然改白。显式选项即时保存；Activity 重建时原生从镜像读取。新的普通界面偏好不会被歌词舞台的皮肤导入操作改写。

## 原生与 Web 覆盖

- InterfacePalette / LocalInterfacePalette 提供文字、次级文字、强调色、表面、边框、分隔线、选中态、按钮和背景渐变。深色分支返回原来的字面颜色及 alpha；封面上的艺术卡片白字不机械替换。
- 覆盖 NativeHomePage、NativeDirectoryPage、NativePlaylistPage、NativeSearchPage、NativeSettingsPage、PageInput、PageWidgets、SongSubtitle 所复用的颜色及支持/交流弹层。
- NativeSettingsDocument 通过 `tingyu-interface-appearance` 事件重新采集当前文档样式；不更换页面 key，不高频轮询，不清除滚动、输入或弹窗状态。
- ChromeMiniPlayer 与 ChromeNavigation 在现有 surface 上投影普通界面颜色；stage surface 原样返回。投影使用 remember，避免时钟更新额外创建 chrome 数据对象。
- 浅色玻璃使用柔和奶白灰绿 tint、深灰绿图标与翡翠绿选中态。深色材质、blur/lens 数量和参数保持原值，不添加整屏 GPU 图层。
- Web 通过普通界面限定的 CSS 作用域覆盖首页、资料库、歌单、搜索、设置、音源管理、睡眠弹层、普通 ThemedDialog、歌曲工具、迷你播放器、导航和状态提示。舞台根主题变量不变。
- 常规弹层、命令面板、添加歌单和音频工具使用相同界面选择器；Web/Electron 继续尊重其原有传入的主题值。
- MainSystemBars 维持透明 edge-to-edge，只按普通界面/舞台各自策略切换系统图标。Android 12+ 保存对应 starting-window theme；普通窗口启动底色使用原生镜像。

## 生命周期与保护边界

没有修改 NativeAudioEngine、FoliaPlaybackService、队列恢复、资源缓存、歌词选词/版本/偏移、MediaSession、睡眠定时器、LSP、Shizuku 或背屏相机避让。

不调用 recreate、不重建 WebView、不重新取歌词/封面、不重新启动整单缓存。新增订阅只响应设置、系统配置及恢复前台；没有新增逐帧/逐秒桥接或后台轮询。

## 实际验证

- TypeScript 检查通过。
- 主题/睡眠等直接相关前端单元测试：102 项通过。
- 扩展前端回归：435 项中 433 项通过，2 项失败。在独立的原版 bd6bebf 工作树复现相同失败：storeContract 的旧 localStorage 快照缺少已有洛雪键；playbackTestDeckIsolation 仍要求已变更的旧兼容通道命令。未修改稳定播放逻辑来迎合旧测试。
- Android Release JVM：825 项通过，0 失败。
- 补充命令面板/主题单测：352 项中 345 项通过；7 项旧失败在原版对应 83 项测试中逐项复现，涉及旧命令顺序快照、既有缺失文案和均衡器入口的旧前提。未修改命令注册和播放行为来掩盖这些失败。
- Android 仪器测试源码编译通过；新增 InterfaceAppearanceDeviceTest，可在设备上检查切换时 Activity/WebView/shell 身份及重建后的镜像恢复。当前没有连接 Android 设备，未执行仪器测试。
- Playwright：外观专项 6 项通过；连同睡眠/缓存卡片布局共 12 项通过。覆盖 320/393/588 宽度、24px 根字体、跟随系统变化、强制模式、组件重新挂载、普通弹层、输入和焦点保留、真实移动首页/资料库/歌单/搜索组件。
- Browser plugin 不可用，使用项目 Playwright。浏览器结果不等于 Android WebView + Compose + 真机 GPU 验证。
- 深色首页与独立运行于 4174 端口的 1.3.72 原版比较：393×852，共 334836 像素，仅 49 像素不同，位于右侧下一张推荐卡的露出边缘（x=380..392,y=321..330）。同一页面浅色→深色回切与初始深色截图逐字节一致。不是对所有 Android 原生页面的真机像素一致性承诺。
- 浅色截图检查发现并修复了首页小歌单卡片残留深底、弱化文字和操作按钮对比度不足；页面和歌单渐隐保持同一组背景渐变。主/次文字及强调色在页面、卡片、弹层底色上的对比度测试达到 4.5:1。
- 扩展的旧移动测试还存在过时前提：mobileLibrary 仍断言已不使用的 backdrop-refraction 属性；tingyuSearch 使用未对齐当前来源初始化的固定分类夹具。均在独立原版服务上复现，记录在 QA 日志，未把它们当成本次适配成功项。

## 截图与构建产物

本地 QA 目录：`tingyu-compose-phase1-qa`（工作区外层）。其中保存 light-home、light-library、light-playlist、light-search、light-settings-320/393/588、light-sleep 等 PNG，以及原版/当前深色对照、测试日志。

Release 使用原包名 `io.github.huleixin.tingyu`、versionName 1.3.73、versionCode 96；已核对与原发布证书一致：`a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d`。不会重置应用数据。

最终 Release 已完成 Vite Capacitor 资源构建、Capacitor 同步、Release JVM、仪器源码编译、lintVitalRelease 与 assembleRelease。最终 APK 重新核对包名、版本与签名，通过签名校验；包内包含新外观偏好键及功能源码提交 `7252ac7` 的构建标识。APK SHA-256 随安装包一起交付。

## 仍需真机验收

1. 小米 HyperOS 切换 UI Mode 的系统栏、手势条、启动页与键盘窗口；尤其系统对 starting-window theme 的缓存行为。
2. 播放过程中反复切换外观，核查音频连续、队列/睡眠定时/缓存任务不中断。
3. 真实 WebView + Compose 的全页面浅色截图、玻璃效果、系统大字体与窄屏布局。
4. Folia AI/自定义舞台、自动隐藏、横竖屏及背屏 LSP/Shizuku/灵动岛继续保持各自行为。
5. Android 12 以下启动页由旧系统控制，首次启动窗口到应用首帧的过渡仍需观察。

## 回滚

本功能在独立 `feat/android-interface-appearance` 分支，基线 bd6bebf。发布后应使用 git revert 回退本功能提交，再用更高 versionCode 构建；不要要求用户清除数据或卸载。新偏好键不会覆盖旧舞台设置，回滚版本可忽略它。

## 修改文件

（下列清单由最终工作区差异生成。）

- `android/app/src/androidTest/java/io/github/huleixin/tingyu/chrome/InterfaceAppearanceDeviceTest.java`
- `android/app/src/main/java/io/github/huleixin/tingyu/MainActivity.java`
- `android/app/src/main/java/io/github/huleixin/tingyu/MainSystemBars.java`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/ChromeMaterial.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/ChromeNavigation.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/ComposeChromeHost.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/InterfaceAppearance.java`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/InterfacePalette.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeDirectoryPage.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeHomePage.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePageInput.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePageView.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePageWidgets.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePlaylistBackdrop.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePlaylistPage.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeSearchPage.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeSettingsPage.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/PlaylistAffordances.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/PlaylistAmbientGradient.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/SupportSheets.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/TingyuChromePlugin.java`
- `android/app/src/main/res/values-night/interface_appearance.xml`
- `android/app/src/main/res/values/interface_appearance.xml`
- `android/app/src/main/res/values/styles.xml`
- `android/app/src/test/java/io/github/huleixin/tingyu/chrome/InterfacePaletteTest.kt`
- `dev/probes/interfaceAppearance.probe.tsx`
- `docs/ANDROID-APPEARANCE-1.3.73.md`
- `package-lock.json`
- `package.json`
- `src/components/app/AddToPlaylistHost.tsx`
- `src/components/app/dialogs/useAppDialogsModel.ts`
- `src/components/app/player-panel/usePlayerPanelModel.ts`
- `src/components/app/search/SearchWorkspace.tsx`
- `src/components/audio-tools/AudioToolsHost.tsx`
- `src/components/command-palette/CommandPalette.tsx`
- `src/components/modal/SettingsModal.tsx`
- `src/components/modal/UserGuideModal.tsx`
- `src/components/modal/settings/AppearanceSettingsSubview.tsx`
- `src/components/modal/settings/InterfaceAppearanceSetting.tsx`
- `src/components/modal/settings/LabSettingsModal.tsx`
- `src/components/shared/ThemedDialog.tsx`
- `src/hooks/useAppPreferences.ts`
- `src/hooks/useInterfaceAppearance.ts`
- `src/hooks/useNativeSettingsDocument.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/in.ts`
- `src/i18n/locales/zh-CN.ts`
- `src/library/app/GridViewOverlayHost.tsx`
- `src/library/app/LibraryAccountHost.tsx`
- `src/services/interfaceAppearance.ts`
- `src/services/nativeChrome.ts`
- `src/stores/useThemeSettingsStore.ts`
- `src/styles/interfaceAppearance.css`
- `test/component/interfaceAppearance.spec.ts`
- `test/unit/theme/interfaceAppearance.test.ts`
