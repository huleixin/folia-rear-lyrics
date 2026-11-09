# TOP_GLASS_BAR — 沉浸式毛玻璃顶栏（Haze 内核）

> TingYu Design System 正式组成。组件：`chrome/TopGlassBar.kt`（Compose 公共能力），
> 渲染内核 = 开源库 **Haze**（`dev.chrisbanes.haze:haze:1.6.10`，Apache-2.0，
> https://github.com/chrisbanes/haze）。
> 三端参数由 `test/unit/ui/designTokenParity.test.ts` 门禁锁定，结构契约由
> `test/unit/ui/topGlassBarContract.test.ts` 门禁锁定。

## 0.1 依赖选型（为什么是 Haze 1.6.10）

| 版本 | 传递依赖 | 结论 |
|---|---|---|
| 2.1.0 / 2.0.x | Kotlin 2.4.2x + Compose（JB）1.12.x（→ androidx 1.12） | ❌ 会强制升级 Kotlin/Compose，违反约束 |
| 1.7.3 | Kotlin 2.3.20 + Compose（JB）1.12.0 | ❌ 会把 androidx Compose 抬到 1.12 |
| **1.6.10** | **Kotlin 2.1.0 + Compose（JB）1.8.0** | ✅ 低于项目 Compose 1.10.3 / Kotlin 2.3.10，Gradle 取高版本，基础依赖零升级 |

Haze 1.6.10 的经典 API：`rememberHazeState()` + `Modifier.hazeSource(state)`（采样源）+
`Modifier.hazeEffect(state) { blurRadius / backgroundColor / tints / fallbackTint / mask / noiseFactor }`（玻璃）。
底部 Liquid Glass 仍由 kyant0 backdrop 负责，两套管线分属不同区域，互不干扰。

## 0. 演进记录（诚实记录两轮实现）

| 轮次 | 方案 | 结果 |
|---|---|---|
| 第一轮（Top Scroll Scrim，已删除） | 内容侧特效：透明度盖片 + 三段不同半径模糊叠加在列表上方 | ❌ 真机否决——半径阶梯与两层各自底边形成**两条横向模糊带 + 水平分界线**；结构就是错的，全部删除 |
| 本轮（Top Glass Bar） | **玻璃是固定顶栏自身的材质**：列表全幅滚动进入顶栏后方，透过单一连续玻璃面被高斯模糊观察 | ✅ 按参考图实现 |

第一轮的结构性错误被明确禁止复活：`topGlassBarContract.test.ts` 断言玻璃文件**只有一个
`hazeEffect` 调用点**，禁止自研捕获/绘制、分段模糊与旧 Scrim API。

## 1. 视觉契约

- **静止**：顶部呈现自然的页面背景色（玻璃底色与页面同色系半透明），无雾化矩形、无高光横线、无边界。
- **上滚**：内容滑入顶栏后方，透过玻璃看到模糊的颜色/形状/部分轮廓；离开顶栏范围的部分完全清晰。
- **顶栏内容始终清晰**：标题/副标题/音源选择/搜索框/分类标签/返回与操作按钮画在玻璃之上（独立清晰层）。
- **底边无分界线**：玻璃强度（模糊+tint 整体）在底部 `tail=32dp`（规范 24–40）按端点零斜率的
  `1 - smoothstep(t)` 的 33 个等距采样衰减到透明（每 1dp 一个区间）——单面蒙版，
  两端缓起缓收，避免旧五点折线在主体边缘突然变陡。
- **材质语言与底栏 Liquid Glass 同族**（vibrancy + 高斯模糊 + 半透明底色），无描边、无分隔线；
  但参数独立（底栏 4dp+lens，顶栏 14dp），不强制一致。

## 2. 渲染原理（Haze 采样关系 + 正确图层顺序）

每页统一四层（从底到顶）：

1. **页面背景**：`NativePageView` 的页面渐变（`NativePage.surfaceColors()` 单一来源）。
2. **`TyTopGlassContentLayer`（全幅滚动内容 = Haze Source）**：`Modifier.hazeSource(state)`
   标记模糊采样源；内部先画与页面**逐像素对齐**的渐变底色（同笔刷同边界），集合详情再画
   封面氛围层副本（页面级原件已移除，避免双绘）—— 采样拿到的是「真实局部背景 + 内容」的
   不透明画面。**LazyColumn 全幅布局，contentPadding top = 测量的顶栏底边 + 衰减带**：
   内容真正滚动进入顶栏后方。
