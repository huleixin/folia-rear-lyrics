# Folia Android 449 选择性移植报告

当前状态：P0 画质、雾笺与町景已实现并进入正式安装包交付；P1 尚未施工。

## 可复现基线

| 项目 | 固定版本 | Commit |
| --- | --- | --- |
| 听屿 | 1.5.16 / 231 | a52e0636172335d68a837a4e8c91d218238d3327 |
| Folia Android | v0.7.27-android.449 | 37ba4903a7148883d75492f0f07afbda2c68f647 |
| Folia Desktop | v0.7.27 | 4a545c96229664c0e07d4fb04971264e8d75fdd2 |

在干净工作区建立 `feat/folia-449-selective-port`，保留原生导航、播放、背屏和品牌开屏成果。只按文件移植，不做全量合并。Android 源文件从固定提交下载并逐一验证 Git blob SHA；桌面固定提交按需读取同类源文件。

## 实际代码审计

类别：1 已有；2 补差异；3 缺失可适配；4 需要移动改造；5 高风险暂缓。

| 能力 | 类别 | 源码证据、适配和风险 |
| --- | --- | --- |
| 15 种旧舞台和共享时钟 | 1 | `types/visualizerModes.ts`、`visualizer/registry.tsx`、`stores/motionSignals.ts`、`songHandover.ts`；保留注册及逐字时间轴 |
| 随机舞台池 | 1 | `utils/randomVisualizerModes.ts`、`MobileRandomVisualizerSettings.tsx`、`useVisualizerSettingsStore.ts`；已有池校验、持久化和背屏独立设置，只需自动纳入新注册项 |
| 全局分辨率、每模式覆盖、AA | 2 | 本地 `utils/stageRenderBudget.ts` 只有 Android 1.5 DPR 上限；上游 `utils/lyricRenderQuality.ts`、`visualizer/renderQuality/` 有覆盖与 AA，需接本地设置语义投影、导入导出 |
| 资源复用、舞台暂停 | 2 | 本地 `pixiRuntimeHost.ts` 已有 AbortController、最新歌曲排队合并、就地换歌；`visualizerFrameChannel.ts` 已分离 UI 与舞台 RAF、背屏低功耗节奏。不得替换这些机制 |
| 雾笺 Nebbia | 3 | 上游 `visualizer/nebbia/` 含雨窗/凝露/雪、水族箱、手写/擦除和恢复；`dev/nebbia/nebbiaStrokesPlugin.mjs` 提供 AnimCJK 笔画和授权资源。需适配本地字幕接口、预览和设置面板 |
| 町景 Machi | 3 | 上游 `visualizer/machi/` 含便利店/加油站/酒吧、相机、天气和后处理；`engine/programWarmup.ts` 异步预热，`engine/quality.ts` 帧耗时降级。需保留本地生命周期、可重试文本降级 |
| 智能动感分析 | 4 | 本地只有 `services/beatFx/clock.ts` 的节拍类型和增益函数；上游 `beatFxLive.ts`、`analysis/drumHits.ts`、`vocalEnvelope.ts` 依赖本地模型和 WebGPU。不能把空分析结果当作完整接入；不引入外部 AI API |
| 多行字幕 | 2 | 本地 `VisualizerSubtitleOverlay.tsx` 已有翻译/罗马音/下一句；桌面固定版本有布局描述模型，自由三行需单独适配，不能覆盖现有字幕样式 |
| 混合队列和来源标识 | 2 | `usePlaybackQueueController.ts` 经 Omni 和 `appPlaybackGuards.ts` 处理多来源；`nativeQueueSupervisor.ts`、`useNativeQueuedPlayback.ts` 使用 generation/AbortController。保留 Media3，P1 只补已证实缺陷 |
| 歌词别名、TTML、分词 | 2 | `utils/lyrics/amllDbCandidates.ts` 已将译名用于候选评分，`autoMatchBestLyric.ts` 与 `parserCore.ts` 已有回退；需逐项对照搜索和异常边界，不能声称全缺或全齐 |
| Scratchpad | 4 | 上游 `app/scratchpad/scratchpadModel.ts` 数据模型可复用，但桌面抽屉不适配现有 Compose 导航与手势；P1 评估原生触屏承载 |
| 桌面窗口、Electron、桌面设置 kit | 5 | 不导入运行时。上游新 kit 的控件缺本地 Android 设置语义标记；须用现有 SettingsRow 等控件适配 |

