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

## 阶段 C：跨音源试点 ✅ 审计完成 / 统一已存在

- [x] 审计结论：本地/在线歌单详情已共用 MobileCollection + CollectionResource（无复制粘贴）
- [x] 跨音源身份规则固化（MEDIA_UI_CONTRACT.md）
- [ ] **待迁移**：WebView 歌曲行补音质标签（与原生行对齐，`catalogAudioSpecs`）
- [ ] **待迁移**：曲库 hook 五套同构（useNetease/Qq/Kugou/Bodian/Qishui）收敛为共享会话原语

## 阶段 D：动效与导航 ⏳ 部分完成

- [x] 动效 Token 全线落地（阶段 B 覆盖）
- [x] 极简页动效规则固化（MOTION_SYSTEM.md §3）
- [ ] **待迁移**：Escape/返回 2 处绕过 modalBackStack（MobileSettingsLanding / MobileHome）收敛
- [ ] **待迁移**：Lattice 死代码接线摘除（useAppNavigation:152,382-390,430-437）
- [ ] **待迁移**：确认弹窗 3 套 → ConfirmDialog 变体

## 阶段 E：全面组件迁移 ⏳ 待开始

- [ ] 统一 EmptyState/ErrorState/Loading 组件并替换散写（约 40 文件 100+ 处 spinner）
- [ ] 匹配弹窗 4 套收敛
- [ ] 设置双模板头部/导航统一
- [ ] 播放队列 UI 双渲染器渲染层统一（model 已共用）
- [ ] 遗留 `--ml-*`/`--ty-settings-*`/`--ui-*` 变量迁移至 tingyuTokens

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