3. **`TyTopGlassSurface`（Haze Effect 玻璃面）**：`Modifier.hazeEffect(state)` 设置
   `blurRadius = 14dp`、`backgroundColor = 页面顶部同色不透明底色`、
   `tints = 页面顶部同色半透明蒙层`（浅色 0.68 / 深色 0.55）、`noiseFactor = 0`、
   `mask = 单面衰减蒙版`（主体 alpha=1，底部 TailDp 内按 smoothstep 采样衰减到 0）。
   无描边、无分隔线、不接指针事件（滑动穿透到列表）。一次 Haze effect = 唯一模糊管线。
4. **顶栏内容（清晰层）**：头部控件独立组合，`onGloballyPositioned` 把内容底边测量回填
   `TyTopGlassState.reportHeader` —— 玻璃范围由**布局测量驱动**，搜索展开/收起、输入法
   弹出时自动适配，无固定屏幕坐标、无按机型硬编码。

### 2.1 可读性修正（2026-11-09，基于 main `f85d70a` / 1.3.190 / 213）

Haze 1.6.10 的 `backgroundColor` 画在采样内容后方。我们的 source 自带不透明页面底色，
因此旧实现仅设置 `backgroundColor` 的 0.55/0.46 alpha **不能作为覆盖封面的蒙层**。
修正为同一 Haze effect 内的显式 `HazeTint`（默认 SrcOver）：真实采样 → 14dp 高斯模糊 →
半透明 tint → 原有单面 mask。没有额外采样、页面盖片或第二条模糊管线。

