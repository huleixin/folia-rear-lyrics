# 全局界面主题维护说明

本系统只管理普通 App 界面。迁移前的颜色位置和依赖见 `INTERFACE_THEME_INVENTORY.md`。经典主题保留历史组件之间本来就存在的色值、渐变、浮点透明度差异；新增主题用共同的语义角色生成这些组件变体。

## 唯一颜色来源

`src/theme/interfaceThemeSpec.json` 包含 17 个语义角色、83 个原生 Token、5 组页面渐变和 225 个 Web 颜色配方。经典的精确值与所有新主题均在这里注册。

`dev/build/generateInterfaceThemes.mjs` 生成 TypeScript 注册表、CSS 变量、Kotlin 注册表和 InterfacePalette Provider、Android 启动资源、Web 启动脚本与首帧 CSS。不要直接编辑生成文件。构建、类型检查和 Android preBuild 都运行生成一致性检查，阻止两端色板漂移。

普通原生页面读取 `LocalInterfacePalette`，Material、TyPanel、玻璃、导航和启动背景在公共适配层消费同一色板。Web 在普通界面边界重绑 CSS 语义变量；Portal 菜单和弹窗也有明确作用域。组件配方中的透明度、圆角、模糊和折射参数保持现有值，只替换需要主题化的颜色。

## 状态与切换

- 主题风格：`classic` / `glacier`，Web 单独保存为 `tingyu_interface_theme_v1`。
- 显示模式：`system` / `light` / `dark`，继续使用 `tingyu_interface_appearance_v1`。
- 老用户没有主题风格时回退经典；原有模式继续有效。无法识别的主题 ID 回退经典。
- Native SharedPreferences 镜像同时保存 mode/style；Web 启动仅在对应本地键缺失时从原生补齐。桥接写入串行化并丢弃过期响应。
- 切换修改根属性和 Compose Provider，不调用 Activity recreate、WebView reload 或播放器重建。跟随系统独立更新当前明暗。
- Web 在正文前同步设置首帧颜色；Activity 在 super.onCreate 前选择启动主题。Android 12+ 还持久化下一次 starting-window 主题。保留旧启动资源别名，兼容系统已经保存的资源标识。

## 增加第三种主题

1. 在 spec.themes 添加唯一小写字母开头、仅包含小写字母/数字的 id、label、labelKey，以及 light/dark 色板。不要设置 classic 标记。
2. 两套色板都填写以下 17 个 `#RRGGBB` 角色：background、backgroundEnd、surface、sheet、ink、muted、accent、border、button、onAccent、danger、glass、reflection、shadow、disabled、success、warning。
3. 运行 `npm run theme:generate` 并提交 spec 和生成文件。设置卡片自动遍历注册表，不需要逐页添加主题 ID 判断。labelKey 的翻译可补入语言文件；缺失时显示 label。
4. 运行 `npm run typecheck` 和主题测试。检查新色板文字/按钮对比度、半透明叠加后的可读性、原生与 Web 预览、系统栏和启动帧。

现有材质的光学参数由公共玻璃预设负责；新主题只需给出 glass/reflection/shadow 颜色即可复用。若未来确需新增光学参数，应加到统一配置和生成器，不在业务页面写主题特判。新增语义角色时同样集中修改 spec 和生成器。

## 覆盖范围与边界

已接入普通首页、曲库/目录/歌单详情、搜索、设置索引和原生设置内容、普通按钮/输入/开关、面板/弹窗/底部 Sheet/下拉菜单、顶部玻璃栏、底部导航、迷你播放器、定时面板、状态栏/导航栏图标与启动底色。

保持独立：Folia 歌词舞台、AI/自定义歌词视觉及编辑器中的颜色值和预览、极简播放器及其封面取色、背屏舞台、灵动岛、封面/插画/推荐艺术设计、二维码白底、透明遮罩与光学计算。设置这些功能的普通设置外壳仍跟随界面主题。`isDaylight` 和 `followSystemTheme` 继续属于歌词系统。全局风格不会写入这些字段或歌词主题快照。

## 验证范围（2026-11-10）

阶段一在统一经典架构后、引入冰川前，与基线 550bdf9e2c28d01b972ba02c8a3d997dd5aa6a87 对比：11 张固定浏览器截图逐像素相同；另有经典 CSS 配方指纹保护。截图覆盖首页浅/深色及曲库、歌单、搜索、不同宽度设置和定时面板，不能代表所有真机页面已经逐像素验收。

最终类型检查、生成一致性检查、Android UI 所有权检查、Web 生产构建/资源同步、Android debug 构建通过。主题相关 Web 单元测试 167 项、浏览器组件测试 8 项、所选原生测试 36 项通过。全量 Web 单元测试为 7,461 通过、32 失败、2 跳过；32 个失败名称与原始基线复现结果完全一致，完整套件并非全绿。

原生截图使用 Robolectric 的生产设置内容，验证 393/320 宽度、颜色预览、动作回传以及输入/焦点保留。Haze 的 RenderScript Surface 无法由该测试环境的 software Canvas 分配，因此截图不含玻璃标题栏，不作为 GPU 模糊效果证据。

未做真机验证：冷启动/升级第一帧、Activity 重建的完整用户流程、实际播放时切换、真实 Compose/WebView 桥接时序、液态玻璃 GPU 效果和帧时间、背屏/灵动岛实机隔离。Android 12 之前由系统绘制的最早 starting-window 以及升级后首次系统启动主题，仍需要设备录屏确认；自动化只验证了颜色映射、恢复和资源契约。
