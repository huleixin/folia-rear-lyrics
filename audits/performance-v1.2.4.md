# 听屿 1.2.4：界面动画与图形限帧分离、背屏共享取数

本轮按确认的两项方向实施，不重新设计 UI，不改歌词解析、逐字时间戳、镜头避让或播放核心。

## 界面动画与重型绘制分开

此前 Android 的可视化限帧器会替换全局 requestAnimationFrame，让依赖该入口的界面动效也受到限帧设置影响。现在 Android 保留系统原始 RAF，按钮、切页、底栏过渡及 Framer Motion 的 UI 帧循环不被可视化限帧器接管。

重型绘制接到独立 visualizerFrameChannel：继续复用原共享队列和 30/60/90/120/不限制的配置，不另存一套用户偏好；切换帧率不丢失队列中的工作，取消绘制仍可释放原生 RAF。

Android 构建中的 visualizerFrameScopePlugin 只改写可视化器内部的全局 RAF 调用以及 Paper ShaderMount、Pixi Ticker、R3F 绘制循环。Framer Motion、Liquid Glass、资料库和其他 UI 模块不在转换范围内。该转换使用 Vite 的 AST 解析及构建期 MagicString 源码映射，不修改 node_modules 或渲染器算法源码；MagicString 已在现有锁文件中，本次将其声明为直接开发依赖，运行时不引入此工具。依赖升级导致任一图形驱动没有匹配时，正式构建会失败，避免悄悄恢复重型绘制无限帧。

正式构建检查记录了 **17 个模块**（14 个可视化器模块及 3 类图形驱动），详见 graphics-frame-scope.json。后台播放时钟仍沿用 1.2.3 的可见性策略；可见绘制和音频分析使用图形队列，普通 UI 使用系统队列。

背屏使用独立的普通 WebView，没有主窗口的 Capacitor 标记，因此现在在背屏入口显式初始化图形队列。未保存过帧率设置时使用 30FPS，已经保存的选择继续优先。不修改播放速度或歌词时间数据。网页/桌面主入口保留此前的限帧行为，Android 构建才启用图形模块转换。

## 背屏只读一份原生状态

此前背景层和 iframe 歌词层各自每 100ms 读取 /__folia_rear/state，最多合计约 20 次/秒，并分别进行 JSON 解析。现在只有背景层读取原生状态，再把同一份原始配置、时钟、音频快照通过同源消息分发给指定歌词 iframe；歌词层不再自行请求该状态端点。

- 两层继续各用原有时钟同步器，保留媒体时间、seek discontinuity、逐字同步和误差修正逻辑，不用降低原有播放同步频率来减少请求。
- 父层缓存最近完整配置与快照；歌词层重载可重新订阅，父层自身重建也会通知子层恢复订阅。
- 消息同时验证 origin、来源窗口和订阅 session；过期子层的退订不会移除新子层的订阅。
- 配置和字体仍在歌词文档内正确应用；字体异步加载期间合并后续时钟包，保留新配置，避免新配置被纯时钟包覆盖。
- 睡眠暂停原生轮询和子层订阅，唤醒重新订阅并恢复；卸载清理计时器、监听器和字体资源。
- 单独打开歌词文档仍可用原有取数方式；正常背屏嵌套路径只运行一组取数循环。

摄像头避让的 viewport 布局、背屏右侧视觉重心、歌词渲染/解析、播放控制和锁屏原生实现未改。

## 版本、验证和限制

本版为 **1.2.4 / versionCode 7**，通过已有 release:bump 流程递增。包名 io.github.huleixin.tingyu、正式签名均保持不变。

- TypeScript 类型检查通过。
- 149 个前端测试文件：**1543 项通过，1 项按原条件跳过**。跳过项是 Lumiere 可选测量报告（没有启用 REPORT 环境变量），不是功能失败。
- 回归包含 96 个可视化器测试文件，以及设置、命令、资料库/底栏、前后台时钟、背屏睡眠/时钟、蓝牙媒体信息发布和版本流程。
- 新测试验证：图形限帧时原生 UI 队列不变；帧率切换/取消；真实安装版本的 Paper/Pixi/R3F 驱动转换；两层共享取数、时间一致、iframe/父层重建、来源验证、睡眠恢复、自定义字体异步加载和清理。
- 受控模拟中，两层运行 500ms 总共只有 6 次状态请求（含首次），两层收到相同的 6 次时钟；并非每层各 6 次。此结果不代表耗电量降低 50%。
- 原生单测任务 32 项通过，Android Release 构建成功；APK 签名、版本和包名校验通过。
- 原版迷你播放器、导航、图标、CSS 与界面布局未改。没有清空用户设置、收藏、歌单或音源数据。
- 当前没有连接真机，SDK 也没有可用模拟器；没有温度、电量、真实帧率或掉帧对比数据，没有本轮真机截图。真实设备上的动画平滑度、背屏高亮及节电效果仍须设备验收。

安装本次 APK 才能使用新打包的绘制调度和背屏数据通道。使用原签名覆盖安装可保留数据。建议设备验收：连续切页、资料库滚动、歌词舞台、背屏逐字高亮/暂停/切歌、关闭再开启背屏、锁屏与唤醒，以及不同帧率设置。

## 修改文件

- `package-lock.json`
- `package.json`
- `src/components/rear/RearLyricsPanel.tsx`
- `src/components/rear/RearLyricsSurface.tsx`
- `src/rearLyrics.tsx`
- `src/services/rearLyricsTransport.ts`
- `src/utils/frameRateLimiter.ts`
- `src/utils/playbackWorkScheduler.ts`
- `test/unit/utils/frameRateLimiter.test.ts`
- `vite.config.ts`
- `src/services/rearStateRelay.ts`
- `src/utils/visualizerFrameChannel.ts`
- `test/unit/visualizerFrameScopePlugin.test.ts`
- `test/unit/services/rearStateRelay.test.ts`
- `test/unit/utils/visualizerFrameChannel.test.ts`
- `dev/build/visualizerFrameScopePlugin.mjs`

源码分支 `tingyu/performance-v1.2.4`；Release 标签 `tingyu-v1.2.4-performance`。附完整对应源码、APK、补丁、此报告、绘制模块范围和 SHA256 校验和。
