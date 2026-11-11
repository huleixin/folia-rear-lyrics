# 听屿 UI 架构与全局流畅度专项审计

日期：2026-11-11。基线：`8d28a11bb3b19aa0b3ef8b67397a7a50853f54cf`（1.5.7 / 222）。本次候选版本：1.5.8 / 223。

本次完成的是可复现的订阅、生命周期、返回栈和诊断缺口修复，不是增加一套动画。**没有连接 Android 真机，也没有安装模拟器，因此尚不能宣称已达到椒盐音乐的真机流畅度，不能给出设备帧率、启动耗时或卡顿比例的改善数据。**

## 1. 架构与证据边界

```text
React App / Zustand / 导航 journal / 业务动作
  ├─ useComposeChrome → nativeShellCommit → Capacitor TingyuChrome
  ├─ useNativePage → 语义页面模型 + session / revision / navigation 校验
  └─ useNativeSettingsDocument → 显式 flow 或隐藏表单的语义投影
        ↓
Android View / 稳定 WebView / ComposeView
  └─ ComposeChromeHost
      ├─ 普通页面：AnimatedContent + 路由身份 + SaveableStateHolder
      ├─ 歌单：现有 Compose SharedTransitionLayout / 封面身份
      ├─ 极简播放器：实际原生页 + 独立入口/退出时钟 + 封面轨迹
      ├─ 菜单、队列、工具与设置模态：原生浮层与退出内容保留
      └─ Folia 歌词舞台：保留同一个 WebView；只交接容器和触摸归属
```

React 不是 Android 普通页面的第二套可见 UI。Android 普通页面由 Compose 排版；DOM 表单、实时预览岛、允许保留的 WebView 浮层和 Folia 舞台有各自明确的例外。播放器运行时是既有播放/歌词数据的投影，不新建播放器或同步时钟。

已审查的共同路径：App 根订阅、导航 journal、shell 合并提交、页面会话与回执、原生页面保留与路由键、舞台设置首帧交接、播放器入口/退出/顺访时钟、设置 flow 模态、全局 React 弹窗、原生面板、空闲预加载、封面转换/缓存、窗口帧诊断及导出链。

证据分为三类：

- **代码确认**：可以指出实际订阅、卸载、回调或采样路径；不据此推断某台手机的耗时。
- **受控执行确认**：真实 React / Compose / 浏览器组件回归，验证状态与生命周期；JVM 或桌面浏览器不代表 Android GPU 性能。
- **待设备验证**：首次初始化的实际成本、WebView 合成、玻璃采样、图片解码尖峰、物理显示卡顿及功耗。

## 2. 确认的问题、影响范围及修复

### P1：全局 Compose 宿主订阅范围过宽

`ComposeChromeHost.Scene` 同时收集 `minimal.bound` 和完整 `minimal.state`。后者在运行时发布时含递增 revision、歌词、播放锚点和配色等。宿主真正需要的只有舞台顺访状态/令牌、播放模式、播放暂停。原有“宿主只订阅低频流”的注释与实际代码不符。

影响：播放期间位于同一宿主的首页、资料库、搜索、歌单、设置、底栏与浮层所在组合作用域。这里确认的是宿主无关失效，不等同于所有子节点都执行了完整绘制。

修复：新增 `PlayerHostPresentation`，先投影四个离散字段，再 `distinctUntilChanged`，宿主只收集这条稳定流。实际播放器叶节点继续使用完整权威状态，没有过滤歌词、播放位置或改变时钟。

证据：`PlayerHostPresentationTest` 在同一次受控 Compose 测试中输入 60 次 revision 更新，原完整订阅产生 60 次提交，投影订阅产生 0 次；模式、顺访令牌/方向、播放暂停变化均验证可达。

### P2：默认关闭的调试快照仍让 React 根组件随歌词行号更新

`App.tsx` 的根 shallow selector 直接包含 `currentLineIndex`，但根组件仅在调试快照中使用它。即使正式版本调试浮层关闭，歌词换行仍触发 App 重新执行与模型构建。

影响：所有仍挂在 React 应用树上的导航、业务模型、隐藏表单、WebView 浮层及页面桥适配器。

