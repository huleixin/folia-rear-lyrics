# 听屿 Android 1.2.8：背屏歌词布局修正

本轮根据用户提供的九宫格、气泡歌词、竖排歌词及花火背屏截图修正布局；保留各样式与逐字时间轴。没有新增歌词样式或重构播放器。

## 根因与改动

- 背景由 RearLyricsSurface 在完整背屏上绘制；歌词容器单独使用右侧阅读区。旧代码混用了整屏、阅读区和 renderer 最小尺寸。
- 统一右侧阅读区与主歌词/字幕区域，摄像头侧和屏幕边缘留出余量。底部触控区按现有控件尺寸预留；控件显隐不触发歌词跳位。
- Canvas 的 bitmap、CSS 与本地布局使用一致尺寸，不再负向移出容器再重复平移；普通 Canvas 与 Pixi 使用同一局部坐标原则。
- 商籁/凝彩/绘光/花火只在背屏取消 320×240 的最小画布下限，场景构造和 renderer resize 同时修改，正面原下限保留。
- 花火移除重复右移与多余阅读区 mask；背屏不再在右侧重画不透明夜空底板，保留用户选择的整屏背景及烟花、文字、拼贴、镜头动画。没有引入新的 GPU 滤镜或音频分析。
- classic / cadenza：按真实阅读区和字体度量换行、限制字形运动幅度。云阶：移除背屏的大屏最小列高，按列内容调整字号与间距；保留分栏及逐字动画。
- 气泡：背屏优先显示当前消息，移除至少两条消息、桌面顶部/底部留白及放大系数造成的溢出；头像和气泡风格保留。
- 环形：同步调整字形测量/显示字号和环半径；云阶与环形从第一帧就读取背屏尺寸。
- 莫奈：背屏隐藏海报头部、专辑肖像与描述装饰，把空间交给歌词轨道；前屏海报不变。
- 静态：背屏聚焦当前句及其翻译，前屏仍保留前后句。钟摆等读取真实局部宽高；3D 样式通过共享宿主获取新的真实宽高。
- 翻译/罗马音/下一句使用独立字幕带，按全部文本一起测量字号，提升主题内的字幕对比度；和声使用紧凑顶部区域。
- 字体测量仅在文本、字体、尺寸改变时执行，缓存最多 64 项；字号适配最多 6 次二分测量，没有新增逐帧 React 更新、轮询或持续尺寸测量。

## 各样式覆盖

| 样式 ID | 本轮处理 |
|---|---|
| sonnet / tempera / lumiere | 取消背屏画布最小尺寸，统一构建与 resize；共享字幕和阅读区 |
| hanabi | 局部画布、单一坐标原点、取消重复底板；小阅读区九种排法测试 |
| classic / cadenza | 实际字体测量及小屏换行；classic 字形偏移限制 |
| partita | 首帧尺寸、列高、字号、字距、逐字位移 |
| cappella | 当前气泡优先、真实宽高、移除桌面保留高度/双消息下限 |
| claddagh | 首帧尺寸、半径和字体度量保持一致 |
| monet | 背屏歌词轨道高度、隐藏头部和肖像，局部字体换算 |
| pendolo | 初始局部宽高及共享宿主 |
| tilt | 按主歌词带高度拟合，保留原字形动画 |
| diorama | 共享宿主真实宽高，3D 场景与摄像机核心未修改 |
| still | 背屏当前句优先与测量字号 |

## 保护范围

变化受 rear-lyrics-panel 标记限制；未修改正面舞台控件、推荐页/资料库/搜索/设置布局、Liquid Glass、音源接口、原生摄像头适配、锁屏恢复、同步时钟与逐字歌词数据。新 CSS 每条规则均以背屏标记限定。未改动 Android 原生代码、包名和签名。未修改任何已有 @note 注释。

## 验证及实际限制

