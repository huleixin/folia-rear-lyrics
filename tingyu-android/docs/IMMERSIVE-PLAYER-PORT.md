# 听屿沉浸极简：移植与交付记录

记录日期：2026-11-16。Android 1.5.55 / versionCode 270。本文区分源码实现、自动化验证和设备验收；编译通过不代表动画与性能已完成真机验收。

## 1. 源码版本与复用范围

- 听屿基线：1.5.54，98afbd9c4af18dbafc90e5406f204a89151b39a9，分支 feat/tablet-adaptive。
- MeloX Android：0.7.3 / code28，commit c04f36b9af540806b3bb185b347572e9ca12d87d，来源 https://github.com/lladlam/MeloX-Android 。
- 实际活动入口：MeloXApp → MeloXIOSNowPlayingSharedHost → MeloXIOSNowPlayingScene；没有采用未激活 V2。
- 复用活动 Scene、歌词、封面、流光背景、传输控件和手势源码后适配听屿。全部移植文件均有修改，没有字节完全一致的直接复制文件。28 个 port 文件逐项映射见 [来源清单](../third_party/melox/PROVENANCE.md)。
- 未迁移 MeloX 播放服务、音源、账户、数据库或网络。未升级 Kotlin、Compose、AGP、Media3、Backdrop 和 Haze。包名和签名保持不变。

## 2. 视觉、渲染效果对照

| 模块 | 实际接入 | 验证与限制 |
| --- | --- | --- |
| 封面模式 | 活动 Scene/SharedArtwork 大封面、圆角阴影、播放1/暂停0.74缩放、歌曲信息和控制区 | 编译通过；不是经典三卡封面；设备逐帧对比待做 |
| 歌词模式 | IOSLyricsPanel 逐字渐变、高亮、辉光、位移、模糊淡化、错峰/弹簧滚动、点击定位、手动浏览/恢复及间奏 | 真实逐字/逐行/静态数据单测通过；效果逐项设备对比待做 |
| 动态背景 | FlowingLightBackdrop/Gpu/VisualStore、ArtworkDynamicPalette；同宿主保留背景与相位 | 无第二音频分析器，使用上游无分析数据的流动分支；驱动失败降 CPU |
| 队列 | 上游布局、渐隐、当前曲头部、模式区；听屿 UID/版本及动作 | 删除、拖排、移至下一首/末尾、定位和四态模式已接入；真实手势待验证 |
| 玻璃/资源 | 现有 Backdrop 1.0.6、Haze、系统字体及通用矢量/几何路径 | 不包含 SF Pro、SF Symbols 字形和 Apple Logo；与上游 Backdrop 2.x 不保证像素一致 |
| 品牌 | 普通页面使用听屿/沉浸极简和原官方 Slogan | 外部名称仅用于源码标识、来源和许可证 |

## 3. 动画完整性覆盖矩阵

“接入”表示代码已有实际状态触发，不代表设备验收通过。