## 上游移动性能依据

町景历史：`3b4f01a7` 分段建场景；`65757f41` 合并后处理、8 位缓冲和四分之一 Bloom；`3c8970e3` 首先退超采样/MSAA；`9bbe9909` 以最快帧间隔识别刷新率；`29844d11` 避免动态降刷新率触发无效降质；`1805919c` 缓慢霓虹变化。雾笺：`004bc630` 萤虫原地剔除减少分配；`11224c54` 水族箱高光和水草节拍；`ba8979b1` 萤虫边界、resize 保留。均从固定提交前的源码历史核实。

## 原始基线与测试限制

- 类型检查通过。最初单测 7557 项：7503 通过、52 失败、2 待定。
- 初始 node_modules 与锁版本不符；锁文件还把 colors / expect-type / node-forge / once / resolve-path / ylru 六项错误标成 1.3.119，但 resolved/integrity 指向 1.4.0。只纠正元数据并重新安装。
- 锁定依赖后单测：7514 通过、41 失败、2 待定。失败涉及旧原生页面断言、主题启动脚本测试环境、matchMedia mock 等，逐项修复中；不把基线失败归因于本次移植，也不将其隐去。
- Windows Chrome headless、Vite、412×915、DPR3：Sonnet/Hanabi/Diorama 首次 canvas 附着 2612/2872/3322 ms，采样 RAF 中位数 10ms、P95 10.1ms；均无 pageerror。这是浏览器调度与开发加载基线，不是 GPU 完成时间或 Android FPS。
- 三舞台末次 JS heap 154567508/133725620/123976310 bytes；不等于 GPU 显存，不能据此证明无泄漏。
- 无 adb 设备。未验证 Android 冷启动、首次展开、连续切歌、锁屏/后台恢复、背屏/LSP/Shizuku及不同设备 WebView。音频切歌时延未测，必须与 UI 帧耗时分别记录。
- 详细日志保存在工程外 `hze/outputs/folia-449-*`，不包含用户账号或密钥。

## 阶段提交与交付

P0 已在 1.5.17 / 232 完成首次正式包交付，阶段 SHA 与构建证据见下文。1.5.18 / 233 修复新舞台的设置、背屏应用、预览和摄像头避让；P1 仍暂缓。

## 阶段一：画质系统已实现

- 全局自动/高画质/省电和高级自定义，8 个现有画布模式单独覆盖分辨率与 AA；复用现有外观/性能设置及 Compose 语义行。保存、同步、OBS、视觉配置导入导出已接入。
- Pixi/Canvas 的分辨率就地更新；只在需要改变上下文 AA 时重建。Tempera 的滤镜纹理和暂停模式会同步重绘；Fume 静态缓存、Monet overlay、Pendolo 和 Diorama 同步画质。
- 自动挡使用现有舞台 RAF 通道的实际调度间隔，4 秒热身、8 秒窗口、P90 和恢复滞回，跳帧/暂停/预览/背屏不采样。此指标不是 GPU draw 完成耗时，不宣称 Android 帧率提升。
- Android 原有 1.5 DPR 上限保留；主屏覆盖不改变背屏策略。显式每模式分辨率优先，不再叠自动降质。
- 全量单测 7564 项：7562 通过、0 失败、2 原有待定。基线旧断言和 mock 的修复独立提交 6ebc47d，没有调整稳定产品行为迁就测试。类型/主题检查通过。
- UI 回归 9/9 通过（画布播放/暂停 resize、嵌套滤镜和原生设置语义）。第一次 8/9：长期 Vite 热更新产生带时间戳与测试直接导入的两份 store；重启服务后全部通过，无产品改动。
- Windows Chrome、DPR3、412×915 暂停实测：分辨率 1→0.75→1.5，Sonnet/Tempera 512×1137→461×1024→922×2048（原有二次幂纹理档对齐），Hanabi/Lumiere 824×1830→618×1373→1236×2745，Diorama 824×1830→618×1372→1236×2745。相同 canvas、绘制计数增加、零页面异常。
- Sonnet/Hanabi/Lumiere/Diorama 上下文 AA 切换核实。Tempera 使用 Pixi backbuffer，context AA 固定关闭，由离屏 MSAA 处理，不能用 context 标记误判其开关。
- 上述证据证明画质调节、暂停重绘与资源策略接线，不是 Android 真机性能前后对比。真机、音频延迟仍待测。

