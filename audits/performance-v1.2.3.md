# 听屿 1.2.3：流畅度与后台功耗优化

本次通过代码追踪定位持续运算、后台轮询、不可见 DOM 更新及原生锁，减少不必要工作；没有改听屿现有 UI，也没有通过关闭背屏歌词或降低可见歌词功能来掩盖问题。

## 找到的问题与处理

1. **播放可视化桥在资料库和后台仍逐帧运行。** 即使正面歌词舞台已被资料库遮住，仍会读取频谱、计算多个频段能量并更新 MotionValue。增加 Android 可见性调度：正面歌词舞台保留原 RAF 动画；浏览资料库且背屏不需要音频响应时只每 250ms 读媒体时钟，不做 FFT；后台无背屏需求时每 1000ms 读取。进入舞台/恢复可见立即读取真实媒体时间，避免时钟被旧帧锁住。网页/桌面保持原 RAF 行为。
2. **背屏状态每 700ms 读取完整诊断。** 原 getRearLyricsStatus 还会查询权限、窗口、显示状态，并拼接诊断与锁屏日志。新增 getRearLyricsRuntimeState，只返回已启用/启动中/睡眠三个状态供循环使用；完整诊断仍可在原设置和排查入口获取。关闭背屏时每 2s 读轻量状态，不创建 100ms 发布定时器；启用后每 1s 读轻量状态，按需发布时钟。兼容旧宿主时才回退旧状态方法。
3. **背屏暂停时仍高频发相同快照。** 正在播放且背屏清醒时保留原 100ms 时钟/音频快照；暂停后对没有变化的状态仅每 5s 心跳。配置、播放状态变化及恢复前台会唤醒发布；真实媒体时钟、seek discontinuity、背屏同步器和逐字时间数据仍复用原实现。背屏正在播放时主屏后台仍有 100ms 音频采样，暂停/睡眠时减少工作。
4. **背屏进度控件已透明隐藏但还逐帧写 DOM。** 现在控制条隐藏后停止它自己的 RAF；触摸唤出时按真实时钟更新。歌词渲染、摄像头避让、布局和动画未改。
5. **播放服务对现代 Android 一直申请游戏用途低延迟 Wi-Fi 锁。** Android 官方说明该模式可能降低电池续航，而且仅在亮屏和应用前台时生效，不能作为熄屏播放保活。Android 10+ 不再申请该锁；旧系统只保留普通 Wi-Fi 锁。原 CPU 播放保活锁、前台服务、MediaSession 和暂停/销毁时释放锁的逻辑保持。参考：[Android WifiManager 官方文档](https://developer.android.com/reference/android/net/wifi/WifiManager#WIFI_MODE_FULL_LOW_LATENCY)。需要真机继续确认不同网络下的长时间播放。

这些是代码中确认存在的额外工作，不代表已证明它们是用户手机发热的唯一原因。

## 版本与后续升级

- 本版 **1.2.3 / versionCode 6**；Android 包名和原正式签名保持不变。
- package.json 的 version 同时供 Android versionName 和 Vite 的应用版本使用，androidVersionCode 供安装器使用；package-lock.json 同步。
- 删除“关于”中写死的 Tingyu 1.0.0，改用当前构建版本。
- 新增 `npm run release:bump`：每次发布递增 patch 和 Android code；minor/major 可显式选择。新增 `npm run release:android`，一次完成补丁版本递增与 Release 构建。
- **构建失败后重试用 `npm run build:android:release`**，避免同一发布重复递增。源代码随包提供此流程及测试。

## 验证

- TypeScript 检查通过；54 个前端测试文件、473 项测试通过；32 项 Android 原生单测通过；Release 构建、安装包签名和包名/版本校验通过。
- 新增实际 hook 测试验证资料库不做 FFT、时钟/歌词偏移仍更新、回舞台恢复采样、后台背屏播放保持 10Hz 采样、暂停停止高频音频工作。
- 调度器测试中，模拟 60 秒资料库使用有 241 次时钟读取（包含首次），FFT 0 次；后台无背屏时每秒一次。旧 Android 默认 30FPS 循环约为每分钟 1800 次调度。**这是受控模拟调用次数，不是设备 CPU 占比、滚动 FPS、温度或耗电百分比。**
- 测试覆盖背屏时钟和视口策略、睡眠恢复、启动、蓝牙媒体元数据发布、资料库/底栏、设置及存储契约。逐字渲染未修改，真机效果仍待验收。原 Liquid Glass 和主导航组件及样式未改，未重绘或替换它们。
- 哈希比较未发现本轮范围外的基线文件变化；原媒体缓存、用户偏好、歌单、收藏、音源和歌词算法未改。
- adb devices 无连接设备，SDK 无可用模拟器；无法提供真机温度、电量、掉帧实测或本轮真实渲染截图。没有绕过此前浏览器访问策略。

## 安装和待设备验收

必须安装本次 APK，才能启用原生轻量状态接口与 Wi-Fi 锁修正。原签名可覆盖安装，保留应用数据。
建议设备验收：资料库连续滚动、歌词舞台切换、前后台/熄屏长时间播放、背屏逐字同步与暂停恢复、Wi-Fi/移动网络播放和蓝牙车机曲目显示。若仍有发热，需结合设备系统跟踪/功耗数据继续定位，不能凭本次模拟测试断言已经完全消除发热。

## 修改文件

- `ANDROID_PORT.md`
- `android/app/build.gradle`
- `android/app/src/main/java/io/github/huleixin/tingyu/FoliaNativePlugin.java`
- `android/app/src/main/java/io/github/huleixin/tingyu/FoliaPlaybackService.java`
- `package-lock.json`
- `package.json`
- `src/components/modal/SettingsModal.tsx`
- `src/components/rear/RearLyricsPanel.tsx`
- `src/hooks/usePlaybackVisualizerBridge.ts`
- `src/hooks/useRearLyricsPublisher.ts`
- `src/stores/useRearRuntimeStore.ts`
- `src/utils/playbackWorkScheduler.ts`
- `test/unit/androidReleaseVersion.test.ts`
- `test/unit/hooks/mobilePlaybackWork.test.ts`
- `test/unit/hooks/rearPublisherPower.test.ts`
- `test/unit/utils/playbackWorkScheduler.test.ts`
- `dev/build/bumpAndroidVersion.mjs`

## 发布

源码分支 `tingyu/performance-v1.2.3`；标签 `tingyu-v1.2.3-performance`。附 APK、完整对应源码 ZIP、局部补丁、此报告、模拟工作量与范围校验、SHA256。
