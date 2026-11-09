# UI_MIGRATION_CHECKLIST — 页面迁移完成状态

> 状态定义：已审计=源码位置与实现方式已确认；已实现=代码已改；已构建=编译通过；已测试=自动化测试通过；待真机验证=需实机确认。**「已修改代码」≠「已验收」。**

## 阶段 A：审计与基线 ✅（2026-11-08）

- [x] 全源码审计（React 页面/Compose 层/设计系统/跨音源 四路并行）
- [x] 页面清单（UI_PAGE_INVENTORY.md，23 项）
- [x] 问题基线：`npx tsc --noEmit` 通过；vitest 基线 **7331 通过 / 14 失败 / 2 跳过（8 个失败文件）**——失败为存量问题，非本次引入
- [x] Git 回退点：`1745121`（main）
- [x] 架构结论：React19+Capacitor WebView + Kotlin/Compose 混合；歌单详情已跨音源统一；主要债在 token 散乱/浮层返回多头/双投影

## 阶段 B：设计系统 ✅（已实现 + 已构建 + 已测试，待真机验证）

- [x] `src/styles/tingyuTokens.css`：颜色/玻璃/圆角/间距/动效/排版语义 token（深色默认 + 浅色覆盖，数值=基线原值）
- [x] `src/components/shared/motionTokens.ts`：TY_DURATION/TY_EASE/TY_SPRING/TY_MOTION
- [x] `mobileGlass.css` 收编：玻璃材质/时长/曲线全部改消费 token（渲染值不变）
- [x] `overlayEntranceMotion.ts` 接入 motionTokens（API 不变）
- [x] `TingYuMotion.kt`（Compose）：4 套散落 easing + 时长 + spring 收编；调用点迁移（ComposeChromeHost/NativeStageExit/MinimalSheetMotion/NativeMotionPolicy）
- [x] `DarkInterfaceColors.kt`：深色页面渐变背景收编（原 4 处字面量）
- [x] typecheck 通过；vitest 与基线一致（无新增失败）；`:app:compileDebugKotlin` 通过

## 阶段 C：跨音源试点 ✅（2026-11-08 完成，见 PLAYLIST_DETAIL_PARITY.md）

- [x] 审计结论：本地/在线歌单详情已共用 MobileCollection + CollectionResource（无复制粘贴）
- [x] 双端差异核实：18 项差异矩阵（10 项本轮收敛、4 项记录保留/待决策、结构性差异 1 项、待真机核实 3 项）
- [x] 跨端收敛落地：背景渐变三段、muted 统一 `#a2b6ac`、当前行样式（14% 底+竖条）、错误态（muted+胶囊）、序号右对齐、Heart 24/`#f4f7f5`、Kotlin 顶栏 26dp、播放指示器 4柱18×20 820ms、封面阴影、歌单内搜索返回注册
- [x] 审计纠错：WebView 行**有**音质标签（混合比差异，非缺失）；曲库 hook 收敛维持「待评估」（见下）
- [x] Token 一致性门禁：`test/unit/ui/designTokenParity.test.ts`（6 组断言，已抓出并修正 bg-raised 浅色漂移 #e5ede4→#e3ebe2）

## 阶段 D：动效与导航 ✅（2026-11-08 第一轮完成）

- [x] 动效 Token 全线落地（阶段 B 覆盖）
- [x] 极简页动效规则固化（MOTION_SYSTEM.md §3）
- [x] 两条绕过 modalBackStack 的 Escape 路径收敛（MobileSettingsLanding 先咨询栈顶；MobileHome 有模态时让位；NAVIGATION_CONTRACT §3 例外规则化）
- [x] 确认弹窗收敛：`DeleteFolderConfirmModal` 零引用**已删除**；`ImportConfirmDialog` 纠错为导入选择器（ThemedDialog 合规）；确认弹窗事实源 = ConfirmDialog
- [ ] **待迁移**：Lattice 死代码接线摘除（需先确认零动态引用）
- [ ] **待迁移**：搜索交互形态统一（Kotlin morph 层 vs WebView 条件渲染，PLAYLIST_DETAIL_PARITY #11）

## 阶段 E：全面组件迁移 ⏳ 首轮完成（2026-11-08，原生集合详情统一）

### E 第一轮：原生集合详情真正统一 ✅（已实现 + 已构建 + 已测试，待真机验证）

- [x] 分流核实：`useNativeCollectionPage.ts` 按 `collection.type==='playlist'` 发 `playlistIntro`/`intro`；NativePageView 据此分流 NativePlaylistPage（新式详情）vs NativeDirectoryPage（旧目录风格 27sp 标题+118dp 封面+62px 行）；专辑/每日推荐/本地文件夹等此前走旧风格，且**序号被拼进歌名**
- [x] 统一模板：新增 `chrome/MediaDetail.kt`（MediaDetailScaffold + MediaDetailHeader + MediaDetailActionsRow + MediaDetailTrack）；删除 NativePlaylistPage.kt（其实现整体迁入）
- [x] 路由语义化：NativePageView 改按 `page.id=='collection'` 路由（`collection:artist:` 前缀保留歌手独立结构），不再依赖 intro/playlistIntro 分流标记
- [x] 数据契约统一：所有非歌手集合（歌单/专辑/每日推荐/收藏/自建/本地文件夹）统一发 toolbar+intro+controls；歌名一律原始名，序号走独立 `number` 字段；筛选区仅展开时下发
- [x] 底部导航按页面层级：`playlistDetail`（按数据类型）→ `collectionDetail`（route==='collection' 且非歌手，双端同规则）；歌手维持全隐藏（NativeFooterLayout artist 参数既有接线）；宽屏 ≥840dp 保留侧边导航
- [x] 测试：`test/unit/ui/nativeCollectionDetailContract.test.ts`（4 断言：双类型同构/序号独立/heading 专属/筛选区按需）；tsc 通过；vitest 7341 过/14 存量失败（经 git stash 对照，失败集合与基线一致）；check:android-ui 通过；compileDebugKotlin 通过
- [ ] **待真机验证**：专辑/每日推荐接入统一模板后的实际视觉、底栏隐藏行为、返回手势、播放不中断

