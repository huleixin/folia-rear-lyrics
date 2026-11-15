# MeloX Android 移植来源与变更

实际采用 0.7.3，commit c04f36b9af540806b3bb185b347572e9ca12d87d。
源仓库：https://github.com/lladlam/MeloX-Android 。版权归原贡献者；GPL-3.0，完整正文见 LICENSE。
所有移植文件均有修改，不是未经修改的直接复制。
仅使用活动的 IOSNowPlayingSharedHost / IOSNowPlayingScene 路径，不使用未激活 V2。
删除原播放服务、网络和不适用资源，增加听屿业务投影。
保留上游注释；其中设备实测描述不代表听屿测试结果。

| 听屿文件 | 原始来源 / 改动 |
| --- | --- |
| minimal/immersive/port/ArtworkDynamicPalette.kt | com/lladlam/melox/ui/player/ArtworkDynamicPalette.kt；包名、依赖和状态适配 |
| minimal/immersive/port/ImmersiveRenderingDefaults.kt | 摘取/适配 IOSNowPlayingScene、SharedHost 及依赖；见文件头；包名、依赖和状态适配 |
| minimal/immersive/port/ImmersiveRenderRuntime.kt | 摘取/适配 IOSNowPlayingScene、SharedHost 及依赖；见文件头；包名、依赖和状态适配 |
| minimal/immersive/port/ImmersiveSceneAdapters.kt | 摘取/适配 IOSNowPlayingScene、SharedHost 及依赖；见文件头；包名、依赖和状态适配 |
| minimal/immersive/port/ImmersiveTransportSpec.kt | 摘取/适配 IOSNowPlayingScene、SharedHost 及依赖；见文件头；包名、依赖和状态适配 |
| minimal/immersive/port/ImmersiveTransportVectors.kt | 摘取/适配 IOSNowPlayingScene、SharedHost 及依赖；见文件头；包名、依赖和状态适配 |
| minimal/immersive/port/JapaneseRubyAlignment.kt | com/lladlam/melox/core/lyrics/JapaneseRubyAlignment.kt；包名、依赖和状态适配 |
| minimal/immersive/port/LyricModels.kt | com/lladlam/melox/core/lyrics/LyricModels.kt；包名、依赖和状态适配 |
| minimal/immersive/port/LyricRomanizationAligner.kt | com/lladlam/melox/core/lyrics/LyricRomanizationAligner.kt；包名、依赖和状态适配 |
| minimal/immersive/port/LyricTimelineProcessor.kt | com/lladlam/melox/core/lyrics/LyricTimelineProcessor.kt；包名、依赖和状态适配 |
| minimal/immersive/port/MeloXAdaptiveLayout.kt | com/lladlam/melox/ui/layout/MeloXAdaptiveLayout.kt；包名、依赖和状态适配 |
| minimal/immersive/port/MeloXArtworkGesture.kt | 摘取/适配 IOSNowPlayingScene、SharedHost 及依赖；见文件头；包名、依赖和状态适配 |
| minimal/immersive/port/MeloXFlowingLightBackdrop.kt | com/lladlam/melox/ui/player/MeloXFlowingLightBackdrop.kt；包名、依赖和状态适配 |
| minimal/immersive/port/MeloXFlowingLightGpu.kt | com/lladlam/melox/ui/player/MeloXFlowingLightGpu.kt；包名、依赖和状态适配 |
| minimal/immersive/port/MeloXFlowingLightVisualStore.kt | com/lladlam/melox/ui/player/MeloXFlowingLightVisualStore.kt；包名、依赖和状态适配 |
| minimal/immersive/port/MeloXHaptics.kt | com/lladlam/melox/ui/MeloXHaptics.kt；包名、依赖和状态适配 |
| minimal/immersive/port/MeloXIOSLyricsPanel.kt | com/lladlam/melox/ui/player/MeloXIOSLyricsPanel.kt；包名、依赖和状态适配 |
| minimal/immersive/port/MeloXIOSNowPlayingScene.kt | com/lladlam/melox/ui/player/MeloXIOSNowPlayingScene.kt；包名、依赖和状态适配 |
| minimal/immersive/port/MeloXLyricShareDialog.kt | com/lladlam/melox/ui/player/MeloXLyricShareDialog.kt；包名、依赖和状态适配 |
| minimal/immersive/port/MeloXLyricShareImage.kt | com/lladlam/melox/ui/player/MeloXLyricShareImage.kt；包名、依赖和状态适配 |
| minimal/immersive/port/MeloXNowPlayingCoreControls.kt | com/lladlam/melox/ui/player/MeloXNowPlayingCoreControls.kt；包名、依赖和状态适配 |
| minimal/immersive/port/MeloXQueuePanel.kt | com/lladlam/melox/ui/player/MeloXQueuePanel.kt；包名、依赖和状态适配 |
| minimal/immersive/port/MeloXRelativeSliderGesture.kt | com/lladlam/melox/ui/player/MeloXRelativeSliderGesture.kt；包名、依赖和状态适配 |
| minimal/immersive/port/MeloXSharedArtwork.kt | 摘取/适配 IOSNowPlayingScene、SharedHost 及依赖；见文件头；包名、依赖和状态适配 |
| minimal/immersive/port/MeloXTransportMotion.kt | com/lladlam/melox/ui/player/MeloXTransportMotion.kt；包名、依赖和状态适配 |
| minimal/immersive/port/MeloXUnsynchronizedLyrics.kt | com/lladlam/melox/ui/player/MeloXUnsynchronizedLyrics.kt；包名、依赖和状态适配 |
| minimal/immersive/port/MeloXVolumeKeyBridge.kt | com/lladlam/melox/platform/MeloXVolumeKeyBridge.kt；包名、依赖和状态适配 |
| minimal/immersive/port/QqBracketBacking.kt | com/lladlam/melox/core/lyrics/QqBracketBacking.kt；包名、依赖和状态适配 |

ImmersivePlayerHost、ImmersivePlayerMotion、ImmersiveSceneAdapters 与 MeloXSharedArtwork 抽取适配共享宿主、转场、底栏和封面。
ImmersiveStateAdapter、系统音量、保护策略、菜单及风格管理是听屿接入层，不迁移外部播放服务。

## 许可边界

MeloX Android、原 MeloX、BetterLyrics 的 GPL-3.0 正文随 APK 提供。听屿 / Folia AGPL-3.0 保持不变；GPL/AGPL 第 13 条允许组合，分别保留许可及对应源码获取义务。
未升级基础依赖；Backdrop 继续使用现有 1.0.6，现有声明保留。
排除 TextPV/PVTool 独立非商业组件、不明许可 YTRear、SF Pro、SF Symbols 字形和 MiSans。
Folia README 同时保留非商业声明。此处记录现状，不将自愿捐赠解释为已获权利人对商业用途的额外授权。所有风格免费，无支付验证或权益。
二维码资源保持原样。离线解码不等于验证收款归属、自由金额或发行渠道规则，仍需持有人与实际渠道核对。
