# Pad 自适应 1.5.30 验收记录

分支：`feat/tablet-adaptive`，基线：`35a36f96`（1.5.29），版本代码 245。没有修改或合并 main。

## 六阶段清单

| 阶段 | 代码实现 | 阶段验证 |
|---|---|---|
| 1 共享窗口与外壳 | PadWindow 按 Compose 实际窗口 dp 投影；≥840dp 宽且≥480dp 高进入大屏；横屏启用左右播放器。Pad/多窗口离开舞台不强制竖屏；手机方向策略保留。专用窄导航与大屏迷你条复用既有动作。 | PadWindowTest、StageOrientationTest、NativeFooterLayoutTest；阶段 1 编译和测试成功。 |
| 2 推荐 | 真实 hero 图片堆叠；5.5 秒切换；左右手势、手动操作后暂停；非前台生命周期暂停；右侧最近播放最多四项 2×2；歌单 4–5 列。 | 阶段 2 Kotlin 编译通过；最终 Compose 点击及经典/冰川明暗截图。 |
| 3 资料库 | 横屏保留目录在左、详情在右；空选择提供提示；来源、分类、排序、过滤、分页沿用现有组件。React 目录在详情打开时持续提供动作；原生 sidecar 仅在当前导航、启用模型及对应会话受理；原返回栈保留。 | TypeScript、Kotlin；独立左右动作测试；目录返回监听避免抢详情返回。 |
| 4 搜索 | 顶部标题/输入/来源/分类保留；搜索前历史与真实热搜分栏；综合单曲与其他分类分栏；歌手/专辑/歌单两列卡片，单曲保留分页列表。无平台数据就不造模块。 | Kotlin 编译；Compose 热搜点击、各主题呈现；既有分页缓存复用。 |
| 5 设置 | 首页分组双栏；Pad 窗口隐藏 rear 分组；手机保留；普通无 layout 设置子页分组双栏，带声明式 layout 的子页继续复用其既有自适应布局。 | Compose 经典/冰川明暗、800dp 窄窗与393dp 手机入口检查。 |
| 6 播放器 | 横屏封面/传输与逐字歌词左右组合；保留 cover controller、位图缓存、唯一页面时钟；竖屏仍 pager；右侧歌词可 Seek，使用既有 commands。迷你条喜欢/上一首/下一首/进度走既有 handlers。 | Compose 真实歌词呈现、导航与迷你条点击；原歌词时序、播放时钟、封面事务单测。 |

## 实际验证及限制

- TypeScript、主题生成一致性检查通过。
- Vitest 3 文件 47 项通过：Android 页面归属、工具动作及在线恢复控制器。
- Robolectric 8 测试类 54 项通过：PadPagesTest 4、PadWindowTest 1、StageOrientationTest 12、NativeFooterLayoutTest 12、HostToolsActionsTest 1、MinimalPlaybackTest 10、MinimalLyricTimingTest 8、CoverStackControllerSkipTxTest 6。
- PadPagesTest 用 SDK30 Native Graphics 生成 18 张截图，覆盖经典/冰川浅深、目录双栏、播放器、搜索、设置、导航及迷你条、窄窗、手机。最初 SDK34 的 Haze RenderScript Surface 在 Robolectric 不可用；改用 SDK30 的官方无模糊降级绘制后检查布局。**不将 SDK30 截图当作 Android12–16 GPU 模糊验证**。
- Release 同一 APK 构建通过；签名/版本与 SHA256 随产物交付。
- adb 无连接设备，SDK 无 emulator：没有执行真机/模拟器安装、真实音频、真实账号平台数据、系统旋转和多窗口、蓝牙或长时间耗电性能验证。静态窗口投影与 Compose resize 测试不能代替系统分屏。
- 截图使用可控测试模型，缺失网络封面时显示既有占位，不代表账号真实歌单截图。没有虚构平台热搜。
- 无法在当前环境证明所有页面已逐像素还原设计稿；搜索图中平台未提供的推荐/MV/电台模块没有添加。特殊声明式设置预览、复杂本地导入/登录弹层仍依赖既有组件，需在真机逐项验收。
- 窄于600dp的分屏回到手机紧凑布局，背屏入口随紧凑布局可重新出现；未按设备型号强制隐藏。

## 修改文件

Android 主源码：

- `MainActivity.java`、`StageOrientation.java`
- `chrome/PadWindow.kt`、`PadNavigation.kt`、`PadHomePage.kt`、`PadSearchPage.kt`、`PadSearchGrid.kt`、`PadSettingsPage.kt`
- `chrome/ComposeChromeHost.kt`、`NativePageView.kt`、`NativeHomePage.kt`、`NativeSearchPage.kt`、`NativeSettingsPage.kt`
- `chrome/ChromeNavigation.kt`、`ChromeMiniPlayer.kt`、`ChromeStagePlayer.kt`、`NativeFooterLayout.kt`、`TySettings.kt`
- `minimal/ui/MinimalPlayerScreen.kt`、`minimal/ui/MinimalCoverPage.kt`

React/桥：`src/hooks/useNativePage.ts`、`src/library/app/GridViewOverlayHost.tsx`、`src/library/suites/mobile/MobileHome.tsx`、`src/services/nativeMinimalTools.ts`、`src/App.tsx`。

测试：`chrome/PadPagesTest.kt`、`chrome/PadWindowTest.kt`、`StageOrientationTest.java`、`test/unit/nativeMinimalTools.test.ts`。版本：`package.json`、`package-lock.json`。

## 合并建议

先从独立分支安装预览包；在手机393dp竖屏、Pad1280×800横屏/800×1280竖屏及600/840dp分屏边界检查六阶段。使用同一真实账号测试分页、左右目录点击与返回、暂停/Seek/切歌、旋转后播放连续性、前后台恢复与三套主题。GPU 模糊和大屏拖动至少实机录屏检查一次。完成后再创建或转正面向 main 的 PR，审查本文件列出的限制；本轮不自动合并。
