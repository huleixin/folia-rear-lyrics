# DESIGN_SYSTEM — 听屿统一视觉规范（深海薄荷 × Liquid Glass）

> 基线：commit `1745121`（1.3.182）。本规范是**收编**而非重设计：所有数值取自基线真实值。
> Token 单一事实源：WebView 侧 `src/styles/tingyuTokens.css`；Compose 侧 `InterfacePalette.kt`（+ `DarkInterfaceColors`）与 `NativePageDesign.kt`。

## 0. 架构事实（先读）

听屿是 Capacitor WebView（React 19）+ Kotlin/Compose 双渲染器。**同一视觉必须两端各有一份实现**，数值必须逐像素对齐：

| 层 | WebView（React/CSS） | Compose（Kotlin） |
|---|---|---|
| 颜色 | `tingyuTokens.css` `--ty-color-*` | `InterfacePalette.kt`（light/dark 两套） |
| 尺寸/行高 | 组件 CSS | `NativePageDesign.kt`（钉死对齐 CSS 的值） |
| 玻璃 | `mobileGlass.css`（消费 `--ty-glass-*`） | `chromeGlass` 等材质函数 |
| 动效 | `motionTokens.ts` + `tingyuTokens.css` | `TingYuMotion.kt` |

修改任一 token 必须同步另一侧，并在对应文档记录。

## 1. 颜色体系（语义化 Token）

全部走 `--ty-color-*`（CSS）与 `InterfacePalette`（Kotlin）。**深色为默认**，浅色经 `html[data-interface-appearance='light']` 覆盖；用户偏好由 `useInterfaceAppearance` 写根属性，系统跟随经 `prefers-color-scheme`。

| 语义 | 深色 | 浅色 | 说明 |
|---|---|---|---|
| bg | `#030a09` | `#f4f5ee` | 主背景 |
| bg-raised | `#0d1a17` | `#e5ede4` | 次级背景 |
| card | `#ffffff0c` | `#ffffff80` | 卡片表面 |
| accent | `#9fe0c4` | `#246e55` | 品牌强调（玉绿） |
| accent-strong | `#ace6cb` | `#246e55` | 选中态强调 |
| on-accent | `#04231b` | `#ffffff` | 强调色上的文字 |
| text | `#f4f7f5` | `#213e34` | 一级文字 |
| text-secondary | `#a2b6ac` | `#496357` | 二级文字 |
| text-disabled | `#5c6f66` | `#82958b` | 禁用 |
| icon | `#a2b6ac` | `#486153` | 图标默认 |
| border | `#ffffff20` | `#315d4326` | 常规描边 |
| selected | `#ffffff20` | `#3278561c` | 选中/激活底色 |
| danger/success/warning | 见 tokens 文件 | 同 | 状态色 |

**规则**：
1. 新代码禁止出现新的颜色字面量（`rgba(`/hex）；状态色、来源徽标色等确需新增时，先加进 tokens 文件并双端同步。
2. 浅色模式禁止直接沿用深色透明度：浅色玻璃/描边已按表覆盖，覆盖式补丁（`interfaceAppearance.css` 按 Tailwind 类名反选的规则）只许减少，不许新增。
3. 遗留的按作用域变量（`--ml-*`、`--ty-settings-*`、`--ui-*`）逐步迁移，迁移时值必须相等。

## 2. Liquid Glass

材质参数收编为 `--ty-glass-*`（CSS 侧唯一来源）：

- 标准玻璃（底栏/迷你条）：`blur(10px) saturate(1.25)` + `--ty-glass-tint` + `--ty-glass-highlight` 渐变高光。
- 导航栏加深一档：`--ty-glass-tint-nav`。
- soft-glass（播放器面）：`saturate 1.15` + `--ty-glass-tint-strong`。
- 非 Blink 降级：`--ty-glass-tint-fallback`。
- Compose 接管时 WebView 玻璃由 `composeChrome.css` 强制关闭（防双绘），Compose 侧材质在 `ChromeMaterial.kt`。

**性能红线**：父子容器不得同时执行 backdrop-filter（当前由 `[data-native-glass]`/`[data-glass-engine]` 开关链保证）；新增玻璃层前先确认没有嵌套模糊。`useLiquidGlass`（光学折射引擎）目前无引用处于休眠状态——启用属新决策，不属本规范默认。

## 3. 排版

- 字体栈：`src/utils/fontStacks.ts` 与 `index.css @theme` 保持一致（唯一事实源）。
- 字号 token：`--ty-text-2xs(10) / xs(11) / sm(13) / md(15) / lg(17) / xl(20)`。**新增文字不得使用 Tailwind 任意值字号**（存量 `text-[9px]~[13px]` 逐步迁移）。
- 字重：medium 500 / semibold 600；`550/650` 这类非标准字重存量保留、禁止新增。
- 截断：单行 `truncate`；两行以上用 `line-clamp-2`；歌名/歌单名/歌手名超长一律截断加省略，禁止换行撑高或重叠。
- Compose 侧字号以 sp 内联（CSS 像素对齐由 `Density(cssScale)` 保证），新增原生文字优先复用 `NativePageDesign` 的既有规格。

## 4. 布局

- 圆角等级：`--ty-radius-xs 8 / s 12 / m 16 / l 19 / xl 24 / pill 999`。迷你条裁剪容器固定 19px（与 Compose 对齐，勿改）。
- 间距：`--ty-space-1..6`（4/8/12/16/22/28）；页面左右边距 `--ty-space-5`（22px = `NativePageDesign.HomeInset`）。
- 列表行高：目录行 66dp（`NativePageDesign.DirectoryRow`）。
- 底部安全区：统一消费 `--folia-main-inset-*`（原生测量值）；**禁止新代码直接用 `env(safe-area-inset-*)`**（存量 7 处迁移中）。

## 5. 图标

- 唯一图标库 lucide-react（239 处）；播放控制自绘图标（`PlaybackModeIcon`/`PlayerControlIcon`）与底栏自有 SVG 资产（`TingyuNavIcon`，深浅色双份切图）是**有意保留**的例外。
- 描边：默认 1.8，选中态 2（底栏由 CSS 统一改写，组件不要再各写 stroke-width）。
- 触控热区：≥48dp（图标本身可 24px，热区由按钮撑）。

## 6. 状态组件（新增约束）

加载/空/错误状态当前无统一组件（各页自写）。**约束**：新增页面必须复用 `ty-section-error` 语义的占位模式；统一 EmptyState/ErrorState 组件在阶段 E 交付，交付后旧实现逐步替换。禁止再现「用 error 类名承载空态」的写法。