| 动画 | 进入/触发 | 退出/反向 | 取消、打断及快速操作 | 证据/待验证 |
| --- | --- | --- | --- | --- |
| 迷你条↔全屏 | 独立 bounds 时钟，上游约460ms曲线，面板重测量、共享封面 | NativeStageExit 保留场景至完成；封面在 shell 裁剪外；尾段22dp正弦下沉，面板/封面/迷你条同钟 | 入退场屏蔽操作，协程随状态取消 | 几何端点/单峰/独立时钟/经典退场单测通过；真机连续操作待测 |
| 封面↔歌词 | Scene 共享布局，封面位置/尺寸与歌词 reveal 连续变化 | 同一场景反向状态 | 保留 transition；统一运行状态 | 源码接入，真机逐帧对比待做 |
| 队列↔来源页 | 记录来源页、展开/淡入和控制区过渡 | 返回原歌词/封面 | 数据租约关闭；版本拒绝旧操作 | 相关回归通过；快速进出与拖排待设备测 |
| 播放/暂停/前后切歌 | TransportMotion、封面缩放弹性、箭头传送 | 暂停缩小/播放恢复 | 状态驱动、取消过期任务 | 源码接入；真实播放链、触觉待验证 |
| 封面滑动 | 原横向拖动、阈值及 spring；调用听屿前后切歌 | 未达阈值回弹 | 不替换经典封面逻辑 | 源码接入；快速手势待设备测 |
| 歌词 | 上游渐变、辉光、羽化、位移、错峰滚动 | 暂停/恢复、seek 统一时间轴 | songKey+epoch 拒绝旧歌词 | 数据边界单测通过；完整视觉待对比 |
| 背景 | 单宿主保持相位/调色板 | 退出/后台停止无效运行 | GPU失败持久化CPU分支 | 耗电、内存及掉帧待测 |
| 菜单/风格/咖啡页 | 原生面板与内部页面动画 | 外部、返回、下滑与显式关闭 | 单一控制器、保留退场内容 | 控制器及咖啡页实际点击通过 |
| 风格切换 | 短时离场位图与240ms衔接，目标风格单一持续渲染 | 后续切换复用同路径 | 取消捕获并释放位图，减弱动态时直接切换 | 不发音频命令；连续切换/内存待真机测 |
| 横竖屏 | 上游双栏/中心变化，布局稳定后过渡 | 对称状态转换 | 收起时避免方向抢占 | 旋转、折叠屏待测 |

外层没有完整移植 VectorizedRect 的中途速度延续、设备真实系统角半径的 Lamé 曲线、迷你条歌名及播放按钮各自的共享元素轨迹。因此外层转场不能标记为与 MeloX 完全一致，也不以静态相似替代验收。

## 4. 手势、交互清单

| 入口 | 实际行为 | 状态 |
| --- | --- | --- |
| 下拉 | 0.86屏高范围、42%或1200px/s收起阈值、取消回弹 | 已接入；设备验证待做 |
| 歌词/队列滚动 | 仅未消费的向下移动交给外壳；横屏限定抓手 | 已接入；取消和冲突待设备测 |
| 封面水平滑动 | 独立切歌手势与听屿命令 | 已接入 |
| 歌词浏览/点击/长按 | 上游恢复跟随、seek、选择/分享代码 | 已接入；完整分享链待设备测 |
| 进度拖动 | 上游相对滑块手势，seek 到听屿时钟 | 已接入 |
| 队列排序/删除 | UID+version 防错行，转发现有 store | 已接入；真实手势待测 |
| 返回 | 内部模式先返回，再收起；面板走统一控制器 | 已接入；未宣称手势进度级预测返回动画完成 |
| 触觉 | 上游 Haptics 并遵从系统设置 | 实际触觉待验证 |

## 5. 两套风格功能入口对照

| 业务 | 经典极简 | 沉浸极简 |
| --- | --- | --- |
| 播放器风格 | 原更多菜单第一项 | 歌名右侧更多第一项 |
| 收起/收藏/歌手 | 原入口不变 | 左上收起/右上收藏/歌手点击 |
| 上一/暂停/下一/seek | 原控制区 | 上游控制区、同一业务命令及锚点 |
| 音质与音频信息 | 原工具 | 控制区下居中标签和更多，保留原业务 |
| 歌词 | 原分页 | 底部左侧 |
| 歌词舞台 | 原独立入口 | 底部中间独立入口，openStage |
| 队列及模式/排序/删除 | 原工具和业务 | 底部右侧及沉浸队列，复用原队列核心 |
| 定时/音效/歌词工具/播放设置 | 原工具 | 更多菜单及原生工具页 |
| 系统音量 | 原能力 | 真实系统音量，不可用/固定音量时隐藏 |
| Vulkan/AOD/本地音乐/音源 | 原有业务 | 不复制或替换核心，沿用现有业务 |

