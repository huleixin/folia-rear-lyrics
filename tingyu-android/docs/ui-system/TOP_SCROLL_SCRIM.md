# TOP_SCROLL_SCRIM — 全局顶部滚动渐隐系统

> TingYu Design System 正式组成。组件：`chrome/TopScrollScrim.kt`（Compose 公共能力）+
> `src/components/shared/topScrollScrim.ts` / `src/styles/topScrollScrim.css`（WebView 公共能力）。
> 三端参数由 `test/unit/ui/designTokenParity.test.ts` 门禁锁定，结构契约由
> `test/unit/ui/topScrollScrimContract.test.ts` 门禁锁定。

## 0. 解决的问题

所有 Compose 页面的固定顶栏与滚动区是 Column 上下堆叠，内容在滚动视口顶边被**硬裁切**
（资料库歌单标题切半、搜索结果行切半）。本系统让内容上滑经过顶部固定栏时逐渐模糊、
淡出、融入页面背景；静止时顶部完全干净，不改变任何顶部栏高度/布局/背景。

## 1. 视觉契约（验收口径）

| 状态 | 行为 |
|---|---|
| 静止（未滚动） | 遮罩**完全不绘制**——顶部干净、清晰、通透；无长期雾层、无大面积模糊 |
| 上滚 | 内容进入 band（44dp 过渡带）后，被一片**与页面背景逐像素同色**的盖片缓落消隐；无硬裁切线；Tier2 叠加真实局部模糊柔化 |
| 下滚 | 完全跟随滚动位置即时恢复；无动画等待、无残影、无延迟消失 |
| 顶栏本身 | 永远清晰；遮罩不改变顶栏高度/布局/背景，只画在滚动视口内部 |
| 触控 | 遮罩/模糊段**只画不接事件**：不拦截滑动、不影响横向轮播、不影响系统返回、无点击穿透、无不可见点击区域 |
| 滚动范围 | 盖片不改变列表滚动范围，无内容跳动、无额外留白 |
| 位置 | 遮罩跟随实际滚动容器布局（非固定屏幕坐标）；搜索框展开/输入法弹出时边界随布局自动适配 |

## 2. 三种视觉手段（诚实区分，规范 §六）

| 手段 | 归属 | 实现 | 开销 |
|---|---|---|---|
| **Tier1 内容透明度渐隐**（始终启用） | 本系统 | 与页面背景逐像素同色的盖片缓落（`scrimOccluderStops` 按位置采样页面渐变色板） | 一次 drawRect，无离屏 |
| **Tier2 内容本身模糊**（能力门控） | 本系统 | 列表 `layerBackdrop` 捕获（含与页面对齐的真实局部背景）+ band 内 3 段 RenderEffect 模糊（10→6→3dp 递减） | 滚动时列表级 GPU 捕获；停止滚动即不再捕获 |
| **背景玻璃模糊** | 底栏 Liquid Glass（`chromeGlass`） | `drawBackdrop { blur; lens }` | 既有管线，本系统**不触碰** |

**禁止把 Tier1 的透明渐变描述成"模糊"**：文档与代码注释均按上表口径表述。
Tier2 门控：`SDK≥31 && BuildConfig.TOP_SCRIM_BLUR`（环境变量 `TINGYU_TOP_SCRIM_BLUR=false` 关闭，
只降级 Tier1，视觉仍完整）。

## 3. 统一参数（三端 Token）

| 参数 | 值 | CSS | TS | Kotlin |
|---|---|---|---|---|
| 过渡带高度 band | 44 | `--ty-scrim-band: 44px` | `TY_SCRIM.bandPx` | `TyScrollScrim.BandDp` |
| 滚动激活行程 ramp | 32 | `--ty-scrim-ramp: 32px` | `TY_SCRIM.rampPx` | `TyScrollScrim.RampDp` |
| 最大模糊半径 blur | 10 | `--ty-scrim-blur: 10px` | `TY_SCRIM.blurPx` | `BlurSegmentRadiiDp[0]` |
| 模糊段数/半径 | 3 / 10,6,3 | — | `blurSegments / blurSegmentRadii` | `BlurSegments / BlurSegmentRadiiDp` |
| 缓落采样位置 | 0/.22/.45/.72/1 | 渐变 stop | `stopPositions` | `StopPositions` |
| 缓落采样 alpha | 1/.66/.34/.10/0 | 渐变 stop | `stopAlphas` | `StopAlphas` |
| 激活曲线 | smoothstep（端点零斜率） | — | `topScrimProgress()` | `TyScrollScrim.ease()` |

单位口径：WebView 的 1px ≈ Compose 的 1dp（页面以 `Density(cssScale, 1f)` 强制对齐 CSS 视口像素）。
深浅色自动跟随：融合色一律来自 `NativePage.surfaceColors()`（与页面背景同一来源，含
Home/Search/Settings/Playlist 四套色板 + 浅色覆盖）；集合详情另含封面氛围层副本。

