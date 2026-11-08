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

## 阶段 E：全面组件迁移 ⏳ 待开始

- [ ] 统一 EmptyState/ErrorState/Loading 组件并替换散写（约 40 文件 100+ 处 spinner）
- [ ] 匹配弹窗 4 套收敛（结构与返回行为核查后按语义分组）
- [ ] 设置双模板头部/导航统一
- [ ] 播放队列 UI 双渲染器渲染层统一（model 已共用）
- [ ] 遗留 `--ml-*`/`--ty-settings-*`/`--ui-*` 变量迁移至 tingyuTokens
- [ ] 曲库 hook 评估结论：五套 hook 同构但**缓存/失效/特判逻辑确有音源差异**，不为 UI 任务强改数据层；仅在新增音源时评估共享原语（用户约束：不得强改数据层）

## 阶段 F：系统与性能适配 ⏳ 待开始

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
