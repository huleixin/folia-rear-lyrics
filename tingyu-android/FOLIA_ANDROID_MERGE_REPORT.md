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

待各阶段检查通过后补录 SHA、实际修改清单、构建/同步/签名结果和 GitHub 安装包链接。当前尚未生成新 APK，P0/P1 未宣称完成。

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
- WebGL2 不可用/上下文丢失时显示当前歌词与重试按钮；背屏在 `ObsBrowserSourceApp.tsx` 局部使用 Sonnet，保留主屏所选雾笺及其设置。
- AnimCJK 固定 commit、下载 SHA256、4,485,083 字节笔顺资源及完整授权由 Vite 插件生成；正式构建缺资源或许可会失败。raindrop-fx 的 MIT 授权同时随产物打包。APK 内资源最终核验尚待发布阶段。
- 排查并修复了上游 `NebbiaGl.destroy` 在 shader 尚未编译完时调用 `loseContext` 的同步阻塞：立即停止显示及监听，非阻塞轮询完成后回收上下文，等待有 30 秒上限。Windows Chrome CPU profile 原最长任务 2359ms（destroy 自耗时约2301ms），修复后冷启 profile 最长165ms，不再有该阻塞；六组合复测仍有最高235ms任务，不能声称全程无卡顿。缓存扩展查询的单独尝试未解决（2434ms），最终采用延后释放。
- 六组合浏览器复测：412×915、DPR2，画布824×1830，全部 `glError=0`；暂停600ms绘制0次、隐藏600ms绘制0次、恢复继续绘制；暂停改0.75画质变618×1373。浅色横屏、5次切歌、context丢失后重载、卸载画布0个均通过，无pageerror。数据包含2200ms观察窗口的 `readyWithinMs` 不能作首帧时延。
- 类型/主题检查通过；相关单测28/28（含注册表外观往返、旧配置迁移、真实频段起音、异步排版等价、未完成shader延后释放）。新增释放测试首次因Node环境没有window失败，补测试环境后通过；未改产品迁就断言。
- 测试服务热更新会导致测试脚本导入第二份store；最终重启服务并断言实际画布scene/glass再测，避免把未切换误报通过。
- 上述均为Windows Chrome开发台架；未测Android设备帧率/GPU显存、真实冷启动和后台音频时延。

## 阶段三：町景

- 从固定 Android 449 的 `src/components/visualizer/machi/` 按文件移植便利店、加油站、城寨酒吧三场景，以及 LED/招牌歌词、自动时间与天气、每场景镜头、运镜、景深/移轴、辉光、雨雪雾、湿地倒影和完整设置。新增 `lucidePath2d.ts`；未引入 Electron 或 Node 运行时模块。
- 保留异步分段构建、着色器并行预编与超时、场景黑场切换、HDR 后处理合并、四分之一 Bloom、静态阴影、湿路面倒影、快速回退 MSAA/超采样。Android 全屏纹理 DPR 上限 1.5；共享画质只乘一次。町景不参加阶段一的第二套自动降采样，由自己的帧间隔策略负责；暂停、预览、热身、后台不采样，连续两次慢窗口才降一档，只降不升。
- 接入现有帧通道、主舞台 activity 与 IntersectionObserver；暂停和隐藏时实测绘制为 0。上下文丢失、初始化或换场景异常显示当前歌词与重新加载按钮，不白屏。卸载后画布为 0。背屏局部退回 Sonnet，主屏选择与设置不变。
- 设置沿用 StagePanelControls / SettingsRow 语义控件；场景、时间、天气、镜头、运镜、光圈、景深、移轴、对焦、预设、分辨率、锯齿、阴影、倒影、辉光、自动画质全部持久化，接入预览草稿、外观导入导出、中英文案。分辨率与 AA 与阶段一共享同一份覆盖。
- 智能动感使用现有 0–255 音频频段和共享歌词时间生成低频起音与宽带起音，驱动霓虹、涟漪、大屏呼吸；没有冒充桌面 stem 分离，也不新增外部 AI。保留可选固定模拟节拍，二者互斥。
- 相关单测 14/14、Android 页面归属 18/18 通过。Windows Chrome 412×915、DPR2 三场景首帧等待 4073/2673/2710ms，画布 824×1830，`glError=0`，无 pageerror；截图人工核对。暂停/隐藏 600ms 绘制 0，恢复继续；浅色横屏、连续切歌、上下文重试、卸载画布 0 通过。首帧含固定观察与预热，不是 Android 首帧。
- 三场景冷启仍有 73–242ms 长任务；未宣称 Android 全程流畅。未在真机测帧率、显存、锁屏/后台和音频延迟。命令面板 UI 17/17 通过；旧桌面 bravais 墙与 Netease 桌面首页截图不适用于移动资料库结构，列为不适用。
- 阶段提交：83aa3088（町景）；4693656e（空白清理）。

## 正式安装包

- 版本 1.5.17，versionCode 232。正式 Web 构建、Capacitor 资源同步与签名 release 构建成功。
- 安装包 56,935,525 字节，SHA-256 `29b565b419b2ae48018904ab3d1a676c1f4363a0238a108cc53e4574c220e541`。2032 个前端文件逐个与 dist 哈希一致。
- APK 内包含 4,485,083 字节笔顺资源、AnimCJK 三份授权、raindrop-fx 授权和町景运行时代码；包名、版本、非调试标记和签名均已核验。
- 发布环境首次使用 Java 17，Capacitor 8 要求 Java 21，Gradle 编译失败；改用隔离的 Temurin 21 后构建成功，未修改项目源码来绕过。
- 无连接 Android 真机，安装、冷启动、触摸交互、锁屏/后台、背屏/LSP/Shizuku、GPU 帧率及音频切歌延迟仍未实测。