阶段提交：d991faf（固定基线及锁元数据）；6ebc47d（旧回归用例对齐）；1c8fd21（画质系统）；81be27ef（雾笺）。

## 阶段二：雾笺

- 从固定 Android 449 的 `src/components/visualizer/nebbia/` 按文件移植完整雨夜街景、水族箱、雨窗/凝露/雪窗、逐笔手写、擦除、哈气、水滴/雨痕及全部参数。注册、类型、持久化、预览草稿、设置语义、中文/英文、外观导入导出已接线。
- 保留共享歌词 MotionValue；音频频段使用听屿现有 0–255 数据，新增真实起音检测驱动车身、水母、水草及气泡。暂停、seek、无真实频谱时重置；没有引入网络 AI API，也没有声称移植了桌面人声/鼓点分离模型。
- `createNebbiaRuntime.ts` 复用帧通道和主舞台可见性，隐藏停止，恢复补绘；排版按约 6ms 切片并取消旧歌曲任务，几何和书写顺序有等价测试。shader 预热按需、可取消，30 秒可见活动超时转当前歌词和重试。
- WebGL2 不可用/上下文丢失时显示当前歌词与重试按钮。1.5.17 的背屏兼容方案曾在 `ObsBrowserSourceApp.tsx` 局部使用 Sonnet；1.5.18 移除此替换，恢复实际雾笺并叠加安全歌词，保留主屏选择和独立背屏设置。
- AnimCJK 固定 commit、下载 SHA256、4,485,083 字节笔顺资源及完整授权由 Vite 插件生成；正式构建缺资源或许可会失败。raindrop-fx 的 MIT 授权同时随产物打包。1.5.17 的 APK 内资源已逐项核验，1.5.18 交付时再次检查。
- 排查并修复了上游 `NebbiaGl.destroy` 在 shader 尚未编译完时调用 `loseContext` 的同步阻塞：立即停止显示及监听，非阻塞轮询完成后回收上下文，等待有 30 秒上限。Windows Chrome CPU profile 原最长任务 2359ms（destroy 自耗时约2301ms），修复后冷启 profile 最长165ms，不再有该阻塞；六组合复测仍有最高235ms任务，不能声称全程无卡顿。缓存扩展查询的单独尝试未解决（2434ms），最终采用延后释放。
- 六组合浏览器复测：412×915、DPR2，画布824×1830，全部 `glError=0`；暂停600ms绘制0次、隐藏600ms绘制0次、恢复继续绘制；暂停改0.75画质变618×1373。浅色横屏、5次切歌、context丢失后重载、卸载画布0个均通过，无pageerror。数据包含2200ms观察窗口的 `readyWithinMs` 不能作首帧时延。
- 类型/主题检查通过；相关单测28/28（含注册表外观往返、旧配置迁移、真实频段起音、异步排版等价、未完成shader延后释放）。新增释放测试首次因Node环境没有window失败，补测试环境后通过；未改产品迁就断言。
- 测试服务热更新会导致测试脚本导入第二份store；最终重启服务并断言实际画布scene/glass再测，避免把未切换误报通过。
- 上述均为Windows Chrome开发台架；未测Android设备帧率/GPU显存、真实冷启动和后台音频时延。

## 阶段三：町景

