# TOP_GLASS_BAR — 沉浸式毛玻璃顶栏

> TingYu Design System 正式组成。组件：`chrome/TopGlassBar.kt`（Compose 公共能力）。
> 三端参数由 `test/unit/ui/designTokenParity.test.ts` 门禁锁定，结构契约由
> `test/unit/ui/topGlassBarContract.test.ts` 门禁锁定。

## 0. 演进记录（诚实记录两轮实现）

| 轮次 | 方案 | 结果 |
|---|---|---|
| 第一轮（Top Scroll Scrim，已删除） | 内容侧特效：透明度盖片 + 三段不同半径模糊叠加在列表上方 | ❌ 真机否决——半径阶梯与两层各自底边形成**两条横向模糊带 + 水平分界线**；结构就是错的，全部删除 |
| 本轮（Top Glass Bar） | **玻璃是固定顶栏自身的材质**：列表全幅滚动进入顶栏后方，透过单一连续玻璃面被高斯模糊观察 | ✅ 按参考图实现 |

第一轮的结构性错误被明确禁止复活：`topGlassBarContract.test.ts` 断言玻璃文件**只有一个
`drawBackdrop` 调用点**、不存在分段模糊循环（`BlurSegment`）、不得使用旧 Scrim API。

## 1. 视觉契约

- **静止**：顶部呈现自然的页面背景色（玻璃底色与页面同色系半透明），无雾化矩形、无高光横线、无边界。
- **上滚**：内容滑入顶栏后方，透过玻璃看到模糊的颜色/形状/部分轮廓；离开顶栏范围的部分完全清晰。
- **顶栏内容始终清晰**：标题/副标题/音源选择/搜索框/分类标签/返回与操作按钮画在玻璃之上（独立清晰层）。
- **底边无分界线**：玻璃强度（模糊+tint 整体）在底部 `tail=32dp`（规范 24–40）按端点零斜率的
  smoothstep 采样 `[1, .66, .34, .10, 0]` 平滑衰减到透明——单面蒙版，无内部折点、无横带。
- **材质语言与底栏 Liquid Glass 同族**（vibrancy + 高斯模糊 + 半透明底色），无描边、无分隔线；
  但参数独立（底栏 4dp+lens，顶栏 10dp），不强制一致。

## 2. 渲染原理（真实混合架构，正确图层顺序）

每页统一四层（从底到顶）：

1. **页面背景**：`NativePageView` 的页面渐变（`NativePage.surfaceColors()` 单一来源）。
2. **`TyTopGlassContentLayer`（全幅滚动内容，捕获层）**：能力具备（SDK≥31 且
   `TOP_GLASS_BLUR`）时，内部先画与页面**逐像素对齐**的渐变底色（同笔刷同边界），
   集合详情再画封面氛围层副本（页面级原件此时移除，避免重复采样），然后挂
   `layerBackdrop` 捕获 —— 玻璃采到的 raster 是「真实局部背景 + 内容」的不透明画面。
   **LazyColumn 全幅布局，contentPadding top = 测量的顶栏底边**：内容真正滚动进入顶栏后方。
3. **`TyTopGlassSurface`（玻璃面）**：**单一连续表面** —— `drawBackdrop(捕获){vibrancy(); blur(10dp)}`
   + `onDrawSurface` 画页面顶部同色半透明 tint；整面经 `saveLayer + BlendMode.DstIn` 蒙版，
   主体 alpha=1、底部 tail 内平滑衰减。无描边、无分隔线、不接指针事件（滑动穿透到列表）。
4. **顶栏内容（清晰层）**：头部控件独立组合，`onGloballyPositioned` 把内容底边测量回填
   `TyTopGlassState.reportHeader` —— 玻璃范围由**布局测量驱动**，搜索展开/收起、输入法
   弹出时自动适配，无固定屏幕坐标、无按机型硬编码。

首页定位回填前使用页面级估计值（`rememberTyTopGlassState(estimate)`）避免首帧跳动。
集合详情「定位到当前播放行」的滚动偏移改为玻璃底边下方 12dp（视口改全幅后原 -100 会藏进玻璃）。

## 3. 统一参数（三端 Token）