修复：从根大 selector 中移除此字段和未使用的 setter，通过 `useDebugLyricIndex` 在开发或实际显示调试浮层时订阅。歌词渲染器、歌词源、逐字高亮和同步信号不变。

证据：`debugLyricIndex.test.ts` 使用实际 Zustand store 和 React root；关闭调试时 60 次换行产生 0 次消费者重渲染，开启后同样 60 次变化产生 60 次更新，并验证打开时立即追上最新值。

### P3：条件卸载绕过弹窗退出生命周期；双重管理又会导致重开竞争

应用级条件分支直接移除确认/替代确认和定时关闭组件，内部动画所有者也随之消失。浏览器精修中还实际复现了父子同时管理 presence 时的重复 key 和快速重开丢失问题。

修复：AppDialogs 的条件浮层由稳定、有键的父级 AnimatePresence 保留。ThemedDialog 明确区分 `presenceOwner=self/parent`，每个实际表面只有一个存在性管理层。内容独立为保留的子组件，在正确的 presence 上下文中处理返回与退场控件。定时关闭使用原有位移/透明度视觉的 Motion 生命周期，原 CSS 动画在该表面被显式覆盖，避免两个动画系统共同管理 transform。

影响：全局确认框、不可用歌曲替代确认、WebView 定时关闭；共享 ThemedDialog 调用方保留默认自主管理。静态歌词匹配表面没有被强行增加动画。

证据：实际浏览器验证父级强制关闭时节点仍保留至退出完成、快速关开只有一份节点、系统返回、减少动态效果、焦点、重复选择；快速重开还断言无重复 key 错误。

### P4：回调变化重新注册模态返回处理器，改变栈顺序

原 ThemedDialog 注册 effect 依赖 `onClose`、`closeDisabled`；父组件生成新回调时，会移除旧项并重新压栈。较早打开的底层弹窗可能因此抢到栈顶。歌词匹配表面也没有接入共同的系统返回栈，Escape 未遵守 matching 忙碌锁。

修复：`useModalBackHandler` 按激活周期注册，用 ref 更新最新动作，回调变化不改变打开顺序。ThemedDialog、定时关闭、歌词匹配复用它；退出中的保留表面消费返回但不再执行关闭业务，歌词匹配忙碌时返回与 Escape 遵守相同的锁定逻辑。

证据：实际 React 双 root 测试依次打开 A/B，再刷新 A 的回调；B 仍消费返回，B 卸载后 A 执行最新回调，最后栈清空。

### P5：原生设置模态保留了退出内容，也保留了旧动作权限

`SettingsFlowPage` 在 `flow.modal=null` 后仍绘制 retainedModal，但把页面 action 无条件交给旧模态。退场中点击旧按钮或旧遮罩可再触发业务动作。

修复：绘制仍保留，动作按最新 modal key 校验；关闭或替换后旧内容失去动作权限。共享 `TyPanelScrim` 在退场中消费点击，但不再执行 dismiss。

影响：所有语义化设置中的选择、编辑和确认模态，不限于舞台外观。

证据：`SettingsModalExitTest` 在真实 Compose 内容打开后执行一次按钮，再关闭并冻结退场时钟，确认内容仍存在但旧按钮与遮罩不能再派发，退出结束后节点移除。

### P6：空闲预加载器在冷却时间内重复请求空闲回调

原 `uiWarmup` 在距交互或上次加载不足 300ms、或空闲预算不足 12ms 时立即递归 requestIdleCallback。浏览器可以在同一个空闲期间反复调度它；这是不必要的轮询，不是新的业务预加载。

修复：冷却用剩余时长的定时器让出执行权，低预算用 50ms 有界重试。保留单任务串行、完成去重、所有者取消、后台暂停、原生页面/底栏就绪门控。没有改成启动时同步导入所有设置模块。

证据：低预算回调后不立即排入另一 idle callback；49ms 内无任务，50ms 后仅排入一次；期间取消不会导入。原有串行/后台/原生握手测试继续通过。实际 CPU 或首次点击节省多少毫秒仍待真机。

### P7：TingyuChrome 在两个模块重复注册

`nativeChrome.ts` 和 `graphicsDiagnostics.ts` 各自注册同名 Capacitor 插件；浏览器运行实际出现重复注册警告。