- 从固定 Android 449 的 `src/components/visualizer/machi/` 按文件移植便利店、加油站、城寨酒吧三场景，以及 LED/招牌歌词、自动时间与天气、每场景镜头、运镜、景深/移轴、辉光、雨雪雾、湿地倒影和完整设置。新增 `lucidePath2d.ts`；未引入 Electron 或 Node 运行时模块。
- 保留异步分段构建、着色器并行预编与超时、场景黑场切换、HDR 后处理合并、四分之一 Bloom、静态阴影、湿路面倒影、快速回退 MSAA/超采样。Android 全屏纹理 DPR 上限 1.5；共享画质只乘一次。町景不参加阶段一的第二套自动降采样，由自己的帧间隔策略负责；暂停、预览、热身、后台不采样，连续两次慢窗口才降一档，只降不升。
- 接入现有帧通道、主舞台 activity 与 IntersectionObserver；暂停和隐藏时实测绘制为 0。上下文丢失、初始化或换场景异常显示当前歌词与重新加载按钮，不白屏。卸载后画布为 0。1.5.17 的背屏局部退回 Sonnet；1.5.18 保留实际 3D 场景，将背屏招牌的动态歌词改由安全文字层显示，主屏招牌歌词及主屏设置保持原有行为。
- 设置沿用 StagePanelControls / SettingsRow 语义控件；场景、时间、天气、镜头、运镜、光圈、景深、移轴、对焦、预设、分辨率、锯齿、阴影、倒影、辉光、自动画质全部持久化，接入预览草稿、外观导入导出、中英文案。分辨率与 AA 与阶段一共享同一份覆盖。
- 智能动感使用现有 0–255 音频频段和共享歌词时间生成低频起音与宽带起音，驱动霓虹、涟漪、大屏呼吸；没有冒充桌面 stem 分离，也不新增外部 AI。保留可选固定模拟节拍，二者互斥。
- 相关单测 14/14、Android 页面归属 18/18 通过。Windows Chrome 412×915、DPR2 三场景首帧等待 4073/2673/2710ms，画布 824×1830，`glError=0`，无 pageerror；截图人工核对。暂停/隐藏 600ms 绘制 0，恢复继续；浅色横屏、连续切歌、上下文重试、卸载画布 0 通过。首帧含固定观察与预热，不是 Android 首帧。
- 三场景冷启仍有 73–242ms 长任务；未宣称 Android 全程流畅。未在真机测帧率、显存、锁屏/后台和音频延迟。命令面板 UI 17/17 通过；旧桌面 bravais 墙与 Netease 桌面首页截图不适用于移动资料库结构，列为不适用。
- 阶段提交：83aa3088（町景）；4693656e（空白清理）。

## 正式安装包

以下记录为 1.5.17 首次 P0 交付；1.5.18 修复及正式包核验单独列在下一节。

- 版本 1.5.17，versionCode 232。正式 Web 构建、Capacitor 资源同步与签名 release 构建成功。
- 安装包 56,935,522 字节，SHA-256 `d959217068ecf87b16880f29bb4503f95acb831c1bb3d2ae53e05e183e317746`。2032 个前端文件逐个与 dist 哈希一致。
- 构建标识仅以应用源码判断未提交改动，避免 Capacitor 同步的生成资产把正式包误标为 dirty；正式包 Build ID 为 `1.5.17@a9dcbf03`。
- APK 内包含 4,485,083 字节笔顺资源、AnimCJK 三份授权、raindrop-fx 授权和町景运行时代码；包名、版本、非调试标记和签名均已核验。
- 发布环境首次使用 Java 17，Capacitor 8 要求 Java 21，Gradle 编译失败；改用隔离的 Temurin 21 后构建成功，未修改项目源码来绕过。
- 无连接 Android 真机，安装、冷启动、触摸交互、锁屏/后台、背屏/LSP/Shizuku、GPU 帧率及音频切歌延迟仍未实测。

## 1.5.18：新舞台设置与背屏修复

