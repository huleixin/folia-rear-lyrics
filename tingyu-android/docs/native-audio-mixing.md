# Android 原生混音与音效（1.5.1 验证版）

此前 1.5.0 的 `useNativeAudioDeck` 将 Automix、EQ、ReplayGain 列为兼容通道的强制条件。
只修正 WebView 双 Deck 的清理顺序无法满足“开启这些功能仍走原生”的要求。

## 当前执行路径

- `useNativeAudioDeck` 保持 Media3 所有权，下发 EQ、ReplayGain、混音开关和时长。
- `nativeAudioProcessing.ts` 复用现有 ReplayGain 计算器及过渡规划器，将歌曲身份、出入点、
  重叠时间和速度比放进已解析队列项。歌词、时长及设置更新会刷新参数，不重载同址音源。
- `NativeAudioDeck` 为每个 ExoPlayer 创建独立 PCM 处理器及频谱处理器。
- `NativeMixController` 提前创建第二个解码器并静音缓冲。只有其 READY 才交接当前轨；
  两轨的等功率包络由原生媒体位置驱动，JS 暂停运行时不影响已就绪的混音。
- 只有当前轨拥有焦点、耳机拔出处理、队列、歌词和睡眠定时输出端点。暂停、拖动、
  手动切歌、焦点丢失、睡眠截止和释放必须清理次轨。前端跟进原生换歌不得抹掉包络。
- `PcmEqualizerProcessor` 在解码 PCM 上执行十段 EQ、ReplayGain 和音效控制，
  需要处理时禁用硬件 offload。纯播放仍复用原来的输出策略。

## 能力边界

此版实现原生双轨重叠及现有规划器的时间/速度指令。原生包络统一使用等功率淡化；
Web Audio 专有的分频交接、回声抛掷、分离人声/伴奏的 performance 编排没有迁移。
规划器选择 beat-cut 时，原生使用平滑交叉淡化，不把其等待区间误当成淡化曲线。
没有分析资料时沿用五秒交叉淡化；原生后台解析补进的歌曲没有 JS 计划时也使用此默认值。
下一首未解析、解码不就绪、直播/时长未知、单曲循环、睡眠曲尾屏障等情况，不承诺重叠。
诊断记录必须保留实际原因，不能将这些情况统计成已成功混音。

原生空间效果使用延迟网络，不是浏览器卷积混响；原生效果与 Web Audio 效果不保证逐样本一致。
音源本身无法被原生解码或缓存桥失败时，保留原有的单曲兼容回退；开启 EQ/混音本身不再回退。

## 可核验的证据

- `NativeMixControllerTest`：原生控制器使用 Android 主 Looper、可控解码端口，检查双路同时运行、
  半程等功率、媒体时钟停滞、暂停/定时屏障、未就绪及队列替换。这是控制集成测试，不是真机听音。
- `PcmEqualizerProcessorTest`：直接处理 PCM，检查透明旁路、-6dB 增益、1kHz 频带增益和低通效果。
- `NativeMixPlanTest`：身份锚定、时间范围及包络功率。
- 前端用例验证开启混音/EQ/ReplayGain 时仍为 Media3，且不重复 prepare；旧的解码失败回退继续测试。
- 真机验收尚未完成：当前 ADB 没有设备，系统也没有安装模拟器镜像。编译、单测和包签名不能
  代替设备上双轨音频、锁屏焦点和通知栏/歌词同步验证。

## 诊断字段

`NativeAudioEngine.snapshot("diagnostics", false)` 增加 `mixState`、`mixReason`、`mixOverlap`、
`mixCompleted`、两轨播放标记/音量和 `nativeDsp`。日志增加 `native-mix-preload`、
`native-mix-start`、`native-mix-completed`。定位问题时同时核对构建标识及这些事实，
不要仅依据开关状态或成功构建断言过渡已经出声。