修复：图形诊断复用唯一 chromeNative 实例，补齐接口类型；正常构建仍不安装图形测试采样器或标记。没有开启诊断测试构建，也没有改变渲染策略。

### P8：原诊断只保留首帧和 ≥32ms 帧，无法计算完整帧分布

修复：沿用 opt-in NavigationTiming/FrameMetrics，新增独立、有界的 FrameWindowStats。关闭诊断时不注册采样器；启用后采样 60 秒，每个窗口保留最近最多 4096 帧，计算 nearest-rank P50/P90/P95/P99、均值、最大值、布局测量/绘制均值、预算超时数与比例。API 31+ 使用每帧 DEADLINE，低版本用采样开始时显示刷新率的预算；同时报告回调丢失、观察帧数、窗口是否截断、采样开始时间和是否仍在采样。旧窗口回调通过 generation 失效。

导出链已接入这些字段。预算超时是**应用帧证据**，不是物理屏幕 jank；低版本刷新率动态变化、SurfaceFlinger/WebView 独立合成需结合系统 trace 判断。4096 帧以上显示的是最近窗口，不伪装成完整 60 秒分布。统计单测验证快帧纳入、高刷预算、分位数、回调丢失及容量截断。

## 3. 页面覆盖登记与防回退机制

`src/services/uiLifecyclePolicy.ts` 是带封闭联合类型约束的登记表，不是“全页面已实测”的声明。

| 页面或表面 | 生命周期所有者 / 复用机制 | 验证或例外 |
| --- | --- | --- |
| 首页、资料库、搜索、歌单详情 | useNativePage → ComposeChromeHost；路由键、受理校验、SaveableStateHolder | 同路由数据刷新不能当成新页面；受控路由/保留/数据包回归 |
| 首页进入及退出歌单 | 现有 Compose 共享封面身份与 SharedTransitionLayout | 未改成整页 fade；封面几何/保留机制回归，设备呈现待测 |
| 迷你播放器 ↔ 极简页 | 现有 SaltPlayerTimeline / MinimalPlayerMorph / 单份实际封面 | 入口、退出、反向、令牌测试；不修改封面轨迹或歌词舞台 |
| 极简页 ↔ Folia 舞台 | 现有原生顺访时钟、方向/令牌确认与 WebView 保留 | 阶段 store 与原生中断回归；设备交接仍需实测 |
| 设置首页及二/三级页 | 原生页面转场 + SettingsFlowPage；隐藏 DOM 只提供语义 | section、anchor、rear 页面类型登记；不保留退出 HTML 编辑器 |
| 外观、通用、播放、集成、存储、图形、开发者 | 共同 native-settings-flow | 新增 SettingsSectionId 不登记会类型检查失败 |
| interaction / lab、desktop / mods | 当前平台可用性规则 | Android 不可用或 desktop-only，明确例外，不制造入口 |
| 背屏 control/advanced/guide/diagnostics/appearance/editor/theme/backup | 8 个现有设置路由，原生设置流程 | 登记的是设置页；背屏实际歌词渲染器不接入正屏转场 |
| 字体、主题、音源等设置内模态 | flow.modal → TyPanelOverlay + retainedModal | 最新 modal key 决定动作权限；退出保留测试 |
| 歌曲/歌单菜单 | TyPanelLayer，保留最后内容，当前 session 才能动作 | TyPanelHost 回归 |
| 队列、音质/效果器/歌词工具、定时 | 现有原生 sheet / scrim；WebView 回退使用各自登记的所有者 | 触摸、外部关闭、内容保留、系统返回测试 |
| 确认、替代确认 | 显式唯一 presence owner | 浏览器快速关开/父级卸载验证 |
| 歌词匹配 | 原有静态表面 + 模态返回栈 + busy 锁 | 不为覆盖率强加新动画 |
| Folia 逐字歌词、实时预览岛、背屏、灵动岛 | 原有独立渲染器与时钟 | 保护性例外，未重新挂载或统一动画驱动 |
| 底部导航 | 原有流动切换实现 | 未修改其动画参数、绘制或状态机 |

接入规范：新普通页走 useNativePage；同一路由模型更新保留身份；新设置项登记真实 section/anchor；原生模态保留退出像素但撤销过期动作；React 条件浮层必须指定存在性管理层和稳定 key，不能同时由两层 AnimatePresence 管理同一内容；回调刷新用稳定返回处理器；减少动态效果沿用已有系统/用户设置。静态控件无需新增动画。

