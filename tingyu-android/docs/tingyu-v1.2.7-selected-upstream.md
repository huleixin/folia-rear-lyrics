# 听屿 Android 1.2.7：选择性接入 Folia 上游功能

来源：Folia Android v0.7.22-android.280。以听屿 1.2.6 为基线逐项适配，没有整体合并上游分支或恢复已精简的设置与快捷命令界面。

## 使用方式

- 设置 → 外观 → 视觉设置：开启“每首歌随机歌词样式”，勾选参与随机的样式。至少保留一项；单项时固定使用该样式，多项时避免连续重复。修改范围不会打断当前歌曲的样式。
- 歌词样式选择增加“花火”。复用当前歌词时间轴、逐字歌词、字幕避让、Pixi 生命周期与图形帧率通道；按需加载，首次默认使用均衡画质。参数可保存、导入导出和同步。
- 音源选择增加“汽水音乐”。接入 Android WebCrypto 协议、扫码登录、歌曲和歌单搜索、歌手详情、账户歌单、喜欢状态、歌词、推荐与音频代理。资源 ID 始终保持为字符串。

## 稳定性修复

1. AI 主题任务在切歌后完成时，仅缓存原歌曲主题，不覆盖当前歌曲的主题与状态。
2. QQ 音频请求遇到临时传输断连时，在原音质最多重试一次；HTTP 错误、限流、超时、登录拒绝与明确业务拒绝不会重试。
3. 汽水账户刷新使用代次检查，切账号或退出后忽略旧响应；网络失败保留有效账户信息，部分喜欢列表不会覆盖完整状态。分页游标不前进时报真实错误。

## 保留范围与未合并内容

推荐页、资料库、Liquid Glass 迷你播放器与导航、设置首页结构、正面播放控件、既有背屏原生代码与摄像头避让算法均未改动。新增花火复用既有背屏可读区域参数。原先移除的明暗模式、拼贴墙设置、快捷命令和手机键盘快捷键没有恢复。

没有引入上游新的重型音频分析/模型引擎；花火的歌词时间轴烟花与镜头正常保留，可选的离线节拍分析特效不在本次范围。没有合并桌面专用设置或改用播放器核心。

汽水目前不开放歌手搜索、专辑搜索或专辑分类；普通歌单支持搜索。没有实现受保护加密音频的解密：接口只返回加密资源时会明确不可播放。扫码后是否具备某首歌曲的播放权限仍由真实账号与上游接口决定。

酷狗认证空搜索的另一项上游回退修改未纳入：本环境没有项目要求的开发会话，不能满足该音源对齐 skill 的真实认证接口验证条件；没有修改现有酷狗 provider。

## 验证

- TypeScript 检查通过；正式前端构建、Capacitor 同步、Android assembleRelease 成功。
- 新功能与音源针对性测试 832 项通过；设置、样式、同步、导入导出等集成测试 1632 项通过。
- 最终回归排除已单独验证为基线问题的 library/layerBoundaries.test.ts 后，604 个文件通过、1 个文件跳过；6465 项测试通过、2 项跳过。未放宽旧断言；仅为新增字段和样式更新明确的契约列表/快照。
- 全量首次运行中的两条既有分层失败：SearchResultRow 依赖 MobileSheet；MobilePlaylistHeader 依赖 Omni 标签。均在本次修改前存在，涉及文件完全未修改；本次未借机改动这些 UI。
- 34 项 Android 原生测试全部通过，含新增汽水 CDN 白名单、域名伪装拒绝和既有音源 Referer 回归。
- 汽水真实公开接口：搜索“许嵩”返回 3 首真实歌曲，hasMore=true。测试未使用用户账号或修改真实歌单。
- 其余汽水认证、歌单写入、音频播放与状态时序覆盖使用固定夹具；没有代替用户扫描二维码，不能声称完成真实账号端到端测试。
- 未连接 Android 真机或可用模拟器；环境未提供可用的页面预览验证。本轮没有设备截图、帧率/耗电数据，也没有声称完成真机视觉验收。花火实际 GPU 渲染、真实背屏同步及汽水扫码播放需要安装后实测。

## 安装