经典仅增加更多首项并适配索引，不增加常驻按钮。两套风格共享一份 MinimalPlayerRuntime、播放时钟和已解码封面。切风格不创建播放器、不重载歌曲、不改队列/进度。双通道真实音频连续性待设备回归。

## 6. 三入口、首次体验及持久化

- 经典更多、沉浸更多、现有极简显示设置，共用 PlayerStyleController 与原生面板。
- SharedPreferences player_style 独立保存 playerStyle 和 playerStyleIntroAcknowledged；默认 classic；未知值回 classic；老用户不自动切换。
- 首次打开风格体系才介绍，选择沉浸时不单独索取捐赠。外部关闭/下滑/返回不确认、不切风格。
- 直接体验：确认→选择，不自动切换。咖啡：复用 SupportSheets；普通返回→介绍；返回并体验→确认后选择。
- 两按钮清晰可见，所有风格免费；无订单、支付验证、通知读取、付款/解锁状态。
- 外观导出/导入/差异、命令面板及 en/zh-CN/in 设置文案已接入；导入风格不导入首次确认。沉浸页沿用现有中文，不声称完成全部上游语言移植。
- 预览顺序调用当前歌曲的真实经典/沉浸渲染器，分别生成封面/歌词位图后释放；不使用外部截图或伪造歌曲。捕获期存在短暂额外渲染负担，成本待设备测量。

## 7. 已有捐赠页面及二维码

复用 SupportSheets、support_wechat_qr.png（1979×1433）和 support_alipay_qr.jpg（1820×1170）；未重建捐赠页或增加/替换二维码。点击放大、长按和按钮通过 MediaStore 保存，无全盘存储权限。风格来源增加“金额随心，每一份喜欢都值得感谢。”及自愿/免费说明，不把返回解释为付款成功。

离线解码能确认微信/支付宝载荷，但无固定金额字段不等于自由金额已验证，也不能证明归属。自由金额、实际收款及发行渠道/支付平台二维码展示规则尚未在支付端及渠道核实。

## 8. 第三方授权、资源与排除项

| 来源 | 处理 |
| --- | --- |
| MeloX Android / MeloX / BetterLyrics | GPL-3.0 正文、来源、修改说明随源码/APK，原注释保留 |
| 听屿/Folia | AGPL-3.0保留；组合按GPL/AGPL第13条及各自源码提供义务处理 |
| Folia README非商业声明 | 原样保留；不把组合条款解释为额外商业授权。其非商业表述与无额外限制表述需权利人进一步澄清；未宣称取得商业授权 |
| Backdrop/Haze/Compose等 | 既有依赖和声明保留，不新增外部原生渲染库 |
| TextPV/PVTool | 独立非商业组件排除 |
| YTRear | 未确认授权，排除 |
| SF Pro/SF Symbols/MiSans | 不引入相应字体、专有字形或下载资源 |
| 歌曲/歌词/封面 | 用户播放内容不属于代码许可；不打包新增商业音乐素材 |

设置→关于听屿→第三方开源许可证：原生离线全文，含三个GPL文本、听屿/Folia AGPL、NOTICE及源码来源。仓库 THIRD-PARTY-NOTICES 同步声明。逐文件出处见来源清单。

## 9. 测试记录

Windows短路径副本，JDK21、Gradle8.14.3、AGP8.13、Kotlin2.3.10、Compose1.10.3、Material3 1.4、SDK36.1。