修复基线：`b3728c52be592aab9aaeb7894cd0322c97cd55fa`（1.5.17 / 232）；修复提交：`3995166a`。版本提升为 1.5.18 / 233，仅修改 Android 包与锁文件版本，没有覆盖上游源码、重建播放器或导航。

| 问题与原因 | 修改文件与处理 |
| --- | --- |
| 雾笺/町景参数按钮挤成文字，组标题贴边 | `StagePanelControls.tsx`、`VisPlaygroundSettingsPanel.tsx`：补全 Compose 布局语义，按钮最小高度 44dp、内边距、圆角、选中底色、居中与换行间距；标题进入卡片内边距。继续由原生绘制控件 |
| 背屏选择新舞台却应用为另一个 | `ObsBrowserSourceApp.tsx`、`VisPlayground.tsx`：移除对 Sonnet 的显式替换，使用已注册的实际 Nebbia/Machi；仅 GPU 失败时进入可重试文字兼容态 |
| 背屏编辑无法保存雾笺/町景参数 | `rearStageEditorProps.ts`、`VisPlayground.tsx`：补齐独立背屏 tuning、默认值、草稿、setter/reset；不调用主屏设置写入方法 |
| 预览比例和字体不匹配 | `SettingsLayoutPreview.kt`、`settingsLayout.ts`、`rearControl.css`、`VisPlayground.tsx`：原生与实际画布使用 976:596 背屏比例，预览渲染实际模式；字号、字重拖动实时进入预览 |
| 摄像头校准在内层 iframe 丢失，显式 0 被当作缺省 | `rearLyricsFrameUrl.ts`、`RearLyricsViewport.tsx`、`visualizerSurface.ts`：只传递验证后的物理宽度/安全左界及原生准备参数，保留显式零，丢弃无关查询参数 |
| 主歌词、翻译/罗马音与 TTML 和声跨进摄像头区域 | `rearCameraSafeArea.ts`、`RearFittedContent.tsx`、`RearCurrentLyrics.tsx`、`VisualizerSubtitleOverlay.tsx`、`VisualizerHarmonyOverlay.tsx`：文字单独在右侧阅读区换行与等比适配，字幕占底部 32%，有和声时保留顶部 24%；背景画布仍铺满屏幕 |
| 原笔迹旋转/形变越界，长句缩小后不易读 | `nebbiaLayout.ts`、`nebbiaScene.ts`、`nebbiaRearLayout.ts`、`createNebbiaRuntime.ts`、`VisualizerNebbia.tsx`：按实际笔迹边界与笔宽适配阅读区，取消旧排版任务；保留玻璃、原笔迹、水滴、街景和水族箱，再叠加可读的逐字安全歌词 |
| 町景招牌歌词受固定场景投影影响，无法避让镜头 | `machi/VisualizerMachi.tsx`、`StageCompatibilityFallback.tsx`：背屏继续实际 3D、天气、镜头与光效，招牌展示场景静态文字；当前歌词由安全层使用同一共享 MotionValue 时钟逐字高亮。失败说明与重试也适配安全区 |

### 检查结果与依据

- 全量前端单元测试：799 文件通过、1 文件跳过；7579 项通过、2 项原有跳过。后续文字排版收尾由定向测试与实际渲染测试覆盖。
- 相关定向单测：4 文件、21 项通过，覆盖参数独立保存/重置、校准参数验证及零值、字幕/和声区域、不同尺寸和字号的实际笔迹边界。
- 最终类型与主题检查通过；Android Kotlin 编译及原生单测 1311 项通过、0 失败、0 跳过。编辑期间原生检查允许暂未同步的 Web 资产，正式包必须重新构建并同步后再签名。
- 浏览器相关用例共 20 项通过（分别运行）：新舞台编辑器 2 项、实际舞台安全渲染 5 项、已有背屏启动/外观/双字幕 13 项。覆盖深浅色、DPR 1/3、347×212 背屏画布、字体倍率 1→3、字重 500→900、长中英文句、字幕与和声、共享时钟 seek、独立配置及预览语义比例。
- 两种实际画布均保持全屏 347×212；所有文字容器和其实际内容边界在摄像头右侧阅读矩形内。最终截图已人工核对完整场景和可读主句/字幕/和声，无 pageerror 或 ResizeObserver 循环警告。另用真实 NebbiaMask 绘制观测确认 seek 后仍绘制 7 个汉字、超过 20 段原笔迹，并单独截图查看玻璃书写。
- 过程中曾遇到测试脚本期望字数 8 而实际句子只有 7 字，修正断言后通过；预览语义初始化前点击造成测试竞态，等待控件可用后通过。记录这些用例问题，不把它们计为已交付产品回归。
- `git diff --check` 通过，已有 `@note` 注释未改动。测试日志与截图保存在工程外 `hze/outputs/rear-stage-repair/` 及 `native-audio-fix/tingyu-1.5.18-*.log`。