版本 1.2.7 / versionCode 10，包名 io.github.huleixin.tingyu，签名 SHA-256 a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d，与原包一致。需要覆盖安装新 APK；无需卸载旧版。

## 文件清单

- `THIRD-PARTY-NOTICES.md`
- `android/app/src/main/java/io/github/huleixin/tingyu/LocalAudioServer.java`
- `package-lock.json`
- `package.json`
- `src/App.tsx`
- `src/components/modal/settings/AppearanceSettingsSubview.tsx`
- `src/components/modal/settings/ImportConfirmDialog.tsx`
- `src/components/modal/settings/navigation/settingsAnchorModel.ts`
- `src/components/visualizer/VisPlaygroundSettingsPanel.tsx`
- `src/components/visualizer/definition.ts`
- `src/components/visualizer/tuningRegistry.ts`
- `src/components/visualizer/visualizerSeedHash.ts`
- `src/hooks/useRandomVisualizerMode.ts`
- `src/hooks/useThemeController.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/in.ts`
- `src/i18n/locales/zh-CN.ts`
- `src/library/core/model/accountRules.ts`
- `src/nativeBridge/api/folia.js`
- `src/services/foliaExtensionBridge.ts`
- `src/services/lucideIconResolver.ts`
- `src/services/nativeAndroidBridge.ts`
- `src/services/obs/visualSettingsConfig.ts`
- `src/services/onlineMusic/providerRegistry.ts`
- `src/services/onlineMusic/qqProvider.ts`
- `src/services/sync/settingsSnapshot.ts`
- `src/services/sync/syncSchema.ts`
- `src/services/sync/syncTypes.ts`
- `src/stores/useVisualizerSettingsStore.ts`
- `src/stores/visualizerSettingsPersistence.ts`
- `src/types/visualizerModes.ts`
- `src/utils/appearanceCodec.ts`
- `src/utils/appearanceImportPlan.ts`
- `src/vite-env.d.ts`
- `test/unit/onlineMusic/qqProvider.test.ts`
- `test/unit/stores/__snapshots__/configSurfaceContract.test.ts.snap`
- `test/unit/stores/__snapshots__/storeContract.test.ts.snap`
- `test/unit/visualizer/registry.test.ts`
- `test/unit/visualizer/tuningRegistry.test.ts`
- `android/app/src/test/java/io/github/huleixin/tingyu/QishuiAudioHostTest.java`
- `src/components/modal/settings/MobileRandomVisualizerSettings.tsx`
- `src/components/visualizer/hanabi/HanabiPanelControls.tsx`
- `src/components/visualizer/hanabi/HanabiSettingsPanel.tsx`
- `src/components/visualizer/hanabi/VisualizerHanabi.tsx`
- `src/components/visualizer/hanabi/catalog.ts`
- `src/components/visualizer/hanabi/collage/collagePainters.ts`
- `src/components/visualizer/hanabi/collage/collagePlan.ts`
- `src/components/visualizer/hanabi/collage/collageViews.ts`
- `src/components/visualizer/hanabi/collage/unitCollage.ts`
- `src/components/visualizer/hanabi/color.ts`
- `src/components/visualizer/hanabi/createHanabiPixiRuntime.ts`
- `src/components/visualizer/hanabi/credits.ts`
- `src/components/visualizer/hanabi/entry.tsx`
- `src/components/visualizer/hanabi/hanabiBeatFx.ts`
- `src/components/visualizer/hanabi/hanabiCreditsLayer.ts`
- `src/components/visualizer/hanabi/hanabiKernel.ts`
- `src/components/visualizer/hanabi/hanabiProgram.ts`
- `src/components/visualizer/hanabi/hanabiRandom.ts`
- `src/components/visualizer/hanabi/hanabiSceneEntry.ts`
- `src/components/visualizer/hanabi/hanabiSceneFrames.ts`
- `src/components/visualizer/hanabi/hanabiScreenBloom.ts`
- `src/components/visualizer/hanabi/hanabiSky.ts`
- `src/components/visualizer/hanabi/hanabiTransitions.ts`
- `src/components/visualizer/hanabi/hanabiTuning.ts`
- `src/components/visualizer/hanabi/mg/ambient.ts`
- `src/components/visualizer/hanabi/mg/burstPlan.ts`
- `src/components/visualizer/hanabi/mg/fireworks.ts`
- `src/components/visualizer/hanabi/mg/glow.ts`
- `src/components/visualizer/hanabi/mg/mgMath.ts`
- `src/components/visualizer/hanabi/mg/ornamentKit.ts`
- `src/components/visualizer/hanabi/mg/ornamentLines.ts`
- `src/components/visualizer/hanabi/mg/ornamentParticles.ts`
- `src/components/visualizer/hanabi/mg/ornamentShapes.ts`
- `src/components/visualizer/hanabi/mg/ornaments.ts`
- `src/components/visualizer/hanabi/mg/textures.ts`
- `src/components/visualizer/hanabi/overlay.ts`
- `src/components/visualizer/hanabi/program.ts`
- `src/components/visualizer/hanabi/scene.ts`
- `src/components/visualizer/hanabi/text/animations.ts`
- `src/components/visualizer/hanabi/text/blocks.ts`
- `src/components/visualizer/hanabi/text/glyphs.ts`
- `src/components/visualizer/hanabi/text/layout.ts`
- `src/components/visualizer/hanabi/text/lyricText.ts`
- `src/components/visualizer/hanabi/timeline.ts`
- `src/components/visualizer/hanabi/tuning.ts`
- `src/components/visualizer/hanabi/types.ts`
- `src/components/visualizer/paragraphStructure.ts`
- `src/components/visualizer/pixi/bloomFilter.ts`
- `src/components/visualizer/pixi/pixiProgramLinks.ts`
- `src/components/visualizer/pixi/pixiWebGLContext.ts`
- `src/hooks/useQishuiLibrary.ts`
- `src/nativeBridge/api/qishui.js`
- `src/services/beatFx/clock.ts`
- `src/services/onlineMusic/qishui/PROTOCOL-LICENSE.txt`
- `src/services/onlineMusic/qishui/qishuiCatalog.ts`
- `src/services/onlineMusic/qishui/qishuiLyrics.ts`
- `src/services/onlineMusic/qishui/qishuiMutations.ts`
- `src/services/onlineMusic/qishui/qishuiNormalize.ts`
- `src/services/onlineMusic/qishui/qishuiPlayback.ts`
- `src/services/onlineMusic/qishui/qishuiProtocol.d.ts`
- `src/services/onlineMusic/qishui/qishuiProvider.ts`
- `src/services/onlineMusic/qishui/qishuiRecommendations.ts`
- `src/services/onlineMusic/qishui/qishuiSceneCover.ts`
- `src/services/onlineMusic/qishui/qishuiTransport.ts`
- `src/utils/randomVisualizerModes.ts`
- `test/unit/qishui/adapter.test.ts`
- `test/unit/qishui/androidAvailability.test.ts`
- `test/unit/qishui/fixtures.ts`
- `test/unit/qishui/likedPlaylistTracks.test.ts`
- `test/unit/qishui/packagePaging.test.ts`
- `test/unit/qishui/protocolPort.test.ts`
- `test/unit/theme/themeGenerationRace.test.ts`
- `test/unit/visualizer/hanabi/collagePlan.test.ts`
- `test/unit/visualizer/hanabi/hanabiBeatFx.test.ts`
- `test/unit/visualizer/hanabi/hanabiCatalog.test.ts`
- `test/unit/visualizer/hanabi/hanabiFireworks.test.ts`
- `test/unit/visualizer/hanabi/hanabiGlyphColors.test.ts`
- `test/unit/visualizer/hanabi/hanabiProgram.test.ts`
- `test/unit/visualizer/hanabi/hanabiSceneFrames.test.ts`
- `test/unit/visualizer/hanabi/hanabiScreenBloom.test.ts`
- `test/unit/visualizer/hanabi/hanabiSpin.test.ts`
- `test/unit/visualizer/hanabi/hanabiText.test.ts`
- `test/unit/visualizer/hanabi/hanabiTuning.test.ts`
- `test/unit/visualizer/randomVisualizerModes.test.ts`
