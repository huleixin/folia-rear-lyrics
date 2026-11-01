# 听屿 1.3.74：迷你播放器原生定时菜单

基线：GitHub main `9a5a58cfa56784b6aab50e97c968fdfaa22d0d3c`（tingyu-layout-1.3.73），开发及交付前再次检查远端，没有更新提交。版本 1.3.74，versionCode 97。

## 现有实现审计

现有 SleepTimerController 已负责原生到期、曲尾拦截、任务代次和持久化，nativeSleepTimer.ts 将状态同步至 useSleepTimerStore；这些能力继续复用。原来的完整舞台更多菜单只负责打开已有 React 睡眠设置。本次移除该菜单入口，在实际 Compose 迷你播放器中增加入口，不修改首页内容，不新建定时执行器。

审计发现原生控制器只有一个 observer 字段；加入 Compose 订阅会替换 Capacitor 的 JS 订阅。改为去重多订阅，每个观察者异常独立处理，不改到期、调度、曲尾拦截和播放控制代码。Android 编辑时长为零不得只在 JS 中取消正在运行的原生任务；现在仅保存草稿，由明确的取消操作结束原生任务，Web/Electron 原行为保留。

## 宽度与视觉

使用 ChromeMiniPlayer 的真实 BoxWithConstraints 可用宽度选择紧凑布局，并读取月亮实际 boundsInRoot 作为浮层锚点。NativeFooterLayout 未改动。

| 屏幕宽度 | 迷你播放器宽×高 | 质量/月亮/播放/队列宽 | 歌名可用宽 |
| --- | --- | --- | --- |
| 320dp | 300×46dp | 30/40/42/38dp | 98dp |
| 360dp | 340×46dp | 36/42/42/42dp | 126dp |
| 393dp | 373×46dp | 36/42/42/42dp | 159dp |

保留封面34dp、歌曲双行信息、音质、播放进度环、播放暂停、队列与原来的玻璃材质；歌曲名仍可省略，不删除功能。月亮位于音质与播放之间，设置后薄荷绿并显示约剩余分钟，曲尾等待不显示虚假时间。

浮层是既有 Compose Scene 内的一个表面，不新增 Window、Dialog 或 Bottom Sheet。快捷视图和高级视图共享底部锚点，宽度随屏幕与安全区域收缩，短屏内容可滚动。点击外部或返回关闭；路由切换、失焦和后台关闭菜单，不取消定时。

复用 chromeGlass 的原 blur/lens 参数，仅新菜单添加局部主题 tint。普通菜单切换180ms，遵循 reducedMotion。没有修改全局玻璃参数、顶底栏材质或首页。

## 交互与权威

- 15/30/60分钟：直接调用现有原生 start，无二次确认。
- 本曲结束：原生 track 模式，等待当前曲自然结束；无虚假倒计时。
- 自定义 / 更多选项：在同一浮层切换，小时0–24、分钟0–59，最大24小时；零时长禁用开始，24小时不允许再加分钟。
- 高级视图支持 deadline、track、deadline_track 三种已有模式。
- 开始成功关闭；失败保留菜单并显示原生错误。重新打开读取当前原生剩余时间，不重启任务；修改草稿不会提前改截止时间。
- 取消只调用现有原生 cancel；不会清队列或修改播放位置。
- 最新原生开始事件把时长写入现有 sleep_timer_hours / sleep_timer_minutes 偏好。任务状态、代次和截止时间继续由原生掌管；旧事件与到期后的曲尾等待转换不会覆盖新偏好。
- MiniSleepSnapshot 仅用于显示，根据 elapsedRealtime 外推剩余时间，不能触发暂停、到期或重启任务。关闭菜单后仅按分钟更新徽标；菜单打开才每秒更新显示。不可见时停止 UI 计时与订阅。
- Activity 重建重新订阅同一个原生控制器；服务和 WebView 生命周期规则未改动。

## 修改文件