### 限制与暂缓

- 以上为 Windows Chromium 开发台架与 Android 构建检查，没有连接 Android 真机。真实小米背屏摄像头边缘、LSP/Shizuku、安装覆盖、冷启动、触摸、锁屏/后台恢复、GPU 帧率、显存及音频切歌延迟尚待安装后复测。
- 摄像头位置优先使用物理校准参数，缺省按 976 宽度下 277 的遮挡边界避让；具体设备边界需以真机为准。新舞台完整渲染增加背屏 GPU 成本，未声称其帧率或功耗提升。
- 本次测量用于确认布局、实际场景保留及共享时钟接线，不能作为 Android 性能前后对比；音频切换时延没有用 UI 测试数据替代。
- P1 自由三行组合、歌词匹配差异、QQ 新能力、队列缺陷审计补全及触屏速记簿仍暂缓，不冒充已完成。

### 1.5.18 正式包核验

- 版本准备提交：`6b76a6e0a134c459beb10610bd2385c5fa7289ef`。正式包构建标识 `1.5.18@6b76a6e0`，无 dirty 标记；最终源码归档在此提交后只补录本文档，发布脚本核实两者没有代码差异。
- 使用 Temurin 21 执行 `npm run build:android:release`：主题校验、正式 Vite 构建、必需资源验证、Capacitor 同步、反馈层验证、Gradle release 编译与签名全部成功。原生构建 254 项任务，56 项执行、198 项无需重复；最终构建未使用陈旧 Web 资产绕过选项。
- APK：`Tingyu-1.5.18-release.apk`，56,943,028 字节；SHA-256：`f3d6c85c18a1775f00c97a864a59f9e899c64eba7884e8f3e82e1fbbcb1b905e`。
- 2034 个 dist 文件逐个与 APK 内 `assets/public/` 文件 SHA-256 一致，未发现多余旧资产；实际新舞台、安全歌词与背屏预览代码均进入安装包。
- APK 内 4,485,083 字节 AnimCJK 笔顺、三份 AnimCJK 授权及 raindrop-fx 授权再次核验通过；圆角开屏矢量、系统开屏图绑定也再次核验。
- 包名 `io.github.huleixin.tingyu`、versionName 1.5.18、versionCode 233、非调试包、原生页面与 Media3 开关、DEX Build ID 均已核验。正式签名证书 SHA-256：`a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d`，与此前正式包一致。
- 交付附件包含 APK、提交源码 ZIP、本文档、verification.json、SHA256 清单和两种背屏预览截图。发布脚本逐项核验 GitHub 返回的附件长度与 SHA-256，全部通过后才公开 Release，并核验发布标签指向源码归档提交。
- GitHub 交付位置：[v1.5.18](https://github.com/huleixin/folia-rear-lyrics/releases/tag/v1.5.18)；工作分支 `feat/folia-449-selective-port`。源码 ZIP 包含修复报告和保留的项目许可证；不包含签名密钥、账号或测试日志。
- 未进行真机安装验证，实际背屏避让和新舞台功耗仍有上节列出的设备验证限制。

## 1.5.19：背屏原生笔迹、3D招牌与排版深度优化

修复基线：26d7f24fb4422a4000d65ee8cf2a10f574a74bb7（1.5.18 / 233）；构建源码提交：86aab5c09cc0815d2b79d2642b3dac349e890eb3。版本提升为 1.5.19 / 234。

针对 1.5.18 中在背屏覆盖普通主歌词大字、未充分利用摄像头右侧可用空间以及长词笔划可读性等反馈，进行深度重构：

| 问题与反馈 | 修改文件与处理 |
| --- | --- |
| 背屏展示效果与主屏实际效果差距大（普通大字覆盖层） | VisualizerNebbia.tsx、VisualizerMachi.tsx：彻底移除普通的 RearCurrentLyrics 主歌词遮挡层，全面恢复雾笺原生的玻璃笔迹手写与町景原生的 3D 招牌歌词。普通大字仅在 GPU 极端崩溃时作安全降级兜底 |
| 雾笺背屏可用空间局限、排版拘束 | 
ebbiaLayout.ts、
ebbiaRearLayout.ts：扩大背屏排版高度至 0.80H，最小字号放宽至 0.09H，保留全部 9 种原生构图与微小扰动，使手写笔迹充分利用摄像头右侧全部安全区域 |
| 动态和声/翻译遮挡排版区域 | RearStageReadingArea.tsx、VisualizerRenderer.tsx、VisualizerSubtitleOverlay.tsx、VisualizerHarmonyOverlay.tsx：引入动态阅读安全区。仅在实际存在辅助字幕或和声时保留对应间距；无辅助字幕时原生舞台占满摄像头右侧完整净空 |
| 町景 3D 招牌歌词进入摄像头盲区 | earFraming.ts、camera.ts、lyricScreen.ts、createMachiRuntime.ts：遍历标记主招牌文字 Mesh，在保持场景 3D 透视和运镜的前提下，利用正交投影平移与缩放算法，将招牌文字精确约束在右侧阅读安全区内 |
| 密集长歌词与快歌字迹书写进度不同步 | 
ebbiaScene.ts、
ebbiaInk.ts：改进字迹书写调度算法，高密笔画字根据歌词唱完时刻自适应加速，防止笔划截断，同时保证片尾曲名歌手自然舒展 |
| 背屏高 DPI 下玻璃字迹边缘模糊与小字粘连 | 
ebbiaMaskGl.ts、
ebbiaGl.ts、
ebbiaInk.ts：遮罩 R8 纹理分辨率提升为自适应屏幕 DPR（最高 2.0），着色器支持像素级抗锯齿，小字笔划下限调整为 0.75，笔划清晰分明 |
| 极长英文单词导致排版极度缩小 | 
ebbiaBlocks.ts、
ebbiaLayout.ts：增加背屏长词安全折行，避免长单词将整句汉字字号同比例压缩至不可读 |
| 舞台设置项组件挤压、文本溢出边缘 | StagePanelControls.tsx：完善 Compose 原生内边距与换行间距，规范按钮最小触控尺寸与标题布局 |

### 检查结果与依据

- 类型检查与主题生成：
pm run typecheck 全面通过。
- 单元测试：町景 3D 安全避让测试 3/3 通过，雾笺书写时序与笔迹布局测试 10/10 通过。
- 浏览器端组件与渲染测试：新舞台编辑器测试 2/2 通过；背屏安全渲染用例 8/8 通过（覆盖 DPR 1/3、高密度长词、三种町景场景与雾笺全景安全区）。
- 原生检查：Android Kotlin 编译与 1311 项单元测试全部通过。

### 1.5.19 正式包核验与归档证据

- 版本准备提交：86aab5c09cc0815d2b79d2642b3dac349e890eb3。正式包构建标识 1.5.19@86aab5c0，无 dirty 标记。
- 使用 Temurin 21 执行正式 release 编译、资产比对与 apksigner 签名核验全部成功。
- APK 文件：Tingyu-1.5.19-release.apk，56,947,235 字节；SHA-256：dd6e11840f6c66c89cb18cf2bf967c67ed9c87b331791de918252177f9a242e3。
- 包内 2033 个前端静态资源逐个与 dist 哈希严格匹配。
- 签名证书指纹核验通过：36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d。
