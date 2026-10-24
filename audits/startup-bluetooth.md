# 听屿：打开速度优化与蓝牙媒体信息修正

## 检查结论与修改

本轮检查的是代码与构建产物；没有连接用户手机/车机，所以不能断言现场只由某一个原因导致，也没有虚构冷启动或后台返回耗时。

打开速度与后台开销：

1. 原生启动屏 launchShowDuration 固定 900ms，改为 0；HTML 首帧遮罩仍由原有 React 挂载逻辑移除，不提前显示未完成页面。
2. 设置、歌词匹配、调试和内存窗口此前静态导入，未打开也进入启动模块依赖。改为局部 React.lazy/Suspense，不阻塞主界面。搜索首次打开才加载，之后保留挂载，让原有关闭清理、动画和状态逻辑继续运行；不改页面视觉。
3. Android 包此前沿用 PWA 应用预缓存策略，214 项约 14016.66 KiB 资源在 APK 内已有一份，更新后又被读取/复制进 Workbox。仅在 FOLIA_BUILD_TARGET=capacitor 构建中取消应用资源预缓存和导航回退缓存；保留本地 OPFS 封面 Service Worker。最终仍有图标和 manifest 两个小条目。网页构建沿用原缓存策略，Android 页面和脚本离线由 APK 本地资源提供。
4. 通知封面原先用无上限 ConcurrentHashMap 长期保存原尺寸 bitmap，有随切歌积累内存并增加后台回收风险的路径。改成按字节计量的 4MiB LRU；先读图片尺寸再降采样，最长边 512px，原始响应上限 8MiB。相同 URL 的并发请求去重，过期排队任务跳过，失败重试间隔 30 秒，服务销毁取消下载与缓存。
5. 原每秒媒体更新会重建前台通知、metadata 和封面流程。桥接改为 5 秒时钟校准；原生进度更新走独立轻路径。曲目、播放/暂停、时长等变化仍立即更新。Android PlaybackState 的时间戳负责连续进度；没有把歌词时钟降频。
6. 媒体事件监听注册不再挡住 native API 初始化；桥接回调丢失有 4 秒超时，后续状态可继续发布。

蓝牙信息发布：

1. 原 Web Media Session 在 setPositionState 不支持或抛异常时会整条跳过歌名/歌手，未知时长也会阻止发布。现在仍排除旧音源事件，但进度 API 失败或无限时长不再阻止元数据；有效时钟仍先发布。
2. 原生媒体会话补齐 MEDIA_ID、DISPLAY_TITLE/SUBTITLE、ALBUM_ARTIST、音乐流属性、会话返回入口，以及相互对应的当前曲目 QueueItem 与 activeQueueItemId。只暴露真实当前曲目，不虚构完整队列或曲目数量。歌曲、歌手、专辑、时长来自现有播放状态；播放器音频时长尚未到达时用歌曲本身的 durationMs。
3. 媒体更新不再等待通知权限对话框，后台也可以立即创建媒体会话。Android 的媒体会话通知具有通知权限豁免，见 [Android 通知权限说明](https://developer.android.com/develop/ui/views/notifications/notification-permission#exemptions)。权限声明保留，没有新增蓝牙扫描/连接权限。
4. 更新串行化、只保留最新待发送状态；成功后才确认去重，失败和丢失回调可重试。回到前台主动刷新一次，暂停状态失败也会在低频检查时重试。
5. 原生与 WebView 的信息通道都保留，未宣称彻底消除 WebView 隐式媒体会话。补齐两条发布链路，以避免系统选择任一来源时得到空信息。

API 依据：[Android MediaSession](https://developer.android.com/reference/android/media/session/MediaSession)、[AOSP Bluetooth MediaPlayerList](https://android.googlesource.com/platform/packages/modules/Bluetooth/+/619fafa41b7fe03ce7905422d966a59c68769f3d/android/app/src/com/android/bluetooth/audio_util/MediaPlayerList.java)。这些协议实现检查不等于具体车机兼容性实测。

## 可复核的构建指标

按 es-module-lexer 递归计算 bootstrap 入口及其静态 JS 依赖：

- 修改前 5,752,800 字节。
- 修改后 4,860,951 字节。
- 减少 15.5%（未压缩 JS 字节）。

这不是启动时间百分比，也不包含运行时加载的全部动态模块。对应文件清单见 critical-before.json / critical-after.json，汇总见 performance.json。没有真机 CPU/内存峰值、启动秒数或帧率的前后实测值。

## 测试与构建

- 9 个前端单元测试文件、52 项测试通过，覆盖未打开编辑器不初始化、首次打开搜索与关闭生命周期、真实媒体字段与时长、去重、失败重试、丢失回调恢复、连续切歌旧状态被替换、WebView 进度 API 缺失/异常、设置与播放页自动隐藏等既有回归。
- Android Release 单元测试 32 项通过，包含新增通知封面缩放测试及原有背屏 viewport/policy/恢复相关测试。
- TypeScript 检查、Web 生产构建、Capacitor 同步与 assembleRelease 通过。
- APK 使用原包名 io.github.huleixin.tingyu、1.2.2 / code5 和原签名；覆盖安装即可，无需清空数据。
- ADB 当前无设备，SDK 没有可用模拟器。未进行真机/车机蓝牙、系统媒体会话 dumpsys、实际冷/热启动、断网封面加载、背屏逐字高亮或全部 UI 的硬件验收；没有新截图。

## 保护范围与修改文件

推荐、资料库、搜索内容、设置内容、Liquid Glass、主导航、歌词舞台与背屏渲染/避让/同步算法、音源接口、用户数据未改。入口文件 App.tsx 保持原字节。原生媒体服务的播放状态变化仍调用原背屏协调器；仅跳过相同状态的重复进度处理。

- `src/services/nativePlaybackBridge.ts`
- `src/utils/mediaSessionSync.ts`
- `src/components/app/dialogs/AppDialogs.tsx`
- `src/components/app/overlays/AppOverlays.tsx`
- `test/unit/services/nativePlaybackBridge.test.ts`
- `test/unit/utils/mediaSessionSync.test.ts`
- `android/app/src/main/java/io/github/huleixin/tingyu/FoliaNativePlugin.java`
- `android/app/src/main/java/io/github/huleixin/tingyu/FoliaPlaybackService.java`
- `capacitor.config.json`
- `vite.config.ts`
- `test/unit/hooks/startupDialogLoading.test.ts`
- `test/unit/services/nativePlaybackPublishing.test.ts`
- `android/app/src/main/java/io/github/huleixin/tingyu/PlaybackArtworkSizing.java`
- `android/app/src/test/java/io/github/huleixin/tingyu/PlaybackArtworkSizingTest.java`

- `android/app/src/main/assets/capacitor.config.json`（同步自动生成的原生配置，与 root capacitor.config.json 保持一致。）

## 交付

源码分支 tingyu/startup-bluetooth；main 下载说明分支不变。最终校验 Release 标签 tingyu-v1.2.2-startup-bluetooth-r2。Release 附 APK、完整对应源码 ZIP、局部补丁、本报告、构建指标与 SHA256 校验和。请安装 Tingyu-Android-v1.2.2-startup-bluetooth.apk，才能使用新原生媒体服务和启动配置。
