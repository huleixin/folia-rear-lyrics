# 设置二、三级页原生化

设置 UI 统一使用现有 `SettingsFlowPage`、`TySettings` 和 `TyPanel`。不新增主题、色板、
圆角体系或底栏实现，Haze 顶栏和 Kyant0 底栏依赖保持原版本。

## 渲染与业务边界

`useNativeSettingsDocument` 为所有分区、三级编辑器和背屏设置生成语义化 `flow`。
`nativeSettingsSemantic` 读取挂载表单的标题、说明、值、选择项与原有处理器，
同时读取页面显式声明的 `data-settings-layout` / `data-settings-style`，形成 `flow.layout` 树。
不读取控件坐标、浏览器文本折行或滚动偏移。Compose 按树自主排版、滚动和处理命中区。
旧的显示列表读取器仅为历史协议兼容，当前设置页不再生产 `paints/controls/areas`。

覆盖外观、界面、播放、音源与系统歌词、存储、图形、开发者、关于帮助、主题/配色、
舞台字体/背景/歌词样式、歌词过滤、全局时间偏移，以及背屏引导、诊断、独立外观和备份。
首页与已原生的背屏控制页继续使用既有实现。

开关、单选、滑块、文本框、文件入口、图片、折叠项、颜色编辑和确认弹窗均使用原生控件。
原有选项的选中状态与禁用条件保留；导入的部分选中使用三态复选框，本地歌词格式
优先级使用原生上移/下移操作，仍调用原有排序提交及重新扫描提示。
输入保留焦点、失焦、IME 确认及实时校验事件，允许清空；密钥使用密码显示和键盘类型。
文件仍经现有 SAF 桥选择，回到原来的 React change 处理器。设置持久化、视觉配置编解码、
逐项导入确认和播放业务不迁移到 Kotlin，不新增第二份状态管理。

## 实时预览

Folia 继续负责真实歌词/动态背景像素。Compose 决定预览框的大小、位置和可见裁剪，
WebView 仅在该框内呈现；不再反向从浏览器测量原生控件位置。预览中的暂停、分区切换
按钮保留在原来的预览覆盖位置；主题/配色使用原来的二维取色面和色相条，
不再用额外的整行操作或三条滑块挤占页面。旧 DOM 按钮隐藏。离开页面恢复原始样式并清理监听。

预览动画的 DOM/样式变化不投影整个表单；只有离散设置变更、异步业务状态和预览控件
语义变化触发批次更新。没有新增帧循环、轮询或动画计算。

## 回归

- `test/unit/services/nativeSettingsSemantic.test.ts`：无坐标投影、原处理器、清空、失效/禁用项、
  模态层、文件入口、折叠项、选择器、颜色与预览放置。
- `chrome/SettingsSemanticPageTest.kt`：真实 Compose 输入、窄屏二三级切换、确认框和模型解析。
- `test/component/nativeSettingsSemantic.spec.ts`：真实设置业务组件的八个分区、偏移、过滤、
  舞台、主题编辑及取色回传。
- `npm run check:android-ui`：禁止设置路由恢复 DOM 坐标采集。

小米真机需验：浅/深主题、系统字体缩放、窄屏、键盘遮挡与返回手势、连续进入返回、
预览滚动裁剪和透明合成、SAF 选择/取消、导入导出、后台恢复。浏览器和 Robolectric
通过不能代替上述验收。

## 旧版排版恢复（2026-11-10）

恢复基线为原生化之前的 `1e98e1ef`。上一版只传控件列表，自动分组造成卡片、
同行说明、选择网格和预览操作位置丢失。本次不回退 WebView UI，而是把原 JSX 中的
卡片、行、网格、间距、字号、圆角和文本角色声明成布局树；声明使用原设计 token，
不从 CSS 计算字体或读取 DOM 矩形。未声明的包装层透明，不自动创造分组或分隔线。

`SettingsLayoutView` 负责原生 column/row/wrap/grid/card/segment；`SettingsLayoutControls`
负责原位置上的控件，标签与说明只在源页面声明一次。`SettingsLayoutInput` 不再追加
重复标题和确定按钮；`SettingsLayoutPreview` 保留原预览高度与覆盖按钮。
页眉仍为单一 Haze 三层，恢复 22sp 标题、40dp 返回入口以及原左右边距；页眉帮助入口
保留。Theme Park 的目标/保存工具条保留独立横向结构，不挤进标题旁的几个图标位置。
底栏显示规则、设置业务、持久化及歌词/背屏运行逻辑未改变。

布局声明和业务控件分别序列化；布局只按 `ref` 引用当前控件，禁止把整页转成绝对坐标。
新增设置布局必须同时补布局声明，不能以控件能点击就视为排版恢复完成。

回归增加 `settingsPageLayout.test.ts` 和 `SettingsLayoutRenderTest.kt`。后者使用真实业务
宿主导出的 13 个路由 fixture，检查两列选项同排等宽、同行开关不出屏，并覆盖 393dp
浅深色、320dp 窄屏以及 380dp 缩小视口。它不是系统输入法测试。

设置 `TINGYU_LAYOUT_SCREENSHOTS` 可导出 Robolectric 原生软件绘制截图。本机 Haze
RenderScript Surface 不可用，导出时使用 `TINGYU_TOP_GLASS_BLUR=false` 的既有 fallback；
仅用于排版检查，不能据此声称真实模糊、GPU 合成或真机动画已验证。正式 APK 恢复
`TINGYU_TOP_GLASS_BLUR=true`。布局截图应与原业务 DOM 参考图人工核对。

设置图标由 `dev/build/exportSettingsIcons.mjs` 从已安装的 Lucide 几何导出，保留旧名并补齐实际
名称（例如 circle-play / circle-question-mark）。fixture 中的每个图标都受资源覆盖测试保护。

共享的播放去向卡片和 ConsoleLogPanel 同样声明行/网格布局。带边框的 row/grid 仍保留
自己的方向，边框不会把它们改成纵向 card。播放去向示意图仅作为显式标记的小 SVG
矢量资源由原生绘制，使用 Compose 分配的尺寸，不包含页面/表单测量坐标。
运行日志筛选菜单作为原生 TyPanel 菜单呈现，动作仍回到原来的过滤状态。