生产 Kotlin：
- android/app/src/main/java/io/github/huleixin/tingyu/chrome/ChromeMiniPlayer.kt
- android/app/src/main/java/io/github/huleixin/tingyu/chrome/ChromeModel.kt
- android/app/src/main/java/io/github/huleixin/tingyu/chrome/ComposeChromeHost.kt
- android/app/src/main/java/io/github/huleixin/tingyu/chrome/MiniSleepPresentation.kt（显示模型、实际宽度策略、锚点几何）
- android/app/src/main/java/io/github/huleixin/tingyu/chrome/MiniSleepUi.kt（现有原生任务的 UI 订阅）
- android/app/src/main/java/io/github/huleixin/tingyu/chrome/MiniSleepMenu.kt（月亮、快捷及高级菜单）

生产 Java / JS：
- android/app/src/main/java/io/github/huleixin/tingyu/playback/SleepTimerController.java（仅观察者管理）
- src/components/app/overlays/mobile-stage/MobileStageMenu.tsx（移除舞台入口）
- src/library/suites/mobile/MobileMiniPlayer.tsx（传递已有时长偏好）
- src/services/nativeChrome.ts（偏好字段）
- src/services/nativeSleepTimer.ts（现有偏好同步及旧事件保护）
- src/stores/useSleepTimerStore.ts（原子更新既有时长偏好、Android 草稿不取消原生任务）

测试、构建和说明：
- android/app/build.gradle（仅 androidTest 的 Compose UI 测试依赖）
- android/app/src/debug/AndroidManifest.xml
- android/app/src/debug/java/io/github/huleixin/tingyu/chrome/MiniSleepPreviewActivity.kt
- android/app/src/androidTest/java/io/github/huleixin/tingyu/chrome/MiniSleepMenuDeviceTest.kt
- android/app/src/test/java/io/github/huleixin/tingyu/chrome/MiniSleepPresentationTest.kt
- test/unit/services/nativeSleepTimer.test.ts
- test/unit/stores/nativeSleepTimerPreferences.test.ts
- test/component/mobileStageChrome.spec.ts
- package.json / package-lock.json
- docs/ANDROID-MINI-SLEEP-1.3.74.md

未修改 NativeAudioEngine、FoliaPlaybackService、队列恢复、统一资源缓存、Folia舞台绘制、LSP/Shizuku 或灵动岛协议。debug-only 预览 Activity 使用静音媒体测试会话，排除在 Release 包外，不加入正式产品播放链路。

## 实际测试与截图边界

- TypeScript：通过。
- 6个相关前端单测文件：27项通过，覆盖原生状态、旧事件、失败、取消、已有偏好、Android草稿与Web原行为。
- Android Release JVM：830项通过，失败/错误/跳过均0；新增5项验证宽度、1/2/3密度与320/360/393、短屏锚点、本曲等待、单调时钟、重开菜单不重置。
- Playwright组件回归：5项通过，覆盖舞台入口移除及原有睡眠设置。浏览器不能执行 Compose。
- 原生仪器测试：Kotlin与Java编译通过，**未在设备执行**。新增5项覆盖快捷设置/修改/取消/Activity重建、双主题三宽度截图、无播放会话失败、锁屏曲尾状态、多订阅异常隔离。
- 辅助浏览器布局对照：320/360/393×浅深色×快捷/高级，共12组容器边界检查通过。这是按 Kotlin 参数制作的独立静态布局对照，**不是 App 实际 Compose 渲染截图，也不是 Android 验收证据**。Release附件中的 layout-comparison 图片带有该标注。
- 当前没有连接 Android 真机；已尝试 API35 模拟器，但环境缺少虚拟化驱动，软件加速启动也失败，因此没有产出真实原生截图，不将编译成功写作仪器测试通过。

仍需小米17 Pro实测：月亮触控与菜单位置、实际 GPU 玻璃与明暗主题、系统字体放大、手势区域、成功/失败及连续修改、Activity重建、后台锁屏、曲尾停播无下一首短暂出声、退出后音乐连续性。原有原生到期/锁屏可靠性不因本次 UI 编译通过而视作重新真机验收。

## 构建、签名与回滚

Release APK将按既有签名配置构建，保持包名 io.github.huleixin.tingyu 与原发布证书；构建及签名核验记录见下方最终结果。没有提交或上传私钥、密码或用户资源。

回滚源码：revert本次功能提交，保留1.3.73全部修复；发布回滚应使用更高 versionCode 并沿用原签名，避免卸载/清数据。纯回装旧APK可能被Android降级限制，不建议卸载来回滚。