页面适配器启用时在原有 opt-in 日志中记录 `page-lifecycle-owner`，便于诊断隐藏页面或旧会话是否绕过共同路径。登记测试使用实际 settings nav/anchor 定义；行为保障来自真实组件与状态机测试，不用词法覆盖数代替交互验证。

## 4. 关键修改文件

| 文件 | 关键位置 |
| --- | --- |
| `android/app/src/main/java/io/github/huleixin/tingyu/chrome/PlayerHostPresentation.kt` | 四字段投影及去重流 |
| `android/app/src/main/java/io/github/huleixin/tingyu/chrome/ComposeChromeHost.kt` | Scene 的 hostPresentations 收集与离散控制读取 |
| `src/hooks/useDebugLyricIndex.ts`、`src/App.tsx` | 根歌词行号订阅门控 |
| `src/hooks/useModalBackHandler.ts` | 激活周期注册、最新回调 ref |
| `src/components/shared/ThemedDialog.tsx`、`ConfirmDialog.tsx` | 唯一 presence owner、内容保留与退场 inert |
| `src/components/app/dialogs/AppDialogs.tsx` | 有键条件浮层与稳定父级存在性边界 |
| `src/components/modal/UnavailableReplacementDialog.tsx` | 显式父级存在性管理 |
| `src/components/modal/SleepTimerSheet.tsx` | 退出保留、返回栈、减少动态效果 |
| `src/components/mobile-player/MobileLyricMatcher.tsx` | 系统返回与匹配忙碌锁 |
| `android/app/src/main/java/io/github/huleixin/tingyu/chrome/SettingsFlowPage.kt`、`TyPanelStyle.kt` | 退场动作及遮罩权限 |
| `src/services/uiWarmup.ts` | 冷却与低预算让出执行权 |
| `src/services/nativeChrome.ts`、`graphicsDiagnostics.ts` | 单一插件实例及诊断类型 |
| `android/app/src/main/java/io/github/huleixin/tingyu/chrome/FrameWindowStats.java`、`NavigationTiming.java` | 全帧有界分布、回调失效、采样元数据 |
| `src/services/navigationTiming.ts` | 报告包含帧分布及窗口元数据 |
| `src/services/uiLifecyclePolicy.ts`、`src/hooks/useNativePage.ts` | 生命周期登记与实际适配器诊断接入 |

新增测试：PlayerHostPresentationTest、SettingsModalExitTest、FrameWindowStatsTest；debugLyricIndex、modalBackHandler、uiLifecyclePolicy 及 warmup/浏览器用例扩展。没有新增依赖或升级 Compose/Navigation/Motion，也没有复制第三方源码，许可证清单不变。

## 5. 验证结果

以下为本次实际执行结果，最终构建结果在交付时补录：

- TypeScript / 主题生成一致性：通过。
- 前端针对性单元与架构测试：70 项通过（13 个文件），含页面归属 18 项、导航 journal、阶段令牌、页面桥/图片桥、返回栈、预热与关闭诊断零采样。
- 原生针对性 JVM / Robolectric：69 项通过（15 类），含本次状态投影/模态退出/分布统计，以及包预解析、路由栅栏、页面保留、行缓存、首帧顺序、播放器轨迹/退出、首帧交接、原生面板和 sheet 触摸。
- 桌面 Chrome 实际组件：17 项通过，覆盖浮层生命周期与设置导航；未发现重复 key 或重复插件注册错误。Service Worker 被测试配置主动屏蔽的提示属于预期。
- 原生测试采用 LEGACY 软件测试环境的用例，不声称其像素或运行耗时等同真机 GPU。
- 扩展试跑发现 `test/component/collectionMorph.spec.ts` 的 11 项测试引用基线已不存在的 `collectionMorph` 探针。这 11 项未能执行到产品代码，未标为通过、未删除或通过 skip 掩盖，也未复活已淘汰的 WebView 歌单实现。当前歌单原生机制通过现有几何/保留类测试覆盖；完整歌单设备交互仍待验证。
- 没有宣称整仓所有历史测试通过。