- TypeScript 通过；正式 Web/Capacitor/Android 构建成功。
- 全面回归排除此前已记录的 library/layerBoundaries.test.ts：606 个文件通过、1 个文件跳过，6479 项通过、2 项跳过。该文件原有两条分层失败涉及未修改的页面，未放宽其断言。
- 最终专项：113 个文件通过、1252 项通过、1 项跳过，包含后补的双字幕用例。
- 34 项原生单测通过。原生代码未变。
- 几何验证覆盖 904×572、556×352 和 430/393/360 宽度对应的背屏比例；验证阅读区、字幕带与实际控件上边界互不相交。
- 花火实际 runtime 的 resize/draw 调度以假 GPU 验证局部尺寸、零重复偏移与底板关闭；九种文字排法覆盖 172×68、285×152、465×260 的文字区域。
- 字体测试运行真实 pretext 换行，但使用确定性的模拟字宽；这些是布局与逻辑测试，不是真机像素证明。
- adb devices 没有设备，本地没有可用 Android 模拟器；未获得修复后的真实背屏截图。没有声称所有样式的实际 GPU 动画、实际设备字体和视觉效果已经验收。安装后仍需逐个样式观察长句、旋转、进出场、切歌、暂停与控件显隐。
- 对超过背屏物理容量的极长双字幕，仍受最小字号及字幕带容量限制，需要真实歌词个案确认；没有改动歌词文本或时序来掩盖问题。

## 安装

版本 1.2.8 / versionCode 11，原包名 io.github.huleixin.tingyu、原签名保持不变。需要覆盖安装新版 APK，无需卸载或清除数据。

## 修改文件

- `package-lock.json`
- `package.json`
- `src/components/obs/ObsBrowserSourceApp.tsx`
- `src/components/visualizer/VisualizerHarmonyOverlay.tsx`
- `src/components/visualizer/VisualizerRenderer.tsx`
- `src/components/visualizer/VisualizerShell.tsx`
- `src/components/visualizer/VisualizerSubtitleOverlay.tsx`
- `src/components/visualizer/cadenza/cadenzaPreparedState.ts`
- `src/components/visualizer/cappella/CappellaMessageRow.tsx`
- `src/components/visualizer/cappella/VisualizerCappella.tsx`
- `src/components/visualizer/cappella/cappellaMessageLayout.ts`
- `src/components/visualizer/claddagh/CladdaghRingLine.tsx`
- `src/components/visualizer/claddagh/VisualizerCladdagh.tsx`
- `src/components/visualizer/classic/Visualizer.tsx`
- `src/components/visualizer/fume/useFumeCanvasStage.ts`
- `src/components/visualizer/hanabi/createHanabiPixiRuntime.ts`
- `src/components/visualizer/lumiere/createLumierePixiRuntime.ts`
- `src/components/visualizer/monet/MonetLyricsRail.tsx`
- `src/components/visualizer/monet/VisualizerMonet.tsx`
- `src/components/visualizer/monet/monetLyricsModel.ts`
- `src/components/visualizer/partita/PartitaChunk.tsx`
- `src/components/visualizer/partita/VisualizerPartita.tsx`
- `src/components/visualizer/pendolo/VisualizerPendolo.tsx`
- `src/components/visualizer/sonnet/createSonnetPixiRuntime.ts`
- `src/components/visualizer/sonnet/sonnetSceneBuilder.ts`
- `src/components/visualizer/still/VisualizerStill.tsx`
- `src/components/visualizer/tempera/createTemperaPixiRuntime.ts`
- `src/components/visualizer/tempera/temperaSceneBuilder.ts`
- `src/components/visualizer/tilt/VisualizerTilt.tsx`
- `src/components/visualizer/tilt/tiltReadingFit.ts`
- `src/utils/visualizerSurface.ts`
- `test/unit/visualizer/hanabi/hanabiText.test.ts`
- `test/unit/visualizer/visualizerSurface.test.ts`
- `src/components/visualizer/rearTextLayout.ts`
- `src/components/visualizer/rearVisualizerLayout.css`
- `test/unit/visualizer/rearTextLayout.test.ts`
- `test/unit/visualizer/hanabi/rearRuntime.test.ts`