核对依据：[HazeStyle.kt（1.6.10）](https://github.com/chrisbanes/haze/blob/1.6.10/haze/src/commonMain/kotlin/dev/chrisbanes/haze/HazeStyle.kt)、
[BlurEffect.kt](https://github.com/chrisbanes/haze/blob/1.6.10/haze/src/commonMain/kotlin/dev/chrisbanes/haze/BlurEffect.kt)、
[Android RenderEffect](https://github.com/chrisbanes/haze/blob/1.6.10/haze/src/androidMain/kotlin/dev/chrisbanes/haze/RenderEffect.android.kt)。
Android 正常路径在 tints 后执行 mask；Haze 原生 fallback 同样消费该 mask。
显式 `fallbackTint` 避免库自动增浓，使降级时保留相同透明度。构建开关关闭时设置
`blurEnabled=false`，而非半径归零后继续采样清晰文字。

该轮保留 mask 的位置、强度采样与 32dp 范围（后续截图反馈的曲线调整见 §2.2）；最末端 alpha=0 同时清除模糊与 tint，
不透明的采样底色不会逃逸 mask 而形成矩形。首帧使用当前 `LocalDensity` 生成蒙版，
不等待测量状态的 `pxPerDp` 回填，避免首帧无 mask。

`TyTopGlassForeground` 仅提供 CompositionLocal，无布局/绘制节点，仍严格维持
ContentLayer → Surface → 原头部节点的顺序及高度测量。浅色固定顶栏的标题/输入文字
使用 `#122e24`，副标题/placeholder/未选分类使用 `#173629`，选中分类使用 `#0a3020`；
音源胶囊的启用文字不再额外乘 0.85 alpha。搜索固定浮层同样使用这组前景。
正文、禁用态与深色前景保留原语义色。

`TopGlassMathTest` 在浅色页面三段背景、黑白及 RGB/CMY 封面极值、普通玻璃/输入框
Subtle/标签 Selected 背景下校验这些前景 ≥4.5:1。这是 SrcOver 合成与亮度数学验证，
**不代表 GPU 截图、滚动残影或真机无障碍验收已通过**。浅色主体仍透出 32% 采样颜色，
深色主体透出 45%；不增加饱和度处理。

### 2.2 推荐封面交接处过渡修正（截图反馈，基于 `db8f08bb`）

用户截图显示推荐页封面滚入顶栏后，玻璃与清晰封面的交接处仍有明显断层。
代码核对发现：旧五点采样 `[1, .66, .34, .10, 0]` 并不是注释所说的 smoothstep；
起点从恒定 alpha=1 突然转为约 4.8%/dp 的下降，前 7.04dp 即下降 34%。
这是可从源码确认的突变因素，不能仅凭截图断言它是所有设备上唯一的成因。

保留 32dp 过渡范围、14dp 模糊、浅 0.68 / 深 0.55 tint 与前景调色；
只把同一张 Haze mask 的色标改为 `1 - t²(3 - 2t)` 的 33 点等距采样。
`DecaySteps=32` 与 CSS/TS 对齐，现有数组逐项 parity 校验继续保留。
该函数两端理论斜率为零，密集线性插值使实际 mask 在主体与清晰内容边缘缓慢起落。
没有新增绘制层、独立采样、渐变模糊半径或滚动状态；source、effect、测量与图层顺序均不变。

新增回归测试直接插值实际 `topGlassMaskStops`（包括 Color alpha 的 8-bit 量化）：
4 种密度下整段曲线误差 ≤0.003，交界两端 0.5dp 内强度变化 <0.003，
并继续验证主体全强度、末端透明、前景对比度及整页误测保护。
实际截图中的断层是否消除、滑动中是否自然，仍须用原签名新包真机复验。

内容起点统一为 `glass.contentTop`（= 顶栏底边 + 32dp 衰减带）：**静止时首个内容完全在玻璃之外**
（猜你喜欢卡片/资料库首行不会被顶栏玻璃覆盖，顶部无模糊），只有滚动时内容才进入衰减带被柔化
（真机反馈 1.3.186：内容紧贴玻璃衰减带起点，一打开首行顶部就发虚）。
首页定位回填前使用页面级估计值（`rememberTyTopGlassState(estimate)`）避免首帧跳动。
集合详情「定位到当前播放行」的滚动偏移改为玻璃底边下方 12dp（视口改全幅后原 -100 会藏进玻璃）。

**回归记录（1.3.185 → 1.3.186）**：首次真机版本出现了「打开时内容全空 + 上滑整页模糊」——
根因是**头部测量层误用了 `fillMaxSize()`**：`reportHeader` 把整页高度当成了顶栏底边，
于是 `contentPadding top` = 整页（内容全部推出屏幕）、玻璃面高度 = 整页（整页被模糊）。
修复：①头部测量层一律「宽度撑满、高度包裹」；②玻璃面尺寸完全由组件内部决定（签名不再
接受 modifier，调用方无法撑成整页）；③状态增加兜底上限（顶栏底边 ≤ 页面高度 60%）。
`topGlassBarContract.test.ts` 已加回归断言锁定这三点。

## 3. 统一参数（三端 Token）

| 参数 | 值 | CSS | TS | Kotlin |
|---|---|---|---|---|
| 玻璃模糊半径 blur | 14 | `--ty-glass-top-blur: 14px` | `TY_GLASS_TOP.blurPx` | `TyTopGlass.BlurDp` |
| 底部衰减距离 tail | 32 | `--ty-glass-top-tail: 32px` | `TY_GLASS_TOP.tailPx` | `TyTopGlass.TailDp` |
| 衰减区间数 | 32（33 色标） | `--ty-glass-top-decay-steps` | `decaySteps` | `DecaySteps` |
| 衰减采样位置 | i/32，i=0…32 | — | `decayPositions` | `DecayPositions` |
| 衰减采样强度 | 1 - t²(3 - 2t) | — | `decayAlphas` | `DecayAlphas` |
| 玻璃 tint alpha | 深 0.55 / 浅 0.68 | `--ty-glass-top-tint-alpha`（浅色覆盖） | `tintAlphaDark/Light` | `TintAlphaDark/Light` |
| 浅色顶栏前景 | #122e24 / #173629 / #0a3020 | `--ty-glass-top-text/text-secondary/accent` | `lightInk/Muted/Accent` | `LightInk/Muted/Accent` |

单位口径：WebView 1px ≈ Compose 1dp（页面以 `Density(cssScale, 1f)` 对齐 CSS 视口像素）。
玻璃底色取 `surfaceColors()` 首色（页面顶部背景色）——深浅色与页面类型自动跟随。
能力门控：Haze 官方判定 `HazeDefaults.blurEnabled()`（SDK<31 无 RenderEffect 模糊时
`HazeState.blurEnabled=false`），此时玻璃自动退化为**同形状的半透明底色层**（无模糊、
同样底部衰减）；`TINGYU_TOP_GLASS_BLUR=false` 构建通过 `blurEnabled=false` 使用相同 fallback。
两种降级都绝不退回横向模糊带。

## 4. 页面接入清单

| 页面 | 接入 | 备注 |
|---|---|---|
| 推荐首页 | ✅ `NativeHomePage` | 标题/副标题/音源选择清晰；猜你喜欢/最近播放/我的歌单滚入玻璃后方；横向轮播不受干扰 |
| 资料库首页（含本地分类） | ✅ `NativeDirectoryPage` library 分支 | 五层头部整体为清晰层；搜索展开/收起玻璃范围随测量适配 |
| 搜索首页 / 结果综合 / 分类结果 | ✅ `NativeSearchPage` | 输入框/关闭钮/音源标签/分类标签清晰；输入法经 imePadding 避让 |
| 歌单/专辑/每日推荐/收藏/自建/本地文件夹详情 | ✅ `MediaDetailScaffold`（ambient 副本） | 玻璃范围只由固定返回栏测量决定；随滚动的封面/信息区不加玻璃；定位落点已适配 |
| 歌手详情 | ✅ `NativeDirectoryPage` artist 分支 | 返回栏 + 更多按钮清晰 |
| 设置索引 / 背屏控制页 | ✅ `NativeSettingsPage` / `NativeRearControlPage` | 标题与按钮清晰 |
| 语义化设置二级页 | ✅ `SettingsFlowPage` | 固定返回栏与标题；内容由 TySettings 排版 |
| **DOM 测量设置文档页** | ⛔ 豁免 | `NativeSettingsDocumentView` 区域级滚动窗口，无固定顶栏 |
| 经典歌词舞台 / 极简歌词 / 背屏歌词 | ⛔ 豁免 | 沉浸式全屏播放器，保留原有视觉 |
| MobileSheet 等 sheet | ⛔ 豁免 | header 随内容滚动，无固定顶部栏 |
| WebView 其余面 | — | 当前无固定顶栏的 WebView 全页面；归属规则见 ANDROID-PAGE-OWNERSHIP.md |

## 5. 性能契约

- 顶栏 = Haze 官方管线（GPU 层采样 + RenderEffect 模糊）：**无每帧截屏、无位图拷贝、
  无整列表模糊、无逐 item 模糊**；`HazeState` 生命周期由 `rememberHazeState()` 管理，
  页面重组不重建（仅顶栏高度测量变化会失效重建 effect，不重建 state）。
- 底部 Liquid Glass 仍走 kyant0 backdrop（原有 pages 层采样），两套管线分区独立；
  `TINGYU_TOP_GLASS_BLUR=false` 可一键关闭顶栏模糊（变纯半透明底色，视觉统一、无横带）。
- 玻璃是静态材质（不随滚动开关）：Reduced Motion 下保持不变，仅减少不必要动画。
- 蒙版/底色随测量更新走快照失效，滚动期间不产生额外组合（重组）。

## 6. 验证记录（2026-11-08）

以下为历史执行记录；本次 2026-11-09 可读性专项的运行结果见 §6.1。

- tsc `--noEmit` ✅；`topGlassBarContract` 13 断言 ✅；`designTokenParity` 8/8（glass-top 组）✅；
  `check:android-ui` 10/10 ✅；`compileDebugKotlin` ✅；`TopGlassMathTest` 4 用例 ✅（ASCII 镜像）；
  全量 vitest 失败集合与基线一致（14）。
- **Haze 迁移验证**：haze 1.6.10 依赖解析无重复类；`compileDebugKotlin` ✅；
  `topGlassBarContract`（Haze 口径）+ parity ✅；全量 vitest 见 UI_TEST_MATRIX。
- **待真机验证**：推荐页首验（静止观感贴近参考图 / 上滑透视模糊 / 底边无分界线）→
  资料库与搜索（头部高度不同下材质一致 / 搜索展开适配 / 输入法）→ 集合详情（亮色封面融合 /
  定位落点）→ 深浅色 → 横向轮播与返回手势 → 滚动流畅度（降级开关对比）→ 页面切换无残影。

### 6.1 可读性专项复验（2026-11-09）

- 定向 Vitest：`npm run test:unit -- test/unit/ui/designTokenParity.test.ts test/unit/ui/topGlassBarContract.test.ts test/unit/architecture/androidPageOwnership.test.ts`，44/44 通过。
- `npm run cap:sync:android`：网页生产构建、资源指纹、Capacitor 同步与反馈浮层检查通过。
- `npm run typecheck` 通过；在 `android` 目录运行 `gradlew.bat :app:testDebugUnitTest --tests io.github.huleixin.tingyu.chrome.TopGlassMathTest` 通过（7/7，含主源码编译）。结果同步记录在 `UI_TEST_MATRIX.md` 的本次专项表中。
- 本机 `adb devices` 无设备；以下场景**全部待真机验证**，不得用数学测试替代视觉结论：

| 页面/操作 | 浅色与深色均需验收 | 状态 |
|---|---|---|
| 推荐页 | 彩色大封面快速/慢速滚入顶栏；标题/副标题/音源胶囊清楚，色彩柔和而有透感 | 待真机验证 |
| 资料库 | 密集歌曲文字与封面滚入顶栏；分类/排序/搜索 placeholder 清楚，无文字残影干扰 | 待真机验证 |
| 搜索 | 首页/结果/分类，输入/清空/取消，键盘与资料库搜索展开/收起时玻璃高度正常 | 待真机验证 |
| 设置 | 索引、语义化二级页滚动；测量型文档页继续豁免 | 待真机验证 |
| 歌单详情 | 亮暗封面、氛围背景、返回/搜索/更多按钮与定位当前播放行 | 待真机验证 |
| 全部固定顶栏 | 首帧/路由切换/后台恢复；32dp 底缘自然透明，无矩形、双模糊带或闪烁 | 待真机验证 |
| 性能 | 同设备同列表对比基线及关闭模糊开关，记录帧耗时/卡顿；无明显回退 | 待真机验证 |