## 6. 性能数据及同条件对比计划

可报告的前后对比仅限受控机制：

| 相同输入 | 原订阅/原机制 | 修复后 | 证据性质 |
| --- | --- | --- | --- |
| 60 次播放器 revision 更新 | 完整订阅宿主提交 60 次 | 四字段投影宿主提交 0 次 | 同次 Compose 测试，不是设备帧时间 |
| 60 次歌词行号变化 | 订阅消费者更新 60 次 | 调试关闭的消费者更新 0 次 | 实际 React/Zustand 测试，不是 Android UI 基准 |
| 空闲预算不足 | 代码立即重新请求 idle callback | 50ms 后才允许下一次请求，取消后不加载 | 受控调度器测试，不是 CPU 节省百分比 |
| 退出模态仍可见时操作 | 代码仍持有旧业务 action | 绘制保留、动作拒绝 | 真实组件回归，不是设备延迟数据 |

设备验证矩阵：

| 场景 | 启动/操作耗时 | 帧 P50/P95/P99、预算超时 | 主线程/资源/物理显示 |
| --- | --- | --- | --- |
| 冷启动、首次点击 | 待测 | 待测 | 待测 |
| 首页 → 歌单 | 待测 | 待测 | 待测 |
| 歌单 → 首页 | 待测 | 待测 | 待测 |
| 迷你播放器展开/收起 | 待测 | 待测 | 待测 |
| 极简页 ↔ 歌词舞台 | 待测 | 待测 | 待测 |
| 设置首页、二/三级页 | 待测 | 待测 | 待测 |
| 搜索/资料库长列表滚动 | 待测 | 待测 | 待测 |
| 菜单/队列/定时打开关闭 | 待测 | 待测 | 待测 |
| 主题连续切换 | 待测 | 待测 | 待测 |
| 播放中导航、快速返回、后台恢复 | 待测 | 待测 | 待测 |

执行方法：同一设备固定刷新率、字体/主题/动效设置与播放音源，使用相同 Release 类型，保留相同歌单/缓存条件；基线和候选按同一操作脚本分别测试，至少 5 次冷启动和每场景 10 次操作，首次与热态分开。每场景单独重新开启“导航与设置诊断（60 秒）”，冷启动则先启用再系统强停重启，操作后导出，避免混用多个采样窗口。记录 retained/observed/lost 后再解释分位数。

需要系统归因时用 Perfetto/Android System Trace 同步采集 gfx/view/wm/input/WebView、调度和频率；`adb shell dumpsys gfxinfo io.github.huleixin.tingyu framestats` 与 `dumpsys meminfo` 记录窗口/内存证据。JavaScript 用已有 long-task 样本并按需附加 WebView Performance/React Profiler。CPU profiler、profileable 构建配置、刷新率切换和系统 trace 是否可用需在具体设备确认。本次没有运行这些设备采样，不编造结果。

## 7. 尚未验证的风险与保护核对

- 大型设置隐藏表单的语义捕获成本、首个 lazy chunk 解析、浏览器图片缩略图 `toDataURL`、大歌词/队列消息的实际主线程占用：静态风险，尚无设备耗时支持进一步重构。现有包预解析已在 UI 线程外，封面有有界缓存/后台解码，未无证据推翻它们。
- WebView 与 Compose 的真实合成开销、玻璃取样、首帧闪烁是否完全消除，需检查系统 trace 与录屏，不能用单元测试替代。
- 原生 modal key 校验不能代替整个页面的 session/navigation 校验；既有上层栅栏继续保留。
- 诊断开启会有采样开销；正式流畅度比较须两版采用相同诊断配置，必要时再做关闭采样的系统级对照。
- 历史 WebView 歌单探针缺失的测试基础设施债务尚未迁移；不得把那组不可执行测试算成产品回归通过。
- 没有修改底部导航流动动画、Folia 逐字渲染/歌词时钟、Media3、背屏/灵动岛歌词核心逻辑；没有禁用现有动效、替换 UI 或增加模糊层。

## 构建与交付记录

构建/最终复核进行中；以本节最后补录结果为准。输出日志位于工作区 `outputs/performance-*.log`。APK 需验证包名、1.5.8/223、原有签名与前端资源一致性后再作为本次候选交付。