### E 后续待办 ⏳

- [ ] 统一 EmptyState/ErrorState/Loading 组件并替换散写（约 40 文件 100+ 处 spinner）
- [ ] 匹配弹窗 4 套收敛（结构与返回行为核查后按语义分组）
- [ ] 设置双模板头部/导航统一
- [ ] 播放队列 UI 双渲染器渲染层统一（model 已共用）
- [ ] 遗留 `--ml-*`/`--ty-settings-*`/`--ui-*` 变量迁移至 tingyuTokens
- [ ] 曲库 hook 评估结论：五套 hook 同构但**缓存/失效/特判逻辑确有音源差异**，不为 UI 任务强改数据层；仅在新增音源时评估共享原语（用户约束：不得强改数据层）

## 阶段 F：系统与性能适配 ⏳ 进行中

### F-1：沉浸式毛玻璃顶栏（Haze 内核）✅（2026-11-08 第三轮，已实现 + 已测试，待真机验证）

- [x] **渲染内核切换为开源 Haze 1.6.10（Apache-2.0）**：`rememberHazeState` + `hazeSource`（内容采样源）+ `hazeEffect`（blurRadius 14dp + backgroundColor + tints + 单面 mask 底部衰减 32dp）；选版依据 = 传递依赖 Compose 1.8/Kotlin 2.1 均低于项目版本，零基础依赖升级（2.x/1.7.x 会强制抬升 Compose 1.12，弃用）
- [x] 自研 backdrop 捕获/DstIn 绘制管线全部移除（契约测试断言不得复活）；HazeState 生命周期由 Haze 管理，页面重组不重建
- [x] 能力降级：`HazeDefaults.blurEnabled()`（SDK<31 关闭模糊）+ `TINGYU_TOP_GLASS_BLUR=false` 性能回滚，均保留同形状半透明底色玻璃
- [x] 集合详情封面氛围层副本移入公共内容层（页面级原件移除，避免双绘；采样含氛围色）
- [x] 底部 Liquid Glass（kyant0 backdrop）保持原样，两套管线分区独立

- [x] **第一轮（Top Scroll Scrim）真机否决并彻底删除**：内容侧盖片 + 三段模糊 = 两条横向模糊带 + 水平分界线，根因是特效画在列表 overlay 上而非顶栏材质上；契约测试禁止其复活
- [x] 公共组件 `chrome/TopGlassBar.kt`：TyTopGlassContentLayer（全幅滚动内容+对齐底色+封面氛围副本，捕获层）/ TyTopGlassSurface（单一 Haze effect = blur(14dp)+页面同色 tint，Haze mask 底部 32dp 强度平滑衰减）/ TyTopGlass Token
- [x] 页面布局重构：LazyColumn 全幅 + contentPadding top=测量顶栏底边（内容真正滚入顶栏后方）；头部内容独立清晰层，测量回填玻璃范围（搜索展开/输入法自动适配）
- [x] 三端参数：`--ty-glass-top-*` / `TY_GLASS_TOP` / `TyTopGlass`，parity 门禁锁定
- [x] 接入：推荐/资料库(含本地分类)/搜索(含分类tab)/集合详情(封面氛围副本+定位落点适配)/歌手/设置索引/背屏控制；豁免面记录在案
- [x] 测试：`topGlassBarContract`（单 Haze effect、同一 mask、首帧、清晰层配色作用域、测量保护、无指针拦截、旧 API 禁止复活）+ parity 三端 blur/tint/前景/衰减组 + `TopGlassMathTest`；本次运行数见 UI_TEST_MATRIX 专项表
- [x] 2026-11-09 可读性专项：14dp / 浅 0.68 / 深 0.55；修复仅设置 backgroundColor 而无有效蒙层的问题，显式 Haze tint/fallbackTint 共用原有 32dp mask；浅色顶栏前景作用域与对比度测试，正文和图层顺序不变
- [x] 推荐封面断层截图反馈：将旧五点突降折线替换为 33 点等距 `1 - smoothstep` 蒙版采样；仍为单张 32dp mask，追加实际色标插值误差及首尾邻域斜率回归校验
- [ ] 真机验证（TOP_GLASS_BAR.md §6：推荐页首验 → 各页材质一致 → 深浅色 → 手势/轮播 → 流畅度与降级对比 → 页面切换无残影）

### F 其余待办 ⏳

- [ ] insets 双口径统一（`env(safe-area-inset-*)` 存量 7 文件 → `--folia-main-inset-*`）
- [ ] 浅色覆盖层（interfaceAppearance.css 按 Tailwind 类名反选的规则）逐步 Token 化
- [ ] Macrobenchmark（冷启动/首屏/极简页进出/长列表）——**未验证**，需设备

## 阶段 G：全量回归 ⏳ 待真机

- [x] typecheck / vitest / check:android-ui / compileDebugKotlin（见 UI_TEST_MATRIX）
- [ ] 真机：深浅色、玻璃、极简页进出、返回手势、后台播放、灵动岛、背屏

## 阶段 H：长期规范 ✅

- [x] 十份规范文档交付 docs/ui-system/
- [x] UI Contract 15 条（UI_DEVELOPMENT_RULES.md）
- [ ] tokens lint 轻量门禁（计划）
