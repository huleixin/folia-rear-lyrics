<!-- docs/STAGE-DISPLAY-1.5.28.md -->
# 听屿 1.5.28 / 243：歌词舞台显示范围修复

2026-11-13。

## 行为与代码

- useAndroidMobilePlayerStage.ts、useAppOverlaysModel.ts：按实际舞台、设置与面板状态启停已有沉浸计时器；极简封面和极简歌词页保持系统栏显示。
- nativeShellRouting.ts、nativeChrome.ts：独立传递 stageDisplayActive，保留 stageVisible 原有转场与设置交接含义。
- MobileStageChrome.tsx：打开其他页面时关闭舞台方向会话。
- ComposeChromeHost.kt、MainActivity.java：原生宿主按页面、生命周期、窗口焦点和弹层裁决舞台窗口策略；设置交接等待期间立即释放。
- StageOrientation.java：舞台隐藏后恢复传感器竖屏，取消旋转超时并推进版本，忽略延迟横屏命令；其他页面方向适配也不能重新带回横屏。
- MainSystemBars.java：非舞台拒绝隐藏系统栏，离开立即恢复。
- NativeKeepScreenOn.kt：原屏幕常亮设置只在舞台显示时申请；极简歌词页保持独立申请，复用原窗口标志。
- zh-CN.ts、en.ts：改名“歌词舞台自动隐藏”“歌词舞台屏幕常亮”，保留“极简歌词页常亮”，说明适用范围。保留原偏好键与开关值。

## 已执行验证

- TypeScript 与主题检查通过。
- 7 个定向 Vitest 文件，28 项通过：shell 舞台/极简/设置/返回转场，方向会话竞态，系统栏与常亮桥接。
- Android 页面归属检查 18 项通过。
- Android JVM 方向测试 11 项、Robolectric 常亮窗口测试 1 项通过。覆盖离页竖屏、旧旋转命令失效、再次进入可旋转、两路常亮独立释放及复位。
- Web 资源已重新构建并同步；Release 构建与签名验证结果见本版本 GitHub 预发布说明。

## 待真机验收

当前 adb 没有连接设备。尚未在真机验证厂商旋转策略、系统栏手势、横屏舞台打开设置/歌单/极简页后的实际显示，以及后台恢复。未宣称这些实机项目已通过。

安装后建议：开启舞台自动隐藏，在极简歌词页停留超过 3 秒确认状态栏仍显示；进入舞台确认自动隐藏；舞台横屏打开设置、队列、歌曲页面确认恢复竖屏；分别开启两路常亮并切页确认范围。