## 4. 页面接入清单（覆盖矩阵）

| 页面 | 接入 | 融合策略 | 备注 |
|---|---|---|---|
| 推荐首页 | ✅ `NativeHomePage` | Gradient | 猜你喜欢/每日推荐/最近播放/我的歌单；横向卡片滑动不受影响 |
| 资料库首页 | ✅ `NativeDirectoryPage`（library 分支） | Gradient | 标题/分类/搜索框/排序下方消隐；搜索展开收起边界随布局适配 |
| 本地音乐分类页 | ✅ 同上（资料库=library 路由） | Gradient | 与资料库同一结构 |
| 搜索首页 / 结果综合页 | ✅ `NativeSearchPage` | Gradient | 输入法弹出时随 imePadding 适配 |
| 单曲/歌手/歌单/专辑分类结果 | ✅ 同上 | Gradient | 分类标签统一效果 |
| 歌单/专辑/每日推荐/收藏/自建/本地文件夹详情 | ✅ `MediaDetailScaffold` | **Ambient**（渐变+封面氛围层副本） | 边界只参考固定返回栏，随滚动的封面/标题不算顶栏 |
| 歌手详情 | ✅ `NativeDirectoryPage`（artist 分支） | Gradient | 返回栏 + 更多按钮保持清晰可点 |
| 最近播放 | ✅（首页 section / 完整历史集合路由） | Gradient | 随首页/集合模板接入 |
| 设置索引 | ✅ `NativeSettingsPage` | Gradient | 标题 + 关闭按钮保持清晰 |
| 背屏控制页 | ✅ `NativeRearControlPage` | Gradient | 固定返回栏下方 |
| **设置二级文档页** | ⛔ 豁免 | — | `NativeSettingsDocumentView`：区域级独立滚动窗口、无固定顶栏（DOM 是排版真值源），按规范「按实际布局判断」不启用；见 UI_MIGRATION_CHECKLIST 阶段 F 待办 |
| 经典歌词舞台 / 极简歌词 / 背屏歌词 | ⛔ 豁免 | — | 全屏沉浸播放器，规范明确不强制；极简页歌词滚动已有自有 mask 渐隐 |
| MobileSheet 等底部 sheet | ⛔ 豁免 | — | header 在滚动容器内部（随内容滚动），无固定顶部栏 |
| WebView 其余白名单面 | — | — | 顶部渐隐能力已就绪（`.ty-top-scrim` + `topScrimProgress` + MobileScrollFrame 进度注入，条件启用零开销）；当前无固定顶部栏的 WebView 全页面（全部已由 Compose 渲染） |

## 5. 架构与性能红线（接入新页面必读）

1. **必须经公共组件**：Compose 页面把 LazyColumn 包进 `TopScrollScrimViewport(state, fusion)`，
   禁止页面内手写渐隐/模糊遮罩（`topScrollScrimContract.test.ts` 门禁）。
2. **融合策略选对**：普通页面 `TopScrimFusion.Gradient(page.surfaceColors())`；
   集合详情 `TopScrimFusion.Ambient(colors, cover.image, maxHeight)`（盖片须含封面氛围副本，
   否则会在封面可见区出现色差接缝）。
3. **滚动零重组**：激活度在 draw/layer 阶段读 `LazyListState`；重组只发生在激活布尔翻转。
   不要把滚动偏移提升成 `State` 驱动组合。
4. **禁止**：每帧截屏/位图拷贝、整列表模糊、逐 item 模糊层、大面积高强度模糊。
5. **底部不动**：底栏/迷你条的双层 Liquid Glass（`chromeGlass`、`--ty-glass-*`）与本系统
   完全独立，顶部优化不得修改底部材质（契约测试锁定）。
6. **Reduced Motion**：遮罩直接跟随滚动位置（无独立动画时间线），天然满足 reduced-motion。

## 6. 验证记录（2026-11-08，commit 见 UI_MIGRATION_CHECKLIST 阶段 F）

- tsc `--noEmit`：✅ 0 错误
- vitest：`designTokenParity` 8/8（新增 2 组 scrim 断言）、`topScrollScrimContract` 13/13；
  全量回归见 UI_TEST_MATRIX
- `check:android-ui`：✅ 10/10
- Kotlin：`compileDebugKotlin` ✅；`TopScrollScrimMathTest` 5 用例 ✅（经 ASCII 镜像运行）
- **待真机验证**：推荐页猜你喜欢卡上滑过渡、资料库搜索展开/收起边界适配、
  集合详情（亮色封面）盖片融合、输入法弹出定位、横向轮播与返回手势、滚动流畅度
  （Tier2 开启/关闭对比，异常时 `TINGYU_TOP_SCRIM_BLUR=false` 一键降级）