| 检查 | 结果 |
| --- | --- |
| npm run typecheck | 通过 |
| Web：风格store、外观往返/校验/差异、导入计划、命令根/注册快照、页面归属 | 6文件104项通过 |
| Native：*Minimal* / *Player* / *Stage* / *Support* / *Immersive* / *Motion* | 53类223项通过；0失败/错误/跳过 |
| 包含经典布局/主题、歌词全屏、咖啡、时钟、队列、舞台、风格控制器 | 自动化通过，不等于真机综合回归 |
| 收起几何/独立时钟/单峰下沉和退场定向回归 | 广泛回归后追加运行通过 |
| 真实Compose页面冒烟 | 横竖屏2项通过：封面→歌词→队列、歌词舞台命令、不额外发播放/跳转/下一首命令 |
| 顶部操作栏与封面几何 | 统一44dp高度，横屏预留操作栏；两方向三页面无重叠断言和渲染截图已检查 |
| 三入口统一状态 | 代码路径同一控制器；三入口设备点击待验收 |
| 首次关闭、直接体验、咖啡返回及返回并体验 | 控制器通过；咖啡按钮实际Compose点击通过 |
| 风格冷恢复/未知值、外观导入不确认、过期快照/监听重试 | Native/TS单测通过 |

本地证据：C:/tb/immersive-types.log、immersive-web-tests.log、immersive-native-wide.log、immersive-motion-final.log、immersive-surface-final.log、immersive-sync1555.log。页面截图使用明确的测试夹具，不用于产品风格预览或冒充实际歌曲。正式构建的签名、摘要和提交核验在发布页记录，不提前宣称成功。不上传用户日志或凭据。

## 10. 性能、保护及未完成事项

GPU异常持久化CPU回退；低内存Balanced/15fps背景，其余24fps背景（不是界面帧率）。生命周期/可见性停止后台无效渲染。API30+仅当退出原因明确为原生崩溃且匹配沉浸可见租约时，冷启动回经典；普通杀进程不触发。诊断记录风格、渲染分支及异常类型，无支付、账户、音源凭据。

当前无已连接Android设备，以下均未完成设备验收，不能宣称完整复刻、稳定60/120FPS或最终验收通过：

1. 同设备、同数据逐动画对比；进入/退出/取消/打断/快速操作、系统栏和所有主题组合。
2. 外层完整VectorizedRect速度延续、系统角半径、迷你条文字/播放按钮独立共享轨迹。
3. MinimalLyrics未提供角色、注音、伴唱字段；渲染器有相关代码，但对唱/ruby/backing尚未端到端接入，不伪造数据。
4. 不同音源、本地歌词、倍速、偏移、快切及原生/兼容通道的真实播放回归。
5. 经典极简、歌词舞台、Vulkan、AOD、底栏、前后台和长时间播放的实际设备验证。
6. 平均/P95/P99帧耗时、掉帧率、内存、首次进入、耗电、预览成本及连续切换内存采样；未实现根据实测卡顿阈值自动回退。
7. 横竖屏/折叠屏、低档与驱动故障、预测性返回进度动画和完整分享链。
8. 支付端自由金额、渠道二维码展示规则及上游非商业表述的进一步澄清。

本版本交付源码接入和原签名APK，上述缺口不标记为已完成。

## 11. 本次新增与修改文件清单

下列路径相对于 tingyu-android/。port 中28个适配文件的上游映射、原始版权与修改说明见来源清单；没有字节完全一致的文件。此清单不含既有反馈后台的未提交修改。

### 新增文件

