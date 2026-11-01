# 听屿 1.3.72 原生睡眠定时

基线 3ca5ec5 / tingyu-layout-1.3.71。开发前 git ls-remote 核对 main 无更新。分支 feat/native-sleep-timer。未找到《音乐源码.zip》，没有声称读取或移植其内容。版本 1.3.72 / code 95。

## 审计及复用

旧 useSleepTimer.ts 使用 JS setInterval 和 Date.now，effect 每次按当前时刻重算 deadline；状态不持久，Activity/WebView 重建会丢失任务。旧 store 持久化 hours/minutes 偏好，命令面板/命令共享该 store。sleepTimerExpiry 对 Electron 调 quitApp、Web 使用暂停回退。

本轮保留 Web/Electron 旧执行方式，Android hook 只订阅原生状态。原 store 的启停操作在 Android 委派同一 TingyuPlayback 插件任务。偏好时长继续原 localStorage，Bottom Sheet 不因打开而调用 start。没有第二个播放器或第二个 MediaSession，也没有修改歌词缓存/队列恢复。

## 三种模式

- deadline（A）：1 分钟至 24 小时的单调真实时间计时，到期直接沿现有 transport pause，不清队列/不归零。不附加渐弱，避免与已有音量链冲突。
- track（B）：立即启用 Media3 setPauseAtEndOfMediaItems。当前媒体项首次自然完成即停，单曲循环也在首次结束停；手动切歌后等新当前曲结束，seek 到结尾按媒体项完成处理。
- deadline_track（C）：截止前不拦截曲尾；到期若 playWhenReady=false 直接完成，播放意图仍有效则启用曲尾屏障，等当时当前项结束。缓冲但有播放意图时也等待该项结束。切歌不重置截止时间，等待阶段手动切歌后等新当前曲。

## 执行与恢复

SleepTimerState 是纯单调时钟策略；SleepTimerController 为进程单例，只在主线程访问，附着现有 ExoPlayer。Android elapsedRealtime 为运行截止权威，系统墙钟修改不改变运行中的剩余时间。一次有效任务，每次 start/cancel/完成递增 generation；进入 C 等待阶段也递增，避免旧快照覆盖。

Handler 一次性截止回调，现有引擎 emit 点附带轻量 check；无新增每秒原生轮询。非精确 AlarmManager ELAPSED_REALTIME_WAKEUP + setAndAllowWhileIdle 作为休眠兜底，无精确闹钟权限；厂商/Doze 可能延迟，不能据此宣称毫秒级锁屏截止。没有新增常驻服务、WakeLock 或每秒写盘。

SharedPreferences 保存 active/mode/elapsed 截止/参考墙钟截止/duration/generation/waiting，仅任务变更时写入。Activity 重建复用单例任务和当前 Media3。整个进程死亡代表旧会话已结束，新进程把持久 active 标为 interrupted-process 并废弃，不续上一个完整时长、不自动播、不拉起前台服务；若旧非精确提醒启动 receiver，也仅废弃旧任务，不启动音频。

显式 Stop、引擎释放/脱离、用户队列从非空变为空会取消任务；普通暂停不取消、计时继续。取消后 handler 和 alarm 撤销，迟到 alarm 按 generation 拒绝。清队列沿现有前端 store 订阅，不修改播放队列恢复文件。

## 曲尾控制点

使用 Media3 内置 setPauseAtEndOfMediaItems，在渲染器交接下一项前结束输出，而非下一首已开始再 pause。监听 PLAY_WHEN_READY_CHANGE_REASON_END_OF_MEDIA_ITEM 将 timer 完成并调用已有 transport pause；末曲 STATE_ENDED 分支也在 QueueSupervision 前判断屏障。定时未启用时屏障关闭，原队列推进不变。

引擎添加 endedBySleep 只读状态，NativeAudioElement 对定时 EOF 不再发普通 ended，避免 WebView 恢复后 JS 当正常结束再切下一首。继续 Play/新 prepare 清除标记。暂停使用原 emit、FoliaPlaybackService 和背屏时钟发布链，不更改协议或歌词视觉。首次开启等待屏障时 Media3 可能需刷新已预读的 renderer，这个机制由 Media3 自己处理，真机音频听感仍待验证。

## UI 与状态

