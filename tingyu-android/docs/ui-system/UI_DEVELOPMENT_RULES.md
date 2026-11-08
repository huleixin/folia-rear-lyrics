# UI_DEVELOPMENT_RULES — TingYu UI Contract（新增页面/组件必须遵守）

> 本文件是长期防退化契约。任何 AI 或开发者新增/修改 UI 前先读完这 15 条。

1. **先判断页面类型**：一级页 / 集合详情 / 列表 / 设置 / 沉浸播放 / 浮层（见 UI_PAGE_INVENTORY.md）。没有对应类型就先在文档里提议新增类型，不许直接开写。
2. **选择现有页面模板**：详情页用 `MobileCollection`（+ `useNativeCollectionPage.ts` 双投影），列表用 `MobileTrackList`，浮层走 ThemedDialog/sheet 体系。
3. **使用公共组件**：歌曲行、封面、确认弹窗、播放状态订阅一律复用目录（COMPONENT_CATALOG.md）中的实现。
4. **颜色/圆角/间距**只用 `tingyuTokens.css` 的语义 token；Compose 侧只用 `InterfacePalette` / `NativePageDesign` / `TingYuMotion`。禁止新增颜色字面量。
5. **动效**只用 motionTokens / TingYuMotion；动画必须表达空间层级（一级淡变、二级推进、底部 sheet 上滑），可被 reducedMotion 关闭。
6. **导航与返回**：浮层必须注册 modalBackStack；返回优先级见 NAVIGATION_CONTRACT.md；禁止 window capture 级 Escape 拦截。
7. **数据展示模型**：歌曲/集合身份用 `getPlaybackSongKey` / `collectionKey`；禁止直接比较 id、禁止假设来源是 netease。
8. **音源差异**只经能力对象（capabilities）表达；禁止在行组件/页面里写 `providerId === 'xxx'`。
9. **禁止无理由复制**同类页面；偏离设计规范必须在本文件追加「豁免记录」并说明理由。
10. **禁止临时发明**新的颜色/圆角/动画体系（包括「就这一个页面用」的透明度魔数）。
11. **新增公共组件**必须带正常/空/错误/禁用与深浅色两套表现（storybook/预览或测试截图任一）。
12. **修改公共组件**必须排查全部调用方（grep 使用点）并跑 `npm run check:android-ui`。
13. **新增页面**必须同步更新 UI_PAGE_INVENTORY.md 与 UI_TEST_MATRIX.md。
14. **双投影纪律**：改集合页展示字段必须同时改 WebView DOM 与 `NativePageModel` 投影，漏一侧是最常见回归。
15. **不许因单页特殊问题**破坏公共设计系统——先在组件上开参数/插槽，参数泛滥（>6 个布尔）时改用能力对象。

## 静态检查现状

- `npm run check:android-ui`（androidPageOwnership.test.ts）：页面归属门禁，已有。
- `npm run codemap:check`：代码地图一致性，已有。
- 计划（阶段 H）：tokens 使用 lint（禁新增 hex/rgba 到业务组件）、modalBackStack 注册检查——以轻量单测实现，不自建 ESLint 插件。