- `android/app/src/main/assets/licenses/BetterLyrics-GPL-3.0.txt`
- `android/app/src/main/assets/licenses/MeloX-Android-GPL-3.0.txt`
- `android/app/src/main/assets/licenses/MeloX-GPL-3.0.txt`
- `android/app/src/main/assets/licenses/NOTICE.txt`
- `android/app/src/main/assets/licenses/Tingyu-Folia-AGPL-3.0.txt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/ThirdPartyLicensesPage.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/ImmersiveActionsSheet.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/ImmersivePlayerHost.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/ImmersivePlayerMotion.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/ImmersiveRenderSafety.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/ImmersiveStateAdapter.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/ImmersiveSystemVolume.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/port/ArtworkDynamicPalette.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/port/ImmersiveRenderRuntime.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/port/ImmersiveRenderingDefaults.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/port/ImmersiveSceneAdapters.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/port/ImmersiveTransportSpec.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/port/ImmersiveTransportVectors.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/port/JapaneseRubyAlignment.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/port/LyricModels.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/port/LyricRomanizationAligner.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/port/LyricTimelineProcessor.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/port/MeloXAdaptiveLayout.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/port/MeloXArtworkGesture.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/port/MeloXFlowingLightBackdrop.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/port/MeloXFlowingLightGpu.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/port/MeloXFlowingLightVisualStore.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/port/MeloXHaptics.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/port/MeloXIOSLyricsPanel.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/port/MeloXIOSNowPlayingScene.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/port/MeloXLyricShareDialog.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/port/MeloXLyricShareImage.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/port/MeloXNowPlayingCoreControls.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/port/MeloXQueuePanel.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/port/MeloXRelativeSliderGesture.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/port/MeloXSharedArtwork.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/port/MeloXTransportMotion.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/port/MeloXUnsynchronizedLyrics.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/port/MeloXVolumeKeyBridge.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/immersive/port/QqBracketBacking.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/style/PlayerStyleController.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/style/PlayerStyleLayer.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/style/PlayerStylePreviews.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/style/PlayerStyleSheet.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/style/PlayerStyleTransition.kt`
- `android/app/src/test/java/io/github/huleixin/tingyu/minimal/immersive/ImmersiveMotionTest.kt`
- `android/app/src/test/java/io/github/huleixin/tingyu/minimal/immersive/ImmersivePlayerSurfaceTest.kt`
- `android/app/src/test/java/io/github/huleixin/tingyu/minimal/immersive/ImmersiveStateAdapterTest.kt`
- `android/app/src/test/java/io/github/huleixin/tingyu/minimal/style/PlayerStyleControllerTest.kt`
- `docs/IMMERSIVE-PLAYER-PORT.md`
- `docs/RELEASE-1.5.55.md`
- `src/stores/usePlayerStyleStore.ts`
- `test/unit/stores/playerStyle.test.ts`
- `test/unit/utils/playerStyleAppearance.test.ts`
- `third_party/melox/LICENSE`
- `third_party/melox/PROVENANCE.md`

### 修改文件

- `THIRD-PARTY-NOTICES.md`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/ComposeChromeHost.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/LiquidMotion.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/MinimalCoverOverlay.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/MinimalPlayerPage.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePageIcon.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeSettingsDestination.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeStageExit.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/SupportSheets.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/chrome/TingyuChromePlugin.java`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/MinimalQueue.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/MinimalPlayerScreen.kt`
- `android/app/src/test/java/io/github/huleixin/tingyu/chrome/LyricsFullScreenSettingsTest.kt`
- `android/app/src/test/java/io/github/huleixin/tingyu/chrome/MinimalParityTest.kt`
- `android/app/src/test/java/io/github/huleixin/tingyu/chrome/PlayerOverlayThemeTest.kt`
- `android/app/src/test/java/io/github/huleixin/tingyu/chrome/SupportSheetLayerTest.kt`
- `docs/ANDROID-PAGE-OWNERSHIP.md`
- `package-lock.json`
- `package.json`
- `src/components/command-palette/commands/settingsCommands.ts`
- `src/components/modal/SettingsModal.tsx`
- `src/components/modal/settings/AppearanceSettingsSubview.tsx`
- `src/components/modal/settings/ImportConfirmDialog.tsx`
- `src/components/modal/settings/MobilePlayerDisplaySetting.tsx`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/in.ts`
- `src/i18n/locales/zh-CN.ts`
- `src/services/nativeChrome.ts`
- `src/services/nativeMinimalQueue.ts`
- `src/utils/appearanceCodec.ts`
- `src/utils/appearanceImportPlan.ts`
- `test/unit/command-palette/__snapshots__/commandRegistryContract.test.ts.snap`