播放页更多菜单增加小型“定时关闭”，全局 dialog host 延迟加载 Bottom Sheet。预设15/30/45/60/90、自定义小时分钟、三行为、剩余时间/等待曲尾/进度/取消及明确重新开始。打开只读取当前状态，不重启；模式 B 隐藏时长。UI 用 performance 单调插值每秒显示，后台停止展示 interval，Android 到期只由原生执行。命令面板启停同一任务；命令面板沿原输入范围，但原生执行范围 1分钟–24小时，超限原生拒绝并提示。

事件 sleepTimerStateChanged 和 getState 响应包含 generation/sample，拒绝旧代次与旧同代次采样。原生写者只保留当前插件观察者；Activity 销毁只解除监听，不取消任务。

背景滚动锁、Escape/原生返回转 Escape、焦点循环、44px以上触控区域；配色使用既有变量和绿色默认。常规 Playwright（本会话无 Browser plugin）320/393/588px、根字体24px、模式B隐藏时长、自定义和无横向溢出：3项通过；截图为 test-results/sleep-timer-320.png。未运行完整原生手机页面视觉测试。

## 测试及风险

- TypeScript noEmit通过。
- 前端10文件75测试通过：原Web/Electron expiry/store/query、Android无JS到期执行、状态代次、串行操作、睡眠EOF不发ended、1.3.70恢复和原生队列回归。
- Android Release JVM 全套821测试零失败，新增7个策略测试：15分钟、边界、取消/重设、B/C差异、暂停到时、禁用无影响、输入范围。
- Android仪器用例 SleepTimerDeviceTest：真实ExoPlayer短静音双曲，普通及repeat-one首曲结束应仍停首项且保留两项队列。仅编译，未执行；不能把该断言称为真机通过。
- Release构建与lintVital、原签名校验见交付记录。
- 未连接设备：锁屏/系统省电、后台Activity销毁、长时真实15分钟、真实网络/本地歌曲、随机/列表循环、seek曲尾、暂停后三端歌词、原生线程繁忙时截止延迟，仍需手机验证。并未测量耗电，未宣称功耗收益。
- 渐弱可选项未实现，本包使用直接暂停。Android兼容Web音频通道没有原生ExoPlayer时会拒绝开始，不伪称能在冻结WebView时控制兼容解码。

## 回滚与文件

独立提交可revert；基线tag tingyu-layout-1.3.71。覆盖安装回退需提升versionCode后构建，避免卸载用户数据。新增sleep-timer偏好文件是独立任务状态，旧版忽略；回滚前建议取消定时，避免旧提醒组件残留。

## 最终构建

APK 39,097,495字节；SHA256 E58D2C8412A5BA25B305E10FBDD100F6C875FD8353D9963084D4E0D817DC2974。原证书 SHA256 a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d。versionName 1.3.72 / versionCode 95。

## 修改文件清单

- android/app/src/main/AndroidManifest.xml
- android/app/src/main/java/io/github/huleixin/tingyu/playback/NativeAudioEngine.java
- android/app/src/main/java/io/github/huleixin/tingyu/playback/TingyuPlaybackPlugin.java
- package-lock.json
- package.json
- src/components/app/dialogs/AppDialogs.tsx
- src/components/app/overlays/mobile-stage/MobileStageMenu.tsx
- src/components/command-palette/SleepTimerControl.tsx
- src/hooks/useSleepTimer.ts
- src/services/nativeAudioElement.ts
- src/stores/useSleepTimerStore.ts
- src/types/nativeAudio.ts
- test/unit/services/nativeAudioElement.test.ts
- android/app/src/androidTest/java/io/github/huleixin/tingyu/playback/SleepTimerDeviceTest.java
- android/app/src/main/java/io/github/huleixin/tingyu/playback/SleepTimerController.java
- android/app/src/main/java/io/github/huleixin/tingyu/playback/SleepTimerReceiver.java
- android/app/src/main/java/io/github/huleixin/tingyu/playback/SleepTimerState.java
- android/app/src/test/java/io/github/huleixin/tingyu/playback/SleepTimerStateTest.java
- dev/probes/sleepTimer.probe.tsx
- docs/android-1.3.72-sleep-timer.md
- src/components/modal/SleepTimerSheet.tsx
- src/components/modal/sleepTimerSheet.css
- src/services/nativeSleepTimer.ts
- test/component/sleepTimer.spec.ts
- test/unit/hooks/nativeSleepHook.test.ts
- test/unit/services/nativeSleepTimer.test.ts
