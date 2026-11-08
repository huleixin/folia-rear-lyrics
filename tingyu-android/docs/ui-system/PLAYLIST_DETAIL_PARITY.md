# PLAYLIST_DETAIL_PARITY — 歌单详情双端差异核实与收敛记录

> 2026-11-08 阶段 C。方法：逐行对比 WebView 实现（MobileCollection/MobilePlaylistHeader/MobileTrackList + mobilePlaylistDetail.css）与 Compose 实现（NativePlaylistPage/NativeDirectoryPage/PlaylistAffordances），静态分析，**未做真机截图比对（待验证）**。

## 1. 渲染路径确认（问题 1-5）

| 问题 | 结论 |
|---|---|
| 本地/在线歌单渲染路径 | **同一模板**：本地走 `staticCollectionResource`、在线走 `onlineCollectionResource`、Navidrome 走独立装配，全部汇入 `MobileCollection.tsx`（WebView）或 `useNativeCollectionPage.ts → NativePlaylistPage.kt`（Compose）。NATIVE_FIRST 下 WebView DOM 编译期剔除，由 Compose 绘制 |
| Compose 与 React 结构一致性 | 按「同结构同度量」对齐（NativePlaylistPage.kt:35 注释即声明对标 CSS）：封面尺寸公式、标题 clamp、行高 52、分隔线位置、按钮几何逐项一致（详见 §2 矩阵） |
| 多入口一致性 | 推荐/资料库/搜索进入同一歌单均走 `collectionNavigation` 栈 + 同一 collection surface；无按入口分支的布局 |
| 特殊场景（每日推荐/收藏/自建） | **无独立旧布局**：daily 只在首页卡片层特殊（`ml-feature-card`），打开后走普通 collection 流水线；收藏/自建差异仅在能力配置（subscribe/mutations） |
| NATIVE_FIRST 回退外观 | 回退 ≠ 旧页复活：DOM 被 `content-visibility:hidden` 强制隐藏，实际呈现 `NativePageFallbackPanel`（错误文案+重试胶囊）。回退触发条件：pageUpdate 被拒（指数退避 80ms→2s）、桥调用异常（该页本次挂载永久回退）、包>1.5MB |
| 集合菜单/本地管理 sheet | **NATIVE_FIRST 下仍由 WebView 渲染**（MobileCollection.tsx:198-211 在 `!native` 门外挂载）——这是有意的 overlay 分工，非不一致 |

## 2. 差异矩阵与收敛状态

| # | 项 | 差异（核实值） | 状态 |
|---|---|---|---|
| 1 | 页面背景渐变 | CSS `#071e18→#031812 58%` vs Kotlin 三段 `#03221A/#03130E/#031812` | **已收敛**：CSS 改三段对齐 |
| 2 | muted 色值 | 三处三值 `#a1b7ae`/`#a2afaa`/`#a2b6ac` | **已收敛**：统一 `#a2b6ac`（=InterfacePalette dark.muted），并加 designTokenParity 测试防回退 |
| 3 | 当前行样式 | CSS 2.5% 底 vs Kotlin 14% 底+3dp 玉绿竖条 | **已收敛**：CSS 对齐 Kotlin（底 `#7ee0c224`+竖条） |
| 4 | 错误态 | CSS 红字 13px+文字钮 vs Kotlin muted 12sp+胶囊钮 | **已收敛**：歌单详情作用域 CSS 对齐（muted+胶囊） |
| 5 | 序号对齐 | CSS 左对齐 min-17 vs Kotlin 右对齐 ≥19 | **已收敛**：CSS 右对齐 min-19 |
| 6 | 收藏 Heart 图标 | CSS 侧 22/`#e9f5ef` vs Kotlin 24/`#F4F7F5` | **已收敛**：Heart 24、色 `#f4f7f5` |
| 7 | 顶栏水平边距 | CSS 总 26px vs Kotlin 10dp | **已收敛**：Kotlin 改 26dp |
| 8 | 播放指示器 | CSS 4柱18×20 820ms 中点缩放 vs Kotlin 3柱12×15 1500ms 底部对齐 | **已收敛**：Kotlin 对齐 WebView（4柱/18×20/820ms/负延迟/中点缩放/暂停停 0.4） |
| 9 | 封面阴影 | CSS `0 8px 24px #0003` vs Kotlin 无 | **已收敛**：Kotlin 加 shadow(8dp, r12) |
| 10 | 歌单内搜索返回键 | Kotlin 有 BackHandler 先收搜索；WebView 无 | **已收敛**：WebView 经 modalBackStack 注册（仅 `!native` 时，避免与原生抢返回） |
| 11 | 搜索交互形态 | Kotlin：页面级固定层 morph 展开 280ms+取消钮；WebView：列表头内条件渲染无动画 | **保留差异**（记录）：形态改造成本高、影响布局结构；NATIVE_FIRST 正式包只见 Kotlin 形态。列入后续版本 |
| 12 | 封面占位图 | CSS Disc3 图标 vs Kotlin 纯色块 | **待收敛**（低成本项，需 NativePageIcon 增加 disc-3 几何） |
| 13 | 定位当前按钮 | CSS 药丸「图标+文字」42 vs Kotlin 40dp 圆钮 | **保留差异**（记录）：形态分歧不影响交互语义 |
| 14 | 音质标签配色混合比 | CSS 各档 52%~58% vs Kotlin 统一 50% | **待收敛**（低风险微调，需确认色差是否可感知） |
| 15 | 标题超长断词 | CSS `overflow-wrap:anywhere` vs Kotlin 词级省略 | **保留差异**（平台排版引擎差异，无法等价） |
| 16 | 首行圆角/上边框 | CSS 有 vs Kotlin 无 | **待收敛**（二选一，需视觉决策） |
| 17 | 底部留白 | CSS 尾 72+inset vs Kotlin 100+safeBottom | **待核实**（需真机确认视觉差） |
| 18 | 浅色模式 | CSS 歌单页硬编码深色无 light 分支；Kotlin 有完整 light palette | **结构性差异**（NATIVE_FIRST 下浅色由 Compose 绘制正确；WebView 回退态浅色歌单页待真机验证） |

## 3. 核实中的审计纠错

- 阶段 A 报告「WebView 歌曲行无音质标签」**不成立**：`MobileSongSubtitle` 有 `.ml-quality-text`（9px/600，按档配色），与 Kotlin `MinimalQualityBadgeText` 同源（high→HQ、lossless→无损）。真实差异仅配色混合比（矩阵 #14）。
- 「确认弹窗三套」修正：`ImportConfirmDialog` 是基于 ThemedDialog 的**逐字段导入选择器**（合规注册返回栈），非确认弹窗变体；`DeleteFolderConfirmModal` **零引用死代码已删除**。真实确认弹窗事实源即 `ConfirmDialog`（ThemedDialog 基座）。

## 4. 验证方式与局限

- 本矩阵为静态源码比对；「已收敛」项经 CSS/Kotlin 数值逐项对齐 + `designTokenParity.test.ts`（6 断言组）+ `check:android-ui` 门禁验证。
- **视觉一致性最终结论必须等真机截图比对**（Compose vs WebView 同歌单、深浅色双态），当前标记为待真机验证。
