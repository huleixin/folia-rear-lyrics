# 听屿 LSP 背屏与 LyricInfo

本版本提供两个独立通道。背屏继续由听屿的独立 Activity / WebView 绘制，LSP 系统桥仅协调启动、任务迁移、背屏唤醒及遮盖息屏；LyricInfo 使用原有播放服务的同一个 MediaSession 提供歌词，不需要开启主屏或背屏舞台。

## LSP 背屏

1. 安装听屿 APK。APK 同时包含传统 Xposed API 82 模块入口，普通模式不需要框架。
2. 在支持传统 Xposed API 的 LSPosed / Vector 管理器中启用「听屿」，作用域只选「系统框架 / Android」，然后重启。仅支持现代 API 的加载器无法加载此入口；框架本身也需要支持手机的 Android 版本。
3. 先关闭听屿背屏歌词，在设置中把「背屏控制模式」改为「LSP / LSPosed」，等待显示「系统桥已连接」，再启用背屏歌词。LSP 模式不要求启动 Shizuku。
4. 更新模块代码后需要再次重启系统。未连接时保留开关和诊断，不会偷偷改用 Shizuku。

当前系统桥仅接受 572×904 / 596×976（含横竖交换）的已知小米背屏。不会控制主屏电源，不修改系统锁屏状态、不解锁手机，不对所有应用开放显示权限。系统接口缺失或 ROM 拒绝时，该次操作失败并显示诊断；桥连接成功不等于背屏可见，仍需窗口实际绘制验证。

模块在系统框架的 `ActivityManagerService.systemReady` 完成后注册桥，使用 Android 框架已有的定向启动、任务管理、输入注入和单屏电源接口。没有猜测、硬编码未验证的小米私有类，也没有在 SystemUI 中运行歌词舞台。应用进程退出时尝试撤销本模块的背屏息屏覆盖。

这是一版待实机验证的系统桥：尚未在已启用框架的 HyperOS 4 / Android 17 手机上验证锁屏策略、启动和电源行为。不同 ROM 的私有背屏策略仍可能需要进一步适配。系统框架作用域属于高权限功能，不能用浏览器测试代替实机验证。

## LyricInfo / 灵动岛

听屿在 Android 上发布 `MediaMetadata["lyricInfo"]`，包含逐行 `lyric`、真实逐字时间存在时的 `rawLyric`、翻译 `translationLyric` 及歌曲身份信息。只在歌曲或歌词变化时写入；暂停、播放、进度和跳转沿用原来的 PlaybackState，不额外创建媒体会话或动画循环。

灵动岛显示需要系统或第三方模块消费该字段。可使用支持 LyricInfo 来源的显示模块，在其设置中选择 LyricInfo 并允许听屿。听屿不绑定模块包名，不安装模块，也不将“已发布”表述成“灵动岛已显示”。普通 Lyricon 来源和 LyricInfo 是两条不同通道。

对照验证的消费端源码：

- [HyperLyric 的 LyricInfoSource](https://github.com/limczhh/HyperLyric/blob/main/app/src/main/java/com/lidesheng/hyperlyric/root/source/LyricInfoSource.kt)
- [HyperLyric 的 LyricInfoParser](https://github.com/limczhh/HyperLyric/blob/main/app/src/main/java/com/lidesheng/hyperlyric/common/lyric/LyricInfoParser.kt)
- [Android 的显示电源接口](https://github.com/aosp-mirror/platform_frameworks_base/blob/android16-release/core/java/android/hardware/display/IDisplayManager.aidl)

## 实机检查

开启 LSP 后分别检查：解锁时启动、主屏锁定时启动、遮盖息屏与移开恢复、应用进程重启后重连、关闭背屏后正常系统电源策略、重启后恢复连接。灵动岛检查换歌、暂停/继续、拖动进度、无歌词歌曲、逐字及翻译；确认主屏和背屏舞台均关闭时依然有歌词。