| 参数 | 值 | CSS | TS | Kotlin |
|---|---|---|---|---|
| 玻璃模糊半径 blur | 10 | `--ty-glass-top-blur: 10px` | `TY_GLASS_TOP.blurPx` | `TyTopGlass.BlurDp` |
| 底部衰减距离 tail | 32 | `--ty-glass-top-tail: 32px` | `TY_GLASS_TOP.tailPx` | `TyTopGlass.TailDp` |
| 衰减采样位置 | 0/.22/.45/.72/1 | — | `decayPositions` | `DecayPositions` |
| 衰减采样强度 | 1/.66/.34/.10/0 | — | `decayAlphas` | `DecayAlphas` |
| 玻璃底色 alpha | 深 0.46 / 浅 0.55 | — | — | `TintAlphaDark/Light` |

单位口径：WebView 1px ≈ Compose 1dp（页面以 `Density(cssScale, 1f)` 对齐 CSS 视口像素）。
玻璃底色取 `surfaceColors()` 首色（页面顶部背景色）——深浅色与页面类型自动跟随。
能力门控：`SDK≥31 && BuildConfig.TOP_GLASS_BLUR`（env `TINGYU_TOP_GLASS_BLUR=false`）；
降级 = **同形状的半透明底色层**（无模糊、同样底部衰减），绝不退回横向模糊带。

## 4. 页面接入清单

| 页面 | 接入 | 备注 |
|---|---|---|
| 推荐首页 | ✅ `NativeHomePage` | 标题/副标题/音源选择清晰；猜你喜欢/最近播放/我的歌单滚入玻璃后方；横向轮播不受干扰 |
| 资料库首页（含本地分类） | ✅ `NativeDirectoryPage` library 分支 | 五层头部整体为清晰层；搜索展开/收起玻璃范围随测量适配 |
| 搜索首页 / 结果综合 / 分类结果 | ✅ `NativeSearchPage` | 输入框/关闭钮/音源标签/分类标签清晰；输入法经 imePadding 避让 |
| 歌单/专辑/每日推荐/收藏/自建/本地文件夹详情 | ✅ `MediaDetailScaffold`（ambient 副本） | 玻璃范围只由固定返回栏测量决定；随滚动的封面/信息区不加玻璃；定位落点已适配 |
| 歌手详情 | ✅ `NativeDirectoryPage` artist 分支 | 返回栏 + 更多按钮清晰 |
| 设置索引 / 背屏控制页 | ✅ `NativeSettingsPage` / `NativeRearControlPage` | 标题与按钮清晰 |
| **设置二级文档页** | ⛔ 豁免 | 区域级独立滚动窗口、无固定顶栏（DOM 是排版真值源），按布局判断不启用 |
| 经典歌词舞台 / 极简歌词 / 背屏歌词 | ⛔ 豁免 | 沉浸式全屏播放器，保留原有视觉 |
| MobileSheet 等 sheet | ⛔ 豁免 | header 随内容滚动，无固定顶部栏 |
| WebView 其余面 | — | 当前无固定顶栏的 WebView 全页面；归属规则见 ANDROID-PAGE-OWNERSHIP.md |

## 5. 性能契约

- 复用底栏 Liquid Glass 的同一 GPU 管线（kyant0 backdrop）：捕获层 GPU 记录 + RenderEffect
  模糊，**无每帧截屏、无位图拷贝、无整列表模糊、无逐 item 模糊**。
- 玻璃是静态材质（不随滚动开关）：Reduced Motion 下保持不变，仅减少不必要动画。
- 双捕获说明：底栏玻璃已有 pages 层捕获；顶栏玻璃因在页面内部（避免反馈回路）使用
  独立内容层捕获 —— 两者同量级、均为 GPU 层记录；`TINGYU_TOP_GLASS_BLUR=false` 可一键
  降级（玻璃变纯半透明底色，视觉统一、无横带）。
- 玻璃面离屏（saveLayer）仅覆盖顶栏+tail 区域，尺寸小。

## 6. 验证记录（2026-11-08）

- tsc `--noEmit` ✅；`topGlassBarContract` 13 断言 ✅；`designTokenParity` 8/8（glass-top 组）✅；
  `check:android-ui` 10/10 ✅；`compileDebugKotlin` ✅；`TopGlassMathTest` 4 用例 ✅（ASCII 镜像）；
  全量 vitest 失败集合与基线一致（14）。
- **待真机验证**：推荐页首验（静止观感贴近参考图 / 上滑透视模糊 / 底边无分界线）→
  资料库与搜索（头部高度不同下材质一致 / 搜索展开适配 / 输入法）→ 集合详情（亮色封面融合 /
  定位落点）→ 深浅色 → 横向轮播与返回手势 → 滚动流畅度（降级开关对比）→ 页面切换无残影。
